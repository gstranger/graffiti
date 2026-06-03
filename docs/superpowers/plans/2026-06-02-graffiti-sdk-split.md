# Graffiti SDK Split (v0.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the repo into an npm workspaces monorepo with `packages/graffiti` (publishable library) and `examples/demo` (existing Vite app consuming it), so the component can be installed and used in any React project.

**Architecture:** Two-package npm workspace. Library builds ESM + bundled `.d.ts` via Vite library mode + `vite-plugin-dts`. Demo depends on the library with `"graffiti": "*"`, npm resolves it to the workspace symlink. Root `tsc -b` walks TypeScript project references. CI builds both packages; library `dist/` is uploaded as an artifact for manual smoke testing before publish.

**Tech Stack:** npm workspaces, TypeScript 6, Vite 8 (library mode), vite-plugin-dts 4, React 19 (peer >=18 <20), ESLint flat config, GitHub Actions, npm-run-all2 for parallel dev script.

**Spec:** `docs/superpowers/specs/2026-06-02-graffiti-sdk-split-design.md`

**Verification model:** This work is structural rather than logic-driven. The project ships no test framework today (out of scope for v0.1). Each task is verified by the appropriate combination of: TypeScript typecheck, ESLint, the library build emitting expected artifacts, the demo Vite build succeeding, and human-driven verification of the demo at `npm run dev` (load page, draw with each tool, scrub, change speed, set loop, observe replay).

---

## Phase A: In-place refactors for plugin-readiness

These two refactors are described in the spec as constraints, not behavioral changes. Doing them in the existing layout first means git history is clean: refactor commits stay separate from move commits. The demo must keep working unchanged after each one.

### Task 1: Add `type` discriminator to Annotation types

**Files:**
- Modify: `src/components/Graffiti/types.ts`
- Modify: `src/components/Graffiti/Graffiti.tsx`

- [ ] **Step 1: Add `type` field to each annotation interface**

Edit `src/components/Graffiti/types.ts`:

```ts
export type Tool = 'pen' | 'marker' | 'arrow' | 'text' | 'select';

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  type: 'stroke';
  id: string;
  points: (Point & { t: number })[];
  color: string;
  width: number;
  tool: 'pen' | 'marker';
  timestamp: number;
  duration: number;
}

export interface Arrow {
  type: 'arrow';
  id: string;
  start: Point;
  end: Point;
  color: string;
  width: number;
  timestamp: number;
  duration: number;
}

export interface TextAnnotation {
  type: 'text';
  id: string;
  position: Point;
  text: string;
  color: string;
  fontSize: number;
  timestamp: number;
  duration: number;
}

export type Annotation = Stroke | Arrow | TextAnnotation;

export interface GraffitiProps {
  src: string;
  width?: number;
  height?: number;
  className?: string;
  onAnnotationAdd?: (annotation: Annotation) => void;
  onAnnotationRemove?: (id: string) => void;
  initialAnnotations?: Annotation[];
}
```

- [ ] **Step 2: Set `type` when constructing each annotation in `Graffiti.tsx`**

In `src/components/Graffiti/Graffiti.tsx`, find each annotation construction and add the `type` field.

The arrow construction in `handlePointerUp` (currently around line 338):

```tsx
const arrow: Arrow = {
  type: 'arrow',
  id: generateId(),
  start: arrowStart,
  end: previewArrow.end,
  color,
  width: strokeWidth,
  timestamp: currentTime,
  duration: Math.max(200, drawDuration),
};
```

The stroke construction in `handlePointerUp` (currently around line 357):

```tsx
const stroke: Stroke = {
  type: 'stroke',
  id: generateId(),
  points: currentStroke,
  color,
  width: strokeWidth,
  tool: tool === 'marker' ? 'marker' : 'pen',
  timestamp: currentTime,
  duration: Math.max(100, drawDuration),
};
```

The text construction in `handleTextSubmit`:

```tsx
const textAnno: TextAnnotation = {
  type: 'text',
  id: generateId(),
  position: textInput,
  text: textValue.trim(),
  color,
  fontSize: Math.max(14, strokeWidth * 5),
  timestamp: currentTime,
  duration: Math.max(300, drawDuration),
};
```

- [ ] **Step 3: Switch the `drawAnnotation` branching to use `type`**

Find `drawAnnotation` in `Graffiti.tsx` (currently around line 164). Replace the `'points' in anno` / `'start' in anno` / `'text' in anno` checks with a `switch` on `anno.type`:

```tsx
const drawAnnotation = useCallback(
  (ctx: CanvasRenderingContext2D, anno: Annotation, elapsed: number) => {
    const animating = elapsed >= 0 && elapsed < anno.duration && anno.duration > 0;

    switch (anno.type) {
      case 'stroke': {
        let points = anno.points;
        if (animating) {
          const visible = points.filter((p) => p.t <= elapsed);
          if (visible.length < 2) return;
          points = visible;
        }
        drawStroke(ctx, points, anno.color, anno.width, anno.tool);
        return;
      }
      case 'arrow': {
        const { start } = anno;
        let { end } = anno;
        if (animating) {
          const t = Math.max(0, Math.min(1, elapsed / anno.duration));
          end = {
            x: start.x + (anno.end.x - start.x) * t,
            y: start.y + (anno.end.y - start.y) * t,
          };
        }
        drawArrow(ctx, start, end, anno.color, anno.width);
        return;
      }
      case 'text': {
        let text = anno.text;
        let opacity = 1;
        if (animating) {
          const charDuration = anno.duration / anno.text.length;
          const charsToShow = Math.max(0, Math.floor(elapsed / charDuration));
          if (charsToShow <= 0) return;
          text = anno.text.slice(0, charsToShow);
          opacity = Math.min(1, elapsed / anno.duration);
        }
        drawText(ctx, text, anno.position, anno.color, anno.fontSize, opacity);
        return;
      }
    }
  },
  [drawStroke, drawArrow, drawText]
);
```

The cast-via-`as Stroke`/`as Arrow`/`as TextAnnotation` lines from the old branching are removed; the `switch` on a discriminator narrows the type automatically.

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc -b`
Expected: no output, exit 0.

- [ ] **Step 5: Verify lint still passes**

Run: `npm run lint`
Expected: 0 errors. Existing 2 warnings (`react-hooks/exhaustive-deps`) remain; no new ones.

- [ ] **Step 6: Verify the demo still works**

Run: `npm run dev` and open the served URL.

Manually verify: video plays, drawing a pen stroke commits, drawing an arrow commits, typing text commits. Reload the page after each draw to confirm `Annotation added: { type: 'stroke', ... }` (etc.) shows the new `type` field in the debug section.

Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/components/Graffiti/types.ts src/components/Graffiti/Graffiti.tsx
git commit -m "Add type discriminator to Annotation union

Replaces structural narrowing ('points' in anno) with explicit
discriminator. Required for plugin-defined annotation types in v0.2;
no behavior change in v0.1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Extract data-driven toolbar descriptors

**Files:**
- Modify: `src/components/Graffiti/types.ts`
- Modify: `src/components/Graffiti/Graffiti.tsx`

- [ ] **Step 1: Add `ToolDescriptor` to types.ts**

Append to `src/components/Graffiti/types.ts`:

```ts
export interface ToolDescriptor {
  id: Tool;
  label: string;
  icon: string;
}
```

Do not add `ToolDescriptor` to `src/components/Graffiti/index.ts` yet. It stays internal in v0.1; v0.2 will promote it once plugins consume it.

- [ ] **Step 2: Define the `TOOLS` array at module scope in `Graffiti.tsx`**

Add this constant near the top of `src/components/Graffiti/Graffiti.tsx`, just below the `generateId` function:

```tsx
const TOOLS: ToolDescriptor[] = [
  { id: 'pen',    label: 'pen',    icon: '✏️' },
  { id: 'marker', label: 'marker', icon: '🖍️' },
  { id: 'arrow',  label: 'arrow',  icon: '➡️' },
  { id: 'text',   label: 'text',   icon: 'T' },
  { id: 'select', label: 'select', icon: '👆' },
];
```

Add `ToolDescriptor` to the type-only import from `./types`:

```tsx
import type {
  Annotation,
  Arrow,
  GraffitiProps,
  Point,
  Stroke,
  TextAnnotation,
  Tool,
  ToolDescriptor,
} from './types';
```

- [ ] **Step 3: Replace the inline tool buttons with a map over `TOOLS`**

Find the existing tool button block in the JSX (currently around lines 465–478):

```tsx
{(['pen', 'marker', 'arrow', 'text', 'select'] as Tool[]).map((t) => (
  <button
    key={t}
    className={tool === t ? 'active' : ''}
    onClick={() => setTool(t)}
    title={t}
  >
    {t === 'pen' && '✏️'}
    {t === 'marker' && '🖍️'}
    {t === 'arrow' && '➡️'}
    {t === 'text' && 'T'}
    {t === 'select' && '👆'}
  </button>
))}
```

Replace it with:

```tsx
{TOOLS.map((t) => (
  <button
    key={t.id}
    className={tool === t.id ? 'active' : ''}
    onClick={() => setTool(t.id)}
    title={t.label}
  >
    {t.icon}
  </button>
))}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc -b`
Expected: no output, exit 0.

- [ ] **Step 5: Verify lint passes**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 6: Verify the toolbar renders identically**

Run: `npm run dev`. Open the page. Confirm the same five tool buttons appear in the same order with the same icons, that clicking each one activates it (blue background), and that switching from pen → marker → arrow → text → select works exactly as before.

Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/components/Graffiti/types.ts src/components/Graffiti/Graffiti.tsx
git commit -m "Extract tool descriptors to enable data-driven toolbar

Refactors the hardcoded tool list into a TOOLS: ToolDescriptor[]
array mapped in JSX. ToolDescriptor stays internal in v0.1; v0.2
plugins will contribute entries to this array.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase B: File moves

Mechanical moves with `git mv` to preserve history. The repo is intentionally in a broken state at the end of this phase; Phase C fixes it. Do not push between Phase B and Phase C.

### Task 3: Create the new directory skeleton

**Files:**
- Create: `packages/graffiti/src/` (directory)
- Create: `examples/demo/src/` (directory)
- Create: `examples/demo/public/` (directory)

- [ ] **Step 1: Make the directories**

Run:
```bash
mkdir -p packages/graffiti/src examples/demo/src examples/demo/public
```

Expected: no output.

- [ ] **Step 2: Verify directories exist**

Run: `ls -d packages/graffiti/src examples/demo/src examples/demo/public`
Expected: all three paths listed, none missing.

---

### Task 4: Move library source files

**Files:**
- Move: `src/components/Graffiti/Graffiti.tsx` → `packages/graffiti/src/Graffiti.tsx`
- Move: `src/components/Graffiti/Graffiti.css` → `packages/graffiti/src/Graffiti.css`
- Move: `src/components/Graffiti/types.ts` → `packages/graffiti/src/types.ts`
- Move: `src/components/Graffiti/index.ts` → `packages/graffiti/src/index.ts`

- [ ] **Step 1: git mv each file**

```bash
git mv src/components/Graffiti/Graffiti.tsx packages/graffiti/src/Graffiti.tsx
git mv src/components/Graffiti/Graffiti.css packages/graffiti/src/Graffiti.css
git mv src/components/Graffiti/types.ts     packages/graffiti/src/types.ts
git mv src/components/Graffiti/index.ts     packages/graffiti/src/index.ts
```

- [ ] **Step 2: Remove the now-empty `src/components/Graffiti` directory**

```bash
rmdir src/components/Graffiti src/components
```

Expected: no output. (`rmdir` errors only if the directory has remaining contents — if so, list it and figure out what was missed.)

- [ ] **Step 3: Verify the moved files are present and tracked**

```bash
ls packages/graffiti/src
git status --short
```

Expected: four files listed in `packages/graffiti/src` (Graffiti.tsx, Graffiti.css, types.ts, index.ts). `git status` shows renames (`R  src/...  -> packages/graffiti/src/...`).

---

### Task 5: Move demo source files

**Files:**
- Move: `src/App.tsx` → `examples/demo/src/App.tsx`
- Move: `src/App.css` → `examples/demo/src/App.css`
- Move: `src/main.tsx` → `examples/demo/src/main.tsx`
- Move: `src/index.css` → `examples/demo/src/index.css`
- Move: `src/assets/` → `examples/demo/src/assets/`
- Move: `public/` → `examples/demo/public/`
- Move: `index.html` → `examples/demo/index.html`
- Move: `vite.config.ts` → `examples/demo/vite.config.ts`
- Move: `tsconfig.app.json` → `examples/demo/tsconfig.app.json`
- Move: `tsconfig.node.json` → `examples/demo/tsconfig.node.json`
- Move: `tsconfig.json` → `examples/demo/tsconfig.json` (will be rewritten in Phase C; the existing one is kept temporarily for git history)

- [ ] **Step 1: Move the source files**

```bash
git mv src/App.tsx    examples/demo/src/App.tsx
git mv src/App.css    examples/demo/src/App.css
git mv src/main.tsx   examples/demo/src/main.tsx
git mv src/index.css  examples/demo/src/index.css
git mv src/assets     examples/demo/src/assets
```

- [ ] **Step 2: Remove the now-empty `src/` directory**

```bash
rmdir src
```

Expected: no output.

- [ ] **Step 3: Move the public directory**

The empty `examples/demo/public` placeholder from Task 3 has to be removed first; `git mv` won't overwrite an existing directory.

```bash
rmdir examples/demo/public
git mv public examples/demo/public
```

- [ ] **Step 4: Move the html and config files**

```bash
git mv index.html         examples/demo/index.html
git mv vite.config.ts     examples/demo/vite.config.ts
git mv tsconfig.app.json  examples/demo/tsconfig.app.json
git mv tsconfig.node.json examples/demo/tsconfig.node.json
git mv tsconfig.json      examples/demo/tsconfig.json
```

- [ ] **Step 5: Verify the move**

```bash
ls examples/demo
ls examples/demo/src
ls examples/demo/public
git status --short | head -30
```

Expected: `examples/demo` contains `index.html`, `public/`, `src/`, `tsconfig.app.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`. `git status` shows all moves as renames.

The repo root at this point contains: `.git/`, `.github/`, `.gitignore`, `docs/`, `eslint.config.js`, `node_modules/`, `package-lock.json`, `package.json`, `packages/`, `examples/`, `README.md`. No more orphan `src/`, `public/`, `index.html`, or `vite.config.ts` at the root.

---

## Phase C: Workspace configuration

Create the new tsconfigs and package.jsons so the workspace boots. Do not run `npm install` until all configs are written.

### Task 6: Create `tsconfig.base.json` at the root

**Files:**
- Create: `tsconfig.base.json`

- [ ] **Step 1: Write the file**

`tsconfig.base.json`:

```jsonc
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
    "noUncheckedIndexedAccess": true
  }
}
```

Note: `noUncheckedIndexedAccess` is stricter than the project's previous settings. If Phase D typecheck step (Task 14) surfaces new errors caused by this flag in existing code, fix them in the same task — they will be narrow (a couple of array-index accesses in `Graffiti.tsx` may need optional-chaining or guards). Do not silently drop the flag.

---

### Task 7: Rewrite the root `tsconfig.json` to a workspace root

**Files:**
- Create: `tsconfig.json` (replacing the one that was moved to `examples/demo/` in Task 5)

- [ ] **Step 1: Write the file**

`tsconfig.json`:

```jsonc
{
  "files": [],
  "references": [
    { "path": "packages/graffiti" },
    { "path": "examples/demo" }
  ]
}
```

---

### Task 8: Create `packages/graffiti/tsconfig.json`

**Files:**
- Create: `packages/graffiti/tsconfig.json`

- [ ] **Step 1: Write the file**

`packages/graffiti/tsconfig.json`:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "noEmit": true,
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": []
  },
  "include": ["src"]
}
```

Why `composite: true` + `noEmit: true`: composite is required for the demo to reference this project; noEmit prevents `tsc -b` from emitting alongside vite's output (vite-plugin-dts owns emit). TS allows this combination — it walks the graph for type-checking only.

---

### Task 9: Rewrite the demo tsconfigs to extend the base

**Files:**
- Modify: `examples/demo/tsconfig.json`
- Modify: `examples/demo/tsconfig.app.json`
- Modify: `examples/demo/tsconfig.node.json`

The existing `tsconfig.app.json` and `tsconfig.node.json` (moved from root in Task 5) have a lot of useful settings (`erasableSyntaxOnly`, `noUnusedLocals`, etc.) that we want to keep. We're just changing the root tsconfig to point at the library and adding `extends`.

- [ ] **Step 1: Rewrite `examples/demo/tsconfig.json`**

Replace its contents (currently a copy of the old root tsconfig) with:

```jsonc
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "../../packages/graffiti" }
  ]
}
```

- [ ] **Step 2: Add `extends` to `examples/demo/tsconfig.app.json`**

Open the file. Add `"extends": "../../tsconfig.base.json"` as the first key. Also add `"composite": true` (required because it's now referenced) and update `tsBuildInfoFile` to a path inside the demo:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "composite": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Add `extends` and `composite` to `examples/demo/tsconfig.node.json`**

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "module": "esnext",
    "types": ["node"],
    "skipLibCheck": true,
    "composite": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts"]
}
```

---

### Task 10: Create `packages/graffiti/package.json`

**Files:**
- Create: `packages/graffiti/package.json`

- [ ] **Step 1: Write the file**

`packages/graffiti/package.json`:

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

---

### Task 11: Create `packages/graffiti/vite.config.ts`

**Files:**
- Create: `packages/graffiti/vite.config.ts`

- [ ] **Step 1: Write the file**

`packages/graffiti/vite.config.ts`:

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

---

### Task 12: Create `packages/graffiti/README.md`

**Files:**
- Create: `packages/graffiti/README.md`

- [ ] **Step 1: Write the file**

This README ships to npm in the published tarball. Keep it focused on the consumer experience.

`packages/graffiti/README.md`:

```markdown
# graffiti

Telestrator-style React component for drawing on HTML5 video. Pause,
draw, resume; the drawing replays in sync with playback the next time
you reach that moment in the timeline.

## Install

```bash
npm i graffiti
```

`react` and `react-dom` (>=18 <20) are peer dependencies.

## Use

```tsx
import { Graffiti, type Annotation } from 'graffiti';
import 'graffiti/style.css';

export function App() {
  return (
    <Graffiti
      src="https://example.com/clip.mp4"
      width={800}
      height={450}
      onAnnotationAdd={(anno: Annotation) => console.log(anno)}
    />
  );
}
```

## Props

| Prop                 | Type                            | Notes                                  |
| -------------------- | ------------------------------- | -------------------------------------- |
| `src`                | `string`                        | Video URL. Required.                   |
| `width`, `height`    | `number`                        | Default 640 × 360.                     |
| `className`          | `string`                        | Applied to the outer wrapper.          |
| `initialAnnotations` | `Annotation[]`                  | Hydrate from storage on mount.         |
| `onAnnotationAdd`    | `(a: Annotation) => void`       | Fires when a new annotation commits.   |
| `onAnnotationRemove` | `(id: string) => void`          | Fires from `Clear all`.                |

`Annotation` is a discriminated union (`Stroke | Arrow | TextAnnotation`)
with a `type` discriminator field on each variant.

## Features

- Drawing tools: pen, marker, arrow, text, select.
- Replay: annotations animate at original draw speed when playback
  reaches their timestamp; video resumes after.
- Scrubbing: click and drag the timeline.
- Playback speed: 0.25× / 0.5× / 1× / 2×.
- Loop region: `[` and `]` set in/out points; playback wraps.

## License

MIT.
```

---

### Task 13: Create `examples/demo/package.json`

**Files:**
- Create: `examples/demo/package.json`

- [ ] **Step 1: Write the file**

`examples/demo/package.json`:

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

---

### Task 14: Rewrite root `package.json` as workspace root

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Replace its contents**

```jsonc
{
  "name": "graffiti-monorepo",
  "private": true,
  "version": "0.0.0",
  "workspaces": ["packages/*", "examples/*"],
  "scripts": {
    "dev": "npm-run-all -p dev:lib dev:demo",
    "dev:lib": "npm run dev -w packages/graffiti",
    "dev:demo": "npm run dev -w examples/demo",
    "build": "npm run build -w packages/graffiti && npm run build -w examples/demo",
    "lint": "npm run lint --workspaces --if-present",
    "typecheck": "tsc -b"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/node": "^24.12.3",
    "eslint": "^10.3.0",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "globals": "^17.6.0",
    "npm-run-all2": "^7",
    "typescript": "~6.0.2",
    "typescript-eslint": "^8.59.2"
  }
}
```

ESLint and its plugins stay at the root so the existing `eslint.config.js` keeps working. The lib's and demo's own `package.json` files don't duplicate them — workspaces hoist.

The old root `dependencies` (`react`, `react-dom`) are removed; React now belongs to the demo, and the library's peerDeps + devDeps handle its own usage.

---

### Task 15: Update demo's `App.tsx` to import from the `graffiti` package

**Files:**
- Modify: `examples/demo/src/App.tsx`

- [ ] **Step 1: Replace the import lines**

Open `examples/demo/src/App.tsx`. Replace:

```tsx
import { Graffiti } from './components/Graffiti';
import type { Annotation } from './components/Graffiti';
```

with:

```tsx
import { Graffiti, type Annotation } from 'graffiti';
import 'graffiti/style.css';
```

Everything else in the file stays the same.

---

## Phase D: Install, build, and verify

### Task 16: Install dependencies through workspaces

**Files:**
- Modify: `package-lock.json`
- Modify: `node_modules/` (regenerated)

- [ ] **Step 1: Remove the old lockfile and `node_modules`**

The previous lockfile was for a single-package layout and will mislead npm. Clean install:

```bash
rm -rf node_modules package-lock.json
```

- [ ] **Step 2: Install**

```bash
npm install
```

Expected: completes without errors. The `npm-run-all2` package is installed at the root. React and Vite are hoisted into the root `node_modules/`. A symlink appears at `node_modules/graffiti` pointing to `packages/graffiti`.

- [ ] **Step 3: Verify the workspace symlink**

```bash
ls -la node_modules/graffiti
```

Expected: `node_modules/graffiti -> ../packages/graffiti` (symlink, not a directory).

If it's a directory instead of a symlink, workspaces didn't take effect. Re-check the root `package.json` `workspaces` field and re-run `npm install`.

---

### Task 17: Build the library

**Files:**
- Output: `packages/graffiti/dist/`

- [ ] **Step 1: Run the library build**

```bash
npm run build -w packages/graffiti
```

Expected: vite emits `dist/graffiti.js`, `dist/graffiti.js.map`, `dist/graffiti.css`, `dist/index.d.ts`. Build completes in a few seconds with no errors.

- [ ] **Step 2: Inspect the output**

```bash
ls packages/graffiti/dist
cat packages/graffiti/dist/index.d.ts | head -40
```

Expected files: `graffiti.js`, `graffiti.js.map`, `graffiti.css`, `index.d.ts`. The `.d.ts` file exports `Graffiti`, `Annotation`, `Stroke`, `Arrow`, `TextAnnotation`, `Point`, `Tool`, and `GraffitiProps`.

- [ ] **Step 3: Verify `graffiti.css` is non-empty and contains the component styles**

```bash
grep -c '.graffiti' packages/graffiti/dist/graffiti.css
```

Expected: a positive number (the CSS file should contain selectors like `.graffiti`, `.graffiti-toolbar`, etc.).

---

### Task 18: Build the demo

- [ ] **Step 1: Run the demo build**

```bash
npm run build -w examples/demo
```

Expected: typecheck passes (`tsc -b`), then vite emits `examples/demo/dist/`. No errors.

If `noUncheckedIndexedAccess` from the base tsconfig surfaces errors in moved code (most likely in `Graffiti.tsx` accessing array elements), fix them with explicit guards or non-null assertions where safe. Do not weaken the base config.

- [ ] **Step 2: Inspect the output**

```bash
ls examples/demo/dist
```

Expected: at minimum `index.html`, an `assets/` directory containing the bundled JS and CSS.

---

### Task 19: Verify the dev loop

- [ ] **Step 1: Start dev**

```bash
npm run dev
```

Expected: both the library watch build and the demo Vite dev server come up. The library shows `vite v8 building client environment` and `built in Nms`. The demo shows `VITE v8 ready in Nms` with a local URL.

- [ ] **Step 2: Open the demo URL in a browser**

Confirm:
- The page loads. Title shows "🎨 Graffiti".
- The Big Buck Bunny video plays.
- Each tool (pen, marker, arrow, text) works and commits an annotation.
- The annotation appears as a dot on the timeline.
- Replay triggers when playback reaches an annotation.
- Scrubbing the timeline works.
- Speed buttons (0.25× / 0.5× / 1× / 2×) change playback rate.
- Setting loop in `[`, then out `]`, makes playback wrap.

- [ ] **Step 3: Verify HMR across the workspace boundary**

While the dev process is running, open `packages/graffiti/src/Graffiti.css` and change `.graffiti-tools button.active` background from `#0a84ff` to `#ff3b30`. Save.

Expected: the lib watch build rebuilds (a line appears in its output), then the demo reflects the new active-tool color within a second or two. Revert the change.

- [ ] **Step 4: Stop dev**

Ctrl+C, then confirm both processes exit cleanly.

---

### Task 20: Smoke test the library tarball

**Files:**
- Temporary: a scratch directory outside the repo

- [ ] **Step 1: Pack the library**

From the repo root:

```bash
npm pack -w packages/graffiti
```

Expected: produces `graffiti-0.1.0.tgz` in the repo root. Inspect contents:

```bash
tar -tzf graffiti-0.1.0.tgz | head -20
```

Expected: only `package/package.json`, `package/README.md`, and files under `package/dist/`. No source files, no tests, no tsconfigs.

- [ ] **Step 2: Install into a scratch Vite app**

```bash
TARBALL="$(pwd)/graffiti-0.1.0.tgz"
TMP=$(mktemp -d)
cd "$TMP"
npm create vite@latest scratch -- --template react-ts
cd scratch
npm install
npm install "$TARBALL"
```

- [ ] **Step 3: Use the component**

In the scratch app's `src/App.tsx`, replace the body with:

```tsx
import { Graffiti, type Annotation } from 'graffiti';
import 'graffiti/style.css';

export default function App() {
  return (
    <Graffiti
      src="https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4"
      width={640}
      height={360}
      onAnnotationAdd={(a: Annotation) => console.log(a)}
    />
  );
}
```

Run `npm run dev` in the scratch app. Expected: the component renders, the video plays, you can draw on it.

- [ ] **Step 4: Clean up**

```bash
cd /Users/pj/Documents/graffiti
rm -f graffiti-0.1.0.tgz
rm -rf "$TMP"
```

---

### Task 21: Commit the move + restructure

This is one big commit because the in-between states are broken. The refactors in Phase A are already committed separately, so the diff here is purely structural.

- [ ] **Step 1: Stage everything**

```bash
git add -A
```

- [ ] **Step 2: Inspect the staged diff**

```bash
git status --short
git diff --cached --stat
```

Expected status: a long list of renames (`R src/... -> packages/graffiti/src/...`, `R src/App.tsx -> examples/demo/src/App.tsx`, etc.), modifications to `package.json` and the tsconfigs, new files for `packages/graffiti/package.json`, `vite.config.ts`, `README.md`, `examples/demo/package.json`, the new root `tsconfig.json`, and `tsconfig.base.json`. Modification to `package-lock.json`.

- [ ] **Step 3: Commit**

```bash
git commit -m "Split into npm workspaces monorepo

Restructures the repo into packages/graffiti (publishable library)
and examples/demo (existing Vite app, consuming the library via
workspace symlink). Library builds ESM + bundled .d.ts via Vite
library mode and vite-plugin-dts; demo imports from 'graffiti' and
'graffiti/style.css' exactly as a real consumer would.

No public API change. The demo behaves identically.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase E: CI, docs, and final verification

### Task 22: Update the CI workflow

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace the workflow contents**

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

- [ ] **Step 2: Commit and push to trigger CI**

```bash
git add .github/workflows/ci.yml
git commit -m "Update CI for workspace layout

Lints and typechecks at the workspace root, builds both packages,
uploads the library dist as an artifact for pre-publish smoke
testing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

- [ ] **Step 3: Wait for CI to pass**

```bash
gh run watch --exit-status
```

Expected: all steps green. If anything fails, fix it locally and push a follow-up commit.

---

### Task 23: Update the root README

**Files:**
- Modify: `README.md`

The existing README still describes a single-package app and gives `npm install && npm run dev` instructions — those still work. Update the "What it does" / "Run the demo" / "Component API" sections to reflect the monorepo: distinguish library from demo, mention the workspace layout, link to `packages/graffiti/README.md` for the consumer-facing docs.

- [ ] **Step 1: Rewrite the README**

Replace the contents of `README.md` with:

```markdown
# Graffiti

Telestrator-style React component for drawing on HTML5 video. Pause,
draw, resume; the drawing replays in sync with playback the next time
you reach that moment in the timeline.

This repo is an npm workspaces monorepo:

- `packages/graffiti/` — the publishable library. See
  [`packages/graffiti/README.md`](./packages/graffiti/README.md) for
  the consumer-facing docs.
- `examples/demo/` — a Vite app that consumes the library via
  workspace symlink. This is the "what does it look like" entry point.

## Run the demo locally

```bash
npm install
npm run dev
```

`npm run dev` spawns two processes: the library's watch build and the
demo's Vite dev server. Saving a source file under `packages/graffiti/`
rebuilds the library, and the demo HMRs the new build. Open the URL
that Vite prints (usually `http://localhost:5173`).

## Build everything

```bash
npm run build
```

Builds the library first (`packages/graffiti/dist/`) then the demo
(`examples/demo/dist/`).

## What's inside the component

- Drawing tools: pen, marker, arrow, text, select.
- Replay: each annotation records the video time it was drawn at and
  the wall-clock duration of the draw gesture. On playback, the video
  pauses, the drawing animates at the original speed, then the video
  resumes.
- Timeline scrubbing.
- Playback speed (0.25× / 0.5× / 1× / 2×).
- Loop region (`[` and `]` set in/out, playback wraps).

## CI

`.github/workflows/ci.yml` runs lint, typecheck, and builds both
packages on push to `main` and on pull requests. Library `dist/` is
uploaded as an artifact for pre-publish smoke testing.

## Publishing the library

Not yet automated. To ship a release manually:

```bash
npm run build -w packages/graffiti
npm pack -w packages/graffiti                 # produces graffiti-x.y.z.tgz
# smoke-test the tarball in a scratch project
npm publish -w packages/graffiti              # when ready
```

## Stack

React 19, TypeScript, Vite 8, npm workspaces.

## Roadmap

v0.2 will add a plugin API (custom tools, overlays, toolbar
contributions, custom annotation types) with a zoom-into-region plugin
as the dogfooding example.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Update root README for monorepo layout

Distinguishes library from demo, documents the new dev loop, points
at the library README for consumer-facing docs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

- [ ] **Step 3: Verify CI on the README commit**

```bash
gh run watch --exit-status
```

Expected: green.

---

## Final verification checklist

Before declaring done, confirm every item from the spec's Verification section:

- [ ] `npm install` at the root succeeds without peer-dep warnings.
- [ ] `npm run dev` opens the demo; all existing tools (pen, marker, arrow, text, scrub, speed, loop) work as before.
- [ ] `npm run build -w packages/graffiti` emits `graffiti.js`, `graffiti.css`, `graffiti.js.map`, and `index.d.ts` under `packages/graffiti/dist/`.
- [ ] `npm run build -w examples/demo` succeeds and the demo imports `from 'graffiti'`.
- [ ] `npm run typecheck` (root, runs `tsc -b`) passes.
- [ ] `npm run lint` passes for both workspaces (errors must be zero; existing warnings are acceptable).
- [ ] `npm pack -w packages/graffiti` produces a tarball whose contents are exactly `package/dist/`, `package/package.json`, `package/README.md`.
- [ ] Installing that tarball in a scratch Vite app and importing `Graffiti` + the stylesheet renders a working component against a test video.
- [ ] `git log --follow packages/graffiti/src/Graffiti.tsx` shows the file's history back through its time at `src/components/Graffiti/Graffiti.tsx`.
- [ ] CI is green on the latest `main`.

If everything ticks, this plan is complete and the repo is ready for v0.2 plugin-API work.
