<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { onPullDownRefresh, onReachBottom, onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { useSessionStore, isBindRequired } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import { nightTabGuard } from "../../utils/nightMode";
import NightTabBar from "../../components/NightTabBar.vue";
import type { NightOrder, Task } from "../../types";

/**
 * 夜宵订单（夜宵模式第二 tab）——白天任务页（pages/tasks/index.vue）逐块复刻，
 * 数据换源 nightApi、深色主题取 night.scss token：
 * overview（NIGHT ORDERS kicker/夜宵订单/时效排序 sub/右侧大数字=活跃单数）→
 * 横滑 tabs 状态分段（首段「白天未完 N」有单才显示且默认选中，warn 金黄）→
 * 订单卡（task card 同骨架：sequence 编号/task__top/route-row 送·货两 leg/
 * meta 三列/footer 倒计时徽章+金黄接单钮）→ list-foot 分页 → 同款空态。
 * 业务逻辑全部沿用既有实现：接单与取消并发防重/接单倒计时/已完成上拉分页/
 * 白天未完段「继续配送」跳任务详情/新单轮询静默重拉。
 */
const session = useSessionStore();
/** 当前分段：day=白天未完（条件段） pending 配送中已完成 */
type SectionKey = "day" | "pending" | "delivering" | "done" | "history";
const active = ref<SectionKey>("pending");

const dayTasks = ref<Task[]>([]);
const dayTotal = ref(0);
const dayFailed = ref(false);
const pendingOrders = ref<NightOrder[]>([]);
const pendingTotal = ref(0);
const deliveringOrders = ref<NightOrder[]>([]);
const deliveringTotal = ref(0);
const doneOrders = ref<NightOrder[]>([]);
const doneTotal = ref(0);
const historyOrders = ref<NightOrder[]>([]), historyTotal = ref(0);
const pages = ref<Record<SectionKey, number>>({ day: 1, pending: 1, delivering: 1, done: 1, history: 1 });

const loading = ref(false);
const loadingMore = ref(false);
const error = ref(false);
const guest = ref(false);

/** 概览右侧大数字：当前活跃单（白天未完 + 待接单 + 配送中） */
const activeCount = computed(
  () => dayTotal.value + pendingTotal.value + deliveringTotal.value,
);

/** 待接单按时效排序（timeoutAt 早的在前，无 timeoutAt 保持在后） */
function sortByUrgency(list: NightOrder[]): NightOrder[] {
  return [...list].sort((a, b) => {
    const ta = a.timeoutAt ? new Date(a.timeoutAt).getTime() : Infinity;
    const tb = b.timeoutAt ? new Date(b.timeoutAt).getTime() : Infinity;
    return ta - tb;
  });
}

async function load() {
  if (loading.value) return;
  guest.value = false;
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    // 白天未完单（收尾段）：失败静默不渲染该段，不打断夜宵列表
    try {
      const day = await api.tasksPage("unfinished", 1, 20);
      dayTasks.value = day.items;
      dayTotal.value = day.total;
      dayFailed.value = false;
    } catch {
      dayTasks.value = [];
      dayTotal.value = 0;
      dayFailed.value = true;
    }
    const [p, d, done, history] = await Promise.all([
      api.nightOrders("pending-accept", 1, 20),
      api.nightOrders("delivering", 1, 20),
      api.nightOrders("completed", 1, 20),
      api.nightOrders("all", 1, 20),
    ]);
    pendingOrders.value = sortByUrgency(p.items);
    pendingTotal.value = p.total;
    deliveringOrders.value = d.items;
    deliveringTotal.value = d.total;
    doneOrders.value = done.items;
    doneTotal.value = done.total;
    historyOrders.value = history.items; historyTotal.value = history.total;
    pages.value = { day: 1, pending: 1, delivering: 1, done: 1, history: 1 };
    // 有白天未完单时首段默认选中（仅首次，用户手动切换后不再抢焦点）
    if (!defaulted.value) {
      defaulted.value = true;
      if (dayTotal.value > 0) active.value = "day";
    }
  } catch (e) {
    if (isBindRequired(e)) guest.value = true;
    else error.value = true;
  } finally {
    loading.value = false;
  }
}
/** 默认分段已设置标记（白天未完默认选中只在首次生效） */
const defaulted = ref(false);

/** 分段定义：白天未完段仅在有未完单时渲染（首段且默认选中） */
const sections = computed(() => {
  const list: Array<{
    key: SectionKey;
    label: string;
    count: number;
    warn?: boolean;
  }> = [];
  if (dayTotal.value > 0)
    list.push({ key: "day", label: "白天未完", count: dayTotal.value, warn: true });
  list.push({ key: "pending", label: "待接单", count: pendingTotal.value });
  list.push({ key: "delivering", label: "配送中", count: deliveringTotal.value });
  list.push({ key: "done", label: "已完成", count: doneTotal.value });
  list.push({ key: "history", label: "全部记录", count: historyTotal.value });
  return list;
});
function switchSection(key: SectionKey) {
  if (active.value === key) return;
  active.value = key;
}

/** 当前分段列表/总数（空态与分页脚标统一判断，对齐白天单列表流） */
const currentList = computed<NightOrder[]>(() => {
  if (active.value === "pending") return pendingOrders.value;
  if (active.value === "delivering") return deliveringOrders.value;
  if (active.value === "done") return doneOrders.value;
  if (active.value === "history") return historyOrders.value;
  return [];
});
const currentTotal = computed(() => ({ day: dayTotal.value, pending: pendingTotal.value, delivering: deliveringTotal.value, done: doneTotal.value, history: historyTotal.value })[active.value]);
const currentCount = computed(() => active.value === 'day' ? dayTasks.value.length : currentList.value.length);
/** 空态文案（分段差异化，对齐白天空态主/副行结构） */
const emptyText = computed(() => {
  if (active.value === "day")
    return { main: "白天订单已全部处理完毕", sub: "切换到夜宵分段处理今晚新单" };
  if (active.value === "pending")
    return { main: "没有待接订单", sub: "学生下单后会自动出现在这里" };
  if (active.value === "delivering")
    return { main: "没有配送中的订单", sub: "接单后订单会进入这里" };
  return { main: "还没有已完成订单", sub: "送达上传凭证后订单归档到这里" };
});

/* ---------- 接单（沿用 M2：pending-accept → delivering） ---------- */
const accepting = ref<string | null>(null);
async function accept(o: NightOrder) {
  if (accepting.value) return;
  accepting.value = o.id;
  try {
    await api.nightAccept(o.id);
    uni.showToast({ title: "已接单", icon: "success" });
    await load();
  } finally {
    accepting.value = null;
  }
}

/* ---------- 已完成段上拉分页 ---------- */
onReachBottom(async () => {
  if (loading.value || loadingMore.value || currentCount.value >= currentTotal.value) return;
  loadingMore.value = true;
  const section = active.value;
  try {
    const next = pages.value[section] + 1;
    if (section === 'day') {
      const more = await api.tasksPage('unfinished', next, 20);
      const seen = new Set(dayTasks.value.map(o => o.id));
      dayTasks.value.push(...more.items.filter(o => !seen.has(o.id))); dayTotal.value = more.total;
    } else {
      const status = { pending: 'pending-accept', delivering: 'delivering', done: 'completed', history: 'all' }[section];
      const more = await api.nightOrders(status, next, 20);
      const list = { pending: pendingOrders, delivering: deliveringOrders, done: doneOrders, history: historyOrders }[section];
      const seen = new Set(list.value.map(o => o.id)); list.value.push(...more.items.filter(o => !seen.has(o.id)));
      const total = { pending: pendingTotal, delivering: deliveringTotal, done: doneTotal, history: historyTotal }[section]; total.value = more.total;
    }
    pages.value[section] = next;
  } catch {
    /* request 层已 toast，下次触底重试 */
  } finally {
    loadingMore.value = false;
  }
});
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});

/* ---------- 新单轮询联动（沿用 night:new-orders 广播静默重拉） ---------- */
const onNewOrders = () => {
  if (!loading.value && !guest.value) void load();
};
onMounted(() => uni.$on("night:new-orders", onNewOrders));
onUnmounted(() => uni.$off("night:new-orders", onNewOrders));

const openNightOrder = (id: string) =>
  uni.navigateTo({ url: `/pages/night/order-detail?id=${id}` });
const openDayTask = (id: string) =>
  uni.navigateTo({ url: `/pages/task/detail?id=${id}` });

/** 商品摘要：名称×件数拼接，最多两项 */
function itemsLine(o: NightOrder): string {
  const lines = o.items
    .slice(0, 2)
    .map((i) => `${i.name}×${i.quantity}`)
    .join(" · ");
  const rest = o.items.length - 2;
  return rest > 0 ? `${lines} 等 ${o.items.length} 件` : lines;
}
/** 白天任务商品摘要（Task.items 同构） */
function taskItemsLine(t: Task): string {
  const lines = t.items
    .slice(0, 2)
    .map((i) => `${i.name}×${i.quantity}`)
    .join(" · ");
  const rest = t.items.length - 2;
  return rest > 0 ? `${lines} 等 ${t.items.length} 件` : lines;
}

/* ---------- 接单倒计时（沿用 M2）：待接单卡 timeoutAt 剩余时间 ---------- */
const nowTick = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | undefined;
function startTick() {
  nowTick.value = Date.now();
  if (!tickTimer)
    tickTimer = setInterval(() => (nowTick.value = Date.now()), 1000);
}
function stopTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = undefined;
}
/** 待接单剩余时间：返回 MM:SS（超时返回「已超时」；无 timeoutAt 返回空） */
function countdown(o: NightOrder): string {
  if (o.status !== "pending-accept" || !o.timeoutAt) return "";
  const rest = new Date(o.timeoutAt).getTime() - nowTick.value;
  if (Number.isNaN(rest)) return "";
  if (rest <= 0) return "已超时";
  const m = Math.floor(rest / 60000);
  const s = Math.floor((rest % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

onShow(() => {
  nightTabGuard();
  startTick();
  load();
});
onUnmounted(stopTick);
</script>

<template>
  <view class="page tasks-page">
    <!-- overview（对齐白天任务页）：kicker / 标题 / 时效排序 sub / 右侧大数字 -->
    <view class="overview">
      <view
        ><text class="overview__label">NIGHT ORDERS</text
        ><text class="overview__title">夜宵订单</text
        ><text class="overview__sub"
          >按时效排序，优先处理即将超时任务</text
        ></view
      >
      <view class="overview__number"
        ><text>{{ activeCount }}</text
        ><text>单</text></view
      >
    </view>

    <!-- 横滑分段（白天 tabs 同构）：白天未完首段有单才显示且默认选中（warn 金黄） -->
    <scroll-view scroll-x class="tabs" :show-scrollbar="false"
      ><view class="tabs__inner"
        ><view
          v-for="s in sections"
          :key="s.key"
          class="tab"
          :class="{
            'tab--active': active === s.key,
            'tab--warn': s.warn && active !== s.key,
          }"
          role="button"
          @tap="switchSection(s.key)"
          >{{ s.label }} {{ s.count }}</view
        ></view
      ></scroll-view
    >

    <view v-if="error" class="empty card" role="button" @tap="load"
      ><view class="empty__mark"></view><text>加载失败</text
      ><text class="empty__sub">点击重试</text></view
    >
    <view v-else-if="loading" class="tasks-skeleton"
      ><view v-for="n in 4" :key="n" class="tasks-skeleton__block" /></view
    >
    <view v-else-if="guest" class="empty card" role="button" @tap="load"
      ><view class="empty__mark"></view><text>员工专用 · 夜宵订单</text
      ><text class="empty__sub">楼长登录后可处理夜宵订单，点击登录</text></view
    >
    <!-- 白天未完段加载失败提示（段内数据静默失败，留刷新口） -->
    <view
      v-else-if="active === 'day' && dayFailed && !dayTasks.length"
      class="empty card"
      role="button"
      @tap="load"
      ><view class="empty__mark"></view><text>白天未完单加载失败</text
      ><text class="empty__sub">点击重试</text></view
    >
    <view v-else-if="active === 'day' ? !dayTasks.length : !currentList.length" class="empty card"
      ><view class="empty__mark"></view><text>{{ emptyText.main }}</text
      ><text class="empty__sub">{{ emptyText.sub }}</text></view
    >
    <template v-else>
      <!-- 白天未完单卡（白天任务页卡骨架原样复刻，数据=Task）：
           继续配送 → 任务详情走既有流程 -->
      <template v-if="active === 'day'">
        <view
          v-for="(task, index) in dayTasks"
          :key="task.id"
          class="task card"
          role="button"
          @tap="openDayTask(task.id)"
        >
          <view class="task__top"
            ><view class="sequence">{{
              String(index + 1).padStart(2, "0")
            }}</view
            ><view class="head"
              ><text class="package">{{ task.orderNo }}</text
              ><text class="status">{{ task.statusText }}</text></view
            ></view
          >
          <view class="route-row"
            ><view class="pin"><view></view></view
            ><view class="route"
              ><view class="route__leg"
                ><text class="route__tag route__tag--to">送</text
                ><text class="address"
                  >{{ task.building }} · {{ task.floor }} 楼 · {{ task.room }}</text
                ></view
              ><view class="route__leg"
                ><text class="route__tag">取</text
                ><text class="warehouse">{{ task.warehouse }}</text></view
              ></view
            ></view
          >
          <view class="meta"
            ><view
              ><text>货量</text
              ><strong>{{ task.itemCount }} 件 / {{ task.weight }}kg</strong></view
            ><view
              ><text>模式</text><strong>{{ task.modeText }}</strong></view
            ><view
              ><text>预计收入</text
              ><strong class="money"
                >¥{{ fenToYuan(task.commission) }}</strong
              ></view
            ></view
          >
          <view v-if="task.rider" class="rider-row"
            ><text>配送员</text><strong>{{ task.rider.name }}</strong></view
          >
          <view class="footer"
            ><button class="grab-btn" @tap.stop="openDayTask(task.id)">
              继续配送
            </button></view
          >
        </view>
      </template>

      <!-- 夜宵单卡（白天任务页卡骨架同构）：sequence/task__top/route-row
           （送=地址联系人 · 货=商品摘要）/meta 三列金额/footer 倒计时+金黄按钮 -->
      <template v-else>
        <view
          v-for="(o, index) in currentList"
          :key="o.id"
          class="task card"
          role="button"
          @tap="openNightOrder(o.id)"
        >
          <view class="task__top"
            ><view class="sequence">{{
              String(index + 1).padStart(2, "0")
            }}</view
            ><view class="head"
              ><text class="package">{{ o.orderNo }}</text
              ><text class="status">{{ o.statusText }}</text></view
            ></view
          >
          <view class="route-row"
            ><view class="pin"><view></view></view
            ><view class="route"
              ><view class="route__leg"
                ><text class="route__tag route__tag--to">送</text
                ><text class="address"
                  >{{ o.address.buildingName }} {{ o.address.room }} ·
                  {{ o.address.contactName }} {{ o.address.phone }}</text
                ></view
              ><view class="route__leg"
                ><text class="route__tag">货</text
                ><text class="warehouse">{{ itemsLine(o) }}</text></view
              ></view
            ></view
          >
          <view class="meta"
            ><view
              ><text>商品款</text
              ><strong>¥{{ fenToYuan(o.productAmount) }}</strong></view
            ><view
              ><text>配送费</text
              ><strong>¥{{ fenToYuan(o.deliveryFee) }}</strong></view
            ><view
              ><text>应付</text
              ><strong class="money">¥{{ fenToYuan(o.payableAmount) }}</strong></view
            ></view
          >
          <!-- footer（白天同构每卡必有）：接单倒计时徽章（左）+ 金黄操作钮（右），
               无操作态显 link-chip（对齐白天「查看任务」节奏） -->
          <view class="footer"
            ><text
              v-if="countdown(o)"
              class="cd"
              :class="{ 'cd--timeout': countdown(o) === '已超时' }"
              >{{
                countdown(o) === "已超时" ? "接单已超时" : `剩余 ${countdown(o)}`
              }}</text
            ><button
              v-if="o.status === 'pending-accept'"
              class="grab-btn"
              :disabled="accepting === o.id"
              @tap.stop="accept(o)"
            >
              {{ accepting === o.id ? "接单中…" : "接 单" }}
            </button><button
              v-else-if="o.status === 'delivering'"
              class="grab-btn"
              @tap.stop="openNightOrder(o.id)"
            >
              送达上传凭证
            </button><text v-else class="link-chip">查看详情</text></view
          >
        </view>
        <!-- 分页脚标（白天 list-foot 同构）：已完成段上拉加载 -->
        <view
          v-if="currentCount < currentTotal"
          class="list-foot"
          >{{ loadingMore ? "加载中…" : "上拉加载更多" }}</view
        >
        <view v-else class="list-foot">没有更多了</view>
      </template>
    </template>

    <!-- 夜宵自绘 TabBar：订单角标=待接单数 -->
    <NightTabBar active="orders" :badge="pendingTotal" />
  </view>
</template>

<style scoped lang="scss">
@import "../../styles/night.scss";
/* 夜宵订单：白天 tasks-page 布局复用全局 .page，页内覆盖深色 */
.tasks-page {
  @include nb-page;
  padding-bottom: calc(170rpx + env(safe-area-inset-bottom, 0px));
}
.tasks-page .card {
  @include nb-card;
}
.tasks-page .empty {
  color: $nb-text-sub;
}
/* overview（白天同构）：右侧大数字深底格 → 夜宵金黄字 */
.overview {
  @include nb-hero;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 32rpx;
  margin-bottom: 26rpx;
}
.overview text {
  display: block;
}
.overview__label {
  font-size: 20rpx;
  letter-spacing: 3rpx;
  color: $nb-success;
  font-weight: 900;
}
.overview__title {
  font-size: 42rpx;
  font-weight: 900;
  margin-top: 3rpx;
  color: $nb-text;
}
.overview__sub {
  font-size: 23rpx;
  color: $nb-text-sub;
  margin-top: 6rpx;
}
.overview__number {
  width: 92rpx;
  height: 92rpx;
  border-radius: 28rpx;
  background: rgba(255, 215, 94, 0.1);
  border: 1px solid rgba(255, 215, 94, 0.22);
  color: $nb-gold;
  display: flex;
  align-items: baseline;
  justify-content: center;
}
.overview__number text:first-child {
  font-size: 46rpx;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.overview__number text:last-child {
  font-size: 20rpx;
}
/* 横滑分段（白天 tabs 同构）：深色胶囊，选中金黄 */
.tabs {
  white-space: nowrap;
  margin-bottom: 24rpx;
}
.tabs__inner {
  display: flex;
  gap: 12rpx;
}
.tab {
  min-height: 44px;
  padding: 0 27rpx;
  border-radius: 999rpx;
  background: $nb-surface;
  border: 1px solid $nb-border;
  display: flex;
  align-items: center;
  font-size: 23rpx;
  color: $nb-text-sub;
  font-weight: 600;
}
.tab--warn {
  color: $nb-warn;
}
.tab--active {
  background: $nb-cta-gradient;
  border-color: $nb-gold;
  color: $nb-gold-ink;
  font-weight: 800;
}
/* 订单卡（白天 task card 同构） */
.task {
  padding: 0;
  margin-bottom: 22rpx;
  overflow: hidden;
}
.task:active {
  background: #1a241d;
}
.task__top {
  display: grid;
  grid-template-columns: 80rpx 1fr;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}
.sequence {
  height: 78rpx;
  background: #1a241d;
  color: $nb-gold;
  font-size: 28rpx;
  font-weight: 900;
  display: grid;
  place-items: center;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24rpx;
}
.package {
  font-size: 22rpx;
  color: $nb-text-sub;
  font-weight: 700;
}
.tasks-page .status {
  background: rgba(74, 222, 128, 0.1);
  color: $nb-success;
}
.route-row {
  display: flex;
  gap: 20rpx;
  align-items: center;
  padding: 28rpx;
}
.pin {
  width: 64rpx;
  height: 64rpx;
  border-radius: 20rpx;
  background: rgba(255, 255, 255, 0.05);
  display: grid;
  place-items: center;
}
.pin view {
  width: 20rpx;
  height: 20rpx;
  border: 6rpx solid $nb-gold;
  border-radius: 50%;
  position: relative;
}
.pin view:after {
  content: "";
  position: absolute;
  bottom: -13rpx;
  left: 2rpx;
  border: 5rpx solid transparent;
  border-top-color: $nb-gold;
}
.route {
  min-width: 0;
}
.route__leg {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
}
.route__leg + .route__leg {
  margin-top: 8rpx;
}
.route__tag {
  flex: 0 0 auto;
  font-size: 20rpx;
  font-weight: 800;
  color: $nb-text-sub;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10rpx;
  padding: 2rpx 12rpx;
}
.route__tag--to {
  color: $nb-gold-ink;
  background: $nb-gold;
}
.address,
.warehouse {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.address {
  font-size: 32rpx;
  font-weight: 900;
}
.warehouse {
  font-size: 21rpx;
  color: $nb-text-sub;
}
/* meta 三列（白天同构）：深色内衬条 */
.meta {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 0 28rpx;
  padding: 20rpx 0;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 20rpx;
}
.meta view {
  text-align: center;
}
.meta view + view {
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}
.meta text,
.meta strong {
  display: block;
}
.meta text {
  font-size: 20rpx;
  color: $nb-text-sub;
}
.meta strong {
  font-size: 22rpx;
  margin-top: 3rpx;
}
.meta .money {
  color: $nb-gold;
  font-size: 26rpx;
}
/* 配送员一行（白天未完单交接场景，白天同构） */
.rider-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 16rpx 28rpx 0;
  padding: 14rpx 20rpx;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 16rpx;
}
.rider-row text {
  font-size: 20rpx;
  color: $nb-text-sub;
}
.rider-row strong {
  font-size: 22rpx;
  color: $nb-text;
}
/* footer（白天同构）：左侧倒计时徽章 + 右侧金黄操作钮 */
.footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 14rpx;
  padding: 22rpx 28rpx;
}
/* 接单倒计时徽章：金黄弱底，超时转橙红 */
.cd {
  margin-right: auto;
  font-size: 21rpx;
  font-weight: 800;
  color: $nb-warn;
  background: rgba(251, 191, 36, 0.1);
  border-radius: 14rpx;
  padding: 7rpx 16rpx;
  font-variant-numeric: tabular-nums;
}
.cd--timeout {
  color: $nb-danger;
  background: rgba(248, 113, 113, 0.1);
}
/* 金黄操作钮（白天 grab-btn 同构，夜宵金黄 CTA） */
.grab-btn {
  min-height: 44px;
  margin: 0;
  padding: 0 36rpx;
  border-radius: 999rpx;
  background: $nb-cta-gradient;
  color: $nb-gold-ink;
  font-size: 24rpx;
  font-weight: 900;
  display: flex;
  align-items: center;
}
.grab-btn[disabled] {
  opacity: 0.6;
}
.tasks-page .link-chip {
  background: rgba(255, 215, 94, 0.12);
  color: $nb-gold;
}
/* 空态（白天 empty 同构，深色） */
.tasks-page .empty text {
  display: block;
}
.empty__mark {
  width: 50rpx;
  height: 50rpx;
  border: 2rpx solid rgba(255, 226, 160, 0.6);
  border-top-color: transparent;
  background: radial-gradient(circle at 25% 30%, rgba(255, 226, 160, 0.2), transparent 70%);
  box-shadow: 8rpx -5rpx 0 -4rpx rgba(255, 226, 160, 0.12);
  border-radius: 50%;
  margin: 0 auto 20rpx;
}
.empty__sub {
  font-size: 21rpx;
  margin-top: 7rpx;
}
/* 分页脚标（白天 list-foot 同构） */
.list-foot {
  text-align: center;
  color: $nb-text-sub;
  font-size: 22rpx;
  padding: 20rpx 0 10rpx;
}
/* 骨架（白天 tasks-skeleton 同构，深色 shimmer） */
.tasks-skeleton__block {
  height: 250rpx;
  border-radius: 28rpx;
  margin-bottom: 22rpx;
  background: linear-gradient(90deg, #121a15, #1a241d, #121a15);
  animation: tasks-pulse 1.2s infinite;
}
@keyframes tasks-pulse {
  50% {
    opacity: 0.55;
  }
}
</style>

<style lang="scss">
@import "../../styles/night.scss";
page {
  background: $nb-bg;
}
</style>
