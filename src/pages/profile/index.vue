<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { isRetryable } from "../../api/request";
import { useSessionStore, isBindRequired } from "../../stores/session";
import {
  fetchQuota,
  getCachedQuota,
  grantTimes,
} from "../../utils/notifyQuota";
import type { Performance, StaffProfile, StaffStatus } from "../../types";
const session = useSessionStore(),
  profile = ref<StaffProfile>(),
  performance = ref<Performance>(),
  /** IK8W5V：加载失败标记，展示重试入口避免页面永久空白 */
  /** 访客态（IKC4IN）：未绑定员工先浏览引导，登录自主点击 */
  guest = ref(false),
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
    // IKDQP9：接单通知额度卡刷新（拉不到不影响本页主内容，保持缓存值）
    void loadQuota();
  } catch (e) {
    // IKC4IN：游客进引导态；ADR-0005(IKA00R)：网络/服务故障进整页错误态
    if (isBindRequired(e)) guest.value = true;
    else if (isRetryable(e)) error.value = true;
  } finally {
    loading.value = false;
  }
}
/* ---------- IKDQP9 接单通知额度卡：常显，「＋补充」一次攒 5 条可连点 ---------- */
const quota = ref<number | null>(getCachedQuota());
const adding = ref(false);
async function loadQuota() {
  try {
    quota.value = (await fetchQuota()).quota;
  } catch {
    /* 静默：保留缓存值 */
  }
}
async function addQuota() {
  if (adding.value) return;
  adding.value = true;
  const ok = await grantTimes(5);
  adding.value = false;
  quota.value = getCachedQuota(); // grantTimes 内已刷新缓存，实时更新数字
  if (ok > 0) uni.showToast({ title: `已补充 ${ok} 条`, icon: "none" });
}
onShow(load);
/** 访客登录入口（IKC4IN）：用户自主点击后进登录页 */
const goLogin = () => uni.navigateTo({ url: "/pages/login/index" });
/** 上下线切换（IKA57R，自首页迁入）：三态 ActionSheet + 确认，真实 staff.status */
const statusBusy = ref(false);
function toggleStatus() {
  if (statusBusy.value || !profile.value) return;
  const options: Array<[StaffStatus, string]> = [
    ["online", "上线接单"],
    ["paused", "暂停接单"],
    ["offline", "下线休息"],
  ];
  uni.showActionSheet({
    itemList: options.map((o) => o[1]),
    success: ({ tapIndex }) => {
      const next = options[tapIndex];
      if (!next || next[0] === profile.value?.status) return;
      uni.showModal({
        title: "切换工作状态",
        content: `确定切换为「${next[1]}」吗？`,
        success: async (m) => {
          if (!m.confirm || statusBusy.value) return;
          statusBusy.value = true;
          try {
            const updated = await api.updateStatus(next[0]);
            if (profile.value)
              profile.value = { ...profile.value, ...updated };
            uni.showToast({ title: `已${next[1]}`, icon: "success" });
          } catch {
            // ADR-0005(IKA00R)：失败原因 request 层已 toast，这里只防未处理拒绝
          } finally {
            statusBusy.value = false;
          }
        },
      });
    },
  });
}
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
/** 退出登录（IK9U4H）：清登录态回首页访客引导态（IKC4IN：落地页保持
 *  可浏览内容，登录由用户从首页「员工登录」入口自主进入，规避审核风险）。
 *  IKC4IN 追加：真退出需调后端解绑 openid——只清本地 token 是假退出，
 *  回首页时静默 wx.login 会立即自动登回原账号（表现为「退出后仍有名字」）。 */
async function logout() {
  uni.showModal({
    title: "退出登录",
    content: "确定退出当前账号吗？退出后需重新使用工号绑定登录。",
    confirmColor: "#a74432",
    success: async (m) => {
      if (!m.confirm) return;
      // 解绑失败（网络等）也照常清本地态，避免卡在无法退出
      try {
        await api.wechatUnbind();
      } catch {
        /* request 层已 toast */
      }
      uni.removeStorageSync("staffToken");
      uni.reLaunch({ url: "/pages/index/index" });
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
  <view v-else-if="guest" class="page profile">
    <view class="retry card" role="button" @tap="goLogin">
      <text class="retry__title">员工专用 · 个人中心</text>
      <text class="retry__sub">工号绑定后可查看个人信息与上下线状态，点击登录</text>
    </view>
  </view>
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
<view v-if="excellent" class="badge">优秀履约员</view></view
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
    ><!-- IKDQP9 接单通知额度卡：常显，点「＋补充」攒 5 条（可连点），额度 0 红色警示 -->
<view class="notify card"
      ><view class="notify__icon"></view
      ><view class="notify__body"
        ><text class="notify__title">接单通知</text
        ><text class="notify__sub"
          >剩余额度
          <text
            class="notify__num"
            :class="{ 'notify__num--zero': quota === 0 }"
            >{{ quota == null ? "—" : `${quota} 条` }}</text
          >，新单通过微信「服务通知」提醒</text
        ></view
      ><button class="notify__add" :disabled="adding" @tap="addQuota">
        {{ adding ? "补充中…" : "＋补充" }}
      </button></view
    >
<view class="section-title"
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
        ><!-- IK9VQ2：chevron 形状即 >，改 chip 动作暗示 -->
<text class="link-chip">去申请</text></view
      ><!-- IK9AX0：服务楼栋是信息展示行，去掉误导导航的箭头 -->
<!-- IKAJT4：归属校区信息行（接口下发，楼栋归属校区一并可见） -->
<view
        ><view class="menu__icon building"></view
        ><view class="menu__body"
          ><text>归属校区</text
          ><text>{{
            [profile.campusName, profile.campusWarehouseName]
              .filter(Boolean)
              .join(' · ') || '—'
          }}</text></view
        ></view
      >
<view
        ><view class="menu__icon building"></view
        ><view class="menu__body"
          ><text>服务楼栋</text><text>{{ profile.building }}</text></view
        ></view
      ><!-- IKA57R：状态设置入口移到本页，点击直接切换（原首页入口被胶囊遮挡） --><view
        role="button"
        @tap="toggleStatus"
        ><view class="menu__icon pulse"></view
        ><view class="menu__body"
          ><text>工作状态</text
          ><text>{{ statusDesc[profile.status] }}，点击切换</text></view
        ><text class="online-text">{{ statusText[profile.status] }}</text></view
      ><!-- IK9AX0：帮助行接真内容（规范速览弹窗），不再是死箭头 -->
<view role="button" @tap="help"
        ><view class="menu__icon help"></view
        ><view class="menu__body"
          ><text>履约规范与帮助</text><text>标准流程速览</text></view
        ><text class="link-chip">查看</text></view
      ><!-- IK9U4H：退出登录入口 -->
<view role="button" class="menu__logout" @tap="logout"
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
/* ---------- IKDQP9 接单通知额度卡 ---------- */
.notify {
  display: flex;
  align-items: center;
  gap: 18rpx;
  margin: 0 0 22rpx;
  padding: 24rpx;
}
/* 铃铛图形（CSS 绘制）：与工作台低水位条同语义，绿系 */
.notify__icon {
  flex: 0 0 64rpx;
  width: 64rpx;
  height: 64rpx;
  border-radius: 19rpx;
  background: $soft;
  position: relative;
}
.notify__icon:before {
  content: "";
  position: absolute;
  left: 15rpx;
  right: 15rpx;
  top: 13rpx;
  height: 24rpx;
  border: 5rpx solid $primary-dark;
  border-bottom: none;
  border-radius: 14rpx 14rpx 4rpx 4rpx;
}
.notify__icon:after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 11rpx;
  width: 12rpx;
  height: 12rpx;
  margin-left: -6rpx;
  border-radius: 50%;
  background: $primary-dark;
}
.notify__body {
  flex: 1;
}
.notify__title {
  display: block;
  font-size: 26rpx;
  font-weight: 800;
  color: $ink;
}
.notify__sub {
  display: block;
  font-size: 20rpx;
  color: $muted;
  margin-top: 4rpx;
}
.notify__num {
  font-weight: 900;
  color: $primary-dark;
}
.notify__num--zero {
  color: $danger;
}
.notify__add {
  min-height: 88rpx;
  margin: 0;
  padding: 0 34rpx;
  border-radius: 999rpx;
  background: $primary-dark;
  color: $lime;
  font-size: 24rpx;
  font-weight: 900;
  display: flex;
  align-items: center;
}
.notify__add[disabled] {
  opacity: 0.6;
}
.notify__add:active {
  opacity: 0.85;
}
</style>
