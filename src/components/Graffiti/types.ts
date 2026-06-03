export type Tool = 'pen' | 'marker' | 'arrow' | 'text' | 'select';

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  points: (Point & { t: number })[];
  color: string;
  width: number;
  tool: 'pen' | 'marker';
  timestamp: number;
  duration: number;
}

export interface Arrow {
  id: string;
  start: Point;
  end: Point;
  color: string;
  width: number;
  timestamp: number;
  duration: number;
}

export interface TextAnnotation {
  id: string;
  position: Point;
  text: string;
  color: string;
  fontSize: number;
  timestamp: number;
  duration: number; // fade-in duration
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
