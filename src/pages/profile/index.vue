<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { useSessionStore } from "../../stores/session";
import type { Performance, StaffProfile, StaffStatus } from "../../types";
const session = useSessionStore(),
  profile = ref<StaffProfile>(),
  performance = ref<Performance>(),
  /** IK8W5V：加载失败标记，展示重试入口避免页面永久空白 */
  error = ref(false),
  /** 首屏加载中（IK9VF8）：驱动骨架屏，对齐 tasks/income 标准 */
  loading = ref(false);
const statusDesc: Record<StaffStatus, string> = {
  online: "当前可接收新任务",
  paused: "暂停中，暂不派新单",
  offline: "已下线休息",
};
const statusText: Record<StaffStatus, string> = {
  online: "接单中",
  paused: "暂停接单",
  offline: "已下线",
};
/** IK8W5V：优秀履约员徽章按真实绩效（准时率≥95）显示，不再常亮 */
const excellent = computed(
  () => (performance.value?.onTimeRate ?? 0) >= 95,
);
async function load() {
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    profile.value = await api.profile(session.role);
    performance.value = await api.performance(session.role);
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
onShow(load);
/** 履约规范（IK9AX0）：原「帮助」行是带箭头的死菜单，点开真内容 */
function help() {
  uni.showModal({
    title: "履约规范速览",
    content:
      "1. 取货：到仓扫码/输编号，核对件数\n2. 交接：楼下与楼长当面交接确认\n3. 送达：敲门送达，上传凭证照\n4. 请假：至少提前 2 小时提交\n5. 异常：用户不在/拒收及时上报",
    showCancel: false,
    confirmText: "知道了",
  });
}
/** 退出登录（IK9U4H）：清登录态回登录页 */
function logout() {
  uni.showModal({
    title: "退出登录",
    content: "确定退出当前账号吗？",
    confirmColor: "#a74432",
    success: (m) => {
      if (!m.confirm) return;
      uni.removeStorageSync("staffToken");
      uni.reLaunch({ url: "/pages/login/index" });
    },
  });
}
</script>
<template>
  <view v-if="error" class="page profile"
    ><view class="retry card" role="button" @tap="load"
      ><text class="retry__title">加载失败</text
      ><text class="retry__sub">网络异常或服务暂不可用，点击重试</text></view
    ></view
  >
  <!-- 首屏骨架（IK9VF8）：profile 卡 + KPI + 菜单占位 -->
  <view v-else-if="loading" class="page profile"
    ><view class="profile-skeleton__card" /><view class="profile-skeleton__kpi" /><view
      class="profile-skeleton__menu"
    /></view
  >
  <view v-else-if="profile" class="page profile"
    ><view class="profile-card"
      ><view class="person"
        ><view class="avatar"
          ><text>{{ profile.name.slice(0, 1) }}</text
          ><view class="avatar__dot"></view></view
        ><view
          ><text class="name">{{ profile.name }}</text
          ><text class="staff"
            >{{ profile.roleText }} · {{ profile.staffNo }}</text
          ></view
        ></view
      ><!-- IK8W5V：徽章按真实绩效（准时率≥95）显示 -->
      ><view v-if="excellent" class="badge">优秀履约员</view></view
    ><view class="kpi card"
      ><view
        ><text>{{ Math.round(performance?.onTimeRate ?? 0) }}%</text
        ><text>准时率</text></view
      ><view
        ><text>{{
          performance?.proofRate == null
            ? "—"
            : `${Math.round(performance.proofRate)}%`
        }}</text
        ><text>凭证完整率</text></view
      ><view
        ><text>{{ performance?.completed ?? 0 }}</text
        ><text>今日完成</text></view
      ></view
    >
    ><view class="section-title"
      ><view
        ><text class="kicker">ACCOUNT</text
        ><text class="section-title__main">履约设置</text></view
      ></view
    ><view class="menu card"
      ><view role="button" @tap="uni.navigateTo({ url: '/pages/leave/index' })"
        ><view class="menu__icon calendar"></view
        ><view class="menu__body"
          ><text>请假与跨楼调配</text
          ><text>排班、请假、接受临时调配</text></view
        ><text class="chevron"/></view
      ><!-- IK9AX0：服务楼栋是信息展示行，去掉误导导航的箭头 -->
      ><view
        ><view class="menu__icon building"></view
        ><view class="menu__body"
          ><text>服务楼栋</text><text>{{ profile.building }}</text></view
        ></view
      ><view
        ><view class="menu__icon pulse"></view
        ><view class="menu__body"
          ><text>工作状态</text
          ><text>{{ statusDesc[profile.status] }}</text></view
        ><text class="online-text">{{ statusText[profile.status] }}</text></view
      ><!-- IK9AX0：帮助行接真内容（规范速览弹窗），不再是死箭头 -->
      ><view role="button" @tap="help"
        ><view class="menu__icon help"></view
        ><view class="menu__body"
          ><text>履约规范与帮助</text><text>标准流程速览</text></view
        ><text class="chevron"/></view
      ><!-- IK9U4H：退出登录入口 -->
      ><view role="button" class="menu__logout" @tap="logout"
        ><view class="menu__icon logout"></view
        ><view class="menu__body"
          ><text>退出登录</text><text>清除本机登录态并返回登录页</text></view
        ></view
      ></view
    ><!-- IK9U49：删「履约支持 09:00-22:30」底栏 --></view
  >
</template>
<style scoped lang="scss">
@import "../../styles/theme.scss";
.profile {
  padding-top: 42rpx;
  background:
    radial-gradient(
      circle at 80% 5%,
      rgba(185, 242, 39, 0.27),
      transparent 28%
    ),
    linear-gradient(180deg, #dcefe2 0, $paper 520rpx);
}
.profile-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx;
  border-radius: 34rpx;
  background: $primary-dark;
  color: #fff;
}
.person {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.avatar {
  position: relative;
  width: 104rpx;
  height: 104rpx;
  border-radius: 30rpx;
  background: $lime;
  color: $primary-dark;
  display: grid;
  place-items: center;
  font-size: 45rpx;
  font-weight: 900;
}
.avatar__dot {
  position: absolute;
  right: -5rpx;
  bottom: -5rpx;
  width: 23rpx;
  height: 23rpx;
  border: 5rpx solid $primary-dark;
  background: $primary;
  border-radius: 50%;
}
.name,
.staff {
  display: block;
}
.name {
  font-size: 38rpx;
  font-weight: 900;
}
.staff {
  font-size: 20rpx;
  opacity: 0.65;
  margin-top: 3rpx;
}
.badge {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: rgba(185, 242, 39, 0.14);
  color: $lime;
  font-size: 20rpx;
  font-weight: 800;
}
.kpi {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 22rpx 0;
  padding: 25rpx 6rpx;
  text-align: center;
}
.kpi > view + view {
  border-left: 2rpx solid $line;
}
.kpi text {
  display: block;
}
.kpi text:first-child {
  font-size: 31rpx;
  font-weight: 900;
  color: $primary-dark;
}
.kpi text:last-child {
  font-size: 20rpx;
  color: $muted;
  margin-top: 4rpx;
}
.kicker {
  display: block;
  color: $primary;
  font-size: 20rpx;
  font-weight: 900;
  letter-spacing: 3rpx;
}
.menu {
  padding: 2rpx 24rpx;
}
.menu > view {
  min-height: 124rpx;
  display: flex;
  align-items: center;
  gap: 18rpx;
  border-bottom: 2rpx solid $line;
}
.menu > view:last-child {
  border-bottom: none;
}
.menu__icon {
  width: 64rpx;
  height: 64rpx;
  border-radius: 19rpx;
  background: $soft;
  position: relative;
}
/* 菜单图标 CSS 绘制（IK9VF8）：替代 "31"/"5F"/"ON" 文本假图标 */
/* 日历：圆角外框 + 顶部双穿孔针 */
.calendar:before {
  content: "";
  position: absolute;
  left: 13rpx;
  right: 13rpx;
  top: 17rpx;
  bottom: 9rpx;
  border: 4rpx solid $primary-dark;
  border-radius: 8rpx;
}
.calendar:after {
  content: "";
  position: absolute;
  left: 21rpx;
  right: 21rpx;
  top: 11rpx;
  height: 12rpx;
  border-left: 4rpx solid $primary-dark;
  border-right: 4rpx solid $primary-dark;
  border-radius: 2rpx;
}
/* 楼栋：高矮双楼剪影 */
.building:before {
  content: "";
  position: absolute;
  left: 12rpx;
  top: 12rpx;
  width: 20rpx;
  height: 36rpx;
  border: 4rpx solid $primary-dark;
  border-radius: 6rpx 6rpx 0 0;
}
.building:after {
  content: "";
  position: absolute;
  right: 11rpx;
  bottom: 12rpx;
  width: 14rpx;
  height: 24rpx;
  border: 4rpx solid $primary-dark;
  border-radius: 6rpx 6rpx 0 0;
}
/* 工作状态：实心点 + 扩散环（与首页 online__dot 同语义） */
.pulse:before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 18rpx;
  height: 18rpx;
  margin: -9rpx 0 0 -9rpx;
  border-radius: 50%;
  background: $primary;
}
.pulse:after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 34rpx;
  height: 34rpx;
  margin: -17rpx 0 0 -17rpx;
  border-radius: 50%;
  border: 4rpx solid rgba(7, 136, 59, 0.28);
}
/* 帮助/退出：ASCII 字形全机型稳定，圆环包裹成 icon 观感 */
.help:before,
.logout:before {
  position: absolute;
  inset: 8rpx;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 4rpx solid $primary-dark;
  font-size: 24rpx;
  font-weight: 900;
  color: $primary-dark;
}
.help:before {
  content: "?";
}
.logout:before {
  content: "×";
  border-color: #a74432;
  color: #a74432;
}
.menu__logout {
  color: #a74432;
}
.menu__logout .menu__body text {
  color: #a74432;
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
/* 首屏骨架（IK9VF8）：shimmer 与 tasks/income 同款 */
.profile-skeleton__card,
.profile-skeleton__kpi,
.profile-skeleton__menu {
  border-radius: 34rpx;
  background: linear-gradient(90deg, #edf2ed, #fff, #edf2ed);
  animation: profile-pulse 1.2s infinite;
}
.profile-skeleton__card {
  height: 168rpx;
}
.profile-skeleton__kpi {
  height: 150rpx;
  margin-top: 22rpx;
}
.profile-skeleton__menu {
  height: 480rpx;
  margin-top: 22rpx;
  border-radius: 30rpx;
}
@keyframes profile-pulse {
  50% {
    opacity: 0.55;
  }
}
.menu__body {
  flex: 1;
}
.menu__body text {
  display: block;
}
.menu__body text:first-child {
  font-weight: 800;
}
.menu__body text:last-child {
  font-size: 20rpx;
  color: $muted;
  margin-top: 3rpx;
}
.online-text {
  color: $primary;
  font-size: 22rpx;
  font-weight: 900;
}
</style>
