<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { api } from "../../api";
import { uploadImage } from "../../api/upload";
import { useSessionStore } from "../../stores/session";
import type { Task } from "../../types";
const session = useSessionStore(),
  task = ref<Task>();
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
  transfer: "申请转单",
};
onLoad(async (q) => {
  await session.ensure();
  task.value = await api.task(session.role, String(q?.id));
});
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
  if (!task.value) return;
  let payload: Record<string, unknown> = {};
  try {
    if (action === "pickup")
      payload = { packageCode: await scanOrInput("输入包裹编号") };
    if (action === "handover")
      payload = { handoverCode: await scanOrInput("输入交接码") };
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
  } finally {
    uni.hideLoading();
  }
}
</script>
<template>
  <view v-if="task" class="page"
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
