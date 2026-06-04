# 本地 Windows 部署

当前项目按单机 Windows 部署整理：

- Windows 本机运行 Node.js 服务。
- Windows 本机登录公司零信任。
- 本地后端直接访问公司内网 AI 接口。
- 不再需要 Docker、NAS 或独立 AI 跳板代理。

## 启动

1. 安装 Node.js LTS。
2. 首次部署在项目根目录执行 `npm install`。如果只使用主系统，服务可以先启动；如果要使用后台 ZIP 热升级，必须先执行这一步。
3. 生产环境双击 `启动生产守护服务.bat`。它会自动看护服务，后台应用代码更新后会自动拉起新版本。
4. `启动本地服务.bat` 已废弃，不再作为生产启动方式；本地临时调试可执行 `npm start`。
5. 打开：

```text
http://127.0.0.1:7654/
```

项目官网页：

```text
http://127.0.0.1:7654/official/
```

如果你已经有 PM2，也可以继续用 PM2 守护进程：

```bash
SUPERZXY_ADMIN_PASSWORD=请改成强密码 pm2 start csxt/server/server.mjs --name csxt-7654
```

## 更新参数库

替换 `csxt/data/database.xlsx` 后，重新启动本地服务即可。服务启动时会自动编译参数库并生成 `csxt/data/generated/` 下的运行文件。
`csxt/data/generated/` 是本地生成目录，不需要手工维护或提交。
也可以登录后台上传 Excel 参数库，后台会先编译校验，成功才替换正式库，并自动备份旧库到 `csxt/data/backups/`。

## AI 配置与规则

AI 配置文件：

```text
csxt/server/ai-config.local.json
```

endpoint 直接指向公司内网 AI 地址即可。使用 AI 功能前，请确认 Windows 已登录零信任并能访问该域名。
这个文件属于本机配置，已在 `.gitignore` 中忽略；如果旧版本已经跟踪过该文件，提交前应从 git 索引中移除，但保留本地文件继续使用。

后台密码可以通过环境变量设置：

```bash
SUPERZXY_ADMIN_PASSWORD=请改成强密码
```

也可以写入 `csxt/server/ai-config.local.json`：

```json
{
  "admin": {
    "password": "请改成强密码"
  }
}
```

## SuperZXY 后台

```text
http://127.0.0.1:7654/superzxy
```

后台和主系统共用同一个 Node 服务、同一个 7654 端口。后台能力包括：

- 查看前台反馈建议，数据保存在 `csxt/data/feedback/feedback.jsonl`，支持 CSV 导出。
- 上传 `.xlsx/.xlsm/.xls` 参数库，服务端编译通过后自动替换并刷新运行中的参数目录。
- 上传代码 ZIP 包。ZIP 只能包含 `csxt/public/`、`csxt/admin/`、`csxt/server/`、`README.md`、`package.json`、`package-lock.json`。
- ZIP 必须包含 `csxt/public/index.html`、`csxt/server/server.mjs`、`csxt/server/admin.mjs`；如果包含 `csxt/admin/`，必须包含 `csxt/admin/index.html`。
- ZIP 禁止包含 `csxt/data/`、`csxt/server/ai-config.local.json`、`node_modules/`、反馈、备份、`启动本地服务.bat`、`启动生产守护服务.bat`。
- 应用代码升级前会先做上传预检、服务端语法检查和影子服务健康检查。影子服务会在本机临时端口启动，确认 `/`、`/api/database`、`/superzxy` 正常后才切换正式代码。
- 应用代码升级前自动备份当前代码到 `csxt/data/backups/code/`。只有使用 `启动生产守护服务.bat` 或 PM2 启动时才允许后台应用代码升级；普通 `node` 直接启动会被拒绝，避免服务下线。
- 可选择最近的代码备份回滚并重启。

## 后台升级包打包规则

后续所有升级包必须严格遵守根目录 `AGENTS.md` 中的“远程升级包强制规格”。后台会按同一套规则校验，坏包只会停留在 staging，不会进入正式代码目录。

热升级不负责安装新 npm 依赖。如果代码新增依赖，需要先做一次全量离线部署，把 `package-lock.json` 和 `node_modules` 在服务器上准备好，再继续使用后台升级。

## 移动端 UI 维护

主系统仍为原生 HTML/CSS/JS，不使用 Vue、React、Angular、Svelte 或构建工具。移动端样式已按 `@layer` 建立结构化底座，后续修改请先阅读：

- `docs/UI_SPEC.md`
- `docs/CODEX_RULES.md`
- `docs/MOBILE_REFACTOR_REPORT.md`

新增移动端卡片、按钮、标签和页面布局时，应使用 `ui-card`、`ui-button`、`ui-badge`、`ui-tag`、`page-container`、`page-section` 等统一结构，不要继续在 CSS 末尾追加无归属补丁。

## 服务器部署注意

反馈建议不是纯前端功能，页面会请求后端接口：

```text
POST /api/feedback
```

如果部署到服务器后反馈不可用，请确认：

1. 服务器运行的是 `node csxt/server/server.mjs`，不是只把 `csxt/public/` 当静态站点发布。
2. Nginx 或网关需要把 `/api/` 转发到 Node 服务，例如本机 `7654` 端口。
3. 反馈现在写入本地 `csxt/data/feedback/feedback.jsonl`，不再依赖服务器访问企业微信 webhook。

报价单解析后的 AI 规则统一在 FastGPT 工作流中维护。本地不保存报价产品规则、第一条基础参数规则、参数选择规则或工作流提示词正文，只负责拆单、并发调用、接收 JSON 结果和页面展示。
