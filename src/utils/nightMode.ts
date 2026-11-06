import { api } from "../api";
import { ApiError } from "../api/request";
import { useSessionStore } from "../stores/session";

/**
 * 夜宵模式判定与页面守卫（V4 定稿：三态模式，服务端规则驱动）。
 *
 * 服务端口径（GET /fulfillment/business-context）：
 * - mode='day'   白天营业中 → 白天端浅色原样
 * - mode='night' 闭店+夜宵窗口+有夜宵店（隐含楼长资格，骑手恒 hasNightStore=false）
 *                → 「打开即夜店」，白天四 tab reLaunch 到夜宵对应页
 * - mode='rest'  闭店+窗口未到 → 白天工作台 + 休息提示（插槽卡徽章「未开业」）+ 准备卡常显
 *
 * 兜底：接口不可用（未登录/网络/404）一律按 day 处理，白天页面原样渲染不崩。
 */

/** 夜宵模式语境下的四个 tab（与白天 tabBar 镜像） */
export type NightSection = "home" | "orders" | "income" | "profile";

/** 白天 tab → 夜宵对应页（mode='night' 时 reLaunch 目标；「我的」不跳，共享页深色变体） */
const NIGHT_PAGE_OF: Record<string, string> = {
  home: "/pages/night/home",
  orders: "/pages/night/orders-tab",
  income: "/pages/night/income-tab",
};

export interface BizContext {
  mode: "day" | "night" | "rest";
  hasNightStore: boolean;
  campusName: string;
  nightStartAt: string | null;
  nightEndAt: string | null;
  reason: string;
}

/** 兜底上下文：接口不可用时白天原样（rest 用 day 口径渲染，页面不崩） */
export function fallbackContext(): BizContext {
  return {
    mode: "day",
    hasNightStore: false,
    campusName: "",
    nightStartAt: null,
    nightEndAt: null,
    reason: "",
  };
}

/**
 * 拉取营业语境（含兜底）：未登录/游客/接口异常一律返回 day 兜底，
 * 由调用方决定是否展示（守卫绝不因本接口抛错打断页面）。
 */
export async function fetchBizContext(): Promise<BizContext> {
  if (!uni.getStorageSync("staffToken")) return fallbackContext();
  try {
    return await api.businessContext();
  } catch (e) {
    // 未绑定员工（游客）按无夜宵资格处理；其余网络/服务异常同样兜底 day
    if (e instanceof ApiError && e.status === 404) return fallbackContext();
    return fallbackContext();
  }
}

/* ---------- reLaunch 防抖：模式切换跳转后 3s 内不重复跳 ---------- */
let lastSwitchAt = 0;
function switchGuarded(url: string): boolean {
  const now = Date.now();
  if (now - lastSwitchAt < 3000) return false;
  lastSwitchAt = now;
  uni.reLaunch({ url });
  return true;
}

/** 白天 tab 页是否该让位给夜宵模式（仅服务端判定的 night 态才跳） */
function shouldRelaunchToNight(ctx: BizContext): boolean {
  // night 态隐含楼长资格（服务端 nightWindow && store 才返回 night），双保险再验 hasNightStore
  return ctx.mode === "night" && ctx.hasNightStore;
}

/**
 * 白天四 tab 页 onShow 守卫（V4 规格 3）：先等登录就绪再判模式（消除冷启动
 * 竞态——旧版守卫读 token 早于 wx.login 完成，首检恒 day，靠 2.5s 补检跳转
 * 导致「打开几秒后闪一下」，2026-11-06 道哥反馈后重构）。
 *
 * 返回 "night" 表示已触发 reLaunch（调用方跳过本次渲染，防白天内容先画出
 * 来再被整页替换的闪屏）；"day"/"rest" 返回后调用方正常渲染白天内容。
 * 游客/接口异常兜底 day，页面不崩。
 */
export async function dayTabGuard(
  section: "home" | "orders" | "income",
): Promise<"night" | "day"> {
  // 等登录就绪（有 token 直接过；无 token 走微信登录，约 1~2s；游客抛错兜 day）
  try {
    await useSessionStore().ensure();
  } catch {
    uni.showTabBar({ fail: () => {} });
    return "day";
  }
  const ctx = await fetchBizContext();
  if (shouldRelaunchToNight(ctx)) {
    const target = NIGHT_PAGE_OF[section];
    if (target) switchGuarded(target);
    return "night";
  }
  uni.showTabBar({ fail: () => {} });
  return "day";
}

/**
 * 夜宵三 tab 页（home/orders-tab/income-tab）onShow 守卫：
 * night 模式放行；rest 模式且白天端主动进入（enterFromDay 标记，插槽卡/
 * 我的分组 reLaunch 进来做备货押金准备）→ 放行（V4 规格 1：rest=准备卡常显）；
 * day 模式（或 rest 但非主动进入，如冷启动落在夜宵页）且页面栈深=1 → 弹回白天工作台。
 */
export function nightTabGuard(): void {
  uni.hideTabBar({ fail: () => {} });
  // 非 tab 页冷启动/reLaunch 直达时微信会在左上角画「回首页」圆钮——
  // 夜宵三 tab 主页不要它（道哥 2026-11-06 反馈），进入即隐藏
  try {
    uni.hideHomeButton?.();
  } catch {
    /* 低版本基础库无此 API：圆钮保留，不影响功能 */
  }
  void fetchBizContext().then((ctx) => {
    if (ctx.mode === "night") return;
    if (ctx.hasNightStore && enterFromDay) return;
    // 栈深>1 是夜宵页 navigateTo 二级页返回途中（守卫不拦二级页栈）
    const pages = getCurrentPages();
    if (pages.length <= 1) {
      enterFromDay = false;
      switchGuarded("/pages/index/index");
    }
  });
}

/* ---------- 白天端主动进入夜宵模式标记（道哥 2026-11：三 tab 主页无返回钮） ----------
   goNightWorkspace / switchNightTab 全部 reLaunch（栈深恒 1 → 导航栏无返回钮）。
   nightTabGuard 原用「栈深>1」识别 rest 态经营准备进入，reLaunch 后栈深恒 1，
   改用本内存标记放行：仅存 JS 运行时（reLaunch 不重启上下文），冷启动自动复位，
   无需显式清除。二级功能页（押金/进货/商品/订单详情）仍 navigateTo，返回钮合理。 */
let enterFromDay = false;

/** 夜宵 tabbar 点击跳转：夜宵三页用 reLaunch（普通页面），「我的」走原生 switchTab */
export function switchNightTab(target: NightSection): void {
  if (target === "profile") {
    uni.switchTab({ url: "/pages/profile/index" });
    return;
  }
  // rest 态夜宵内切 tab 后守卫仍需放行，置位同 goNightWorkspace
  enterFromDay = true;
  const url = NIGHT_PAGE_OF[target];
  if (url) uni.reLaunch({ url });
}

/** 整卡进入夜宵工作台（插槽卡/我的分组等白天语境入口）：reLaunch 栈深 1，无返回钮 */
export function goNightWorkspace(): void {
  enterFromDay = true;
  uni.reLaunch({ url: "/pages/night/home" });
}

let previousMode: BizContext['mode'] | undefined;
/** 前台轮询只切换工作区主页，不打断收货、盘点等二级操作。 */
export function syncWorkspaceMode(ctx: BizContext): void {
  if (previousMode === 'night' && ctx.mode !== 'night') enterFromDay = false;
  previousMode = ctx.mode;
  const pages = getCurrentPages();
  const route = pages[pages.length - 1]?.route ?? '';
  const dayRoutes: Record<string, string> = { 'pages/index/index': 'home', 'pages/tasks/index': 'orders', 'pages/income/index': 'income' };
  if (shouldRelaunchToNight(ctx) && dayRoutes[route]) switchGuarded(NIGHT_PAGE_OF[dayRoutes[route]]);
  if (ctx.mode !== 'night' && !enterFromDay && ['pages/night/home', 'pages/night/orders-tab', 'pages/night/income-tab'].includes(route)) switchGuarded('/pages/index/index');
  if (route === 'pages/profile/index') uni.$emit('business:context', ctx);
}
