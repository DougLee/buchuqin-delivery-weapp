import { api } from "../api";
import { useSessionStore } from "../stores/session";
import type { StaffRole } from "../types";

export type Workspace = "day" | "night";
export type NightSection = "home" | "orders" | "income" | "profile";
export interface BizContext {
  staffId?: string;
  staffRole?: StaffRole;
  canSwitchWorkspace?: boolean;
  nightEnabled: boolean;
  hasNightHistory?: boolean;
  mode: "day" | "night" | "rest";
  hasNightStore: boolean;
  campusName: string;
  nightStartAt: string | null;
  nightEndAt: string | null;
  reason: string;
}
const NIGHT_PAGE_OF: Record<string, string> = {
  home: "/pages/night/home",
  orders: "/pages/night/orders-tab",
  income: "/pages/night/income-tab",
};
const DAY_SECTIONS: Record<string, string> = {
  "pages/index/index": "home",
  "pages/tasks/index": "orders",
  "pages/income/index": "income",
};
const SELECTION_PREFIX = "staffWorkspace:";
let lastContext: { token: string; context: BizContext } | undefined;
let lastSwitchAt = 0;
let switching = false;
export function fallbackContext(): BizContext {
  return {
    mode: "day",
    hasNightStore: false,
    nightEnabled: false,
    campusName: "",
    nightStartAt: null,
    nightEndAt: null,
    reason: "",
  };
}
/** 实际角色与绑定资格由服务端核验，不使用前端默认角色推断权限。 */
export function canSwitchWorkspace(ctx?: BizContext): boolean {
  return Boolean(
    uni.getStorageSync("staffToken") &&
    ctx?.staffId &&
    ctx.nightEnabled === true &&
    ctx.staffRole === "building-manager" &&
    ctx.hasNightStore &&
    ctx.canSwitchWorkspace === true,
  );
}
function acceptContext(ctx: BizContext, token: string) {
  if (!token || token !== uni.getStorageSync("staffToken")) return false;
  lastContext = { token, context: ctx };
  if (ctx.staffId && !canSwitchWorkspace(ctx))
    uni.removeStorageSync(SELECTION_PREFIX + ctx.staffId);
  uni.$emit("business:context", ctx);
  return true;
}
/** 网络失败仅复用同一登录会话的数据；成功核验无资格立即清理旧选择。 */
export async function fetchBizContext(): Promise<BizContext> {
  const token = uni.getStorageSync("staffToken") as string;
  if (!token) {
    lastContext = undefined;
    return fallbackContext();
  }
  try {
    const ctx = await api.businessContext();
    return acceptContext(ctx, token) ? ctx : fallbackContext();
  } catch {
    return token === uni.getStorageSync("staffToken") &&
      lastContext?.token === token
      ? lastContext.context
      : fallbackContext();
  }
}
/** 手动选择优先，无选择时沿用服务端营业时段默认工作台。 */
export function workspaceOf(ctx: BizContext): Workspace {
  if (canSwitchWorkspace(ctx)) {
    const selected = uni.getStorageSync(SELECTION_PREFIX + ctx.staffId);
    if (selected === "day" || selected === "night") return selected;
  }
  return canSwitchWorkspace(ctx) && ctx.mode === "night" ? "night" : "day";
}

/** 历史读取与收尾不授予新增经营资格。 */
export function canViewNightHistory(ctx?: BizContext): boolean {
  return Boolean(uni.getStorageSync('staffToken') && ctx?.staffId && ctx.staffRole === 'building-manager' && ctx.hasNightStore && (ctx.nightEnabled || ctx.hasNightHistory === true));
}
async function loadNightAccess(history: boolean): Promise<BizContext | undefined> {
  const token = uni.getStorageSync('staffToken') as string;
  if (!token) return;
  try {
    const ctx = await api.businessContext();
    if (!acceptContext(ctx, token)) return;
    if (canSwitchWorkspace(ctx) || (history && canViewNightHistory(ctx))) return ctx;
    uni.showToast({ title: ctx.nightEnabled ? '暂无夜宵经营资格' : '本校区未开通夜宵服务', icon: 'none' });
    uni.reLaunch({ url: '/pages/index/index' });
  } catch { uni.showToast({ title: '夜宵经营资格校验失败，请重试', icon: 'none' }); }
}
export async function ensureNightCampus(): Promise<boolean> { return !!await loadNightAccess(false); }
export async function nightHistoryContext(): Promise<BizContext | undefined> { return loadNightAccess(true); }
export function clearWorkspaceSelection() {
  const token = uni.getStorageSync("staffToken");
  if (lastContext && lastContext.token === token && lastContext.context.staffId)
    uni.removeStorageSync(SELECTION_PREFIX + lastContext.context.staffId);
  lastContext = undefined;
  lastSwitchAt = 0;
}
function switchGuarded(url: string) {
  if (switching || Date.now() - lastSwitchAt < 3000) return;
  lastSwitchAt = Date.now();
  uni.reLaunch({
    url,
    fail: () => {
      lastSwitchAt = 0;
    },
  });
}
/** 只切换页面；重新核验权限，跳转失败恢复选择，不调用营业操作接口。 */
export async function switchWorkspace(target: Workspace): Promise<boolean> {
  if (switching) return false;
  const token = uni.getStorageSync("staffToken") as string;
  if (!token) return false;
  switching = true;
  try {
    const ctx = await api.businessContext();
    if (!acceptContext(ctx, token)) return false;
    if (!canSwitchWorkspace(ctx)) {
      uni.showToast({ title: ctx.nightEnabled ? "仅已绑定夜宵店的正式楼长可切换" : "本校区未开通夜宵服务", icon: "none" });
      return false;
    }
    const key = SELECTION_PREFIX + ctx.staffId,
      previous = uni.getStorageSync(key);
    uni.setStorageSync(key, target);
    lastSwitchAt = Date.now();
    try {
      await new Promise<void>((resolve, reject) => {
        const options = {
          url: target === "night" ? NIGHT_PAGE_OF.home : "/pages/index/index",
          success: () => resolve(),
          fail: reject,
        };
        if (target === "night") uni.reLaunch(options);
        else uni.switchTab(options);
      });
    } catch (e) {
      if (token === uni.getStorageSync("staffToken")) {
        if (previous === "day" || previous === "night")
          uni.setStorageSync(key, previous);
        else uni.removeStorageSync(key);
        uni.$emit("business:context", ctx);
      }
      lastSwitchAt = 0;
      throw e;
    }
    uni.$emit("business:context", ctx);
    return true;
  } catch {
    uni.showToast({ title: "切换失败，请重试", icon: "none" });
    return false;
  } finally {
    switching = false;
  }
}
export async function dayTabGuard(
  section: "home" | "orders" | "income",
): Promise<Workspace> {
  try {
    await useSessionStore().ensure();
  } catch {
    uni.showTabBar({ fail: () => {} });
    return "day";
  }
  const ctx = await fetchBizContext();
  if (workspaceOf(ctx) === "night") {
    switchGuarded(NIGHT_PAGE_OF[section]);
    return "night";
  }
  uni.showTabBar({ fail: () => {} });
  return "day";
}
export function nightTabGuard(): void {
  uni.hideTabBar({ fail: () => {} });
  try {
    uni.hideHomeButton?.();
  } catch {
    /* 兼容旧基础库 */
  }
  // 经营资格由各页 load 中的 ensureNightCampus 实时校验，避免并行导航。
}
export function switchNightTab(target: NightSection): void {
  if (target === "profile") uni.switchTab({ url: "/pages/profile/index" });
  else if (NIGHT_PAGE_OF[target]) uni.reLaunch({ url: NIGHT_PAGE_OF[target] });
}
/** 轮询不覆盖用户选择，也不打断收货、盘点等二级页。 */
export function syncWorkspaceMode(ctx: BizContext): void {
  const token = uni.getStorageSync("staffToken") as string;
  if (!acceptContext(ctx, token)) return;
  const pages = getCurrentPages(),
    route = pages[pages.length - 1]?.route ?? "";
  const workspace = workspaceOf(ctx);
  if (workspace === "night" && DAY_SECTIONS[route])
    switchGuarded(NIGHT_PAGE_OF[DAY_SECTIONS[route]]);
  if (
    workspace === "day" &&
    Object.values(NIGHT_PAGE_OF).some((url) => url.slice(1) === route)
  ) {
    if (canViewNightHistory(ctx) && [NIGHT_PAGE_OF.orders, NIGHT_PAGE_OF.income].some(url => url.slice(1) === route)) return;
    switchGuarded("/pages/index/index");
  }
}
