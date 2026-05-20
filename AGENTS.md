# 项目规则

## 远程升级包强制规格

后台远程升级是生产环境后续代码发布的主通道。任何升级包都必须遵守以下规则：

- ZIP 只能包含这些路径：`csxt/public/`、`csxt/admin/`、`csxt/server/`、`README.md`、`package.json`、`package-lock.json`。
- ZIP 必须包含：`csxt/public/index.html`、`csxt/server/server.mjs`、`csxt/server/admin.mjs`。
- 如果 ZIP 包含 `csxt/admin/`，必须包含 `csxt/admin/index.html`。
- ZIP 禁止包含：`csxt/data/`、`csxt/server/ai-config.local.json`、`node_modules/`、反馈文件、备份文件、`启动本地服务.bat`、`启动生产守护服务.bat`。
- 新增 npm 依赖不能走后台热升级；必须先做一次全量离线部署并确认 `node_modules` 已就绪。
- 生产环境必须使用 `启动生产守护服务.bat` 或 PM2。`启动本地服务.bat` 已废弃并从项目中删除，不得恢复为生产启动方式，也不得进入升级包。
- 后台应用更新前必须通过上传预检、服务端语法检查、影子服务健康检查。任一步失败都不得替换正式代码。
- 升级包不能修改业务数据、AI 本地配置、反馈记录和备份记录。
