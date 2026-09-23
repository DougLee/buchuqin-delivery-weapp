import { api } from "../api";
import { useSessionStore } from "../stores/session";
import { isManagerRole } from "../types";
import type { NotifyQuotaInfo } from "../types";

/**
 * 订阅消息额度工具（IKDQP9，2026-09 道哥定稿）：
 * 「新订单提醒」授权一次攒一条推送额度，可累积。核心策略——
 * - 只有结果为 accept 才计数并继续下一次授权；
 * - 一旦 reject/ban/filter（用户拒绝或被屏蔽）立即停止，防连环弹窗骚扰；
 * - 「总是保持 + 允许」的用户全程无弹窗静默累积；
 * - 首次弹窗被拒则本次停止，下次 onShow 再试。
 * 真机已验证全链路（开发者工具会假报错，忽略）。
 */

/** 「新订单提醒」订阅消息模板（履约端私有库，IKDQP9 真机已验证） */
export const NOTIFY_TMPL_ID = "uqDmjNXOnCQH-QCfLE6ch8vTaDfXtiIxfklqmVv026M";

/**
 * 服务号二维码（IKI3ZP）：图片 URL 由道哥提供服务号二维码后配置；
 * 空串 = 未配置，骑手端不展示「关注服务号」引导（优雅降级）。
 * 关注后派单走服务号模板消息（无额度概念），订阅消息作为兜底通道保留。
 */
export const GZH_QRCODE_URL = "";

/** 上岗引导半屏只弹一次的 storage 标记（IKDQP9） */
const GUIDE_SHOWN_KEY = "notifyGuideShown";
export const isGuideShown = () => !!uni.getStorageSync(GUIDE_SHOWN_KEY);
export const markGuideShown = () => uni.setStorageSync(GUIDE_SHOWN_KEY, "1");

/** 额度缓存（IKDQP9）：页面先渲染缓存值再异步刷新，卡片/提示条不闪空 */
let cachedQuota: number | null = null;
export const getCachedQuota = () => cachedQuota;

/** 拉取服务端额度并刷新缓存（IKDQP9） */
export async function fetchQuota(): Promise<NotifyQuotaInfo> {
  const info = await api.notifyQuota();
  cachedQuota = info.quota;
  return info;
}

/** 单次授权请求：accept → true；reject/ban/filter/fail（无手势调用、
 *  开发者工具假报错、环境不支持）一律 → false 视为本次终止 */
function askOnce(): Promise<boolean> {
  return new Promise((resolve) => {
    uni.requestSubscribeMessage({
      tmplIds: [NOTIFY_TMPL_ID],
      success: (r) => {
        // @dcloudio/types 未给 success 结果加模板 ID 索引签名，这里断言取值
        const st = (r as unknown as Record<string, string>)[NOTIFY_TMPL_ID];
        resolve(st === "accept");
      },
      fail: () => resolve(false),
    });
  });
}

/** 攒额度互斥（IKDQP9）：串行循环期间禁止重入——「＋补充」连点 /
 *  onShow 静默攒与引导开启并发时会叠弹窗 */
let granting = false;

/**
 * 串行攒 n 次授权额度（IKDQP9）：
 * 逐次 requestSubscribeMessage，accept 才继续；被拒即停。
 * 结束后：成功次数 >0 则 POST grant 上报；无论成败都 GET quota 刷新缓存
 * （0 次也查，把服务端被推送消耗后的真实额度拿回来）。返回成功次数。
 */
export async function grantTimes(n: number): Promise<number> {
  // H5 等无订阅消息 API 的环境 / 上一轮还在跑：直接不弹
  if (granting || typeof uni.requestSubscribeMessage !== "function") return 0;
  granting = true;
  let ok = 0;
  try {
    for (let i = 0; i < n; i++) {
      if (!(await askOnce())) break;
      ok++;
    }
    if (ok > 0) {
      // 上报失败不回滚（用户已真实授权，额度以服务端记账为准，request 层已 toast）
      try {
        await api.notifyGrant(ok);
      } catch {
        /* 静默 */
      }
    }
    try {
      cachedQuota = (await api.notifyQuota()).quota;
    } catch {
      /* 静默刷新缓存 */
    }
  } finally {
    granting = false;
  }
  return ok;
}

/**
 * onShow 静默攒（IKDQP9）：进入小程序前台时补额度——
 * quota < 5 攒 3 条，否则攒 1 条；失败静默不打扰。
 * 未登录（游客/登录页阶段）不打接口。「总是保持+允许」用户全程无弹窗；
 * 其余用户无手势调用 requestSubscribeMessage 会直接 fail，循环自然终止。
 */
export async function silentTopUp(): Promise<void> {
  // 道哥 2026-09-09：楼长（含实习）也收到楼下推送，额度体系全员放开——
  // 推送受众 = 骑手两角色 + 楼长系（出库推骑手、到楼下推楼长）
  const role = useSessionStore().role;
  if (
    role !== "fulltime-rider" &&
    role !== "parttime-rider" &&
    !isManagerRole(role)
  )
    return;
  if (!uni.getStorageSync("staffToken") || granting) return;
  try {
    const { quota } = await fetchQuota();
    await grantTimes(quota < 5 ? 3 : 1);
  } catch {
    /* 静默：网络差不打扰（request 层的网络 toast 是全局既有口径） */
  }
}
