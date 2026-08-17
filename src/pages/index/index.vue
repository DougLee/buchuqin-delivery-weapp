<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { useSessionStore } from "../../stores/session";
import type { Dashboard, Shift, StaffRole, StaffStatus } from "../../types";

const session = useSessionStore();
const data = ref<Dashboard>();
const shift = ref<Shift>();
/** 加载失败标记（IK8W5V）：失败时展示重试入口，避免页面永久空白 */
const error = ref(false);
/** 当班卡按钮防重（IK8W5U） */
const shiftBusy = ref(false);
const statusBusy = ref(false);
const roles: Array<[StaffRole, string, string]> = [
  ["building-manager", "楼长", "楼内交付"],
  ["fulltime-rider", "全职", "干线配送"],
  ["parttime-rider", "兼职", "灵活接单"],
];
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
  try {
    await session.ensure();
    const [d, s] = await Promise.all([
      api.dashboard(session.role),
      api.shiftsCurrent(),
    ]);
    data.value = d;
    shift.value = s;
  } catch {
    error.value = true;
  }
}
async function change(role: StaffRole) {
  await session.setRole(role);
  await load();
}
/** 签到 / 签退（IK8W5U）：签到会上线、签退会下线，本地同步徽章状态 */
async function shiftAction() {
  if (shiftBusy.value) return;
  shiftBusy.value = true;
  try {
    const working = shift.value?.status === "working";
    const next = working ? await api.checkOut() : await api.checkIn();
    shift.value = next;
    applyStatus(next.status === "working" ? "online" : "offline");
    uni.showToast({ title: working ? "已签退" : "已签到", icon: "success" });
  } finally {
    shiftBusy.value = false;
  }
}
/** 上下线切换（IK8W5U）：真实 staff.status，三态切换 + 确认框 */
function toggleStatus() {
  if (statusBusy.value || !data.value) return;
  const options: Array<[StaffStatus, string]> = [
    ["online", "上线接单"],
    ["paused", "暂停接单"],
    ["offline", "下线休息"],
  ];
  uni.showActionSheet({
    itemList: options.map((o) => o[1]),
    success: ({ tapIndex }) => {
      const next = options[tapIndex];
      if (!next || next[0] === staffStatus.value) return;
      uni.showModal({
        title: "切换工作状态",
        content: `确定切换为「${next[1]}」吗？`,
        success: async (m) => {
          if (!m.confirm || statusBusy.value) return;
          statusBusy.value = true;
          try {
            const profile = await api.updateStatus(next[0]);
            if (data.value)
              data.value = {
                ...data.value,
                profile: { ...data.value.profile, ...profile },
              };
            uni.showToast({ title: `已${next[1]}`, icon: "success" });
          } finally {
            statusBusy.value = false;
          }
        },
      });
    },
  });
}
function applyStatus(s: StaffStatus) {
  if (data.value)
    data.value = {
      ...data.value,
      profile: { ...data.value.profile, status: s, online: s === "online" },
    };
}
/** 平均用时（IK8W5V 去演示化）：后端无 averageMinutes 字段时显示"—"，不再硬编码 12 */
const avgMinutes = computed<number | null>(() => {
  const v = data.value?.stats.averageMinutes;
  return typeof v === "number" ? v : null;
});
const open = (id: string) =>
  uni.navigateTo({ url: `/pages/task/detail?id=${id}` });
onShow(load);
</script>

<template>
  <view class="page home">
    <view class="nav">
      <view class="identity">
        <view class="logo"><view class="logo__route"></view></view>
        <view
          ><text class="brand">不出寝履约</text
          ><text class="campus">湖北工业大学 · 湖工大校园仓</text></view
        >
      </view>
      <view
        class="online"
        :class="{
          'online--paused': staffStatus === 'paused',
          'online--offline': staffStatus === 'offline',
        }"
        role="button"
        @tap="toggleStatus"
        ><view class="online__dot"></view
        ><text>{{ statusText[staffStatus] }}</text></view
      >
    </view>

    <view class="shift-card card">
      <view class="shift-card__info"
        ><text class="shift-card__title">{{ shiftState.text }}</text
        ><text class="shift-card__sub"
          >{{ shift?.serviceArea || "湖北工业大学" }} ·
          {{ shift?.startAt || "--:--" }}—{{ shift?.endAt || "--:--" }}</text
        ></view
      >
      <button
        class="shift-card__btn"
        :class="{ 'shift-card__btn--outline': shiftState.working }"
        :disabled="shiftBusy"
        @tap="shiftAction"
      >
        {{ shiftBusy ? "处理中…" : shiftState.working ? "签退下班" : "签到上班" }}
      </button>
    </view>

    <!-- IK8W5V 角色守卫：三角色切换卡仅演示模式可见（默认开，设置页可关）；
         关闭后角色锁定当前值，由登录 token 决定，正式登录落地后删除此卡 -->
    <view v-if="session.demoMode" class="roles" aria-label="切换履约角色">
      <view
        v-for="role in roles"
        :key="role[0]"
        class="role"
        :class="{ 'role--active': session.role === role[0] }"
        role="button"
        @tap="change(role[0])"
      >
        <text class="role__name">{{ role[1] }}</text
        ><text class="role__desc">{{ role[2] }}</text>
      </view>
    </view>

    <view v-if="error" class="retry card" role="button" @tap="load"
      ><text class="retry__title">加载失败</text
      ><text class="retry__sub">网络异常或服务暂不可用，点击重试</text></view
    >

    <template v-if="data">
      <view class="hero">
        <view class="hero__glow"></view>
        <view class="hero__top"
          ><view
            ><text class="eyebrow">TODAY · 今日履约</text
            ><text class="hello"
              >{{ greeting }}，{{ data.profile.name }}</text
            ></view
          ><!-- IK8W5V：当班徽章接 shifts/current 真实状态 -->
          ><view class="shift" :class="{ 'shift--off': !shiftState.working }">{{
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
        ><view class="announcement__mark">i</view
        ><text>{{ data.announcement }}</text></view
      >

      <view class="stats card">
        <view
          ><text class="stats__value">{{ data.stats.completed }}</text
          ><text class="stats__label">今日完成</text></view
        >
        <view
          ><text class="stats__value">¥{{ data.stats.income }}</text
          ><text class="stats__label">今日收入</text></view
        >
        <view
          ><text class="stats__value">{{ data.stats.onTimeRate }}%</text
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
          >全部任务 →</text
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
          ><text class="package">{{ task.packageNo }}</text
          ><text class="status">{{ task.statusText }}</text></view
        >
        <view class="task__destination"
          ><view class="floor"
            ><text>{{ task.floor }}</text
            ><text>F</text></view
          ><view
            ><text class="building">{{ task.building }} · {{ task.room }}</text
            ><text class="deadline">履约时效：{{ task.deadline }}</text></view
          ></view
        >
        <view class="task__meta"
          ><text>{{ task.itemCount }} 件 · {{ task.weight }}kg</text
          ><text>{{ task.modeText }}</text
          ><text class="commission">+¥{{ task.commission }}</text></view
        >
        <view class="task__action"
          ><text>查看路线与操作</text><text>→</text></view
        >
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
@import "../../styles/theme.scss";
.home {
  padding-top: calc(30rpx + env(safe-area-inset-top));
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
.shift-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 24rpx 28rpx;
  margin: 30rpx 0 0;
}
.shift-card__info {
  flex: 1;
}
.shift-card__title,
.shift-card__sub {
  display: block;
}
.shift-card__title {
  font-size: 28rpx;
  font-weight: 900;
  color: $primary-dark;
}
.shift-card__sub {
  font-size: 20rpx;
  color: $muted;
  margin-top: 4rpx;
}
.shift-card__btn {
  flex: 0 0 auto;
  min-height: 68rpx;
  margin: 0;
  padding: 0 34rpx;
  border-radius: 999rpx;
  background: $primary-dark;
  color: #fff;
  font-size: 24rpx;
  font-weight: 800;
  display: flex;
  align-items: center;
}
.shift-card__btn--outline {
  background: #fff;
  color: $primary-dark;
  border: 2rpx solid $primary;
}
.shift-card__btn[disabled] {
  opacity: 0.6;
}
.roles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8rpx;
  background: #dfe8e1;
  padding: 8rpx;
  border-radius: 26rpx;
  margin: 20rpx 0 24rpx;
}
.role {
  min-height: 90rpx;
  border-radius: 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: $muted;
  transition: background 0.2s;
}
.role__name,
.role__desc {
  display: block;
}
.role__name {
  font-size: 25rpx;
  font-weight: 800;
}
.role__desc {
  font-size: 18rpx;
  margin-top: 2rpx;
}
.role--active {
  background: #fff;
  color: $primary-dark;
  box-shadow: 0 6rpx 18rpx rgba(7, 63, 45, 0.1);
}
.role--active .role__desc {
  color: $primary;
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
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 900;
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
  justify-content: space-between;
  border-top: 2rpx dashed $line;
  margin-top: 22rpx;
  padding-top: 18rpx;
  color: $primary-dark;
  font-size: 22rpx;
  font-weight: 800;
}
</style>
