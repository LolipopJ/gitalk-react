ENGLISH | [简体中文](./README-zh-CN.md)

# Gitalk React

Reimplementing [Gitalk](https://github.com/gitalk/gitalk) with TypeScript, React, and Vite — a comment component based on GitHub issues.

Developed for modern browsers, focusing on reducing build size and enhancing development and usage experience.

## Differences

- **Not compatible with older browsers**: Only guarantees compatibility with modern browsers that support [ES2020](https://caniuse.com/?feats=mdn-javascript_operators_optional_chaining,mdn-javascript_operators_nullish_coalescing,mdn-javascript_builtins_globalthis,es6-module-dynamic-import,bigint,mdn-javascript_builtins_promise_allsettled,mdn-javascript_builtins_string_matchall,mdn-javascript_statements_export_namespace,mdn-javascript_operators_import_meta).
- **Depends on React runtime environment**: `react >= 16.8.0 && react-dom >= 16.8.0`.

## Features in Development

- [ ] Feature: Support editing comments published by the user in Gitalk.
- [ ] refactor: Gradually remove dependencies on non-essential third-party libraries to reduce build size.
- [ ] test: Add automated testing processes to enhance project robustness.
- [ ] chore: Deploy preview environment.

## Quick Start

### Installation

```bash
npm install gitalk-react
```

### Usage

Import styles and component into your project:

```tsx
// Import light mode styles
import 'gitalk-react/gitalk.css'
// Or dark mode styles
import 'gitalk-react/gitalk-dark.css'

import Gitalk from 'gitalk-react'
```

Gitalk relies on GitHub OAuth App for login authentication; you need to first [register an application](https://github.com/settings/applications/new). Please note that you must set your site domain as the value of the `Authorization callback URL` field, such as `https://yourdomain.com/site` or for development environments `http://localhost:5432`.

When using the Gitalk component, fill in the necessary configuration items:

- `clientId`: The ID of your GitHub OAuth App.
- `clientSecret`: The Secret key of your GitHub OAuth App.
- `owner`: Your GitHub username.
- `repo`: The name of your GitHub repository. It must be a public repository.
- `admin`: A list of Gitalk administrators; only those listed can initialize comment topics. This can include the owner and collaborators of the GitHub repository.

```tsx
<Gitalk
  clientID="YOUR_GITHUB_OAUTH_APP_CLIENT_ID"
  clientSecret="YOUR_GITHUB_OAUTH_APP_CLIENT_SECRET"
  owner="GITHUB_REPO_OWNER"
  repo="GITHUB_REPO_NAME"
  admin={['GITHUB_REPO_OWNER', 'GITHUB_REPO_COLLABORATOR']}
/>
```

## Configuration

### clientID `string`

**Required**. The ID of your GitHub OAuth App.

### clientSecret `string`

**Required**. The Secret key of your GitHub OAuth App.

### owner `string`

**Required**. Your GitHub username.

### repo `string`

**Required**. The name of your GitHub repository. It must be a public repository.

### admin `string[]`

**Required**. A list of Gitalk administrators. This can include users who have write access to this repository: owners and collaborators.

### id `string = location.href`

A unique identifier for the comment topic; length cannot exceed 50 characters.

When creating a comment topic, Gitalk automatically uses this parameter as a label item for the comment topic and defaults to fetching comments based on it.

For blog-type sites, it is recommended to use the page's slug as this parameter.

### number `number = -1`

The number of the comment topic.

If this parameter is specified, then Gitalk will fetch comments based on it rather than using the identifier.

### labels `string[] = ["Gitalk"]`

Labels for the comment topic.

### title `string = document.title`

The title of the comment topic.

### body `string = location.href + meta[name="description"]`

The content of the comment topic.

### language `string = navigator.language`

The language used by Gitalk.

Available languages include: "de" | "en" | "es-ES" | "fa" | "fr" | "ja" | "ko" | "pl" | "ru" | "zh-CN" | "zh-TW".

### perPage `number = 10`

The number of comments loaded per page; cannot exceed 100.

### pagerDirection `"last" | "first" = "last"`

The sorting method for comments. last indicates descending order by creation time, while first indicates ascending order by creation time.

### createIssueManually `boolean = true`

When a comment topic does not exist, Gitalk will automatically create a new one for you.

If you prefer to create a comment topic manually by clicking a button after logging in as an administrator, set this to false.

### enableHotKey `boolean = true`

Whether to enable hotkeys like cmd + enter or ctrl + enter to create comments.

### distractionFreeMode `boolean = false`

Whether to enable full-screen overlay effects similar to Facebook's comment box.

### flipMoveOptions `FlipMove.FlipMoveProps`

Animation effects for the comment list.

Default values (referenced effects can be found here):

```json
{
  "staggerDelayBy": 150,
  "appearAnimation": "accordionVertical",
  "enterAnimation": "accordionVertical",
  "leaveAnimation": "accordionVertical"
}
```

### proxy `string = "https://cors-anywhere.azm.workers.dev/https://github.com/login/oauth/access_token"`

Reverse proxy for authenticating with Github OAuth App that supports CORS. Why is it needed?

### updateCountCallback `(count: number) => void`

Callback method invoked when updating the number of comments.

### onCreateComment `(comment: CommentType) => void`

Callback method invoked when a comment is successfully created.

## Theme Styles

You can quickly modify Gitalk's theme colors to match your site's style by setting CSS variables.

When you import light theme with `import 'gitalk-react/gitalk.css'`, the default CSS variables are as follows:

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
  --gt-color-link-active: #333;
  --gt-color-btn: #fff;
  --gt-color-popbg: #fff;
}
```

When importing dark theme with `import 'gitalk-react/gitalk-dark.css'`, the default CSS variables are as follows:

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
  --gt-color-link-active: #fafafa;
  --gt-color-btn: #eee;
  --gt-color-popbg: #171717;
}
```

## Developer

Create a `.env.local` file in your project's root directory and add development environment variables as follows:

```bash
VITE_CLIENT_ID="YOUR_GITHUB_APP_CLIENT_ID"
VITE_CLIENT_SECRET="YOUR_GITHUB_APP_CLIENT_SECRET"
VITE_REPO_OWNER="YOUR_GITHUB_USERNAME"
VITE_REPO_NAME="YOUR_REPO_NAME"
VITE_ADMIN='["YOUR_GITHUB_USERNAME"]'
```

### Development

Debug in your browser during development:

```bash
yarn dev
```

### Lint

Check and fix code quality and formatting issues:

```bash
yarn lint
```

### Production

Bundle and build components:

```bash
yarn build
```

## License

[MIT](./LICENSE)
