# Codex 修改规则

后续 Codex 修改本项目时必须遵守以下规则。

## 技术边界

- 只能使用原生 HTML、CSS、JavaScript。
- 不允许引入 Vue、React、Angular、Svelte、TypeScript 或前端构建工具。
- 不允许修改 `csxt/public/vendor/xlsx.full.min.js`。
- 不允许破坏报价单解析、产品选择、参数编辑、排序、评分、预览和导出 Word 等核心功能。

## CSS 规则

- 新样式必须进入 `app.css` 的对应 `@layer`：`reset`、`tokens`、`base`、`layout`、`components`、`pages`、`responsive`、`overrides`。
- 不要在 CSS 文件末尾追加无结构补丁。
- 不要新增 `fix-mobile-1`、`temp-card`、`new-style2` 等无归属类名。
- 不要新增大量 `!important`。确需使用时，必须在 `docs/MOBILE_REFACTOR_REPORT.md` 说明原因。
- 统一使用 `ui-card`、`ui-button`、`ui-badge`、`ui-tag` 等组件类。
- 历史样式位于 `legacy` 层，除兼容必要外，不应继续扩写。

## 移动端交互规则

- 普通区域必须自然滚动。
- 禁止全局无条件 `preventDefault()` 阻止 `touchmove`。
- 拖拽排序只能通过 `.drag-handle` 触发。
- 横向滚动只能发生在模块内部，不得造成整页横向溢出。
- 动态生成的移动端卡片必须通过事件委托处理，不要重复绑定事件。

## 修改前检查

修改前先确认：

- 是否属于 FastGPT 工作流规则。如果是，应修改最新 FastGPT JSON，而不是在本地 UI 里补业务规则。
- 是否会影响移动端滚动、拖拽、底部固定操作区。
- 是否需要更新 `docs/UI_SPEC.md`。

## 验证要求

移动端修改至少验证：

- 375px、390px、414px 宽度无横向溢出。
- 768px 平板布局可读。
- 拖拽手柄之外可以正常滚动。
- 解析、编辑、删除、排序、预览、导出入口仍可触发。

