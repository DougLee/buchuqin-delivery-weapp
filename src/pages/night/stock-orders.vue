<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { onPullDownRefresh, onShow, onReachBottom } from "@dcloudio/uni-app";
import { api } from "../../api";
import { useSessionStore } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import { formatShort } from "../../utils/datetime";
import type { NightStockOrder } from "../../types";

const session = useSessionStore();
const items = ref<NightStockOrder[]>([]);
const loading = ref(false);
const failed = ref(false);
const moreFailed = ref(false);
let generation = 0;
const busy = ref(false);
const page = ref(1);
const total = ref(0);
const filter = ref("all");
const selected = ref("");
const receipt = ref<Record<string, string>>({});
const statuses: Record<string, string> = {
  requested: "待校区审核",
  approved: "已审核 · 待出库",
  shipped: "已出库 · 待收货",
  received: "已收货",
  rejected: "已驳回",
  cancelled: "已撤回",
  completed: "历史已入库",
};
const shown = computed(() => items.value);
watch(filter, () => { selected.value = ''; void load(); });
async function load(reset = true) {
  if (loading.value && !reset) return;
  const current = reset ? ++generation : generation;
  loading.value = true;
  failed.value = false;
  moreFailed.value = false;
  if (reset) { items.value = []; total.value = 0; }
  try {
    await session.ensure();
    const next = reset ? 1 : page.value + 1;
    const r = await api.nightStockOrders(next, 20, filter.value);
    if (current !== generation) return;
    items.value = reset ? r.items : [...items.value, ...r.items];
    total.value = r.total;
    page.value = next;
  } catch {
    if (current === generation) { if (reset) failed.value = true; else moreFailed.value = true; }
  } finally {
    if (current === generation) loading.value = false;
  }
}
onShow(() => load());
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
onReachBottom(() => {
  if (items.value.length < total.value) load(false);
});
function editReceipt(order: NightStockOrder) {
  selected.value = selected.value === order.id ? "" : order.id;
  receipt.value = Object.fromEntries(
    order.items.map((i) => [i.catalogProductId, String(i.quantity)]),
  );
}
const confirm = (title: string, content: string) =>
  new Promise<boolean>((resolve) =>
    uni.showModal({
      title,
      content,
      confirmText: '确认',
      cancelText: '取消',
      success: (r) => resolve(Boolean(r.confirm)),
      fail: () => resolve(false),
    }),
  );
async function cancel(order: NightStockOrder) {
  if (busy.value) return;
  busy.value = true;
  if (
    !(await confirm(
      "撤回备货申请",
      "撤回后释放本单预占额度，校区将不再处理本单。",
    ))
  ) { busy.value = false; return; }
  try {
    await api.nightCancelStock(order.id, "楼长主动撤回");
    await load();
  } catch {
  } finally {
    busy.value = false;
  }
}
async function receive(order: NightStockOrder) {
  if (busy.value) return;
  const lines = order.items.map((i) => ({
    catalogProductId: i.catalogProductId,
    quantity: Number(receipt.value[i.catalogProductId]),
  }));
  if (
    lines.some(
      (l, n) =>
        !Number.isInteger(l.quantity) ||
        l.quantity < 0 ||
        l.quantity > order.items[n].quantity,
    )
  ) {
    uni.showToast({ title: "实收数量须为0至出库数量的整数", icon: "none" });
    return;
  }
  const missing = order.items.reduce(
    (s, i, n) => s + i.quantity - lines[n].quantity,
    0,
  );
  busy.value = true;
  if (
    !(await confirm(
      "确认实际收货",
      missing
        ? `本单少收 ${missing} 件，将自动生成收货报损，审核通过后释放差额。实收数量确认后不可修改。`
        : "请核对每项实收数量。确认后整单入库，数量不可修改。",
    ))
  ) { busy.value = false; return; }
  try {
    await api.nightReceiveStock(order.id, lines);
    selected.value = "";
    await load();
    uni.showToast({ title: "已按实收数量入库", icon: "success" });
  } catch {
  } finally {
    busy.value = false;
  }
}
function setReceipt(id: string, e: unknown) {
  receipt.value[id] = (e as { detail: { value: string } }).detail.value;
}
function goReports() {
  uni.navigateTo({ url: "/pages/night/inventory?tab=reports" });
}
</script>
<template>
  <view class="page records-page">
    <view class="hero"
      ><button class="refresh-records" role="button" :disabled="loading" @tap="load()">{{ loading ? '刷新中' : '刷新' }}</button><text class="eyebrow">STOCK JOURNEY</text
      ><text class="title">每一份备货，都有迹可循</text
      ><text class="sub">申请 → 校区审核 → 整单出库 → 实收确认</text></view
    >
    <view class="filters">
      <button
        v-for="s in ['all', 'requested', 'approved', 'shipped', 'received', 'rejected', 'cancelled']"
        :key="s"
        :class="{ active: filter === s }"
        @tap="filter = s"
      >
        {{ s === "all" ? "全部" : statuses[s].split(" · ")[0] }}
      </button>
    </view>
    <view v-if="failed" class="card empty" @tap="load()"
      >加载失败，点击重试</view
    >
    <view v-for="o in shown" :key="o.id" class="card order">
      <view class="head"
        ><text>{{ formatShort(o.createdAt) }}</text
        ><text class="status">{{ statuses[o.status] || o.status }}</text></view
      >
      <text class="order-id">单号 {{ o.id.slice(-10).toUpperCase() }}</text>
      <view v-for="line in o.items" :key="line.catalogProductId" class="line">
        <view
          ><text class="name">{{ line.name }}</text
          ><text class="sub"
            >申请 {{ line.quantity }} 件 · ¥{{ fenToYuan(line.price) }}/件</text
          ></view
        >
        <input
          v-if="selected === o.id && o.status === 'shipped'"
          type="number"
          :aria-label="line.name + '实收数量'"
          :value="receipt[line.catalogProductId]"
          @input="setReceipt(line.catalogProductId, $event)"
        />
        <text v-else class="quantity">{{
          o.status === "received"
            ? "实收 " + line.receivedQuantity
            : "×" + line.quantity
        }}</text>
      </view>
      <view class="foot"
        ><text>申请货值 ¥{{ fenToYuan(o.totalValue) }}</text
        ><text>预占 ¥{{ fenToYuan(o.heldValue) }}</text></view
      >
      <text v-if="o.reason" class="note">处理说明：{{ o.reason }}</text>
      <text v-if="o.reviewedAt" class="note"
        >审核 {{ formatShort(o.reviewedAt) }}</text
      >
      <text v-if="o.shippedAt" class="note"
        >出库 {{ formatShort(o.shippedAt) }}</text
      >
      <text v-if="o.receivedAt" class="note"
        >收货 {{ formatShort(o.receivedAt) }}</text
      >
      <view v-if="o.status === 'requested'" class="actions"
        ><button :disabled="busy" @tap="cancel(o)">撤回申请</button></view
      >
      <view v-if="o.status === 'shipped'" class="actions">
        <button @tap="editReceipt(o)">
          {{ selected === o.id ? "收起" : "填写实收数量" }}
        </button>
        <button
          v-if="selected === o.id"
          class="primary"
          :disabled="busy"
          @tap="receive(o)"
        >
          确认收货入库
        </button>
      </view>
      <text v-if="selected === o.id && o.status === 'shipped'" class="note"
        >逐项核对实物；少收自动报损，审核通过后才释放差额。</text
      >
      <button
        v-if="
          o.status === 'received' &&
          o.items.some((i) => (i.receivedQuantity ?? i.quantity) < i.quantity)
        "
        class="report-link"
        @tap="goReports"
      >
        查看收货差异报损
      </button>
    </view>
    <view v-if="!shown.length && !loading && !failed" class="empty"
      >暂无该状态的备货单</view
    >
    <button
      v-if="items.length < total && !loading"
      class="more"
      @tap="load(false)"
    >
      {{ moreFailed ? '加载失败，点击重试' : '加载更多记录' }}
    </button>
    <text v-if="loading" class="empty">加载中…</text>
  </view>
</template>
<style scoped lang="scss">
@import "../../styles/night.scss";
.records-page {
  @include nb-page;
  min-height: 100vh;
  padding: 30rpx 24rpx 70rpx;
  box-sizing: border-box;
}
.hero {
  position: relative;
  @include nb-hero;
  padding: 34rpx;
  margin-bottom: 26rpx;
}
.refresh-records { position: absolute; top: 12px; right: 12px; min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; padding: 0 10px; margin: 0; border-radius: 12px; background: rgba(255,255,255,.06); color: #ffe082; font-size: 12px; }
.hero .title { padding-right: 48px; }
.eyebrow {
  display: block;
  font-size: 21rpx;
  letter-spacing: 3rpx;
  color: $nb-success;
}
.title {
  display: block;
  font-size: 32rpx;
  font-weight: 800;
  margin: 18rpx 0;
}
.sub,
.note {
  display: block;
  font-size: 23rpx;
  color: $nb-text-sub;
  line-height: 1.8;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-bottom: 24rpx;
}
button {
  background: $nb-gold-soft;
  color: $nb-gold;
  border-radius: 99rpx;
  font-size: 24rpx;
  margin: 0;
}
button::after {
  border: 0;
}
.filters button {
  padding: 0 22rpx;
  font-size: 22rpx;
}
.filters .active,
.primary {
  background: $nb-cta-gradient;
  color: $nb-gold-ink;
}
.card {
  @include nb-card;
  padding: 28rpx;
  margin-bottom: 22rpx;
}
.head,
.line,
.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18rpx;
}
.head {
  font-size: 23rpx;
  color: $nb-text-sub;
}
.status {
  color: $nb-gold;
}
.order-id {
  display: block;
  margin-top: 10rpx;
  font-size: 20rpx;
  color: $nb-text-dim;
}
.line {
  padding: 22rpx 0;
  border-bottom: 1px solid $nb-border;
}
.name {
  font-size: 27rpx;
  font-weight: 700;
}
.quantity {
  color: $nb-text-soft;
  font-size: 26rpx;
  flex-shrink: 0;
}
input {
  width: 110rpx;
  height: 70rpx;
  text-align: center;
  background: rgba(0, 0, 0, 0.2);
  color: $nb-gold;
  border: 1px solid $nb-border;
  border-radius: 16rpx;
}
.foot {
  font-size: 24rpx;
  padding: 22rpx 0 10rpx;
  color: $nb-gold;
  flex-wrap: wrap;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  margin: 18rpx 0;
}
.report-link {
  margin-top: 18rpx;
}
.empty {
  display: block;
  text-align: center;
  padding: 50rpx 0;
  color: $nb-text-sub;
  font-size: 26rpx;
}
.more {
  width: 70%;
  margin: 30rpx auto;
}
</style>
<style lang="scss">
@import "../../styles/night.scss";
page {
  background: $nb-bg;
}
</style>
