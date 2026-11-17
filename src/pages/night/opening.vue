<script setup lang="ts">
import { ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { api } from '../../api';
import { ensureNightCampus } from '../../utils/nightMode';
import { useSessionStore } from '../../stores/session';
import type { NightOpeningRequest } from '../../types';

const session = useSessionStore(), rows = ref<NightOpeningRequest[]>([]), busy = ref(false), error = ref(false);
const cn = (value: Date) => new Date(value.getTime() + 8 * 3600000).toISOString();
const from = cn(new Date()), until = cn(new Date(Date.now() + 3600000));
const startDate = ref(from.slice(0, 10)), startTime = ref(from.slice(11, 16)), endDate = ref(until.slice(0, 10)), endTime = ref(until.slice(11, 16)), reason = ref('');
let requestId = `opening-${Date.now()}-${Math.random().toString(36).slice(2)}`;
watch([startDate, startTime, endDate, endTime, reason], () => { requestId = `opening-${Date.now()}-${Math.random().toString(36).slice(2)}`; });
async function load() {
  try { await session.ensure(); if (!await ensureNightCampus()) return; rows.value = await api.nightOpeningRequests(); error.value = false; }
  catch { error.value = true; }
}
async function submit() {
  if (busy.value) return;
  const startAt = new Date(`${startDate.value}T${startTime.value}:00+08:00`), endAt = new Date(`${endDate.value}T${endTime.value}:00+08:00`);
  if (!reason.value.trim() || !Number.isFinite(+startAt) || !Number.isFinite(+endAt) || endAt <= startAt || +endAt <= Date.now() || +endAt - +startAt > 86400000) { uni.showToast({ title: '请填写原因和有效时段，单次不超过24小时', icon: 'none' }); return; }
  busy.value = true;
  try {
    await api.nightRequestOpening({ requestId, startAt: startAt.toISOString(), endAt: endAt.toISOString(), reason: reason.value.trim() });
    uni.showToast({ title: '已提交校区审核', icon: 'success' }); await load();
  } catch { /* 请求层显示错误，保留原申请内容和幂等键供重试。 */ }
  finally { busy.value = false; }
}
const time = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false });
onShow(load);
</script>
<template>
  <view class="page opening-page">
    <view class="opening-intro"><text class="eyebrow">EXTRA HOURS</text><text class="title">临时营业申请</text><text class="muted">正常夜宵时段可直接开店；其他时段需校区批准。许可仅在申请时段有效，结束后停止新单。</text></view>
    <view class="card form">
      <text class="label">开始时间</text><view class="time-row"><picker mode="date" :value="startDate" @change="startDate = $event.detail.value"><view>{{ startDate }}</view></picker><picker mode="time" :value="startTime" @change="startTime = $event.detail.value"><view>{{ startTime }}</view></picker></view>
      <text class="label">结束时间</text><view class="time-row"><picker mode="date" :value="endDate" @change="endDate = $event.detail.value"><view>{{ endDate }}</view></picker><picker mode="time" :value="endTime" @change="endTime = $event.detail.value"><view>{{ endTime }}</view></picker></view>
      <text class="label">申请原因</text><textarea v-model="reason" maxlength="500" placeholder="说明本次临时营业安排" /><button class="primary-btn" :disabled="busy || rows.some(r => r.status === 'pending' && +new Date(r.endAt) > Date.now())" @tap="submit">{{ busy ? '提交中…' : '提交校区审核' }}</button>
    </view>
    <view v-if="error" class="card history" @tap="load">记录加载失败，点击重试</view>
    <view v-for="row in rows" :key="row.id" class="card history"><view class="history-head"><text>{{ row.status === 'pending' ? '待校区审核' : row.status === 'approved' ? (+new Date(row.endAt) <= Date.now() ? '许可已到期' : '已批准') : '已驳回' }}</text><text>{{ time(row.createdAt) }}</text></view><text>{{ time(row.startAt) }} 至 {{ time(row.endAt) }}</text><text class="muted">{{ row.reason }}</text><text v-if="row.reviewReason">审核说明：{{ row.reviewReason }}</text></view>
  </view>
</template>
<style scoped lang="scss">
@import '../../styles/night.scss';
.opening-page { background: #091913; color: #edf6e8; }
.opening-intro { display: flex; flex-direction: column; gap: 16rpx; padding: 20rpx 6rpx 30rpx; }.eyebrow { color: #b9cba6; letter-spacing: 4rpx; font-size: 22rpx; }.title { font-size: 42rpx; font-weight: 800; }.opening-page .card { background: #19372b; color: #edf6e8; border-color: #476149; }.opening-page .muted { color: #b9c9bb; }.form,.history { padding: 28rpx; margin-bottom: 24rpx; }.label { display: block; margin: 12rpx 0 18rpx; font-weight: 700; }.time-row { display: flex; gap: 20rpx; margin-bottom: 26rpx; }.time-row picker { flex: 1; background: #284737; border: 1px solid #49654d; padding: 20rpx; border-radius: 18rpx; }textarea { width: 100%; height: 160rpx; padding: 20rpx; margin-bottom: 26rpx; background: #284737; border-radius: 18rpx; }.history { display: flex; flex-direction: column; gap: 14rpx; font-size: 25rpx; }.history-head { display: flex; justify-content: space-between; gap: 20rpx; color: #ffe1a2; }.history-head text:last-child { font-size: 21rpx; }.primary-btn { background: #ffe1a2; color: #19372b; }
</style>
