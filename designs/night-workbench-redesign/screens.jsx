// 九个屏：hub / orders / order-detail / income / my / deposit / stock / stock-orders / products
// 全部 props 驱动（data + go/back），无内部路由状态

/* ---------- 夜宵 tabbar（店/单/收/我） ---------- */
function NightTabBarFixed({ tab, go }) {
  const items = [
    { key: "hub", label: "夜宵店", ic: I.store },
    { key: "orders", label: "订单", ic: I.bag, badge: 2 },
    { key: "income", label: "收入", ic: I.coin },
    { key: "my", label: "我的", ic: I.user },
  ];
  return (
    <div className="ntabbar">
      {items.map((it) => (
        <div key={it.key} className={"ntab" + (tab === it.key ? " on" : "")} onClick={() => go(it.key)}>
          {it.ic("currentColor")}
          {it.badge ? <span className="nb">{it.badge}</span> : null}
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- 通用页头（二级页） ---------- */
function PageHead({ title, back }) {
  return (
    <div className="pagehead">
      <div className="back" onClick={back}><I.back /></div>
      <span className="pt">{title}</span>
    </div>
  );
}

/* ---------- ① 夜宵工作台（Hub） ---------- */
function HubScreen({ go }) {
  const open = D.store.status === "open";
  return (
    <div className="npage" data-screen-label="夜宵工作台">
      <div className="gutter">
        <div className="hero">
          <div className="hero-top">
            <div>
              <span className="eyebrow">TONIGHT · 夜宵经营</span>
              <span className="hello">晚上好，{D.staff.name}</span>
            </div>
            <span className={"badge " + (open ? "open" : "closed")}>
              <span className="bd"></span>{open ? "营业中" : "未开业"}
            </span>
          </div>
          <div className="hero-store">{D.store.campusName} · {D.store.brand} · 场次 {D.store.window}</div>
          <div className="metric-row">
            <span className="metric-number">{D.pendingOrders.length}</span>
            <span className="metric-unit">单待接单</span>
          </div>
          <div className="route">
            <div className="pt done"></div><div className="ln done"></div>
            <div className="pt active"></div><div className="ln"></div>
            <div className="pt"></div>
          </div>
          <div className="route-label"><span>接单</span><span>配送中</span><span>送达完成</span></div>
        </div>

        <div className="cta-row">
          <div className="btn-open gold" onClick={() => go("orders")}>
            {I.arrow("#3d2c00", 16)} 开店营业
          </div>
          <div className="btn-ghost-sq">{I.moon("currentColor", 18)}</div>
        </div>

        <div className="stats4">
          <div className="g"><span className="sv">{yuan(D.today.gmv)}</span><span className="sl">今日夜宵销售额</span></div>
          <div className="g"><span className="sv">{yuan(D.today.income)}</span><span className="sl">今日夜宵收入</span></div>
          <div className="g"><span className="sv">{yuan(D.month.gmv)}</span><span className="sl">本月夜宵销售额</span></div>
          <div className="g"><span className="sv">{yuan(D.month.income)}</span><span className="sl">本月夜宵收入</span></div>
        </div>

        <div className="sect">NEXT ORDERS · 最新待接单 <span className="link-chip" onClick={() => go("orders")}>全部订单 ›</span></div>
        {D.latestPending ? (
          <div className="ocard hot" onClick={() => go("orders")}>
            <div className="oc-top">
              <span className="oc-seq">{D.latestPending.seq}</span>
              <span className="oc-no">{D.latestPending.no}</span>
              <span className="oc-amt">{yuan(D.latestPending.amt)}</span>
            </div>
            <div className="oc-goods">{D.latestPending.goods}</div>
            <div className="oc-addr">{I.pin("currentColor", 13)} {D.latestPending.addr}</div>
            <div className="oc-foot">
              <span className="cd">{I.clock("currentColor", 12)} {D.latestPending.cd}</span>
              <div className="btn-acc" onClick={(e) => { e.stopPropagation(); go("orders"); }}>接 单</div>
            </div>
          </div>
        ) : (
          <div className="ocard"><div className="empty"><span className="em-t">暂无待接订单</span>学生下单后会自动出现在这里</div></div>
        )}

        <div className="sect">经营概览</div>
        <div className="krow" onClick={() => go("products")}>
          <span className="kk">库存货值</span>
          <span className="kv">{yuan(D.stockValue)} · <b>{D.productCount} 种商品</b>{D.soldOutCount ? `（${D.soldOutCount} 种售罄）` : ""}</span>
          <I.chev />
        </div>
        <div className="krow" onClick={() => go("deposit")}>
          <span className="kk">可进货额度</span>
          <span className="kv"><b>{yuan(D.quota)}</b> · 押金余额 {yuan(D.deposit)}</span>
          <I.chev />
        </div>
      </div>
    </div>
  );
}

/* ---------- ② 夜宵订单 ---------- */
function OrdersScreen({ go }) {
  const [seg, setSeg] = React.useState("pending");
  const list = seg === "pending" ? D.pendingOrders : seg === "delivering" ? D.deliveringOrders : [];
  return (
    <div className="npage" data-screen-label="夜宵订单">
      <div className="gutter">
        <div className="overview card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 17px", borderRadius: "var(--radius)" }}>
          <div>
            <div className="kicker">NIGHT ORDERS</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: "var(--text)", marginTop: 4 }}>夜宵订单</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>按时效排序，优先处理即将超时订单</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: 32, fontWeight: 900, color: "var(--text)" }} className="num">{D.pendingOrders.length + D.deliveringOrders.length}</span>
            <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 700, marginLeft: 3 }}>单</span>
          </div>
        </div>
      </div>
      <div className="seg-scroll">
        <div className={"seg" + (seg === "pending" ? " on" : "")} onClick={() => setSeg("pending")}>待接单 {D.pendingOrders.length}</div>
        <div className={"seg" + (seg === "delivering" ? " on" : "")} onClick={() => setSeg("delivering")}>配送中 {D.deliveringOrders.length}</div>
        <div className={"seg" + (seg === "done" ? " on" : "")} onClick={() => setSeg("done")}>已完成 15</div>
      </div>
      <div className="gutter">
        {list.length === 0 ? (
          <div className="ocard"><div className="empty"><span className="em-t">当前分段没有订单</span>学生下单后会自动出现在这里</div></div>
        ) : list.map((o) => (
          <div className="ocard" key={o.id} onClick={() => go("order-detail")}>
            <div className="oc-top">
              <span className="oc-seq">{o.seq}</span>
              <span className="oc-no">{o.no}</span>
              <span className="oc-amt">{yuan(o.amt)}</span>
            </div>
            <div className="oc-goods">{o.goods}</div>
            <div className="oc-addr">{I.pin("currentColor", 13)} {o.addr} · {o.contact}</div>
            <div className="oc-foot">
              {o.cd ? <span className="cd">{I.clock("currentColor", 12)} {o.cd} 后超时</span> : <span className="cd" style={{ color: "var(--text-3)", background: "var(--card-2)" }}>送达后拍照上传凭证</span>}
              <div className="btn-acc" onClick={(e) => { e.stopPropagation(); go("order-detail"); }}>
                {seg === "pending" ? "接 单" : seg === "delivering" ? "送达凭证" : "详情"}
              </div>
            </div>
          </div>
        ))}
        {seg === "done" ? <div className="empty">已完结订单保留原经营者归属，可随时回查</div> : null}
      </div>
    </div>
  );
}

/* ---------- ③ 订单详情 ---------- */
function OrderDetailScreen({ back }) {
  const o = D.detail;
  return (
    <div className="npage" data-screen-label="夜宵订单详情">
      <PageHead title="订单详情" back={back} />
      <div className="gutter">
        <div className="dv-store">
          <div className="dv-ic">{I.moon("currentColor", 18)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "var(--text)" }}>西区9栋 · 夜宵店</div>
            <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 3 }}>湖北工业大学 · 场次 22:00 - 02:00</div>
          </div>
          <span className="cd">{I.clock("currentColor", 12)} {o.cd} 后超时</span>
        </div>
        <div className="dv-sec">商品 · {yuan(o.amt)}</div>
        <div className="card" style={{ padding: "6px 16px" }}>
          {o.goods.map((g) => (
            <div className="dv-item" key={g.n}><span>{g.n} ×{g.q}</span><span className="n">{yuan(g.p)}</span></div>
          ))}
        </div>
        <div className="dv-sec">配送信息</div>
        <div className="card" style={{ padding: "10px 16px" }}>
          <div className="dv-item"><span>收货地址</span><span className="n">{I.pin("currentColor", 12)} {o.addr}</span></div>
          <div className="dv-item"><span>联系人</span><span className="n">{o.contact}</span></div>
          <div className="dv-item"><span>备注</span><span className="n" style={{ fontWeight: 600 }}>{o.remark}</span></div>
        </div>
        <div className="dv-sec">送达凭证 · 1~3 张</div>
        <div className="dv-proofs">
          <div className="dv-proof filled">{I.cam("currentColor", 20)}<span>凭证 1</span></div>
          <div className="dv-proof">{I.cam("currentColor", 18)}<span>添加</span></div>
          <div className="dv-proof">{I.cam("currentColor", 18)}<span>添加</span></div>
        </div>
        <div className="btn-deliver">确认送达 · 订单完成</div>
        <div style={{ fontSize: 10.5, color: "var(--text-3)", textAlign: "center", marginTop: 9 }}>送达直接完成订单，凭证与时间将同步给学生</div>
      </div>
    </div>
  );
}

/* ---------- ④ 夜宵收入 ---------- */
function IncomeScreen() {
  return (
    <div className="npage" data-screen-label="夜宵收入">
      <div className="gutter">
        <div className="income-hero">
          <div className="ih-top">
            <div className="ih-label">NIGHT INCOME · 本月夜宵收入 · 待结算</div>
            <span className="ih-month">2026-11 ▾</span>
          </div>
          <div className="ih-amount"><small>¥</small>{D.incomeMonth}</div>
          <div className="trend">
            {D.weekBars.map((b, i) => (
              <div key={i} className={"bar" + (b.hot ? " hot" : "")} style={{ height: b.h + "%" }}></div>
            ))}
          </div>
          <div className="trend-tx">近 7 日 {D.weekTotal}</div>
        </div>
        <div className="breakdown">
          <div className="bd-item"><div className="bv">{yuan(D.breakdown.commission)}</div><div className="bk">商品佣金</div></div>
          <div className="bd-item"><div className="bv">{yuan(D.breakdown.deliveryFee)}</div><div className="bk">配送费收入</div></div>
          <div className="bd-item"><div className="bv neg">{D.breakdown.refund}</div><div className="bk">退款冲回</div></div>
        </div>
        <div className="sect">DETAILS · 夜宵流水 <span>共 {D.incomeRecords.length} 笔</span></div>
        <div className="card" style={{ padding: "4px 15px" }}>
          {D.incomeRecords.map((r) => (
            <div className="rec" key={r.t}>
              <div className="rec-ic">{I.coin("currentColor", 16)}</div>
              <div style={{ minWidth: 0 }}>
                <div className="rec-t">{r.t}</div>
                <div className="rec-s">{r.s}</div>
              </div>
              <div className={"rec-amt" + (r.neg ? " neg" : "")}>{r.amt}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text-3)", textAlign: "center", marginTop: 12 }}>押金不计入收入 · 周账单由平台结算后转入已结算</div>
      </div>
    </div>
  );
}

/* ---------- ⑤ 我的（深色变体 + 夜宵经营分组） ---------- */
function MyScreen({ go }) {
  return (
    <div className="npage" data-screen-label="我的">
      <div className="pf-hero">
        <div className="pf-ava">方</div>
        <div>
          <div className="pf-name">{D.staff.name}</div>
          <div className="pf-sub">{D.staff.role} · 工号 {D.staff.staffNo}</div>
        </div>
        <span className="chip" style={{ marginLeft: "auto", background: "rgba(255,215,94,.14)", color: "var(--gold)" }}>营业中</span>
      </div>
      <div className="pf-stats">
        <div className="g"><span className="sv">50%</span><span className="sl">准时率</span></div>
        <div className="g"><span className="sv">0%</span><span className="sl">凭证完整率</span></div>
        <div className="g"><span className="sv">0</span><span className="sl">今日完成</span></div>
        <div className="g"><span className="sv">18</span><span className="sl">夜宵今日单量</span></div>
      </div>
      <div className="ngroup">
        <div className="ng-head">
          <div className="ng-moon"></div>
          <div className="ng-title">夜宵经营 · {D.store.buildingName}店</div>
          <span className="chip" style={{ background: "rgba(255,215,94,.14)", color: "var(--gold)" }}>营业中</span>
        </div>
        <div className="ng-row" onClick={() => go("deposit")}>
          <div className="ng-ic" style={{ background: "rgba(255,215,94,.12)", color: "var(--gold)" }}>{I.wallet("currentColor", 17)}</div>
          <div><div className="ng-t">押金</div><div className="ng-s">{yuan(D.deposit)} · 可进货额度 {yuan(D.quota)}</div></div>
          <I.chev className="ng-go" />
        </div>
        <div className="ng-row" onClick={() => go("stock")}>
          <div className="ng-ic" style={{ background: "rgba(74,222,128,.1)", color: "var(--green)" }}>{I.box("currentColor", 17)}</div>
          <div><div className="ng-t">进货备货</div><div className="ng-s">库存货值 {yuan(D.stockValue)} · {D.productCount} 种商品</div></div>
          <I.chev className="ng-go" />
        </div>
        <div className="ng-row" onClick={() => go("products")}>
          <div className="ng-ic" style={{ background: "rgba(96,165,250,.1)", color: "#93c5fd" }}>{I.list("currentColor", 17)}</div>
          <div><div className="ng-t">商品管理</div><div className="ng-s">上下架 · 停售以后台为准</div></div>
          <I.chev className="ng-go" />
        </div>
        <div className="ng-row" onClick={() => go("stock-orders")}>
          <div className="ng-ic ic-b" style={{ background: "var(--card-2)", color: "var(--text-2)" }}>{I.list("currentColor", 17)}</div>
          <div><div className="ng-t">备货记录</div><div className="ng-s">入库单与货值快照</div></div>
          <I.chev className="ng-go" />
        </div>
      </div>
      <div className="ngroup">
        <div className="ng-row"><div className="ng-t">我的白天收入</div><I.chev className="ng-go" /></div>
        <div className="ng-row" style={{ borderTop: ".5px solid var(--hairline)" }}><div className="ng-t">账号与设置</div><I.chev className="ng-go" /></div>
      </div>
    </div>
  );
}

/* ---------- ⑥ 押金 ---------- */
function DepositScreen({ back }) {
  return (
    <div className="npage" data-screen-label="押金">
      <PageHead title="经营押金" back={back} />
      <div className="gutter">
        <div className="dep-hero">
          <div className="dep-bl">有效押金余额</div>
          <div className="dep-bv"><small>¥</small>{D.deposit}</div>
          <div className="dep-sub">库存货值 {yuan(D.stockValue)} · 剩余可进货额度 <b>{yuan(D.quota)}</b></div>
        </div>
        <div className="sect">选择缴纳档位 <span>500 元一档</span></div>
        {D.tiers.map((t) => (
          <div className={"tier" + (t.sel ? " sel" : "")} key={t.tv}>
            <div><div className="tv">{t.tv}</div><div className="td">{t.td}</div></div>
            <div className="radio"></div>
          </div>
        ))}
        <div className="btn-open gold" style={{ marginTop: 16 }}>微信支付 ¥500</div>
        <div style={{ fontSize: 10.5, color: "var(--text-3)", textAlign: "center", marginTop: 10, lineHeight: 1.7 }}>
          押金用于保障进货额度，不计入收入<br />退出经营时按规则清算退还
        </div>
        <div className="sect">流水 <span>全部</span></div>
        <div className="ledger">
          {D.depositLedger.map((l) => (
            <div className="rec" key={l.t}>
              <div className="rec-ic" style={{ background: l.pos ? "rgba(74,222,128,.1)" : "rgba(251,191,36,.1)", color: l.pos ? "var(--green)" : "var(--warn)" }}>
                {l.pos ? I.coin("currentColor", 16) : I.wallet("currentColor", 16)}
              </div>
              <div><div className="rec-t">{l.t}</div><div className="rec-s">{l.s}</div></div>
              <div className="rec-amt" style={{ color: l.pos ? "var(--green)" : "var(--warn)" }}>{l.amt}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- ⑦ 进货 ---------- */
function StockScreen({ back }) {
  return (
    <div className="npage" data-screen-label="进货">
      <PageHead title="进货备货" back={back} />
      <div className="gutter">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: "var(--text)" }}>可选商品池</span>
          <span className="chip" style={{ background: "rgba(74,222,128,.1)", color: "var(--green)", marginLeft: "auto" }}>支付即入库</span>
        </div>
        {D.stockPool.map((p) => (
          <div className="stock-line" key={p.name}>
            <div className="sl-img">{p.name.includes("面") ? I.boxline("currentColor") : I.cartline("currentColor")}</div>
            <div style={{ flex: 1 }}>
              <div className="sl-name">{p.name}</div>
              <div className="sl-sub">夜宵售价 {yuan(p.price)} · 现库存 {p.stock}</div>
            </div>
            <div className="counter"><button>−</button><div className="n">{p.qty}</div><button>＋</button></div>
          </div>
        ))}
        <div className="confirm-card" style={{ marginTop: 14 }}>
          <div className="crow"><span className="k">本次进货货值</span><span className="v">{yuan(D.confirm.value)}</span></div>
          <div className="crow"><span className="k">入库后库存货值</span><span className="v">{yuan(D.confirm.after)}</span></div>
          <div className="crow"><span className="k">有效押金</span><span className="v">{yuan(D.confirm.deposit)}</span></div>
          <div className="crow"><span className="k">进货后剩余额度</span><span className="v">{yuan(D.confirm.quota)}</span></div>
          <div className="crow hl"><span className="k">确认入库</span><span className="v">{D.confirm.items} · {yuan(D.confirm.value)}</span></div>
        </div>
        <div className="btn-open gold" style={{ marginTop: 14, height: 50 }}>确认进货 · 即时入库</div>
        <div style={{ fontSize: 10.5, color: "var(--text-3)", textAlign: "center", marginTop: 10 }}>确认成功商品立即上架可售 · 无需审批 · 重复请求只入库一次</div>
      </div>
    </div>
  );
}

/* ---------- ⑧ 备货记录 ---------- */
function StockOrdersScreen({ back }) {
  return (
    <div className="npage" data-screen-label="备货记录">
      <PageHead title="备货记录" back={back} />
      <div className="gutter">
        {D.stockOrders.map((s) => (
          <div className="so-card" key={s.no}>
            <div className="so-top">
              <span className="so-no">{s.no}</span>
              <span className={"chip so-tag " + (s.ok ? "" : "")} style={s.ok ? { background: "rgba(74,222,128,.1)", color: "var(--green)" } : {}}>{s.tag}</span>
            </div>
            <div className="so-meta">{s.s}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- ⑨ 商品管理 ---------- */
function ProductsScreen({ back }) {
  return (
    <div className="npage" data-screen-label="商品管理">
      <PageHead title="本店商品" back={back} />
      <div className="gutter">
        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 12, lineHeight: 1.7 }}>
          上下架即时生效 · 商品资料/价格/佣金由平台维护，后台停售不可覆盖
        </div>
        {D.products.map((p) => (
          <div className="pd-row" key={p.name}>
            <div className="sl-img" style={{ width: 50, height: 50, borderRadius: 12 }}>
              {p.name.includes("面") ? I.boxline("currentColor", 22) : I.cartline("currentColor", 22)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span className="pd-name">{p.name}</span>
                {p.locked ? <span className="pd-tag lock">后台停售</span> : null}
                {p.stock <= 0 && !p.locked ? <span className="pd-tag off">售罄</span> : null}
              </div>
              <div className="pd-sub">夜宵售价 {yuan(p.price)} · 库存 {p.stock}</div>
            </div>
            <div className={"switch" + (p.on && !p.locked ? " on" : "")}></div>
          </div>
        ))}
        {D.products.some((p) => p.stock <= 0) ? (
          <div className="krow" style={{ marginTop: 14 }}>
            <span className="kk">有商品库存为 0</span>
            <span className="kv"><b>去备货 ›</b></span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

Object.assign(window, {
  HubScreen, OrdersScreen, OrderDetailScreen, IncomeScreen, MyScreen,
  DepositScreen, StockScreen, StockOrdersScreen, ProductsScreen,
  PageHead, NightTabBarFixed,
});
