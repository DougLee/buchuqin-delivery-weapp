<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { onShow, onHide } from '@dcloudio/uni-app';
import { api } from '../api';
import { ApiError } from '../api/request';
import { useSessionStore } from '../stores/session';
import NightHome from '../pages/night/index.vue';
import NightOrders from '../pages/night/orders.vue';
import NightIncome from '../pages/night/income.vue';
import DayOrderRecovery from './DayOrderRecovery.vue';

defineProps<{ section: 'home' | 'orders' | 'income' }>();
const context = ref<Awaited<ReturnType<typeof api.businessContext>>>();
const failed = ref(false);
const recovery = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;
let busy = false;
async function refresh() {
  if (busy) return;
  busy = true;
  try {
    await useSessionStore().ensure();
    const next = await api.businessContext();
    if (next.mode !== context.value?.mode) recovery.value = false;
    context.value = next;
    failed.value = false;
  } catch (e) {
    if (!uni.getStorageSync('staffToken') || (e instanceof ApiError && e.status === 404)) {
      context.value = { mode: 'day', hasNightStore: false, campusName: '', nightStartAt: null, nightEndAt: null, reason: '' };
    } else failed.value = true;
  } finally { busy = false; }
}
function start() {
  void refresh();
  if (!timer) timer = setInterval(() => void refresh(), 30000);
}
function stop() { if (timer) clearInterval(timer); timer = undefined; }
onMounted(start);
onShow(start);
onHide(stop);
onUnmounted(stop);
const nightOrders = () => uni.navigateTo({ url: '/pages/night/orders' });
/** 夜宵工作台（IKSZF5）：rest 态也可做备货、押金、商品管理等经营准备
 *  （能否营业由开店时服务端判定）。night 模式下各 tab 已显示工作台，
 *  该入口仅在 rest 态的休息卡里使用 */
const goNightWorkspace = () => uni.navigateTo({ url: '/pages/night/index' });
</script>

<template>
  <view class="business-workspace">
    <view v-if="failed" class="mode-state">
      <text class="mode-title">营业信息暂不可用</text>
      <text class="mode-desc">请刷新后继续操作</text>
      <button class="mode-button" @tap="refresh">重新加载</button>
    </view>
    <view v-else-if="!context" class="mode-state"><text class="mode-desc">正在同步营业状态…</text></view>
    <template v-else>
      <view v-if="context.mode !== 'day'" class="mode-notice">
        <view><text class="mode-notice__title">{{ recovery ? '白天订单收尾' : context.mode === 'night' ? '夜宵经营时段' : '当前休息中' }}</text><text class="mode-desc">已支付订单仍需继续履约</text></view>
        <button class="mode-link" @tap="recovery = !recovery">{{ recovery ? '返回当前业务' : '查看白天订单' }}</button>
      </view>
      <view v-else-if="context.hasNightStore" class="mode-notice">
        <text class="mode-desc">当前为白天配送时段</text>
        <button class="mode-link" @tap="nightOrders">夜宵订单收尾</button>
      </view>
      <DayOrderRecovery v-if="recovery" />
      <slot v-else-if="context.mode === 'day'" />
      <template v-else-if="context.mode === 'night'">
        <NightHome v-if="section === 'home'" />
        <NightOrders v-else-if="section === 'orders'" />
        <NightIncome v-else />
      </template>
      <view v-else class="mode-state">
        <view class="mode-moon" />
        <text class="mode-kicker">TAKE A BREAK</text>
        <text class="mode-title">休息一下，等待下一场</text>
        <text class="mode-desc">{{ context.reason }}</text>
        <text v-if="context.hasNightStore && context.nightStartAt" class="mode-desc">夜宵营业时间 {{ context.nightStartAt }} — {{ context.nightEndAt }}</text>
        <button v-if="context.hasNightStore" class="mode-button" @tap="nightOrders">处理夜宵未完订单</button>
        <!-- 窗口外的经营准备（备货/押金/商品上下架）不受互斥限制，给入口 -->
        <button v-if="context.hasNightStore" class="mode-button mode-button--sub" @tap="goNightWorkspace">夜宵工作台（备货·押金）</button>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.business-workspace { min-height: 100vh; background: #f3f6f2; }
.mode-notice { display:flex; align-items:center; justify-content:space-between; gap:20rpx; padding:24rpx 28rpx; background:#e8efe9; border-bottom:1px solid #d8e3d9; }
.mode-notice__title { display:block; font-size:28rpx; font-weight:700; color:#163d30; }
.mode-desc { display:block; color:#52665b; font-size:26rpx; line-height:1.7; }
.mode-state { padding:120rpx 40rpx; display:flex; align-items:center; flex-direction:column; gap:20rpx; text-align:center; }
.mode-kicker { color:#5b7867; font-size:22rpx; letter-spacing:4rpx; }
.mode-title { font-size:38rpx; font-weight:700; color:#12392c; }
.mode-button, .mode-link { margin:0; min-height:88rpx; display:flex; align-items:center; justify-content:center; padding:0 28rpx; font-size:26rpx; border-radius:22rpx; font-weight:600; }
.mode-button { margin-top:20rpx; background:#104a36; color:#fff; }
.mode-button--sub { margin-top:0; background:transparent; color:#164a36; border:2rpx solid #c6d5c9; }
.mode-link { flex-shrink:0; background:white; color:#164a36; }
/* 月牙（IKSZF5 夜宵锚点）：金黄亮面 + 深绿暗面 */
.mode-moon { width:90rpx; height:90rpx; border-radius:50%; background:#ffd75e; box-shadow:inset 24rpx -12rpx #10381f; margin-bottom:18rpx; }
button:active { opacity:.8; }
button:focus-visible { outline:3px solid #438f65; outline-offset:3px; }
</style>
