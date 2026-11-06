<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { isRetryable } from "../../api/request";
import { useSessionStore, isBindRequired } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import type { NightProduct } from "../../types";

/**
 * 本店商品管理（IKSW1F）：资料与售价引夜主档只读展示（楼长不能改价改资料），
 * 仅可切换本店上下架。恢复上架时后端校验主档停售（楼长不能绕过后台停售）。
 */
const session = useSessionStore();
const items = ref<NightProduct[]>([]);
const loading = ref(false);
const error = ref(false);
const guest = ref(false);
/** 切换防重（商品行 id） */
const acting = ref<string | null>(null);
/** 库存为 0 的行给「去备货」引导（IKSZF5 空态带动作） */
const goStock = () => uni.navigateTo({ url: "/pages/night/stock" });

async function load() {
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    items.value = await api.nightProducts();
  } catch (e) {
    if (isBindRequired(e)) guest.value = true;
    else if (isRetryable(e)) error.value = true;
  } finally {
    loading.value = false;
  }
}
onShow(load);

/** 下架/上架：恢复上架被拒（主档停售）时 request 层已 toast 具体原因 */
async function toggle(p: NightProduct) {
  if (acting.value || p.saleAllowed === false) return;
  acting.value = p.id;
  try {
    await api.nightToggleShelf(p.id, !p.onShelf);
    p.onShelf = !p.onShelf;
    uni.showToast({ title: p.onShelf ? "已上架" : "已下架", icon: "success" });
  } finally {
    acting.value = null;
    load().catch(() => {});
  }
}
/** 行状态副标：停售/售罄/在售 */
function shelfNote(p: NightProduct): string {
  if (!p.saleAllowed || p.catalogStatus !== "on-sale") return "已被后台停售，不可上架";
  if (p.stock <= 0) return "库存为 0，请先备货";
  return p.onShelf ? "学生端可购买" : "已下架，学生端不可见";
}
</script>

<template>
  <view class="page products-page">
    <view v-if="error" class="retry card" role="button" @tap="load"
      ><text class="retry__title">加载失败</text
      ><text class="retry__sub">网络异常或服务暂不可用，点击重试</text></view
    >
    <view v-else-if="loading" class="products-skeleton"
      ><view
        v-for="n in 5"
        :key="n"
        class="products-skeleton__row"
    /></view>
    <view v-else-if="guest" class="retry card" role="button" @tap="load">
      <text class="retry__title">员工专用 · 本店商品</text>
      <text class="retry__sub">楼长登录后可管理商品，点击登录</text>
    </view>

    <template v-else>
      <view class="hint card"
        ><text class="hint__text"
          >商品资料与售价由平台统一设定（本店不能改价改资料），你只能控制本店上下架；下架不影响库存与已有订单。</text
        ></view
      >
      <view v-for="p in items" :key="p.id" class="row card">
        <image
          v-if="p.image"
          class="row__img"
          :src="p.image"
          mode="aspectFill"
        ></image>
        <view v-else class="row__img row__img--ph"
          ><text>{{ p.name.slice(0, 1) }}</text></view
        >
        <view class="row__main"
          ><text class="row__name">{{ p.name }}</text
          ><view class="row__meta"
            ><text class="row__price">¥{{ fenToYuan(p.price) }}</text
            ><text class="row__stock">库存 {{ p.stock }}</text
            ><text
              v-if="!p.saleAllowed || p.catalogStatus !== 'on-sale'"
              class="row__tag"
              >停售</text
            ></view
          ><text class="row__note" :class="{ 'row__note--warn': !p.purchasable }">{{
            shelfNote(p)
          }}</text
          ><text
            v-if="p.stock <= 0 && p.saleAllowed && p.catalogStatus === 'on-sale'"
            class="row__stock-link"
            role="button"
            @tap.stop="goStock"
            >去备货</text
          ></view
        >
        <!-- 楼长唯一可控项：本店上下架；后台停售的行锁死（saleAllowed=false） -->
        <view class="shelf"
          ><text class="shelf__label">{{
            p.onShelf ? "上架中" : "已下架"
          }}</text
          ><switch
            class="shelf__switch"
            :checked="p.onShelf"
            :disabled="!p.saleAllowed || p.catalogStatus !== 'on-sale' || acting === p.id"
            color="#18a957"
            @change="toggle(p)"
        /></view>
      </view>
      <view v-if="!items.length" class="empty card"
        >本店还没有配置商品，等运营在后台给本店挂上夜主档商品</view
      >
    </template>
  </view>
</template>

<style scoped lang="scss">
@import "../../styles/theme.scss";
.products-page {
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
.hint {
  padding: 22rpx 28rpx;
  margin-bottom: 20rpx;
}
.hint__text {
  font-size: 21rpx;
  line-height: 1.7;
  color: $muted;
}
.row {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 22rpx 24rpx;
  margin-bottom: 16rpx;
}
.row__img {
  flex: none;
  width: 110rpx;
  height: 110rpx;
  border-radius: 20rpx;
  background: $soft;
}
.row__img--ph {
  display: grid;
  place-items: center;
  color: $primary-dark;
  font-size: 34rpx;
  font-weight: 900;
}
.row__main {
  flex: 1;
  min-width: 0;
}
.row__name {
  display: block;
  font-size: 27rpx;
  font-weight: 800;
  color: $ink;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row__meta {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-top: 10rpx;
}
.row__price {
  font-size: 25rpx;
  font-weight: 900;
  color: var(--brand, #159c55);
}
.row__stock {
  font-size: 20rpx;
  color: $muted;
}
.row__tag {
  padding: 2rpx 14rpx;
  border-radius: 8rpx;
  background: rgba(216, 76, 63, 0.1);
  color: $danger;
  font-size: 19rpx;
}
.row__note {
  display: block;
  font-size: 20rpx;
  color: $muted;
  margin-top: 8rpx;
}
.row__note--warn {
  color: #b96f33;
}
/* 「去备货」引导 chip（可点暗示，无箭头形状） */
.row__stock-link {
  display: inline-block;
  margin-top: 10rpx;
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  background: rgba(24, 169, 87, 0.12);
  color: $primary-dark;
  font-size: 20rpx;
  font-weight: 800;
}
.shelf {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
}
.shelf__label {
  font-size: 19rpx;
  color: $muted;
}
.empty {
  padding: 70rpx 0;
  text-align: center;
  color: $muted;
  font-size: 24rpx;
}
.products-skeleton__row {
  height: 150rpx;
  border-radius: 30rpx;
  margin-bottom: 16rpx;
  background: linear-gradient(90deg, #edf2ed, #fff, #edf2ed);
  animation: products-pulse 1.2s infinite;
}
@keyframes products-pulse {
  50% {
    opacity: 0.55;
  }
}
</style>
