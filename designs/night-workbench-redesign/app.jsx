// App：方案切换（A 凝夜精修 / B 夜航仪表）+ tab 导航 + 二级页栈
const { useState } = React;

function App() {
  const [plan, setPlan] = useState("a");          // a=凝夜精修 b=夜航仪表
  const [tab, setTab] = useState("hub");          // 夜宵四 tab
  const [drill, setDrill] = useState(null);       // 二级页 key（覆盖 tab 内容）

  const go = (key) => setDrill(key);
  const back = () => setDrill(null);
  const switchTab = (key) => { setDrill(null); setTab(key); };

  const screen = (() => {
    if (drill === "order-detail") return <OrderDetailScreen back={back} />;
    if (drill === "deposit") return <DepositScreen back={back} />;
    if (drill === "stock") return <StockScreen back={back} />;
    if (drill === "stock-orders") return <StockOrdersScreen back={back} />;
    if (drill === "products") return <ProductsScreen back={back} />;
    if (tab === "hub") return <HubScreen go={go} />;
    if (tab === "orders") return <OrdersScreen go={go} />;
    if (tab === "income") return <IncomeScreen />;
    if (tab === "my") return <MyScreen go={go} />;
    return null;
  })();

  const isTabScreen = !drill;

  return (
    <React.Fragment>
      <div className="topbar">
        <span className="tb-title">夜宵店长工作台 · 重设计</span>
        <div className="plan-switch">
          <button className={plan === "a" ? "on-a" : ""} onClick={() => setPlan("a")}>方案 A · 凝夜精修</button>
          <button className={plan === "b" ? "on-b" : ""} onClick={() => setPlan("b")}>方案 B · 夜航仪表</button>
        </div>
      </div>
      <div className="hint">可交互：底部 tab 切换 · 列表卡片点进详情 · 「我的」分组进押金/进货/商品 · 右上角切换方案</div>

      <div data-plan={plan}>
        <IOSDevice dark width={390} height={820}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
            <div className="screens">
              <div className="page-scroll" key={(drill || "") + tab}>
                {screen}
              </div>
            </div>
            {isTabScreen ? <NightTabBarFixed tab={tab} go={switchTab} /> : null}
          </div>
        </IOSDevice>
      </div>
      <div className="hint">实施映射：本原型 CSS 变量即小程序 night.scss token；结构即页面组件层级</div>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
