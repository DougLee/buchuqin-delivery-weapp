<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { onHide, onPullDownRefresh, onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { useSessionStore, isBindRequired } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import { nightStoreStatusText } from "../../utils/night";
import { nightTabGuard, switchNightTab } from "../../utils/nightMode";
import NightTabBar from "../../components/NightTabBar.vue";
import WorkspaceSwitch from "../../components/WorkspaceSwitch.vue";
/* 自定义导航（navigationStyle: custom）：内容避开状态栏+胶囊区 */
const statusBarH = uni.getSystemInfoSync().statusBarHeight || 0;
import type {
  NightDashboard,
  NightOrder,
  NightProduct,
  StaffProfile,
} from "../../types";

/**
 * 夜宵首页沿用翡翠与暖金：身份栏 → 单行经营态/工作台切换 → 紧凑月光主卡
 * → 营业操作 → 经营数据 → 待接订单 → 库存摘要。主卡只展示真实待办数据，
 * 不再使用装饰流程线；无切换资格时仍在主卡保留营业状态。
 * 日夜页面守卫尊重已授权正式楼长的手动选择，订单和库存仍读取夜宵API。
 */
const session = useSessionStore();
const workspaceSwitchVisible = ref(false);
const dash = ref<NightDashboard>();
const products = ref<NightProduct[]>([]);
const profile = ref<StaffProfile>();
/** 最新待接单预览（nightOrders 第一页第一条；无单不渲染预览区） */
const preview = ref<NightOrder>();
const loading = ref(false);
const error = ref(false);
const guest = ref(false);
const pageVisible = ref(true);
/** 营业动作/预览卡接单防重 */
const acting = ref(false);
const accepting = ref(false);

const statusText = computed(() =>
  dash.value ? nightStoreStatusText(dash.value.store.status) : "",
);
const hour = new Date(Date.now() + 8 * 3600000).getUTCHours();
const greeting = computed(
  () =>
    `${hour < 5 || hour >= 23 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好"}${
      profile.value?.name ? `，${profile.value.name}` : ""
    }`,
);
/** 顶部校区行（IKAJT4 对齐白天 campusLine）：夜宵语境显示本店楼栋 */
const buildingLine = computed(
  () => dash.value?.store.buildingName ?? "",
);
/** 库存货值行摘要：可进货额度 = 押金 - 库存货值（下限 0） */
const quota = computed(() => {
  const d = dash.value;
  return d ? Math.max(0, d.deposit - d.stockValue) : 0;
});
/** 商品种数 / 售罄种数（库存行摘要用） */
const productCount = computed(() => products.value.length);
const soldOutCount = computed(
  () => products.value.filter((p) => p.stock <= 0).length,
);

async function load() {
  if (loading.value) return;
  guest.value = false;
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    // 问候名字（失败不影响工作台，无名问候）
    profile.value = await api.profile(session.role).catch(() => undefined);
    dash.value = await api.nightDashboard();
    // 库存摘要（种数/售罄）：失败静默，行内数值显示 "--"
    products.value = await api
      .nightProducts()
      .catch(() => [] as NightProduct[]);
    // 最新待接单预览（取 1 条；失败静默不渲染预览区，不打断工作台）
    const p = await api
      .nightOrders("pending-accept", 1, 1)
      .catch(() => null);
    preview.value = p?.items[0];
  } catch (e) {
    if (isBindRequired(e)) guest.value = true;
    else error.value = true;
  } finally {
    loading.value = false;
  }
}

/* ---------- 营业操作（沿用 M2 已有逻辑：互斥/押金/可售商品校验在后端） ---------- */
async function act(kind: "open" | "pause" | "resume" | "close") {
  if (acting.value || !dash.value) return;
  acting.value = true;
  try {
  if (kind === "close") {
    const okToGo = await confirmClose();
    if (!okToGo) return;
  }
    if (kind === "open") await api.nightOpen();
    else if (kind === "pause") await api.nightPause();
    else if (kind === "resume") await api.nightResume();
    else await api.nightClose();
    uni.showToast({ title: "操作成功", icon: "success" });
  } catch {
    // request层显示服务端原因，刷新后仍可操作。
  } finally {
    // 成功/失败都重拉纠偏（开店被拒时 request 层已 toast 具体原因）
    await load();
    acting.value = false;
  }
}
/** 打烊确认（提示未完订单）：待办单 >0 时明示数量——已付订单继续履约 */
async function confirmClose(): Promise<boolean> {
  let todo = 0;
  try {
    const page = await api.nightOrders("todo", 1, 1);
    todo = page.total;
  } catch {
    todo = 0; // 查待办失败不拦打烊，仅降级为无单文案
  }
  return new Promise((resolve) =>
    uni.showModal({
      title: "确认打烊",
      content: todo
        ? `还有 ${todo} 个未完订单，打烊后今晚不再接新单，已付订单请继续配送；剩货留存，次日场次可继续售卖。`
        : "打烊后今晚不再接新单；剩货留存，次日场次可继续售卖。",
      confirmText: "打烊",
      cancelText: '继续营业',
      success: (r) => resolve(!!r.confirm),
      fail: () => resolve(false),
    }),
  );
}

/* ---------- 预览卡接单（与订单页 accept 同口径：接完整页重拉纠偏） ---------- */
async function acceptPreview() {
  const o = preview.value;
  if (accepting.value || !o) return;
  accepting.value = true;
  try {
    await api.nightAccept(o.id);
    uni.showToast({ title: "已接单", icon: "success" });
  } catch {
    // 订单可能已经变化，请求层提示后重拉真实待办。
  } finally {
    await load();
    accepting.value = false;
  }
}

/** 接单倒计时徽章（预览卡 meta 格）：同订单页口径，无 timeoutAt 显示下单时间 */
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
function countdown(o: NightOrder): string {
  if (o.status !== "pending-accept" || !o.timeoutAt) return "";
  const rest = new Date(o.timeoutAt).getTime() - nowTick.value;
  if (Number.isNaN(rest)) return "";
  if (rest <= 0) return "已超时";
  const m = Math.floor(rest / 60000);
  const s = Math.floor((rest % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
/** 预览卡商品件数合计 */
const previewCount = computed(() =>
  preview.value
    ? preview.value.items.reduce((s, i) => s + i.quantity, 0)
    : 0,
);

/** 二级功能页入口：navigateTo 保留返回栈（tab 主页与二级页的分工） */
const go = (url: string) => uni.navigateTo({ url });

onShow(() => {
  pageVisible.value = true;
  nightTabGuard();
  startTick();
  load();
  uni.$off('night:new-orders', refreshVisible);
  uni.$on('night:new-orders', refreshVisible);
});
function refreshVisible() { if (pageVisible.value) void load(); }
onHide(() => {
  pageVisible.value = false;
  stopTick();
  uni.$off('night:new-orders', refreshVisible);
});
onUnmounted(() => { stopTick(); uni.$off('night:new-orders', refreshVisible); });
/** 下拉刷新（对齐白天工作台交互流） */
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
</script>

<template>
  <view class="page night-home" :class="{ 'night-home--paused': !pageVisible }" :style="{ paddingTop: statusBarH + 12 + 'px' }">
    <view class="atmosphere" aria-hidden="true">
      <view class="atmosphere__jade"></view>
      <view class="atmosphere__gold"></view>
      <view class="atmosphere__grain"></view>
    </view>
    <view class="night-home__content">
    <!-- nav 品牌行（对齐白天工作台 identity 结构）：夜宵语境副行=本店楼栋 -->
    <view class="nav">
      <view class="identity">
        <view class="logo"><view class="logo__route"></view></view>
        <view
          ><text class="brand">夜宵经营台</text
          ><text v-if="buildingLine" class="campus">{{ buildingLine }}</text></view
        >
      </view>
    </view>

    <WorkspaceSwitch current="night" :status="statusText" @visibility-change="workspaceSwitchVisible = $event" />

    <view v-if="error" class="retry card" role="button" @tap="load"
      ><text class="retry__title">加载失败</text
      ><text class="retry__sub">网络异常或服务暂不可用，点击重试</text></view
    >
    <!-- 首屏骨架：hero + 统计 + 任务卡占位（对齐白天 home-skeleton 节奏） -->
    <view v-else-if="loading" class="home-skeleton"
      ><view class="home-skeleton__hero" /><view
        class="home-skeleton__stats" /><view class="home-skeleton__task" /><view
        class="home-skeleton__task"
    /></view>
    <view v-else-if="guest" class="retry card" role="button" @tap="load">
      <text class="retry__title">员工专用 · 夜宵店</text>
      <text class="retry__sub">楼长登录后可经营本楼夜宵店，点击登录</text>
    </view>

    <template v-else-if="dash">
      <!-- 紧凑主卡：问候与真实待接单数；月光轨道仅作低对比背景。 -->
      <view class="hero">
        <view class="hero__glow"></view>
        <view class="hero__sky" aria-hidden="true">
          <view class="hero__orbit hero__orbit--outer"></view>
          <view class="hero__orbit hero__orbit--inner"></view>
          <view class="hero__moon"></view>
          <view class="hero__star hero__star--one"></view>
          <view class="hero__star hero__star--two"></view>
        </view>
        <view class="hero__top"
          ><view
            ><text class="eyebrow">TONIGHT · 夜宵经营</text
            ><text class="hello">{{ greeting }}</text></view
          ><!-- 营业状态徽章：营业中金黄实底（shift--on），其余灰 -->
          <text v-if="!workspaceSwitchVisible" class="shift" :class="{ 'shift--on': dash.store.status === 'open' }">{{
            statusText
          }}</text></view
        >
        <view class="hero__metric"
          ><text class="metric__number">{{ dash.pendingOrders }}</text
          ><view><text class="metric__unit">单待接单</text></view></view
        >
      </view>

      <!-- 营业操作同一行：暂停保留已有订单，打烊停止新单；恢复使用金色主操作。 -->
      <view class="operating-actions">
      <view v-if="dash.store.status === 'closed'" class="night-cta night-cta--open" role="button" :aria-disabled="acting" @tap="act('open')">
        {{ acting ? "处理中…" : "开始营业" }}
      </view>
      <template v-else-if="dash.store.status === 'open'">
      <view class="night-cta night-cta--pause" role="button" :aria-disabled="acting" @tap="act('pause')">{{ acting ? '处理中…' : '暂停接单' }}</view>
      <view class="night-cta night-cta--close" role="button" :aria-disabled="acting" @tap="act('close')">
        {{ acting ? "处理中…" : "打烊收店" }}
      </view>
      </template>
      <template v-else-if="dash.store.status === 'paused'">
        <view class="night-cta night-cta--open" role="button" :aria-disabled="acting" @tap="act('resume')">
          {{ acting ? "处理中…" : "恢复营业" }}
        </view>
        <view class="night-cta night-cta--close" role="button" :aria-disabled="acting" @tap="act('close')">
          打烊收店
        </view>
      </template>
      <text v-else-if="dash.store.status === 'suspended'" class="store-hint"
        >店铺已被平台停业，请联系运营</text
      >
      </view>

      <!-- 商品净销售额与确认收入使用全量账本；预计收入不计入确认收入。 -->
      <view class="stats">
        <view class="stats__tile stats__tile--sales"
          ><text class="stats__label">今日商品净销售额</text
          ><text class="stats__value" :class="{ 'stats__value--zero': !dash.todaySales }">¥{{ fenToYuan(dash.todaySales) }}</text></view
        >
        <view class="stats__tile stats__tile--income"
          ><text class="stats__label">今日夜宵收入</text
          ><text class="stats__value" :class="{ 'stats__value--zero': !dash.todayIncome }">¥{{ fenToYuan(dash.todayIncome) }}</text></view
        >
        <view class="stats__tile"
          ><text class="stats__label">本月商品净销售额</text
          ><text class="stats__value" :class="{ 'stats__value--zero': !dash.monthSales }">¥{{ fenToYuan(dash.monthSales) }}</text></view
        >
        <view class="stats__tile"
          ><text class="stats__label">本月夜宵收入</text
          ><text class="stats__value" :class="{ 'stats__value--zero': !dash.monthIncome }">¥{{ fenToYuan(dash.monthIncome) }}</text></view
        >
      </view>

      <text class="stats-note">销售额不含配送费；收入含佣金与配送费，已扣冲回。</text>

      <view class="section-title"
        ><view
          ><text class="section-kicker">NEXT ORDERS</text
          ><text class="section-title__main">最新待接单</text></view
        ><text class="section-title__sub" @tap="switchNightTab('orders')"
          ><text class="link-chip">全部订单</text></text
        ></view
      >
      <!-- 最新待接单预览卡（task card 同白天骨架）：整卡进订单 tab，
           行内金黄 quick-btn 一键接单（同订单页 accept 口径） -->
      <view
        v-if="preview"
        class="task card"
        role="button"
        @tap="switchNightTab('orders')"
      >
        <view class="task__accent"></view>
        <view class="task__head"
          ><text class="package">{{ preview.orderNo }}</text
          ><text class="status">{{ preview.statusText }}</text></view
        >
        <view class="task__destination"
          ><view class="floor"
            ><text>{{ preview.address.room }}</text></view
          ><view
            ><text class="building">{{ preview.address.buildingName }}</text
            ><text class="contact">{{ preview.address.contactName }} {{ preview.address.phone }}</text></view
          ></view
        >
        <view class="task__meta"
          ><text>{{ previewCount }} 件</text
          ><text
            class="task__cd"
            :class="{ 'task__cd--timeout': countdown(preview) === '已超时' }"
            v-if="countdown(preview)"
            >剩余 {{ countdown(preview) }}</text
          ><text class="commission"
            >¥{{ fenToYuan(preview.payableAmount) }}</text
          ></view
        >
        <view class="task__action"
          ><button
            class="quick-btn"
            :disabled="accepting"
            @tap.stop="acceptPreview"
          >
            {{ accepting ? "接单中…" : "接 单" }}
          </button></view
        >
      </view>
      <!-- 待接单空态（对齐白天空态引导）：去订单 tab 看看 -->
      <view
        v-else
        class="empty card"
        role="button"
        @tap="switchNightTab('orders')"
        >
        <view class="empty__illustration" aria-hidden="true">
          <view class="empty__bag"></view>
          <view class="empty__spark"></view>
        </view>
        <text class="empty__title">暂无待接订单</text>
        <text class="empty__description">去订单页查看配送进度</text>
      </view
      >

      <!-- 库存货值紧凑行卡（V4 已有，保留）：押金行卡按道哥 2026-11 反馈移除，
           押金详情走「我的」夜宵经营分组 -->
      <view class="nkcard" role="button" @tap="go('/pages/night/products')">
        <text class="nkcard__k">库存货值</text>
        <text class="nkcard__v"
          >{{ products.length ? `¥${fenToYuan(dash.stockValue)}` : "--" }} ·
          <text class="emb">{{ products.length ? `${productCount} 种商品` : "--" }}</text
          >{{ soldOutCount ? `（${soldOutCount} 种售罄）` : "" }}</text
        >
      </view>

    </template>
    </view>

    <!-- 夜宵自绘 TabBar：订单角标=待接单数 -->
    <NightTabBar active="home" :badge="dash?.pendingOrders ?? 0" />
  </view>
</template>

<style scoped lang="scss">
@import "../../styles/night.scss";
/* 翡翠夜色：实色卡面保证文字对比，独立装饰层仅动画 transform。 */
.night-home {
  position: relative;
  background:
    radial-gradient(ellipse at 0% 0%, rgba(53, 113, 76, 0.34), transparent 54%),
    radial-gradient(ellipse at 100% 68%, rgba(115, 102, 49, 0.15), transparent 48%),
    $nb-home-bg;
  color: $nb-home-text;
  padding-bottom: calc(170rpx + env(safe-area-inset-bottom, 0px));
}
.atmosphere {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.atmosphere__jade {
  position: absolute;
  top: -180rpx;
  left: -320rpx;
  width: 1100rpx;
  height: 1100rpx;
  background: radial-gradient(ellipse, rgba(65, 160, 108, 0.32), transparent 66%);
  animation: jade-drift 18s ease-in-out infinite alternate;
}
.atmosphere__gold {
  position: absolute;
  top: 380rpx;
  right: -400rpx;
  width: 900rpx;
  height: 1100rpx;
  background: radial-gradient(ellipse, rgba(197, 163, 79, 0.18), transparent 65%);
}
.atmosphere__grain {
  position: absolute;
  inset: 0;
  opacity: 0.16;
  background-image: radial-gradient(rgba(197, 222, 190, 0.5) 0.6px, transparent 0.8px);
  background-size: 28px 28px;
}
.night-home__content {
  position: relative;
  z-index: 1;
  max-width: 960rpx;
  margin: 0 auto;
}
/* 深色卡片/胶囊覆盖（同白天 .card/.link-chip 的夜宵等价物） */
.night-home .card {
  background: $nb-home-surface;
  border: 1px solid $nb-home-outline;
  border-radius: 32rpx;
  box-shadow: inset 0 1px 0 rgba(237, 248, 216, 0.06), $nb-home-shadow;
}
.night-home .link-chip {
  min-height: 44px;
  padding: 14rpx 24rpx;
  background: rgba(255, 226, 160, 0.1);
  color: $nb-home-gold;
  border: 1px solid rgba(255, 226, 160, 0.16);
  font-size: 24rpx;
}
.night-home .empty {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 6rpx;
  flex-direction: column;
  padding: 38rpx 24rpx;
  background: linear-gradient(135deg, rgba(32, 57, 40, 0.92), rgba(30, 43, 30, 0.94));
  color: $nb-home-muted;
}
.empty__illustration {
  position: relative;
  display: grid;
  place-items: center;
  width: 92rpx;
  height: 92rpx;
  margin-bottom: 8rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 226, 160, 0.12), transparent 72%);
}
.empty__bag {
  position: relative;
  width: 42rpx;
  height: 40rpx;
  border-radius: 9rpx 9rpx 13rpx 13rpx;
  border: 2rpx solid $nb-home-gold;
  transform: rotate(-9deg);
}
.empty__bag:before {
  content: "";
  position: absolute;
  width: 18rpx;
  height: 16rpx;
  top: -12rpx;
  left: 10rpx;
  border: 2rpx solid $nb-home-gold;
  border-bottom: none;
  border-radius: 12rpx 12rpx 0 0;
}
.empty__bag:after {
  content: "";
  position: absolute;
  width: 14rpx;
  height: 7rpx;
  top: 15rpx;
  left: 12rpx;
  border-bottom: 2rpx solid $nb-home-gold;
  border-radius: 50%;
}
.empty__spark {
  position: absolute;
  top: 13rpx;
  right: 14rpx;
  width: 8rpx;
  height: 8rpx;
  background: $nb-home-jade;
  transform: rotate(45deg);
}
.empty__title {
  font-size: 30rpx;
  font-weight: 600;
  color: $nb-home-text;
}
.empty__description {
  font-size: 24rpx;
  line-height: 1.7;
  color: $nb-home-muted;
}
.nav,
.identity,
.hero__top,
.hero__metric,
.task__head,
.task__meta,
.task__action {
  display: flex;
  align-items: center;
}
.nav {
  padding: 8rpx 0 12rpx;
}
.identity {
  gap: 16rpx;
}
.logo {
  width: 68rpx;
  height: 68rpx;
  border-radius: 20rpx;
  background: linear-gradient(140deg, rgba(183, 219, 146, 0.2), rgba(30, 70, 47, 0.8));
  border: 1px solid rgba(215, 237, 179, 0.24);
  box-shadow: inset 0 1px 0 rgba(239, 249, 204, 0.12), 0 6rpx 22rpx rgba(3, 18, 10, 0.15);
  display: grid;
  place-items: center;
  transform: rotate(-4deg);
}
.logo__route {
  width: 28rpx;
  height: 28rpx;
  border: 6rpx solid $nb-gold;
  border-left-color: transparent;
  border-radius: 50%;
  position: relative;
}
.logo__route:after {
  content: "";
  position: absolute;
  width: 8rpx;
  height: 8rpx;
  background: $nb-gold;
  border-radius: 50%;
  right: -8rpx;
  top: -3rpx;
}
.brand,
.campus {
  display: block;
}
.brand {
  font-size: 34rpx;
  font-weight: 900;
  letter-spacing: -1rpx;
  color: $nb-text;
}
.campus {
  font-size: 24rpx;
  color: $nb-home-muted;
  margin-top: 2rpx;
}
/* ---------- 月光主卡：轨道装饰与文案分层，月相只作装饰 ---------- */
.hero {
  position: relative;
  overflow: hidden;
  padding: 30rpx 32rpx;
  border-radius: 32rpx;
  background: $nb-home-hero;
  border: 1px solid rgba(210, 235, 171, 0.28);
  box-shadow: inset 0 1px 0 rgba(245, 248, 204, 0.16), 0 20rpx 55rpx rgba(0, 16, 9, 0.23);
  color: $nb-home-text;
}
.hero__glow {
  position: absolute;
  width: 600rpx;
  height: 600rpx;
  border-radius: 50%;
  right: -240rpx;
  top: -200rpx;
  pointer-events: none;
  background: radial-gradient(
    circle,
    rgba(227, 218, 132, 0.24),
    rgba(102, 167, 98, 0.12) 42%,
    transparent 70%
  );
}
.hero__sky {
  position: absolute;
  right: 0;
  top: 42rpx;
  width: 210rpx;
  height: 160rpx;
  opacity: 0.78;
  pointer-events: none;
  animation: moon-float 12s ease-in-out infinite alternate;
}
.hero__moon {
  position: absolute;
  top: 22rpx;
  right: 60rpx;
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: linear-gradient(130deg, #fff0bf, #dfcd8e 45%, #9d9c62);
  box-shadow: inset -20rpx -12rpx 0 rgba(46, 66, 39, 0.84), 0 0 55rpx rgba(241, 217, 138, 0.15);
}
.hero__orbit {
  position: absolute;
  width: 200rpx;
  height: 90rpx;
  top: 26rpx;
  left: 0;
  border: 1px solid rgba(223, 228, 162, 0.26);
  border-radius: 50%;
  transform: rotate(-32deg);
}
.hero__orbit--outer {
  width: 218rpx;
  height: 126rpx;
  top: 8rpx;
  left: -4rpx;
  border-color: rgba(207, 229, 173, 0.1);
}
.hero__star {
  position: absolute;
  width: 7rpx;
  height: 7rpx;
  border-radius: 50%;
  background: $nb-home-gold;
  box-shadow: 0 0 12rpx rgba(255, 226, 160, 0.36);
}
.hero__star--one { top: 24rpx; left: 24rpx; }
.hero__star--two { top: 110rpx; right: 24rpx; opacity: 0.6; }
.hero__top {
  position: relative;
  z-index: 1;
  justify-content: space-between;
}
.eyebrow,
.hello {
  display: block;
}
.eyebrow {
  color: $nb-home-gold;
  font-size: 20rpx;
  font-weight: 800;
  letter-spacing: 2rpx;
}
.hello {
  font-size: 30rpx;
  font-weight: 800;
  margin-top: 4rpx;
}
/* 营业徽章：营业中金黄实底（shift--on），其余灰白弱化 */
.shift {
  flex: none;
  margin-left: 12rpx;
  background: rgba(255, 255, 255, 0.08);
  color: $nb-text-sub;
  border-radius: 999rpx;
  padding: 8rpx 18rpx;
  font-size: 20rpx;
  font-weight: 700;
}
.shift--on {
  background: rgba(158, 223, 178, 0.16);
  border: 1px solid rgba(177, 235, 185, 0.3);
  color: #dbf8d0;
  font-weight: 800;
}
.shift--on:before {
  content: "";
  display: inline-block;
  width: 9rpx;
  height: 9rpx;
  margin-right: 10rpx;
  vertical-align: 2rpx;
  background: #bcefa4;
  border-radius: 50%;
  box-shadow: 0 0 0 5rpx rgba(188, 239, 164, 0.08);
}
.hero__metric {
  position: relative;
  z-index: 1;
  gap: 18rpx;
  margin: 20rpx 0 0;
}
.metric__number {
  font-size: 88rpx;
  line-height: 1;
  font-weight: 600;
  letter-spacing: -3rpx;
  color: $nb-home-gold;
  font-variant-numeric: tabular-nums;
}
.metric__unit {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
}
/* ---------- 营业开关（hero 下方主操作位，白天胶囊大按钮同构） ---------- */
.operating-actions { display: flex; gap: 12rpx; }
.operating-actions .night-cta { flex: 1; min-width: 0; }
.night-cta {
  min-height: 88rpx;
  border-radius: 999rpx;
  margin-top: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  font-size: 28rpx;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 180ms ease, opacity 180ms ease, transform 180ms ease;
}
.night-cta--open {
  background: linear-gradient(135deg, #ffe9a8, #ffd75e 42%, #eda50a);
  color: $nb-gold-ink;
  /* 双层泛光：近影锐 + 远晕柔 */
  box-shadow: 0 10rpx 26rpx rgba(255, 215, 94, 0.32), 0 2rpx 8rpx rgba(255, 215, 94, 0.25);
}
.night-cta--close {
  background: linear-gradient(120deg, rgba(73, 94, 58, 0.72), rgba(36, 61, 44, 0.9));
  color: #e6eacb;
  border: 1px solid rgba(225, 226, 175, 0.18);
  box-shadow: inset 0 1px 0 rgba(239, 242, 206, 0.07);
}
.night-cta--pause { color: $nb-home-gold; background: rgba(255,224,130,.06); border: 1px solid rgba(255,224,130,.22); }
.night-cta[aria-disabled="true"] { opacity: .6; pointer-events: none; }
.night-cta:active {
  opacity: 0.85;
  transform: translateY(2rpx);
}
/* ---------- 两列小卡：今日以翠绿/暖金区分，历史用同源深色 ---------- */
.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14rpx;
  margin-top: 20rpx;
}
.stats-note { display: block; margin: -4rpx 4rpx 28rpx; color: #a5bba8; font-size: 21rpx; line-height: 1.6; }
.stats__tile {
  position: relative;
  overflow: hidden;
  min-height: 124rpx;
  padding: 18rpx 22rpx;
  border: 1px solid $nb-home-outline;
  border-radius: 26rpx;
  background: linear-gradient(130deg, rgba(37, 60, 44, 0.9), rgba(19, 42, 31, 0.94));
  box-shadow: inset 0 1px 0 rgba(220, 239, 199, 0.05);
}
.stats__tile--sales {
  background: linear-gradient(125deg, rgba(61, 103, 70, 0.94), rgba(27, 60, 40, 0.95));
}
.stats__tile--income {
  background: linear-gradient(125deg, rgba(103, 98, 55, 0.75), rgba(48, 60, 36, 0.94));
  border-color: rgba(224, 216, 159, 0.24);
}
.stats__tile:after {
  content: "";
  position: absolute;
  right: -30rpx;
  bottom: -56rpx;
  width: 144rpx;
  height: 144rpx;
  border: 1px solid rgba(223, 236, 192, 0.08);
  border-radius: 50%;
  pointer-events: none;
}
.stats__value,
.stats__label {
  display: block;
}
.stats__value {
  position: relative;
  margin-top: 10rpx;
  font-size: 38rpx;
  line-height: 1.2;
  font-weight: 700;
  color: $nb-home-gold;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5rpx;
}
/* 零值保留可读性；缺少接口口径的占位保持明确。 */
.stats__value--zero {
  color: $nb-home-text;
}
/* 接口暂缺口径的占位格：同弱灰 */
.stats__value--na {
  color: $nb-home-muted;
}
.stats__label {
  font-size: 24rpx;
  color: $nb-home-label;
  letter-spacing: 0;
}
/* ---------- section-title + 待接单预览（白天 section/task 同构） ---------- */
.section-kicker {
  display: block;
  color: $nb-home-jade;
  font-size: 18rpx;
  font-weight: 900;
  letter-spacing: 2rpx;
}
.section-title__main {
  display: block;
  font-size: 34rpx;
  margin-top: 3rpx;
}
.night-home .section-title__sub {
  color: $nb-text-sub;
}
.task {
  position: relative;
  overflow: hidden;
  padding: 28rpx;
  margin-bottom: 20rpx;
}
.task:active {
  background: #1a241d;
}
.task__accent {
  position: absolute;
  left: 0;
  top: 26rpx;
  width: 7rpx;
  height: 70rpx;
  border-radius: 0 8rpx 8rpx 0;
  background: $nb-gold;
}
.task__head {
  justify-content: space-between;
}
.package {
  font-size: 22rpx;
  color: $nb-text-sub;
  font-weight: 700;
}
.night-home .status {
  background: rgba(255, 255, 255, 0.06);
  color: $nb-text-soft;
}
.task__destination {
  display: flex;
  align-items: center;
  gap: 18rpx;
  margin: 24rpx 0;
}
/* floor 格（白天同构）：夜宵语境放寝室号 */
.floor {
  min-width: 76rpx;
  height: 76rpx;
  padding: 0 10rpx;
  border-radius: 20rpx;
  background: #1a241d;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: $nb-gold;
  display: flex;
  align-items: center;
  justify-content: center;
}
.floor text {
  font-size: 28rpx;
  font-weight: 900;
}
.building {
  display: block;
  font-size: 34rpx;
  font-weight: 900;
}
.contact {
  display: block;
  font-size: 20rpx;
  color: $nb-text-sub;
  margin-top: 4rpx;
}
.task__meta {
  gap: 14rpx;
  color: $nb-text-sub;
  font-size: 20rpx;
}
/* meta 倒计时徽章格：金黄弱底（同订单页 cd 口径） */
.task__cd {
  color: $nb-warn;
  background: rgba(251, 191, 36, 0.1);
  border-radius: 10rpx;
  padding: 3rpx 12rpx;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.task__cd--timeout {
  color: $nb-danger;
  background: rgba(248, 113, 113, 0.1);
}
.commission {
  margin-left: auto;
  color: $nb-text;
  font-size: 25rpx;
  font-weight: 900;
}
.task__action {
  justify-content: flex-end;
  border-top: 1px dashed rgba(255, 255, 255, 0.08);
  margin-top: 22rpx;
  padding-top: 18rpx;
}
/* 行内快捷接单（白天 quick-btn 同构）：金黄胶囊 */
.quick-btn {
  min-height: 44px;
  margin: 0;
  padding: 0 36rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #ffd75e, #ffc93c);
  color: $nb-gold-ink;
  font-size: 24rpx;
  font-weight: 900;
  display: flex;
  align-items: center;
}
.quick-btn[disabled] {
  opacity: 0.6;
}
/* ---------- 库存货值紧凑行卡（V4 已有，保留） ---------- */
.nkcard {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  background: $nb-home-surface;
  border: 1px solid $nb-home-outline;
  border-radius: 30rpx;
  padding: 28rpx 28rpx;
  margin-top: 20rpx;
}
.nkcard:active {
  background: #1a241d;
}
.nkcard__k {
  flex: none;
  font-size: 24rpx;
  font-weight: 800;
  color: #dce6de;
}
.nkcard__v {
  flex: 1;
  min-width: 0;
  text-align: right;
  font-size: 21rpx;
  color: $nb-home-muted;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  /* 强调值用 .emb 类：组件/页面 wxss 不允许 b 标签选择器 */
  .emb {
    color: #ffd75e;
    font-weight: 900;
  }
  white-space: nowrap;
}
.store-hint {
  display: block;
  margin-top: 16rpx;
  font-size: 23rpx;
  line-height: 1.7;
  color: $nb-home-muted;
}
/* ---------- 错误/游客态（白天 retry 同构，深色） ---------- */
.retry {
  text-align: center;
  padding: 90rpx 30rpx;
}
.retry__title,
.retry__sub {
  display: block;
}
.retry__title {
  font-weight: 900;
  color: $nb-text;
}
.retry__sub {
  font-size: 21rpx;
  color: $nb-text-sub;
  margin-top: 8rpx;
}
/* 首屏骨架（白天 home-skeleton 同构，深色 shimmer） */
.home-skeleton__hero,
.home-skeleton__stats,
.home-skeleton__task {
  border-radius: 36rpx;
  background: linear-gradient(90deg, #121a15, #1a241d, #121a15);
  animation: home-pulse 1.2s infinite;
}
.home-skeleton__hero {
  height: 240rpx;
}
.home-skeleton__stats {
  height: 130rpx;
  margin-top: 22rpx;
}
.home-skeleton__task {
  height: 240rpx;
  margin-top: 20rpx;
}
@keyframes home-pulse {
  50% {
    opacity: 0.55;
  }
}
@keyframes jade-drift {
  from { transform: translate3d(-3%, -2%, 0); }
  to { transform: translate3d(8%, 5%, 0); }
}
@keyframes moon-float {
  from { transform: translate3d(0, 0, 0) rotate(-3deg); }
  to { transform: translate3d(-6rpx, -12rpx, 0) rotate(3deg); }
}
.night-home--paused .atmosphere__jade,
.night-home--paused .hero__sky {
  animation-play-state: paused;
}
.night-home [role="button"] {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 180ms ease;
}
.night-home [role="button"]:active {
  opacity: 0.82;
}
.night-home [role="button"]:focus-visible,
.quick-btn:focus-visible {
  outline: 2px solid $nb-home-gold;
  outline-offset: 4px;
}
@media (hover: hover) {
  .night-home [role="button"]:hover,
  .night-home .section-title__sub:hover {
    opacity: 0.86;
  }
}
@media (prefers-reduced-motion: reduce) {
  .atmosphere__jade,
  .hero__sky,
  .home-skeleton__hero,
  .home-skeleton__stats,
  .home-skeleton__task {
    animation: none;
  }
  .night-home [role="button"],
  .night-cta {
    transition: none;
  }
}
</style>

<style>
/* page 元素深色底（App.vue 全局 page 是浅色 $paper，夜宵页 overscroll 露底会穿帮） */
page {
  background: radial-gradient(1000px 520px at 78% -14%, rgba(16, 150, 80, 0.5), transparent 64%),
    radial-gradient(760px 420px at -14% 22%, rgba(255, 215, 94, 0.16), transparent 60%),
    radial-gradient(680px 380px at 50% 118%, rgba(13, 107, 58, 0.4), transparent 66%),
    #0a0f0d;
}
</style>
