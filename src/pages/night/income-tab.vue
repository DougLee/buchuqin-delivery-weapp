<script setup lang="ts">
import { computed, ref } from "vue";
import { onPullDownRefresh, onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { useSessionStore, isBindRequired } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import { formatShort } from "../../utils/datetime";
import { nightTabGuard } from "../../utils/nightMode";
import NightTabBar from "../../components/NightTabBar.vue";
import type { NightIncome } from "../../types";

/**
 * 夜宵收入（夜宵模式第三 tab）——白天收入页（pages/income/index.vue）逐块复刻，
 * 数据换源 nightApi、深色主题取 night.scss token：
 * income-hero（NIGHT INCOME kicker/月份 picker/大金额待结算口径金黄/近 7 日柱状）→
 * breakdown 三列明细卡（佣金/配送费/退款冲回橙红）→ section-title（DETAILS/
 * 夜宵流水/共 N 笔）→ records 流水列表（record 同骨架，按单合并佣金+配送费）→
 * 同款空态。接口按营业日归属月份、收入状态分页，汇总和趋势使用全月账本。
 * 大金额展示本月「待结算」佣金与配送费的 pending 桶合计。
 */
const session = useSessionStore();
const income = ref<NightIncome>();
const loading = ref(false);
const error = ref(false);
const guest = ref(false);
/** 按场次营业日归属月份，数据与分页明细分开汇总。 */
const month = ref("");
const statusFilter = ref("all");
const moreLoading = ref(false);
let generation = 0;
const nowMonth = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7);
const isCurrent = computed(() => !month.value || month.value === (income.value?.businessDate?.slice(0, 7) || nowMonth()));
/** 大金额：待结算口径（pending 桶两列合计） */
const pendingAmount = computed(() => {
  const s = income.value?.summary;
  if (!s) return 0;
  return s.commission.pending + s.deliveryFee.pending;
});
const refundTotal = computed(() => income.value?.refundTotal ?? 0);
const settledAmount = computed(() => (income.value?.summary.commission.settled ?? 0) + (income.value?.summary.deliveryFee.settled ?? 0));
const estimatedAmount = computed(() => (income.value?.summary.commission.estimated ?? 0) + (income.value?.summary.deliveryFee.estimated ?? 0));
const confirmedCommission = computed(() => (income.value?.summary.commission.pending ?? 0) + (income.value?.summary.commission.settled ?? 0));
const confirmedDeliveryFee = computed(() => (income.value?.summary.deliveryFee.pending ?? 0) + (income.value?.summary.deliveryFee.settled ?? 0));
/** 全月聚合日序列，不从当前已加载20条流水推算趋势。 */
const week = computed(() => {
  const selected = month.value || income.value?.month || nowMonth();
  const today = income.value?.businessDate || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const endpoint = isCurrent.value ? Number(today.slice(8, 10)) : new Date(Date.UTC(Number(selected.slice(0, 4)), Number(selected.slice(5, 7)), 0)).getUTCDate();
  const days = [];
  for (let n = Math.max(1, endpoint - 6); n <= endpoint; n++) {
    const day = selected + '-' + String(n).padStart(2, '0');
    const value = income.value?.days?.find(d => d.day === day);
    days.push({ label: day.slice(5), count: value?.orderCount ?? 0, commission: value?.commission ?? 0, deliveryFee: value?.deliveryFee ?? 0, height: 4 });
  }
  const max = Math.max(1, ...days.map(d => Math.abs(d.commission + d.deliveryFee)));
  for (const d of days) d.height = d.count ? Math.max(8, Math.round(Math.abs(d.commission + d.deliveryFee) / max * 44)) : 4;
  return { days, total: days.reduce((sum, d) => sum + d.count, 0) };
});
const weekLine = computed(() => (isCurrent.value ? '本月' : '所选月份') + '近7日 · 佣金 ¥' + fenToYuan(week.value.days.reduce((n,d) => n+d.commission,0)) + ' + 配送费 ¥' + fenToYuan(week.value.days.reduce((n,d) => n+d.deliveryFee,0)));

async function load(append = false) {
  if (append && (loading.value || moreLoading.value || !income.value)) return;
  const current = ++generation;
  if (append) moreLoading.value = true; else loading.value = true;
  guest.value = false; error.value = false;
  try {
    await session.ensure();
    const result = await api.nightIncome(month.value || undefined, statusFilter.value, append ? (income.value?.page ?? 0) + 1 : 1);
    if (current !== generation) return;
    if (append && income.value) result.items = [...income.value.items, ...result.items.filter(item => !income.value!.items.some(old => old.id === item.id))];
    income.value = result;
    month.value = result.month;
  } catch (e) {
    if (current !== generation) return;
    if (isBindRequired(e)) guest.value = true;
    else if (!append) error.value = true;
  } finally { if (current === generation) { loading.value = false; moreLoading.value = false; } }
}
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh(); });
function onMonthChange(e: { detail: { value: string } }) { month.value = e.detail.value; void load(); }
function changeStatus(value: string) { statusFilter.value = value; void load(); }

/* ---------- 账本逐笔展示，佣金与配送费分列，退款冲回单独留痕 ---------- */
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
const records = computed<RecordRow[]>(() => (income.value?.items ?? []).map(r => ({
  status: r.status, key: r.id, orderNo: r.orderNo || "—", time: r.createdAt,
  commission: r.type === 'commission' ? r.amount : null,
  deliveryFee: r.type === 'deliveryFee' ? r.amount : null,
  total: r.amount, refund: r.amount < 0,
})));
/** 副行文案：佣金 ¥X + 配送费 ¥Y（缺失类型不显示该段） */
function rowSub(r: RecordRow): string {
  const parts: string[] = [];
  if (r.commission != null)
    parts.push(
      r.commission < 0
        ? `佣金冲回 ¥${fenToYuan(-r.commission)}`
        : `佣金 ¥${fenToYuan(r.commission)}`,
    );
  if (r.deliveryFee != null) parts.push(r.deliveryFee < 0 ? `配送费冲回 ¥${fenToYuan(-r.deliveryFee)}` : `配送费 ¥${fenToYuan(r.deliveryFee)}`);
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
    ><view class="retry card" role="button" @tap="load()"
      ><text class="retry__title">加载失败</text
      ><text class="retry__sub">网络异常或服务暂不可用，点击重试</text></view
    ></view
  >
  <view v-else-if="loading && !income" class="page income-page"
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
            isCurrent ? "夜宵收入 · 本月待结算" : "夜宵收入 · 所选月待结算"
          }}</text></view
        ><!-- 按营业日归属月份查询 -->
<picker
          class="month-picker"
          mode="date"
          fields="month"
          :value="month"
          :end="nowMonth()"
          aria-label="选择收入月份"
          @change="onMonthChange"
          ><view class="bill-tag">
            <text class="bill-tag__month">{{ month }}</text>
            <view class="bill-tag__chevron" aria-hidden="true"></view>
          </view></picker
        ></view
      ><text class="amount"><small>¥</small>{{ fenToYuan(pendingAmount) }}</text
      ><view class="trend"
        ><!-- 柱状按所选月份的完整日汇总绘制，不依赖分页 -->
<view class="trend__bars"
          ><view
            v-for="d in week.days"
            :key="d.label"
            class="trend__bar"
            :class="{ 'trend__bar--dim': !d.count }"
            :style="{ height: d.height + 'px' }"
          ></view></view
        ><text>{{ week.total ? weekLine : "所选月份近7日暂无确认收入" }}</text></view
      ></view
    ><!-- breakdown 明细卡（白天三列同构）：佣金/配送费分列，退款冲回橙红 -->
    <view class="breakdown card"
      ><view
        ><text>确认佣金</text
        ><strong>¥{{ fenToYuan(confirmedCommission) }}</strong></view
      ><view
        ><text>确认配送费</text
        ><strong>¥{{ fenToYuan(confirmedDeliveryFee) }}</strong></view
      ><view
        ><text>冲销调整</text
        ><strong class="breakdown__neg"
          >{{ refundTotal < 0 ? '-¥' : '¥' }}{{ fenToYuan(Math.abs(refundTotal)) }}</strong
        ></view
      ></view
    >
    <view class="income-buckets"><text>已结算 ¥{{ fenToYuan(settledAmount) }}</text><text>预计 ¥{{ fenToYuan(estimatedAmount) }}</text></view>
    <text class="income-note">按营业日归属月份。预计收入在订单完成且无进行中售后后转待结算；跨期冲回计入调整月份。</text>
    <view class="income-filters"><button v-for="option in [{ key: 'all', label: '全部' }, { key: 'pending', label: '待结算' }, { key: 'settled', label: '已结算' }, { key: 'estimated', label: '预计' }]" :key="option.key" :class="{ active: statusFilter === option.key }" @tap="changeStatus(option.key)">{{ option.label }}</button></view>
    <text v-if="loading" class="income-note">正在加载所选月份与状态…</text>
    <view class="section-title"
      ><view
        ><text class="kicker green">DETAILS</text
        ><text class="section-title__main">夜宵流水</text></view
      ><!-- 全部符合筛选的流水数，独立于当前分页 -->
<text class="section-title__sub"
        >{{ loading ? '正在核对流水…' : `共 ${income.total} 条流水` }}</text
      ></view
    ><!-- 逐笔流水，退款负数冲回单独显示 -->
    <view class="records card" :style="loading ? 'opacity: .5' : ''"
      ><view v-for="r in records" :key="r.key" class="record"
        ><view class="record__icon" :class="{ 'record__icon--neg': r.refund }"></view
        ><view class="record__content"
          ><text class="record__title">{{ r.refund ? `冲销调整 ${r.orderNo}` : `${r.commission != null ? "商品佣金" : "配送费"} ${r.orderNo}` }}</text
          ><text class="muted"
            >{{ rowSub(r) }}</text
          ></view
        ><text class="money" :class="{ 'money--neg': r.refund }">{{
          amountLine(r)
        }}</text></view
      ><view v-if="!records.length" class="records__empty">所选月份和状态暂无流水</view>
    </view>
    <button v-if="income.items.length < income.total" class="load-more" :disabled="loading || moreLoading" @tap="load(true)">{{ moreLoading ? '加载中…' : '加载更多流水' }}</button>
  </view>
  <!-- 夜宵自绘 TabBar（error/loading/guest 态也常驻，模式锚点） -->
  <NightTabBar active="income" />
</template>

<style scoped lang="scss">
@import "../../styles/night.scss";
.income-buckets { display: flex; justify-content: space-between; gap: 16rpx; margin: 20rpx 8rpx; color: #d5e4c7; font-size: 25rpx; }
.income-note { display: block; color: #a6b9a7; font-size: 22rpx; line-height: 1.7; margin: 12rpx 8rpx 24rpx; }
.income-filters { display: flex; gap: 12rpx; margin: 22rpx 0; }
.income-filters button, .load-more { flex: 1; min-height: 44px; margin: 0; padding: 0 16rpx; display: flex; align-items: center; justify-content: center; background: #19352a; color: #bcd0bc; border: 1px solid #365643; border-radius: 22rpx; font-size: 25rpx; line-height: 1.2; }
.income-filters button.active { background: #e7d99a; color: #213b2b; border-color: #e7d99a; font-weight: 750; }
.load-more { width: 100%; margin: 24rpx 0; }
.income-filters button::after, .load-more::after { border: none; }
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
  height: 48px;
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
