<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { ApiError, isRetryable } from "../../api/request";
import { useSessionStore, isBindRequired } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import { formatShort } from "../../utils/datetime";
import { nightDepositTxnView, startDepositPay } from "../../utils/night";
import type {
  NightDepositDetail,
  NightDepositTiers,
} from "../../types";

/**
 * 经营押金页（IKSW1F）：余额 + 流水 + 缴纳。
 * 押金 = 进货额度基准（库存 × 夜宵售价 ≤ 押金）；首次 500 元，按 500 元档
 * 递增补缴。缴纳走 ND 支付单 + 微信收银台，到账以 pay-status 轮询/回调为准。
 */
const session = useSessionStore();
const data = ref<NightDepositDetail>();
const tiers = ref<NightDepositTiers>();
const selectedTier = ref(0);
const loading = ref(false);
const error = ref(false);
const guest = ref(false);
/** 缴纳动作进行中（防重复拉起收银台） */
const paying = ref(false);
/** 轮询超时仍未确认到账的单号：页面挂「确认到账」入口继续补查。
 *  storage 持久化（IKSZF5）——页面离开再回来确认条不消失 */
const checkingNo = ref("");
const CHECKING_KEY = "nightDepositCheckingNo";

const balance = computed(() => fenToYuan(data.value?.deposit ?? 0));
const nextTierLine = computed(() => {
  const d = data.value;
  if (!d) return "";
  return d.gapToNext > 0
    ? `再补 ${fenToYuan(d.gapToNext)} 元可升至 ${d.nextTier / 100} 元档`
    : `已达 ${d.nextTier / 100} 元档`;
});
/** 缴纳按钮文案：后端按 500 元档递增自动算差额（无自选金额入参） */
const payButtonLine = computed(() =>
  data.value && selectedTier.value > 0
    ? `缴纳 ¥${fenToYuan(selectedTier.value - data.value.deposit)} · 升至 ${selectedTier.value / 100} 元档`
    : "缴纳押金",
);

async function load() {
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    const [d, t] = await Promise.all([
      api.nightDeposit(),
      api.nightDepositTiers().catch(() => undefined),
    ]);
    data.value = d;
    tiers.value = t;
    if (!t?.tiers.some((row) => row.tier === selectedTier.value)) selectedTier.value = d.nextTier;
    // 未确认到账的单号从 storage 恢复（支付后离开页面再回来仍显示确认条）
    checkingNo.value = (uni.getStorageSync(CHECKING_KEY) as string) || "";
  } catch (e) {
    if (isBindRequired(e)) guest.value = true;
    else if (isRetryable(e)) error.value = true;
  } finally {
    loading.value = false;
  }
}
onShow(load);

async function pay() {
  if (paying.value) return;
  if (checkingNo.value) { await confirmArrival(); return; }
  paying.value = true;
  try {
    const { outcome, outTradeNo } = await startDepositPay(selectedTier.value, (tradeNo) => {
      checkingNo.value = tradeNo;
      uni.setStorageSync(CHECKING_KEY, tradeNo);
    });
    if (outcome === "paid") {
      clearChecking(outTradeNo);
      uni.showToast({ title: "押金已到账", icon: "success" });
      load();
    } else if (outcome === "checking") {
      // 轮询超时回调未落：单号持久化，页面挂确认入口，不留死路
      checkingNo.value = outTradeNo;
      uni.setStorageSync(CHECKING_KEY, outTradeNo);
      uni.showToast({
        title: "支付结果确认中，可稍后点「确认到账」",
        icon: "none",
      });
    } else {
      // 收银台取消：若该单实际已扣款则保留确认入口，否则清掉
      const s = await api
        .nightDepositPayStatus(outTradeNo)
        .catch(() => null);
      if (s && s.status === "paid") {
        clearChecking(outTradeNo);
        uni.showToast({ title: "押金已到账", icon: "success" });
        load();
      } else if (s) {
        clearChecking(outTradeNo);
        uni.showToast({ title: "未完成支付，可随时再次缴纳", icon: "none" });
      }
    }
  } catch {
    // 发起/查单失败：request 层已 toast（商户未配置等业务原因原文透出）
  } finally {
    paying.value = false;
  }
}

/** 确认到账（或确认未支付）后清掉持久化的单号与确认条 */
function clearChecking(outTradeNo: string) {
  if (checkingNo.value === outTradeNo) {
    checkingNo.value = "";
    uni.removeStorageSync(CHECKING_KEY);
  }
}

/** 轮询超时后的手动补查：服务端主动查微信单，落账即刷新余额 */
async function confirmArrival() {
  if (!checkingNo.value) return;
  try {
    const s = await api.nightDepositPayStatus(checkingNo.value);
    if (s.status === "paid") {
      clearChecking(checkingNo.value);
      uni.showToast({ title: "押金已到账", icon: "success" });
      load();
    } else {
      uni.showToast({ title: "仍未确认到账，请稍后再试", icon: "none" });
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) clearChecking(checkingNo.value);
  }
}

function txnView(type: string) {
  return nightDepositTxnView(type);
}
</script>

<template>
  <view class="page deposit-page">
    <view v-if="error" class="retry card" role="button" @tap="load"
      ><text class="retry__title">加载失败</text
      ><text class="retry__sub">网络异常或服务暂不可用，点击重试</text></view
    >
    <view v-else-if="loading" class="deposit-skeleton"
      ><view class="deposit-skeleton__hero" /><view
        v-for="n in 4"
        :key="n"
        class="deposit-skeleton__row"
    /></view>
    <view v-else-if="guest" class="retry card" role="button" @tap="load">
      <text class="retry__title">员工专用 · 经营押金</text>
      <text class="retry__sub">楼长登录后可查看与缴纳押金，点击登录</text>
    </view>

    <template v-else-if="data">
      <view class="hero">
        <view class="hero__glow"></view>
        <text class="hero__kicker">DEPOSIT</text>
        <text class="hero__label">押金余额（进货额度基准）</text>
        <text class="hero__amount"><small>¥</small>{{ balance }}</text>
        <text class="hero__hint">{{ nextTierLine }}</text>
      </view>

      <!-- 轮询超时未确认到账：保留确认入口（查单兜底），不留死路 -->
      <view
        v-if="checkingNo"
        class="checking card"
        role="button"
        @tap="confirmArrival"
        ><text class="checking__text">上一笔押金支付确认中</text
        ><text class="checking__act">确认到账</text></view
      >

      <view v-if="tiers" class="tiers card">
        <text class="tiers__head">押金档位（500 元档递增）</text>
        <view
          v-for="(t, i) in tiers.tiers"
          :key="t.tier"
          class="tier"
          :class="{ 'tier--next': selectedTier === t.tier }"
          role="radio" :aria-checked="selectedTier === t.tier"
          @tap="!paying && !checkingNo && (selectedTier = t.tier)"
          ><view
            ><text class="tier__name">{{ t.tier / 100 }} 元档</text
            ><text class="tier__gap">需补缴 {{ fenToYuan(t.gap) }} 元</text></view
          ><text v-if="selectedTier === t.tier" class="tier__flag"
            >已选择</text
          ></view
        >
        <text class="tiers__note"
          >押金即进货额度：本店库存货值不超过押金余额即可免费备货；押金可在退店时申请退还。</text
        >
      </view>

      <button
        v-if="data.gapToNext > 0"
        class="pay-btn"
        :disabled="paying"
        @tap="pay"
      >
        {{ paying ? "支付处理中…" : checkingNo ? '查询上一笔支付结果' : payButtonLine }}
      </button>
      <text v-else class="pay-full"
        >押金已足额，无需缴纳；备货额度以当前余额为基准。</text
      >

      <view class="section-title"
        ><view
          ><text class="section-kicker">RECORDS</text
          ><text class="section-title__main">押金流水</text></view
        ><text class="section-title__sub"
          >共 {{ data.txns.length }} 笔</text
        ></view
      >
      <view class="records card">
        <view v-for="t in data.txns" :key="t.id" class="record"
          ><view class="record__icon" :class="{ 'record__icon--neg': txnView(t.type).negative }"></view
          ><view class="record__content"
            ><text class="record__title">{{ txnView(t.type).label }}</text
            ><text class="muted"
              >{{ t.payOrderNo || t.remark || "—" }} · {{
                formatShort(t.createdAt)
              }}</text
            ></view
          ><text class="money" :class="{ 'money--neg': txnView(t.type).negative }"
            >{{ txnView(t.type).negative ? "-" : "+" }}¥{{ fenToYuan(t.amount) }}</text
          ></view
        >
        <view v-if="!data.txns.length" class="records__empty"
          >还没有押金流水，缴纳后在这里留痕</view
        >
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
@import "../../styles/theme.scss";
.deposit-page {
  background:
    radial-gradient(circle at 90% 7%, rgba(185, 242, 39, 0.18), transparent 24%),
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
  /* 夜宵店头统一渐变（IKSZF5）：135deg 深绿→夜绿，金光 glow */
  background: linear-gradient(135deg, $night-deep, $night-green);
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
.hero__hint {
  display: block;
  position: relative;
}
.hero__kicker {
  font-size: 20rpx;
  letter-spacing: 3rpx;
  color: $gold;
  font-weight: 900;
}
.hero__label {
  font-size: 24rpx;
  margin-top: 10rpx;
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
.hero__hint {
  font-size: 21rpx;
  opacity: 0.72;
}
.checking {
  display: flex;
  align-items: center;
  gap: 14rpx;
  min-height: 88rpx;
  margin-top: 22rpx;
  padding: 14rpx 24rpx;
  border-radius: 22rpx;
  background: $warning;
}
.checking__text {
  flex: 1;
  font-size: 23rpx;
  color: #7a4a12;
  font-weight: 700;
}
.checking__act {
  padding: 12rpx 26rpx;
  border-radius: 999rpx;
  background: $accent;
  color: #fff;
  font-size: 22rpx;
  font-weight: 800;
}
.tiers {
  margin-top: 22rpx;
  padding: 28rpx 30rpx;
}
.tiers__head {
  display: block;
  font-size: 27rpx;
  font-weight: 900;
  color: $ink;
}
.tier {
  display: flex;
  align-items: center;
  min-height: 92rpx;
  border-bottom: 2rpx solid $line;
}
.tier:last-of-type {
  border-bottom: none;
}
.tier__name,
.tier__gap {
  display: block;
}
.tier__name {
  font-size: 26rpx;
  font-weight: 800;
  color: $ink;
}
.tier__gap {
  font-size: 20rpx;
  color: $muted;
  margin-top: 4rpx;
}
.tier__flag {
  margin-left: auto;
  padding: 4rpx 18rpx;
  border-radius: 999rpx;
  background: $soft;
  color: $primary-dark;
  font-size: 20rpx;
  font-weight: 800;
}
.tiers__note {
  display: block;
  margin-top: 16rpx;
  font-size: 20rpx;
  line-height: 1.6;
  color: $muted;
}
.pay-btn {
  width: 100%;
  min-height: 96rpx;
  margin-top: 26rpx;
  border-radius: 999rpx;
  background: $primary-dark;
  color: $lime;
  font-size: 30rpx;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pay-btn[disabled] {
  opacity: 0.6;
}
.pay-full {
  display: block;
  margin-top: 26rpx;
  text-align: center;
  font-size: 22rpx;
  color: $muted;
}
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
  margin-top: 36rpx;
}
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
.deposit-skeleton__hero,
.deposit-skeleton__row {
  border-radius: 38rpx;
  background: linear-gradient(90deg, #edf2ed, #fff, #edf2ed);
  animation: deposit-pulse 1.2s infinite;
}
.deposit-skeleton__hero {
  height: 300rpx;
}
.deposit-skeleton__row {
  height: 102rpx;
  margin-top: 16rpx;
  border-radius: 28rpx;
}
@keyframes deposit-pulse {
  50% {
    opacity: 0.55;
  }
}
</style>
