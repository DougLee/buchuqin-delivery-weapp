import { baseURL } from "./request";
import type { ApiResult } from "../types";

/** 后端返回相对路径（/api/v1/uploads/...），前端拼完整地址 */
function resolveUrl(url: string): string {
  return /^https?:\/\//.test(url) ? url : baseURL + url;
}
function parseResult(raw: string): { url: string } {
  const v: unknown = JSON.parse(raw);
  if (
    typeof v === "object" &&
    v !== null &&
    "code" in v &&
    (v as ApiResult<{ url: string }>).code === 0 &&
    typeof (v as ApiResult<{ url: string }>).data?.url === "string"
  ) {
    return { url: resolveUrl((v as ApiResult<{ url: string }>).data.url) };
  }
  throw new Error(
    (v as ApiResult<unknown>)?.message || "上传失败，请重试",
  );
}
/**
 * 上传凭证图片到 POST /files/images（multipart，字段名 file）。
 * mp-weixin 走 uni.uploadFile，H5 走 fetch FormData。
 * TODO(真机验证): 微信真机上传与 Bearer 头透传需真机回归。
 */
export function uploadImage(file: string): Promise<string> {
  const token = uni.getStorageSync("staffToken") as string;
  // #ifdef MP-WEIXIN
  return new Promise<{ url: string }>((resolve, reject) =>
    uni.uploadFile({
      url: `${baseURL}/files/images`,
      filePath: file,
      name: "file",
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success(res) {
        try {
          resolve(parseResult(res.data));
        } catch (e) {
          uni.showToast({
            title: e instanceof Error ? e.message : "上传失败",
            icon: "none",
          });
          reject(e);
        }
      },
      fail(err) {
        uni.showToast({ title: "图片上传失败，请重试", icon: "none" });
        reject(err);
      },
    }),
  ).then((r) => r.url);
  // #endif
  // #ifndef MP-WEIXIN
  return (async () => {
    const blob = await (await fetch(file)).blob();
    const form = new FormData();
    form.append("file", blob, `proof-${Date.now()}.jpg`);
    const res = await fetch(`${baseURL}/files/images`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    return parseResult(await res.text()).url;
  })();
  // #endif
}
