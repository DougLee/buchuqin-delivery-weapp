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
/** wx.login 取 code（仅小程序环境） */
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
/**
 * 员工会话（IK8W5Q 正式通道）：微信直登，openid 未绑定 Staff 时由登录页
 * 承接工号绑定表单。H5 演示通道（test-login）已随 IK9JHP 后端端点删除
 * 而清除，本端只保留微信小程序一个端。
 */
export const useSessionStore = defineStore("staff-session", () => {
  const role = ref<StaffRole>(
    (uni.getStorageSync("staffRole") as StaffRole) || "building-manager",
  );
  function applyLogin(r: { token: string; user: { role: StaffRole } }) {
    uni.setStorageSync("staffToken", r.token);
    uni.setStorageSync("staffTokenRole", r.user.role);
    role.value = r.user.role;
    uni.setStorageSync("staffRole", r.user.role);
  }
  /** 微信正式通道：微信直登；openid 未绑定时抛 StaffBindRequiredError 由登录页承接 */
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
  /**
   * 确保已登录（IKC4IN 微信审核整改）：去掉「未登录强制 reLaunch 登录页」
   * 副作用——打开小程序必须先可浏览（游客可看功能引导），登录改为用户
   * 自主点击「员工登录」后进登录页。未登录/未绑定时静默尝试直登一次，
   * 失败仅抛错，由各页面展示各自的访客态。
   */
  async function ensure() {
    const token = uni.getStorageSync("staffToken");
    if (token) {
      role.value = (uni.getStorageSync("staffTokenRole") as StaffRole) || role.value;
      return;
    }
    try {
      await loginByWechat();
    } catch (e) {
      // 未绑定（游客）或其他失败：不再跳登录页，交页面 guest 态承接
      throw e;
    }
  }
  return {
    role,
    loginByWechat,
    bindByWechat,
    ensure,
  };
});
