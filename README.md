# Gitalk React

使用 TypeScript, React 和 Vite 重新实现 [Gitalk](https://github.com/gitalk/gitalk) —— 基于 Github 议题的评论组件。

面向现代浏览器开发，专注于减少构建包的体积，提升使用体验。

## 与原版的区别

- 不兼容旧浏览器，仅保证兼容支持 [ES2020](https://caniuse.com/?feats=mdn-javascript_operators_optional_chaining,mdn-javascript_operators_nullish_coalescing,mdn-javascript_builtins_globalthis,es6-module-dynamic-import,bigint,mdn-javascript_builtins_promise_allsettled,mdn-javascript_builtins_string_matchall,mdn-javascript_statements_export_namespace,mdn-javascript_operators_import_meta) 的现代浏览器。
- 依赖 React 运行时环境：`react >= 16.8.0 && react-dom >= 16.8.0`。
- 使用 `.scss` 作为样式预处理器，而非 `.styl`。

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

执行 `yarn build` 命令，打包构建组件。
