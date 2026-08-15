<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { useSessionStore } from "../../stores/session";
import type { LeaveItem } from "../../types";
const items = ref<LeaveItem[]>([]);
const session = useSessionStore();
const startDate = ref(""),
  startTime = ref(""),
  endDate = ref(""),
  endTime = ref(""),
  reason = ref("");
async function load() {
  await session.ensure();
  items.value = await api.leave();
}
onShow(load);
function pick(e: { detail: { value: string } }) {
  return e.detail.value;
}
async function apply() {
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
  await api.createLeave({
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    reason: reason.value.trim(),
  });
  startDate.value = startTime.value = endDate.value = endTime.value = "";
  reason.value = "";
  items.value = await api.leave();
  uni.showToast({ title: "请假申请已提交", icon: "success" });
}
async function accept(id: string) {
  await api.acceptDispatch(id);
  await load();
  uni.showToast({ title: "已接受调配", icon: "success" });
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
      ><button class="primary-btn apply" @tap="apply">提交申请</button></view
    ><view v-for="item in items" :key="item.id" class="leave card"
      ><view class="head"
        ><text>{{ item.building || "请假申请" }}</text
        ><text class="status">{{ item.statusText }}</text></view
      ><text class="time">{{ item.startAt }} 至 {{ item.endAt }}</text
      ><text v-if="item.reason" class="muted">原因：{{ item.reason }}</text
      ><text v-if="item.reward" class="reward">调配奖励 ¥{{ item.reward }}</text
      ><button
        v-if="item.status === 'invited'"
        class="primary-btn"
        @tap="accept(item.id)"
      >
        接受调配
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
.apply {
  margin-top: 34rpx;
}
</style>
