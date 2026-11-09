# AGENTS.md

Gitalk React is a published npm package (`gitalk-react`): a GitHub Issues–based comment component rewritten with TypeScript, React, and Vite. It ships ESM/CJS builds, two IIFE browser bundles, light/dark CSS, and an optional OAuth proxy server. Read [README.md](README.md) (options, theming, proxy deployment) before changing public behavior. Public API, CSS variables, and the `proxy-server/` protocol are consumer-facing; treat changes to them as breaking unless backward compatible.

## Repository layout

```
lib/                 Library source (published)
  gitalk.tsx           Main component and exports (`"use client"`)
  browser.ts           IIFE entry; React/ReactDOM are externals (global `Gitalk`)
  browser-full.ts      IIFE entry that bundles latest React (`react-latest` alias)
  components/          UI components; contexts/ (I18nContext), constants/, interfaces/ (public types)
  services/            Octokit client, OAuth/user, GraphQL queries (graphql/comment.ts)
  utils/               storage, mentions, reactions, date, logger, browser compatibility checks
  i18n/                16 locale JSON files + index.ts (`i18nMap`)
  themes/              base.scss, gitalk-light.scss, gitalk-dark.scss → dist/*.css
dev/                 Local preview app (Vite; also deployed to GitHub Pages as `out/`)
proxy-server/        Dependency-free Node OAuth code-exchange server (published; see its README)
types/gitalk.d.cts   Hand-written CommonJS typings, copied into `dist/` after the build
test/                `node:test` suites (.mjs); `test/helpers/source.mjs` loads `lib/*.ts` into a VM
vite.config*.ts      lib (ES/CJS + bundled .d.mts), browser (IIFE), scss, preview configs
dist/, out/          Build outputs, Git-ignored
docs/                Git-ignored local audit notes and scratch worktrees; not source, do not edit or commit
```

## Commands

```sh
pnpm install                        # packageManager is pinned in package.json; Node ≥ 22 for proxy-server
pnpm run dev                        # Vite preview app (needs .env.local, see README "Developer")
pnpm run start:proxy                # local OAuth proxy (needs proxy-server/.env.local)
pnpm run lint                       # eslint --fix + stylelint --fix (rewrites files)
pnpm run build                      # tsc -b, then lib, browser, scss, preview builds
pnpm run test                       # full build + node --test test/*.test.mjs (also run by prepack)
node --test test/oauth.test.mjs     # one suite; most suites load lib/*.ts directly and need no build
```

`test/browser.test.mjs` reads `dist/` and `test/package.test.mjs` runs `npm pack` and type-checks ESM/CJS consumers, so run `pnpm run build` before them. Before finishing a change, run `pnpm run lint` and the relevant suites; run `pnpm run test` for changes to exports, build config, `types/`, or `package.json`. Note that `lint` and `test` rewrite or create files (`--fix`, build outputs).

## Secrets / .env

- `.env` (Vite, Git-ignored) and `.env.local` hold dev values; `proxy-server/.env.local` holds `GITHUB_CLIENT_SECRET`. Never commit them, print them, or copy them into the repository's docs or tests.
- **The OAuth client secret is server-only.** Never expose it through `VITE_*` variables, component props in `dev/`, the preview build, or logs. The browser flow uses `proxy`; the legacy `clientSecret` prop exists only for deployments that accept the exposure and must stay documented as unsafe.
- Never log access tokens, OAuth codes, or `state`. Keep `Cache-Control: no-store` and the origin check in `proxy-server/server.mjs`; changes there need updates to `test/server.test.mjs` and `proxy-server/README.md`.

## Conventions

- **Compatibility floor:** peer dependency `react >=16.8` (types are `@types/react@16`), target `ES2020`, classic JSX runtime (`import React`, no automatic runtime). Do not use React 17+ only APIs, newer syntax, or browser APIs without a feature check in `utils/compatibility.ts`. `react-latest`/`react-dom-latest` exist only to build and test the full browser bundle.
- Source is ESM TypeScript with `strict`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `noUnusedParameters`, and `noImplicitReturns`. Prettier defaults (via ESLint); imports sorted by `simple-import-sort`; React Hooks rules are errors (`exhaustive-deps` included). SCSS is checked by stylelint with ordered properties.
- **Public API changes** touch `lib/interfaces`, README option sections (`README.md` and `README-zh-CN.md`), and `types/gitalk.d.cts` together. `package.test.mjs` verifies that consumers resolve types; keep it passing.
- **Packaging:** `exports`, `main`/`module`/`unpkg`/`jsdelivr`, and `files` in `package.json` define the contract; adding an output requires updating them and `package.test.mjs`. CSS entry points `gitalk.css`, `light.css`, `dark.css` must keep working.
- **i18n:** a new string key goes into all 16 `lib/i18n/*.json` files (keys are nested; keep identical structure) and is read through the `i18n` context, never hard-coded. A new language is registered in `i18nMap`.
- **Theming:** colors, sizes, and animation are CSS variables on `.gt-container`; do not hard-code colors in components. Keep light and dark themes in step and update the README variable list when variables change.
- **Storage and network must tolerate failure:** `localStorage`/`sessionStorage` access goes through `utils/storage.ts`; GitHub requests go through `services/request.ts`. Handle 401 by clearing the token, and surface failures through the UI instead of throwing during render. Preserve unsent comment drafts across login.
- Log with the `Logger` in `utils/logger.ts`, not `console.*`; it is quiet by default in production.
- Comments explain non-obvious behavior or compatibility reasons, not control flow. Keep existing English style.
- Tests are behavior-oriented `node:test` + `node:assert/strict` in `.mjs`; use `loadSource` and injected fakes rather than real network or GitHub credentials. Add or update a test with every behavior change.
- Commit messages use Conventional Commits (`feat:`, `fix(scope):`, `docs:`, `ci:`); a release is a `release x.y.z` commit that bumps `package.json`. The preview site deploys from `main` through `.github/workflows/deployment.yml`.

## Docs

`README.md` is the source of truth; `README-zh-CN.md` mirrors it and both are published in the package. Update both in the same change. `proxy-server/README.md` owns proxy deployment details; link to it instead of copying.
