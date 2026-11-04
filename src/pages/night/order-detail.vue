<script setup lang="ts">
import { ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { isRetryable } from "../../api/request";
import { useSessionStore, isBindRequired } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import { formatShort } from "../../utils/datetime";
import {
  nightCommissionStatusText,
  nightCommissionTypeText,
} from "../../utils/night";
import type { NightOrder, NightOrderEarning } from "../../types";

/**
 * 夜宵订单详情（IKSW1F 楼长端）：商品快照 / 地址（可拨号）/ 金额 / 时间线；
 * 接单、送达两个动作；单单佣金明细（券后基数 × 比例 = 商品佣金，配送费全额）。
 */
const session = useSessionStore();
const orderId = ref("");
const order = ref<NightOrder>();
const earning = ref<NightOrderEarning>();
const loading = ref(false);
const error = ref(false);
const guest = ref(false);
/** 动作防重 */
const acting = ref(false);

async function load() {
  if (!orderId.value) return;
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    order.value = await api.nightOrder(orderId.value);
    // 佣金明细拉失败不拦详情（未支付单无流水时后端也照算试算口径）
    earning.value = await api.nightOrderEarning(orderId.value).catch(() => undefined);
  } catch (e) {
    if (isBindRequired(e)) guest.value = true;
    else if (isRetryable(e)) error.value = true;
  } finally {
    loading.value = false;
  }
}
onLoad((q) => {
  const id = (q as { id?: string } | undefined)?.id ?? "";
  orderId.value = id;
});
onShow(load);

async function act(kind: "accept" | "deliver") {
  if (acting.value || !order.value) return;
  acting.value = true;
  try {
    if (kind === "accept") await api.nightAccept(order.value.id);
    else await api.nightDeliver(order.value.id);
    uni.showToast({
      title: kind === "accept" ? "已接单" : "已送达",
      icon: "success",
    });
  } finally {
    acting.value = false;
    // 成功/失败都重拉纠偏（状态已变时按钮随状态消失）
    load().catch(() => {});
  }
}

function dial(phone: string) {
  if (!phone) return;
  uni.makePhoneCall({ phoneNumber: phone, fail: () => {} });
}
/** 佣金比例（万分比 → 百分比，1 位小数去尾零） */
function rateText(rate: number | null | undefined): string {
  if (rate == null) return "";
  const pct = (rate / 100).toFixed(1).replace(/\.0$/, "");
  return `券后金额 × ${pct}%`;
}
</script>

<template>
  <view class="page detail-page">
    <view v-if="error" class="retry card" role="button" @tap="load"
      ><text class="retry__title">加载失败</text
      ><text class="retry__sub">网络异常或服务暂不可用，点击重试</text></view
    >
    <view v-else-if="loading" class="detail-skeleton"
      ><view class="detail-skeleton__hero" /><view
        v-for="n in 3"
        :key="n"
        class="detail-skeleton__block"
    /></view>
    <view v-else-if="guest" class="retry card" role="button" @tap="load">
      <text class="retry__title">员工专用 · 夜宵订单详情</text>
      <text class="retry__sub">楼长登录后可查看，点击登录</text>
    </view>

    <template v-else-if="order">
      <!-- 状态头 -->
      <view class="hero">
        <view class="hero__glow"></view>
        <view class="hero__top"
          ><text class="hero__status">{{ order.statusText }}</text
          ><text
            v-if="order.afterSaleStatus === 'requested'"
            class="hero__as"
            >售后处理中</text
          ></view
        >
        <text class="hero__no">单号 {{ order.orderNo }}</text>
        <text class="hero__time">下单 {{ formatShort(order.createdAt) }}</text>
        <text v-if="order.cancelReason" class="hero__cancel"
          >{{ order.statusText }}：{{ order.cancelReason }}</text
        >
      </view>

      <!-- 商品快照（改价不追溯，以下单时为准） -->
      <view class="card block">
        <text class="block__head">商品快照</text>
        <view v-for="(i, idx) in order.items" :key="idx" class="goods"
          ><text class="goods__name">{{ i.name }}</text
          ><text class="goods__qty">×{{ i.quantity }}</text
          ><text class="goods__amount">¥{{ fenToYuan(i.price * i.quantity) }}</text></view
        >
        <view v-if="order.couponDiscount > 0" class="coupon"
          ><text class="coupon__name"
            >夜宵券{{ order.couponSnapshot?.name ? ` · ${order.couponSnapshot.name}` : "" }}</text
          ><text class="coupon__cut">-¥{{ fenToYuan(order.couponDiscount) }}</text></view
        >
        <view class="amounts">
          <view class="amount"
            ><text>商品金额</text><text>¥{{ fenToYuan(order.productAmount) }}</text></view
          >
          <view class="amount"
            ><text>券优惠</text><text>-¥{{ fenToYuan(order.couponDiscount) }}</text></view
          >
          <view class="amount"
            ><text>配送费</text><text>¥{{ fenToYuan(order.deliveryFee) }}</text></view
          >
          <view class="amount amount--sum"
            ><text>实付</text><text>¥{{ fenToYuan(order.payableAmount) }}</text></view
          >
        </view>
        <text v-if="order.remark" class="remark">备注：{{ order.remark }}</text>
      </view>

      <!-- 地址（仅本楼配送；点击拨号） -->
      <view class="card block">
        <text class="block__head">配送地址</text>
        <view class="addr" role="button" @tap="dial(order.address.phone)">
          <view class="addr__main"
            ><text class="addr__room"
              >{{ order.address.buildingName }} · {{ order.address.room }}</text
            ><text class="addr__contact"
              >{{ order.address.contactName }}　{{ order.address.phone }}</text
            ></view
          >
          <text class="addr__act">拨打</text>
        </view>
      </view>

      <!-- 佣金明细（单单两条：商品佣金 + 配送费） -->
      <view v-if="earning" class="card block">
        <text class="block__head">本单所得（佣金试算）</text>
        <view class="earn"
          ><view
            ><text class="earn__label">商品佣金</text
            ><text v-if="earning.commissionRate" class="earn__formula"
              >{{ rateText(earning.commissionRate) }}（基数 ¥{{
                fenToYuan(earning.commissionBase)
              }}）</text
            ></view
          ><text class="earn__amount">¥{{ fenToYuan(earning.commission) }}</text></view
        >
        <view class="earn"
          ><view
            ><text class="earn__label">配送费收入</text
            ><text class="earn__formula">夜间配送费全额归楼长</text></view
          ><text class="earn__amount">¥{{ fenToYuan(earning.deliveryFee) }}</text></view
        >
        <view class="earn earn--sum"
          ><text class="earn__label">本单合计</text
          ><text class="earn__amount">¥{{ fenToYuan(earning.total) }}</text></view
        >
        <text class="earn__note"
          >佣金按「券后商品实收 × 比例」计；退款会重算，配送费退款会冲回。</text
        >
      </view>

      <!-- 时间线 -->
      <view v-if="order.timeline.length" class="card block">
        <text class="block__head">订单进度</text>
        <view v-for="(t, idx) in order.timeline" :key="idx" class="tl"
          ><view
            class="tl__dot"
            :class="{ 'tl__dot--done': t.done }"
          ></view
          ><view class="tl__main"
            ><text class="tl__title" :class="{ 'tl__title--dim': !t.done }">{{
              t.title
            }}</text
            ><text v-if="t.time" class="tl__time">{{ formatShort(t.time) }}</text
            ></view
          ></view
        >
      </view>

      <!-- 动作区：接单 / 送达 -->
      <view class="actions">
        <button
          v-if="order.status === 'pending-accept'"
          class="act-btn act-btn--primary"
          :disabled="acting"
          @tap="act('accept')"
        >
          {{ acting ? "处理中…" : "接 单" }}
        </button>
        <button
          v-else-if="order.status === 'delivering'"
          class="act-btn act-btn--primary"
          :disabled="acting"
          @tap="act('deliver')"
        >
          {{ acting ? "处理中…" : "确认送达" }}
        </button>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
@import "../../styles/theme.scss";
.detail-page {
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
  top: -110rpx;
  background: rgba(185, 242, 39, 0.12);
}
.hero__status,
.hero__no,
.hero__time,
.hero__cancel {
  display: block;
  position: relative;
}
.hero__top {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.hero__status {
  font-size: 40rpx;
  font-weight: 900;
}
.hero__as {
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  background: rgba(255, 138, 52, 0.9);
  color: #fff;
  font-size: 20rpx;
  font-weight: 800;
}
.hero__no {
  margin-top: 16rpx;
  font-size: 22rpx;
  opacity: 0.72;
}
.hero__time {
  margin-top: 6rpx;
  font-size: 21rpx;
  opacity: 0.6;
}
.hero__cancel {
  margin-top: 12rpx;
  font-size: 21rpx;
  color: #ffd9d3;
}
.block {
  padding: 28rpx;
  margin-top: 22rpx;
}
.block__head {
  display: block;
  font-size: 27rpx;
  font-weight: 900;
  color: $ink;
  margin-bottom: 18rpx;
}
.goods {
  display: flex;
  align-items: center;
  min-height: 64rpx;
}
.goods__name {
  flex: 1;
  font-size: 25rpx;
  color: $ink;
  font-weight: 700;
}
.goods__qty {
  font-size: 21rpx;
  color: $muted;
  margin: 0 18rpx;
}
.goods__amount {
  font-size: 24rpx;
  font-weight: 800;
  color: $ink;
  font-variant-numeric: tabular-nums;
}
.coupon {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12rpx;
  padding: 14rpx 20rpx;
  border-radius: 16rpx;
  background: rgba(255, 138, 52, 0.08);
}
.coupon__name {
  font-size: 21rpx;
  color: #b96f33;
}
.coupon__cut {
  font-size: 21rpx;
  font-weight: 900;
  color: #c85a22;
}
.amounts {
  margin-top: 16rpx;
  border-top: 2rpx dashed $line;
  padding-top: 14rpx;
}
.amount {
  display: flex;
  justify-content: space-between;
  min-height: 52rpx;
  align-items: center;
  font-size: 22rpx;
  color: $muted;
}
.amount--sum text {
  color: $ink;
  font-weight: 900;
  font-size: 25rpx;
}
.remark {
  display: block;
  margin-top: 12rpx;
  font-size: 21rpx;
  color: $muted;
  line-height: 1.6;
}
.addr {
  display: flex;
  align-items: center;
  gap: 18rpx;
}
.addr__main {
  flex: 1;
}
.addr__room {
  display: block;
  font-size: 30rpx;
  font-weight: 900;
  color: $ink;
}
.addr__contact {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: $muted;
}
.addr__act {
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  background: $soft;
  color: $primary-dark;
  font-size: 22rpx;
  font-weight: 800;
}
/* 佣金明细 */
.earn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 76rpx;
  border-bottom: 2rpx solid $line;
}
.earn--sum {
  border-bottom: none;
}
.earn__label {
  display: block;
  font-size: 24rpx;
  font-weight: 800;
  color: $ink;
}
.earn__formula {
  display: block;
  font-size: 19rpx;
  color: $muted;
  margin-top: 3rpx;
}
.earn__amount {
  font-size: 26rpx;
  font-weight: 900;
  color: var(--brand, #159c55);
  font-variant-numeric: tabular-nums;
}
.earn--sum .earn__amount {
  font-size: 30rpx;
}
.earn__note {
  display: block;
  margin-top: 14rpx;
  font-size: 19rpx;
  color: $muted;
  line-height: 1.6;
}
/* 时间线 */
.tl {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  min-height: 64rpx;
}
.tl__dot {
  flex: none;
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  border: 4rpx solid $line;
  margin-top: 8rpx;
  background: #fff;
}
.tl__dot--done {
  background: var(--brand, #159c55);
  border-color: var(--brand, #159c55);
}
.tl__main {
  flex: 1;
}
.tl__title {
  display: block;
  font-size: 23rpx;
  font-weight: 700;
  color: $ink;
}
.tl__title--dim {
  color: $muted;
  font-weight: 500;
}
.tl__time {
  display: block;
  font-size: 19rpx;
  color: $muted;
  margin-top: 2rpx;
}
/* 动作区 */
.actions {
  margin-top: 30rpx;
  padding-bottom: 20rpx;
}
.act-btn {
  width: 100%;
  min-height: 96rpx;
  border-radius: 999rpx;
  font-size: 30rpx;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
}
.act-btn--primary {
  background: $primary-dark;
  color: $lime;
}
.act-btn[disabled] {
  opacity: 0.6;
}
.detail-skeleton__hero,
.detail-skeleton__block {
  border-radius: 38rpx;
  background: linear-gradient(90deg, #edf2ed, #fff, #edf2ed);
  animation: detail-pulse 1.2s infinite;
}
.detail-skeleton__hero {
  height: 240rpx;
}
.detail-skeleton__block {
  height: 220rpx;
  margin-top: 22rpx;
}
@keyframes detail-pulse {
  50% {
    opacity: 0.55;
  }
}
</style>
