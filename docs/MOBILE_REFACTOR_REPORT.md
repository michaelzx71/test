# 移动端结构化重构报告

## 本次重构范围

本次重构保留原生 HTML/CSS/JS 技术栈，不引入框架和构建工具。

修改文件：

- `csxt/public/css/app.css`
- `csxt/public/index.html`
- `csxt/public/js/mobile.js`
- `docs/UI_SPEC.md`
- `docs/CODEX_RULES.md`
- `docs/MOBILE_REFACTOR_REPORT.md`

未修改：

- `csxt/public/vendor/xlsx.full.min.js`
- FastGPT 工作流配置
- 服务端业务接口

## 结构化处理

`app.css` 已建立分层：

```css
@layer reset, tokens, base, legacy, layout, components, pages, responsive, overrides;
```

历史样式被收进 `legacy` 层。新的移动端样式进入 `tokens`、`layout`、`components`、`pages` 和 `responsive` 层，后续不应继续在末尾追加散乱补丁。

## 移动端 UI 底座

新增统一体系：

- 卡片：`ui-card`
- 按钮：`ui-button`、`ui-button--primary`、`ui-button--secondary`、`ui-button--danger`、`ui-button--ghost`
- 标签：`ui-badge`、`ui-tag`
- 产品卡：`product-card`
- 参数卡：`param-card`
- 空状态：`ui-empty`
- 拖拽手柄：`drag-handle`

首页、产品选择、产品清单、参数处理、参数排序、参数改写、评分和预览都开始使用统一类名和布局变量。

## 已解决的问题

1. 移动端样式不再依赖继续追加无结构补丁，新增规则进入明确 CSS 层。
2. 首页参数库、在线人数、AI 解析报价单、手动选择、通知模块统一卡片体系。
3. 移动端按钮高度统一为不低于 44px。
4. 产品卡片与参数卡片统一为纵向信息层级。
5. 参数排序和产品排序只允许通过 `.drag-handle` 启动。
6. 移除了移动端全局无条件阻止普通 `touchmove` 的行为，页面和模块可以自然滚动。
7. 横向内容如厂商支持徽标在模块内部滚动，不影响整页滚动。
8. 桌面端 1680px 缩放画布仍保留，但页面级横向滚动由桌面固定画布规则隔离。

## 兼容说明

桌面端旧样式和旧 DOM 仍保留在 `legacy` 层中。当前重构优先治理移动端结构，并通过 `overrides` 做少量兼容桥接。后续如果继续清理桌面端，应逐步把桌面卡片、按钮、标签也迁移到同一套 `ui-*` 体系。

`legacy` 层仍包含历史 `!important`。本次没有批量删除这些规则，原因是旧桌面和旧移动补丁彼此耦合，直接删除会增加业务界面回归风险。新体系本身不新增散乱 `!important`，仅在 `overrides` 层保留少量兼容兜底，用于覆盖历史固定 40px 按钮高度和产品卡片固定高度，确保移动端点击区域不低于 44px。

## 后续建议

1. 优先继续拆解 `app.css` 中 `legacy` 层的桌面样式，把可复用部分迁入 `components`。
2. 逐步把 `app.js` 里桌面动态生成的按钮和卡片也加上 `ui-button`、`ui-card` 类。
3. 如果继续优化参数评分和厂商支持，应只改 `pages` 或 `components` 层。
4. 不要在 `overrides` 层长期堆积规则。兼容规则稳定后应迁入对应层。
