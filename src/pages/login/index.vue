<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { useSessionStore, clearGuestFlag } from "../../stores/session";
const session = useSessionStore(),
  /** 自动直登检测中（IKC4IN 优化）：进入登录页即静默尝试，已绑定秒进工作台 */
  checking = ref(false),
  binding = ref(false),
  staffNo = ref(""),
  name = ref("");
/**
 * 进入登录页 = 用户已主动表达登录意图（IKC4IN 优化）：清游客标记后自动
 * 尝试静默直登——已绑定员工秒进工作台；未绑定（新员工/审核新用户）留在
 * 本页完成工号绑定，「微信一键登录」按钮随之取消（多一步无意义操作）。
 */
async function trySilentLogin() {
  if (checking.value) return;
  checking.value = true;
  try {
    await session.loginByWechat();
    uni.reLaunch({ url: "/pages/index/index" });
  } catch {
    // 未绑定/网络失败：留在本页绑定（网络原因已由 request 层 toast）
  } finally {
    checking.value = false;
  }
}
onShow(() => {
  clearGuestFlag();
  trySilentLogin();
});
/** 首次绑定：工号+姓名换绑 openid，成功即登录进工作台 */
async function bind() {
  if (binding.value) return;
  if (!staffNo.value.trim() || !name.value.trim()) {
    uni.showToast({ title: "请填写工号和姓名", icon: "none" });
    return;
  }
  binding.value = true;
  try {
    await session.bindByWechat(staffNo.value.trim(), name.value.trim());
    uni.showToast({ title: "绑定成功", icon: "success" });
    uni.reLaunch({ url: "/pages/index/index" });
  } catch {
    // 失败提示由 request 层统一 toast（工号不存在/姓名不匹配），保留输入可改后重试
  } finally {
    binding.value = false;
  }
}
</script>
<template>
  <view class="page login">
    <view class="login__hero">
      <text class="login__eyebrow">不出寝食社 · 履约端</text>
      <text class="login__title">员工登录</text>
      <text class="login__sub"
        >绑定工号与姓名，微信自动记住登录，下次打开免输入</text
      >
    </view>
    <view class="card login__card">
      <!-- 自动直登检测（IKC4IN 优化）：有反馈不空白（UX：loading-states） -->
      <view v-if="checking" class="login__checking"
        ><view class="login__checking-dot"></view
        ><text>正在检测登录状态…</text></view
      >
      <template v-else>
        <text class="login__form-title">绑定员工账号</text>
        <text class="login__form-sub"
          >输入入职登记的工号与姓名，绑定后即可接单上岗</text
        >
        <view class="login__field">
          <text class="login__label">工号</text>
          <input
            v-model="staffNo"
            placeholder="例如：BM-HBUT-005"
            placeholder-class="login__placeholder"
          />
        </view>
        <view class="login__field">
          <text class="login__label">姓名</text>
          <input
            v-model="name"
            placeholder="与员工档案一致"
            placeholder-class="login__placeholder"
          />
        </view>
        <button class="primary-btn" :disabled="binding" @tap="bind">
          {{ binding ? "绑定中…" : "绑定并登录" }}
        </button>
      </template>
    </view>
    <text class="login__tip">绑定遇到问题？请联系站点管理员</text>
  </view>
</template>
<style scoped lang="scss">
@import "../../styles/theme.scss";
.login {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100vh;
}
.login__hero {
  padding: 0 12rpx 36rpx;
}
.login__eyebrow,
.login__title,
.login__sub {
  display: block;
}
.login__eyebrow {
  font-size: 22rpx;
  letter-spacing: 2rpx;
  color: $primary;
  font-weight: 900;
}
.login__title {
  font-size: 56rpx;
  font-weight: 900;
  margin: 10rpx 0 8rpx;
}
.login__sub {
  color: $muted;
}
.login__card {
  padding: 36rpx 32rpx;
}
/* 自动直登检测态：轻提示行 + 呼吸圆点，不阻塞页面（IKC4IN 优化） */
.login__checking {
  display: flex;
  align-items: center;
  gap: 14rpx;
  color: $muted;
  font-size: 25rpx;
  padding: 14rpx 0 6rpx;
}
.login__checking-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: $primary;
  animation: login-pulse 1.2s infinite;
}
@keyframes login-pulse {
  50% {
    opacity: 0.35;
  }
}
.login__form-title {
  display: block;
  font-size: 30rpx;
  font-weight: 900;
}
.login__form-sub {
  display: block;
  font-size: 22rpx;
  color: $muted;
  margin: 6rpx 0 8rpx;
}
.login__field {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 20rpx 0;
  border-bottom: 2rpx solid $line;
}
.login__label {
  width: 100rpx;
  font-weight: 800;
}
.login__field input {
  flex: 1;
  height: 68rpx;
  font-size: 30rpx;
  font-weight: 700;
}
.login__placeholder {
  color: #8a938d;
  font-weight: 400;
}
.primary-btn {
  margin-top: 28rpx;
}
.login__tip {
  display: block;
  text-align: center;
  margin-top: 26rpx;
  color: $muted;
  font-size: 22rpx;
}
</style>
