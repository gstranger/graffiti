# @jodiak/graffiti

Telestrator-style React component for drawing on HTML5 video. Pause,
draw, resume; the drawing replays in sync with playback the next time
you reach that moment in the timeline.

## Install

```bash
npm i @jodiak/graffiti
```

`react` and `react-dom` (>=18 <20) are peer dependencies.

## Use

```tsx
import { Graffiti, type Annotation } from '@jodiak/graffiti';
import '@jodiak/graffiti/style.css';

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
