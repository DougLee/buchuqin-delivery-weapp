<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { useSessionStore } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import { formatShort } from "../../utils/datetime";
import type { NightAfterSaleItem } from "../../types";

/**
 * 售后处理页（IKXW9K）：夜宵售后单下放楼长。
 * 待处理/已处理双 tab；正式楼长可同意（原路退回、不自动回库）/拒绝
 * （理由必填、用户可见）；实习楼长仅可转交平台。申请超 24h 系统自动
 * 升级平台（后台置顶处理）。
 */
const session = useSessionStore();
const isIntern = computed(() => session.role === "intern-building-manager");
const tab = ref<"pending" | "handled">("pending");
const items = ref<NightAfterSaleItem[]>([]);
const pendingCount = ref(0);
const loading = ref(false);
const acting = ref("");

async function load() {
  if (!uni.getStorageSync("staffToken")) return;
  loading.value = true;
  try {
    await session.ensure();
    if (tab.value === "pending") {
      const summary = await api
        .nightAfterSalesSummary()
        .catch(() => undefined);
      pendingCount.value = summary?.pending ?? 0;
    }
    items.value = await api.nightAfterSales(tab.value);
  } catch {
    /* 静默：下拉重进可恢复 */
  } finally {
    loading.value = false;
  }
}
onShow(() => {
  load();
});

function switchTab(t: "pending" | "handled") {
  if (tab.value === t) return;
  tab.value = t;
  void load();
}

function isOverdue(item: NightAfterSaleItem): boolean {
  return !!item.appliedAt && Date.now() - new Date(item.appliedAt).getTime() > 24 * 60 * 60 * 1000;
}

function statusChip(item: NightAfterSaleItem): string {
  if (item.refund) {
    const s = item.refund.status;
    if (s === "succeeded" || s === "success") return "已退款";
    if (s === "failed") return "退款失败";
    return "退款处理中";
  }
  if (item.afterSaleStatus === "requested") {
    if (isOverdue(item)) return "已超时·平台处理";
    if (item.escalated) return "已转交平台";
    return "待处理";
  }
  return {
    "refund-processing": "退款处理中",
    resolved: "已退款",
    rejected: "已拒绝",
    withdrawn: "用户已撤回",
  }[item.afterSaleStatus ?? ""] ?? "—";
}

function isHotChip(item: NightAfterSaleItem): boolean {
  const chip = statusChip(item);
  return chip === "已超时·平台处理" || chip === "已转交平台" || chip === "退款失败";
}

function preview(urls: string[], current: string) {
  uni.previewImage({ urls, current });
}

function showActionError(err: unknown, fallback: string) {
  const msg = err instanceof Error && err.message ? err.message : fallback;
  uni.showToast({ title: msg.slice(0, 30), icon: "none" });
}

function approve(item: NightAfterSaleItem) {
  const amount = fenToYuan(item.refund?.totalAmount ?? item.requestedAmount ?? item.payableAmount);
  uni.showModal({
    title: "同意退款",
    content: `将原路退回 ¥${amount}（不自动回库存），佣金同步冲减。确认？`,
    success: async (res) => {
      if (!res.confirm || acting.value) return;
      acting.value = item.id;
      try {
        const ret = await api.nightAfterSaleApprove(item.id);
        uni.showToast({
          title: ret?.afterSaleStatus === "resolved" ? "已同意，退款成功" : "已同意，原路退回中",
          icon: "none",
        });
        void load();
      } catch (err) {
        showActionError(err, "同意退款失败，请稍后重试");
      } finally {
        acting.value = "";
      }
    },
  });
}

function reject(item: NightAfterSaleItem) {
  uni.showModal({
    title: "拒绝售后",
    editable: true,
    placeholderText: "请填写拒绝理由（用户可见，必填）",
    success: async (res) => {
      const reason = res.content?.trim();
      if (!res.confirm || acting.value) return;
      if (!reason) {
        uni.showToast({ title: "请填写拒绝理由", icon: "none" });
        return;
      }
      acting.value = item.id;
      try {
        await api.nightAfterSaleReject(item.id, reason);
        uni.showToast({ title: "已拒绝", icon: "none" });
        void load();
      } catch (err) {
        showActionError(err, "拒绝失败，请稍后重试");
      } finally {
        acting.value = "";
      }
    },
  });
}

function escalate(item: NightAfterSaleItem) {
  uni.showModal({
    title: "转交平台处理",
    content: "转交后由平台跟进本单售后，确认？",
    success: async (res) => {
      if (!res.confirm || acting.value) return;
      acting.value = item.id;
      try {
        await api.nightAfterSaleEscalate(item.id);
        uni.showToast({ title: "已转交平台处理", icon: "none" });
        void load();
      } catch (err) {
        showActionError(err, "转交失败，请稍后重试");
      } finally {
        acting.value = "";
      }
    },
  });
}
</script>

<template>
  <view class="page">
    <view class="tabs">
      <view class="tab" :class="{ 'tab--on': tab === 'pending' }" role="button" @tap="switchTab('pending')">
        <text>待处理</text><text v-if="pendingCount" class="tab__bubble">{{ pendingCount > 99 ? "99+" : pendingCount }}</text>
      </view>
      <view class="tab" :class="{ 'tab--on': tab === 'handled' }" role="button" @tap="switchTab('handled')">
        <text>已处理</text>
      </view>
    </view>

    <view v-if="!items.length && !loading" class="empty">
      <text class="empty__title">{{ tab === "pending" ? "没有待处理的售后" : "还没有处理记录" }}</text>
      <text class="empty__sub">用户申请售后会出现在这里，并推送提醒您</text>
    </view>

    <view v-for="item in items" :key="item.id" class="card as">
      <view class="as__top">
        <text class="as__no">{{ item.orderNo }}</text>
        <text class="as__chip" :class="{ 'as__chip--hot': isHotChip(item) }">{{ statusChip(item) }}</text>
      </view>
      <view class="as__user">{{ item.contactName }} · {{ item.buildingName }} {{ item.room }}</view>
      <view class="as__type">
        <text class="as__type-tag">{{ item.type }}</text>
        <text class="as__amount">申请退 ¥{{ fenToYuan(item.requestedAmount ?? item.payableAmount) }}</text>
      </view>
      <view v-if="item.requestedItems?.length" class="as__items">
        <text v-for="g in item.requestedItems" :key="g.productId" class="as__item-pill">{{ g.name }} ×{{ g.quantity }}</text>
      </view>
      <view class="as__desc">{{ item.description }}</view>
      <view v-if="item.images?.length" class="as__imgs">
        <image
          v-for="(img, i) in item.images"
          :key="img"
          :src="img"
          mode="aspectFill"
          class="as__img"
          @tap="preview(item.images, item.images[i])"
        />
      </view>
      <view class="as__meta">申请时间 {{ item.appliedAt ? formatShort(item.appliedAt) : "—" }} · 订单金额 ¥{{ fenToYuan(item.payableAmount) }}</view>
      <view v-if="item.refund" class="as__refund">
        退款 ¥{{ fenToYuan(item.refund.totalAmount) }} · {{ statusChip(item) }}
        <text v-if="item.refund.completedAt"> · {{ formatShort(item.refund.completedAt) }}</text>
      </view>
      <view v-if="tab === 'pending'" class="as__actions">
        <button
          v-if="isIntern"
          class="as__btn as__btn--primary"
          :disabled="acting === item.id || !!item.escalated"
          @tap="escalate(item)"
        >
          {{ item.escalated ? "已转交平台处理" : "转交平台处理" }}
        </button>
        <template v-else>
          <button class="as__btn" :disabled="acting === item.id" @tap="reject(item)">拒绝</button>
          <button class="as__btn as__btn--primary" :disabled="acting === item.id" @tap="approve(item)">同意退款</button>
        </template>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
@import "../../styles/night.scss";

.page { min-height: 100vh; padding: 20rpx 24rpx 60rpx; box-sizing: border-box; background: #10271d; }
.tabs {
  display: flex; gap: 16rpx; margin-bottom: 20rpx;
}
.tab {
  position: relative; flex: 1; min-height: 72rpx; display: flex; align-items: center; justify-content: center; gap: 8rpx;
  border: 1px solid $nb-border; border-radius: 20rpx; color: $nb-text-sub; font-size: 27rpx; background: rgba(255, 255, 255, 0.04);
}
.tab--on { color: $nb-gold; background: #214c36; border-color: #6a7d56; font-weight: 700; }
.tab__bubble {
  min-width: 34rpx; height: 34rpx; padding: 0 8rpx; border-radius: 34rpx;
  background: #e34d3f; color: #fff; font-size: 20rpx; line-height: 34rpx; text-align: center;
}
.empty { display: flex; flex-direction: column; align-items: center; gap: 12rpx; padding: 120rpx 40rpx; text-align: center; color: $nb-text-sub; font-size: 25rpx; }
.empty__title { color: $nb-text; font-size: 31rpx; font-weight: 800; }
.card.as {
  display: flex; flex-direction: column; gap: 10rpx; margin-bottom: 20rpx; padding: 24rpx;
  border: 1px solid $nb-border; border-radius: 24rpx; background: $nb-surface; box-shadow: $nb-card-highlight;
}
.as__top { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
.as__no { color: $nb-text; font-size: 26rpx; font-weight: 700; }
.as__chip { flex: none; padding: 4rpx 14rpx; border-radius: 999rpx; background: rgba(158, 223, 178, 0.12); color: $nb-gold; font-size: 21rpx; }
.as__chip--hot { background: rgba(227, 77, 63, 0.16); color: #ff9d8f; }
.as__user { color: $nb-text-sub; font-size: 24rpx; }
.as__type { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
.as__type-tag { padding: 4rpx 14rpx; border-radius: 10rpx; background: rgba(158, 223, 178, 0.1); color: $nb-text; font-size: 23rpx; }
.as__amount { color: $nb-gold; font-size: 28rpx; font-weight: 800; font-variant-numeric: tabular-nums; }
.as__items { display: flex; flex-wrap: wrap; gap: 8rpx; }
.as__item-pill { padding: 4rpx 12rpx; border-radius: 8rpx; background: rgba(255, 255, 255, 0.06); color: $nb-text-sub; font-size: 22rpx; }
.as__desc { color: $nb-text; font-size: 25rpx; line-height: 1.5; word-break: break-all; }
.as__imgs { display: flex; gap: 12rpx; flex-wrap: wrap; }
.as__img { width: 140rpx; height: 140rpx; border-radius: 12rpx; background: rgba(255, 255, 255, 0.06); }
.as__meta { color: $nb-text-sub; font-size: 21rpx; }
.as__refund { color: $nb-gold; font-size: 22rpx; }
.as__actions { display: flex; gap: 16rpx; margin-top: 6rpx; }
.as__btn {
  flex: 1; min-height: 72rpx; margin: 0; display: flex; align-items: center; justify-content: center;
  border: 1px solid #6a7d56; border-radius: 18rpx; background: rgba(255, 255, 255, 0.04);
  color: $nb-text; font-size: 26rpx;
}
.as__btn::after { border: 0; }
.as__btn--primary { background: #214c36; color: $nb-gold; font-weight: 700; }
.as__btn[disabled] { opacity: 0.6; }
</style>
