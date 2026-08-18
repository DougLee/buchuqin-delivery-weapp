import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../api";
import type { StaffRole } from "../types";
/** 微信登录失败但可通过工号绑定自救（后端 404：openid 未绑定 Staff） */
export class StaffBindRequiredError extends Error {
  constructor(message = "该微信未绑定员工账号，请用工号绑定") {
    super(message);
  }
}
export const isBindRequired = (e: unknown): boolean => {
  const message = e instanceof Error ? e.message : String(e);
  return e instanceof StaffBindRequiredError || message.includes("未绑定");
};
/** wx.login 取 code（仅小程序环境；H5 无此通道走演示登录） */
function wxLoginCode(): Promise<string> {
  return new Promise((resolve, reject) =>
    uni.login({
      provider: "weixin",
      success(res) {
        if (res.code) resolve(res.code);
        else reject(new Error("uni.login 未返回 code"));
      },
      fail: reject,
    }),
  );
}
export const useSessionStore = defineStore("staff-session", () => {
  const role = ref<StaffRole>(
    (uni.getStorageSync("staffRole") as StaffRole) || "building-manager",
  );
  // IK8W5V 角色守卫：H5 演示模式（角色选择 + test-login）。
  // 小程序端正式微信登录已落地（2026-08-18），角色由登录 token 决定，恒关。
  // #ifdef MP-WEIXIN
  const demoMode = ref(false);
  // #endif
  // #ifndef MP-WEIXIN
  const demoMode = ref<boolean>(uni.getStorageSync("demoMode") !== false);
  // #endif
  function setDemoMode(v: boolean) {
    // #ifndef MP-WEIXIN
    demoMode.value = v;
    uni.setStorageSync("demoMode", v);
    // #endif
  }
  function applyLogin(r: { token: string; user: { role: StaffRole } }) {
    uni.setStorageSync("staffToken", r.token);
    uni.setStorageSync("staffTokenRole", r.user.role);
    role.value = r.user.role;
    uni.setStorageSync("staffRole", r.user.role);
  }
  /** 小程序正式通道：微信直登；openid 未绑定时抛 StaffBindRequiredError 由登录页承接 */
  async function loginByWechat() {
    const code = await wxLoginCode();
    try {
      applyLogin(await api.wechatStaffLogin(code));
    } catch (e) {
      if (isBindRequired(e)) throw new StaffBindRequiredError();
      throw e;
    }
  }
  /** 首次绑定：工号+姓名换绑 openid，绑定即登录 */
  async function bindByWechat(staffNo: string, name: string) {
    const code = await wxLoginCode();
    applyLogin(await api.staffBind(code, staffNo, name));
  }
  /** H5 演示通道（test-login） */
  async function loginDemo(v: StaffRole) {
    const r = await api.login(v);
    uni.setStorageSync("staffToken", r.token);
    uni.setStorageSync("staffTokenRole", v);
    role.value = v;
  }
  async function ensure() {
    // #ifdef MP-WEIXIN
    const token = uni.getStorageSync("staffToken");
    if (token) {
      role.value = (uni.getStorageSync("staffTokenRole") as StaffRole) || role.value;
      return;
    }
    try {
      await loginByWechat();
    } catch (e) {
      // 未绑定 → 登录页承接（绑定表单）；其他失败也进登录页统一重试
      uni.reLaunch({ url: "/pages/login/index" });
      throw e;
    }
    // #endif
    // #ifndef MP-WEIXIN
    if (
      !uni.getStorageSync("staffToken") ||
      uni.getStorageSync("staffTokenRole") !== role.value
    )
      await loginDemo(role.value);
    // #endif
  }
  async function setRole(v: StaffRole) {
    // IK8W5V：正式通道角色由 token 决定；仅 H5 演示模式可切
    // #ifndef MP-WEIXIN
    if (!demoMode.value) return;
    role.value = v;
    uni.setStorageSync("staffRole", v);
    await loginDemo(v);
    // #endif
  }
  return {
    role,
    demoMode,
    setDemoMode,
    loginByWechat,
    bindByWechat,
    ensure,
    setRole,
  };
});
