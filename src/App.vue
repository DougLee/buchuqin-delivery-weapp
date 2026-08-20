<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { useSessionStore } from "./stores/session";
onLaunch(() => void useSessionStore().ensure());
</script>
<style lang="scss">
@import "./styles/theme.scss";
page {
  background: $paper;
  color: $ink;
  font-family: "PingFang SC", "Helvetica Neue", sans-serif;
  font-size: 30rpx;
  line-height: 1.55;
}
view,
text,
image,
button,
input,
textarea {
  box-sizing: border-box;
}
button::after {
  border: none;
}
button,
view[role="button"] {
  touch-action: manipulation;
}
.page {
  min-height: 100vh;
  padding: 28rpx 28rpx 170rpx;
  overflow-x: hidden;
}
.card {
  background: rgba(255, 255, 255, 0.96);
  border: 2rpx solid rgba(7, 63, 45, 0.07);
  border-radius: 30rpx;
  box-shadow: 0 12rpx 36rpx rgba(7, 63, 45, 0.07);
}
.muted {
  color: $muted;
}
/* 向下小箭头（IK9U43/45/48）：仅月份 picker ▾ 提示用。右向 chevron 已
   全量移除（IK9VQ2）——两条边旋转出来的形状就是 >，道哥要求页面
   不再出现任何 > 形标记，可点暗示一律改用 .link-chip */
.chevron--down {
  display: inline-block;
  width: 14rpx;
  height: 14rpx;
  border-top: 3rpx solid currentColor;
  border-right: 3rpx solid currentColor;
  transform: rotate(135deg);
  opacity: 0.55;
  margin-bottom: 4rpx;
}
/* 可点暗示 chip（IK9VQ2）：绿底胶囊，无任何箭头形状 */
.link-chip {
  display: inline-flex;
  align-items: center;
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  background: rgba(24, 169, 87, 0.12);
  color: $primary-dark;
  font-size: 22rpx;
  font-weight: 800;
}
.link-chip:active {
  opacity: 0.8;
}
.primary-btn {
  min-height: 96rpx;
  border-radius: 28rpx;
  background: $primary-dark;
  color: #fff;
  font-size: 30rpx;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12rpx 24rpx rgba(7, 63, 45, 0.18);
}
.primary-btn:active {
  opacity: 0.88;
  transform: translateY(2rpx);
}
.section-title {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin: 38rpx 2rpx 20rpx;
}
.section-title__main {
  font-size: 36rpx;
  font-weight: 900;
  letter-spacing: -1rpx;
}
.section-title__sub {
  min-height: 48rpx;
  display: flex;
  align-items: center;
  font-size: 23rpx;
  color: $muted;
}
.status {
  padding: 7rpx 16rpx;
  border-radius: 999rpx;
  background: $soft;
  color: $primary-dark;
  font-size: 21rpx;
  font-weight: 800;
}
.empty {
  text-align: center;
  padding: 120rpx 20rpx;
  color: $muted;
}
@media (min-width: 560px) {
  /* 宽屏下以手机宽度居中呈现 */
  html,
  body {
    background: #e8ebe7;
  }
  uni-app,
  uni-page,
  uni-page-body,
  uni-page-refresh {
    max-width: 480px;
    margin-left: auto;
    margin-right: auto;
  }
  uni-app {
    min-height: 100vh;
    background: $paper;
    box-shadow: 0 0 32rpx rgba(7, 63, 45, 0.18);
  }
  .page {
    max-width: 480px;
    margin: 0 auto;
  }
  .uni-tabbar {
    max-width: 480px;
    left: 50% !important;
    transform: translateX(-50%);
  }
}
/* #ifdef H5 */
/* 无障碍：跟随系统减少动效。WXSS 不支持 * 通配符（app.wxss 编译报错），小程序端不注入此块 */
@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
    animation: none !important;
  }
}
/* #endif */
</style>
