<script setup lang="ts">
import { computed, ref } from "vue";
import { onPullDownRefresh, onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { isRetryable } from "../../api/request";
import { useSessionStore, isBindRequired } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import { quickAction, slaText, type QuickAction } from "../../utils/task-actions";
import type { Dashboard, Shift, StaffRole, StaffStatus, Task } from "../../types";

const session = useSessionStore();
const data = ref<Dashboard>();
const shift = ref<Shift>();
/** 加载失败标记（IK8W5V）：失败时展示重试入口，避免页面永久空白 */
const error = ref(false);
/** 访客态（IKC4IN 审核整改）：未绑定员工时先浏览功能引导，登录由用户自主点击 */
const guest = ref(false);
/** 首屏加载中（IK9VF8）：驱动骨架屏，对齐 tasks/income 标准 */
const loading = ref(false);
/** 状态切换按钮防重（IK8W5U）——IKA57R：切换入口已移「我的」页，此标记随迁 */
const hour = new Date().getHours();
const greeting = computed(() =>
  hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好",
);
const statusText: Record<StaffStatus, string> = {
  online: "接单中",
  paused: "暂停接单",
  offline: "已下线",
};
const staffStatus = computed<StaffStatus>(
  () => data.value?.profile.status ?? "offline",
);
const shiftState = computed(() => {
  if (!shift.value) return { text: "排班加载中", working: false };
  if (shift.value.status === "working") return { text: "当班中", working: true };
  if (shift.value.status === "completed")
    return { text: "今日已签退", working: false };
  return { text: "今日未签到", working: false };
});

async function load() {
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    const [d, s] = await Promise.all([
      api.dashboard(session.role),
      api.shiftsCurrent(),
    ]);
    data.value = d;
    shift.value = s;
  } catch (e) {
    // IKC4IN：未绑定员工（游客）→ 功能引导态，不强制登录；
    // ADR-0005(IKA00R)：网络/服务故障进整页错误态，业务拒绝由 request 层 toast
    if (isBindRequired(e)) guest.value = true;
    else if (isRetryable(e)) error.value = true;
  } finally {
    loading.value = false;
  }
}
// IK9U4F：签到/签退入口已隐藏（决策记录不做地理围栏签到），保留当班状态读取
// IKA57R：状态切换入口移至「我的」页（原位置被状态栏/胶囊遮挡），首页仅展示
/** 平均用时（IK8W5V 去演示化）：后端无 averageMinutes 字段时显示"—"，不再硬编码 12 */
const avgMinutes = computed<number | null>(() => {
  const v = data.value?.stats.averageMinutes;
  return typeof v === "number" ? v : null;
});
/** 准时率（IK9VF8）：同 averageMinutes 的 null 防御，缺字段显示"—"不带空百分比 */
const onTimeRate = computed(() => {
  const v = data.value?.stats.onTimeRate;
  return typeof v === "number" ? `${v}%` : "—";
});
const open = (id: string) =>
  uni.navigateTo({ url: `/pages/task/detail?id=${id}` });
/** 下拉刷新（IKBW0F）：首页此前无刷新入口 */
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
/** 访客登录入口（IKC4IN）：用户自主点击后进登录页 */
const goLogin = () => uni.navigateTo({ url: "/pages/login/index" });
/** 列表行快捷操作（IKBW0H）：标准下一步行内一键完成，需拍照/弹窗的跳详情 */
const acting = ref<string | null>(null);
const qaOf = (task: Task): QuickAction | null => quickAction(task);
async function runAction(task: Task) {
  const qa = quickAction(task);
  if (!qa || acting.value) return;
  if (qa.kind === "detail") {
    uni.navigateTo({ url: `/pages/task/detail?id=${task.id}` });
    return;
  }
  acting.value = task.id;
  try {
    await api.action(session.role, task.id, qa.key, {});
    uni.showToast({ title: "操作成功", icon: "success" });
  } finally {
    acting.value = null;
    // 成功/失败都静默重拉纠偏（被抢冲突、状态已变时行内按钮随之消失）；
    // 失败提示由 request 层统一 toast
    load().catch(() => {});
  }
}
/** 顶部校区行（IKAJT4 去硬编码）：归属校区 · 仓名随 profile 接口下发 */
const campusLine = computed(() => {
  const p = data.value?.profile;
  return [p?.campusName, p?.campusWarehouseName].filter(Boolean).join(" · ");
});
onShow(load);
</script>

<template>
  <view class="page home">
    <view class="nav">
      <view class="identity">
        <view class="logo"><view class="logo__route"></view></view>
        <view
          ><text class="brand">不出寝履约</text
          ><!-- IKAJT4：校区信息接口下发，多校区不再硬编码湖工大 -->
          <text v-if="campusLine" class="campus">{{ campusLine }}</text></view
        >
      </view>
      <view
        class="online"
        :class="{
          'online--paused': staffStatus === 'paused',
          'online--offline': staffStatus === 'offline',
        }"
        ><view class="online__dot"></view
        ><text>{{ statusText[staffStatus] }}</text></view
      >
    </view>

    <!-- IK9U4F：签到/签退功能先隐藏（决策记录：不做地理围栏签到），
         当班状态由下方 hero 徽章继续展示 -->

    <view v-if="error" class="retry card" role="button" @tap="load"
      ><text class="retry__title">加载失败</text
      ><text class="retry__sub">网络异常或服务暂不可用，点击重试</text></view
    >

    <!-- 首屏骨架（IK9VF8）：hero + 统计 + 任务卡占位 -->
    <view v-else-if="loading" class="home-skeleton"
      ><view class="home-skeleton__hero" /><view class="home-skeleton__stats" /><view
        class="home-skeleton__task"
      /><view class="home-skeleton__task" /></view
    >

    <!-- 访客引导态（IKC4IN 审核整改）：先浏览平台介绍，登录由用户自主点击 -->
    <template v-else-if="guest">
      <view class="card guest__hero">
        <text class="guest__brand">不出寝食社 · 履约端</text>
        <text class="guest__title">校园寝售 · 配送工作台</text>
        <text class="guest__desc"
          >零食饮料寝室直达的校园电商平台。本端为履约工作人员（配送员/楼长）专用工作台，员工工号绑定后即可上岗接单。</text
        >
      </view>
      <view class="card guest__feats"
        ><text class="guest__head">平台功能一览</text>
        <view class="guest__feat"
          ><text class="guest__no">01</text
          ><view
            ><text class="guest__ft">工作台 · 任务看板</text
            ><text class="guest__fd">待处理任务按时效排序，行内一键接单、开始配送、确认送达</text></view
          ></view
        >
        <view class="guest__feat"
          ><text class="guest__no">02</text
          ><view
            ><text class="guest__ft">两段接力配送</text
            ><text class="guest__fd">配送员仓到楼、楼长楼到寝，拍照交接全程留痕</text></view
          ></view
        >
        <view class="guest__feat"
          ><text class="guest__no">03</text
          ><view
            ><text class="guest__ft">收入与绩效</text
            ><text class="guest__fd">每单佣金、准时率与月度结算，清晰可查</text></view
          ></view
        ></view
      >
      <button class="guest__login" @tap="goLogin">员工登录</button>
      <text class="guest__tip"
        >仅限不出寝食社在职员工使用 · 登录为微信静默授权，首次使用填写工号与姓名绑定</text
      >
    </template>

    <template v-else-if="data">
      <view class="hero">
        <view class="hero__glow"></view>
        <view class="hero__top"
          ><view
            ><text class="eyebrow">TODAY · 今日履约</text
            ><text class="hello"
              >{{ greeting }}，{{ data.profile.name }}</text
            ></view
          ><!-- IK8W5V：当班徽章接 shifts/current 真实状态 -->
<view class="shift" :class="{ 'shift--off': !shiftState.working }">{{
            shiftState.working ? "当班" : "未当班"
          }}</view></view
        >
        <view class="hero__metric"
          ><text class="metric__number">{{ data.stats.pending }}</text
          ><view><text class="metric__unit">单待处理</text></view></view
        >
        <!-- IK8W5V：路线进度点为纯视觉装饰，不映射真实履约阶段 -->
        <view class="route"
          ><view class="route__point route__point--done"></view
          ><view class="route__line"></view
          ><view class="route__point route__point--active"></view
          ><view class="route__line"></view><view class="route__point"></view
        ></view>
        <view class="route-label"
          ><text>校园仓</text><text>配送中</text><text>寝室楼</text></view
        >
      </view>

      <view class="announcement"
        ><!-- info 图标 CSS 化（IK9VF8）：圆底 + 点/竖条，替代字母 i -->
<view class="announcement__mark"></view
        ><text>{{ data.announcement }}</text></view
      >

      <view class="stats card">
        <view
          ><text class="stats__value">{{ data.stats.completed }}</text
          ><text class="stats__label">今日完成</text></view
        >
        <view
          ><text class="stats__value">¥{{ fenToYuan(data.stats.income) }}</text
          ><text class="stats__label">今日收入</text></view
        >
        <view
          ><text class="stats__value">{{ onTimeRate }}</text
          ><text class="stats__label">准时率</text></view
        >
        <view
          ><text class="stats__value"
            >{{ avgMinutes ?? "—" }}<text v-if="avgMinutes != null" class="small"
              >min</text
            ></text
          ><text class="stats__label">平均用时</text></view
        >
      </view>

      <view class="section-title"
        ><view
          ><text class="section-kicker">NEXT TASKS</text
          ><text class="section-title__main">优先任务</text></view
        ><text
          class="section-title__sub"
          @tap="uni.switchTab({ url: '/pages/tasks/index' })"
          ><!-- IK9VQ2：chevron 形状即 >，改 chip 胶囊暗示可点 -->
          <text class="link-chip">全部任务</text></text
        ></view
      >
      <view
        v-for="(task, index) in data.tasks"
        :key="task.id"
        class="task card"
        role="button"
        @tap="open(task.id)"
      >
        <view
          class="task__accent"
          :class="{ 'task__accent--orange': index === 0 }"
        ></view>
        <view class="task__head"
          ><!-- IKA57O：配送单号已下线，统一显订单号 -->
          <text class="package">{{ task.orderNo }}</text
          ><text class="status">{{ task.statusText }}</text></view
        >
        <view class="task__destination"
          ><view class="floor"
            ><text>{{ task.floor }}</text
            ><text>F</text></view
          ><view
            ><text class="building">{{ task.building }} · {{ task.room }}</text
            ><!-- IKBW0H：时效固定文案，与后台订单列表口径一致 -->
            <text class="deadline">履约时效：{{ slaText(task) }}</text></view
          ></view
        >
        <view class="task__meta"
          ><text>{{ task.itemCount }} 件 · {{ task.weight }}kg</text
          ><text>{{ task.modeText }}</text
          ><text class="commission"
            >+¥{{ fenToYuan(task.commission) }}</text
          ></view
        >
        <view class="task__action"
          ><!-- IK9VQ2：整卡可点，行尾箭头改 chip -->
          <!-- IKBW0H：标准下一步直接行内完成，无则保持查看入口 -->
          <button
            v-if="qaOf(task)"
            class="quick-btn"
            :disabled="acting === task.id"
            @tap.stop="runAction(task)"
          >
            {{ acting === task.id ? "处理中…" : qaOf(task)?.label }}
          </button>
          <text v-else class="link-chip">查看路线与操作</text></view
        >
      </view>
      <!-- 优先任务空态（IK9VF8）：无待处理时引导去任务看板，不留空白 -->
      <view
        v-if="!data.tasks.length"
        class="empty card"
        role="button"
        @tap="uni.switchTab({ url: '/pages/tasks/index' })"
        >暂无待处理任务，去任务看板看看</view
      >
    </template>
  </view>
</template>

<style scoped lang="scss">
@import "../../styles/theme.scss";
.home {
  /* IKA57R：微信 env(safe-area-inset-top) 在 page 级常取 0，用平台注入的
     --status-bar-height 才躲得开状态栏；胶囊带另在 .online 避让 */
  padding-top: calc(24rpx + var(--status-bar-height, 0px));
  background:
    radial-gradient(
      circle at 92% 8%,
      rgba(185, 242, 39, 0.18),
      transparent 28%
    ),
    $paper;
}
.nav,
.identity,
.online,
.hero__top,
.hero__metric,
.task__head,
.task__meta,
.task__action {
  display: flex;
  align-items: center;
}
.nav {
  justify-content: space-between;
}
.online {
  /* IKA57R：右侧避让小程序胶囊（约 87px + 边距），防点击/视觉重叠 */
  margin-right: 196rpx;
}
.identity {
  gap: 16rpx;
}
.logo {
  width: 68rpx;
  height: 68rpx;
  border-radius: 20rpx;
  background: $primary-dark;
  display: grid;
  place-items: center;
  transform: rotate(-4deg);
}
.logo__route {
  width: 28rpx;
  height: 28rpx;
  border: 6rpx solid $lime;
  border-left-color: transparent;
  border-radius: 50%;
  position: relative;
}
.logo__route:after {
  content: "";
  position: absolute;
  width: 8rpx;
  height: 8rpx;
  background: $lime;
  border-radius: 50%;
  right: -8rpx;
  top: -3rpx;
}
.brand,
.campus {
  display: block;
}
.brand {
  font-size: 34rpx;
  font-weight: 900;
  letter-spacing: -1rpx;
}
.campus {
  font-size: 20rpx;
  color: $muted;
  margin-top: 2rpx;
}
.online {
  gap: 9rpx;
  min-height: 62rpx;
  padding: 0 20rpx;
  border-radius: 999rpx;
  background: #fff;
  border: 2rpx solid $line;
  color: $primary-dark;
  font-size: 22rpx;
  font-weight: 800;
}
.online--paused {
  color: #8a5a17;
  border-color: #ecd9b4;
}
.online--offline {
  color: $muted;
}
.online__dot {
  width: 13rpx;
  height: 13rpx;
  border-radius: 50%;
  background: $lime;
  box-shadow: 0 0 0 7rpx rgba(185, 242, 39, 0.2);
}
.online--paused .online__dot {
  background: $accent;
  box-shadow: 0 0 0 7rpx rgba(255, 138, 52, 0.18);
}
.online--offline .online__dot {
  background: #b7c4ba;
  box-shadow: none;
}
.hero {
  position: relative;
  overflow: hidden;
  padding: 34rpx;
  border-radius: 36rpx;
  background: linear-gradient(
    145deg,
    $primary-deep,
    $primary-dark 72%,
    #126c43
  );
  color: #fff;
  box-shadow: 0 18rpx 44rpx rgba(3, 45, 34, 0.22);
}
.hero__glow {
  position: absolute;
  width: 280rpx;
  height: 280rpx;
  border-radius: 50%;
  right: -100rpx;
  top: -140rpx;
  background: rgba(185, 242, 39, 0.15);
}
.hero__top {
  position: relative;
  justify-content: space-between;
}
.eyebrow,
.hello {
  display: block;
}
.eyebrow {
  color: $lime;
  font-size: 19rpx;
  font-weight: 800;
  letter-spacing: 2rpx;
}
.hello {
  font-size: 31rpx;
  font-weight: 800;
  margin-top: 7rpx;
}
.shift {
  border: 2rpx solid rgba(255, 255, 255, 0.28);
  border-radius: 999rpx;
  padding: 8rpx 18rpx;
  font-size: 20rpx;
}
.shift--off {
  opacity: 0.72;
}
.retry {
  text-align: center;
  padding: 90rpx 30rpx;
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
.hero__metric {
  gap: 18rpx;
  margin: 34rpx 0;
}
.metric__number {
  font-size: 82rpx;
  line-height: 1;
  font-weight: 900;
  color: $lime;
}
.metric__unit,
.metric__hint {
  display: block;
}
.metric__unit {
  font-size: 28rpx;
  font-weight: 800;
}
.metric__hint {
  font-size: 19rpx;
  opacity: 0.68;
  margin-top: 5rpx;
}
.route {
  display: grid;
  grid-template-columns: auto 1fr auto 1fr auto;
  align-items: center;
}
.route__point {
  width: 15rpx;
  height: 15rpx;
  border: 4rpx solid rgba(255, 255, 255, 0.45);
  border-radius: 50%;
}
.route__point--done {
  background: $lime;
  border-color: $lime;
}
.route__point--active {
  width: 22rpx;
  height: 22rpx;
  background: $accent;
  border-color: #fff;
  box-shadow: 0 0 0 8rpx rgba(255, 138, 52, 0.18);
}
.route__line {
  height: 2rpx;
  background: rgba(255, 255, 255, 0.28);
}
.route-label {
  display: flex;
  justify-content: space-between;
  margin-top: 10rpx;
  font-size: 18rpx;
  opacity: 0.65;
}
.announcement {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
  margin: 20rpx 0;
  padding: 20rpx 22rpx;
  border-radius: 22rpx;
  background: $warning;
  color: #795024;
  font-size: 22rpx;
}
.announcement__mark {
  flex: 0 0 34rpx;
  width: 34rpx;
  height: 34rpx;
  border-radius: 50%;
  background: $accent;
  position: relative;
}
/* info 图标（IK9VF8）：上点下竖，替代字母 i 字符 */
.announcement__mark:before {
  content: "";
  position: absolute;
  left: 50%;
  top: 19rpx;
  width: 4rpx;
  height: 10rpx;
  margin-left: -2rpx;
  border-radius: 2rpx;
  background: #fff;
}
.announcement__mark:after {
  content: "";
  position: absolute;
  left: 50%;
  top: 9rpx;
  width: 5rpx;
  height: 5rpx;
  margin-left: -2.5rpx;
  border-radius: 50%;
  background: #fff;
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 26rpx 8rpx;
  text-align: center;
}
.stats > view + view {
  border-left: 2rpx solid $line;
}
.stats__value,
.stats__label {
  display: block;
}
.stats__value {
  font-size: 30rpx;
  font-weight: 900;
  color: $primary-dark;
}
.stats__label {
  font-size: 18rpx;
  color: $muted;
  margin-top: 5rpx;
}
.small {
  font-size: 17rpx;
  margin-left: 2rpx;
}
.section-kicker {
  display: block;
  color: $primary;
  font-size: 18rpx;
  font-weight: 900;
  letter-spacing: 2rpx;
}
.section-title__main {
  display: block;
}
.task {
  position: relative;
  overflow: hidden;
  padding: 28rpx;
  margin-bottom: 20rpx;
}
.task:active {
  background: $soft;
}
.task__accent {
  position: absolute;
  left: 0;
  top: 26rpx;
  width: 7rpx;
  height: 70rpx;
  border-radius: 0 8rpx 8rpx 0;
  background: $primary;
}
.task__accent--orange {
  background: $accent;
}
.task__head {
  justify-content: space-between;
}
.package {
  font-size: 22rpx;
  color: $muted;
  font-weight: 700;
}
.task__destination {
  display: flex;
  align-items: center;
  gap: 18rpx;
  margin: 24rpx 0;
}
.floor {
  width: 76rpx;
  height: 76rpx;
  border-radius: 20rpx;
  background: $primary-dark;
  color: #fff;
  display: flex;
  align-items: baseline;
  justify-content: center;
}
.floor text:first-child {
  font-size: 36rpx;
  font-weight: 900;
}
.floor text:last-child {
  font-size: 17rpx;
}
.building,
.deadline {
  display: block;
}
.building {
  font-size: 34rpx;
  font-weight: 900;
}
.deadline {
  font-size: 20rpx;
  color: $muted;
  margin-top: 3rpx;
}
.task__meta {
  gap: 14rpx;
  color: $muted;
  font-size: 20rpx;
}
.commission {
  margin-left: auto;
  color: $primary-dark;
  font-size: 25rpx;
  font-weight: 900;
}
.task__action {
  justify-content: flex-end;
  border-top: 2rpx dashed $line;
  margin-top: 22rpx;
  padding-top: 18rpx;
  color: $primary-dark;
  font-size: 22rpx;
  font-weight: 800;
}
/* IKBW0H：行内快捷操作按钮，与任务页 grab-btn 同款视觉 */
.quick-btn {
  min-height: 62rpx;
  margin: 0;
  padding: 0 36rpx;
  border-radius: 999rpx;
  background: $primary-dark;
  color: $lime;
  font-size: 24rpx;
  font-weight: 900;
  display: flex;
  align-items: center;
}
.quick-btn[disabled] {
  opacity: 0.6;
}
/* 访客引导态（IKC4IN）：品牌介绍 + 功能一览 + 自主登录入口 */
.guest__hero,
.guest__feats {
  padding: 34rpx;
  margin-bottom: 20rpx;
}
.guest__brand {
  display: block;
  font-size: 20rpx;
  font-weight: 800;
  letter-spacing: 2rpx;
  color: $primary;
}
.guest__title {
  display: block;
  font-size: 40rpx;
  font-weight: 900;
  color: $ink;
  margin-top: 10rpx;
}
.guest__desc,
.guest__fd {
  display: block;
  font-size: 22rpx;
  line-height: 1.7;
  color: $muted;
}
.guest__desc {
  margin-top: 12rpx;
}
.guest__head {
  display: block;
  font-size: 26rpx;
  font-weight: 900;
  color: $ink;
  margin-bottom: 18rpx;
}
.guest__feat {
  display: flex;
  gap: 18rpx;
  align-items: flex-start;
  padding: 14rpx 0;
}
.guest__no {
  font-size: 26rpx;
  font-weight: 900;
  color: $primary;
  opacity: 0.55;
}
.guest__ft {
  display: block;
  font-size: 25rpx;
  font-weight: 800;
  color: $ink;
}
.guest__fd {
  margin-top: 4rpx;
}
.guest__login {
  min-height: 88rpx;
  margin: 6rpx 0 16rpx;
  border-radius: 999rpx;
  background: $primary-dark;
  color: $lime;
  font-size: 28rpx;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
}
.guest__tip {
  display: block;
  text-align: center;
  font-size: 19rpx;
  color: $muted;
  padding-bottom: 30rpx;
}
/* 首屏骨架（IK9VF8）：shimmer 与 tasks/income 同款 */
.home-skeleton__hero,
.home-skeleton__stats,
.home-skeleton__task {
  border-radius: 36rpx;
  background: linear-gradient(90deg, #edf2ed, #fff, #edf2ed);
  animation: home-pulse 1.2s infinite;
}
.home-skeleton__hero {
  height: 320rpx;
}
.home-skeleton__stats {
  height: 130rpx;
  margin-top: 22rpx;
}
.home-skeleton__task {
  height: 240rpx;
  margin-top: 20rpx;
}
@keyframes home-pulse {
  50% {
    opacity: 0.55;
  }
}
</style>
