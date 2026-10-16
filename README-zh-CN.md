基于 GitHub Issue 和 React 的现代评论组件。

[ENGLISH](./README.md) | 简体中文

# Gitalk React

[![NPM][npm-version-image]][npm-version-url]
[![gzip-size][gzip-size]][gzip-url]

使用 TypeScript, React 和 Vite 重新实现 [Gitalk](https://github.com/gitalk/gitalk) —— 基于 Github Issue 的评论组件。

面向现代浏览器开发，致力于减小构建体积，提升开发与使用的体验。

## 与原版的区别

- **不兼容旧版浏览器**：仅保证兼容支持 [ES2020](https://caniuse.com/?feats=mdn-javascript_operators_optional_chaining,mdn-javascript_operators_nullish_coalescing,mdn-javascript_builtins_globalthis,es6-module-dynamic-import,bigint,mdn-javascript_builtins_promise_allsettled,mdn-javascript_builtins_string_matchall,mdn-javascript_statements_export_namespace,mdn-javascript_operators_import_meta) 的现代浏览器。
- **部分参数的默认值发生了变化**：迁移到此组件时请留意。
  - `id`：Gitalk 使用 `location.href` 作为默认值，Gitalk React 使用 `location.host + location.pathname` 作为默认值，避免预期外的查询参数。
  - `defaultAuthor`：仍然可以使用。Gitalk React 新增了参数项 `defaultUser` 来设置评论的默认用户，保持字段命名与 Github API 一致。

## 快速开始

### Node.js 项目

```bash
npm install gitalk-react
```

在项目中引入样式与组件：

```tsx
// 引入浅色样式
import 'gitalk-react/gitalk.css'
// 或深色样式
// import 'gitalk-react/gitalk-dark.css'

import Gitalk from 'gitalk-react'
```

Gitalk React 依赖于 Github OAuth App 进行登录认证；您需要首先[注册一个应用](https://github.com/settings/applications/new)。请注意，您必须将站点域名作为 `Authorization callback URL` 字段的值，例如 `https://yourdomain.com/site`，开发环境下则为 `http://localhost:5432`。

通过自建后端代理服务器实现安全部署，请使用以下配置：

- `clientID`：您的 GitHub OAuth App ID。
- `proxy`：后端代理服务器的 URL 端点，用于安全地处理 OAuth 授权码到令牌的交换。详见[部署代理](#部署代理)章节。
- `owner`：您的 GitHub 用户名。
- `repo`：您的 GitHub 仓库名称。必须是公开仓库。
- `admin`：Gitalk React 管理员列表；只有列表中的用户才能初始化评论话题。可以是 Github 仓库的拥有者和协作者。

```tsx
<Gitalk
  clientID="YOUR_GITHUB_OAUTH_APP_CLIENT_ID"
  proxy="https://your-server.com/oauth/access_token"
  owner="GITHUB_REPO_OWNER"
  repo="GITHUB_REPO_NAME"
  admin={['GITHUB_REPO_OWNER', 'GITHUB_REPO_COLLABORATOR']}
/>
```

> [!CAUTION]
> 提供 `clientSecret` 会使 Gitalk 将 OAuth 授权模式降级为隐式授权流（Implicit Grant Flow）模式。该模式会将密钥暴露给访问者和中继服务，行业标准已正式弃用并反对使用此模式。

**请务必清楚您正在执行的操作。** 对于仍需使用已暴露密钥的旧版部署方式，请使用以下配置：

- `clientID`：您的 GitHub OAuth App ID。
- `clientSecret`：您的 GitHub OAuth App Secret。
- `owner`：您的 GitHub 用户名。
- `repo`：您的 GitHub 仓库名称。必须是公开仓库。
- `admin`：Gitalk React 管理员列表；只有列表中的用户才能初始化评论话题。可以是 Github 仓库的拥有者和协作者。

```tsx
<Gitalk
  clientID="YOUR_GITHUB_OAUTH_APP_CLIENT_ID"
  clientSecret="YOUR_GITHUB_OAUTH_APP_CLIENT_SECRET"
  owner="GITHUB_REPO_OWNER"
  repo="GITHUB_REPO_NAME"
  admin={['GITHUB_REPO_OWNER', 'GITHUB_REPO_COLLABORATOR']}
/>
```

Gitalk React 是一个**客户端组件**，**不支持服务端渲染（SSR）**。它在渲染过程中会读取浏览器 API。源码入口及两个发布的 JavaScript 入口均带有 `"use client"` 指令；这标记了 React 客户端边界，但不会禁用 SSR 框架中的预渲染功能。

在 Next.js App Router 中，创建一个客户端包装器并对动态导入禁用 SSR：

```tsx
'use client'

import dynamic from 'next/dynamic'
import type { GitalkProps } from 'gitalk-react'
import 'gitalk-react/gitalk.css'

const Gitalk = dynamic(() => import('gitalk-react'), { ssr: false })

export default function Comments(props: GitalkProps) {
  return <Gitalk {...props} />
}
```

使用上述配置渲染此包装器。其他 SSR 框架也必须确保仅在浏览器端加载和挂载 Gitalk。

### 浏览器 CDN

两种浏览器构建版本都会暴露一个全局的 `Gitalk` 构造函数。加载其中一个构建版本及所需的样式表即可；以下示例使用的是浅色主题。如需使用深色主题，请引入 `dist/gitalk-dark.css`。

对于未使用 React 的页面，请使用完整版构建，该版本内置了 React 19.3.1 和 ReactDOM 19.3.1，并通过 `createRoot` 进行挂载：

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/gitalk-react/dist/gitalk-light.css"
/>
<div id="gitalk-container"></div>
<script src="https://cdn.jsdelivr.net/npm/gitalk-react/dist/gitalk.browser.full.js"></script>
<script>
  const gitalk = new Gitalk({
    clientID: 'YOUR_GITHUB_OAUTH_APP_CLIENT_ID',
    proxy: 'https://your-server.com/oauth/access_token',
    owner: 'GITHUB_REPO_OWNER',
    repo: 'GITHUB_REPO_NAME',
    admin: ['GITHUB_REPO_OWNER'],
  })
  gitalk.render('gitalk-container')
</script>
```

jsDelivr 和 unpkg 的裸包 URL 默认指向完整版构建。

如果页面中已存在匹配的全局 `React` 和 `ReactDOM` 对象，请使用 `gitalk.browser.js` 而非 `gitalk.browser.full.js`。当检测到 `ReactDOM.createRoot` 可用时（React 18+），它会优先使用该方法；否则将回退使用 `ReactDOM.render` / `ReactDOM.unmountComponentAtNode`（适用于 React 16/17）。以下是 React 18 环境下的完整脚本加载顺序示例：

```html
<script src="https://cdn.jsdelivr.net/npm/react@18.3.1/browser/react.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/react-dom@18.3.1/browser/react-dom.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gitalk-react/dist/gitalk.browser.js"></script>
```

通过应用打包工具安装的 React 不会自动提供这些全局变量。此类应用应使用 React 组件导入方式，或在加载浏览器构建前显式暴露共享运行时。在使用 React 19 时，需将 `react-dom/client` 模块作为 `ReactDOM` 暴露出来，以确保其 `createRoot` 方法可用；仅引入 `react-dom` 模块并不会导出 `createRoot`。加载完整版构建既不依赖也不覆盖页面现有的 React 全局变量。

`render(id)` 方法接受元素 ID（不带 `#` 前缀）。调用该方法时，对应元素必须已存在于 DOM 中。重复调用此方法会更新当前挂载点；若传入新的 ID，则会先卸载之前的容器。在移除组件前（例如页面跳转时），请务必调用 `gitalk.destroy()`。实例在销毁后仍可重新渲染。

构造函数接受的配置项与 React 组件相同，建议采用前述 `clientID` + `proxy` 的配置方式，以确保密钥安全存储于服务端。两种浏览器构建均不会自动包含 CSS 样式。

## 配置

### clientID `string`

**必填项**。Github OAuth App 的 ID。

### clientSecret `string`

您的 GitHub OAuth App Secret。提供此项时，Gitalk 会通过 `proxy` 发送包含授权码、Client ID 和 Secret 的 POST 请求；若省略或留空 `proxy`，则使用 `DEFAULT_PROXY`。此模式会在浏览器和 CORS 中继中暴露密钥。

您应该将 OAuth App Secret 保存在服务端。对于安全部署，请省略 `clientSecret` 并提供服务端 `proxy`。

### owner `string`

**必填项**。Github 用户名。

### repo `string`

**必填项**。Github 仓库名。需要是公开的仓库

### admin `string[]`

**必填项**。Gitalk React 管理员列表。可以是 Github 仓库的拥有者和协作者：拥有对此仓库**写权限**的用户。

### id `string = location.host + location.pathname`

评论议题的唯一标识符，长度不能超过 50。

Gitalk React 在创建评论议题时，自动将此参数作为评论议题的标签项，并默认通过它来获取评论议题。

对于博客等类型的站点，推荐将页面的 `slug` 作为参数。

### number `number`

评论议题的编号。

如果指定了此参数，那么 Gitalk React 将通过它来获取评论议题，而非标识符。

### labels `string[] = ["Gitalk"]`

评论议题的标签。

### title `string = document.title`

评论议题的标题。

### body `string = location.href + meta[name="description"]`

评论议题的内容。

### language `string = navigator.language`

Gitalk React 使用的语言。

可用翻译：`ar`、`bn`、`de`、`en`、`es`、`fa`、`fr`、`hi`、`ja`、`ko`、`pl`、`pt`、`ru`、`ur`、`zh-CN` 和 `zh-TW`。诸如 `fr-FR`、`de-DE` 和 `ja-JP` 等 BCP 47 区域标签会选择基础翻译。中文地区和文字标签会保留简体/繁体中文（`zh-Hans` / `zh-Hant`）。不支持或无效的标签将使用英语。相对评论日期使用具有相同解析语言的 `Intl.RelativeTimeFormat`。

### perPage `number = 10`

每页加载的评论数，不能超过 100。

### pagerDirection `"last" | "first" = "last"`

评论排序的方式。`last` 表示按评论创建时间降序排列，`first` 表示按评论创建时间升序排列。

### createIssueManually `boolean = false`

当评论议题不存在时，Gitalk React 将会自动为您创建一个新的评论议题。

如果您希望以管理员身份登录后，手动点击按钮来创建评论议题，则可以将其设置为 `true`。

### enableHotKey `boolean = true`

是否启用热键 `cmd + enter` 或 `ctrl + enter` 来发表评论。

### distractionFreeMode `boolean = false`

是否启用仿 Facebook 评论框的全屏遮罩效果。

### proxy `string`

当提供 `clientSecret` 时，这是一个可选的 CORS 中继 URL。默认为 `https://cors-anywhere.azm.workers.dev/https://github.com/login/oauth/access_token`。您可以选择其他 CORS 服务。Gitalk 会发送包含 code、client ID 和 secret 的 POST 请求；中继服务解决浏览器的跨域限制，同时 GitHub 仍会验证 OAuth 凭证。

当省略 `clientSecret` 时，`proxy` 为必填项，且必须指向您的服务端 OAuth 交换端点。Gitalk 仅发送带有授权码（作为编码的 `code` 查询参数）的 GET 请求，并保留现有的查询参数。服务端存储凭证并返回 JSON `{ "access_token": "..." }`。

### defaultUser `{ avatar_url: string; login: string; html_url: string }`

评论用户不存在时，使用的默认用户。

`avatar_url` 为用户头像地址，`login` 为用户名，`html_url` 为点击用户后跳转的页面。默认值：

```json
{
  "avatar_url": "//avatars1.githubusercontent.com/u/29697133?s=50",
  "login": "null",
  "html_url": ""
}
```

### collapsedHeight `number`

当评论的高度大于 `${collapsedHeight}px` 时，自动折叠到 `${collapsedHeight}px`。

### highlightAdminComment `boolean = true`

是否高亮管理员发表的评论，高亮的评论具有额外的阴影效果。

### updateCountCallback `(count: number) => void`

评论数量更新的调用的回调方法。

### onCreateComment `(comment: CommentType) => void`

创建评论**成功时**调用的回调方法。

## 主题

### 颜色

您可以通过设置 CSS 变量快速修改 Gitalk React 的主题颜色，以匹配您的站点风格。

当您通过 `import 'gitalk-react/gitalk.css'` 引入浅色主题时，默认 CSS 变量如下：

```css
.gt-container {
  --gt-theme-mode: light;
  --gt-color-text: #171717;
  --gt-color-main: #3b82f6;
  --gt-color-main-lighter: rgb(107.7609756098, 161.0975609756, 248.2390243902);
  --gt-color-sub: #a1a1a1;
  --gt-color-loader: #999;
  --gt-color-error: #ff3860;
  --gt-color-hr: #e9e9e9;
  --gt-color-input-border: rgb(0 0 0 / 10%);
  --gt-color-input-bg: #f6f6f6;
  --gt-color-input-bg-lighter: hsl(0, 0%, 146.4705882353%);
  --gt-color-comment-bg: #f9f9f9;
  --gt-color-comment-shadow: rgb(218.4, 218.4, 218.4);
  --gt-color-comment-shadow-admin: rgb(203.1, 203.1, 203.1);
  --gt-color-comment-txt: #333;
  --gt-color-comment-collapse-bg: linear-gradient(
    rgb(245 245 245 / 10%),
    rgb(245 245 245 / 90%)
  );
  --gt-color-link-active: #333;
  --gt-color-btn: #fff;
  --gt-color-popbg: #fff;
}
```

当通过 `import 'gitalk-react/gitalk-dark.css'` 引入深色主题时，默认 CSS 变量如下：

```css
.gt-container {
  --gt-theme-mode: dark;
  --gt-color-text: #e9e9e9;
  --gt-color-main: #6366f1;
  --gt-color-main-lighter: rgb(122.4, 124.95, 243.1);
  --gt-color-sub: #9e9e9e;
  --gt-color-loader: #777;
  --gt-color-error: #ef4444;
  --gt-color-hr: #555;
  --gt-color-input-border: rgb(255 255 255 / 10%);
  --gt-color-input-bg: #212121;
  --gt-color-input-bg-lighter: rgb(48.3, 48.3, 48.3);
  --gt-color-comment-bg: #212121;
  --gt-color-comment-shadow: rgb(78.9, 78.9, 78.9);
  --gt-color-comment-shadow-admin: rgb(94.2, 94.2, 94.2);
  --gt-color-comment-txt: #fafafa;
  --gt-color-comment-collapse-bg: linear-gradient(
    rgb(20 20 20 / 10%),
    rgb(20 20 20 / 90%)
  );
  --gt-color-link-active: #fafafa;
  --gt-color-btn: #eee;
  --gt-color-popbg: #171717;
}
```

### 动画

评论的进入和退出使用原生 CSS 手风琴/淡入淡出动画，重新排序时使用 CSS transform 过渡。动画持续时间为 0.3 秒，并遵循 `prefers-reduced-motion` 偏好设置。动画库选项和默认选项导出已被移除；请在 CSS 中自定义 `.gt-comment-item`。

## 部署代理

[内置的 Node 代理](./proxy-server/README.md)需要 Node.js 22 或更高版本，无需额外安装包。将 `proxy-server/.env.example` 复制为 `proxy-server/.env.local`，然后在服务器上设置 `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET` 和 `ALLOWED_ORIGIN`。Origin 必须与你的站点源完全匹配，不包含路径或尾部斜杠。

```bash
npm run start:proxy
```

本地开发时使用 `http://localhost:3000/oauth/access_token`。在生产环境中，应将代理置于 HTTPS 之后，并将组件的 `proxy` 设置为其公共端点。请禁用该端点的查询字符串日志记录和缓存，因为其 URL 包含一次性授权码。浏览器端的 `clientID` 必须与服务端的 OAuth App 一致。

预览环境专门使用这种服务端模式。本地 Vite 开发会将 `/oauth/access_token` 转发到本地代理。对于静态预览部署，请在构建前将 `VITE_PROXY` 设置为已部署的 HTTPS 端点；GitHub Pages 无法托管 Node 代理。

## 开发者指南

在项目根目录新建 `.env.local` 文件，并添加如下开发环境变量：

```bash
VITE_CLIENT_ID="YOUR_GITHUB_OAUTH_APP_CLIENT_ID"
VITE_CLIENT_SECRET="YOUR_GITHUB_OAUTH_APP_CLIENT_SECRET"
VITE_REPO_OWNER="YOUR_GITHUB_USERNAME"
VITE_REPO_NAME="YOUR_REPO_NAME"
VITE_ADMIN='["YOUR_GITHUB_USERNAME"]'
```

### 开发

安装依赖：

```bash
pnpm install
```

在浏览器中调试开发：

```bash
pnpm run dev
```

运行测试：

```bash
pnpm run test
```

### 质量检查

检查并修复代码的质量与格式问题：

```bash
pnpm run lint
```

### 构建

打包并构建组件：

```bash
pnpm run build
```

## 开发中的功能

- [ ] 特性：支持在 Gitalk React 中编辑用户自己发布的评论。
- [x] 特性：支持折叠过长的评论，允许用户点击展开。
- [x] 重构：逐步移除非必要第三方库的依赖，以减小构建体积。
- [x] 测试：添加自动化测试流程，增强项目健壮性。
- [x] 杂项：部署[预览环境](https://lolipopj.github.io/gitalk-react/)。

## 许可证

[MIT](./LICENSE)

[npm-version-image]: https://img.shields.io/npm/v/gitalk-react.svg?style=flat-square
[npm-version-url]: https://www.npmjs.com/package/gitalk-react
[gzip-size]: https://img.badgesize.io/https://unpkg.com/gitalk-react/dist/gitalk.browser.js?compression=gzip&style=flat-square
[gzip-url]: https://unpkg.com/gitalk-react/dist/gitalk.browser.js
