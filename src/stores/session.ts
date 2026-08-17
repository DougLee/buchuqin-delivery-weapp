import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../api";
import type { StaffRole } from "../types";
export const useSessionStore = defineStore("staff-session", () => {
  const role = ref<StaffRole>(
    (uni.getStorageSync("staffRole") as StaffRole) || "building-manager",
  );
  // IK8W5V 角色守卫（过渡方案）：演示模式默认开启，关闭后隐藏工作台三角色
  // 切换卡、角色锁定当前值——向"角色由正式登录 token 决定"过渡，正式登录落地后整块删除。
  const demoMode = ref<boolean>(uni.getStorageSync("demoMode") !== false);
  function setDemoMode(v: boolean) {
    demoMode.value = v;
    uni.setStorageSync("demoMode", v);
  }
  async function login(v: StaffRole) {
    const r = await api.login(v);
    uni.setStorageSync("staffToken", r.token);
    uni.setStorageSync("staffTokenRole", v);
  }
  async function ensure() {
    if (
      !uni.getStorageSync("staffToken") ||
      uni.getStorageSync("staffTokenRole") !== role.value
    )
      await login(role.value);
  }
  async function setRole(v: StaffRole) {
    // IK8W5V：非演示模式下角色由登录 token 决定，禁止本地切换
    if (!demoMode.value) return;
    role.value = v;
    uni.setStorageSync("staffRole", v);
    await login(v);
  }
  return { role, demoMode, setDemoMode, ensure, setRole };
});
