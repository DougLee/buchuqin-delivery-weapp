<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { api } from "../api";
import { fenToYuan } from "../utils/money";
import { nightStoreStatusText } from "../utils/night";
import { fetchBizContext, goNightWorkspace } from "../utils/nightMode";
import type { NightDashboard } from "../types";

/**
 * 白天工作台插槽卡（V4 定稿规格 7，画面⑤ 白卡同体系融入版）：
 * 白卡 + 细描边 + 月牙小标 + 「我的夜宵店 · 楼栋」 + 状态徽章 + 一行数据摘要
 * （押金/库存货值/额度）+ 进入；整卡点击进夜宵工作台（navigateTo 保留返回栈）。
 *
 * 渲染门控：仅「楼长且有夜宵经营资格」显示（父页面已按楼长角色挂载，
 * 组件内再按 hasNightStore 复核；配送员/无夜宵店/加载失败一律不渲染，
 * 白天端其余内容零影响——本组件是纯增量插入）。
 * 楼长登录常显（白天/rest 也可见）；营业中徽章金黄「营业中 · N 待接」。
 */
const dash = ref<NightDashboard>();
/** 营业语境（mode + hasNightStore + 窗口时间） */
const hasStore = ref(false);
const loaded = ref(false);

async function load() {
  // 仅登录楼长继续拉数据；无 token（游客）直接不渲染
  if (!uni.getStorageSync("staffToken")) return;
  try {
    const ctx = await fetchBizContext();
    hasStore.value = ctx.hasNightStore;
    if (!ctx.hasNightStore) return;
    // 工作台摘要数据（押金/库存/额度/待接）；失败静默保持骨架缺省
    dash.value = await api.nightDashboard();
  } catch {
    /* 静默：插槽卡是增量信息，拉不到不渲染不影响白天工作台 */
  } finally {
    loaded.value = true;
  }
}
onShow(load);

/** 组件整体渲染条件：有夜宵店（楼长资格由父页面 + 服务端 hasNightStore 双保险） */
const visible = computed(() => loaded.value && hasStore.value);
/** 状态徽章：营业中金黄「营业中 · N 待接」；其余中性「已打烊/暂停营业/已停业」 */
const isOpen = computed(() => dash.value?.store.status === "open");
const badgeText = computed(() =>
  isOpen.value
    ? `营业中 · ${dash.value?.pendingOrders ?? 0} 待接`
    : dash.value
      ? nightStoreStatusText(dash.value.store.status)
      : "",
);
/** 一行摘要：押金 / 库存货值 / 可进货额度（额度=押金-库存，下限 0） */
const quota = computed(() => {
  const d = dash.value;
  if (!d) return 0;
  return Math.max(0, d.deposit - d.stockValue);
});
const enter = () => goNightWorkspace();
</script>

<template>
  <!-- V4 帧⑤：白卡同体系状态卡（细描边 + 月牙小标），融入白天工作台，不抢视觉 -->
  <view v-if="visible" class="ns-card" role="button" aria-label="进入我的夜宵店" @tap="enter">
    <view class="ns-card__row">
      <view class="ns-card__moon"></view>
      <text class="ns-card__title">我的夜宵店{{ dash?.store.buildingName ? ` · ${dash.store.buildingName}` : "" }}</text>
      <text v-if="badgeText" class="ns-card__badge" :class="{ 'ns-card__badge--on': isOpen }">{{
        badgeText
      }}</text>
    </view>
    <view class="ns-card__foot">
      <text class="ns-card__sum"
        >押金 <text class="emb">{{ dash ? `¥${fenToYuan(dash.deposit)}` : "--" }}</text> · 库存货值
        <text class="emb">{{ dash ? `¥${fenToYuan(dash.stockValue)}` : "--" }}</text> · 额度
        <text class="emb">{{ dash ? `¥${fenToYuan(quota)}` : "--" }}</text></text
      >
      <text class="ns-card__go">进入 ›</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
@import "../styles/theme.scss";
/* V4 帧⑤ .ns-card 同款：白卡 + 细描边 #e2ebe4，与白天卡片同体系 */
.ns-card {
  margin: 22rpx 0 0;
  border-radius: 30rpx;
  background: #fff;
  border: 1px solid #e2ebe4;
  padding: 26rpx 28rpx;
  box-shadow: 0 6rpx 20rpx rgba(18, 53, 31, 0.05);
}
.ns-card:active {
  background: $soft;
}
.ns-card__row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
/* 月牙小标：金黄亮面 + 白色缺口（CSS 圆缺法，无 > 形字符） */
.ns-card__moon {
  flex: none;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffd75e, #f5b81e);
  position: relative;
}
.ns-card__moon:after {
  content: "";
  position: absolute;
  right: -4rpx;
  top: -5rpx;
  width: 30rpx;
  height: 30rpx;
  border-radius: 50%;
  background: #fff;
}
.ns-card__title {
  flex: 1;
  min-width: 0;
  font-size: 27rpx;
  font-weight: 900;
  color: $ink;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 状态徽章：未开业/已打烊=米黄；营业中=金黄实底 */
.ns-card__badge {
  flex: none;
  font-size: 20rpx;
  font-weight: 800;
  background: #fff2d8;
  color: #b07800;
  border-radius: 999rpx;
  padding: 7rpx 18rpx;
}
.ns-card__badge--on {
  background: #ffd75e;
  color: #6b4a00;
}
.ns-card__foot {
  margin-top: 20rpx;
  padding-top: 18rpx;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  font-size: 21rpx;
  color: #8a978d;
  font-variant-numeric: tabular-nums;
}
.ns-card__sum {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 加粗强调用 .emb 类：组件 wxss 不允许 b 标签选择器（工具告警+样式失效） */
.ns-card__sum .emb {
  color: #0d6b3a;
  font-weight: 900;
}
.ns-card__go {
  flex: none;
  margin-left: 16rpx;
  font-weight: 800;
  color: #07883b;
}
</style>
