<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
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
const keyword = ref("");
const filter = ref("all");
const visible = computed(() => items.value.filter(p => p.name.includes(keyword.value.trim()) && (filter.value === "all" || (filter.value === "on" ? p.purchasable : !p.purchasable))));
function goInventory() { uni.navigateTo({ url: "/pages/night/inventory" }); }
/** 库存为 0 的行给「去备货」引导（IKSZF5 空态带动作） */
const goStock = () => uni.navigateTo({ url: "/pages/night/stock" });

async function load() {
  guest.value = false;
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    items.value = await api.nightProducts();
  } catch (e) {
    if (isBindRequired(e)) guest.value = true;
    else error.value = true;
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
  } catch {
    // 请求层提示原因；重拉许可和货架状态，避免保留过期状态。
  } finally {
    await load();
    acting.value = null;
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
      <view class="tools"><input v-model="keyword" placeholder="搜索本店商品" /><button @tap="goInventory">盘点 / 报损</button></view>
      <view class="filters"><button v-for="f in [{ id: 'all', name: '全部商品' }, { id: 'on', name: '可售' }, { id: 'off', name: '暂不可售' }]" :key="f.id" :class="{ active: filter === f.id }" @tap="filter = f.id">{{ f.name }}</button></view>
      <view v-for="p in visible" :key="p.id" class="row card">
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
            ><text class="row__stock">可售 {{ p.stock }}</text
            ><text
              v-if="!p.saleAllowed || p.catalogStatus !== 'on-sale'"
              class="row__tag"
              >停售</text
            ></view
          ><text class="row__note" :class="{ 'row__note--warn': !p.purchasable }">{{
            shelfNote(p)
          }}</text
          ><text class="row__note">待配送 {{ p.pendingQuantity ?? 0 }} · 冻结 {{ p.frozenStock }} · 货值 ¥{{ fenToYuan(p.inventoryValue) }}</text
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
            color="#ffd75e"
            @change="toggle(p)"
        /></view>
      </view>
      <view v-if="!items.length" class="empty card"
        >本店还没有商品，先从「进货备货」选择商品申请备货</view
      >
    </template>
  </view>
</template>

<style scoped lang="scss">
/* V4 深色化：功能逻辑不动，仅视觉 token 对齐 night.scss */
@import "../../styles/theme.scss";
@import "../../styles/night.scss";
.products-page {
  @include nb-page;
}
.products-page .card {
  @include nb-card;
}
.tools { display: flex; gap: 16rpx; align-items: center; margin: 20rpx 0; }
.tools input { flex: 1; min-width: 0; height: 76rpx; padding: 0 20rpx; background: rgba(0,0,0,.15); border: 1px solid $nb-border; border-radius: 22rpx; font-size: 26rpx; }
.tools button, .filters button { background: $nb-gold-soft; color: $nb-gold; font-size: 23rpx; border-radius: 99rpx; margin: 0; }
.filters { display: flex; gap: 16rpx; margin-bottom: 24rpx; }.filters .active { background: $nb-cta-gradient; color: $nb-gold-ink; }
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
.hint {
  padding: 22rpx 28rpx;
  margin-bottom: 20rpx;
}
.hint__text {
  font-size: 21rpx;
  line-height: 1.7;
  color: $nb-text-sub;
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
  background: rgba(255, 255, 255, 0.08);
}
.row__img--ph {
  display: grid;
  place-items: center;
  color: $nb-gold;
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
  color: $nb-text;
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
  color: $nb-gold;
}
.row__stock {
  font-size: 20rpx;
  color: $nb-text-sub;
}
.row__tag {
  padding: 2rpx 14rpx;
  border-radius: 8rpx;
  background: rgba(248, 113, 113, 0.1);
  color: $nb-danger;
  font-size: 19rpx;
}
.row__note {
  display: block;
  font-size: 20rpx;
  color: $nb-text-sub;
  margin-top: 8rpx;
}
.row__note--warn {
  color: $nb-warn;
}
/* 「去备货」引导 chip（金黄，可点暗示，无箭头形状） */
.row__stock-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  box-sizing: border-box;
  margin-top: 10rpx;
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  background: rgba(255, 215, 94, 0.12);
  color: $nb-gold;
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
  color: $nb-text-sub;
}
.empty {
  padding: 70rpx 0;
  text-align: center;
  color: $nb-text-sub;
  font-size: 24rpx;
}
.products-skeleton__row {
  height: 150rpx;
  border-radius: 30rpx;
  margin-bottom: 16rpx;
  background: linear-gradient(90deg, #121a15, #1a241d, #121a15);
  animation: products-pulse 1.2s infinite;
}
@keyframes products-pulse {
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
