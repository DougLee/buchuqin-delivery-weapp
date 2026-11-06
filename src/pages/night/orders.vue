<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { onPullDownRefresh, onReachBottom, onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { isRetryable } from "../../api/request";
import { useSessionStore, isBindRequired } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import { formatShort } from "../../utils/datetime";
import type { NightOrder } from "../../types";

/**
 * 夜宵订单列表（IKSW1F 楼长端）：待办 tab（待接单+配送中，待接单排最前）
 * 与全部 tab。新单提醒复用现有订阅推送（服务端已触发），本页进场/回前台
 * 重拉保证刷得到。
 */
const session = useSessionStore();
const active = ref<"todo" | "all">("todo");
const items = ref<NightOrder[]>([]);
const page = ref(1);
const total = ref(0);
const loadingMore = ref(false);
const loading = ref(false);
const error = ref(false);
const guest = ref(false);

const tabs: Array<{ value: "todo" | "all"; label: string }> = [
  { value: "todo", label: "待办" },
  { value: "all", label: "全部" },
];

/** 待接单排最前（待办优先口径），其后配送中，其余保持时间倒序 */
function sortOrders(list: NightOrder[]): NightOrder[] {
  const rank = (s: string) =>
    s === "pending-accept" ? 0 : s === "delivering" ? 1 : 2;
  return [...list].sort((a, b) => rank(a.status) - rank(b.status));
}

/** 待接单角标数（todo 列表头部/入口可见） */
const pendingCount = computed(
  () => items.value.filter((o) => o.status === "pending-accept").length,
);

async function load() {
  if (loading.value) return;
  guest.value = false;
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    const first = await api.nightOrders(active.value, 1, 20);
    items.value = sortOrders(first.items);
    total.value = first.total;
    page.value = 1;
  } catch (e) {
    if (isBindRequired(e)) guest.value = true;
    else if (isRetryable(e)) error.value = true;
  } finally {
    loading.value = false;
  }
}
onShow(load);
onMounted(load);
const onNewOrders = () => { if (!loading.value) void load(); };
onMounted(() => uni.$on('night:new-orders', onNewOrders));
onUnmounted(() => uni.$off('night:new-orders', onNewOrders));

function switchTab(v: "todo" | "all") {
  if (active.value === v) return;
  active.value = v;
  load();
}

async function loadMore() {
  if (loadingMore.value) return;
  // 已加载条数触顶即停（信封 total 口径；nextPage*20 判法会在余量
  // 非整页时漏掉最后一小段，如 total=45 的第 3 页）
  if (items.value.length >= total.value) return;
  const nextPage = page.value + 1;
  loadingMore.value = true;
  try {
    const more = await api.nightOrders(active.value, nextPage, 20);
    // 追加后重排序（新页可能含待接单，插队到前面）
    const seen = new Set(items.value.map((o) => o.id));
    items.value = sortOrders(
      items.value.concat(more.items.filter((o) => !seen.has(o.id))),
    );
    page.value = nextPage;
  } catch {
    // 加载更多失败静默（request 层已 toast），下拉刷新可重来
  } finally {
    loadingMore.value = false;
  }
}
onReachBottom(loadMore);
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});

const open = (id: string) =>
  uni.navigateTo({ url: `/pages/night/order-detail?id=${id}` });

/** 商品摘要：名称×件数拼接，最多两项 */
function itemsLine(o: NightOrder): string {
  const lines = o.items
    .slice(0, 2)
    .map((i) => `${i.name}×${i.quantity}`)
    .join(" · ");
  const rest = o.items.length - 2;
  return rest > 0 ? `${lines} 等 ${o.items.length} 件` : lines;
}

/* ---------- 接单倒计时（IKSZF5）：待接单卡显示 timeoutAt 剩余时间 ---------- */
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
onShow(startTick);
// onHide 未在此页注册：用 onUnmounted 兜底清理（页面销毁时）
onUnmounted(stopTick);
/** 待接单剩余时间文案：超时显示「已超时」；无 timeoutAt 返回空不渲染 */
function countdown(o: NightOrder): string {
  if (o.status !== "pending-accept" || !o.timeoutAt) return "";
  const rest = new Date(o.timeoutAt).getTime() - nowTick.value;
  if (Number.isNaN(rest)) return "";
  if (rest <= 0) return "接单已超时";
  const m = Math.floor(rest / 60000);
  const s = Math.floor((rest % 60000) / 1000);
  return `接单剩余 ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
</script>

<template>
  <view class="page orders-page">
    <view v-if="error" class="retry card" role="button" @tap="load"
      ><text class="retry__title">加载失败</text
      ><text class="retry__sub">网络异常或服务暂不可用，点击重试</text></view
    >
    <view v-else-if="loading" class="orders-skeleton"
      ><view v-for="n in 4" :key="n" class="orders-skeleton__row"
    /></view>
    <view v-else-if="guest" class="retry card" role="button" @tap="load">
      <text class="retry__title">员工专用 · 夜宵订单</text>
      <text class="retry__sub">楼长登录后可处理夜宵订单，点击登录</text>
    </view>

    <template v-else>
      <!-- 分段筛选：待办默认（待接单优先）；角标展示待接单数 -->
      <view class="seg card">
        <view
          v-for="t in tabs"
          :key="t.value"
          class="seg__item"
          :class="{ 'seg__item--on': active === t.value }"
          role="button"
          @tap="switchTab(t.value)"
          ><text>{{ t.label }}</text
          ><text
            v-if="t.value === 'todo' && pendingCount"
            class="seg__badge">{{ pendingCount }}</text
          ></view
        >
        <text class="seg__total">共 {{ total }} 单</text>
      </view>

      <view
        v-for="o in items"
        :key="o.id"
        class="order card"
        role="button"
        @tap="open(o.id)"
      >
        <view class="order__head"
          ><text class="order__no">{{ o.orderNo }}</text
          ><text
            class="order__status"
            :class="{ 'order__status--urgent': o.status === 'pending-accept' }">{{
              o.statusText
            }}</text
          ></view
        >
        <text class="order__items">{{ itemsLine(o) }}</text>
        <text v-if="countdown(o)" class="order__countdown">{{
          countdown(o)
        }}</text>
        <view class="order__foot"
          ><text class="order__addr"
            >{{ o.address.buildingName }} · {{ o.address.room }}</text
          ><view class="order__right"
            ><text class="order__amount"
              >¥{{ fenToYuan(o.payableAmount) }}</text
            ><text class="order__time">{{ formatShort(o.createdAt) }}</text
            ></view
          ></view
        >
      </view>
      <view v-if="!items.length" class="empty card"
        >{{
          active === "todo"
            ? "没有待办订单，学生下单后会在这里出现"
            : "本店还没有夜宵订单"
        }}</view
      >
      <view v-if="loadingMore" class="more">加载中…</view>
    </template>
  </view>
</template>

<style scoped lang="scss">
@import "../../styles/theme.scss";
.orders-page {
  background: $paper;
}
.retry {
  text-align: center;
  padding: 120rpx 30rpx;
}
.retry__title,
.retry__sub {
  display: block;
}
.retry__title {
  font-weight: 900;
  color: $primary-dark;
}
.retry__sub {
  font-size: 21rpx;
  color: $muted;
  margin-top: 8rpx;
}
/* 分段筛选 */
.seg {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 14rpx 20rpx;
  margin-bottom: 20rpx;
}
.seg__item {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx 30rpx;
  border-radius: 999rpx;
  background: $paper;
  font-size: 24rpx;
  color: $muted;
  font-weight: 700;
}
.seg__item--on {
  background: $primary-dark;
  color: $lime;
}
.seg__badge {
  min-width: 32rpx;
  padding: 0 10rpx;
  border-radius: 999rpx;
  background: $accent;
  color: #fff;
  font-size: 19rpx;
  text-align: center;
  line-height: 32rpx;
  font-weight: 800;
}
.seg__total {
  margin-left: auto;
  font-size: 20rpx;
  color: $muted;
}
/* 订单卡 */
.order {
  padding: 26rpx 28rpx;
  margin-bottom: 16rpx;
}
.order:active {
  background: $soft;
}
.order__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.order__no {
  font-size: 22rpx;
  color: $muted;
  font-weight: 700;
}
.order__status {
  font-size: 22rpx;
  font-weight: 800;
  color: $muted;
}
.order__status--urgent {
  color: $accent;
}
.order__items {
  display: block;
  font-size: 27rpx;
  font-weight: 800;
  color: $ink;
  margin-top: 16rpx;
}
/* 接单倒计时：紧迫感用橙红，超时保持红显（色彩+文字双重表达） */
.order__countdown {
  display: inline-block;
  margin-top: 10rpx;
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(255, 138, 52, 0.12);
  color: #b96f33;
  font-size: 20rpx;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.order__foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-top: 16rpx;
}
.order__addr {
  font-size: 21rpx;
  color: $muted;
}
.order__right {
  text-align: right;
}
.order__amount {
  display: block;
  font-size: 28rpx;
  font-weight: 900;
  color: var(--brand, #159c55);
  font-variant-numeric: tabular-nums;
}
.order__time {
  display: block;
  font-size: 19rpx;
  color: $muted;
  margin-top: 2rpx;
}
.empty {
  padding: 70rpx 0;
  text-align: center;
  color: $muted;
  font-size: 24rpx;
}
.more {
  text-align: center;
  padding: 24rpx 0 40rpx;
  color: $muted;
  font-size: 21rpx;
}
.orders-skeleton__row {
  height: 180rpx;
  border-radius: 30rpx;
  margin-bottom: 16rpx;
  background: linear-gradient(90deg, #edf2ed, #fff, #edf2ed);
  animation: orders-pulse 1.2s infinite;
}
@keyframes orders-pulse {
  50% {
    opacity: 0.55;
  }
}
</style>
