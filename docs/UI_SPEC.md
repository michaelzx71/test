# AI 参数系统 UI 规范

本文档用于约束当前原生 HTML/CSS/JS 系统的界面修改。项目不使用 Vue、React、Angular、Svelte 或构建工具。

## CSS 分层

`csxt/public/css/app.css` 使用以下层级：

```css
@layer reset, tokens, base, legacy, layout, components, pages, responsive, overrides;
```

- `reset`：移动端 box-sizing、表单和按钮基础行为。
- `tokens`：颜色、间距、圆角、阴影、按钮高度、页面边距等设计变量。
- `base`：body、文本、焦点等基础样式。
- `legacy`：历史桌面和兼容样式。不得继续在这里追加新移动端样式。
- `layout`：`app-shell`、`page-container`、`page-section`、滚动容器、底部操作区。
- `components`：`ui-card`、`ui-button`、`ui-badge`、`ui-tag`、`ui-empty`、产品卡、参数卡、拖拽手柄。
- `pages`：移动端首页、产品选择、产品清单、参数处理、评分和预览页面。
- `responsive`：375、390、414、768、1024 和桌面过渡规则。
- `overrides`：少量兼容桥接，必须写明原因。

## 设计变量

核心变量集中在 `tokens` 层：

- `--page-padding-mobile`：移动端页面左右边距，默认 `12px`。
- `--section-gap-mobile`：卡片和区块间距，默认 `12px`。
- `--button-height`：移动端点击区域高度，默认 `44px`。
- `--radius-md`、`--radius-lg`：按钮和卡片圆角。
- `--color-primary`、`--color-success`、`--color-warning`、`--color-danger`：操作、在线、通知、删除等状态色。

## 组件体系

卡片统一使用：

```html
<article class="ui-card"></article>
```

按钮统一使用：

```html
<button class="ui-button ui-button--primary"></button>
<button class="ui-button ui-button--secondary"></button>
<button class="ui-button ui-button--danger"></button>
<button class="ui-button ui-button--ghost"></button>
```

状态和标签统一使用：

```html
<span class="ui-badge ui-badge--pending"></span>
<span class="ui-badge ui-badge--done"></span>
<span class="ui-tag"></span>
```

产品卡片使用 `product-card`，参数卡片使用 `param-card`。拖拽排序只能从 `.drag-handle` 启动。

## 移动端布局

- 移动端基础布局以 375px 为默认设计宽度，390px 和 414px 只做细节增强。
- 768px 到 1024px 使用平板布局，可将列表切为双列。
- 页面使用 `page-container`、`page-section`、`section-header`、`section-title`、`section-body` 组织结构。
- 普通页面区域允许自然滚动。只有模块内部明确横向内容时，才允许模块内横向滚动。
- 固定底部操作区必须为内容区预留安全底部间距。

## 交互规则

- 所有可点击区域高度不低于 `44px`。
- 拖拽排序只绑定 `.drag-handle`。
- 禁止全局无条件阻止 `touchmove`。
- 如果拖拽需要阻止滚动，只能在明确拖拽进行中处理。
- 动态卡片事件优先走 `mobileWorkbench` 的事件委托。

