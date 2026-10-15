Modern comment component based on GitHub Issue and React.

ENGLISH | [简体中文](./README-zh-CN.md)

# Gitalk React

[![NPM][npm-version-image]][npm-version-url]
[![gzip-size][gzip-size]][gzip-url]

Reimplementing [Gitalk](https://github.com/gitalk/gitalk) with TypeScript, React, and Vite — a comment component based on GitHub issues.

Developed for modern browsers, focusing on reducing build size and enhancing development and usage experience.

## Differences

- **Not compatible with older browsers**: Only guarantees compatibility with modern browsers that support [ES2020](https://caniuse.com/?feats=mdn-javascript_operators_optional_chaining,mdn-javascript_operators_nullish_coalescing,mdn-javascript_builtins_globalthis,es6-module-dynamic-import,bigint,mdn-javascript_builtins_promise_allsettled,mdn-javascript_builtins_string_matchall,mdn-javascript_statements_export_namespace,mdn-javascript_operators_import_meta).
- **Depends on React runtime environment**: `react >= 16.8.0 && react-dom >= 16.8.0`.
- **Some default values for parameters have changed**: Please pay attention when migrating to this component.
  - `id`: Gitalk uses `location.href` as the default value, while Gitalk React uses `location.host + location.pathname` as the default value, to avoid unexpected search parameters.
  - `defaultAuthor`: Can still be used. Gitalk React has added a new parameter `defaultUser` to set the default user for comments, keeping the field naming consistent with the GitHub API.

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
// import 'gitalk-react/gitalk-dark.css'

import Gitalk from 'gitalk-react'
```

Gitalk React relies on GitHub OAuth App for login authentication; you need to first [register an application](https://github.com/settings/applications/new). Please note that you must set your site domain as the value of the `Authorization callback URL` field, such as `https://yourdomain.com/site` or for development environments `http://localhost:5432`.

When using the Gitalk React component, fill in the necessary configuration items:

- `clientID`: The ID of your GitHub OAuth App.
- `proxy`: Your server-side OAuth exchange endpoint. See [Proxy Deployment](#proxy-deployment).
- `owner`: Your GitHub username.
- `repo`: The name of your GitHub repository. It must be a public repository.
- `admin`: A list of Gitalk React administrators; only those listed can initialize comment topics. This can include the owner and collaborators of the GitHub repository.

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
> Keep your OAuth App secret on the server. Browser code and `VITE_*` environment variables are public. Rotate the secrets previously included in the preview source in your GitHub OAuth App settings; removing them from the current source does not remove published assets or Git history.
>
> Providing `clientSecret` selects the client-side exchange mode, using your chosen CORS relay or the default relay when `proxy` is omitted. That mode exposes the secret to visitors and the relay. For server-side exchange, omit `clientSecret` and provide your backend `proxy`.

For a secure deployment with your backend proxy server, use the following configuration items:

- `clientID`: The ID of your GitHub OAuth App.
- `proxy`: The URL endpoint of your backend proxy server which securely handles the OAuth authorization code-to-token exchange.
- `owner`: Your GitHub username.
- `repo`: The name of your GitHub repository. It must be a public repository.
- `admin`: A list of Gitalk React administrators; only those listed can initialize comment topics. This can include the owner and collaborators of the GitHub repository.

```tsx
<Gitalk
  clientID="YOUR_GITHUB_OAUTH_APP_CLIENT_ID"
  proxy="https://your-server.com/oauth/access_token"
  owner="GITHUB_REPO_OWNER"
  repo="GITHUB_REPO_NAME"
  admin={['GITHUB_REPO_OWNER', 'GITHUB_REPO_COLLABORATOR']}
/>
```

### Client-only rendering

Gitalk React is a **client component** and does **not support server-side rendering (SSR)**. It reads browser APIs during rendering. The source entry and both published JavaScript entry points carry `"use client"`; this marks the React client boundary but does not disable prerendering in SSR frameworks.

In Next.js App Router, create a client wrapper and disable SSR for the dynamic import:

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

Render this wrapper with the configuration shown above. Other SSR frameworks must also load and mount Gitalk only in the browser.

## Configuration

### clientID `string`

**Required**. The ID of your GitHub OAuth App.

### clientSecret `string`

The Secret key of your GitHub OAuth App. When provided, Gitalk sends the authorization code, client ID and secret in a POST request through `proxy`, using `DEFAULT_PROXY` when `proxy` is omitted or empty. This mode exposes the secret in the browser and to the CORS relay.

You should keep your OAuth App secret on the server. Omit `clientSecret` and provide a server-side `proxy` for secure deployments.

### owner `string`

**Required**. Your GitHub username.

### repo `string`

**Required**. The name of your GitHub repository. It must be a public repository.

### admin `string[]`

**Required**. A list of Gitalk React administrators. This can include users who have **write access** to this repository: owners and collaborators.

### id `string = location.host + location.pathname`

A unique identifier for the comment topic; length cannot exceed 50 characters.

When creating a comment topic, Gitalk React automatically uses this parameter as a label item for the comment topic and defaults to fetching comments based on it.

For blog-type sites, it is recommended to use the page's `slug` as this parameter.

### number `number`

The number of the comment topic.

If this parameter is specified, then Gitalk React will fetch comments based on it rather than using the identifier.

### labels `string[] = ["Gitalk"]`

Labels for the comment topic.

### title `string = document.title`

The title of the comment topic.

### body `string = location.href + meta[name="description"]`

The content of the comment topic.

### language `string = navigator.language`

The language used by Gitalk React.

Available translations: `ar`, `bn`, `de`, `en`, `es`, `fa`, `fr`, `hi`, `ja`, `ko`, `pl`, `pt`, `ru`, `ur`, `zh-CN`, and `zh-TW`. BCP 47 regional tags such as `fr-FR`, `de-DE`, and `ja-JP` select the base translation. Chinese region and script tags preserve simplified/traditional Chinese (`zh-Hans` / `zh-Hant`). Unsupported or invalid tags use English. Relative comment dates use `Intl.RelativeTimeFormat` with the same resolved language.

### perPage `number = 10`

The number of comments loaded per page; cannot exceed 100.

### pagerDirection `"last" | "first" = "last"`

The sorting method for comments. `last` indicates descending order by creation time, while `first` indicates ascending order by creation time.

### createIssueManually `boolean = false`

When a comment topic does not exist, Gitalk React will automatically create a new one for you.

If you prefer to create a comment topic manually by clicking a button after logging in as an administrator, set this to `true`.

### enableHotKey `boolean = true`

Whether to enable hotkeys like `cmd + enter` or `ctrl + enter` to publish comments.

### distractionFreeMode `boolean = false`

Whether to enable full-screen overlay effects similar to Facebook's comment box.

### proxy `string`

When `clientSecret` is provided, this is an optional CORS relay URL. It defaults to `https://cors-anywhere.azm.workers.dev/https://github.com/login/oauth/access_token`. You can select another CORS service. Gitalk sends a POST request containing the code, client ID and secret; the relay solves the browser's cross-origin restriction while GitHub still validates the OAuth credentials.

When `clientSecret` is omitted, `proxy` is required and must point to your server-side OAuth exchange endpoint. Gitalk sends a GET request with only the authorization code as an encoded `code` query parameter, preserving existing query parameters. The server stores the credentials and returns JSON `{ "access_token": "..." }`. A failed exchange does not switch modes.

### defaultUser `{ avatar_url: string; login: string; html_url: string }`

The default user used when the comment user does not exist.

`avatar_url` is the user's avatar URL, `login` is the username, and `html_url` is the page to which users are redirected when clicked. Default values:

```json
{
  "avatar_url": "//avatars1.githubusercontent.com/u/29697133?s=50",
  "login": "null",
  "html_url": ""
}
```

### collapsedHeight `number`

When the height of the comment exceeds `${collapsedHeight}px`, it will automatically collapse to `${collapsedHeight}px`.

### highlightAdminComment `boolean = true`

Whether to highlight comments published by administrators, which have additional shadow effects.

### updateCountCallback `(count: number) => void`

Callback method invoked when updating the number of comments.

### onCreateComment `(comment: CommentType) => void`

Callback method invoked when a comment is successfully created.

## Theming

### Colors

You can quickly modify Gitalk React's theme colors to match your site's style by setting CSS variables.

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
  --gt-color-comment-collapse-bg: linear-gradient(
    rgb(245 245 245 / 10%),
    rgb(245 245 245 / 90%)
  );
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
  --gt-color-comment-collapse-bg: linear-gradient(
    rgb(20 20 20 / 10%),
    rgb(20 20 20 / 90%)
  );
  --gt-color-link-active: #fafafa;
  --gt-color-btn: #eee;
  --gt-color-popbg: #171717;
}
```

### Animation

Comments use native CSS accordion/fade animations for entry and exit, and CSS transform transitions when reordered. Animations last 0.3 seconds and respect `prefers-reduced-motion`. The animation library options and default-options export have been removed; customize `.gt-comment-item` in CSS.

## Proxy Deployment

The [included Node proxy](./proxy-server/README.md) requires Node.js 22 or newer and no additional packages. Copy `proxy-server/.env.example` to `proxy-server/.env.local`, then set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `ALLOWED_ORIGIN` on the server. The origin must match your site origin exactly, without a path or trailing slash.

```bash
npm run start:proxy
```

Use `http://localhost:3000/oauth/access_token` locally. In production, put the proxy behind HTTPS and set the component's `proxy` to its public endpoint. Disable query-string logging and caching for this endpoint, since its URL contains a one-time authorization code. The browser `clientID` must match the server's OAuth App.

The preview uses this server-side mode exclusively. Local Vite development forwards `/oauth/access_token` to the local proxy. For a static preview deployment, set `VITE_PROXY` to a deployed HTTPS endpoint before building; GitHub Pages cannot host the Node proxy.

## Developer

Create a `.env.local` file in your project's root directory and add development environment variables as follows:

```bash
VITE_CLIENT_ID="YOUR_GITHUB_OAUTH_APP_CLIENT_ID"
VITE_PROXY="http://localhost:3000/oauth/access_token"
VITE_REPO_OWNER="YOUR_GITHUB_USERNAME"
VITE_REPO_NAME="YOUR_REPO_NAME"
VITE_ADMIN='["YOUR_GITHUB_USERNAME"]'
```

### Development

Install dependencies:

```bash
yarn
```

Debug in your browser during development:

```bash
yarn dev
```

Run test:

```bash
yarn test
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

## Features under Development

- [ ] Feature: Support editing comments published by the user in Gitalk React.
- [x] Feature: Support collapse overly long comments, allowing users to click to expand the comment.
- [ ] refactor: Gradually remove dependencies on non-essential third-party libraries to reduce build size.
- [ ] test: Add automated testing processes to enhance project robustness.
- [x] chore: Deploy [preview environment](https://lolipopj.github.io/gitalk-react/).

## License

[MIT](./LICENSE)

[npm-version-image]: https://img.shields.io/npm/v/gitalk-react.svg?style=flat-square
[npm-version-url]: https://www.npmjs.com/package/gitalk-react
[gzip-size]: https://img.badgesize.io/https://unpkg.com/gitalk-react/dist/gitalk.umd.cjs?compression=gzip&style=flat-square
[gzip-url]: https://unpkg.com/gitalk-react/dist/gitalk.umd.cjs
