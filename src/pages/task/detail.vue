<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { api } from "../../api";
import { uploadImage } from "../../api/upload";
import { useSessionStore } from "../../stores/session";
import { formatShort } from "../../utils/datetime";
import type { Task } from "../../types";
const session = useSessionStore(),
  task = ref<Task>();
/** IK8W5V：加载失败标记，展示重试入口避免页面永久空白 */
const error = ref(false);
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
  try {
    await session.ensure();
    task.value = await api.task(session.role, id);
  } catch {
    error.value = true;
  }
}
onLoad((q) => load(String(q?.id ?? "")));
/** 扫码取码值；扫码取消/失败时允许手动输入兜底 */
function scanOrInput(title: string): Promise<string> {
  // TODO(真机验证): uni.scanCode 在真机的扫码回调与取消路径
  return new Promise((resolve, reject) => {
    uni.scanCode({
      scanType: ["qrCode", "barCode"],
      success: (res) => resolve(res.result),
      fail: () => {
        uni.showModal({
          title,
          editable: true,
          placeholderText: "扫码失败时可手动输入编号",
          success: (m) => {
            if (m.confirm && m.content) resolve(m.content.trim());
            else reject(new Error("已取消"));
          },
          fail: () => reject(new Error("已取消")),
        });
      },
    });
  });
}
/** 弹文本输入框（IK8W5U 异常上报/转单）：确认返回输入值（可为空串），取消返回 null */
function promptText(title: string, placeholder: string): Promise<string | null> {
  return new Promise((resolve) => {
    uni.showModal({
      title,
      editable: true,
      placeholderText: placeholder,
      success: (m) => resolve(m.confirm ? (m.content ?? "").trim() : null),
      fail: () => resolve(null),
    });
  });
}
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
    task.value = await api.action(session.role, task.value.id, action, payload);
    uni.showToast({ title: "操作成功", icon: "success" });
  } catch {
    // IK8W5V：失败提示由 request 层统一 toast，此处兜底防未处理异常
  } finally {
    acting.value = false;
    uni.hideLoading();
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
        ><text class="income">¥{{ task.commission }}</text></view
      ></view
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
      ><view v-if="!task.availableActions.length" class="muted"
        >当前节点暂无可执行操作</view
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
  font-size: 20rpx;
  color: $muted;
  margin-top: 3rpx;
}
.step__time {
  font-size: 19rpx;
  color: $muted;
  margin-top: 3rpx;
}
.actions {
  display: grid;
  gap: 16rpx;
  margin-top: 26rpx;
}
.secondary,
.danger {
  min-height: 88rpx;
  border-radius: 44rpx;
  background: #fff;
  font-weight: 800;
}
.secondary {
  color: $primary-dark;
  border: 2rpx solid $primary;
}
.danger {
  color: #a74432;
  border: 2rpx solid #efc9c1;
}
</style>
