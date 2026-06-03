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

Automated via `.github/workflows/release.yml`. To ship a release:

```bash
# bump the version
npm version patch -w packages/graffiti        # or minor / major
git push && git push --tags                   # the tag push triggers publish
```

The workflow verifies the tag matches `package.json`, builds, and
publishes `@jodiak/graffiti` to npm with provenance attestation.

Local dry run before pushing a tag:

```bash
npm run build -w packages/graffiti
npm pack -w packages/graffiti --dry-run
```

## Stack

React 19, TypeScript, Vite 8, npm workspaces.

## Roadmap

v0.2 will add a plugin API (custom tools, overlays, toolbar
contributions, custom annotation types) with a zoom-into-region plugin
as the dogfooding example.
