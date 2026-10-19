# 履约端多小程序构建

同一套代码通过构建时注入 AppID 生成互相隔离的微信小程序目录。AppSecret 不进入前端代码，统一在管理后台“组织管理”中保存。

## 默认不出寝履约端

```bash
pnpm dev:mp-weixin
pnpm build:mp-weixin
```

输出分别位于 `dist/dev/mp-weixin-buchuqin` 和 `dist/build/mp-weixin-buchuqin`。

## 新增组织履约端

以品牌键 `xiaoman` 为例：

```bash
export DELIVERY_WEAPP_XIAOMAN_APP_ID=wx0123456789abcdef
export DELIVERY_WEAPP_XIAOMAN_NAME=小满优选履约端
pnpm dev:mp-weixin:brand xiaoman
pnpm build:mp-weixin:brand xiaoman
```

每个品牌输出到独立目录 `dist/{dev|build}/mp-weixin-<品牌键>`，可以分别导入微信开发者工具。

同时在管理后台对应组织填写：

1. 履约端小程序 AppID；
2. 履约端小程序 Secret；
3. 履约端派单订阅模板 ID。

服务端以履约端 AppID 识别组织，并校验员工所属校区必须属于该组织；任务、抢单和订单操作继续以员工绑定的单一校区过滤，因此组织 B 的履约端无法读取或操作组织 A 的订单。
