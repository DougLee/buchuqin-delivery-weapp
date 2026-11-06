<script setup lang="ts">
import { computed, ref } from "vue";
import { onPullDownRefresh, onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { isRetryable } from "../../api/request";
import { useSessionStore, isBindRequired } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import { formatShort } from "../../utils/datetime";
import { nightTabGuard } from "../../utils/nightMode";
import NightTabBar from "../../components/NightTabBar.vue";
import type { NightCommissionTxn, NightIncome } from "../../types";

/**
 * 夜宵收入（夜宵模式第三 tab）——白天收入页（pages/income/index.vue）逐块复刻，
 * 数据换源 nightApi、深色主题取 night.scss token：
 * income-hero（NIGHT INCOME kicker/月份 picker/大金额待结算口径金黄/近 7 日柱状）→
 * breakdown 三列明细卡（佣金/配送费/退款冲回橙红）→ section-title（DETAILS/
 * 夜宵流水/共 N 笔）→ records 流水列表（record 同骨架，按单合并佣金+配送费）→
 * 同款空态。接口口径沿用既有实现：night-income 暂不支持按月查询，大金额展示
 * 「待结算」口径（commission+deliveryFee 的 pending 桶累计），历史月份占位提示。
 */
const session = useSessionStore();
const income = ref<NightIncome>();
const loading = ref(false);
const error = ref(false);
const guest = ref(false);
/** 查看月份（picker）：YYYY-MM，仅当月有真实数据（接口暂不支持按月） */
const month = ref("");
const nowMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const isCurrent = computed(() => !month.value || month.value === nowMonth());

/** 大金额：待结算口径（pending 桶两列合计） */
const pendingAmount = computed(() => {
  const s = income.value?.summary;
  if (!s) return 0;
  return s.commission.pending + s.deliveryFee.pending;
});
/** 明细卡第三列：退款冲回合计（负数流水聚合，橙红展示） */
const refundTotal = computed(() => {
  const rows = income.value?.items ?? [];
  return rows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
});

/* ---------- 近 7 日柱状（流水真实聚合，无数据画底点） ---------- */
const week = computed(() => {
  const rows = income.value?.items ?? [];
  const days: Array<{ label: string; count: number; height: number }> = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const count = rows.filter((r) => {
      const t = new Date(r.createdAt).getTime();
      return t >= start.getTime() && t < end.getTime();
    }).length;
    days.push({
      label: `${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`,
      count,
      height: 0,
    });
  }
  const max = Math.max(0, ...days.map((d) => d.count));
  days.forEach((d) => {
    d.height =
      d.count === 0 ? 4 : Math.max(8, Math.round((d.count / (max || 1)) * 44));
  });
  return { days, total: days.reduce((s, d) => s + d.count, 0) };
});
/** 近 7 日摘要行：完成 N 笔 · 佣金 ¥X + 配送费 ¥Y */
const weekLine = computed(() => {
  const rows = income.value?.items ?? [];
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  const recent = rows.filter(
    (r) => new Date(r.createdAt).getTime() >= start.getTime(),
  );
  let c = 0;
  let dFee = 0;
  for (const r of recent) {
    if (r.type === "deliveryFee") dFee += r.amount;
    else c += r.amount;
  }
  return `近 7 日 ${week.value.total} 笔 · 佣金 ¥${fenToYuan(c)} + 配送费 ¥${fenToYuan(dFee)}`;
});

async function load() {
  if (loading.value) return;
  guest.value = false;
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    income.value = await api.nightIncome();
    if (!month.value) month.value = nowMonth();
  } catch (e) {
    if (isBindRequired(e)) guest.value = true;
    else if (isRetryable(e)) error.value = true;
  } finally {
    loading.value = false;
  }
}
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});

/** 月份切换（picker fields=month）：接口暂不支持按月，历史月显示占位 */
function onMonthChange(e: { detail: { value: string } }) {
  month.value = e.detail.value;
}

/* ---------- 流水按单合并（沿用既有：佣金/配送费分列文案合一行；退款冲回独立橙红） ---------- */
interface RecordRow {
  status: string;
  key: string;
  orderNo: string;
  time: string;
  /** 佣金（可为负=冲回） */
  commission: number | null;
  /** 配送费 */
  deliveryFee: number | null;
  /** 合计金额 */
  total: number;
  /** 退款冲回行（橙红展示） */
  refund: boolean;
}
const records = computed<RecordRow[]>(() => {
  const items = income.value?.items ?? [];
  const map = new Map<string, RecordRow>();
  for (const r of items) {
    // 退款冲回（负数流水）独立成行，不与正常收入合并
    if (r.amount < 0) {
      map.set(`refund-${r.id}`, {
        status: r.status,
        key: `refund-${r.id}`,
        orderNo: r.orderNo || "—",
        time: r.createdAt,
        commission: r.type === "commission" ? r.amount : null,
        deliveryFee: r.type === "deliveryFee" ? r.amount : null,
        total: r.amount,
        refund: true,
      });
      continue;
    }
    const recordKey = `${r.orderNo || r.id}-${r.status}`;
    const row = map.get(recordKey) ?? {
      status: r.status,
      key: recordKey,
      orderNo: r.orderNo || "—",
      time: r.createdAt,
      commission: null,
      deliveryFee: null,
      total: 0,
      refund: false,
    };
    if (r.type === "deliveryFee") row.deliveryFee = r.amount;
    else row.commission = r.amount;
    row.total += r.amount;
    // 行时间取该单最新一笔
    if (new Date(r.createdAt).getTime() > new Date(row.time).getTime())
      row.time = r.createdAt;
    map.set(row.key, row);
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
  );
});
/** 副行文案：佣金 ¥X + 配送费 ¥Y（缺失类型不显示该段） */
function rowSub(r: RecordRow): string {
  const parts: string[] = [];
  if (r.commission != null)
    parts.push(
      r.commission < 0
        ? `佣金冲回 ¥${fenToYuan(-r.commission)}`
        : `佣金 ¥${fenToYuan(r.commission)}`,
    );
  if (r.deliveryFee != null) parts.push(`配送费 ¥${fenToYuan(r.deliveryFee)}`);
  const status = ({ estimated: '预计收入', pending: '待结算', settled: '已结算', reversed: '已冲销' } as Record<string, string>)[r.status] || r.status;
  return `${status} · ${formatShort(r.time)} · ${parts.join(" + ") || "—"}`;
}
/** 金额行：退款负数橙红 */
function amountLine(r: RecordRow): string {
  return `${r.total < 0 ? "-" : "+"}¥${fenToYuan(Math.abs(r.total))}`;
}

onShow(() => {
  nightTabGuard();
  load();
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
    ><!-- 加载骨架（白天 income-skeleton 同构，深色） -->
<view class="income-skeleton__hero" /><view
      class="income-skeleton__break"
    /><view v-for="n in 3" :key="n" class="income-skeleton__record" />
  </view>
  <view v-else-if="guest" class="page income-page">
    <view class="retry card" role="button" @tap="load">
      <text class="retry__title">员工专用 · 夜宵收入</text>
      <text class="retry__sub">楼长登录后可查看夜宵收入，点击登录</text>
    </view>
  </view>
  <view v-else-if="income" class="page income-page"
    ><!-- income-hero（白天同构）：NIGHT INCOME kicker / 月份 picker /
        大金额（夜宵待结算口径，金黄）/ 近 7 日柱状（夜宵流水聚合） -->
    <view class="income-hero"
      ><view class="income-hero__top"
        ><view
          ><text class="kicker">NIGHT INCOME</text
          ><text class="label">{{
            isCurrent ? "本月夜宵收入 · 待结算" : "该月夜宵收入"
          }}</text></view
        ><!-- 月份切换（白天 picker 同构）：接口暂不支持按月，历史月占位 -->
<picker
          class="month-picker"
          mode="date"
          fields="month"
          :value="month"
          aria-label="选择收入月份"
          @change="onMonthChange"
          ><view class="bill-tag">
            <text class="bill-tag__month">{{ month }}</text>
            <view class="bill-tag__chevron" aria-hidden="true"></view>
          </view></picker
        ></view
      ><text class="amount"><small>¥</small>{{ isCurrent ? fenToYuan(pendingAmount) : "--" }}</text
      ><view class="trend"
        ><!-- 柱状由近 7 天夜宵流水驱动，非当月视图不画（画了必错） -->
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
              ? weekLine
              : "近 7 日暂无夜宵流水"
            : "该月暂不可查（明细接口按累计口径，历史月份待后端支持）"
        }}</text></view
      ></view
    ><!-- breakdown 明细卡（白天三列同构）：佣金/配送费分列，退款冲回橙红 -->
    <view class="breakdown card"
      ><view
        ><text>佣金</text
        ><strong>¥{{ fenToYuan(income.summary.commission.pending) }}</strong></view
      ><view
        ><text>配送费</text
        ><strong>¥{{ fenToYuan(income.summary.deliveryFee.pending) }}</strong></view
      ><view
        ><text>退款冲回</text
        ><strong class="breakdown__neg"
          >¥{{ fenToYuan(refundTotal) }}</strong
        ></view
      ></view
    ><view class="section-title"
      ><view
        ><text class="kicker green">DETAILS</text
        ><text class="section-title__main">夜宵流水</text></view
      ><!-- 流水笔数：按单合并后的行数（接口全量返回 items） -->
<text class="section-title__sub"
        >共 {{ records.length }} 笔</text
      ></view
    ><!-- records 流水列表（白天 record 同骨架）：按单合并一行，
        退款负数冲回橙红独立行 -->
    <view class="records card"
      ><view v-for="r in records" :key="r.key" class="record"
        ><view class="record__icon" :class="{ 'record__icon--neg': r.refund }"></view
        ><view class="record__content"
          ><text class="record__title">{{ r.refund ? `退款冲回 ${r.orderNo}` : `订单 ${r.orderNo}` }}</text
          ><text class="muted"
            >{{ rowSub(r) }}</text
          ></view
        ><text class="money" :class="{ 'money--neg': r.refund }">{{
          amountLine(r)
        }}</text></view
      ><view v-if="!records.length" class="records__empty"
        >还没有佣金流水，接单送达后自动入账</view
      ><view v-if="!isCurrent" class="records__empty records__empty--note"
        >历史月份明细待接口支持，以上为累计口径流水</view
      ></view
    ></view
  >
  <!-- 夜宵自绘 TabBar（error/loading/guest 态也常驻，模式锚点） -->
  <NightTabBar active="income" />
</template>

<style scoped lang="scss">
@import "../../styles/night.scss";
/* 夜宵收入：白天 income-page 布局复用全局 .page，页内覆盖深色 */
.income-page {
  @include nb-page;
  padding-bottom: calc(170rpx + env(safe-area-inset-bottom, 0px));
}
.income-page .card {
  @include nb-card;
}
.income-page .muted {
  color: $nb-text-sub;
}
/* income-hero（白天同构）：暗绿描边渐变 */
.income-hero {
  @include nb-hero;
  position: relative;
  overflow: hidden;
  padding: 36rpx;
  border-radius: 38rpx;
}
.income-hero:after {
  content: "";
  position: absolute;
  width: 230rpx;
  height: 230rpx;
  border-radius: 50%;
  right: -80rpx;
  bottom: -110rpx;
  @include nb-halo;
}
.income-hero:before {
  content: "";
  position: absolute;
  right: -60rpx;
  bottom: -100rpx;
  width: 350rpx;
  height: 230rpx;
  border: 1px solid rgba(223, 228, 162, 0.14);
  border-radius: 50%;
  transform: rotate(-32deg);
  pointer-events: none;
}
.income-hero text {
  display: block;
}
.income-hero__top {
  display: flex;
  justify-content: space-between;
}
.kicker {
  /* 白天同构：kicker 独占一行（DETAILS 在上、夜宵流水在下） */
  display: block;
  font-size: 20rpx;
  letter-spacing: 3rpx;
  color: $nb-success;
  font-weight: 900;
}
/* 主标题独立成行（同白天写法） */
.section-title__main {
  display: block;
}
.label {
  font-size: 24rpx;
  margin-top: 8rpx;
  opacity: 0.78;
}
/* 点击区域保留 44px，视觉胶囊更轻；箭头独立成行内 flex 子项。 */
.month-picker {
  flex: none;
  display: flex;
  align-items: center;
  align-self: flex-start;
  min-height: 44px;
  cursor: pointer;
}
.bill-tag {
  min-height: 64rpx;
  padding: 10rpx 20rpx;
  gap: 16rpx;
  border: 1px solid rgba(210, 235, 171, 0.22);
  border-radius: 999rpx;
  background: rgba(210, 235, 171, 0.06);
  font-size: 22rpx;
  color: $nb-text-soft;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
.bill-tag__month {
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.bill-tag__chevron {
  flex: none;
  width: 10rpx;
  height: 10rpx;
  margin-top: -5rpx;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  border-radius: 1px;
  transform: rotate(45deg);
  opacity: 0.75;
}
.amount {
  display: block;
  font-size: 76rpx;
  line-height: 1.1;
  font-weight: 600;
  margin: 22rpx 0;
  color: $nb-gold;
  font-variant-numeric: tabular-nums;
}
.amount small {
  font-size: 32rpx;
  margin-right: 8rpx;
}
/* 近 7 日柱状（白天 trend 同构）：金黄柱 + 弱柱 */
.trend {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  font-size: 20rpx;
  opacity: 0.86;
}
.trend text {
  color: $nb-text-sub;
}
.trend__bars {
  height: 48rpx;
  display: flex;
  align-items: flex-end;
  gap: 12rpx;
  flex: none;
  margin-right: 20rpx;
}
.trend__bar {
  width: 12rpx;
  border-radius: 8rpx;
  background: $nb-gold;
}
.trend__bar--dim {
  opacity: 0.3;
}
/* breakdown 三列（白天同构）：佣金/配送费/退款冲回 */
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
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}
.breakdown text,
.breakdown strong {
  display: block;
}
.breakdown text {
  font-size: 20rpx;
  color: $nb-text-sub;
}
.breakdown strong {
  font-size: 26rpx;
  margin-top: 5rpx;
  font-variant-numeric: tabular-nums;
}
/* 退款冲回列：橙红弱化观感，零值灰化 */
.breakdown__neg {
  color: #fb923c;
}
/* section-title kicker 绿 → 夜宵金黄变体 */
.green {
  color: $nb-gold;
}
.income-page .section-title__sub {
  color: $nb-text-sub;
}
/* 错误/游客态（白天 retry 同构，深色） */
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
  color: $nb-text;
}
.retry__sub {
  font-size: 21rpx;
  color: $nb-text-sub;
  margin-top: 8rpx;
}
/* records 流水列表（白天同构：单卡、分隔线、图标格） */
.records {
  padding: 2rpx 24rpx;
}
.record {
  min-height: 110rpx;
  display: flex;
  align-items: center;
  gap: 18rpx;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.records > view:last-child {
  border-bottom: none;
}
.record__icon {
  width: 64rpx;
  height: 64rpx;
  border-radius: 19rpx;
  background: rgba(74, 222, 128, 0.1);
  display: grid;
  place-items: center;
  color: $nb-success;
  font-size: 30rpx;
  font-weight: 900;
}
.record__icon:before {
  content: "¥";
}
.records__empty {
  padding: 70rpx 0;
  text-align: center;
  color: $nb-text-sub;
  font-size: 24rpx;
}
.records__empty--note {
  padding-top: 0;
  font-size: 20rpx;
}
.record__content {
  flex: 1;
  min-width: 0;
}
.record text {
  display: block;
}
.record__title {
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.record .muted {
  font-size: 20rpx;
  margin-top: 5rpx;
}
.money {
  flex: none;
  color: $nb-success;
  font-size: 30rpx;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
/* 退款冲回（白天 money--neg 同构）：负向独立观感——橙红一眼区分 */
.money--neg {
  color: #fb923c;
}
/* 退款冲回行图标：橙红 */
.record__icon--neg {
  background: rgba(251, 146, 60, 0.12);
  color: #fb923c;
}
/* 骨架（白天 income-skeleton 同构，深色 shimmer） */
.income-skeleton__hero,
.income-skeleton__break,
.income-skeleton__record {
  border-radius: 38rpx;
  background: linear-gradient(90deg, #121a15, #1a241d, #121a15);
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
