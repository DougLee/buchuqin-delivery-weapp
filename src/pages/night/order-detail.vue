<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import ProofImagePicker from '../../components/ProofImagePicker.vue';
import { onLoad, onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
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
 * 接单（倒计时）、送达（凭证必填）两个动作；单单佣金明细
 * （券后基数 × 比例 = 商品佣金，配送费全额）。
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
const images = ref<string[]>([]);
const uploading = ref(false);

/* ---------- 接单倒计时（IKSZF5）：待接单时 hero 显示剩余时间 ---------- */
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
onUnmounted(stopTick);
const countdown = () => {
  const o = order.value;
  if (!o || o.status !== "pending-accept" || !o.timeoutAt) return "";
  const rest = new Date(o.timeoutAt).getTime() - nowTick.value;
  if (Number.isNaN(rest)) return "";
  if (rest <= 0) return "接单已超时，请尽快处理";
  const m = Math.floor(rest / 60000);
  const s = Math.floor((rest % 60000) / 1000);
  return `接单剩余 ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

async function load() {
  if (!orderId.value) { error.value = true; loading.value = false; return; }
  guest.value = false;
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    order.value = await api.nightOrder(orderId.value);
    // 佣金明细拉失败不拦详情（未支付单无流水时后端也照算试算口径）
    earning.value = await api.nightOrderEarning(orderId.value).catch(() => undefined);
  } catch (e) {
    if (isBindRequired(e)) guest.value = true;
    else error.value = true;
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
  if (kind === 'deliver' && !images.value.length) {
    uni.showToast({ title: '请先上传送达照片', icon: 'none' }); return;
  }
  acting.value = true;
  try {
    if (kind === "accept") await api.nightAccept(order.value.id);
    else await api.nightDeliver(order.value.id, images.value);
    uni.showToast({
      title: kind === "accept" ? "已接单" : "已送达完成",
      icon: "success",
    });
  } catch {
    // 请求层提示失败，保留凭证并刷新真实状态后再允许重试。
  } finally {
    // 成功/失败都重拉纠偏（状态已变时按钮随状态消失）
    await load();
    acting.value = false;
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
            v-if="['requested', 'refund-processing'].includes(order.afterSaleStatus || '')"
            class="hero__as"
            >{{ order.afterSaleStatus === 'refund-processing' ? '退款处理中' : '售后处理中' }}</text
          ></view
        >
        <text class="hero__no">单号 {{ order.orderNo }}</text>
        <text class="hero__time">下单 {{ formatShort(order.createdAt) }}</text>
        <text v-if="countdown()" class="hero__countdown">{{
          countdown()
        }}</text>
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
            ><text v-if="t.time || t.key === 'submit'" class="tl__time">{{ formatShort(t.time || order.createdAt) }}</text
            ></view
          ></view
        >
      </view>

      <!-- 动作区：接单 / 送达 -->
      <view v-if="order.status === 'delivering'" class="card block">
        <text class="block__head">送达凭证</text>
        <text class="remark">请拍摄放置位置，确保用户能找到商品。送达后订单即完成。</text>
        <view class="proof-grid">
          <view v-for="(image, i) in images" :key="image" class="proof-item">
            <image :src="image" mode="aspectFill" @tap="uni.previewImage({ urls: images, current: image })" />
            <button :disabled="acting" @tap="images.splice(i, 1)">移除</button>
          </view>
          <ProofImagePicker v-if="images.length < 3" v-model="images" :disabled="acting" @busy="uploading = $event" />
        </view>
      </view>
      <view v-for="step in order.timeline.filter(t => t.proof?.images?.length)" :key="step.key" class="card block">
        <text class="block__head">已提交送达凭证</text>
        <view class="proof-grid"><image v-for="image in step.proof?.images" :key="image" class="proof-thumb" :src="image" mode="aspectFill" /></view>
      </view>
      <view class="actions">
        <button
          v-if="order.status === 'pending-accept' && order.afterSaleStatus !== 'refund-processing'"
          class="act-btn act-btn--primary"
          :disabled="acting"
          @tap="act('accept')"
        >
          {{ acting ? "处理中…" : "接 单" }}
        </button>
        <button
          v-else-if="order.status === 'delivering' && order.afterSaleStatus !== 'refund-processing'"
          class="act-btn act-btn--primary"
          :disabled="acting || uploading || !images.length"
          @tap="act('deliver')"
        >
          {{ acting ? "处理中…" : "确认送达并完成" }}
        </button>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
/* V4 深色化：功能逻辑不动（押金档位/凭证上传/接单倒计时全部保留），仅视觉
   token 对齐 night.scss */
@import "../../styles/theme.scss";
@import "../../styles/night.scss";
.detail-page {
  @include nb-page;
}
.detail-page .card {
  @include nb-card;
}
.proof-grid { display:flex; flex-wrap:wrap; gap:16rpx; margin-top:20rpx; }
.proof-item { width:160rpx; }
.proof-item image, .proof-thumb { width:160rpx; height:160rpx; border-radius:18rpx; }
.proof-item button, .proof-add { min-height:88rpx; margin:0; font-size:26rpx; color:$nb-text; background:rgba(255,255,255,.08); border:none; display:flex; align-items:center; justify-content:center; }
.proof-item button::after, .proof-add::after { border:none; }
.proof-add { width:180rpx; border:1px dashed rgba(255,255,255,.25); border-radius:18rpx; }
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
/* 状态头：暗绿渐变 + 细描边（V4 token） */
.hero {
  @include nb-hero;
  position: relative;
  overflow: hidden;
  padding: 36rpx;
  border-radius: 38rpx;
  color: #fff;
}
.hero__glow {
  position: absolute;
  width: 230rpx;
  height: 230rpx;
  border-radius: 50%;
  right: -80rpx;
  top: -110rpx;
  @include nb-halo;
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
  background: rgba(251, 146, 60, 0.9);
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
/* 接单倒计时徽章：金黄底深字（V4 夜宵锚点色），超时也不换底色只换文案 */
.hero__countdown {
  display: inline-block;
  align-self: flex-start;
  margin-top: 16rpx;
  padding: 8rpx 22rpx;
  border-radius: 999rpx;
  background: $nb-gold;
  color: $nb-gold-ink;
  font-size: 22rpx;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.hero__cancel {
  margin-top: 12rpx;
  font-size: 21rpx;
  color: #fca5a5;
}
.block {
  padding: 28rpx;
  margin-top: 22rpx;
}
.block__head {
  display: block;
  font-size: 27rpx;
  font-weight: 900;
  color: $nb-text;
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
  color: $nb-text;
  font-weight: 700;
}
.goods__qty {
  font-size: 21rpx;
  color: $nb-text-sub;
  margin: 0 18rpx;
}
.goods__amount {
  font-size: 24rpx;
  font-weight: 800;
  color: $nb-text;
  font-variant-numeric: tabular-nums;
}
.coupon {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12rpx;
  padding: 14rpx 20rpx;
  border-radius: 16rpx;
  background: rgba(251, 146, 60, 0.1);
}
.coupon__name {
  font-size: 21rpx;
  color: $nb-warn;
}
.coupon__cut {
  font-size: 21rpx;
  font-weight: 900;
  color: #fb923c;
}
.amounts {
  margin-top: 16rpx;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
  padding-top: 14rpx;
}
.amount {
  display: flex;
  justify-content: space-between;
  min-height: 52rpx;
  align-items: center;
  font-size: 22rpx;
  color: $nb-text-sub;
}
.amount--sum text {
  color: $nb-text;
  font-weight: 900;
  font-size: 25rpx;
}
.remark {
  display: block;
  margin-top: 12rpx;
  font-size: 21rpx;
  color: $nb-text-sub;
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
  color: $nb-text;
}
.addr__contact {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: $nb-text-sub;
}
.addr__act {
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  background: rgba(255, 215, 94, 0.12);
  color: $nb-gold;
  font-size: 22rpx;
  font-weight: 800;
}
/* 佣金明细 */
.earn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 76rpx;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.earn--sum {
  border-bottom: none;
}
.earn__label {
  display: block;
  font-size: 24rpx;
  font-weight: 800;
  color: $nb-text;
}
.earn__formula {
  display: block;
  font-size: 19rpx;
  color: $nb-text-sub;
  margin-top: 3rpx;
}
.earn__amount {
  font-size: 26rpx;
  font-weight: 900;
  color: $nb-success;
  font-variant-numeric: tabular-nums;
}
.earn--sum .earn__amount {
  font-size: 30rpx;
}
.earn__note {
  display: block;
  margin-top: 14rpx;
  font-size: 19rpx;
  color: $nb-text-sub;
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
  border: 4rpx solid rgba(255, 255, 255, 0.12);
  margin-top: 8rpx;
  background: transparent;
}
.tl__dot--done {
  background: $nb-success;
  border-color: $nb-success;
}
.tl__main {
  flex: 1;
}
.tl__title {
  display: block;
  font-size: 23rpx;
  font-weight: 700;
  color: $nb-text;
}
.tl__title--dim {
  color: $nb-text-sub;
  font-weight: 500;
}
.tl__time {
  display: block;
  font-size: 19rpx;
  color: $nb-text-sub;
  margin-top: 2rpx;
}
/* 动作区：金黄 CTA */
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
  border: none;
}
.act-btn::after {
  border: none;
}
.act-btn--primary {
  background: $nb-cta-gradient;
  color: $nb-gold-ink;
  box-shadow: 0 12rpx 28rpx rgba(255, 201, 60, 0.22);
}
.act-btn[disabled] {
  opacity: 0.6;
  color: $nb-gold-ink;
  background: $nb-cta-gradient;
}
.detail-skeleton__hero,
.detail-skeleton__block {
  border-radius: 38rpx;
  background: linear-gradient(90deg, #121a15, #1a241d, #121a15);
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

<style lang="scss">
@import "../../styles/night.scss";
page {
  background: $nb-bg;
}
</style>
