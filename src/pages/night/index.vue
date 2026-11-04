<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { ApiError, isRetryable } from "../../api/request";
import { useSessionStore, isBindRequired } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import {
  nightStoreStatusText,
  nightStoreStatusTone,
} from "../../utils/night";
import type { NightDashboard } from "../../types";

/**
 * 夜宵店工作区（IKSW1F 楼长端）：白天配送任务照旧在原工作台，夜宵店
 * 独立成工作区——场次状态、营业操作（开店/暂停/恢复/打烊）、备货、
 * 商品、订单、收入入口全部收敛到本页。
 */
const session = useSessionStore();
const data = ref<NightDashboard>();
const loading = ref(false);
const error = ref(false);
const guest = ref(false);
/** 未绑定夜宵店（后端 404：尚未绑定=招募中） */
const notBound = ref(false);
/** 营业动作防重 */
const acting = ref(false);

const statusText = computed(() =>
  data.value ? nightStoreStatusText(data.value.store.status) : "",
);
const tone = computed(() =>
  data.value ? nightStoreStatusTone(data.value.store.status) : "closed",
);
/** 场次窗口行：未配置时显示「场次待运营配置」 */
const windowLine = computed(() => {
  const c = data.value?.campus;
  if (!c || !c.nightStartAt || !c.nightEndAt) return "夜宵场次待运营配置";
  return `场次 ${c.nightStartAt} ~ ${c.nightEndAt}`;
});
/** 佣金比例（万分比 → 百分比） */
const rateText = computed(() => {
  const r = data.value?.store.commissionRate ?? 0;
  return r ? `佣金 ${(r / 100).toFixed(1)}% + 配送费全额` : "佣金比例待配置";
});

async function load() {
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    data.value = await api.nightDashboard();
  } catch (e) {
    if (isBindRequired(e)) guest.value = true;
    else if (e instanceof ApiError && e.status === 404) notBound.value = true;
    else if (isRetryable(e)) error.value = true;
  } finally {
    loading.value = false;
  }
}
onShow(load);

const go = (url: string) => uni.navigateTo({ url });
const goOrders = () => uni.navigateTo({ url: "/pages/night/orders" });

/* ---------- 营业操作 ---------- */
async function act(kind: "open" | "pause" | "resume" | "close") {
  if (acting.value || !data.value) return;
  if (kind === "close") {
    const okToGo = await confirmClose();
    if (!okToGo) return;
  }
  acting.value = true;
  try {
    if (kind === "open") await api.nightOpen();
    else if (kind === "pause") await api.nightPause();
    else if (kind === "resume") await api.nightResume();
    else await api.nightClose();
    uni.showToast({ title: "操作成功", icon: "success" });
  } finally {
    acting.value = false;
    // 成功/失败都重拉纠偏（开店被拒时 request 层已 toast 具体原因）
    load().catch(() => {});
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
      success: (r) => resolve(!!r.confirm),
      fail: () => resolve(false),
    }),
  );
}

/** 恢复上架类业务拒绝由 request 层 toast，这里只做防重与状态重拉 */
const entries: Array<{ key: string; label: string; sub: string; url: string }> = [
  {
    key: "stock",
    label: "备货进货",
    sub: "押金额度内免费进货",
    url: "/pages/night/stock",
  },
  {
    key: "products",
    label: "本店商品",
    sub: "库存与上下架",
    url: "/pages/night/products",
  },
  {
    key: "orders",
    label: "夜宵订单",
    sub: "接单与配送",
    url: "/pages/night/orders",
  },
  {
    key: "income",
    label: "夜宵收入",
    sub: "佣金与配送费",
    url: "/pages/night/income",
  },
  {
    key: "deposit",
    label: "经营押金",
    sub: "余额与缴纳",
    url: "/pages/night/deposit",
  },
  {
    key: "stock-orders",
    label: "备货记录",
    sub: "进货单留痕",
    url: "/pages/night/stock-orders",
  },
];
</script>

<template>
  <view class="page night-page">
    <view v-if="error" class="retry card" role="button" @tap="load"
      ><text class="retry__title">加载失败</text
      ><text class="retry__sub">网络异常或服务暂不可用，点击重试</text></view
    >
    <view v-else-if="loading" class="night-skeleton"
      ><view class="night-skeleton__hero" /><view
        class="night-skeleton__stats" /><view
        class="night-skeleton__block"
    /></view>
    <view v-else-if="guest" class="retry card" role="button" @tap="load">
      <text class="retry__title">员工专用 · 夜宵店工作区</text>
      <text class="retry__sub">楼长登录后可经营本楼夜宵店，点击登录</text>
    </view>
    <view v-else-if="notBound" class="card bound-empty">
      <text class="bound-empty__title">本楼夜宵店招募中</text>
      <text class="bound-empty__desc"
        >尚未为你分配夜宵店。运营在后台把夜宵店绑定到你名下后，这里会变成你的夜宵工作台。</text
      >
    </view>

    <template v-else-if="data">
      <view class="hero">
        <view class="hero__glow"></view>
        <view class="hero__top">
          <view>
            <text class="hero__kicker">NIGHT STORE</text>
            <text class="hero__title">{{ data.store.buildingName }} 夜宵店</text>
          </view>
          <view class="hero__badge" :class="`hero__badge--${tone}`">{{
            statusText
          }}</view>
        </view>
        <text class="hero__window">{{
          data.inWindow ? `${windowLine} · 场次中` : windowLine
        }}</text>
        <text class="hero__rate">{{ rateText }}</text>
      </view>

      <view class="stats card">
        <view
          ><text class="stats__value">{{
            fenToYuan(data.deposit)
          }}</text><text class="stats__label">押金余额</text></view
        >
        <view
          ><text class="stats__value">{{ fenToYuan(data.todaySales) }}</text
          ><text class="stats__label">今日销售额</text></view
        >
        <view
          ><text class="stats__value">{{ data.todayOrders }}</text
          ><text class="stats__label">今日单量</text></view
        >
        <view
          ><text class="stats__value">{{ fenToYuan(data.stockValue) }}</text
          ><text class="stats__label">库存货值</text></view
        >
      </view>

      <!-- 待接单优先提醒：接单及时率直接影响学生体验 -->
      <view
        v-if="data.pendingOrders > 0"
        class="pending card"
        role="button"
        @tap="goOrders"
        ><view class="pending__mark"></view
        ><text class="pending__text"
          >{{ data.pendingOrders }} 单待接单，学生正在等</text
        ><text class="pending__act">去处理</text></view
      >

      <!-- 营业操作区：按钮按当前状态渲染；开店校验（互斥/押金/可售商品）
           不满足时后端 400 返回具体原因，request 层直接 toast 原文 -->
      <view class="ops card">
        <text class="ops__head">营业管理</text>
        <button
          v-if="data.store.status === 'closed'"
          class="ops__btn ops__btn--primary"
          :disabled="acting"
          @tap="act('open')"
        >
          {{ acting ? "处理中…" : "开 夜 宵 店" }}
        </button>
        <template v-else-if="data.store.status === 'open'">
          <button
            class="ops__btn ops__btn--warn"
            :disabled="acting"
            @tap="act('pause')"
          >
            暂停接单
          </button>
          <button
            class="ops__btn ops__btn--danger"
            :disabled="acting"
            @tap="act('close')"
          >
            今日打烊
          </button>
        </template>
        <template v-else-if="data.store.status === 'paused'">
          <button
            class="ops__btn ops__btn--primary"
            :disabled="acting"
            @tap="act('resume')"
          >
            恢复营业
          </button>
          <button
            class="ops__btn ops__btn--danger"
            :disabled="acting"
            @tap="act('close')"
          >
            今日打烊
          </button>
        </template>
        <text v-else-if="data.store.status === 'suspended'" class="ops__hint"
          >店铺已被平台停业，请联系运营</text
        >
        <text v-else class="ops__hint">今日已打烊，次日场次可重新开店</text>
      </view>

      <view class="section-title"
        ><view
          ><text class="section-kicker">WORKSPACE</text
          ><text class="section-title__main">工作区</text></view
        ></view
      >
      <view class="entries card">
        <view
          v-for="e in entries"
          :key="e.key"
          class="entry"
          role="button"
          @tap="go(e.url)"
          ><view class="entry__main"
            ><text class="entry__label">{{ e.label }}</text
            ><text class="entry__sub">{{ e.sub }}</text></view
          ><text class="link-chip">进入</text></view
        >
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
@import "../../styles/theme.scss";
.night-page {
  background:
    radial-gradient(circle at 92% 6%, rgba(185, 242, 39, 0.16), transparent 26%),
    $paper;
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
/* 招募中空态（未绑定夜宵店） */
.bound-empty {
  padding: 90rpx 40rpx;
  text-align: center;
}
.bound-empty__title {
  display: block;
  font-size: 36rpx;
  font-weight: 900;
  color: $ink;
}
.bound-empty__desc {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  line-height: 1.7;
  color: $muted;
}
/* 状态头卡 */
.hero {
  position: relative;
  overflow: hidden;
  padding: 36rpx;
  border-radius: 38rpx;
  background: linear-gradient(150deg, $primary-deep, $primary-dark 70%, #126c43);
  color: #fff;
  box-shadow: 0 18rpx 42rpx rgba(3, 45, 34, 0.22);
}
.hero__glow {
  position: absolute;
  width: 240rpx;
  height: 240rpx;
  border-radius: 50%;
  right: -90rpx;
  top: -110rpx;
  background: rgba(185, 242, 39, 0.14);
}
.hero__top {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.hero__kicker,
.hero__title,
.hero__window,
.hero__rate {
  display: block;
}
.hero__kicker {
  font-size: 19rpx;
  font-weight: 900;
  letter-spacing: 2rpx;
  color: $lime;
}
.hero__title {
  font-size: 38rpx;
  font-weight: 900;
  margin-top: 10rpx;
}
.hero__badge {
  padding: 8rpx 22rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 800;
  background: rgba(185, 242, 39, 0.9);
  color: $primary-deep;
}
.hero__badge--closed {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}
.hero__badge--paused {
  background: $accent;
  color: #fff;
}
.hero__badge--suspended {
  background: $danger;
  color: #fff;
}
.hero__window {
  margin-top: 20rpx;
  font-size: 24rpx;
  opacity: 0.82;
}
.hero__rate {
  margin-top: 6rpx;
  font-size: 20rpx;
  opacity: 0.62;
}
/* 四联统计 */
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 28rpx 10rpx;
  margin-top: 22rpx;
  text-align: center;
}
.stats > view + view {
  border-left: 2rpx solid $line;
}
.stats__value,
.stats__label {
  display: block;
}
.stats__value {
  font-size: 30rpx;
  font-weight: 900;
  color: var(--brand, #159c55);
  font-variant-numeric: tabular-nums;
}
.stats__label {
  font-size: 19rpx;
  color: $muted;
  margin-top: 6rpx;
  letter-spacing: 1rpx;
}
/* 待接单提醒条：橙系警示，与首页低水位条同观感 */
.pending {
  display: flex;
  align-items: center;
  gap: 14rpx;
  min-height: 92rpx;
  margin-top: 22rpx;
  padding: 14rpx 24rpx;
  border-radius: 22rpx;
  background: $warning;
}
.pending__mark {
  flex: none;
  width: 30rpx;
  height: 30rpx;
  border-radius: 50%;
  background: $accent;
  position: relative;
}
.pending__mark:after {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  width: 10rpx;
  height: 16rpx;
  border: 4rpx solid #fff;
  border-top: none;
  border-left: none;
  border-radius: 2rpx;
  transform: rotate(45deg) translate(-1rpx, -2rpx);
}
.pending__text {
  flex: 1;
  font-size: 23rpx;
  color: #7a4a12;
  font-weight: 700;
}
.pending__act {
  padding: 12rpx 26rpx;
  border-radius: 999rpx;
  background: $accent;
  color: #fff;
  font-size: 22rpx;
  font-weight: 800;
}
/* 营业操作区 */
.ops {
  margin-top: 22rpx;
  padding: 30rpx;
}
.ops__head {
  display: block;
  font-size: 27rpx;
  font-weight: 900;
  color: $ink;
}
.ops__btn {
  width: 100%;
  min-height: 92rpx;
  margin: 22rpx 0 0;
  border-radius: 999rpx;
  font-size: 29rpx;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ops__btn--primary {
  background: $primary-dark;
  color: $lime;
}
.ops__btn--warn {
  background: $soft;
  color: $primary-dark;
}
.ops__btn--danger {
  background: #fdece9;
  color: $danger;
}
.ops__btn[disabled] {
  opacity: 0.6;
}
.ops__hint {
  display: block;
  margin-top: 18rpx;
  font-size: 22rpx;
  color: $muted;
}
/* 工作区入口 */
.section-kicker {
  display: block;
  color: $primary;
  font-size: 18rpx;
  font-weight: 900;
  letter-spacing: 2rpx;
}
.section-title__main {
  display: block;
}
.section-title {
  margin-top: 34rpx;
}
.entries {
  margin-top: 18rpx;
  padding: 2rpx 24rpx;
}
.entry {
  min-height: 116rpx;
  display: flex;
  align-items: center;
  gap: 18rpx;
  border-bottom: 2rpx solid $line;
}
.entries > .entry:last-child {
  border-bottom: none;
}
.entry__main {
  flex: 1;
}
.entry__label {
  display: block;
  font-size: 27rpx;
  font-weight: 800;
  color: $ink;
}
.entry__sub {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  color: $muted;
}
/* 骨架 */
.night-skeleton__hero,
.night-skeleton__stats,
.night-skeleton__block {
  border-radius: 38rpx;
  background: linear-gradient(90deg, #edf2ed, #fff, #edf2ed);
  animation: night-pulse 1.2s infinite;
}
.night-skeleton__hero {
  height: 300rpx;
}
.night-skeleton__stats {
  height: 130rpx;
  margin-top: 22rpx;
}
.night-skeleton__block {
  height: 240rpx;
  margin-top: 22rpx;
}
@keyframes night-pulse {
  50% {
    opacity: 0.55;
  }
}
</style>
