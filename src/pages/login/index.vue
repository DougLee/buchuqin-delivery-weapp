<script setup lang="ts">
import { ref } from "vue";
import { useSessionStore } from "../../stores/session";
const session = useSessionStore(),
  loading = ref(false),
  binding = ref(false),
  needBind = ref(false),
  staffNo = ref(""),
  name = ref("");
/** 微信一键登录（IK8W5Q 正式通道）：未绑定 → 展开工号绑定表单 */
async function login() {
  if (loading.value) return;
  loading.value = true;
  try {
    await session.loginByWechat();
    uni.reLaunch({ url: "/pages/index/index" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("未绑定")) needBind.value = true;
    // 其余错误（网络/服务）已由 request 层 toast，留在本页重试
  } finally {
    loading.value = false;
  }
}
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
      <text class="login__sub">使用微信登录你的员工账号</text>
    </view>
    <view class="card login__card">
      <button class="primary-btn" :disabled="loading" @tap="login">
        {{ loading ? "登录中…" : "微信一键登录" }}
      </button>
      <template v-if="needBind">
        <view class="login__divider"><text>首次使用？绑定员工账号</text></view>
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
        <button class="ghost-btn" :disabled="binding" @tap="bind">
          {{ binding ? "绑定中…" : "绑定并登录" }}
        </button>
      </template>
    </view>
    <text class="login__tip">绑定遇到问题请联系站点管理员</text>
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
.login__divider {
  margin: 32rpx 0 6rpx;
  text-align: center;
  color: $muted;
  font-size: 24rpx;
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
.ghost-btn {
  margin-top: 28rpx;
  min-height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 44rpx;
  background: #fff;
  border: 2rpx solid $line;
  color: $primary-dark;
  font-size: 30rpx;
  font-weight: 800;
}
.login__tip {
  display: block;
  text-align: center;
  margin-top: 26rpx;
  color: $muted;
  font-size: 22rpx;
}
</style>
