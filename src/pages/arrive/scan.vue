<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { api } from "../../api";
import { isBindRequired } from "../../stores/session";
import { useSessionStore } from "../../stores/session";

/**
 * IKSN21（道哥 2026-11-04）：小票二维码 URL Link 落地页——微信扫一扫
 * 直达（api generate_urllink 生成，path=pages/arrive/scan&query=no=orderNo，
 * envVersion 随环境）。骑手扫袋上商家联的码 → 本页 → 确认到店
 * （复用 #111 scanArrive：本人接单 + waiting-first-mile → arrived）。
 * 访客（非骑手/未绑定）只读提示不执行操作；「确认到店」保留用户手势
 * （防误扫误触），成功/失败结果就地展示，无任务页依赖。
 */
const session = useSessionStore();
const orderNo = ref("");
/** loading 拉登录态 | ready 可确认 | guest 访客态 | done 已到店 | error 失败 */
const state = ref<"loading" | "ready" | "guest" | "done" | "error">("loading");
const message = ref("");
const statusText = ref("");
const busy = ref(false);

onLoad(async (q) => {
  orderNo.value = String(q?.no ?? "").trim();
  if (!orderNo.value) {
    state.value = "error";
    message.value = "二维码缺少订单信息";
    return;
  }
  try {
    await session.ensure();
    state.value = "ready";
  } catch (e) {
    if (isBindRequired(e)) {
      state.value = "guest";
    } else {
      state.value = "error";
      message.value = e instanceof Error && e.message ? e.message : "登录失败，请重试";
    }
  }
});

async function confirm() {
  if (busy.value || state.value !== "ready") return;
  busy.value = true;
  try {
    const r = await api.scanArrive(orderNo.value);
    state.value = "done";
    statusText.value = r.statusText;
    message.value = `订单 ${r.orderNo} 已确认到店，请「到店取货」后配送`;
  } catch (e) {
    state.value = "error";
    message.value = e instanceof Error && e.message ? e.message : "操作失败，请重试";
  } finally {
    busy.value = false;
  }
}

function goLogin() {
  uni.reLaunch({ url: "/pages/login/index" });
}
</script>
<template>
  <view class="page arrive">
    <view class="card arrive__card">
      <text class="arrive__title">扫码到店</text>
      <text class="arrive__order">订单 {{ orderNo || "—" }}</text>
      <template v-if="state === 'loading'">
        <text class="muted">正在核验登录状态…</text>
      </template>
      <template v-else-if="state === 'guest'">
        <text class="muted">本功能仅限已绑定的骑手/楼长使用</text>
        <button class="primary-btn" @tap="goLogin">员工登录</button>
      </template>
      <template v-else-if="state === 'ready'">
        <text class="muted">确认后订单进入「已到店」，请到店取货后配送</text>
        <button class="primary-btn" :disabled="busy" @tap="confirm">
          {{ busy ? "确认中…" : "确认到店" }}
        </button>
      </template>
      <template v-else-if="state === 'done'">
        <text class="arrive__ok">已确认到店（{{ statusText }}）</text>
        <text class="muted">{{ message }}</text>
      </template>
      <template v-else>
        <text class="muted">{{ message }}</text>
        <button
          v-if="orderNo"
          class="primary-btn"
          :disabled="busy"
          @tap="confirm"
        >
          重试
        </button>
      </template>
    </view>
  </view>
</template>
<style scoped lang="scss">
.arrive {
  padding: 24rpx;
}
.arrive__card {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 48rpx 40rpx;
}
.arrive__title {
  font-size: 40rpx;
  font-weight: 900;
}
.arrive__order {
  font-size: 28rpx;
  font-weight: 700;
  word-break: break-all;
}
.arrive__ok {
  font-size: 32rpx;
  font-weight: 800;
}
.primary-btn {
  margin-top: 8rpx;
}
</style>
