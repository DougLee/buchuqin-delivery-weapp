import { request } from "./request";
import type {
  BattleMapData,
  BattleRoomDetail,
  CommissionBill,
  CommissionRecord,
  Dashboard,
  LeaveItem,
  NightDashboard,
  NightDepositDetail,
  NightDepositPayIntent,
  NightDepositPayStatus,
  NightDepositTiers,
  NightIncome,
  NightOrder,
  NightOrderEarning,
  NightPoolItem,
  NightProduct,
  NightStockOrder,
  NightInventoryReport,
  NightInventoryTxn,
  NotifyQuotaInfo,
  Performance,
  Shift,
  StaffProfile,
  StaffRole,
  StaffStatus,
  Task,
} from "../types";
/** 本端小程序 appid（IK8W5Q 双小程序凭证路由，与 manifest 一致） */
const DELIVERY_APPID = import.meta.env.VITE_WECHAT_APP_ID;
if (!DELIVERY_APPID) throw new Error("缺少 VITE_WECHAT_APP_ID，请使用履约端品牌构建命令启动");
/** 微信登录返回（wechat-login / staff-bind 共用） */
interface WechatLoginResult {
  token: string;
  user: {
    id: string;
    campusId: string;
    role: StaffRole;
    nickname: string;
  };
}
/** 后端列表统一分页信封（IK8W5 分页包裹），api 层解包成页面所需的裸形状 */
interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
export const api = {
  businessContext: () => request<{
    staffId?: string; staffRole?: StaffRole; canSwitchWorkspace?: boolean;
    mode: 'day' | 'night' | 'rest'; hasNightStore: boolean; campusName: string;
    nightStartAt: string | null; nightEndAt: string | null; reason: string;
  }>('/fulfillment/business-context'),
  /** 微信员工登录（IK8W5Q）：appid 路由到履约端凭证；openid 未绑定 Staff 时 404 */
  wechatStaffLogin: (code: string) =>
    request<WechatLoginResult>("/auth/wechat-login", {
      method: "POST",
      data: { code, appid: DELIVERY_APPID },
    }),
  /** 首次绑定：工号+姓名换绑 openid，绑定即登录 */
  staffBind: (code: string, staffNo: string, name: string) =>
    request<WechatLoginResult>("/auth/staff-bind", {
      method: "POST",
      data: { code, staffNo, name, appid: DELIVERY_APPID },
    }),
  /** 退出登录（IKC4IN）：解绑 openid——否则静默 wx.login 会自动登回原账号（假退出） */
  wechatUnbind: () =>
    request<{ unbound: boolean }>("/auth/wechat-unbind", {
      method: "POST",
      data: {},
    }),
  profile: (_r: StaffRole) => request<StaffProfile>("/fulfillment/profile"),
  /** IKKTTP 楼长作战地图：整栋三色格/寝室详情 */
  battleMap: () => request<BattleMapData>("/fulfillment/battle-map"),
  battleMapRoom: (roomId: string) =>
    request<BattleRoomDetail>(`/fulfillment/battle-map/rooms/${roomId}`),
  dashboard: (_r: StaffRole) => request<Dashboard>("/fulfillment/dashboard"),
  tasks: async (_r: StaffRole, s = "all") =>
    (await request<PageResult<Task>>(`/fulfillment/tasks?status=${s}`)).items,
  /** 任务分页契约（IK9AWX）：滚动加载用，返回完整信封；IKRMQF 加楼栋筛选 */
  tasksPage: (s = "all", page = 1, pageSize = 20, buildingId = "") =>
    request<PageResult<Task>>(
      `/fulfillment/tasks?status=${s}&page=${page}&pageSize=${pageSize}${
        buildingId ? `&buildingId=${encodeURIComponent(buildingId)}` : ""
      }`,
    ),
  /** IKRMQF（道哥 2026-10-30）：任务看板楼栋筛选——骑手所在校区楼栋列表 */
  taskBuildings: () =>
    request<Array<{ id: string; name: string }>>("/fulfillment/buildings"),
  task: (_r: StaffRole, id: string) =>
    request<Task>(`/fulfillment/tasks/${id}`),
  action: (
    _r: StaffRole,
    id: string,
    a: string,
    data: Record<string, unknown> = {},
  ) =>
    request<Task>(`/fulfillment/tasks/${id}/actions/${a}`, {
      method: "POST",
      data,
    }),
  /** #111（IKRSIY）扫码到店：小票二维码内容=orderNo，免任务 id 直确认到店
   *  （waiting-first-mile → arrived）。400=空号/未接单、404=订单不存在、
   *  409=状态已推进（重复扫码/别处已推进） */
  scanArrive: (orderNo: string) =>
    request<{
      orderId: string;
      orderNo: string;
      status: string;
      statusText: string;
    }>("/fulfillment/scan-arrive", {
      method: "POST",
      data: { orderNo },
    }),
  performance: (_r: StaffRole) =>
    request<Performance>("/fulfillment/performance"),
  leave: () => request<LeaveItem[]>("/fulfillment/leave-dispatch"),
  createLeave: (data: Record<string, unknown>) =>
    request<LeaveItem>("/fulfillment/leave-requests", { method: "POST", data }),
  /** 代班楼长候选（IKA57Y）：请假「自己调配」时的选择列表 */
  managers: () =>
    request<Array<{ id: string; name: string; building: string }>>(
      "/fulfillment/managers",
    ),
  acceptDispatch: (id: string) =>
    request<LeaveItem>(`/fulfillment/dispatch-invitations/${id}/accept`, {
      method: "POST",
    }),
  /** 后端把 records 改为 items 并加分页信封（汇总字段平铺不变），这里映射回 CommissionBill */
  /**
   * 提成账单（IK9AWZ/AWX）：month 缺省当月；pageSize=100 取整月记录
   * （校园量级单月远小于 100，超出再上真分页），total 为信封真实总数。
   */
  commissions: async (
    _r: StaffRole,
    month?: string,
  ): Promise<CommissionBill & { total: number }> => {
    const query = month ? `?month=${month}&pageSize=100` : "?pageSize=100";
    const { items, total, ...summary } = await request<
      Omit<CommissionBill, "records"> & PageResult<CommissionRecord>
    >(`/fulfillment/commissions${query}`);
    return { ...summary, records: items, total };
  },
  // —— 以下为 IK8W5U 接入的后端已有能力 ——
  /** 当班卡：GET /fulfillment/shifts/current */
  shiftsCurrent: () => request<Shift>("/fulfillment/shifts/current"),
  checkIn: () =>
    request<Shift>("/fulfillment/shifts/check-in", { method: "POST" }),
  checkOut: () =>
    request<Shift>("/fulfillment/shifts/check-out", { method: "POST" }),
  /** 上下线切换：PATCH /fulfillment/profile/status
   * TODO(真机验证): @dcloudio/types 未收录 PATCH；H5 正常，微信端 wx.request
   * 对 PATCH 的支持未在官方文档列出，需真机回归（异常时需后端补 POST 通道） */
  updateStatus: (status: StaffStatus) =>
    request<StaffProfile>("/fulfillment/profile/status", {
      method: "PATCH" as UniApp.RequestOptions["method"],
      data: { status },
    }),
  /** 员工自助更新本人电话（IKP0AP）：PATCH /fulfillment/profile，body { phone }
   *  TODO(真机验证): 同 updateStatus——PATCH 在微信端 wx.request 的支持未在官方文档列出 */
  updateMyProfilePhone: (phone: string) =>
    request<Partial<StaffProfile>>("/fulfillment/profile", {
      method: "PATCH" as UniApp.RequestOptions["method"],
      data: { phone },
    }),
  /** 一键获取本机手机号（道哥 2026-10-20）：wx getPhoneNumber code 换号，
   *  后端按组织履约凭证调微信接口换真实号并直写档案，返回最新 profile */
  fetchMyPhoneByWechat: (code: string) =>
    request<Partial<StaffProfile>>("/fulfillment/profile/wechat-phone", {
      method: "POST" as UniApp.RequestOptions["method"],
      data: { code },
    }),
  /** 抢单池（仅骑手角色，楼长 403）：GET /fulfillment/tasks/available */
  availableTasks: (buildingId = "") =>
    request<Task[]>(
      `/fulfillment/tasks/available${
        buildingId ? `?buildingId=${encodeURIComponent(buildingId)}` : ""
      }`,
    ),
  /** 抢单：POST /fulfillment/tasks/:id/grab，与 accept 同互斥 */
  grab: (id: string) =>
    request<Task>(`/fulfillment/tasks/${id}/grab`, {
      method: "POST",
      data: {},
    }),
  /** 拒绝调配邀请 */
  rejectDispatch: (id: string) =>
    request<LeaveItem>(`/fulfillment/dispatch-invitations/${id}/reject`, {
      method: "POST",
      data: {},
    }),
  /** 撤销待审核请假 */
  cancelLeave: (id: string) =>
    request<LeaveItem>(`/fulfillment/leave-requests/${id}/cancel`, {
      method: "POST",
    }),
  /** 订阅授权上报（IKDQP9）：本次授权成功 count 条（1-10），服务端额度 +count */
  notifyGrant: (count: number) =>
    request<{ quota: number }>("/fulfillment/notify/grant", {
      method: "POST",
      data: { count },
    }),
  /** 订阅额度查询（IKDQP9）：lowWater=quota<5；failedToday=当天有推送因额度耗尽失败 */
  notifyQuota: () => request<NotifyQuotaInfo>("/fulfillment/notify/quota"),
  // —— 夜宵店（IKSW1F）：楼长端 /night-rider/night/*，Staff JWT 鉴权同履约端 ——
  /** 夜宵工作台：场次/营业态/押金/待接单/今日销售/库存货值/佣金两列 */
  nightDashboard: () =>
    request<NightDashboard>("/night-rider/night/dashboard"),
  /** 押金档位预览：当前余额 + 下一档差额 + 后续三档 */
  nightDepositTiers: () =>
    request<NightDepositTiers>("/night-rider/night/deposit/tiers"),
  /** 押金详情：余额 + 流水（缴纳/扣除/退还，时间倒序） */
  nightDeposit: (page = 1) => request<NightDepositDetail>(`/night-rider/night/deposit?page=${page}&pageSize=20`),
  /** 发起押金缴纳：后端按 500 元档递增算差额生成 ND 支付单（金额自算，不接受自选） */
  nightDepositPay: (targetTier?: number) =>
    request<NightDepositPayIntent>("/night-rider/night/deposit/pay", {
      method: "POST",
      data: { targetTier },
    }),
  /** 押金支付结果查询（回调故障兜底：服务端主动查微信单落账） */
  nightDepositPayStatus: (outTradeNo?: string) =>
    request<NightDepositPayStatus>(
      `/night-rider/night/deposit/pay-status${
        outTradeNo ? `?outTradeNo=${encodeURIComponent(outTradeNo)}` : ""
      }`,
    ),
  /** 商品池：本校区夜主档 + 本店楼栋行（当前库存/上架状态） */
  nightStockPool: () => request<NightPoolItem[]>("/night-rider/night/stock/pool"),
  /** 备货申请：占用额度，审核出库后按实收数量入库。 */
  nightStockOrder: (items: Array<{ catalogProductId: string; quantity: number }>, requestId: string) =>
    request<{ id: string; totalValue: number; createdAt: string }>(
      "/night-rider/night/stock/orders",
      { method: "POST", data: { items, requestId } },
    ),
  /** 备货记录列表（信封分页） */
  nightStockOrders: (page = 1, pageSize = 20, status = 'all') =>
    request<PageResult<NightStockOrder>>(
      `/night-rider/night/stock/orders?page=${page}&pageSize=${pageSize}&status=${encodeURIComponent(status)}`,
    ),
  nightCancelStock: (id: string, reason: string) => request<NightStockOrder>(`/night-rider/night/stock/orders/${id}/cancel`, { method: "POST", data: { reason } }),
  nightReceiveStock: (id: string, items: Array<{ catalogProductId: string; quantity: number }>) => request<NightStockOrder>(`/night-rider/night/stock/orders/${id}/receive`, { method: "POST", data: { items } }),
  nightInventoryReports: (page = 1) => request<PageResult<NightInventoryReport>>(`/night-rider/night/inventory/reports?page=${page}&pageSize=20`),
  nightInventoryReport: (data: { requestId: string; kind: "loss" | "stocktake"; reason: string; photos: string[]; items: Array<{ nightProductId: string; quantity: number; inventoryVersion: number }> }) => request<NightInventoryReport>("/night-rider/night/inventory/reports", { method: "POST", data }),
  nightResubmitLoss: (id: string, reason: string, photos: string[]) => request<NightInventoryReport>(`/night-rider/night/inventory/reports/${id}/resubmit`, { method: "POST", data: { reason, photos } }),
  nightInventoryTxns: (productId?: string, page = 1) => request<PageResult<NightInventoryTxn>>(`/night-rider/night/inventory/txns?page=${page}&pageSize=20${productId ? `&productId=${encodeURIComponent(productId)}` : ""}`),
  /** 本店商品列表（资料只读，含库存/上下架/可售状态） */
  nightProducts: () => request<NightProduct[]>("/night-rider/night/products"),
  /** 上下架切换：PATCH；恢复上架时后端校验主档停售（楼长不能绕过后台停售） */
  nightToggleShelf: (id: string, onShelf: boolean) =>
    request<{ id: string; onShelf: boolean }>(
      `/night-rider/night/products/${id}/shelf`,
      {
        method: "PATCH" as UniApp.RequestOptions["method"],
        data: { onShelf },
      },
    ),
  /** 夜宵订单列表（todo=待办[待接单+配送中]，信封分页） */
  nightOrders: (status: string, page = 1, pageSize = 20) =>
    request<PageResult<NightOrder>>(
      `/night-rider/night/orders?status=${status}&page=${page}&pageSize=${pageSize}`,
    ),
  /** 本店订单详情 */
  nightOrder: (id: string) =>
    request<NightOrder>(`/night-rider/night/orders/${id}`),
  /** 接单（pending-accept → delivering） */
  nightAccept: (id: string) =>
    request<unknown>(`/night-rider/night/orders/${id}/accept`, {
      method: "POST",
      data: {},
    }),
  /** 送达（delivering → delivered） */
  nightDeliver: (id: string, images: string[], remark = '') =>
    request<unknown>(`/night-rider/night/orders/${id}/deliver`, {
      method: "POST",
      data: { images, remark },
    }),
  /** 单单佣金明细（券扣减/基数/比例/佣金/配送费两条） */
  nightOrderEarning: (id: string) =>
    request<NightOrderEarning>(`/night-rider/night/orders/${id}/earning`),
  /** 夜宵收入：佣金/配送费两列汇总 + 押金余额 + 佣金流水 */
  nightIncome: (month?: string, status = 'all', page = 1) => request<NightIncome>(`/night-rider/night/income?${month ? `month=${encodeURIComponent(month)}&` : ''}status=${encodeURIComponent(status)}&page=${page}&pageSize=20`),
  /** 开店（互斥/押金/可售商品校验，不满足 400 返回具体原因） */
  nightOpen: () =>
    request<{ id: string; status: string }>("/night-rider/night/store/open", {
      method: "POST",
      data: {},
    }),
  /** 暂停营业（本场次内可恢复） */
  nightPause: () =>
    request<{ id: string; status: string }>("/night-rider/night/store/pause", {
      method: "POST",
      data: {},
    }),
  /** 恢复营业（重验场次窗口与校区闭店互斥） */
  nightResume: () =>
    request<{ id: string; status: string }>("/night-rider/night/store/resume", {
      method: "POST",
      data: {},
    }),
  /** 打烊（停止新单，已付订单继续履约，库存跨场留存） */
  nightClose: () =>
    request<{ id: string; status: string }>("/night-rider/night/store/close", {
      method: "POST",
      data: {},
    }),
};
