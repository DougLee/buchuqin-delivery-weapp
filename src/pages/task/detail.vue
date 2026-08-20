<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { api } from "../../api";
import { ApiError, isRetryable } from "../../api/request";
import { uploadImage } from "../../api/upload";
import { useSessionStore } from "../../stores/session";
import { formatShort } from "../../utils/datetime";
import { fenToYuan } from "../../utils/money";
import type { Task } from "../../types";
const session = useSessionStore(),
  task = ref<Task>();
/** IK8W5V：加载失败标记，展示重试入口避免页面永久空白 */
const error = ref(false);
/** 首屏加载中（IK9VF8）：驱动骨架屏，对齐 tasks/income 标准 */
const loading = ref(false);
const taskId = ref("");
/** 动作进行中防重复提交 */
const acting = ref(false);
const labels: Record<string, string> = {
  accept: "接收任务",
  pickup: "扫码取货",
  depart: "确认从校园仓出发",
  arrive: "到达楼下",
  handover: "确认交接楼长",
  receive: "确认楼下接货",
  "start-delivery": "开始送往寝室",
  delivered: "上传凭证并送达",
  absent: "用户不在",
  refused: "用户拒收",
  transfer: "申请转单",
};
/** timeline 节点 key → 展示标题（老数据 title 存的是原始 key，IK8W5V） */
const stepTitles: Record<string, string> = {
  paid: "支付成功",
  picking: "仓库拣货",
  "first-mile": "送往楼下",
  "waiting-handover": "楼下待交接",
  "last-mile": "送到寝室",
};
function stepTitle(key: string, title: string): string {
  return stepTitles[key] ?? title ?? key;
}
async function load(id: string) {
  taskId.value = id;
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    task.value = await api.task(session.role, id);
  } catch (e) {
    // ADR-0005(IKA00R)：仅网络/服务故障进整页错误态，业务拒绝由 request 层 toast
    if (isRetryable(e)) error.value = true;
  } finally {
    loading.value = false;
  }
}
onLoad((q) => load(String(q?.id ?? "")));
/**
 * 自绘输入弹层（IK9AX1 → IK9U4I 重构）：uni.showModal 的 editable 仅微信
 * 小程序支持。resolve 存模块级普通变量（响应式对象存函数在部分真机上
 * 会被代理干扰），输入值独立 ref，确定/取消走显式方法。
 */
const dialogVisible = ref(false),
  dialogTitle = ref(""),
  dialogPlaceholder = ref(""),
  dialogInput = ref("");
let dialogResolve: ((v: string | null) => void) | null = null;
function promptDialog(
  title: string,
  placeholder: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    dialogResolve = resolve;
    dialogTitle.value = title;
    dialogPlaceholder.value = placeholder;
    dialogInput.value = "";
    dialogVisible.value = true;
  });
}
function settleDialog(result: string | null) {
  dialogVisible.value = false;
  dialogResolve?.(result);
  dialogResolve = null;
}
/** 弹层确定（IK9U4I）：trim 后提交，空串按取消语义交给调用方判断 */
function confirmDialog() {
  settleDialog(dialogInput.value.trim());
}
/** 扫码取码值；扫码取消/失败时允许手动输入兜底 */
function scanOrInput(title: string): Promise<string> {
  // TODO(真机验证): uni.scanCode 在真机的扫码回调与取消路径
  return new Promise((resolve, reject) => {
    uni.scanCode({
      scanType: ["qrCode", "barCode"],
      success: (res) => resolve(res.result),
      fail: async () => {
        const input = await promptDialog(title, "扫码失败时可手动输入编号");
        if (input) resolve(input);
        else reject(new Error("已取消"));
      },
    });
  });
}
/** 弹文本输入框（IK8W5U 异常上报/转单）：确认返回输入值（可为空串），取消返回 null */
function promptText(title: string, placeholder: string): Promise<string | null> {
  return promptDialog(title, placeholder);
}
/** 收件人联系（IK9AWW）：展示脱敏、拨号用真实号（真实号仅当班员工可见） */
function maskName(name: string): string {
  if (!name) return "—";
  return name.length <= 1
    ? name
    : name[0] + "*".repeat(Math.min(name.length - 1, 2));
}
function maskPhone(phone: string): string {
  return /^1\d{10}$/.test(phone)
    ? phone.slice(0, 3) + "****" + phone.slice(7)
    : "—";
}
const callRecipient = () => {
  if (task.value?.recipientPhone)
    uni.makePhoneCall({ phoneNumber: task.value.recipientPhone });
};
/** 选图并上传（可选凭证）：用户取消或上传失败时返回 []，不阻断动作 */
async function chooseUploadedImages(count: number): Promise<string[]> {
  try {
    const chosen = await uni.chooseImage({ count, sizeType: ["compressed"] });
    const paths = Array.isArray(chosen.tempFilePaths)
      ? chosen.tempFilePaths
      : [chosen.tempFilePaths];
    if (!paths.length) return [];
    uni.showLoading({ title: "照片上传中", mask: true });
    return await Promise.all(paths.map((p) => uploadImage(p)));
  } catch {
    return [];
  } finally {
    uni.hideLoading();
  }
}
/** 取真实 gcj02 定位，失败直接报错并中断动作 */
function locate(): Promise<{ latitude: number; longitude: number }> {
  // TODO(真机验证): 真机定位授权与精度
  return new Promise((resolve, reject) => {
    uni.getLocation({
      type: "gcj02",
      isHighAccuracy: true,
      success: (res) => resolve({ latitude: res.latitude, longitude: res.longitude }),
      fail: () => {
        uni.showToast({ title: "定位失败，请检查定位授权", icon: "none" });
        reject(new Error("定位失败"));
      },
    });
  });
}
async function act(action: string) {
  if (!task.value || acting.value) return;
  acting.value = true;
  let payload: Record<string, unknown> = {};
  try {
    if (action === "pickup")
      payload = { packageCode: await scanOrInput("输入包裹编号") };
    if (action === "handover")
      payload = { handoverCode: await scanOrInput("输入交接码") };
    // 转单（IK8W5U）：原因必填
    if (action === "transfer") {
      const reason = await promptText("申请转单", "请填写转单原因（必填）");
      if (reason === null) return;
      if (!reason) {
        uni.showToast({ title: "请填写转单原因", icon: "none" });
        return;
      }
      payload = { reason };
    }
    // 异常上报-用户不在（IK8W5U）：备注 + 可选照片
    if (action === "absent") {
      const remark = await promptText("用户不在", "备注放置位置/联系结果（选填）");
      if (remark === null) return;
      payload = { reason: remark, images: await chooseUploadedImages(3) };
    }
    if (action === "delivered") {
      const chosen = await uni.chooseImage({ count: 1, sizeType: ["compressed"] });
      const paths = Array.isArray(chosen.tempFilePaths)
        ? chosen.tempFilePaths
        : [chosen.tempFilePaths];
      uni.showLoading({ title: "凭证上传中", mask: true });
      const images = await Promise.all(paths.map((p) => uploadImage(p)));
      const coords = await locate();
      payload = { images, ...coords };
    }
    // 微信端 showLoading 与 showToast 共用单例：必须先收 loading 再弹结果，
    // 否则 toast 被 loading 遮罩吞掉——真机上表现为「点了没反应」（IK9U4I/J）
    uni.hideLoading();
    task.value = await api.action(session.role, task.value.id, action, payload);
    uni.showToast({ title: "操作成功", icon: "success" });
  } catch (error) {
    // IK9U4I/J：任何失败都必须可见。request 层的 toast 可能已被 loading
    // 吞掉，这里兜底再弹一次错误信息，宁可重复不可无反馈
    uni.hideLoading();
    const msg =
      error instanceof Error && error.message ? error.message : "操作失败，请重试";
    // 用户主动取消（选图/扫码取消 reject「已取消」）不是错误，静默返回（IK9VF8）
    if (/cancel|已取消/i.test(msg)) return;
    console.error("[task action]", action, msg);
    // ADR-0005(IKA00R)：ApiError 调 request 层时已 toast（调 api 前 loading
    // 已收，不会被吞）；这里只兜本地失败（定位/选图等），不再重复弹
    if (!(error instanceof ApiError))
      setTimeout(() => uni.showToast({ title: msg, icon: "none" }), 60);
  } finally {
    acting.value = false;
  }
}
</script>
<template>
  <view v-if="error" class="page"
    ><view class="retry card" role="button" @tap="load(taskId)"
      ><text class="retry__title">任务加载失败</text
      ><text class="retry__sub">网络异常或任务不存在，点击重试</text></view
    ></view
  >
  <!-- 首屏骨架（IK9VF8）：摘要 + 商品 + 进度占位 -->
  <view v-else-if="loading" class="page"
    ><view class="detail-skeleton__summary" /><view class="detail-skeleton__block" /><view
      class="detail-skeleton__timeline"
    /></view
  >
  <view v-else-if="task" class="page"
    ><view class="summary"
      ><text class="status-text">{{ task.statusText }}</text
      ><text class="destination"
        >{{ task.building }} · {{ task.floor }} 楼 · {{ task.room }}</text
      ><text class="muted-light"
        >{{ task.packageNo }}　{{ task.modeText }}</text
      ></view
    ><view class="section-title"
      ><text class="section-title__main">包裹商品</text
      ><text class="section-title__sub"
        >{{ task.itemCount }} 件 / {{ task.weight }}kg</text
      ></view
    ><view class="goods card"
      ><view v-for="item in task.items" :key="item.name" class="goods__line"
        ><image :src="item.image" mode="aspectFit" /><text>{{ item.name }}</text
        ><text>× {{ item.quantity }}</text></view
      ></view
    ><view class="info card"
      ><view
        ><text>取货仓库</text><text>{{ task.warehouse }}</text></view
      ><view
        ><text>预计时效</text><text>{{ task.deadline }}</text></view
      ><view
        ><text>预计收入</text
        ><text class="income">¥{{ fenToYuan(task.commission) }}</text></view
      ></view
    ><!-- 收件人联系（IK9AWW）：脱敏展示 + 一键拨真实号 -->
<view
      v-if="task.recipientName || task.recipientPhone"
      class="contact card"
      ><view
        ><text class="contact__label">收件人</text
        ><text class="contact__value"
        >{{ maskName(task.recipientName) }} · {{ maskPhone(task.recipientPhone) }}</text
      ></view
      ><button
        class="contact__call"
        aria-label="拨打收件人电话"
        @tap="callRecipient"
      >
        联系
      </button></view
    ><!-- IK8W5V：渲染后端 Task.timeline（types.ts 已有定义） -->
    <view class="section-title"
      ><text class="section-title__main">履约进度</text
      ><text class="section-title__sub"
        >{{ task.timeline.filter((s) => s.done).length }}/{{
          task.timeline.length
        }}
        节点</text
      ></view
    ><view class="timeline card"
      ><view
        v-for="(step, i) in task.timeline"
        :key="step.key"
        class="step"
        :class="{ 'step--done': step.done }"
      >
        <view class="step__rail"
          ><view class="step__dot"></view
          ><view
            v-if="i < task.timeline.length - 1"
            class="step__line"
          ></view
        ></view>
        <view class="step__body"
          ><text class="step__title">{{ stepTitle(step.key, step.title) }}</text
          ><text v-if="step.description" class="step__desc">{{
            step.description
          }}</text
          ><text v-if="step.time" class="step__time">{{
            formatShort(step.time)
          }}</text
        ></view>
      </view></view
    ><view class="actions"
      ><button
        v-for="action in task.availableActions"
        :key="action"
        :class="
          action === 'transfer' || action === 'absent'
            ? 'danger'
            : 'primary-btn'
        "
        @tap="act(action)"
      >
        {{ labels[action] || action }}</button
      ><!-- IK9U45：无可执行操作时直接不渲染该区域，去掉「当前节点暂无可执行操作」空文案 --></view
    ></view
  >
  <!-- 自绘输入弹层（IK9AX1）：扫码兜底 / 转单原因 / 异常备注 -->
  <view v-if="dialogVisible" class="input-dialog"
    ><view class="input-dialog__mask" @tap="settleDialog(null)"></view
    ><view class="input-dialog__panel"
      ><text class="input-dialog__title">{{ dialogTitle }}</text
      ><input
        v-model="dialogInput"
        class="input-dialog__input"
        :placeholder="dialogPlaceholder"
        placeholder-class="input-dialog__placeholder"
        :focus="dialogVisible"
        confirm-type="done"
        @confirm="confirmDialog()"
      /><view class="input-dialog__actions"
      ><button class="input-dialog__btn" @tap="settleDialog(null)">
        取消
      </button
      ><button
        class="input-dialog__btn input-dialog__btn--primary"
        @tap="confirmDialog()"
      >
        确定
      </button></view
    ></view
  ></view
  >
</template>
<style scoped lang="scss">
@import "../../styles/theme.scss";
.summary {
  padding: 38rpx;
  border-radius: 32rpx;
  background: linear-gradient(135deg, $primary-dark, $primary);
  color: #fff;
}
.status-text,
.destination,
.muted-light {
  display: block;
}
.status-text {
  font-weight: 800;
}
.destination {
  font-size: 42rpx;
  font-weight: 900;
  margin: 18rpx 0;
}
.muted-light {
  opacity: 0.82;
  font-size: 22rpx;
}
.goods {
  padding: 10rpx 26rpx;
}
.goods__line {
  display: grid;
  grid-template-columns: 90rpx 1fr auto;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 0;
  border-bottom: 2rpx solid $line;
}
.goods__line image {
  width: 90rpx;
  height: 90rpx;
  background: $soft;
  border-radius: 18rpx;
}
.info {
  margin-top: 22rpx;
  padding: 22rpx 28rpx;
}
.info > view {
  display: flex;
  justify-content: space-between;
  padding: 15rpx 0;
}
.info > view text:first-child {
  color: $muted;
}
.income {
  color: $primary-dark;
  font-weight: 900;
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
.timeline {
  padding: 26rpx 28rpx;
}
.step {
  display: flex;
  gap: 18rpx;
}
.step__rail {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.step__dot {
  width: 20rpx;
  height: 20rpx;
  border-radius: 50%;
  border: 5rpx solid $line;
  background: #fff;
  margin-top: 6rpx;
}
.step--done .step__dot {
  border-color: $primary;
  background: $primary;
}
.step__line {
  width: 4rpx;
  flex: 1;
  min-height: 34rpx;
  background: $line;
}
.step--done .step__line {
  background: $primary;
}
.step__body {
  flex: 1;
  padding-bottom: 26rpx;
}
.step:last-child .step__body {
  padding-bottom: 0;
}
.step__title,
.step__desc,
.step__time {
  display: block;
}
.step__title {
  font-size: 26rpx;
  font-weight: 800;
  color: $muted;
}
.step--done .step__title {
  color: $primary-dark;
}
.step__desc {
  font-size: 21rpx;
  color: $muted;
  margin-top: 3rpx;
}
.step__time {
  font-size: 20rpx;
  color: $muted;
  margin-top: 3rpx;
}
.contact {
  margin-top: 22rpx;
  padding: 22rpx 28rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20rpx;
}
.contact__label {
  display: block;
  color: $muted;
  font-size: 20rpx;
  margin-bottom: 4rpx;
}
.contact__value {
  font-weight: 800;
  font-size: 28rpx;
}
.contact__call {
  min-height: 88rpx;
  margin: 0;
  padding: 0 48rpx;
  border-radius: 999rpx;
  background: $primary-dark;
  color: #fff;
  font-size: 26rpx;
  font-weight: 800;
  display: flex;
  align-items: center;
}
.input-dialog__mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 30, 20, 0.5);
  z-index: 998;
}
.input-dialog__panel {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 600rpx;
  z-index: 999;
  background: #fff;
  border-radius: 28rpx;
  padding: 40rpx 32rpx 28rpx;
  box-sizing: border-box;
}
.input-dialog__title {
  display: block;
  text-align: center;
  font-size: 34rpx;
  font-weight: 900;
  margin-bottom: 26rpx;
}
.input-dialog__input {
  height: 92rpx;
  border: 2rpx solid $line;
  border-radius: 18rpx;
  background: $paper;
  padding: 0 24rpx;
  font-size: 30rpx;
}
.input-dialog__placeholder {
  color: #8a938d;
}
.input-dialog__actions {
  display: flex;
  gap: 18rpx;
  margin-top: 28rpx;
}
.input-dialog__btn {
  flex: 1;
  min-height: 88rpx;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 44rpx;
  background: $paper;
  color: $ink;
  font-size: 30rpx;
  font-weight: 700;
}
.input-dialog__btn--primary {
  background: $primary-dark;
  color: #fff;
}
.actions {
  display: grid;
  gap: 16rpx;
  margin-top: 26rpx;
}
.danger {
  min-height: 88rpx;
  border-radius: 44rpx;
  background: #fff;
  font-weight: 800;
  color: #a74432;
  border: 2rpx solid #efc9c1;
}
/* 首屏骨架（IK9VF8）：shimmer 与 tasks/income 同款 */
.detail-skeleton__summary,
.detail-skeleton__block,
.detail-skeleton__timeline {
  border-radius: 32rpx;
  background: linear-gradient(90deg, #edf2ed, #fff, #edf2ed);
  animation: detail-pulse 1.2s infinite;
}
.detail-skeleton__summary {
  height: 240rpx;
}
.detail-skeleton__block {
  height: 160rpx;
  margin-top: 22rpx;
}
.detail-skeleton__timeline {
  height: 380rpx;
  margin-top: 22rpx;
}
@keyframes detail-pulse {
  50% {
    opacity: 0.55;
  }
}
</style>
