import type { ApiResult } from "../types";
export const baseURL =
  // 本机 API 固定 3100（3000 被占），dev 裸跑不再需要前置 VITE_API_BASE_URL；生产构建同源相对路径 /api/v1
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3100/api/v1";
const BASE_URL = baseURL;
type Options = Omit<UniApp.RequestOptions, "url">;
function valid<T>(v: unknown): v is ApiResult<T> {
  return typeof v === "object" && v !== null && "code" in v && "data" in v;
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
          // 错误信息兼容两种 body：业务信封 {code,message} 与 Nest 异常
          // {message,error,statusCode}（如 404"未绑定员工账号"需透传给登录页展开绑定表单）
          const body = res.data as { message?: string } | null;
          const msg =
            typeof body?.message === "string" && body.message
              ? body.message
              : "请求失败";
          uni.showToast({ title: msg, icon: "none" });
          reject(new Error(msg));
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
          reject(new Error(msg));
        },
      }),
    );
  return send(token, false);
}
