# Graffiti v0.1: SDK Split Design

**Status:** Approved (brainstorm), pending implementation plan
**Date:** 2026-06-02
**Scope:** Restructure the repo into an npm workspaces monorepo so
`<Graffiti />` can be consumed as a real npm package. Set up the
publish pipeline but do not publish yet. Make small refactors that
keep the future plugin API (v0.2) unblocked.

## Goal

Today the Graffiti component lives inside a Vite app and cannot be
installed by other projects. The component itself has a clean API and
owns its styles; the structural issue is purely packaging. v0.1 splits
the repo into two workspaces:

- `packages/graffiti`, the library that will be published to npm
- `examples/demo`, the existing Vite app, consuming the library as a
  workspace dependency

After v0.1 a user can clone the repo, run `npm install && npm run
dev`, and get the same demo experience they have today. They can also
take `packages/graffiti`, `npm pack` it, install the tarball in any
other React project, import the component, and use it against their
own video.

## Non-goals (v0.1)

- Running `npm publish`. The package is structured for publish; the
  publish command is a manual user action after smoke-testing.
- A plugin API. Plugins land in v0.2 and get their own spec.
- The zoom plugin. Designed-for but not built.
- Storybook, automated visual tests, a deployed demo URL.
- Changesets, semantic-release, or any other release automation.
- CJS output. ESM only.

## Decisions (from brainstorm)

| Decision               | Choice                                | Rationale                                                        |
| ---------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| Repo shape             | npm workspaces monorepo               | Cheapest dev loop; lib + demo iterate together                   |
| Phasing                | Split + publish-ready in v0.1         | Smaller blast radius; lib stabilizes before plugin contract      |
| Publish target         | npm public, name TBD by user          | Not in v0.1 scope; pipeline is ready                             |
| CSS delivery           | Separate import (`graffiti/style.css`)| Standard React lib pattern; SSR-safe; consumer can override      |
| Build target           | ESM only                              | Industry default in 2026; lower complexity                       |
| Build tool             | Vite library mode + `vite-plugin-dts` | Already using Vite; one-line config                              |
| Type bundling          | `rollupTypes: true`                   | Single `index.d.ts`; cleanest consumer experience                |
| React peer dep         | `>=18 <20`                            | Component uses standard hooks only                               |
| Dev process            | Two processes (lib `--watch` + demo)  | Dogfoods the built artifact; catches public-API breaks immediately |
| Workspace tool         | npm workspaces                        | Zero new tooling; sufficient for two packages                    |

## Repo layout (target)

```
graffiti/
├── package.json                # workspace root, "private": true
├── tsconfig.base.json          # shared compiler opts
├── tsconfig.json               # references the two packages
├── .github/workflows/ci.yml    # updated for workspaces
├── docs/superpowers/specs/     # this file lives here
├── packages/
│   └── graffiti/
│       ├── package.json        # "name": "graffiti", peerDeps react
│       ├── tsconfig.json       # extends base, lib settings
│       ├── vite.config.ts      # library build
│       ├── README.md           # ships to npm
│       └── src/
│           ├── index.ts
│           ├── Graffiti.tsx
│           ├── Graffiti.css
│           └── types.ts
└── examples/
    └── demo/
        ├── package.json        # depends on "graffiti": "*"
        ├── tsconfig.app.json
        ├── tsconfig.node.json
        ├── tsconfig.json
        ├── vite.config.ts
        ├── index.html
        ├── public/
        └── src/
            ├── main.tsx
            ├── App.tsx
            ├── App.css
            ├── index.css
            └── assets/
```

## Move list

Every existing source file moves; git history is preserved via `git
mv`. Nothing is rewritten.

| Current                                   | New                                       |
| ----------------------------------------- | ----------------------------------------- |
| `src/components/Graffiti/Graffiti.tsx`    | `packages/graffiti/src/Graffiti.tsx`      |
| `src/components/Graffiti/Graffiti.css`    | `packages/graffiti/src/Graffiti.css`      |
| `src/components/Graffiti/types.ts`        | `packages/graffiti/src/types.ts`          |
| `src/components/Graffiti/index.ts`        | `packages/graffiti/src/index.ts`          |
| `src/App.tsx`                             | `examples/demo/src/App.tsx`               |
| `src/App.css`                             | `examples/demo/src/App.css`               |
| `src/main.tsx`                            | `examples/demo/src/main.tsx`              |
| `src/index.css`                           | `examples/demo/src/index.css`             |
| `src/assets/*`                            | `examples/demo/src/assets/*`              |
| `public/*`                                | `examples/demo/public/*`                  |
| `index.html`                              | `examples/demo/index.html`                |
| `vite.config.ts`                          | `examples/demo/vite.config.ts`            |
| `tsconfig.app.json`                       | `examples/demo/tsconfig.app.json`         |
| `tsconfig.node.json`                      | `examples/demo/tsconfig.node.json`        |
| `tsconfig.json`                           | `examples/demo/tsconfig.json` (and a new root one) |
| `eslint.config.js`                        | Stays at root, extended by each workspace |

The internal `src/components/Graffiti/index.ts` re-export becomes the
package's public entry. Its contents do not change.

## Library package: `packages/graffiti/package.json`

```jsonc
{
  "name": "graffiti",
  "version": "0.1.0",
  "type": "module",
  "description": "Telestrator-style React component for drawing on HTML5 video.",
  "license": "MIT",
  "repository": "github:gstranger/graffiti",
  "files": ["dist"],
  "sideEffects": ["**/*.css"],
  "main": "./dist/graffiti.js",
  "module": "./dist/graffiti.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/graffiti.js"
    },
    "./style.css": "./dist/graffiti.css"
  },
  "peerDependencies": {
    "react": ">=18 <20",
    "react-dom": ">=18 <20"
  },
  "devDependencies": {
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "vite": "^8.0.12",
    "vite-plugin-dts": "^4",
    "typescript": "~6.0.2"
  },
  "scripts": {
    "build": "vite build",
    "dev": "vite build --watch",
    "lint": "eslint src"
  }
}
```

Notes:

- `sideEffects: ["**/*.css"]` tells bundlers the JS is tree-shakeable
  but a `graffiti/style.css` import must be preserved.
- `peerDependencies` declare React. `react` is also in `devDependencies`
  so the library's own dev/build environment has it.
- `files: ["dist"]` means `npm pack` ships only the built output, not
  source or tests.

## Library build: `packages/graffiti/vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [react(), dts({ rollupTypes: true, include: ['src'] })],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'graffiti',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    sourcemap: true,
  },
});
```

Output:

```
packages/graffiti/dist/
├── graffiti.js          # ESM bundle
├── graffiti.css         # extracted stylesheet
├── graffiti.js.map      # sourcemap
└── index.d.ts           # rolled-up declarations
```

## Library README

A focused README ships inside `packages/graffiti/` describing only the
component: install, import, prop table, types reference. The repo-root
README continues to describe the project (demo, contributing, CI). The
two are distinct audiences.

## Demo package: `examples/demo/package.json`

```jsonc
{
  "name": "graffiti-demo",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "graffiti": "*",
    "react": "^19.2.6",
    "react-dom": "^19.2.6"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.0.1",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "typescript": "~6.0.2",
    "vite": "^8.0.12"
  }
}
```

`"graffiti": "*"` resolves through npm workspaces to the local
`packages/graffiti`. The demo imports from the *built* artifact in
`dist/`, not from source. This is intentional: every dev session
exercises the same surface a real consumer sees, and any breakage in
the public API surfaces immediately in the demo.

`App.tsx` import block changes; nothing else in the demo does:

```tsx
// before
import { Graffiti } from './components/Graffiti';
import type { Annotation } from './components/Graffiti';

// after
import { Graffiti, type Annotation } from 'graffiti';
import 'graffiti/style.css';
```

The Big Buck Bunny URL, the annotation logging callbacks, and the
debug section are untouched.

## Root scripts and dev loop

```jsonc
// package.json (root)
{
  "private": true,
  "workspaces": ["packages/*", "examples/*"],
  "scripts": {
    "dev":      "npm-run-all -p dev:lib dev:demo",
    "dev:lib":  "npm run dev -w packages/graffiti",
    "dev:demo": "npm run dev -w examples/demo",
    "build":    "npm run build -w packages/graffiti && npm run build -w examples/demo",
    "lint":     "npm run lint --workspaces --if-present",
    "typecheck":"tsc -b"
  },
  "devDependencies": {
    "npm-run-all2": "^7"
  }
}
```

`npm run dev` from the repo root runs the library's watch build and
the demo dev server in parallel. Saving a library source file rebuilds
`dist/`; Vite's HMR in the demo picks up the change.

Adds one dev dep, `npm-run-all2` (the maintained fork of
`npm-run-all`). A documented alternative is using two terminals; we
default to the single-command experience.

## TypeScript project references

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "composite": true,
    "declaration": true
  }
}
```

```jsonc
// tsconfig.json (root)
{
  "files": [],
  "references": [
    { "path": "packages/graffiti" },
    { "path": "examples/demo" }
  ]
}
```

```jsonc
// packages/graffiti/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

```jsonc
// examples/demo/tsconfig.json (root for the demo project)
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "../../packages/graffiti" }
  ]
}
```

The reference from the demo to the library means TypeScript follows
the symlink to source for editor-level go-to-definition. Runtime
imports still resolve to `dist/` via the `exports` field.

## CI updates

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run lint --workspaces --if-present
      - run: npm run typecheck
      - run: npm run build -w packages/graffiti
      - run: npm run build -w examples/demo
      - uses: actions/upload-artifact@v4
        with:
          name: graffiti-dist
          path: packages/graffiti/dist
          retention-days: 7
```

The dist upload lets you download the build, run `npm pack` against
it, and smoke-test the tarball in an external consumer before
publishing.

## Plugin-readiness constraints (soft)

v0.1 ships zero plugin API. Three small choices keep the v0.2 plugin
spec from inheriting avoidable problems:

1. **No internal exports.** `packages/graffiti/src/index.ts` exports
   only the component and its types. We do not export internal hooks,
   refs, or helpers. If consumers start importing internals, every
   future plugin contract becomes a backwards-compat negotiation.

2. **Discriminated union with `type` field.** Today's `Stroke`,
   `Arrow`, and `TextAnnotation` types are distinguished structurally
   (`'points' in anno`, `'start' in anno`, `'text' in anno`). Add a
   `type: 'stroke' | 'arrow' | 'text'` field to each and switch the
   internal branching to use it. Plugin-defined annotation types will
   slot into the same pattern in v0.2 without rewriting the rendering
   pipeline. This is a small, contained refactor done as part of the
   move.

3. **Toolbar driven by data.** The current toolbar is a hardcoded
   array literal `['pen', 'marker', 'arrow', 'text', 'select']` mapped
   in JSX. Extract a typed `ToolDescriptor` ({ id, label, icon }) and
   render the toolbar by mapping the array. v0.2 plugins contribute
   tool descriptors. Also a contained refactor.

Items 2 and 3 are part of the move PR. Item 1 is policy enforced by
code review and by what `index.ts` exports.

## Verification

The split is correct iff all of these hold after the change:

- `npm install` at the root succeeds with no warnings about peer deps.
- `npm run dev` opens the demo, the video plays, all existing tools
  (pen, marker, arrow, text, scrub, speed, loop) work as they did
  before.
- `npm run build -w packages/graffiti` emits `dist/graffiti.js`,
  `dist/graffiti.css`, `dist/index.d.ts`, and a sourcemap.
- `npm run build -w examples/demo` succeeds with the demo importing
  `from 'graffiti'`.
- `npm run typecheck` passes for both workspaces.
- `npm run lint` passes for both workspaces (warnings allowed,
  errors not).
- `cd packages/graffiti && npm pack` produces a tarball whose contents
  are exactly `dist/`, the README, package.json, and license.
- Installing that tarball in a scratch Vite app, importing `Graffiti`
  and the stylesheet, and rendering against a test video produces a
  working component (smoke test, not automated in CI for v0.1).
- `git log --follow` on any moved file still shows pre-move history.
- CI on the PR is green.

## Open questions

None blocking. The npm package name (`graffiti` vs scoped) is deferred
to whenever the user runs `npm publish`.

## Out of scope, documented for the v0.2 spec

- Plugin contract: tool contributions, overlay contributions,
  toolbar contributions, lifecycle hooks, custom annotation types.
- Plugin registration API and idempotency semantics.
- Zoom plugin (the dogfooding driver for the plugin contract).
- Publishing each plugin as its own package
  (`@gstranger/graffiti-plugin-zoom` style).
