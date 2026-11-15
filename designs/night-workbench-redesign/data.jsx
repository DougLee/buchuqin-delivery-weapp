// 演示数据（字段与 nightApi 对齐）+ 派生 helpers
const D = {
  staff: { name: "方福宁", staffNo: "HG-D6", role: "楼长 · 西区9栋" },
  store: {
    buildingName: "西区9栋",
    campusName: "湖北工业大学",
    brand: "不出寝食社",
    status: "open",               // open | closed | preparing
    window: "22:00 - 02:00",
  },
  deposit: 500,
  stockValue: 125,
  quota: 375,
  productCount: 6,
  soldOutCount: 1,
  today: { gmv: "312.50", income: "47.80", orders: 18 },
  month: { gmv: "1240.00", income: "186.20" },
  pendingOrders: [
    { id: "o1", no: "YX202611060012", amt: "13.50", goods: "测试夜宵泡面 ×2 · 火腿肠 ×1",
      addr: "西区9栋 502", contact: "王同学 138****2211", cd: "04:58", seq: "01" },
    { id: "o2", no: "YX202611060013", amt: "5.00", goods: "测试夜宵泡面 ×1",
      addr: "西区9栋 302", contact: "李同学 137****0815", cd: "07:12", seq: "02" },
  ],
  deliveringOrders: [
    { id: "o3", no: "YX202611060008", amt: "7.00", goods: "可口可乐 ×2",
      addr: "西区9栋 204", contact: "张同学 150****6633", seq: "01" },
  ],
  doneTotal: 15,
  latestPending: { no: "YX202611060012", amt: "13.50", goods: "泡面 ×2 · 火腿肠 ×1", addr: "西区9栋 502", cd: "04:58", count: 3 },
  weekBars: [
    { h: 30, hot: false }, { h: 55, hot: true }, { h: 40, hot: false },
    { h: 88, hot: true }, { h: 35, hot: false }, { h: 66, hot: true }, { h: 48, hot: false },
  ],
  weekTotal: "23 单 · 佣金 ¥32.40 + 配送费 ¥18.00",
  incomeMonth: "186.20",
  breakdown: { commission: "32.40", deliveryFee: "18.00", refund: "-1.20" },
  incomeRecords: [
    { t: "订单 YX…50001", s: "11-05 23:12 · 佣金 ¥2.70 + 配送费 ¥2.00", amt: "+4.70" },
    { t: "订单 YX…50002", s: "11-05 23:40 · 佣金 ¥1.00 + 配送费 ¥2.00", amt: "+3.00" },
    { t: "退款冲回 YX…49988", s: "11-04 21:05 · 券后佣金冲回", amt: "-1.20", neg: true },
    { t: "订单 YX…49971", s: "11-04 22:18 · 佣金 ¥3.10 + 配送费 ¥2.00", amt: "+5.10" },
  ],
  depositLedger: [
    { t: "缴纳押金", s: "11-05 22:14 · 微信支付", amt: "+500", pos: true },
    { t: "违规扣除", s: "11-01 09:30 · 平台判责", amt: "-50", pos: false },
  ],
  tiers: [
    { tv: "补缴至 ¥1000", td: "本次支付 ¥500 · 额度升至 ¥914", sel: true },
    { tv: "补缴至 ¥1500", td: "本次支付 ¥1000 · 额度升至 ¥1414", sel: false },
    { tv: "补缴至 ¥2000", td: "本次支付 ¥1500 · 额度升至 ¥1914", sel: false },
  ],
  stockPool: [
    { name: "测试夜宵泡面", price: "5.00", stock: 2, qty: 10 },
    { name: "火腿肠", price: "2.50", stock: 0, qty: 20 },
    { name: "可口可乐 330ml", price: "3.50", stock: 4, qty: 0 },
  ],
  confirm: { value: "100.00", after: "225.00", deposit: "500.00", quota: "275.00", items: "2 种 · 30 件" },
  stockOrders: [
    { no: "BH20261105002", s: "11-05 22:30 · 泡面 ×20 · 火腿肠 ×20 · 货值 ¥150.00", tag: "已入库", ok: true },
    { no: "BH20261104001", s: "11-04 21:50 · 可乐 ×10 · 货值 ¥35.00", tag: "已入库", ok: true },
  ],
  products: [
    { name: "测试夜宵泡面", price: "5.00", stock: 2, on: true, locked: false },
    { name: "火腿肠", price: "2.50", stock: 0, on: true, locked: false },
    { name: "可口可乐 330ml", price: "3.50", stock: 4, on: true, locked: false },
    { name: "老坛酸菜面", price: "6.00", stock: 3, on: false, locked: true },
    { name: "王老吉", price: "4.00", stock: 5, on: true, locked: false },
    { name: "乐事薯片", price: "4.50", stock: 6, on: true, locked: false },
  ],
  detail: {
    no: "YX202611060012", amt: "13.50", cd: "04:58",
    goods: [
      { n: "测试夜宵泡面", q: 2, p: "10.00" },
      { n: "火腿肠", q: 1, p: "2.50" },
    ],
    addr: "西区9栋 502", contact: "王同学 138****2211",
    remark: "放门口即可，谢谢",
  },
};

// helpers
const yuan = (v) => `¥${v}`;
const fen = (f) => `¥${Number(f).toFixed(2)}`;

Object.assign(window, { D, yuan, fen });
