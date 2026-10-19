import type { ApiResult } from "../types";
export const baseURL =
  // 本机 API 固定 3100（3000 被占），dev 裸跑不再需要前置 VITE_API_BASE_URL；生产构建同源相对路径 /api/v1
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3100/api/v1";
const BASE_URL = baseURL;
type Options = Omit<UniApp.RequestOptions, "url">;
function valid<T>(v: unknown): v is ApiResult<T> {
  return typeof v === "object" && v !== null && "code" in v && "data" in v;
}
/** ADR-0005 错误分类：business=业务拒绝（重试无意义）；network=断网/超时；server=5xx。后两者才值得「点击重试」 */
export type ApiErrorKind = "business" | "network" | "server";
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  constructor(message: string, kind: ApiErrorKind, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}
/** 网络失败/服务故障才可重试（ADR-0005）：页面错误态/重试卡只认这个 */
export function isRetryable(e: unknown): boolean {
  return e instanceof ApiError && e.kind !== "business";
}
/** Nest 校验管道的 message 可能是数组，拼成一句 */
function readableMessage(raw: unknown): string {
  if (Array.isArray(raw)) return raw.filter(Boolean).join("；");
  return typeof raw === "string" && raw ? raw : "";
}
// token 失效后重登（动态引入避免与 stores/session 的循环依赖）
// IKLE1J（审查报告 P0）：单飞+失败冷却——token 过期瞬间轮询/工作台/任务页
// 并发 401，各自重登会烧光登录限流（10 次/分）陷入 429 锁死。并发 401 共享
// 同一 in-flight Promise；失败后 5s 冷却内直接拒绝并明示，不再连环撞限流。
let reloginInFlight: Promise<string> | null = null;
let reloginFailedAt = 0;
const RELOGIN_COOLDOWN_MS = 5000;
function relogin(): Promise<string> {
  if (reloginInFlight) return reloginInFlight;
  if (Date.now() - reloginFailedAt < RELOGIN_COOLDOWN_MS) {
    uni.showToast({ title: "登录失败，请稍后重试", icon: "none" });
    return Promise.reject(
      new ApiError("登录失败，请稍后重试", "network"),
    );
  }
  reloginInFlight = (async () => {
    uni.removeStorageSync("staffToken");
    const { useSessionStore } = await import("../stores/session");
    await useSessionStore().ensure();
    return uni.getStorageSync("staffToken") as string;
  })();
  // 成败都放行下一轮；派生 promise 已消化错误，不会 unhandled rejection
  reloginInFlight.then(
    () => {
      reloginInFlight = null;
    },
    () => {
      reloginInFlight = null;
      reloginFailedAt = Date.now();
    },
  );
  return reloginInFlight;
}
export async function request<T>(
  path: string,
  options: Options = {},
): Promise<T> {
  const token = uni.getStorageSync("staffToken") as string;
  const send = (authToken: string, retried: boolean) =>
    new Promise<T>((resolve, reject) =>
      uni.request({
        ...options,
        url: BASE_URL + path,
        header: {
          "content-type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        success: async (res) => {
          // token 过期/失效：清缓存重登一次后重试
          if (res.statusCode === 401 && !retried) {
            try {
              resolve(await send(await relogin(), true));
            } catch (error) {
              reject(error instanceof Error ? error : new Error("重新登录失败"));
            }
            return;
          }
          if (valid<T>(res.data) && res.statusCode < 300) {
            resolve(res.data.data);
            return;
          }
          // ADR-0005（IKA00R）错误分类收敛在 request 层：business=4xx 透传后端
          // message（如 404"未绑定员工账号"，登录页仍可凭 message 展开绑定表单）；
          // 401 不 toast（自动重登通道已提示）；5xx 统一话术。toast 是唯一出口，
          // 页面不得重复提醒
          const body = res.data as { message?: unknown } | null;
          const detail = readableMessage(body?.message);
          let apiError: ApiError;
          if (res.statusCode === 401) {
            // IKLE1J：自动重登失败后的二次 401——归为可重试（页面错误态/重试卡），
            // 不再静默 business（原行为=陈旧数据上点任何按钮无反应无提示的假死）
            apiError = new ApiError("登录已过期，请重试", "network", 401);
          } else if (res.statusCode === 429) {
            apiError = new ApiError(
              "操作太频繁，请 1 分钟后再试",
              "business",
              429,
            );
          } else if (res.statusCode >= 500) {
            apiError = new ApiError(
              "服务暂时不可用，请稍后再试",
              "server",
              res.statusCode,
            );
          } else {
            apiError = new ApiError(
              detail || `请求失败（${res.statusCode}）`,
              "business",
              res.statusCode,
            );
          }
          // IKLE1J：401 也 toast——自动重登失败不再静默（首个 401 不会走到这里，
          // 被 401 重试分支拦下；到达分类层的 401 都是重登失败的终态）
          // 「未绑定」404 静默（道哥 2026-10-19）：首次打开必弹观感像报错——
          // 它是预期路径，首页访客态/登录页绑定表单都有 UI 承接；错误对象
          // 照常上抛（isBindRequired 分支不受影响）。与 session.isBindRequired
          // 弱判定同口径（不 import store 防循环依赖）。
          if (
            !(
              res.statusCode === 404 &&
              /未绑定/.test(apiError.message || "")
            )
          )
            uni.showToast({ title: apiError.message, icon: "none" });
          reject(apiError);
        },
        fail(err) {
          // 网络层 fail（请求根本没到后端）：真实 errMsg 透出，别再用
          // "服务暂时不可用" 一刀切——合法域名未配/证书/断网是三种完全不同
          // 的修法，看不到 errMsg 只能瞎猜。reject 带原始信息供上层定位。
          const raw =
            (err as { errMsg?: string })?.errMsg || "request:fail 网络异常";
          console.error("[request fail]", raw, "path:", path);
          let msg = raw;
          if (/domain|域名|合法|url not in/i.test(raw))
            msg = "域名未配合法域名";
          else if (/ssl|证书|certificate|handshake/i.test(raw))
            msg = "HTTPS 证书校验失败";
          else if (/timeout|超时/i.test(raw)) msg = "网络请求超时，请重试";
          uni.showToast({ title: msg, icon: "none" });
          reject(new ApiError(msg, "network"));
        },
      }),
    );
  return send(token, false);
}
