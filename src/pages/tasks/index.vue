<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { useSessionStore } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import type { Task } from "../../types";
const session = useSessionStore(),
  items = ref<Task[]>([]),
  active = ref("all"),
  /** 抢单防重：当前正在抢的任务 id（IK8W5U） */
  grabbing = ref<string | null>(null),
  /** IK8W5V：加载失败标记，展示重试入口避免页面永久空白 */
  error = ref(false);
// 抢单池仅骑手角色可见（IK8W5U，后端对楼长返回 403）
const isRider = computed(() => session.role !== "building-manager");
const baseTabs: Array<[string, string]> = [
  ["all", "全部"],
  ["waiting", "待处理"],
  ["available", "待接单"],
  ["delivering", "进行中"],
  ["completed", "已完成"],
];
const tabs = computed<Array<[string, string]>>(() =>
  isRider.value ? [["pool", "抢单池"], ...baseTabs] : baseTabs,
);
async function load(s = active.value) {
  error.value = false;
  try {
    await session.ensure();
    // 角色切换后停留在抢单池时回退到全部（楼长无抢单池）
    if (s === "pool" && !isRider.value) s = "all";
    active.value = s;
    items.value =
      s === "pool"
        ? await api.availableTasks()
        : await api.tasks(session.role, s);
  } catch {
    error.value = true;
  }
}
/** 抢单（IK8W5U）：成功跳详情；被抢走时提示并刷新列表 */
async function grab(task: Task) {
  if (grabbing.value) return;
  grabbing.value = task.id;
  try {
    const t = await api.grab(task.id);
    uni.showToast({ title: "抢单成功", icon: "success" });
    uni.navigateTo({ url: `/pages/task/detail?id=${t.id}` });
  } catch {
    uni.showToast({ title: "手慢了，任务已被抢", icon: "none" });
    try {
      await load("pool");
    } catch {
      /* 刷新失败由 request 统一 toast */
    }
  } finally {
    grabbing.value = null;
  }
}
onShow(() => load());
</script>
<template>
  <view class="page tasks-page">
    <view class="overview">
      <view
        ><text class="overview__label">TASK BOARD</text
        ><text class="overview__title">今日任务看板</text
        ><text class="overview__sub"
          >按时效排序，优先处理即将超时任务</text
        ></view
      >
      <view class="overview__number"
        ><text>{{ items.length }}</text
        ><text>单</text></view
      >
    </view>
    <scroll-view scroll-x class="tabs" :show-scrollbar="false"
      ><view class="tabs__inner"
        ><view
          v-for="t in tabs"
          :key="t[0]"
          class="tab"
          :class="{ 'tab--active': active === t[0] }"
          role="button"
          @tap="load(t[0])"
          >{{ t[1] }}</view
        ></view
      ></scroll-view
    >
    <view v-if="error" class="empty card" role="button" @tap="load"
      ><view class="empty__mark"></view><text>加载失败</text
      ><text class="empty__sub">点击重试</text></view
    >
    <view v-else-if="!items.length" class="empty card"
      ><view class="empty__mark"></view><text>当前分类没有任务</text
      ><text class="empty__sub">新任务会自动出现在这里</text></view
    >
    <view
      v-for="(task, index) in items"
      :key="task.id"
      class="task card"
      role="button"
      @tap="uni.navigateTo({ url: `/pages/task/detail?id=${task.id}` })"
    >
      <view class="task__top"
        ><view class="sequence">{{ String(index + 1).padStart(2, "0") }}</view
        ><view class="head"
          ><text class="package">{{ task.packageNo }}</text
          ><text class="status">{{ task.statusText }}</text></view
        ></view
      >
      <view class="route-row"
        ><view class="pin"><view></view></view
        ><view
          ><text class="address"
            >{{ task.building }} · {{ task.floor }} 楼 · {{ task.room }}</text
          ><text class="warehouse">{{ task.warehouse }} → 目的寝室</text></view
        ></view
      >
      <view class="meta"
        ><view
          ><text>货量</text
          ><strong>{{ task.itemCount }} 件 / {{ task.weight }}kg</strong></view
        ><view
          ><text>模式</text><strong>{{ task.modeText }}</strong></view
        ><view
          ><text>预计收入</text
          ><strong class="money">¥{{ fenToYuan(task.commission) }}</strong></view
        ></view
      >
      <view class="footer"
        ><text class="time">{{ task.deadline }} 前完成</text
        ><button
          v-if="active === 'pool'"
          class="grab-btn"
          :disabled="grabbing === task.id"
          @tap.stop="grab(task)"
        >
          {{ grabbing === task.id ? "抢单中…" : "抢单" }}
        </button><text v-else class="go">查看任务 →</text></view
      >
    </view>
  </view>
</template>
<style scoped lang="scss">
@import "../../styles/theme.scss";
.tasks-page {
  background: linear-gradient(180deg, #e5f4e9 0, $paper 340rpx);
}
.overview {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 16rpx 4rpx 30rpx;
}
.overview text {
  display: block;
}
.overview__label {
  font-size: 18rpx;
  letter-spacing: 3rpx;
  color: $primary;
  font-weight: 900;
}
.overview__title {
  font-size: 42rpx;
  font-weight: 900;
  margin-top: 3rpx;
}
.overview__sub {
  font-size: 20rpx;
  color: $muted;
  margin-top: 6rpx;
}
.overview__number {
  width: 92rpx;
  height: 92rpx;
  border-radius: 28rpx;
  background: $primary-dark;
  color: #fff;
  display: flex;
  align-items: baseline;
  justify-content: center;
}
.overview__number text:first-child {
  font-size: 46rpx;
  font-weight: 900;
}
.overview__number text:last-child {
  font-size: 18rpx;
}
.tabs {
  white-space: nowrap;
  margin-bottom: 24rpx;
}
.tabs__inner {
  display: flex;
  gap: 12rpx;
}
.tab {
  min-height: 64rpx;
  padding: 0 27rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.75);
  border: 2rpx solid $line;
  display: flex;
  align-items: center;
  font-size: 23rpx;
}
.tab--active {
  background: $primary-dark;
  border-color: $primary-dark;
  color: #fff;
  font-weight: 800;
}
.task {
  padding: 0;
  margin-bottom: 22rpx;
  overflow: hidden;
}
.task__top {
  display: grid;
  grid-template-columns: 80rpx 1fr;
  align-items: center;
  border-bottom: 2rpx solid $line;
}
.sequence {
  height: 78rpx;
  background: $primary-dark;
  color: $lime;
  font-size: 28rpx;
  font-weight: 900;
  display: grid;
  place-items: center;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24rpx;
}
.package {
  font-size: 22rpx;
  color: $muted;
  font-weight: 700;
}
.route-row {
  display: flex;
  gap: 20rpx;
  align-items: center;
  padding: 28rpx;
}
.pin {
  width: 64rpx;
  height: 64rpx;
  border-radius: 20rpx;
  background: $soft;
  display: grid;
  place-items: center;
}
.pin view {
  width: 20rpx;
  height: 20rpx;
  border: 6rpx solid $primary;
  border-radius: 50%;
  position: relative;
}
.pin view:after {
  content: "";
  position: absolute;
  bottom: -13rpx;
  left: 2rpx;
  border: 5rpx solid transparent;
  border-top-color: $primary;
}
.address,
.warehouse {
  display: block;
}
.address {
  font-size: 34rpx;
  font-weight: 900;
}
.warehouse {
  font-size: 20rpx;
  color: $muted;
  margin-top: 3rpx;
}
.meta {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 0 28rpx;
  padding: 20rpx 0;
  background: #f5f8f5;
  border-radius: 20rpx;
}
.meta view {
  text-align: center;
}
.meta view + view {
  border-left: 2rpx solid $line;
}
.meta text,
.meta strong {
  display: block;
}
.meta text {
  font-size: 18rpx;
  color: $muted;
}
.meta strong {
  font-size: 22rpx;
  margin-top: 3rpx;
}
.meta .money {
  color: $primary-dark;
  font-size: 26rpx;
}
.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 22rpx 28rpx;
}
.time {
  font-size: 20rpx;
  color: #9a5b20;
}
.go {
  font-size: 22rpx;
  color: $primary-dark;
  font-weight: 900;
}
.grab-btn {
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
.grab-btn[disabled] {
  opacity: 0.6;
}
.empty text {
  display: block;
}
.empty__mark {
  width: 50rpx;
  height: 50rpx;
  border: 6rpx solid $line;
  border-radius: 50%;
  margin: 0 auto 20rpx;
}
.empty__sub {
  font-size: 21rpx;
  margin-top: 7rpx;
}
</style>
