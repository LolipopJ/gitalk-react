[ENGLISH](./README.md) | 简体中文

# Gitalk React

使用 TypeScript, React 和 Vite 重新实现 [Gitalk](https://github.com/gitalk/gitalk) —— 基于 Github 议题的评论组件。

面向现代浏览器开发，专注于减少构建包的体积，提升开发与使用的体验。

## 与原版的区别

- **不兼容旧版浏览器**：仅保证兼容支持 [ES2020](https://caniuse.com/?feats=mdn-javascript_operators_optional_chaining,mdn-javascript_operators_nullish_coalescing,mdn-javascript_builtins_globalthis,es6-module-dynamic-import,bigint,mdn-javascript_builtins_promise_allsettled,mdn-javascript_builtins_string_matchall,mdn-javascript_statements_export_namespace,mdn-javascript_operators_import_meta) 的现代浏览器。
- **依赖 React 运行时环境**：`react >= 16.8.0 && react-dom >= 16.8.0`。

## 开发中的功能

- [ ] Feature: 支持在 Gitalk 编辑自己发表的评论。
- [ ] refactor: 逐渐移除对非必要三方库的依赖。减少构建包的体积。
- [ ] test: 添加自动化测试流程。提升项目的健壮性。

## 快速开始

### 安装

```bash
npm install gitalk-react
```

### 使用

在项目中引入 Gitalk 的样式与组件：

```tsx
// 引入浅色模式样式
import 'gitalk-react/gitalk.css'
// 或深色模式样式
import 'gitalk-react/gitalk-dark.css'

import Gitalk from 'gitalk-react'
```

Gitalk 依赖于 Github OAuth App 实现登录鉴权，您需要首先[注册一个应用](https://github.com/settings/applications/new)。请注意，您必须将站点域名作为 `Authorization callback URL` 字段的值，例如 `https://yourdomain.com/site` 或开发环境下的 `http://localhost:5432`。

使用 Gitalk 组件，填写必要的配置项：

- `clientId`：Github OAuth App 的 ID。
- `clientSecret`：Github OAuth App 的 Secret 密钥。
- `owner`：Github 用户名。
- `repo`：Github 仓库名。需要是公开的仓库。
- `admin`：Gitalk 管理员列表，只有列表里的人可以初始化评论议题。可以是 Github 仓库的拥有者和协作者。

```tsx
<Gitalk
  clientID="YOUR_GITHUB_OAUTH_APP_CLIENT_ID"
  clientSecret="YOUR_GITHUB_OAUTH_APP_CLIENT_SECRET"
  owner="GITHUB_REPO_OWNER"
  repo="GITHUB_REPO_NAME"
  admin={['GITHUB_REPO_OWNER', 'GITHUB_REPO_COLLABORATOR']}
/>
```

## 配置

### clientID `string`

**必填项**。Github OAuth App 的 ID。

### clientSecret `string`

**必填项**。Github OAuth App 的 Secret 密钥。

### owner

**必填项**。Github 用户名。

### repo

**必填项**。Github 仓库名。需要是公开的仓库

### admin

**必填项**。Gitalk 管理员列表。可以是 Github 仓库的拥有者和协作者：拥有对此仓库**写权限**的用户。

### id `string = location.href`

评论议题的唯一标识符，长度不能超过 50。

Gitalk 在创建评论议题时，自动将此参数作为评论议题的标签项，并默认通过它来获取评论议题。

对于博客等类型的站点，推荐将页面的 `slug` 作为参数。

### number `number = -1`

评论议题的编号。

如果指定了此参数，那么 Gitalk 将通过它来获取评论议题，而非标识符。

### labels `string[] = ["Gitalk"]`

评论议题的标签。

### title `string = document.title`

评论议题的标题。

### body `string = location.href + meta[name="description"]`

评论议题的内容。

### language `string = navigator.language`

Gitalk 使用的语言。

可用的语言包括：`"de" | "en" | "es-ES" | "fa" | "fr" | "ja" | "ko" | "pl" | "ru" | "zh-CN" | "zh-TW"`。

### perPage `number = 10`

每页加载的评论数，不能超过 100。

### pagerDirection `"last" | "first" = "last"`

评论排序的方式。`last` 表示按评论创建时间倒叙排列，`first` 表示按评论创建时间正叙排列。

### createIssueManually `boolean = true`

当评论议题不存在时，Gitalk 将会自动为您创建一个新的评论议题。

如果您希望在管理员登录后，手动点击按钮以创建评论议题，则可以将其设置为 `false`。

### enableHotKey `boolean = true`

是否启用热键 `cmd + enter` 或 `ctrl + enter` 来创建评论。

### distractionFreeMode `boolean = false`

是否启用仿 Facebook 评论框的全屏遮罩效果。

### flipMoveOptions `FlipMove.FlipMoveProps`

评论列表的动画效果。

默认值，效果[参考](https://github.com/joshwcomeau/react-flip-move/blob/master/documentation/enter_leave_animations.md)：

```json
{
  "staggerDelayBy": 150,
  "appearAnimation": "accordionVertical",
  "enterAnimation": "accordionVertical",
  "leaveAnimation": "accordionVertical"
}
```

### proxy `string = "https://cors-anywhere.azm.workers.dev/https://github.com/login/oauth/access_token"`

Github OAuth App 鉴权反向代理，支持 CORS。[为什么需要它？](https://github.com/isaacs/github/issues/330)

### updateCountCallback `(count: number) => void`

评论数量更新的调用的回调方法。

### onCreateComment `(comment: CommentType) => void`

创建评论**成功时**调用的回调方法。

## 主题样式

通过设置 CSS 变量，您可以快速地将 Gitalk 的主题颜色修改为适配您站点的样式。

当您引入浅色主题 `import 'gitalk-react/gitalk.css'` 时，默认的 CSS 变量如下：

```css
.gt-container {
  --gt-theme-mode: light;
  --gt-color-main: #6190e8;
  --gt-color-main-lighter: rgb(186.0386740331, 206.5524861878, 244.9613259669);
  --gt-color-sub: #a1a1a1;
  --gt-color-loader: #999;
  --gt-color-error: #ff3860;
  --gt-color-hr: #e9e9e9;
  --gt-color-input-border: rgb(0 0 0 / 10%);
  --gt-color-input-bg: #f6f6f6;
  --gt-color-input-bg-lighter: hsl(0, 0%, 146.4705882353%);
  --gt-color-comment-bg: #f9f9f9;
  --gt-color-comment-bg-darker: rgb(243.9, 243.9, 243.9);
  --gt-color-comment-adminbg: #f6f9fe;
  --gt-color-comment-txt: #333;
  --gt-color-link-active: #333;
  --gt-color-btn: #fff;
  --gt-color-btn-darker: rgb(242.25, 242.25, 242.25);
  --gt-color-popbg: #fff;
}
```

引入深色主题 `import 'gitalk-react/gitalk-dark.css'` 时，默认的 CSS 变量如下：

```css
.gt-container {
  --gt-theme-mode: dark;
  --gt-color-main: #6190e8;
  --gt-color-main-lighter: rgb(186.0386740331, 206.5524861878, 244.9613259669);
  --gt-color-sub: #a1a1a1;
  --gt-color-loader: #999;
  --gt-color-error: #ff3860;
  --gt-color-hr: #e9e9e9;
  --gt-color-input-border: rgb(0 0 0 / 10%);
  --gt-color-input-bg: #f6f6f6;
  --gt-color-input-bg-lighter: hsl(0, 0%, 146.4705882353%);
  --gt-color-comment-bg: #f9f9f9;
  --gt-color-comment-bg-darker: rgb(243.9, 243.9, 243.9);
  --gt-color-comment-adminbg: #f6f9fe;
  --gt-color-comment-txt: #333;
  --gt-color-link-active: #333;
  --gt-color-btn: #fff;
  --gt-color-btn-darker: rgb(242.25, 242.25, 242.25);
  --gt-color-popbg: #fff;
}
```

## 开发

在项目根目录新建 `.env.local` 文件，添加开发用环境变量如下：

```env
VITE_CLIENT_ID="YOUR_GITHUB_APP_CLIENT_ID"
VITE_CLIENT_SECRET="YOUR_GITHUB_APP_CLIENT_SECRET"
VITE_REPO_OWNER="YOUR_GITHUB_USERNAME"
VITE_REPO_NAME="YOUR_REPO_NAME"
VITE_ADMIN='["YOUR_GITHUB_USERNAME"]'
```

执行 `yarn dev` 命令，在浏览器中调试开发。

执行 `yarn lint` 命令，检查并修复代码的质量与格式问题。

执行 `yarn build` 命令，打包构建组件。
