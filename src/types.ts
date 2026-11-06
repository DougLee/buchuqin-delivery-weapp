export type StaffRole =
  | "building-manager"
  | "intern-building-manager"
  | "fulltime-rider"
  | "parttime-rider";
/**
 * 楼长系角色判断（IKEAGE）：实习楼长（intern-building-manager，招募审批
 * 通过自动创建）与正式楼长完全同权——任务/交接/请假/收入/轮询等所有
 * 楼长分支统一走本函数，新增角色只改这里。
 */
export function isManagerRole(role: StaffRole): boolean {
  return role === "building-manager" || role === "intern-building-manager";
}
/** 后端 Staff.status 三态（IK8W5U）：profile.online 由它派生 */
export type StaffStatus = "online" | "paused" | "offline";
export interface StaffProfile {
  id: string;
  name: string;
  role: StaffRole;
  roleText: string;
  staffNo: string;
  building: string;
  online: boolean;
  status: StaffStatus;
  /** 归属校区（IKAJT4 去硬编码）：顶部「校区 · 仓名」接口下发 */
  campusName?: string;
  campusWarehouseName?: string;
  /** 联系电话（IKP0AP）：员工自助维护，空串=未录入 */
  phone?: string;
  /** 所属组织服务号二维码（IKP34J）：空串=组织未配置，展示端回落平台兜底 */
  gzhQrcodeUrl?: string;
  /** 本组织订阅消息模板 ID（道哥 2026-11-02）：profile 下发，授权弹窗
   *  requestSubscribeMessage 消费——模板跟 AppID 走，硬编码他组织模板必失败 */
  notifyTemplateId?: string;
}
/** 当班卡（IK8W5U）：GET /fulfillment/shifts/current */
export interface Shift {
  id: string;
  status: "working" | "not-started" | "completed";
  role: StaffRole;
  serviceArea: string;
  startAt: string;
  endAt: string;
  checkedInAt?: string;
  checkedOutAt?: string;
}
export interface Task {
  id: string;
  orderId: string;
  /** IKA57O：配送单号已下线，展示改用订单号 */
  packageNo?: string;
  orderNo: string;
  status: string;
  statusText: string;
  building: string;
  /** IKRMQF：楼栋性别（male/female/mixed）——任务卡男寝/女寝徽标，mixed 不显示 */
  buildingGender?: string;
  floor: number;
  room: string;
  itemCount: number;
  weight: number;
  /** 收件人联系（IK9AWW）：展示脱敏、拨号用真实号 */
  recipientName: string;
  recipientPhone: string;
  /** 骑手联系（IKP0AP）：骑手接单后才有；楼长视角为交接单上家骑手，null/缺省=未接单不渲染 */
  rider?: { name: string; phone: string } | null;
  mode: string;
  modeText: string;
  lastMileMode: "building-manager" | "customer-pickup";
  /** IKI7LZ：下单时间（北京时间 MM-DD HH:mm）——替代 deadline 的歧义时段文案 */
  orderedAt: string;
  deadline: string;
  warehouse: string;
  /** 任务佣金（单位:分） */
  commission: number;
  items: Array<{ name: string; quantity: number; image: string }>;
  timeline: Array<{
    key: string;
    title: string;
    description: string;
    done: boolean;
    time?: string;
  }>;
  availableActions: string[];
}
export interface Dashboard {
  profile: StaffProfile;
  /** 统计卡数值；income 键为金额（单位:分），其余为单量/百分比 */
  stats: Record<string, number>;
  tasks: Task[];
  /** #112 计酬模式：per-order 按单计酬 | rate 按销售额抽成（未下发=按单计酬） */
  commissionMode?: "per-order" | "rate";
  /** 抽成比例（万分比：5%=500），仅 commissionMode=rate 时有意义 */
  commissionRate?: number;
}
/** 订阅消息额度（IKDQP9）：GET /fulfillment/notify/quota
 *  lowWater=quota<5（低水位）；failedToday=当天有推送因额度耗尽失败；
 *  gzhBound=已关注服务号（IKI3ZP，关注后派单走服务号模板不受额度限制） */
export interface NotifyQuotaInfo {
  quota: number;
  lowWater: boolean;
  failedToday: boolean;
  gzhBound?: boolean;
}
export interface ApiResult<T> {
  code: number;
  message: string;
  data: T;
  timestamp: string;
}
export interface Performance {
  period: string;
  pending: number;
  completed: number;
  /** 收入（单位:分） */
  income: number;
  onTimeRate: number;
  proofRate: number | null;
  exceptionRate: number;
  /** IKIRO6 推广订单金额（单位:分）：今日/本月（送达时间口径） */
  /** IKRSIZ #108：校区关闭销售额展示时为 null（前端不渲染该格） */
  todayGmv?: number | null;
  monthGmv?: number | null;

  monthOrders?: number;
}
export interface CommissionRecord {
  id: string;
  orderNo: string;
  building: string;
  /** 提成金额（单位:分） */
  amount: number;
  createdAt: string;
  status: string;
  /** 无规则命中的兜底提成标记（IK8W5L 口径） */
  fallback?: boolean;
  remark?: string | null;
}
export interface CommissionBill {
  month: string;
  /** 社群底薪（单位:分） */
  baseSalary: number;
  /** 配送提成（单位:分） */
  deliveryIncome: number;
  /** 跨期调整（单位:分，可为负） */
  adjustment: number;
  /** 应结金额（单位:分） */
  payable: number;
  records: CommissionRecord[];
}
export interface LeaveItem {
  id: string;
  building?: string;
  status: string;
  statusText: string;
  startAt: string;
  endAt: string;
  reason?: string;
  /** 调配奖励，源自 DispatchInvitation.reward（单位:分） */
  reward?: number;
  /** 自己调配指定的代班楼长姓名（IKA57Y） */
  substituteName?: string | null;
}

/* ==================== 夜宵店（IKSW1F 楼长端 /night-rider/night/*） ==================== */

/** 微信 JSAPI 拉起支付参数（payments jsapiPrepay 下发，与用户端同构） */
export interface WechatPayParams {
  appId: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: string;
  paySign: string;
}

/** 押金档位预览（GET deposit/tiers）：当前余额 + 下一档差额 + 后续三档 */
export interface NightDepositTiers {
  deposit: number;
  nextTier: number;
  gapToNext: number;
  tiers: Array<{ tier: number; gap: number }>;
}

/** 押金流水行（deposit 缴纳 / deduct 扣除 / refund 退还；amount 恒正） */
export interface NightDepositTxn {
  id: string;
  type: string;
  amount: number;
  payOrderNo: string | null;
  remark: string;
  createdAt: string;
}

/** 押金详情（GET deposit）：余额 + 流水（时间倒序，上限 100） */
export interface NightDepositDetail {
  deposit: number;
  nextTier: number;
  gapToNext: number;
  txns: NightDepositTxn[];
}

/** 押金支付单发起返回（POST deposit/pay）：ND 单号 + JSAPI 支付参数 */
export interface NightDepositPayIntent {
  depositOrderId: string;
  outTradeNo: string;
  amount: number;
  targetTier: number;
  payParams: WechatPayParams;
}

/** 押金支付状态（GET deposit/pay-status 轮询：pending/paid/closed） */
export interface NightDepositPayStatus {
  outTradeNo: string;
  amount: number;
  status: string;
  paidAt: string | null;
}

/** 商品池行（GET stock/pool）：夜主档 + 本店楼栋行；attached=false 未配置不可备货 */
export interface NightPoolItem {
  barcode: string | null;
  categoryName: string;
  warehouseAvailable: number;
  canStock: boolean;
  unavailableReason: string;
  retailUnit: string;
  catalogProductId: string;
  name: string;
  image: string | null;
  price: number;
  status: string;
  attached: boolean;
  nightProductId: string | null;
  stock: number;
  onShelf: boolean;
  saleAllowed: boolean;
  stockValue: number;
}

/** 备货单商品行（快照） */
export interface NightStockOrderItem {
  receivedQuantity?: number;
  nightProductId?: string;
  catalogProductId: string;
  name: string;
  price: number;
  quantity: number;
}

/** 备货记录（GET stock/orders） */
export interface NightStockOrder {
  heldValue: number;
  reason: string;
  reviewedAt: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  id: string;
  items: NightStockOrderItem[];
  totalValue: number;
  status: string;
  createdAt: string;
}

/** 佣金/配送费三态金额汇总（分） */
export interface NightMoneyBucket {
  estimated: number;
  pending: number;
  settled: number;
}

/** 夜宵工作台（GET dashboard）：场次/营业态/押金/待接单/今日销售/库存货值 */
export interface NightDashboard {
  reservedValue: number;
  frozenValue: number;
  usedQuota: number;
  usableQuota: number;
  store: {
    id: string;
    status: string;
    buildingName: string;
    commissionRate: number;
  };
  campus: {
    nightEnabled: boolean;
    nightStartAt: string | null;
    nightEndAt: string | null;
  };
  inWindow: boolean;
  deposit: number;
  gapToNextTier: number;
  pendingOrders: number;
  todayOrders: number;
  todaySales: number;
  stockValue: number;
  commission: NightMoneyBucket;
  deliveryFee: NightMoneyBucket;
}

/** 本店商品行（GET products）：资料只读（价格/资料引夜主档，楼长不能改） */
export interface NightProduct {
  retailUnit: string;
  frozenStock: number;
  inventoryValue: number;
  inventoryVersion: number;
  pendingQuantity: number;
  id: string;
  catalogProductId: string;
  name: string;
  image: string | null;
  price: number;
  catalogStatus: string;
  stock: number;
  onShelf: boolean;
  saleAllowed: boolean;
  purchasable: boolean;
}

export interface NightInventoryReport {
  id: string;
  kind: string;
  status: string;
  reason: string;
  reviewReason: string;
  heldValue: number;
  photos: string[] | null;
  createdAt: string;
  reviewedAt: string | null;
  items: Array<{ nightProductId: string; name: string; quantity: number; delta: number; value: number; bookQuantity: number; countedQuantity?: number }>;
}
export interface NightInventoryTxn {
  id: string;
  type: string;
  delta: number;
  afterStock: number;
  remark: string;
  createdAt: string;
  product: { catalogProduct: { name: string } };
}

/** 夜宵订单商品快照行 */
export interface NightOrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

/** 夜宵订单地址快照（楼长视角含联系方式） */
export interface NightOrderAddress {
  buildingName: string;
  room: string;
  contactName: string;
  phone: string;
}

/** 夜宵订单（GET orders / orders/:id） */
export interface NightOrder {
  id: string;
  orderNo: string;
  status: string;
  statusText: string;
  items: NightOrderItem[];
  productAmount: number;
  couponDiscount: number;
  deliveryFee: number;
  payableAmount: number;
  commissionRate: number;
  address: NightOrderAddress;
  remark: string;
  timeline: Array<{
    proof?: { images: string[]; remark?: string };
    key: string;
    title: string;
    description: string;
    done: boolean;
    time?: string;
  }>;
  couponSnapshot: { name?: string; discount?: number } | null;
  businessDate: string;
  timeoutAt: string | null;
  createdAt: string;
  paidAt: string | null;
  completedAt: string | null;
  cancelReason: string | null;
  afterSaleStatus: string | null;
  store: { id: string; buildingName: string } | null;
}

/** 单单佣金明细（GET orders/:id/earning）：券后基数 × 比例 + 配送费 */
export interface NightOrderEarning {
  orderNo: string;
  productAmount: number;
  couponDiscount: number;
  commissionBase: number;
  commissionRate: number;
  commission: number;
  deliveryFee: number;
  total: number;
}

/** 佣金流水行（每单两条：commission 商品佣金 / deliveryFee 配送费） */
export interface NightCommissionTxn {
  id: string;
  orderNo: string;
  type: string;
  base: number | null;
  rate: number | null;
  amount: number;
  status: string;
  settleBatch: string | null;
  remark: string;
  createdAt: string;
}

/** 夜宵收入（GET income）：两列汇总 + 押金余额 + 佣金流水 */
export interface NightIncome {
  summary: { commission: NightMoneyBucket; deliveryFee: NightMoneyBucket };
  deposit: number;
  items: NightCommissionTxn[];
}

/** IKKTTP 楼长作战地图（复用后台口径）：整栋楼层三色格 */
export interface BattleFloor {
  floor: number;
  total: number;
  ordered: number;
  registered: number;
  fresh: number;
  coverageRate: number;
  rooms: Array<{
    roomId: string;
    roomNo: string;
    status: "ordered" | "registered" | "fresh";
    orderCount: number;
    userCount: number;
  }>;
}
export interface BattleMapData {
  building: { id: string; name: string };
  floors: BattleFloor[];
}
export interface BattleRoomDetail {
  room: { id: string; roomNo: string; floor: number };
  orderCount: number;
  users: Array<{
    userId: string;
    nickname: string;
    phone: string;
    orderCount: number;
    totalAmount: number;
    recentCount: number;
    highFrequency: boolean;
    registeredAt: string;
  }>;
}
