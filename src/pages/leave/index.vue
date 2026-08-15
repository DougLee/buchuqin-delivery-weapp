<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { useSessionStore } from "../../stores/session";
const items = ref<any[]>([]);
const session = useSessionStore();
async function load() {
  await session.ensure();
  items.value = await api.leave();
}
onShow(load);
async function apply() {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);
  await api.createLeave({
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    reason: "个人事务",
  });
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
    ><view v-for="item in items" :key="item.id" class="leave card"
      ><view class="head"
        ><text>{{ item.building || "西区 5 栋请假" }}</text
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
    ><button class="primary-btn apply" @tap="apply">申请请假</button></view
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
