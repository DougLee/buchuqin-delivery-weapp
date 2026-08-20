<script setup lang="ts">
import { computed, ref } from "vue";
import {
  onPullDownRefresh,
  onReachBottom,
  onShow,
} from "@dcloudio/uni-app";
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
  error = ref(false),
  /** 首屏加载中（IK9AWY）：驱动骨架屏 */
  loading = ref(false),
  /** 滚动分页（IK9AWX）：页码 / 总数 / 加载更多中 */
  page = ref(1),
  total = ref(0),
  loadingMore = ref(false);
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
/** 首屏加载（IK9AWX/Y）：pool 走抢单池接口，其余走分页接口取第一页 */
async function load(s = active.value) {
  error.value = false;
  loading.value = true;
  // 角色切换后停留在抢单池时回退到全部（楼长无抢单池）
  if (s === "pool" && !isRider.value) s = "all";
  try {
    await session.ensure();
    active.value = s;
    page.value = 1;
    if (s === "pool") {
      items.value = await api.availableTasks();
      total.value = items.value.length;
    } else {
      const res = await api.tasksPage(s, 1);
      items.value = res.items;
      total.value = res.total;
    }
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
/** 上拉加载下一页（IK9AWX）：抢单池接口不分页，触底不追加 */
onReachBottom(async () => {
  if (
    active.value === "pool" ||
    error.value ||
    loading.value ||
    loadingMore.value
  )
    return;
  if (items.value.length >= total.value) return;
  loadingMore.value = true;
  try {
    page.value += 1;
    const res = await api.tasksPage(active.value, page.value);
    items.value = [...items.value, ...res.items];
    total.value = res.total;
  } catch {
    page.value -= 1; // 失败回退页码，下次触底重试（toast 由 request 层统一）
  } finally {
    loadingMore.value = false;
  }
});
/** 下拉刷新（IK9AWY） */
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
/** 抢单（IK8W5U）：成功跳详情；被抢走时提示并刷新列表 */
async function grab(task: Task) {
  if (grabbing.value) return;
  grabbing.value = task.id;
  try {
    const t = await api.grab(task.id);
    uni.showToast({ title: "抢单成功", icon: "success" });
    uni.navigateTo({ url: `/pages/task/detail?id=${t.id}` });
  } catch (e) {
    // IK9AWV 错误分流：只有「已被抢」类冲突才提示被抢并刷新；
    // 网络/服务异常由 request 层 toast 真实原因，不再误报「被抢」
    const msg = e instanceof Error ? e.message : "";
    if (/抢|已被|接单|冲突|conflict/i.test(msg)) {
      uni.showToast({ title: "手慢了，任务已被抢", icon: "none" });
      load("pool").catch(() => {});
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
        ><text>{{ total }}</text
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
    <view v-else-if="loading" class="tasks-skeleton"
      ><view v-for="n in 4" :key="n" class="tasks-skeleton__block" /></view
    >
    <view v-else-if="!items.length" class="empty card"
      ><view class="empty__mark"></view><text>当前分类没有任务</text
      ><text class="empty__sub">新任务会自动出现在这里</text></view
    >
    <template v-else>
      <view
        v-for="(task, index) in items"
        :key="task.id"
        class="task card"
        role="button"
        @tap="uni.navigateTo({ url: `/pages/task/detail?id=${task.id}` })"
      >
        <view class="task__top"
          ><view class="sequence">{{
            String(index + 1).padStart(2, "0")
          }}</view
          ><view class="head"
            ><text class="package">{{ task.packageNo }}</text
            ><text class="status">{{ task.statusText }}</text></view
          ></view
        >
        <view class="route-row"
          ><!-- 路线点语义：取/送两段显式标注，单图钉不再歧义 -->
          ><view class="pin"><view></view></view
          ><view class="route"
            ><view class="route__leg"
              ><text class="route__tag route__tag--to">送</text
              ><text class="address"
                >{{ task.building }} · {{ task.floor }} 楼 · {{ task.room }}</text
              ></view
            ><view class="route__leg"
              ><text class="route__tag">取</text
              ><text class="warehouse">{{ task.warehouse }}</text></view
            ></view
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
            ><strong class="money"
              >¥{{ fenToYuan(task.commission) }}</strong
            ></view
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
          </button><text v-else class="link-chip">查看任务</text></view
        >
      </view>
      <!-- 分页脚标（IK9AWX）：抢单池不分页不显示 -->
      <view
        v-if="active !== 'pool' && items.length < total"
        class="list-foot"
        >{{ loadingMore ? "加载中…" : "上拉加载更多" }}</view
      >
      <view v-else-if="active !== 'pool'" class="list-foot">没有更多了</view>
    </template>
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
  font-size: 20rpx;
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
  font-size: 21rpx;
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
  font-size: 20rpx;
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
.route {
  min-width: 0;
}
.route__leg {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
}
.route__leg + .route__leg {
  margin-top: 8rpx;
}
.route__tag {
  flex: 0 0 auto;
  font-size: 20rpx;
  font-weight: 800;
  color: $muted;
  background: $soft;
  border-radius: 10rpx;
  padding: 2rpx 12rpx;
}
.route__tag--to {
  color: #fff;
  background: $primary;
}
.address,
.warehouse {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.address {
  font-size: 32rpx;
  font-weight: 900;
}
.warehouse {
  font-size: 21rpx;
  color: $muted;
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
  font-size: 20rpx;
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
.list-foot {
  text-align: center;
  color: $muted;
  font-size: 22rpx;
  padding: 20rpx 0 10rpx;
}
.tasks-skeleton__block {
  height: 250rpx;
  border-radius: 28rpx;
  margin-bottom: 22rpx;
  background: linear-gradient(90deg, #edf2ed, #fff, #edf2ed);
  animation: tasks-pulse 1.2s infinite;
}
@keyframes tasks-pulse {
  50% {
    opacity: 0.55;
  }
}
</style>
