<script setup lang="ts">
import { switchNightTab, type NightSection } from "../utils/nightMode";

/**
 * 夜宵模式自绘 TabBar（V4 定稿规格 3/6）：夜宵四 tab（夜宵店/订单/收入/我的）
 * 镜像白天 tabBar；深色 #101713 + 选中金黄 #ffd75e + 订单待接角标。
 * 夜宵三页（home/orders-tab/income-tab）与「我的」深色变体均挂本组件；
 * 切换复用白天自绘先例：普通页面 reLaunch，「我的」switchTab。
 * 图标沿用项目 CSS 绘制语言（无 SVG/emoji，全机型稳定）。
 */
defineProps<{
  /** 当前选中 tab */
  active: NightSection;
  /** 订单 tab 角标数（待接单数；0/缺省不渲染） */
  badge?: number;
}>();

const tabs: Array<{ key: NightSection; label: string }> = [
  { key: "home", label: "夜宵店" },
  { key: "orders", label: "订单" },
  { key: "income", label: "收入" },
  { key: "profile", label: "我的" },
];
const onTap = (key: NightSection) => switchNightTab(key);
</script>

<template>
  <view class="ntabbar">
    <view
      v-for="t in tabs"
      :key="t.key"
      class="ntabbar__item"
      :class="{ 'ntabbar__item--on': active === t.key }"
      role="button"
      :aria-label="t.label"
      @tap="onTap(t.key)"
    >
      <view class="ntabbar__icon-wrap">
        <!-- 图标四款：房子 / 购物袋 / ¥ / 人形（CSS 绘制） -->
        <view v-if="t.key === 'home'" class="ntabbar__ic ntabbar__ic--home"></view>
        <view v-else-if="t.key === 'orders'" class="ntabbar__ic ntabbar__ic--bag">
          <view class="ntabbar__bag-handle"></view>
        </view>
        <view v-else-if="t.key === 'income'" class="ntabbar__ic ntabbar__ic--yen">¥</view>
        <view v-else class="ntabbar__ic ntabbar__ic--person"></view>
        <!-- 订单待接角标 -->
        <view v-if="t.key === 'orders' && badge" class="ntabbar__dot">{{ badge > 99 ? "99+" : badge }}</view>
      </view>
      <text class="ntabbar__label">{{ t.label }}</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
@import "../styles/night.scss";
.ntabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  max-width: 480px;
  margin: 0 auto;
  z-index: 900;
  display: flex;
  background: linear-gradient(180deg, rgba(22, 49, 35, 0.97), #10271d);
  border-top: 1px solid $nb-border;
  padding: 14rpx 0 calc(14rpx + env(safe-area-inset-bottom, 0px));
}
.ntabbar__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5rpx;
  min-height: 44px;
  margin: 0 8rpx;
  padding: 5rpx 0;
  border-radius: 22rpx;
  font-size: 22rpx;
  color: $nb-text-sub;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 180ms ease, color 180ms ease;
}
.ntabbar__item--on {
  color: $nb-gold;
  background: $nb-gold-soft;
  font-weight: 800;
}
.ntabbar__icon-wrap {
  position: relative;
  width: 42rpx;
  height: 42rpx;
  display: grid;
  place-items: center;
}
/* 房子：屋顶三角 + 门洞 */
.ntabbar__ic--home {
  position: relative;
  width: 36rpx;
  height: 30rpx;
}
.ntabbar__ic--home:before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 6rpx;
  bottom: 0;
  border: 3rpx solid currentColor;
  border-radius: 4rpx;
}
.ntabbar__ic--home:after {
  content: "";
  position: absolute;
  left: 2rpx;
  right: 2rpx;
  top: -4rpx;
  height: 12rpx;
  border: 3rpx solid currentColor;
  border-bottom: none;
  border-left: none;
  border-right: none;
  transform: skewX(24deg) translateX(9rpx);
}
/* 购物袋：圆角袋身 + 提手 */
.ntabbar__ic--bag {
  position: relative;
  width: 28rpx;
  height: 30rpx;
  border: 3rpx solid currentColor;
  border-radius: 6rpx;
}
.ntabbar__bag-handle {
  position: absolute;
  left: 50%;
  top: -14rpx;
  width: 16rpx;
  height: 14rpx;
  margin-left: -8rpx;
  border: 3rpx solid currentColor;
  border-bottom: none;
  border-radius: 10rpx 10rpx 0 0;
}
/* ¥：ASCII 字形（全机型稳定，收入语义） */
.ntabbar__ic--yen {
  font-size: 32rpx;
  font-weight: 900;
  line-height: 1;
}
/* 人形：圆头 + 肩弧 */
.ntabbar__ic--person {
  position: relative;
  width: 34rpx;
  height: 32rpx;
}
.ntabbar__ic--person:before {
  content: "";
  position: absolute;
  left: 50%;
  top: 0;
  width: 14rpx;
  height: 14rpx;
  margin-left: -7rpx;
  border: 3rpx solid currentColor;
  border-radius: 50%;
}
.ntabbar__ic--person:after {
  content: "";
  position: absolute;
  left: 3rpx;
  right: 3rpx;
  bottom: 0;
  height: 14rpx;
  border: 3rpx solid currentColor;
  border-bottom: none;
  border-radius: 12rpx 12rpx 0 0;
}
/* 订单待接角标（V4 .dot 同款：橙底白字，右上角） */
.ntabbar__dot {
  position: absolute;
  top: -6rpx;
  right: -10rpx;
  min-width: 30rpx;
  height: 30rpx;
  border-radius: 999rpx;
  background: #e25c05;
  color: #fff;
  font-size: 18rpx;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6rpx;
  box-sizing: border-box;
}
.ntabbar__label {
  display: block;
}
@media (prefers-reduced-motion: reduce) {
  .ntabbar__item { transition: none; }
}
</style>
