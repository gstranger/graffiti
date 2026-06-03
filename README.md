# Graffiti

A telestrator-style React component for drawing on HTML5 video. You
pause, draw, resume; the drawing replays in sync with playback the
next time you hit that moment in the timeline.

This repo contains two things:

- `src/components/Graffiti/`, the reusable `<Graffiti />` component
- `src/App.tsx`, a Vite demo that mounts it against a sample clip

## What it does

- **Drawing tools**: pen, marker (translucent), arrow with arrowhead,
  text with a drop shadow, plus a `select` mode that lets the video
  play through normally.
- **Sportscaster replay**: each annotation records its draw timestamp
  (the video time) and the wall-clock duration it took to draw. On
  playback, the video pauses when the timeline reaches an annotation,
  the drawing animates at the speed it was originally drawn, then the
  video resumes.
- **Timeline scrubbing**: click and drag anywhere on the timeline to
  scrub. The video pauses while you're scrubbing and resumes if it
  was playing.
- **Playback speed**: 0.25× / 0.5× / 1× / 2× buttons for slow-motion
  review.
- **Loop region**: set `[` and `]` at the current time to define an
  in/out range. Playback wraps back to the in-point automatically.
- **Annotation markers**: every annotation drops a dot on the
  timeline. Click to jump to that moment.

## Run the demo

```bash
npm install
npm run dev
```

Vite serves on `http://localhost:5173` (or the next free port). The
demo loads a 10-second Big Buck Bunny clip; replace `SAMPLE_VIDEO` in
`src/App.tsx` to point at your own file.

## Component API

```tsx
import { Graffiti } from './components/Graffiti';
import type { Annotation } from './components/Graffiti';

<Graffiti
  src="https://example.com/clip.mp4"
  width={800}
  height={450}
  initialAnnotations={[]}
  onAnnotationAdd={(anno: Annotation) => save(anno)}
  onAnnotationRemove={(id: string) => unsave(id)}
/>
```

Props:

| Prop                 | Type                            | Notes                                  |
| -------------------- | ------------------------------- | -------------------------------------- |
| `src`                | `string`                        | Video URL. Required.                   |
| `width`, `height`    | `number`                        | Default 640 × 360.                     |
| `className`          | `string`                        | Applied to the outer wrapper.          |
| `initialAnnotations` | `Annotation[]`                  | Hydrate from storage on mount.         |
| `onAnnotationAdd`    | `(a: Annotation) => void`       | Fires when a new annotation commits.   |
| `onAnnotationRemove` | `(id: string) => void`          | Fires from `Clear all`.                |

`Annotation` is a discriminated union of `Stroke | Arrow | TextAnnotation`.
See `src/components/Graffiti/types.ts` for the full shape.

## Is there a published React SDK?

Not yet. This is a Vite app, not a library:

- `package.json` is `"private": true` with no `main`, `module`,
  `exports`, or `types` fields.
- `react` and `react-dom` are listed as `dependencies` rather than
  `peerDependencies`.
- There's no library build target. `npm run build` emits a static
  site, not a distributable bundle.

To ship `<Graffiti />` as a real SDK you'd want to:

1. Add a Vite library build (`build.lib`) emitting ESM + CJS with
   externalized React, plus `.d.ts` via `vite-plugin-dts`.
2. Set `main` / `module` / `types` / `exports` in `package.json` and
   move React to `peerDependencies`.
3. Drop `"private": true` and publish to npm (or a GitHub Packages
   registry).
4. Extract the CSS to a separate import (`import 'graffiti/style.css'`)
   so consumers can opt in.

The component code itself is already structured for this: it doesn't
reach outside its folder, it owns its own styles, and the public
exports in `index.ts` are stable.

## CI

`.github/workflows/ci.yml` runs lint, typecheck, and build on push to
`main` and on pull requests. Node 22.

## Stack

React 19, TypeScript, Vite 8.
