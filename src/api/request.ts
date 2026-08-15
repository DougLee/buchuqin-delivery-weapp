import type { ApiResult } from "../types";
export const baseURL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api/v1";
const BASE_URL = baseURL;
type Options = Omit<UniApp.RequestOptions, "url">;
function valid<T>(v: unknown): v is ApiResult<T> {
  return typeof v === "object" && v !== null && "code" in v && "data" in v;
}
export async function request<T>(
  path: string,
  options: Options = {},
): Promise<T> {
  const token = uni.getStorageSync("staffToken") as string;
  return new Promise((resolve, reject) =>
    uni.request({
      ...options,
      url: BASE_URL + path,
      header: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success(res) {
        if (valid<T>(res.data) && res.statusCode < 300) {
          resolve(res.data.data);
          return;
        }
        const msg = valid<T>(res.data) ? res.data.message : "请求失败";
        uni.showToast({ title: msg, icon: "none" });
        reject(new Error(msg));
      },
      fail(err) {
        uni.showToast({ title: "服务暂时不可用", icon: "none" });
        reject(err);
      },
    }),
  );
}
