<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { useSessionStore } from "../../stores/session";
import { formatShort } from "../../utils/datetime";
import { fenToYuan } from "../../utils/money";
import type { CommissionBill } from "../../types";
const session = useSessionStore(),
  bill = ref<CommissionBill & { total?: number }>(),
  /** IK8W5V：加载失败标记，展示重试入口避免页面永久空白 */
  error = ref(false),
  /** 首屏/切换加载中（IK9AWY）：驱动骨架屏 */
  loading = ref(false),
  /** 查看月份（IK9AWZ）：YYYY-MM，缺省当月，picker 切换后按月重查 */
  month = ref("");
function nowMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const isCurrent = computed(() => month.value === nowMonth());
async function load(m = month.value) {
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    bill.value = await api.commissions(session.role, m || undefined);
    if (!m) month.value = nowMonth();
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
onShow(load);
/** 月份切换（IK9AWZ）：picker fields=month，回调即按月重查 */
function onMonthChange(e: { detail: { value: string } }) {
  month.value = e.detail.value;
  load(e.detail.value);
}
/** IK8W5V 去演示化：柱状图由 records 真实数据驱动（近 7 天单量），无数据显示空态文案 */
const week = computed(() => {
  const records = bill.value?.records ?? [];
  const days: Array<{ label: string; count: number; height: number }> = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const count = records.filter((r) => {
      const t = new Date(r.createdAt).getTime();
      return t >= start.getTime() && t < end.getTime();
    }).length;
    days.push({
      label: `${String(start.getMonth() + 1).padStart(2, "0")}-${String(
        start.getDate(),
      ).padStart(2, "0")}`,
      count,
      height: 0,
    });
  }
  const max = Math.max(0, ...days.map((d) => d.count));
  // 高度用 px（内联 rpx 在 H5 不换算）：无数据 3px 底点，有数据 4~22px
  days.forEach((d) => {
    d.height =
      d.count === 0
        ? 3
        : Math.max(4, Math.round((d.count / (max || 1)) * 22));
  });
  return { days, total: days.reduce((s, d) => s + d.count, 0) };
});
</script>
<template>
  <view v-if="error" class="page income-page"
    ><view class="retry card" role="button" @tap="load"
      ><text class="retry__title">加载失败</text
      ><text class="retry__sub">网络异常或服务暂不可用，点击重试</text></view
    ></view
  >
  <view v-else-if="loading" class="page income-page"
    ><!-- 加载骨架（IK9AWY） -->
<view class="income-skeleton__hero" /><view
      class="income-skeleton__break"
    /><view v-for="n in 3" :key="n" class="income-skeleton__record" />
  </view>
  <view v-else-if="bill" class="page income-page"
    ><view class="income-hero"
      ><view class="income-hero__top"
        ><view
          ><!-- IK9U48：月份只保留右上角切换入口，左上角不再重复展示 -->
<text class="kicker">INCOME</text
          ><text class="label">{{
            isCurrent ? "本月预计收入" : "当月收入"
          }}</text></view
        ><!-- 月份切换（IK9AWZ）：picker 月份粒度，选中即重查 -->
<picker
          mode="date"
          fields="month"
          :value="month"
          @change="onMonthChange"
          ><text class="bill-tag">{{ month }}
            <text class="chevron--down"/></text></picker
        ></view
      ><text class="amount"><small>¥</small>{{ fenToYuan(bill.payable) }}</text
      ><view class="trend"
        ><!-- IK8W5V：柱状图由近 7 天提成记录驱动，无数据显示空态文案；
            非当月视图不画「近 7 日」柱（数据是整月记录，画了必错） -->
<view v-if="isCurrent" class="trend__bars"
          ><view
            v-for="d in week.days"
            :key="d.label"
            class="trend__bar"
            :class="{ 'trend__bar--dim': !d.count }"
            :style="{ height: d.height + 'px' }"
          ></view></view
        ><text>{{
          isCurrent
            ? week.total
              ? `近 7 日完成 ${week.total} 单`
              : "近 7 日暂无提成记录"
            : `该月共 ${bill.total ?? bill.records.length} 笔提成`
        }}</text></view
      ></view
    ><view class="breakdown card"
      ><view
        ><text>社群底薪</text
        ><strong>¥{{ fenToYuan(bill.baseSalary) }}</strong></view
      ><view
        ><text>配送提成</text
        ><strong>¥{{ fenToYuan(bill.deliveryIncome) }}</strong></view
      ><view
        ><text>跨期调整</text
        ><strong>¥{{ fenToYuan(bill.adjustment) }}</strong></view
      ></view
    ><view class="section-title"
      ><view
        ><text class="kicker green">DETAILS</text
        ><text class="section-title__main">提成明细</text></view
      ><!-- 笔数用信封 total（IK9AWX）：records 上限 100，超了不再少报 -->
<text class="section-title__sub"
        >共 {{ bill.total ?? bill.records.length }} 笔</text
      ></view
    ><view class="records card"
      ><view v-for="r in bill.records" :key="r.id" class="record"
        ><view class="record__icon"></view
        ><view class="record__content"
          ><text class="record__title">{{ r.building }} 配送</text
          ><text class="muted"
            >{{ r.orderNo }} · {{ formatShort(r.createdAt) }}</text
          ></view
        ><text class="money">+¥{{ fenToYuan(r.amount) }}</text></view
      ><view v-if="!bill.records.length" class="records__empty"
        >本月暂无提成记录</view
      ></view
    ></view
  >
</template>
<style scoped lang="scss">
@import "../../styles/theme.scss";
.income-page {
  background:
    radial-gradient(circle at 90% 7%, rgba(185, 242, 39, 0.2), transparent 25%),
    $paper;
}
.income-hero {
  position: relative;
  overflow: hidden;
  padding: 36rpx;
  border-radius: 38rpx;
  background: linear-gradient(145deg, $primary-deep, $primary-dark);
  color: #fff;
  box-shadow: 0 18rpx 42rpx rgba(3, 45, 34, 0.22);
}
.income-hero:after {
  content: "";
  position: absolute;
  width: 230rpx;
  height: 230rpx;
  border-radius: 50%;
  right: -80rpx;
  bottom: -110rpx;
  background: rgba(185, 242, 39, 0.1);
}
.income-hero text {
  display: block;
}
.income-hero__top {
  display: flex;
  justify-content: space-between;
}
.kicker {
  font-size: 20rpx;
  letter-spacing: 3rpx;
  color: $lime;
  font-weight: 900;
}
.label {
  font-size: 24rpx;
  margin-top: 8rpx;
  opacity: 0.78;
}
.bill-tag {
  height: 48rpx;
  padding: 6rpx 18rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.24);
  border-radius: 999rpx;
  font-size: 20rpx;
}
.amount {
  font-size: 76rpx;
  line-height: 1.1;
  font-weight: 900;
  margin: 22rpx 0;
}
.amount small {
  font-size: 32rpx;
  margin-right: 8rpx;
}
.trend {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  font-size: 20rpx;
  opacity: 0.76;
}
.trend__bars {
  height: 48rpx;
  display: flex;
  align-items: flex-end;
  gap: 7rpx;
}
.trend__bar {
  width: 8rpx;
  border-radius: 8rpx;
  background: $lime;
}
.trend__bar--dim {
  opacity: 0.35;
}
.breakdown {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin-top: 22rpx;
  padding: 24rpx 10rpx;
}
.breakdown > view {
  text-align: center;
}
.breakdown > view + view {
  border-left: 2rpx solid $line;
}
.breakdown text,
.breakdown strong {
  display: block;
}
.breakdown text {
  font-size: 20rpx;
  color: $muted;
}
.breakdown strong {
  font-size: 26rpx;
  margin-top: 5rpx;
}
.green {
  color: $primary;
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
/* 提成明细（IK9W4V）：与履约设置 menu 同构——单卡、分隔线、图标格 */
.records {
  padding: 2rpx 24rpx;
}
.record {
  min-height: 110rpx;
  display: flex;
  align-items: center;
  gap: 18rpx;
  border-bottom: 2rpx solid $line;
}
.records > view:last-child {
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
.records__empty {
  padding: 70rpx 0;
  text-align: center;
  color: $muted;
  font-size: 24rpx;
}
.record__content {
  flex: 1;
}
.record text {
  display: block;
}
.record__title {
  font-weight: 800;
}
.record .muted {
  font-size: 20rpx;
  margin-top: 5rpx;
}
.money {
  color: $primary-dark;
  font-size: 30rpx;
  font-weight: 900;
}
.income-skeleton__hero,
.income-skeleton__break,
.income-skeleton__record {
  border-radius: 38rpx;
  background: linear-gradient(90deg, #edf2ed, #fff, #edf2ed);
  animation: income-pulse 1.2s infinite;
}
.income-skeleton__hero {
  height: 300rpx;
}
.income-skeleton__break {
  height: 130rpx;
  margin-top: 22rpx;
  border-radius: 28rpx;
}
.income-skeleton__record {
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
