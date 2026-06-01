# 项目规则

本文档是本项目的维护入口。后续无论人工修改、AI 修改、生成升级包，均必须先阅读本文件。

## 项目定位

- 项目名称：AI 参数系统。
- 服务端口：生产默认使用 `7654`。
- 主系统入口：`/`。
- 后台入口：`/superzxy`。
- 官网展示页入口：`/official/`。
- 技术形态：无构建工具的 Node.js + 原生 HTML/CSS/JS，适合离线服务器直接部署。
- 生产启动方式：`启动生产守护服务.bat` 或 PM2。
- 已废弃启动方式：`启动本地服务.bat`，不得恢复为生产启动方式，也不得进入升级包。

## 远程升级包强制规格

后台远程升级是生产环境后续代码发布的主通道。任何升级包都必须遵守以下规则：

- ZIP 只能包含这些路径：`csxt/public/`、`csxt/admin/`、`csxt/server/`、`README.md`、`package.json`、`package-lock.json`。
- ZIP 必须包含：`csxt/public/index.html`、`csxt/server/server.mjs`、`csxt/server/admin.mjs`。
- 如果 ZIP 包含 `csxt/admin/`，必须包含 `csxt/admin/index.html`。
- ZIP 禁止包含：`csxt/data/`、`csxt/server/ai-config.local.json`、`node_modules/`、反馈文件、备份文件、`启动本地服务.bat`、`启动生产守护服务.bat`。
- 新增 npm 依赖不能走后台热升级；必须先做一次全量离线部署并确认 `node_modules` 已就绪。
- 生产环境必须使用 `启动生产守护服务.bat` 或 PM2。
- 后台应用更新前必须通过上传预检、服务端语法检查、影子服务健康检查。任一步失败都不得替换正式代码。
- 升级包不能修改业务数据、AI 本地配置、反馈记录和备份记录。

## 根目录文件

| 路径 | 作用 | 是否保留 | 升级包 |
| --- | --- | --- | --- |
| `AGENTS.md` | 项目规则、文件地图、升级约束。 | 必须保留 | 不进热升级包，随全量部署保留 |
| `README.md` | 部署、启动、后台、升级和使用说明。 | 必须保留 | 允许 |
| `package.json` | Node 项目描述、启动脚本、依赖声明。当前依赖 `adm-zip`。 | 必须保留 | 允许 |
| `package-lock.json` | 锁定离线部署依赖版本。 | 必须保留 | 允许 |
| `.gitignore` | 排除密钥、本地运行数据、缓存、依赖目录。 | 必须保留 | 不进热升级包 |
| `启动生产守护服务.bat` | Windows 生产守护启动脚本，用于启动 `csxt/server/supervisor.mjs`。 | 生产保留 | 禁止 |
| `.DS_Store` | macOS 系统缓存文件。 | 可删除 | 禁止 |
| `node_modules/` | 本机依赖目录，当前主要需要 `adm-zip`。 | 生产需存在或可重新安装 | 禁止 |
| `update-packages/` | 历史升级包存档。运行时不读取。 | 可归档或删除 | 禁止 |
| `csxt-product-promo/` | 宣传视频/演示页面素材，与主系统无运行依赖。 | 按需保留 | 禁止 |

## 主系统前端文件

| 路径 | 作用 | 是否保留 | 升级包 |
| --- | --- | --- | --- |
| `csxt/public/index.html` | 主系统 HTML 入口，加载 CSS 与 JS。 | 必须保留 | 必须 |
| `csxt/public/css/app.css` | 主系统全部样式，包含 PC、手机端、弹窗、夜间模式、官网入口相关样式。 | 必须保留 | 允许 |
| `csxt/public/js/app.js` | 主系统核心逻辑：产品选择、参数选择、编辑、预览、AI 改写、导入导出、缓存、虚拟列表等。 | 必须保留 | 允许 |
| `csxt/public/js/mobile.js` | 手机端导航、产品抽屉、更多菜单、手机工作流状态。 | 必须保留 | 允许 |
| `csxt/public/js/quote-parser.js` | 报价单识别前端逻辑，负责报价单上传后的结构化解析和 AI 阶段调用衔接。 | 必须保留 | 允许 |
| `csxt/public/js/ai-client.js` | 前端 AI 请求封装，统一调用后端 AI 代理接口。 | 必须保留 | 允许 |
| `csxt/public/vendor/xlsx.full.min.js` | Excel 解析库；服务端参数库编译和前端报价单解析都依赖它。 | 必须保留 | 允许 |

重要信息：

- 主系统没有前端构建步骤，浏览器直接加载 `index.html`、`app.css` 和 `js/*.js`。
- 修改手机端交互时优先看 `mobile.js` 和 `app.css` 中 `body.is-mobile` 相关样式。
- 修改参数、编辑、预览业务逻辑时优先看 `app.js`。
- 修改报价单识别第一阶段、第二阶段衔接时优先看 `quote-parser.js` 和 `ai-client.js`。
- 不要把 `xlsx.full.min.js` 当作无用压缩文件删除。

## 官网展示页文件

| 路径 | 作用 | 是否保留 | 升级包 |
| --- | --- | --- | --- |
| `csxt/public/official/index.html` | 官网展示页入口，访问路径 `/official/`。 | 按需保留 | 允许 |
| `csxt/public/official/site.css` | 官网展示页样式。 | 按需保留 | 允许 |
| `csxt/public/official/site.js` | 官网展示页交互脚本。 | 按需保留 | 允许 |
| `csxt/public/official/DESIGN_PHILOSOPHY.md` | 官网设计说明与视觉原则。 | 按需保留 | 允许 |

重要信息：

- 官网展示页不影响主系统 `/` 的运行。
- 如果不再需要对外宣传页，可以删除 `csxt/public/official/`，但删除前需确认 `server.mjs` 中 `/official/` 路由是否同步调整。

## 后台静态页面文件

| 路径 | 作用 | 是否保留 | 升级包 |
| --- | --- | --- | --- |
| `csxt/admin/index.html` | `/superzxy` 后台页面入口。 | 必须保留 | 如包含 `csxt/admin/` 则必须 |
| `csxt/admin/admin.css` | 后台暗色全息仪表盘样式。 | 必须保留 | 允许 |
| `csxt/admin/admin.js` | 后台登录、反馈、数据库上传、代码升级、统计刷新等前端逻辑。 | 必须保留 | 允许 |

重要信息：

- 后台页面由 `server.mjs` 通过 `/superzxy`、`/superzxy/admin.css`、`/superzxy/admin.js` 提供。
- 后台 API 在 `csxt/server/admin.mjs`，静态页面只负责展示和调用。

## 服务端文件

| 路径 | 作用 | 是否保留 | 升级包 |
| --- | --- | --- | --- |
| `csxt/server/server.mjs` | Node 服务主入口，负责静态资源、主系统 API、AI 代理、官网、后台路由。 | 必须保留 | 必须 |
| `csxt/server/admin.mjs` | 后台控制器，负责登录鉴权、反馈列表、数据库上传、远程升级、影子验证、回滚、统计。 | 必须保留 | 必须 |
| `csxt/server/database-loader.mjs` | 参数库读取与编译逻辑，将 Excel 参数库编译为运行目录数据。 | 必须保留 | 允许 |
| `csxt/server/supervisor.mjs` | 生产守护进程，负责启动正式服务、异常重启和升级后的拉起。 | 生产必须 | 允许 |
| `csxt/server/ai-config.local.json` | 本机 AI 配置、FastGPT 工作流配置、后台密码等敏感配置。 | 必须保留 | 禁止 |

重要信息：

- `server.mjs` 是普通 Node 直启入口：`node csxt/server/server.mjs`。
- `supervisor.mjs` 是生产推荐入口：`node csxt/server/supervisor.mjs`。
- `admin.mjs` 的远程升级逻辑必须保护 `csxt/data/` 和 `ai-config.local.json`。
- `database-loader.mjs` 依赖 `csxt/public/vendor/xlsx.full.min.js`，不要删除 vendor 目录。
- `ai-config.local.json` 绝不能上传 GitHub、不能进入升级包、不能被热升级覆盖。

## 业务数据文件

| 路径 | 作用 | 是否保留 | 升级包 |
| --- | --- | --- | --- |
| `csxt/data/database.xlsx` | 参数库源 Excel。 | 必须保留 | 禁止 |
| `csxt/data/generated/catalog.bundle.json` | 编译后的参数库大文件，供 `/api/database` 快速返回。 | 建议保留 | 禁止 |
| `csxt/data/generated/catalog.meta.json` | 参数库编译元数据，如 ETag、更新时间等。 | 建议保留 | 禁止 |
| `csxt/data/generated/compile-report.json` | 参数库编译报告。 | 建议保留 | 禁止 |
| `csxt/data/feedback/feedback.jsonl` | 本地反馈记录。 | 必须保留 | 禁止 |
| `csxt/data/admin/usage-stats.json` | 使用统计持久化数据。 | 必须保留 | 禁止 |
| `csxt/data/admin/site-notice.json` | 后台可配置的站点提示/公告数据。 | 按需保留 | 禁止 |
| `csxt/data/backups/database-*.xlsx` | 后台上传数据库前自动生成的数据库备份。 | 建议至少保留最近 1-2 个 | 禁止 |
| `csxt/data/backups/code/` | 代码升级前自动生成的代码备份目录。 | 生产建议保留 | 禁止 |

重要信息：

- `csxt/data/` 是业务数据目录，任何远程升级包都不能包含或覆盖。
- 删除 `generated/` 后服务可以尝试重新编译，但会增加启动或首次访问成本；生产环境建议保留。
- 反馈、统计、备份是运行成果，不能随代码升级被覆盖。

## 辅助目录与可清理文件

| 路径 | 作用 | 清理建议 |
| --- | --- | --- |
| `csxt-product-promo/` | 宣传视频、官网创意、截图素材。 | 主系统运行不需要；确认不用后可移出项目或删除 |
| `update-packages/*.zip` | 历史生成的升级包。 | 主系统运行不需要；可转移到外部归档 |
| `.DS_Store`、`csxt/.DS_Store`、`csxt/data/.DS_Store`、`csxt/public/.DS_Store` | macOS 缓存文件。 | 可随时删除 |
| `node_modules/.vite/` | 旧前端实验留下的 Vite 缓存。 | 可删除 |

## GitHub 与部署注意事项

- 当前项目目录可以不保留 `.git/`。如果重新上传 GitHub，可重新 `git init` 后按 `.gitignore` 提交。
- 上传 GitHub 时不得提交：
  - `node_modules/`
  - `csxt/server/ai-config.local.json`
  - `csxt/data/generated/`
  - `csxt/data/admin/`
  - `csxt/data/feedback/`
  - `csxt/data/backups/`
  - `.DS_Store`
- 全量部署到离线服务器时需要带上：
  - `csxt/`
  - `package.json`
  - `package-lock.json`
  - `node_modules/` 或离线安装包
  - `启动生产守护服务.bat`
  - 本机生产配置 `csxt/server/ai-config.local.json`
  - 生产参数库和业务数据 `csxt/data/`
- 热升级包只负责代码更新，不负责安装新依赖，不负责替换业务数据。

## 修改建议入口

- 改主系统 UI：优先改 `csxt/public/css/app.css`。
- 改主系统业务逻辑：优先改 `csxt/public/js/app.js`。
- 改手机端流程：优先改 `csxt/public/js/mobile.js`。
- 改报价单识别：优先改 `csxt/public/js/quote-parser.js` 和后端 AI 代理相关逻辑。
- 改后台界面：优先改 `csxt/admin/index.html`、`csxt/admin/admin.css`、`csxt/admin/admin.js`。
- 改后台 API 或升级逻辑：优先改 `csxt/server/admin.mjs`。
- 改参数库编译规则：优先改 `csxt/server/database-loader.mjs`。
- 改启动、守护、自动恢复：优先改 `csxt/server/supervisor.mjs` 和 `启动生产守护服务.bat`。
