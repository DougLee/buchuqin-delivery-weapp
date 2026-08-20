<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { useSessionStore } from "../../stores/session";
import { formatShort } from "../../utils/datetime";
import { fenToYuan } from "../../utils/money";
import type { LeaveItem } from "../../types";
const items = ref<LeaveItem[]>([]);
const session = useSessionStore();
/** IK8W5V：加载失败标记，展示重试入口避免页面永久空白 */
const error = ref(false);
const startDate = ref(""),
  startTime = ref(""),
  endDate = ref(""),
  endTime = ref(""),
  reason = ref(""),
  /** 请假期间订单调配方式（IK9U4B 反馈#9）：self=自己联系代班楼长，platform=平台自动派单 */
  dispatchMode = ref<"self" | "platform">("platform");
async function load() {
  error.value = false;
  try {
    await session.ensure();
    items.value = await api.leave();
  } catch {
    error.value = true;
  }
}
onShow(load);
function pick(e: { detail: { value: string } }) {
  return e.detail.value;
}
/** 提交防重（IK9AWU）：连点「提交申请」只发一次请求 */
const submitting = ref(false);
async function apply() {
  if (submitting.value) return;
  if (!startDate.value || !startTime.value || !endDate.value || !endTime.value) {
    uni.showToast({ title: "请选择请假的起止时间", icon: "none" });
    return;
  }
  if (!reason.value.trim()) {
    uni.showToast({ title: "请填写请假原因", icon: "none" });
    return;
  }
  const startAt = new Date(`${startDate.value}T${startTime.value}:00`);
  const endAt = new Date(`${endDate.value}T${endTime.value}:00`);
  if (endAt.getTime() <= startAt.getTime()) {
    uni.showToast({ title: "结束时间需晚于开始时间", icon: "none" });
    return;
  }
  submitting.value = true;
  try {
    await api.createLeave({
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      reason: reason.value.trim(),
      // IK9U4B：调配方式随请假单提交（后端落库供后台核对，平台模式才会自动派单）
      dispatchMode: dispatchMode.value,
    });
    startDate.value = startTime.value = endDate.value = endTime.value = "";
    reason.value = "";
    items.value = await api.leave();
    uni.showToast({ title: "请假申请已提交", icon: "success" });
  } catch {
    // 失败提示由 request 层统一 toast，表单保留已填内容便于改后重提
  } finally {
    submitting.value = false;
  }
}
/** 接受调配防重（IK9AWU）：正在接受的邀请 id */
const accepting = ref<string | null>(null);
async function accept(id: string) {
  if (accepting.value) return;
  accepting.value = id;
  try {
    await api.acceptDispatch(id);
    await load();
    uni.showToast({ title: "已接受调配", icon: "success" });
  } catch {
    // 失败提示由 request 层统一 toast
  } finally {
    accepting.value = null;
  }
}
/** 拒绝调配邀请（IK8W5U）：POST dispatch-invitations/:id/reject */
function reject(id: string) {
  uni.showModal({
    title: "拒绝调配",
    content: "确定拒绝该跨楼调配邀请吗？",
    success: async (m) => {
      if (!m.confirm) return;
      await api.rejectDispatch(id);
      await load();
      uni.showToast({ title: "已拒绝调配", icon: "success" });
    },
  });
}
/** 撤销待审核请假（IK8W5U）：POST leave-requests/:id/cancel */
function cancelRequest(id: string) {
  uni.showModal({
    title: "撤销请假",
    content: "确定撤销这条请假申请吗？",
    success: async (m) => {
      if (!m.confirm) return;
      await api.cancelLeave(id);
      await load();
      uni.showToast({ title: "已撤销", icon: "success" });
    },
  });
}
</script>
<template>
  <view class="page"
    ><view class="tip"
      >请假需至少提前 2 小时提交；调配邀请需本人同意后才会生效。</view
    ><view class="form card"
      ><view class="section-title"
        ><text class="section-title__main">申请请假</text></view
      ><view class="field"
      ><text class="field__label">开始时间</text
      ><view class="field__pickers"
        ><picker mode="date" :value="startDate" @change="startDate = pick($event)"
          ><text :class="{ placeholder: !startDate }">{{
            startDate || "选择日期"
          }}</text></picker
        ><picker mode="time" :value="startTime" @change="startTime = pick($event)"
          ><text :class="{ placeholder: !startTime }">{{
            startTime || "选择时间"
          }}</text></picker
        ></view
      ></view
      ><view class="field"
      ><text class="field__label">结束时间</text
      ><view class="field__pickers"
        ><picker mode="date" :value="endDate" @change="endDate = pick($event)"
          ><text :class="{ placeholder: !endDate }">{{
            endDate || "选择日期"
          }}</text></picker
        ><picker mode="time" :value="endTime" @change="endTime = pick($event)"
          ><text :class="{ placeholder: !endTime }">{{
            endTime || "选择时间"
          }}</text></picker
        ></view
      ></view
      ><view class="field field--column"
      ><text class="field__label">请假原因</text
      ><textarea
        v-model="reason"
        class="field__input"
        placeholder="请填写具体原因（必填）"
        maxlength="200"
      ></textarea></view
      ><!-- IK9U4B（反馈#9）：请假期间本楼订单处理方式二选一 -->
      ><view class="field field--column"
        ><text class="field__label">请假期间本楼订单如何处理?</text
        ><view
          class="dispatch-opt"
          :class="{ 'dispatch-opt--active': dispatchMode === 'self' }"
          role="button"
          @tap="dispatchMode = 'self'"
          ><text class="dispatch-opt__title">自己联系调配楼长</text
          ><text class="muted">我已联系好其他楼长代班，平台展示姓名供核对</text
          ></view
        ><view
          class="dispatch-opt"
          :class="{ 'dispatch-opt--active': dispatchMode === 'platform' }"
          role="button"
          @tap="dispatchMode = 'platform'"
          ><text class="dispatch-opt__title">平台分配调配楼长</text
          ><text class="muted">由平台按同性别、同楼栋邻近自动派单</text
          ></view
        ></view
      ><button class="primary-btn apply" :disabled="submitting" @tap="apply">
        {{ submitting ? "提交中…" : "提交申请" }}</button
      ></view
    ><view v-if="error" class="retry card" role="button" @tap="load"
      ><text class="retry__title">加载失败</text
      ><text class="retry__sub">网络异常或服务暂不可用，点击重试</text></view
    ><view v-for="item in items" :key="item.id" class="leave card"
      ><view class="head"
        ><text>{{ item.building || "请假申请" }}</text
        ><text class="status">{{ item.statusText }}</text></view
      ><text class="time"
        >{{ formatShort(item.startAt) }} 至 {{ formatShort(item.endAt) }}</text
      >
      ><text v-if="item.reason" class="muted">原因：{{ item.reason }}</text
      ><text v-if="item.reward" class="reward"
        >调配奖励 ¥{{ fenToYuan(item.reward) }}</text
      >
      ><view v-if="item.status === 'invited'" class="leave__ops"
        ><button
          class="primary-btn"
          :disabled="accepting === item.id"
          @tap="accept(item.id)"
        >
          {{ accepting === item.id ? "接受中…" : "接受调配" }}</button
        ><button class="ghost-btn" @tap="reject(item.id)">拒绝</button></view
      ><button
        v-if="item.status === 'pending'"
        class="ghost-btn"
        @tap="cancelRequest(item.id)"
      >
        撤销请假
      </button></view
    ></view
  >
</template>
<style scoped lang="scss">
@import "../../styles/theme.scss";
.tip {
  background: $warning;
  color: #85500c;
  padding: 22rpx;
  border-radius: 22rpx;
  margin-bottom: 22rpx;
}
.form {
  padding: 26rpx 28rpx;
  margin-bottom: 24rpx;
}
.field {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 20rpx 0;
  border-bottom: 2rpx solid $line;
}
.field--column {
  flex-direction: column;
  align-items: stretch;
  gap: 14rpx;
  border-bottom: none;
}
.field__label {
  width: 140rpx;
  font-weight: 800;
  color: $ink;
}
.field__pickers {
  flex: 1;
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
}
.field__pickers picker {
  flex: 1;
  text-align: center;
  padding: 14rpx 0;
  background: $soft;
  border-radius: 16rpx;
  font-weight: 600;
}
.placeholder {
  color: $muted;
}
.field__input {
  width: 100%;
  min-height: 140rpx;
  padding: 18rpx;
  box-sizing: border-box;
  background: $soft;
  border-radius: 16rpx;
  font-size: 26rpx;
}
/* 调配方式选项（IK9U4B）：卡片单选 */
.dispatch-opt {
  margin-top: 14rpx;
  padding: 20rpx 24rpx;
  border: 3rpx solid $line;
  border-radius: 18rpx;
  background: #fff;
}
.dispatch-opt--active {
  border-color: $primary;
  background: $soft;
}
.dispatch-opt__title {
  display: block;
  font-weight: 800;
  color: $primary-dark;
}
/* 选中勾 CSS 绘制（IK9VF8）：✓ 为特殊 Unicode，安卓部分机型缺字形渲染方框 */
.dispatch-opt--active .dispatch-opt__title::after {
  content: "";
  display: inline-block;
  width: 15rpx;
  height: 9rpx;
  margin-left: 10rpx;
  border-left: 4rpx solid $primary;
  border-bottom: 4rpx solid $primary;
  transform: rotate(-45deg) translateY(-2rpx);
}
.leave {
  padding: 28rpx;
  margin-bottom: 20rpx;
}
.head {
  display: flex;
  justify-content: space-between;
  font-weight: 900;
}
.time {
  display: block;
  margin: 20rpx 0;
}
.reward {
  display: block;
  color: $primary-dark;
  font-weight: 900;
  margin-top: 12rpx;
}
.leave .primary-btn {
  margin-top: 22rpx;
}
.leave__ops {
  display: flex;
  gap: 18rpx;
  margin-top: 22rpx;
}
.leave__ops .primary-btn {
  flex: 1;
  margin-top: 0;
}
.ghost-btn {
  flex: 1;
  min-height: 96rpx;
  margin-top: 22rpx;
  border-radius: 28rpx;
  background: #fff;
  border: 2rpx solid $line;
  color: $muted;
  font-size: 30rpx;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}
.leave__ops .ghost-btn {
  margin-top: 0;
}
.apply {
  margin-top: 34rpx;
}
.retry {
  text-align: center;
  padding: 100rpx 30rpx;
  margin-bottom: 20rpx;
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
</style>
