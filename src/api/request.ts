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
async function relogin() {
  uni.removeStorageSync("staffToken");
  const { useSessionStore } = await import("../stores/session");
  await useSessionStore().ensure();
  return uni.getStorageSync("staffToken") as string;
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
            apiError = new ApiError("登录已过期，请重试", "business", 401);
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
          if (res.statusCode !== 401)
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
