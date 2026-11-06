<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import ProofImagePicker from "../../components/ProofImagePicker.vue";
import { useSessionStore } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import { formatShort } from "../../utils/datetime";
import type {
  NightProduct,
  NightInventoryReport,
  NightInventoryTxn,
} from "../../types";
const session = useSessionStore();
const tab = ref("stocktake");
const products = ref<NightProduct[]>([]);
const reports = ref<NightInventoryReport[]>([]);
const txns = ref<NightInventoryTxn[]>([]);
const reportPage = ref(1), reportTotal = ref(0), txnPage = ref(1), txnTotal = ref(0);
const moreLoading = ref(false);
let loadGeneration = 0;
const loading = ref(false),
  failed = ref(false),
  busy = ref(false),
  uploading = ref(false);
const keyword = ref(""),
  reason = ref(""),
  photos = ref<string[]>([]);
const selected = ref<Record<string, boolean>>({});
const counts = ref<Record<string, string>>({});
const versions = ref<Record<string, number>>({});
const resubmitId = ref("");
let requestId = "";
const reportKinds: Record<string, string> = {
  loss: "店内报损",
  stocktake: "库存盘点",
  "receipt-shortage": "收货差异报损",
  "order-loss": "退款未回库报损",
};
const reportStatuses: Record<string, string> = {
  pending: "待校区审核",
  approved: "已通过",
  rejected: "已驳回",
};
const txnTypes: Record<string, string> = {
  stockIn: "实收进货",
  saleOut: "订单预占",
  refundBack: "取消/退货回库",
  reportFreeze: "申报冻结",
  reportRelease: "驳回恢复",
  loss: "损耗确认",
  stocktake: "盘盈入库",
  adjust: "人工调整",
  returnOut: "退回出库",
};
const visible = computed(() =>
  products.value.filter((p) => p.name.includes(keyword.value.trim())),
);
const chosen = computed(() =>
  products.value.filter((p) => selected.value[p.id]),
);
const stale = computed(() =>
  chosen.value.some((p) => versions.value[p.id] !== p.inventoryVersion),
);
const isForm = computed(
  () => tab.value === "loss" || tab.value === "stocktake",
);
watch(
  [counts, selected, reason, photos, tab],
  () => {
    requestId = "";
  },
  { deep: true },
);
watch(tab, () => {
  selected.value = {};
  counts.value = {};
  resubmitId.value = "";
  reason.value = "";
  photos.value = [];
});
onLoad((query) => {
  if (query?.tab) tab.value = String(query.tab);
});
async function load(reset = false) {
  const generation = ++loadGeneration;
  loading.value = true;
  failed.value = false;
  try {
    await session.ensure();
    const [catalog, reportResult, txnResult] = await Promise.all([
      api.nightProducts(),
      api.nightInventoryReports(),
      api.nightInventoryTxns(),
    ]);
    if (generation !== loadGeneration) return;
    products.value = catalog;
    reports.value = reportResult.items;
    txns.value = txnResult.items;
    reportPage.value = reportResult.page;
    reportTotal.value = reportResult.total;
    txnPage.value = txnResult.page;
    txnTotal.value = txnResult.total;
    if (reset) {
      selected.value = {};
      counts.value = {};
      versions.value = {};
    }
  } catch {
    if (generation === loadGeneration) failed.value = true;
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}
onShow(() => { void load(); });
async function loadMore(kind: 'reports' | 'txns') {
  if (loading.value || moreLoading.value) return;
  const generation = loadGeneration;
  moreLoading.value = true;
  try {
    if (kind === 'reports') {
      const result = await api.nightInventoryReports(reportPage.value + 1);
      if (generation !== loadGeneration) return;
      const seen = new Set(reports.value.map(row => row.id));
      reports.value.push(...result.items.filter(row => !seen.has(row.id)));
      reportPage.value = result.page; reportTotal.value = result.total;
    } else {
      const result = await api.nightInventoryTxns(undefined, txnPage.value + 1);
      if (generation !== loadGeneration) return;
      const seen = new Set(txns.value.map(row => row.id));
      txns.value.push(...result.items.filter(row => !seen.has(row.id)));
      txnPage.value = result.page; txnTotal.value = result.total;
    }
  } catch { uni.showToast({ title: '加载失败，可点击重试', icon: 'none' }); }
  finally { moreLoading.value = false; }
}
function select(p: NightProduct) {
  if (busy.value) return;
  selected.value[p.id] = !selected.value[p.id];
  if (selected.value[p.id]) {
    counts.value[p.id] = tab.value === "stocktake" ? String(p.stock) : "1";
    versions.value[p.id] = p.inventoryVersion;
  }
}
function setCount(id: string, e: unknown) {
  counts.value[id] = (e as { detail: { value: string } }).detail.value;
}
function removePhoto(index: number) {
  if (!busy.value) photos.value.splice(index, 1);
}
function preview(url: string, urls: string[]) {
  uni.previewImage({ current: url, urls });
}
function toast(title: string) {
  uni.showToast({ title, icon: "none" });
}
async function submit() {
  if (busy.value || uploading.value) return;
  if (!reason.value.trim()) return toast("请填写原因或补充说明");
  if (!resubmitId.value && stale.value)
    return toast("库存已变化，请刷新库存后重新盘点");
  const items = chosen.value.map((p) => ({
    nightProductId: p.id,
    quantity: Number(counts.value[p.id]),
    inventoryVersion: versions.value[p.id],
  }));
  if (!resubmitId.value) {
    if (!items.length || items.length > 100) return toast("请选择1至100种商品");
    if (
      items.some(
        (i, n) =>
          !Number.isInteger(i.quantity) ||
          i.quantity < (tab.value === "loss" ? 1 : 0) ||
          i.quantity > 99999 ||
          (tab.value === "loss" && i.quantity > chosen.value[n].stock),
      )
    )
      return toast("数量不合法或超过可售库存");
    if (
      tab.value === "stocktake" &&
      items.every((i, n) => i.quantity === chosen.value[n].stock)
    )
      return toast("账实一致，无需提交差异");
  }
  busy.value = true;
  const confirmed = await new Promise<boolean>((resolve) =>
    uni.showModal({
      confirmText: '确认申报',
      cancelText: '再核对',
      title: resubmitId.value
        ? "补充报损说明"
        : tab.value === "loss"
          ? "确认报损申报"
          : "确认盘点差异",
      content:
        "盘亏和店内损耗会先冻结相应可售库存，审核通过后确认损耗并释放额度；盘盈通过后入库。盘点时请只计可售实物，待配送和已冻结数量单列。",
      success: (r) => resolve(Boolean(r.confirm)),
      fail: () => resolve(false),
    }),
  );
  if (!confirmed) { busy.value = false; return; }
  try {
    if (resubmitId.value)
      await api.nightResubmitLoss(
        resubmitId.value,
        reason.value.trim(),
        photos.value,
      );
    else {
      if (!requestId)
        requestId = `inventory-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await api.nightInventoryReport({
        requestId,
        kind: tab.value as "loss" | "stocktake",
        reason: reason.value.trim(),
        photos: photos.value,
        items,
      });
    }
    resubmitId.value = "";
    tab.value = "reports";
    reason.value = "";
    photos.value = [];
    await load();
    toast("已提交校区审核");
  } catch {
  } finally {
    busy.value = false;
  }
}
function resubmit(report: NightInventoryReport) {
  resubmitId.value = report.id;
  reason.value = report.reason;
  photos.value = report.photos ?? [];
}
</script>
<template>
  <view class="page inventory-page">
    <view class="hero"
      ><text class="eyebrow">INVENTORY CARE</text
      ><text class="title">让每一件库存，都清清楚楚</text
      ><text class="sub">如实盘点 · 损耗留痕 · 校区审核</text></view
    >
    <view class="tabs"
      ><button
        v-for="t in [
          { id: 'stocktake', name: '库存盘点' },
          { id: 'loss', name: '报损' },
          { id: 'reports', name: '申报记录' },
          { id: 'txns', name: '库存流水' },
        ]"
        :key="t.id"
        :class="{ active: tab === t.id }"
        :disabled="busy"
        @tap="tab = t.id"
      >
        {{ t.name }}
      </button></view
    >
    <view v-if="failed" class="card empty" @tap="load()"
      >加载失败，点击重试</view
    >
    <text v-if="loading" class="empty">正在核对库存…</text>
    <template v-else-if="!failed">
      <template v-if="isForm">
        <view v-if="stale" class="card hint"
          >所选商品库存已变化，已保留填写内容。请刷新库存后重新盘点再提交。</view
        >
        <button :disabled="busy" @tap="load(true)">刷新库存并重新盘点</button>
        <view class="card hint">{{
          tab === "stocktake"
            ? "只清点可售实物。待配送、已冻结数量单列，不重复计算；商品有正常出入库时请刷新后重新盘点。"
            : "提交后相应可售库存会先冻结，校区审核通过才释放额度；驳回恢复可售数量。"
        }}</view>
        <input v-model="keyword" class="search" placeholder="搜索商品名称" />
        <view v-for="p in visible" :key="p.id" class="card product">
          <view class="line"
            ><button
              class="select"
              :class="{ checked: selected[p.id] }"
              :aria-label="'选择' + p.name"
              @tap="select(p)"
            >
              {{ selected[p.id] ? "✓" : "+" }}</button
            ><view class="main"
              ><text class="name">{{ p.name }}</text
              ><text class="sub"
                >可售 {{ p.stock }} · 待配送 {{ p.pendingQuantity ?? 0 }} · 冻结
                {{ p.frozenStock }}</text
              ></view
            ></view
          >
          <view v-if="selected[p.id]" class="count-row"
            ><text>{{ tab === "stocktake" ? "实际可售数量" : "报损数量" }}</text
            ><input
              type="number"
              :aria-label="
                p.name + (tab === 'stocktake' ? '盘点实数' : '报损数量')
              "
              :value="counts[p.id]"
              @input="setCount(p.id, $event)"
          /></view>
        </view>
        <text v-if="!visible.length" class="empty">暂无商品，可先申请备货</text>
      </template>
      <template v-if="tab === 'reports'">
        <view v-for="r in reports" :key="r.id" class="card report">
          <view class="line between"
            ><text class="name">{{ reportKinds[r.kind] || r.kind }}</text
            ><text class="gold">{{
              reportStatuses[r.status] || r.status
            }}</text></view
          >
          <text class="sub"
            >{{ formatShort(r.createdAt) }} ·
            {{ r.id.slice(-8).toUpperCase() }}</text
          >
          <view v-for="i in r.items" :key="i.nightProductId" class="report-item"
            ><text>{{ i.name }}</text
            ><text
              >{{
                r.kind === "stocktake"
                  ? "账 " + i.bookQuantity + " → 实 " + i.countedQuantity
                  : "数量 " + i.quantity
              }}<text v-if="i.delta" class="gold"
                >（{{ i.delta > 0 ? "+" : "" }}{{ i.delta }}）</text
              ></text
            ></view
          >
          <text class="sub">申报说明：{{ r.reason }}</text
          ><text v-if="r.reviewReason" class="sub"
            >审核意见：{{ r.reviewReason }}</text
          ><text v-if="r.reviewedAt" class="sub"
            >审核时间：{{ formatShort(r.reviewedAt) }}</text
          >
          <text v-if="r.heldValue" class="hold"
            >仍占额度 ¥{{ fenToYuan(r.heldValue) }}，审核通过后释放</text
          >
          <view class="photos"
            ><image
              v-for="url in r.photos || []"
              :key="url"
              :src="url"
              mode="aspectFill"
              @tap="preview(url, r.photos || [])"
          /></view>
          <button
            v-if="
              r.status === 'rejected' &&
              ['receipt-shortage', 'order-loss'].includes(r.kind)
            "
            @tap="resubmit(r)"
          >
            补充说明重新报审
          </button>
        </view>
        <text v-if="!reports.length" class="empty">暂无盘点或报损记录</text>
        <button v-if="reports.length < reportTotal" class="load-more" :disabled="moreLoading" @tap="loadMore('reports')">{{ moreLoading ? '加载中…' : '查看更早申报记录' }}</button>
      </template>
      <template v-if="tab === 'txns'">
        <view v-for="t in txns" :key="t.id" class="card"
          ><view class="line between"
            ><text class="name">{{ t.product.catalogProduct.name }}</text
            ><text class="gold"
              >{{ t.delta > 0 ? "+" : "" }}{{ t.delta }}</text
            ></view
          ><text class="sub"
            >{{ txnTypes[t.type] || t.type }} · 变动后可售
            {{ t.afterStock }}</text
          ><text class="sub">{{ t.remark }}</text
          ><text class="sub">{{ formatShort(t.createdAt) }}</text></view
        >
        <text class="hint"
          >共{{ txnTotal }}条可售库存流水，已加载{{ txns.length }}条。冻结已扣可售，审核损耗时不重复扣减。</text
        >
        <button v-if="txns.length < txnTotal" class="load-more" :disabled="moreLoading" @tap="loadMore('txns')">{{ moreLoading ? '加载中…' : '查看更早库存流水' }}</button>
      </template>
      <view v-if="isForm || resubmitId" class="card form">
        <text class="name">{{ resubmitId ? "补充报损说明" : "申报说明" }}</text>
        <textarea
          v-model="reason"
          maxlength="500"
          placeholder="请填写盘点差异、损耗原因或补充核对结果"
        />
        <view class="photos"
          ><view v-for="(url, n) in photos" :key="url"
            ><image
              :src="url"
              mode="aspectFill"
              @tap="preview(url, photos)"
            /><button @tap="removePhoto(n)">移除</button></view
          ></view
        >
        <ProofImagePicker v-if="photos.length < 6" v-model="photos" :max="6" :disabled="busy" label="拍照 / 上传凭证（选填）" @busy="uploading = $event" />
        <button
          class="primary submit"
          :disabled="busy || uploading"
          @tap="submit"
        >
          {{ busy ? "正在提交…" : resubmitId ? "重新报审" : "提交校区审核" }}
        </button>
      </view>
    </template>
  </view>
</template>
<style scoped lang="scss">
.load-more { min-height: 88rpx; background: transparent; color: #ffe082; font-size: 24rpx; }
@import "../../styles/night.scss";
.inventory-page {
  @include nb-page;
  min-height: 100vh;
  padding: 28rpx 24rpx 80rpx;
  box-sizing: border-box;
}
.hero {
  @include nb-hero;
  padding: 34rpx;
  margin-bottom: 26rpx;
}
.eyebrow {
  display: block;
  font-size: 21rpx;
  letter-spacing: 3rpx;
  color: $nb-success;
}
.title {
  display: block;
  font-size: 31rpx;
  font-weight: 800;
  margin: 18rpx 0;
}
.sub,
.hint {
  display: block;
  font-size: 23rpx;
  color: $nb-text-sub;
  line-height: 1.8;
}
.tabs {
  display: flex;
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
.tabs button {
  flex: 1;
  padding: 0 8rpx;
  font-size: 23rpx;
}
.active,
button.primary {
  background: $nb-cta-gradient;
  color: $nb-gold-ink;
}
.card {
  @include nb-card;
  padding: 28rpx;
  margin-bottom: 20rpx;
}
.line {
  display: flex;
  align-items: center;
  gap: 18rpx;
}
.between {
  justify-content: space-between;
}
.main {
  flex: 1;
}
.name {
  font-size: 27rpx;
  font-weight: 700;
}
.gold {
  color: $nb-gold;
  font-size: 25rpx;
}
.search {
  height: 80rpx;
  padding: 0 24rpx;
  border-radius: 24rpx;
  border: 1px solid $nb-border;
  margin: 24rpx 0;
  background: rgba(0, 0, 0, 0.12);
}
.select {
  width: 64rpx;
  height: 64rpx;
  line-height: 64rpx;
  padding: 0;
  flex-shrink: 0;
}
.checked {
  background: $nb-gold;
  color: $nb-gold-ink;
}
.count-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20rpx;
  font-size: 25rpx;
  color: $nb-text-sub;
}
.count-row input {
  width: 130rpx;
  height: 70rpx;
  border: 1px solid $nb-border;
  border-radius: 16rpx;
  text-align: center;
  color: $nb-gold;
}
textarea {
  width: 100%;
  height: 160rpx;
  font-size: 25rpx;
  padding: 22rpx 0;
  box-sizing: border-box;
  color: $nb-text;
}
.photos {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  margin: 18rpx 0;
}
.photos image {
  width: 130rpx;
  height: 130rpx;
  border-radius: 16rpx;
}
.photos button {
  font-size: 21rpx;
}
.report-item {
  display: flex;
  justify-content: space-between;
  gap: 18rpx;
  padding: 18rpx 0;
  border-bottom: 1px solid $nb-border;
  font-size: 24rpx;
}
.hold {
  display: block;
  color: $nb-gold;
  font-size: 23rpx;
  margin: 16rpx 0;
}
.submit {
  margin-top: 24rpx;
}
.empty {
  display: block;
  text-align: center;
  padding: 60rpx 0;
  color: $nb-text-sub;
}
</style>
<style lang="scss">
@import "../../styles/night.scss";
page {
  background: $nb-bg;
}
</style>
