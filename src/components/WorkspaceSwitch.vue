<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onShow } from "@dcloudio/uni-app";
import {
  canSwitchWorkspace,
  fetchBizContext,
  switchWorkspace,
  type BizContext,
  type Workspace,
} from "../utils/nightMode";
import type { StaffStatus } from "../types";

const props = defineProps<{
  current: Workspace;
  status?: string;
  staffStatus?: StaffStatus;
}>();
const context = ref<BizContext>();
const busy = ref(false);
const visible = computed(() => canSwitchWorkspace(context.value));
const emit = defineEmits<{ (event: "visibility-change", visible: boolean): void }>();
watch(visible, value => emit("visibility-change", value), { immediate: true });
const night = computed(() => props.current === "night");
const statusText = computed(
  () =>
    props.status ||
    (night.value
      ? "加载中"
      : props.staffStatus
        ? { online: "接单中", paused: "暂停接单", offline: "已下线" }[props.staffStatus]
        : "加载中"),
);
function update(ctx: BizContext) {
  context.value = ctx;
}
async function refresh() {
  context.value = undefined;
  const token = uni.getStorageSync("staffToken");
  const ctx = await fetchBizContext();
  if (token === uni.getStorageSync("staffToken")) context.value = ctx;
}
onShow(refresh);
onMounted(() => uni.$on("business:context", update));
onUnmounted(() => uni.$off("business:context", update));
async function toggle() {
  if (busy.value || !visible.value) return;
  busy.value = true;
  try {
    await switchWorkspace(night.value ? "day" : "night");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <view
    v-if="visible"
    class="workspace-switch"
    :class="{ 'workspace-switch--night': night }"
  >
    <view class="workspace-switch__current">
      <view
        class="workspace-switch__icon"
        :class="night ? 'workspace-switch__moon' : 'workspace-switch__sun'"
        ><view
      /></view>
      <view class="workspace-switch__context"
        ><text class="workspace-switch__title">{{
          night ? "夜宵店" : "白天店"
        }}</text
        ><view class="workspace-switch__status"
          ><view class="workspace-switch__dot" /><text>{{
            statusText
          }}</text></view
        ></view
      >
    </view>
    <button
      class="workspace-switch__button"
      :disabled="busy"
      :aria-label="night ? '切换白天店' : '切换夜宵店'"
      @tap="toggle"
    >
      <view
        class="workspace-switch__icon"
        :class="night ? 'workspace-switch__sun' : 'workspace-switch__moon'"
        ><view
      /></view>
      <text>{{ busy ? "切换中…" : night ? "切换白天店" : "切换夜宵店" }}</text>
      <view class="workspace-switch__arrows" aria-hidden="true"
        ><view /><view
      /></view>
    </button>
  </view>
</template>

<style scoped lang="scss">
@import "../styles/night.scss";
.workspace-switch {
  --ws-surface: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  padding: 6rpx 10rpx 6rpx 20rpx;
  margin: 12rpx 0 20rpx;
  border: 1px solid #dce6d8;
  border-radius: 28rpx;
  background: var(--ws-surface);
  color: #254e36;
  box-shadow: 0 6rpx 24rpx rgba(24, 59, 44, 0.035);
}
.workspace-switch__current {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
}
.workspace-switch__context {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
}
.workspace-switch__title {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
}
.workspace-switch__status {
  display: flex;
  align-items: center;
  gap: 7rpx;
  padding: 6rpx 10rpx;
  border-radius: 999rpx;
  background: #edf4eb;
  font-size: 21rpx;
  line-height: 1.3;
  color: #536d5b;
  white-space: nowrap;
}
.workspace-switch__dot {
  width: 7rpx;
  height: 7rpx;
  border-radius: 50%;
  background: #27834f;
  flex: none;
}
.workspace-switch__button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  min-height: 44px;
  padding: 0 16rpx;
  margin: 0;
  flex: none;
  border: 1px solid #cdddc9;
  border-radius: 22rpx;
  color: #28513a;
  background: #fff;
  font-size: 24rpx;
  font-weight: 650;
  line-height: 1.3;
  cursor: pointer;
  transition:
    opacity 0.18s,
    background-color 0.18s;
}
.workspace-switch__button:after {
  border: 0;
}
.workspace-switch__button:active {
  opacity: 0.75;
}
.workspace-switch__button:focus-visible {
  outline: 2px solid #27834f;
  outline-offset: 3px;
}
.workspace-switch__button[disabled] {
  opacity: 0.65;
}
.workspace-switch__icon {
  width: 36rpx;
  height: 36rpx;
  position: relative;
  flex: none;
  color: #27834f;
}
.workspace-switch__button .workspace-switch__icon {
  width: 28rpx;
  height: 28rpx;
  color: inherit;
}
.workspace-switch__sun {
  background:
    linear-gradient(currentColor, currentColor) center top / 1px 15% no-repeat,
    linear-gradient(currentColor, currentColor) center bottom / 1px 15%
      no-repeat,
    linear-gradient(currentColor, currentColor) left center / 15% 1px no-repeat,
    linear-gradient(currentColor, currentColor) right center / 15% 1px no-repeat;
}
.workspace-switch__sun > view {
  position: absolute;
  inset: 25%;
  border: 1.5px solid currentColor;
  border-radius: 50%;
}
.workspace-switch__moon {
  overflow: hidden;
}
.workspace-switch__moon:before {
  content: "";
  position: absolute;
  width: 76%;
  height: 76%;
  left: 7%;
  bottom: 5%;
  background: currentColor;
  border-radius: 50%;
  box-sizing: border-box;
}
.workspace-switch__moon:after {
  content: "";
  position: absolute;
  width: 64%;
  height: 64%;
  right: -5%;
  top: -8%;
  background: var(--ws-surface);
  border-radius: 50%;
}
.workspace-switch__arrows {
  position: relative;
  width: 24rpx;
  height: 28rpx;
  opacity: 0.7;
}
.workspace-switch__arrows > view {
  position: absolute;
  width: 100%;
  height: 0;
  border-top: 1px solid currentColor;
  top: 7rpx;
}
.workspace-switch__arrows > view:after {
  content: "";
  position: absolute;
  width: 6rpx;
  height: 6rpx;
  right: 0;
  top: -4rpx;
  border-top: 1px solid currentColor;
  border-right: 1px solid currentColor;
  transform: rotate(45deg);
}
.workspace-switch__arrows > view + view {
  top: 20rpx;
  transform: rotate(180deg);
}
.workspace-switch--night {
  --ws-surface: #152f21;
  color: $nb-text;
  border-color: $nb-border;
  background: $nb-surface;
  box-shadow: $nb-card-highlight;
}
.workspace-switch--night .workspace-switch__icon {
  color: $nb-gold;
}
.workspace-switch--night .workspace-switch__status {
  color: $nb-text-sub;
  background: rgba(158, 223, 178, 0.1);
}
.workspace-switch--night .workspace-switch__dot {
  background: $nb-gold;
}
.workspace-switch--night .workspace-switch__button {
  --ws-surface: #293e2b;
  color: $nb-gold;
  background: var(--ws-surface);
  border-color: #6a7d56;
}
.workspace-switch--night .workspace-switch__button:focus-visible {
  outline-color: $nb-gold;
}
@media (prefers-reduced-motion: reduce) {
  .workspace-switch__button {
    transition: none;
  }
}
</style>
