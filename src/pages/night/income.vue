<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { isRetryable } from "../../api/request";
import { useSessionStore, isBindRequired } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import { formatShort } from "../../utils/datetime";
import {
  nightCommissionStatusText,
  nightCommissionTypeText,
  nightDepositTxnView,
} from "../../utils/night";
import type { NightDepositDetail, NightIncome } from "../../types";

/**
 * 夜宵收入页（IKSW1F）：佣金/配送费两列流水 + 期间合计（分状态小计） +
 * 押金余额与押金流水。佣金=券后商品实收×比例，配送费全额归楼长（V1.5 L14）。
 */
const session = useSessionStore();
const income = ref<NightIncome>();
const depositData = ref<NightDepositDetail>();
const loading = ref(false);
const error = ref(false);
const guest = ref(false);
/** 流水分段：佣金 / 押金 */
const tab = ref<"commission" | "deposit">("commission");

const sum = (b: { estimated: number; pending: number; settled: number }) =>
  b.estimated + b.pending + b.settled;
const commissionTotal = computed(() =>
  income.value ? sum(income.value.summary.commission) : 0,
);
const deliveryFeeTotal = computed(() =>
  income.value ? sum(income.value.summary.deliveryFee) : 0,
);
const grandTotal = computed(
  () => commissionTotal.value + deliveryFeeTotal.value,
);

async function load() {
  if (loading.value) return;
  guest.value = false;
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    const [i, d] = await Promise.all([
      api.nightIncome(),
      api.nightDeposit().catch(() => undefined),
    ]);
    income.value = i;
    depositData.value = d;
  } catch (e) {
    if (isBindRequired(e)) guest.value = true;
    else if (isRetryable(e)) error.value = true;
  } finally {
    loading.value = false;
  }
}
onShow(load);
onMounted(load);

const goDeposit = () => uni.navigateTo({ url: "/pages/night/deposit" });

function rateLine(t: { base: number | null; rate: number | null }): string {
  if (t.base == null || !t.rate) return "按单计酬";
  return `基数 ¥${fenToYuan(t.base)} × ${(t.rate / 100).toFixed(1).replace(/\.0$/, "")}%`;
}

/** 佣金流水金额行（IKSZF5）：退款冲销为负数流水 → -¥x.xx 橙红，不再显示「+¥-1.23」 */
function moneyLine(amount: number): string {
  return `${amount < 0 ? "-" : "+"}¥${fenToYuan(Math.abs(amount))}`;
}
</script>

<template>
  <view class="page income-page">
    <view v-if="error" class="retry card" role="button" @tap="load"
      ><text class="retry__title">加载失败</text
      ><text class="retry__sub">网络异常或服务暂不可用，点击重试</text></view
    >
    <view v-else-if="loading" class="income-skeleton"
      ><view class="income-skeleton__hero" /><view
        v-for="n in 4"
        :key="n"
        class="income-skeleton__row"
    /></view>
    <view v-else-if="guest" class="retry card" role="button" @tap="load">
      <text class="retry__title">员工专用 · 夜宵收入</text>
      <text class="retry__sub">楼长登录后可查看夜宵收入，点击登录</text>
    </view>

    <template v-else-if="income">
      <view class="hero">
        <view class="hero__glow"></view>
        <text class="hero__kicker">NIGHT INCOME</text>
        <text class="hero__label">期间合计（佣金 + 配送费）</text>
        <text class="hero__amount"><small>¥</small>{{ fenToYuan(grandTotal) }}</text>
        <text class="hero__split"
          >商品佣金 ¥{{ fenToYuan(commissionTotal) }} · 配送费 ¥{{
            fenToYuan(deliveryFeeTotal)
          }}</text
        >
      </view>

      <!-- 两列分账（状态小计）：预计→待结算→已结算 -->
      <view class="ledger card">
        <view class="ledger__col">
          <text class="ledger__head">商品佣金</text>
          <text class="ledger__row">预计 ¥{{ fenToYuan(income.summary.commission.estimated) }}</text>
          <text class="ledger__row">待结算 ¥{{ fenToYuan(income.summary.commission.pending) }}</text>
          <text class="ledger__row ledger__row--strong">已结算 ¥{{ fenToYuan(income.summary.commission.settled) }}</text>
        </view>
        <view class="ledger__col">
          <text class="ledger__head">配送费</text>
          <text class="ledger__row">预计 ¥{{ fenToYuan(income.summary.deliveryFee.estimated) }}</text>
          <text class="ledger__row">待结算 ¥{{ fenToYuan(income.summary.deliveryFee.pending) }}</text>
          <text class="ledger__row ledger__row--strong">已结算 ¥{{ fenToYuan(income.summary.deliveryFee.settled) }}</text>
        </view>
      </view>
      <text class="ledger__note"
        >预计→待结算→已结算依次推进；订单退款时对应佣金按负数流水冲回，押金不计入收入。</text
      >

      <!-- 押金余额入口（额度随流水变动，详情进押金页） -->
      <view class="deposit-strip card" role="button" @tap="goDeposit"
        ><text class="deposit-strip__label">押金余额（进货额度）</text
        ><text class="deposit-strip__value">¥{{ fenToYuan(income.deposit) }}</text
        ><text class="deposit-strip__act">查看流水</text></view
      >

      <!-- 流水分段：佣金 / 押金 -->
      <view class="seg card">
        <view
          class="seg__item"
          :class="{ 'seg__item--on': tab === 'commission' }"
          role="button"
          @tap="tab = 'commission'"
          ><text>佣金流水</text
          ><text class="seg__count">{{ income.items.length }}</text></view
        >
        <view
          class="seg__item"
          :class="{ 'seg__item--on': tab === 'deposit' }"
          role="button"
          @tap="tab = 'deposit'"
          ><text>押金流水</text
          ><text class="seg__count">{{
            depositData ? depositData.txns.length : 0
          }}</text></view
        >
      </view>

      <!-- 佣金流水（每单两条） -->
      <view v-if="tab === 'commission'" class="records card">
        <view v-for="r in income.items" :key="r.id" class="record"
          ><view class="record__icon"></view
          ><view class="record__content"
            ><text class="record__title"
              >{{ nightCommissionTypeText(r.type) }} · {{
                nightCommissionStatusText(r.status)
              }}</text
            ><text class="muted"
              >{{ r.orderNo || "—" }} · {{ formatShort(r.createdAt) }}</text
            ><text v-if="r.type === 'commission'" class="muted">{{
              rateLine(r)
            }}</text
            ><text v-if="r.remark" class="muted">{{ r.remark }}</text
            ></view
          ><text class="money" :class="{ 'money--neg': r.amount < 0 }">{{
            moneyLine(r.amount)
          }}</text></view
        >
        <view v-if="!income.items.length" class="records__empty"
          >还没有佣金流水，接单送达后自动入账</view
        >
      </view>

      <!-- 押金流水 -->
      <view v-else class="records card">
        <template v-if="depositData">
          <view
            v-for="t in depositData.txns"
            :key="t.id"
            class="record"
            ><view
              class="record__icon"
              :class="{ 'record__icon--neg': nightDepositTxnView(t.type).negative }"></view
            ><view class="record__content"
              ><text class="record__title">{{ nightDepositTxnView(t.type).label }}</text
              ><text class="muted"
                >{{ t.payOrderNo || t.remark || "—" }} · {{ formatShort(t.createdAt) }}</text
              ></view
            ><text
              class="money"
              :class="{ 'money--neg': nightDepositTxnView(t.type).negative }"
              >{{ nightDepositTxnView(t.type).negative ? "-" : "+" }}¥{{ fenToYuan(t.amount) }}</text
            ></view
          >
          <view v-if="!depositData.txns.length" class="records__empty"
            >还没有押金流水，缴纳后在这里留痕</view
          >
        </template>
        <view v-else class="records__empty">押金信息加载失败，可进押金页查看</view>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
@import "../../styles/theme.scss";
.income-page {
  background:
    radial-gradient(circle at 90% 7%, rgba(185, 242, 39, 0.2), transparent 25%),
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
.hero {
  position: relative;
  overflow: hidden;
  padding: 36rpx;
  border-radius: 38rpx;
  background: linear-gradient(145deg, $primary-deep, $primary-dark);
  color: #fff;
  box-shadow: 0 18rpx 42rpx rgba(3, 45, 34, 0.22);
}
.hero__glow {
  position: absolute;
  width: 230rpx;
  height: 230rpx;
  border-radius: 50%;
  right: -80rpx;
  bottom: -110rpx;
  background: rgba(185, 242, 39, 0.1);
}
.hero__kicker,
.hero__label,
.hero__amount,
.hero__split {
  display: block;
  position: relative;
}
.hero__kicker {
  font-size: 20rpx;
  letter-spacing: 3rpx;
  color: $lime;
  font-weight: 900;
}
.hero__label {
  font-size: 24rpx;
  margin-top: 8rpx;
  opacity: 0.78;
}
.hero__amount {
  font-size: 76rpx;
  line-height: 1.1;
  font-weight: 900;
  margin: 20rpx 0;
}
.hero__amount small {
  font-size: 32rpx;
  margin-right: 8rpx;
}
.hero__split {
  font-size: 21rpx;
  opacity: 0.72;
}
/* 两列分账 */
.ledger {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin-top: 22rpx;
  padding: 26rpx 30rpx;
}
.ledger__col + .ledger__col {
  border-left: 2rpx solid $line;
  padding-left: 30rpx;
}
.ledger__head,
.ledger__row {
  display: block;
}
.ledger__head {
  font-size: 25rpx;
  font-weight: 900;
  color: $ink;
  margin-bottom: 12rpx;
}
.ledger__row {
  font-size: 21rpx;
  color: $muted;
  line-height: 2;
}
.ledger__row--strong {
  color: var(--brand, #159c55);
  font-weight: 900;
}
.ledger__note {
  display: block;
  margin: 16rpx 28rpx 0;
  font-size: 19rpx;
  line-height: 1.6;
  color: $muted;
}
/* 押金余额条 */
.deposit-strip {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-height: 96rpx;
  margin-top: 22rpx;
  padding: 16rpx 28rpx;
}
.deposit-strip__label {
  flex: 1;
  font-size: 23rpx;
  color: $muted;
  font-weight: 700;
}
.deposit-strip__value {
  font-size: 30rpx;
  font-weight: 900;
  color: var(--brand, #159c55);
  font-variant-numeric: tabular-nums;
}
.deposit-strip__act {
  padding: 10rpx 24rpx;
  border-radius: 999rpx;
  background: rgba(24, 169, 87, 0.12);
  color: $primary-dark;
  font-size: 20rpx;
  font-weight: 800;
}
/* 分段 */
.seg {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 14rpx 20rpx;
  margin-top: 22rpx;
}
.seg__item {
  display: flex;
  align-items: center;
  gap: 10rpx;
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
.seg__count {
  font-size: 19rpx;
  opacity: 0.8;
}
/* 流水列表 */
.records {
  margin-top: 18rpx;
  padding: 2rpx 24rpx;
}
.record {
  min-height: 110rpx;
  display: flex;
  align-items: center;
  gap: 18rpx;
  border-bottom: 2rpx solid $line;
}
.records > .record:last-child {
  border-bottom: none;
}
.record__icon {
  width: 64rpx;
  height: 64rpx;
  border-radius: 19rpx;
  background: $soft;
  display: grid;
  place-items: center;
  color: $primary-dark;
  font-size: 30rpx;
  font-weight: 900;
}
.record__icon:before {
  content: "¥";
}
.record__icon--neg {
  background: rgba(200, 90, 34, 0.12);
}
.record__content {
  flex: 1;
}
.record__title {
  display: block;
  font-weight: 800;
}
.record .muted {
  display: block;
  font-size: 20rpx;
  margin-top: 5rpx;
}
.money {
  color: $primary-dark;
  font-size: 30rpx;
  font-weight: 900;
}
.money--neg {
  color: #c85a22;
}
.records__empty {
  padding: 70rpx 0;
  text-align: center;
  color: $muted;
  font-size: 24rpx;
}
.income-skeleton__hero,
.income-skeleton__row {
  border-radius: 38rpx;
  background: linear-gradient(90deg, #edf2ed, #fff, #edf2ed);
  animation: income-pulse 1.2s infinite;
}
.income-skeleton__hero {
  height: 300rpx;
}
.income-skeleton__row {
  height: 102rpx;
  margin-top: 16rpx;
  border-radius: 28rpx;
}
@keyframes income-pulse {
  50% {
    opacity: 0.55;
  }
}
</style>
