<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { ApiError } from "../../api/request";
import { useSessionStore, isBindRequired } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import { isDepositGapError } from "../../utils/night";
import type { NightDashboard, NightPoolItem } from "../../types";

/**
 * 备货进货页（IKSW1F）：夜主档商品池勾选数量 → POST stock/orders。
 * 申请预占额度，校区整单审核出库，楼长确认实收后才入库。
 * 顶部实时显示押金余额 / 当前货值 / 可再进货额度；被额度拦截时后端返回
 * 差额提示，前端弹窗引导补缴押金。
 */
const session = useSessionStore();
const pool = ref<NightPoolItem[]>([]);
const keyword = ref("");
const category = ref("");
const categories = computed(() => [
  ...new Set(pool.value.map((p) => p.categoryName).filter(Boolean)),
]);
const filteredPool = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  return pool.value.filter(
    (p) =>
      (!category.value || p.categoryName === category.value) &&
      (!q || `${p.name} ${p.barcode ?? ""}`.toLowerCase().includes(q)),
  );
});
const dash = ref<NightDashboard>();
const loading = ref(false);
const error = ref(false);
const guest = ref(false);
/** 勾选数量（catalogProductId → 件数） */
const quantities = ref<Record<string, number>>({});
const quantityInputs = ref<Record<string, string>>({});
/** 提交防重 */
const submitting = ref(false);
const confirming = ref(false);
let requestId = "";

const deposit = computed(() => dash.value?.deposit ?? 0);
const currentStockValue = computed(() => dash.value?.stockValue ?? 0);
const usableQuota = computed(() => dash.value?.usableQuota ?? 0);
/** 本次备货货值（勾选 × 夜宵售价） */
const orderValue = computed(() =>
  pool.value.reduce(
    (s, p) => s + (quantities.value[p.catalogProductId] ?? 0) * p.price,
    0,
  ),
);
/** 勾选件数 */
const pickedCount = computed(() =>
  Object.values(quantities.value).reduce((s, n) => s + n, 0),
);
const overQuota = computed(() => orderValue.value > usableQuota.value);
/** 超出押金的差额（整单被拒时说明的金额） */
const overGap = computed(() =>
  overQuota.value ? orderValue.value - usableQuota.value : 0,
);
const canSubmit = computed(() => pickedCount.value > 0 && !submitting.value && !confirming.value);

async function load() {
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    const [p, d] = await Promise.all([
      api.nightStockPool(),
      api.nightDashboard(),
    ]);
    pool.value = p;
    if (category.value && !p.some((item) => item.categoryName === category.value)) category.value = "";
    dash.value = d;
    // 清掉已不在池中的勾选（主档停售后行消失）
    const alive = new Set(
      p.filter((i) => i.canStock).map((i) => i.catalogProductId),
    );
    const next: Record<string, number> = {};
    for (const [k, v] of Object.entries(quantities.value))
      if (alive.has(k) && v > 0) next[k] = v;
    quantities.value = next;
    quantityInputs.value = Object.fromEntries(Object.entries(next).map(([id, value]) => [id, String(value)]));
  } catch (e) {
    if (isBindRequired(e)) guest.value = true;
    else error.value = true;
  } finally {
    loading.value = false;
  }
}
onShow(load);

function setQty(item: NightPoolItem, qty: number) {
  if (submitting.value || !item.canStock) return;
  requestId = "";
  const v = Math.max(0, Math.min(999, Math.floor(qty) || 0));
  quantityInputs.value[item.catalogProductId] = String(v);
  if (v === 0) delete quantities.value[item.catalogProductId];
  else quantities.value[item.catalogProductId] = v;
}
const qtyOf = (id: string) => quantities.value[id] ?? 0;
/** 输入框直改（H5/小程序事件形状不一，detail.value 兼容 string|number） */
function onQtyInput(item: NightPoolItem, event: unknown) {
  const value = (event as { detail?: { value?: string | number } })?.detail
    ?.value;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;
  setQty(item, n);
  quantityInputs.value[item.catalogProductId] = String(value ?? '');
}
function normalizeQty(item: NightPoolItem) { quantityInputs.value[item.catalogProductId] = String(qtyOf(item.catalogProductId)); }

async function submit() {
  if (!canSubmit.value) return;
  if (overQuota.value) {
    uni.showModal({
      title: "押金额度不足",
      content: `还差 ¥${fenToYuan(orderValue.value - usableQuota.value)} 额度，请先缴纳押金。`,
      confirmText: "去交押金",
      cancelText: '取消',
      success: (r) => {
        if (r.confirm) uni.navigateTo({ url: "/pages/night/deposit" });
      },
    });
    return;
  }
  confirming.value = true;
  const confirmation = await new Promise<boolean>((resolve) =>
    uni.showModal({
      title: "提交备货申请",
      confirmText: '确认提交',
      cancelText: '再核对',
      content: `本次 ${pickedCount.value} 件，预占额度 ¥${fenToYuan(orderValue.value)}。校区审核出库后，请核对实收数量确认收货，届时才增加本店库存。`,
      success: (r) => resolve(Boolean(r.confirm)),
      fail: () => resolve(false),
    }),
  );
  confirming.value = false;
  if (!confirmation || submitting.value) return;
  submitting.value = true;
  try {
    const items = Object.entries(quantities.value)
      .filter(([, q]) => q > 0)
      .map(([catalogProductId, quantity]) => ({ catalogProductId, quantity }));
    if (!requestId)
      requestId = `stock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await api.nightStockOrder(items, requestId);
    uni.showToast({ title: "申请已提交，待校区审核", icon: "none" });
    quantities.value = {};
    quantityInputs.value = {};
    requestId = "";
    load();
  } catch (e) {
    // 押金额度不足：后端 400 返回差额提示（request 层已 toast 原文），
    // 这里升级为弹窗引导补缴押金，不留死路
    if (e instanceof ApiError && isDepositGapError(e.message)) {
      const gap = e.message.match(/超出押金\s*([\d.]+)\s*元/);
      uni.showModal({
        title: "押金额度不足",
        content: gap
          ? `本次备货超出押金 ${gap[1]} 元。补缴押金（500 元档递增）后即可继续进货。`
          : "本次备货货值超出押金余额，请先补缴押金（500 元档递增）。",
        confirmText: "去补缴",
        cancelText: '取消',
        success: (r) => {
          if (r.confirm) uni.navigateTo({ url: "/pages/night/deposit" });
        },
      });
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="page stock-page">
    <view v-if="error" class="retry card" role="button" @tap="load"
      ><text class="retry__title">加载失败</text
      ><text class="retry__sub">网络异常或服务暂不可用，点击重试</text></view
    >
    <view v-else-if="loading" class="stock-skeleton"
      ><view class="stock-skeleton__bar" /><view
        v-for="n in 5"
        :key="n"
        class="stock-skeleton__row"
    /></view>
    <view v-else-if="guest" class="retry card" role="button" @tap="load">
      <text class="retry__title">员工专用 · 备货进货</text>
      <text class="retry__sub">楼长登录后可备货，点击登录</text>
    </view>

    <template v-else>
      <!-- 额度仪表：押金余额 / 当前货值 / 可再进货额度（实时） -->
      <view class="quota card">
        <view
          ><text class="quota__value">{{ fenToYuan(deposit) }}</text
          ><text class="quota__label">押金余额</text></view
        >
        <view
          ><text class="quota__value">{{ fenToYuan(currentStockValue) }}</text
          ><text class="quota__label">当前货值</text></view
        >
        <view
          ><text
            class="quota__value"
            :class="{ 'quota__value--tight': overQuota }"
            >{{ fenToYuan(usableQuota) }}</text
          ><text class="quota__label">可再进货额度</text></view
        >
      </view>

      <view class="pool-head"
        ><text class="pool-head__title">可备货商品</text
        ><text class="pool-head__sub"
          >申请 → 校区审核出库 → 确认实收</text
        ></view
      >

      <view class="search-row"
        ><input
          v-model="keyword"
          confirm-type="search"
          placeholder="搜索商品名称 / 条码"
          aria-label="搜索可备货商品"
        /><button v-if="keyword" @tap="keyword = ''">清除</button></view
      >
      <scroll-view v-if="categories.length" scroll-x class="category-scroll"
        ><view class="category-chips"
          ><button :class="{ active: !category }" @tap="category = ''">
            全部</button
          ><button
            v-for="name in categories"
            :key="name"
            :class="{ active: category === name }"
            @tap="category = name"
          >
            {{ name }}
          </button></view
        ></scroll-view
      >
      <text class="result-count"
        >找到 {{ filteredPool.length }} 种商品<text v-if="pickedCount">
          · 已选 {{ pickedCount }} 件</text
        ></text
      >
      <view
        v-for="p in filteredPool"
        :key="p.catalogProductId"
        class="row card"
      >
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
            ><text class="row__stock"
              >可售 {{ p.stock }} · 仓库 {{ p.warehouseAvailable }}</text
            ><text v-if="!p.attached" class="row__tag">首次进货</text></view
          ></view
        >
        <text v-if="!p.canStock" class="row__stock">{{
          p.unavailableReason
        }}</text>
        <view v-else class="stepper"
          ><button
            class="stepper__btn"
            :aria-label="`减少${p.name}进货数量`"
            :disabled="!qtyOf(p.catalogProductId)"
            @tap="setQty(p, qtyOf(p.catalogProductId) - 1)"
          >
            −</button
          ><input
            class="stepper__input"
            :aria-label="`${p.name}进货数量`"
            type="number"
            :value="quantityInputs[p.catalogProductId] ?? String(qtyOf(p.catalogProductId))"
            @input="onQtyInput(p, $event)"
            @blur="normalizeQty(p)"
          /><button
            class="stepper__btn"
            :aria-label="`增加${p.name}进货数量`"
            @tap="setQty(p, qtyOf(p.catalogProductId) + 1)"
          >
            +
          </button></view
        >
      </view>
      <view v-if="!pool.length" class="empty card"
        >商品池为空，等运营上架夜宵商品后再来备货</view
      >
      <view v-else-if="!filteredPool.length" class="empty card"
        >没有匹配的商品，换个关键词或分类试试<button
          class="history-btn"
          @tap="
            keyword = '';
            category = '';
          "
        >
          清空筛选
        </button></view
      >

      <!-- 结算条：本次货值 + 提交（额度不足走后端权威校验 → 弹窗引导补缴） -->
      <view class="stock-footer">
        <view class="history-footer"
          ><text
            >备货及收货差异预占 ¥{{ fenToYuan(dash?.reservedValue ?? 0) }}</text
          ><button
            class="history-btn"
            @tap="uni.navigateTo({ url: '/pages/night/stock-orders' })"
          >
            查看备货进度与收货
          </button></view
        >
        <view class="submit-bar">
          <view class="submit-bar__info"
            ><text class="submit-bar__value">¥{{ fenToYuan(orderValue) }}</text
            ><text class="submit-bar__label"
              >{{
                pickedCount ? `已选 ${pickedCount} 件 · ` : ""
              }}本次货值</text
            ><text v-if="overQuota" class="submit-bar__warn"
              >还差 ¥{{ fenToYuan(orderValue - usableQuota) }}，请先交押金</text
            ></view
          >
          <button class="submit-btn" :disabled="!canSubmit" @tap="submit">
            {{
              submitting
                ? "提交中…"
                : overQuota
                  ? "额度不足，去交押金"
                  : "提交备货申请"
            }}
          </button>
        </view>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
/* V4 深色化：功能逻辑不动，仅视觉 token 对齐 night.scss */
@import "../../styles/theme.scss";
@import "../../styles/night.scss";
.stock-page {
  @include nb-page;
  padding-bottom: calc(360rpx + env(safe-area-inset-bottom));
}
.stock-page .card {
  @include nb-card;
}
.history-btn {
  background: $nb-gold-soft;
  color: $nb-gold;
  font-size: 24rpx;
  border-radius: 99rpx;
  margin-top: 12rpx;
}
.search-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 10rpx 22rpx;
  border: 1px solid $nb-border;
  border-radius: 24rpx;
  background: rgba(0, 0, 0, 0.13);
}
.search-row input {
  flex: 1;
  min-width: 0;
  height: 70rpx;
  font-size: 26rpx;
}
.search-row button {
  margin: 0;
  padding: 0 12rpx;
  font-size: 23rpx;
  background: transparent;
  color: $nb-gold;
}
.category-scroll {
  margin-top: 20rpx;
  white-space: nowrap;
}
.category-chips {
  display: flex;
  gap: 12rpx;
  padding-bottom: 8rpx;
}
.category-chips button {
  flex-shrink: 0;
  margin: 0;
  padding: 0 24rpx;
  border-radius: 99rpx;
  color: $nb-text-sub;
  background: rgba(255, 255, 255, 0.06);
  font-size: 23rpx;
}
.category-chips .active {
  background: $nb-gold-soft;
  color: $nb-gold;
}
.result-count {
  display: block;
  margin: 16rpx 4rpx;
  color: $nb-text-sub;
  font-size: 22rpx;
}
.stock-footer {
  position: fixed;
  z-index: 20;
  bottom: 0;
  left: 0;
  right: 0;
  background: $nb-hero-gradient;
  border-top: 1px solid $nb-border;
  padding-bottom: env(safe-area-inset-bottom);
}
.history-footer {
  padding: 18rpx 28rpx 14rpx;
  border-bottom: 1px solid $nb-border;
  font-size: 23rpx;
  color: $nb-text-sub;
}
.history-footer .history-btn {
  line-height: 2.5;
  margin-top: 10rpx;
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
  color: $nb-text;
}
.retry__sub {
  font-size: 21rpx;
  color: $nb-text-sub;
  margin-top: 8rpx;
}
/* 额度仪表 */
.quota {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 26rpx 10rpx;
  text-align: center;
}
.quota > view + view {
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}
.quota__value,
.quota__label {
  display: block;
}
.quota__value {
  font-size: 30rpx;
  font-weight: 900;
  color: $nb-gold;
  font-variant-numeric: tabular-nums;
}
.quota__value--tight {
  color: $nb-danger;
}
.quota__label {
  font-size: 19rpx;
  color: $nb-text-sub;
  margin-top: 6rpx;
}
.pool-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 30rpx 6rpx 16rpx;
}
.pool-head__title {
  font-size: 28rpx;
  font-weight: 900;
  color: $nb-text;
}
.pool-head__sub {
  font-size: 20rpx;
  color: $nb-text-sub;
}
/* 商品行 */
.row {
  display: flex;
  flex-wrap: wrap;
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
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 27rpx;
  font-weight: 800;
  color: $nb-text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.4;
}
.row__meta {
  display: flex;
  flex-wrap: wrap;
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
  background: rgba(255, 255, 255, 0.08);
  color: $nb-text-sub;
  font-size: 19rpx;
}
/* 数量步进器 */
.stepper {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.stepper__btn {
  min-width: 44px;
  width: 88rpx;
  height: 88rpx;
  min-height: 44px;
  margin: 0;
  padding: 0;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.08);
  color: $nb-text;
  font-size: 32rpx;
  font-weight: 900;
  line-height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
}
.stepper__btn::after {
  border: none;
}
.stepper__btn[disabled] {
  opacity: 0.35;
  color: $nb-text;
  background: rgba(255, 255, 255, 0.08);
}
.stepper__input {
  width: 44px;
  height: 44px;
  border-radius: 14rpx;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: $nb-bg;
  text-align: center;
  font-size: 26rpx;
  font-weight: 800;
  color: $nb-text;
}
.empty {
  padding: 70rpx 0;
  text-align: center;
  color: $nb-text-sub;
  font-size: 24rpx;
}
/* 底部结算条（深色） */
.submit-bar {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 18rpx 28rpx;
}
.submit-bar__info {
  flex: 1;
  min-width: 0;
}
.submit-bar__value {
  display: block;
  font-size: 34rpx;
  font-weight: 900;
  color: $nb-gold;
  font-variant-numeric: tabular-nums;
}
.submit-bar__label {
  display: block;
  font-size: 19rpx;
  color: $nb-text-sub;
  margin-top: 2rpx;
}
.submit-bar__warn {
  display: block;
  font-size: 19rpx;
  color: $nb-warn;
  margin-top: 2rpx;
}
/* 确认进货 CTA：金黄 */
.submit-btn {
  flex: none;
  min-width: 240rpx;
  min-height: 88rpx;
  margin: 0;
  border-radius: 999rpx;
  background: $nb-cta-gradient;
  color: $nb-gold-ink;
  font-size: 28rpx;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
}
.submit-btn::after {
  border: none;
}
.submit-btn[disabled] {
  opacity: 0.5;
  color: $nb-gold-ink;
  background: $nb-cta-gradient;
}
/* 骨架（深色 shimmer） */
.stock-skeleton__bar,
.stock-skeleton__row {
  border-radius: 30rpx;
  background: linear-gradient(90deg, #121a15, #1a241d, #121a15);
  animation: stock-pulse 1.2s infinite;
}
.stock-skeleton__bar {
  height: 130rpx;
}
.stock-skeleton__row {
  height: 150rpx;
  margin-top: 16rpx;
}
@keyframes stock-pulse {
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
