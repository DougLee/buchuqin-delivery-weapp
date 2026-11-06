<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import type { Task } from '../types';
const tasks = ref<Task[]>([]);
const page = ref(0);
const total = ref(0);
const loading = ref(false);
const failed = ref(false);
async function load(reset = false) {
  if (loading.value) return;
  loading.value = true; failed.value = false;
  try {
    const next = reset ? 1 : page.value + 1;
    const result = await api.tasksPage('unfinished', next, 20);
    tasks.value = reset ? result.items : [...tasks.value, ...result.items];
    page.value = next; total.value = result.total;
  } catch { failed.value = true; }
  finally { loading.value = false; }
}
onMounted(() => load(true));
const open = (id: string) => uni.navigateTo({ url: `/pages/task/detail?id=${encodeURIComponent(id)}` });
</script>
<template>
  <view class="recovery-page">
    <text class="recovery-title">白天未完成订单</text>
    <text class="recovery-sub">继续处理已分配任务，完成后返回当前业务。</text>
    <view v-for="task in tasks" :key="task.id" class="recovery-card" role="button" @tap="open(task.id)">
      <text class="recovery-status">{{ task.statusText }}</text>
      <text class="recovery-room">{{ task.building }} · {{ task.room }}</text>
      <text class="recovery-sub">{{ task.orderNo }}</text>
      <button @tap.stop="open(task.id)">继续处理</button>
    </view>
    <text v-if="!loading && !failed && !tasks.length" class="recovery-empty">白天订单已全部处理完毕</text>
    <button v-if="failed || tasks.length < total" :disabled="loading" @tap="load(page === 0)">{{ loading ? '加载中…' : failed ? '重新加载' : '加载更多' }}</button>
    <text v-else-if="loading" class="recovery-empty">正在同步未完订单…</text>
  </view>
</template>
<style scoped>
.recovery-page { padding:36rpx 28rpx 180rpx; }
.recovery-title { display:block; font-size:36rpx; font-weight:700; color:#143b2e; }
.recovery-sub { display:block; font-size:26rpx; color:#52665b; line-height:1.7; }
.recovery-card { margin-top:24rpx; padding:28rpx; border:1px solid #dbe5dd; background:white; border-radius:28rpx; }
.recovery-room { display:block; font-size:32rpx; color:#163d30; font-weight:600; margin:12rpx 0; }
.recovery-status { display:inline-block; background:#eaf2eb; color:#164a36; border-radius:12rpx; padding:6rpx 14rpx; font-size:24rpx; }
button { margin:24rpx 0 0; min-height:88rpx; display:flex; align-items:center; justify-content:center; background:#104a36; color:white; font-size:28rpx; border-radius:20rpx; }
.recovery-empty { display:block; padding:60rpx 0; text-align:center; color:#52665b; font-size:28rpx; }
</style>
