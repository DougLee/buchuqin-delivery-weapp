<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { useSessionStore } from "../../stores/session";
import { formatShort } from "../../utils/datetime";
import { fenToYuan } from "../../utils/money";
import type { CommissionBill } from "../../types";
const session = useSessionStore(),
  bill = ref<CommissionBill>(),
  /** IK8W5V：加载失败标记，展示重试入口避免页面永久空白 */
  error = ref(false);
async function load() {
  error.value = false;
  try {
    await session.ensure();
    bill.value = await api.commissions(session.role);
  } catch {
    error.value = true;
  }
}
onShow(load);
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
  <view v-else-if="bill" class="page income-page"
    ><view class="income-hero"
      ><view class="income-hero__top"
        ><view
          ><text class="kicker">{{ bill.month }} INCOME</text
          ><text class="label">本月预计收入</text></view
        ><text class="bill-tag">月结</text></view
      ><text class="amount"><small>¥</small>{{ fenToYuan(bill.payable) }}</text
      ><view class="trend"
        ><!-- IK8W5V：柱状图由近 7 天提成记录驱动，无数据显示空态文案 -->
        ><view class="trend__bars"
          ><view
            v-for="d in week.days"
            :key="d.label"
            class="trend__bar"
            :class="{ 'trend__bar--dim': !d.count }"
            :style="{ height: d.height + 'px' }"
          ></view></view
        ><text>{{
          week.total ? `近 7 日完成 ${week.total} 单` : "近 7 日暂无提成记录"
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
      ><text class="section-title__sub"
        >共 {{ bill.records.length }} 笔</text
      ></view
    ><view v-for="r in bill.records" :key="r.id" class="record card"
      ><view class="record__mark"></view
      ><view class="record__content"
        ><text class="record__title">{{ r.building }} 配送</text
        ><text class="muted"
          >{{ r.orderNo }} · {{ formatShort(r.createdAt) }}</text
        ></view
      ><text class="money">+¥{{ fenToYuan(r.amount) }}</text></view
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
  font-size: 18rpx;
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
  font-size: 19rpx;
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
  font-size: 19rpx;
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
.record {
  display: flex;
  align-items: center;
  padding: 24rpx;
  margin-bottom: 16rpx;
}
.record__mark {
  width: 12rpx;
  height: 54rpx;
  border-radius: 8rpx;
  background: $lime;
  margin-right: 18rpx;
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
</style>
