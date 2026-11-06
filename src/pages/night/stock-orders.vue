<script setup lang="ts">
import { ref } from "vue";
import { onPullDownRefresh, onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { isRetryable } from "../../api/request";
import { useSessionStore, isBindRequired } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import { formatShort } from "../../utils/datetime";
import { nightStockOrderStatusText } from "../../utils/night";
import type {
  NightStockOrder,
  NightStockOrderItem,
} from "../../types";

/** 备货记录（IKSW1F）：免费进货单留痕，下单即库存入账，线下取货。 */
const session = useSessionStore();
const items = ref<NightStockOrder[]>([]);
const loading = ref(false);
const error = ref(false);
const guest = ref(false);

async function load() {
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    const page = await api.nightStockOrders(1, 50);
    items.value = page.items;
  } catch (e) {
    if (isBindRequired(e)) guest.value = true;
    else if (isRetryable(e)) error.value = true;
  } finally {
    loading.value = false;
  }
}
onShow(load);
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});

/** 商品摘要：名称×件数拼接，最多两项 */
function line(items: NightStockOrderItem[]): string {
  const head = items
    .slice(0, 2)
    .map((i) => `${i.name}×${i.quantity}`)
    .join(" · ");
  const rest = items.length - 2;
  return rest > 0 ? `${head} 等 ${items.length} 项` : head;
}
</script>

<template>
  <view class="page sorders-page">
    <view v-if="error" class="retry card" role="button" @tap="load"
      ><text class="retry__title">加载失败</text
      ><text class="retry__sub">网络异常或服务暂不可用，点击重试</text></view
    >
    <view v-else-if="loading" class="sorders-skeleton"
      ><view v-for="n in 4" :key="n" class="sorders-skeleton__row"
    /></view>
    <view v-else-if="guest" class="retry card" role="button" @tap="load">
      <text class="retry__title">员工专用 · 备货记录</text>
      <text class="retry__sub">楼长登录后可查看进货单，点击登录</text>
    </view>

    <template v-else>
      <view v-for="o in items" :key="o.id" class="row card">
        <view class="row__head"
          ><text class="row__date">{{ formatShort(o.createdAt) }}</text
          ><text class="row__status">{{
            nightStockOrderStatusText(o.status)
          }}</text></view
        >
        <text class="row__items">{{ line(o.items) }}</text>
        <view class="row__foot"
          ><text class="row__note">免费进货 · 线下取货 · 库存已入账</text
          ><text class="row__value">货值 ¥{{ fenToYuan(o.totalValue) }}</text></view
        >
      </view>
      <view v-if="!items.length" class="empty card"
        >还没有备货记录，去「备货进货」下第一单</view
      >
    </template>
  </view>
</template>

<style scoped lang="scss">
@import "../../styles/theme.scss";
.sorders-page {
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
.row {
  padding: 26rpx 28rpx;
  margin-bottom: 16rpx;
}
.row__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.row__date {
  font-size: 22rpx;
  color: $muted;
  font-weight: 700;
}
.row__status {
  font-size: 22rpx;
  font-weight: 800;
  color: var(--brand, #159c55);
}
.row__items {
  display: block;
  font-size: 27rpx;
  font-weight: 800;
  color: $ink;
  margin-top: 14rpx;
}
.row__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14rpx;
}
.row__note {
  font-size: 20rpx;
  color: $muted;
}
.row__value {
  font-size: 27rpx;
  font-weight: 900;
  color: $primary-dark;
  font-variant-numeric: tabular-nums;
}
.empty {
  padding: 70rpx 0;
  text-align: center;
  color: $muted;
  font-size: 24rpx;
}
.sorders-skeleton__row {
  height: 170rpx;
  border-radius: 30rpx;
  margin-bottom: 16rpx;
  background: linear-gradient(90deg, #edf2ed, #fff, #edf2ed);
  animation: sorders-pulse 1.2s infinite;
}
@keyframes sorders-pulse {
  50% {
    opacity: 0.55;
  }
}
</style>
