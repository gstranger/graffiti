import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
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
import './Graffiti.css';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const TOOLS: ToolDescriptor[] = [
  { id: 'pen',    label: 'pen',    icon: '✏️' },
  { id: 'marker', label: 'marker', icon: '🖍️' },
  { id: 'arrow',  label: 'arrow',  icon: '➡️' },
  { id: 'text',   label: 'text',   icon: 'T' },
  { id: 'select', label: 'select', icon: '👆' },
];

export default function Graffiti({
  src,
  width = 640,
  height = 360,
  className = '',
  onAnnotationAdd,
  onAnnotationRemove,
  initialAnnotations = [],
}: GraffitiProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [tool, setTool] = useState<Tool>('select');
  const [isPlaying, setIsPlaying] = useState(false);
  const [color, setColor] = useState('#ff3b30');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [currentStroke, setCurrentStroke] = useState<(Point & { t: number })[] | null>(null);
  const [arrowStart, setArrowStart] = useState<Point | null>(null);
  const [previewArrow, setPreviewArrow] = useState<{ start: Point; end: Point } | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [replayAnno, setReplayAnno] = useState<Annotation | null>(null);
  const [replayElapsed, setReplayElapsed] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loopIn, setLoopIn] = useState<number | null>(null);
  const [loopOut, setLoopOut] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const wasPlayingBeforeScrubRef = useRef(false);

  const prevTimeRef = useRef(0);
  const replayStartRef = useRef(0);
  const replayRafRef = useRef<number>(0);
  const strokeStartRef = useRef<number>(0);
  const arrowStartRef = useRef<number>(0);
  const textStartRef = useRef<number>(0);
  const replayedSetRef = useRef(new Set<string>());

  const activeAnnotations = useMemo(() => {
    return annotations.filter((a) => {
      if (replayAnno) return a.id !== replayAnno.id && a.timestamp <= currentTime;
      const elapsed = currentTime - a.timestamp;
      return elapsed >= 0;
    });
  }, [annotations, currentTime, replayAnno]);

  const getCanvasPoint = useCallback(
    (e: React.MouseEvent | React.TouchEvent): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height),
      };
    },
    []
  );

  const drawStroke = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      points: { x: number; y: number }[],
      color: string,
      width: number,
      tool: 'pen' | 'marker'
    ) => {
      if (points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (tool === 'marker') {
        ctx.globalAlpha = 0.4;
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
    []
  );

  const drawArrow = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      start: Point,
      end: Point,
      color: string,
      width: number
    ) => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const angle = Math.atan2(dy, dx);
      const headLen = width * 4;

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - headLen * Math.cos(angle - Math.PI / 6),
        end.y - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        end.x - headLen * Math.cos(angle + Math.PI / 6),
        end.y - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    },
    []
  );

  const drawText = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      text: string,
      position: Point,
      color: string,
      fontSize: number,
      opacity = 1
    ) => {
      ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
      ctx.fillStyle = color;
      ctx.textBaseline = 'top';
      ctx.globalAlpha = opacity;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
      ctx.fillText(text, position.x, position.y);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    },
    []
  );

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
        default: {
          const _exhaustive: never = anno;
          return _exhaustive;
        }
      }
    },
    [drawStroke, drawArrow, drawText]
  );

  useEffect(() => {
    if (!replayAnno) return;
    replayStartRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - replayStartRef.current;
      if (elapsed >= replayAnno.duration) {
        setReplayElapsed(replayAnno.duration);
        setReplayAnno(null);
        videoRef.current?.play();
        return;
      }
      setReplayElapsed(elapsed);
      replayRafRef.current = requestAnimationFrame(tick);
    };
    replayRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (replayRafRef.current) cancelAnimationFrame(replayRafRef.current);
    };
  }, [replayAnno]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    activeAnnotations.forEach((anno) => {
      // already fully visible
      drawAnnotation(ctx, anno, anno.duration);
    });

    if (replayAnno) {
      drawAnnotation(ctx, replayAnno, replayElapsed);
    }

    if (currentStroke && currentStroke.length > 1) {
      drawStroke(
        ctx,
        currentStroke,
        color,
        strokeWidth,
        tool === 'marker' ? 'marker' : 'pen'
      );
    }

    if (previewArrow) {
      drawArrow(ctx, previewArrow.start, previewArrow.end, color, strokeWidth);
    }
  }, [
    activeAnnotations,
    currentStroke,
    previewArrow,
    color,
    strokeWidth,
    tool,
    currentTime,
    replayAnno,
    replayElapsed,
    drawStroke,
    drawArrow,
    drawText,
    drawAnnotation,
  ]);

  const handlePointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const point = getCanvasPoint(e);

      if (tool === 'text') {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
        textStartRef.current = Date.now();
        setTextInput({ x: point.x, y: point.y });
        return;
      }

      if (tool === 'arrow') {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
        arrowStartRef.current = Date.now();
        setArrowStart(point);
        setPreviewArrow({ start: point, end: point });
        setIsDrawing(true);
        return;
      }

      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
      strokeStartRef.current = Date.now();
      setCurrentStroke([{ x: point.x, y: point.y, t: 0 }]);
      setIsDrawing(true);
    },
    [tool, getCanvasPoint]
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing) return;
      e.preventDefault();
      const point = getCanvasPoint(e);

      if (tool === 'arrow' && arrowStart) {
        setPreviewArrow({ start: arrowStart, end: point });
        return;
      }

      if (currentStroke) {
        setCurrentStroke((prev) => [
          ...(prev || []),
          { x: point.x, y: point.y, t: Date.now() - strokeStartRef.current },
        ]);
      }
    },
    [isDrawing, tool, arrowStart, getCanvasPoint]
  );

  const handlePointerUp = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing) return;
      e.preventDefault();
      setIsDrawing(false);

      if (tool === 'arrow' && arrowStart && previewArrow) {
        const drawDuration = Date.now() - arrowStartRef.current;
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
        setAnnotations((prev) => [...prev, arrow]);
        onAnnotationAdd?.(arrow);
        setArrowStart(null);
        setPreviewArrow(null);
        videoRef.current?.play();
        return;
      }

      if (currentStroke && currentStroke.length > 1) {
        const drawDuration = Date.now() - strokeStartRef.current;
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
        setAnnotations((prev) => [...prev, stroke]);
        onAnnotationAdd?.(stroke);
      }
      setCurrentStroke(null);
      videoRef.current?.play();
    },
    [isDrawing, tool, arrowStart, previewArrow, currentStroke, getCanvasPoint, color, strokeWidth, currentTime, onAnnotationAdd]
  );

  const handleTextSubmit = useCallback(() => {
    if (!textInput || !textValue.trim()) {
      setTextInput(null);
      setTextValue('');
      return;
    }
    const drawDuration = Date.now() - textStartRef.current;
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
    setAnnotations((prev) => [...prev, textAnno]);
    onAnnotationAdd?.(textAnno);
    setTextInput(null);
    setTextValue('');
    videoRef.current?.play();
  }, [textInput, textValue, color, strokeWidth, currentTime, onAnnotationAdd]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    let now = video.currentTime;
    const prev = prevTimeRef.current;

    // Loop region: wrap back to loopIn when we cross loopOut
    if (loopIn != null && loopOut != null && loopOut > loopIn && now >= loopOut) {
      video.currentTime = loopIn;
      now = loopIn;
      replayedSetRef.current.clear();
      setCurrentTime(now);
      prevTimeRef.current = now;
      return;
    }

    // Detect loop or seek backward — clear replay cache
    if (now < prev - 0.5) {
      replayedSetRef.current.clear();
    }

    if (isPlaying && !replayAnno && !isDrawing && !isScrubbing && prev <= now) {
      const upcoming = annotations.find(
        (a) =>
          prev < a.timestamp &&
          now >= a.timestamp &&
          !replayedSetRef.current.has(a.id)
      );
      if (upcoming) {
        replayedSetRef.current.add(upcoming.id);
        video.pause();
        setReplayAnno(upcoming);
        return;
      }
    }

    setCurrentTime(now);
    prevTimeRef.current = now;
  }, [isPlaying, annotations, replayAnno, isDrawing, isScrubbing, loopIn, loopOut]);

  // Keep <video> playbackRate in sync with state
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  const getTrackTime = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || !duration) return 0;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return pct * duration;
    },
    [duration]
  );

  const handleTrackPointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      // Don't scrub when clicking annotation markers
      const target = e.target as HTMLElement;
      if (target.closest('.graffiti-marker')) return;
      e.preventDefault();
      const video = videoRef.current;
      if (!video) return;
      wasPlayingBeforeScrubRef.current = !video.paused;
      if (!video.paused) video.pause();
      setIsScrubbing(true);
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const t = getTrackTime(clientX);
      video.currentTime = t;
      setCurrentTime(t);
      prevTimeRef.current = t;
      replayedSetRef.current.clear();
    },
    [getTrackTime]
  );

  const handleTrackPointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isScrubbing) return;
      e.preventDefault();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const t = getTrackTime(clientX);
      if (videoRef.current) videoRef.current.currentTime = t;
      setCurrentTime(t);
      prevTimeRef.current = t;
    },
    [isScrubbing, getTrackTime]
  );

  const handleTrackPointerUp = useCallback(() => {
    if (!isScrubbing) return;
    setIsScrubbing(false);
    if (wasPlayingBeforeScrubRef.current) {
      void videoRef.current?.play();
    }
  }, [isScrubbing]);

  // Global pointer listeners so scrubbing keeps working when mouse leaves the track
  useEffect(() => {
    if (!isScrubbing) return;
    const move = (e: MouseEvent) => {
      const t = getTrackTime(e.clientX);
      if (videoRef.current) videoRef.current.currentTime = t;
      setCurrentTime(t);
      prevTimeRef.current = t;
    };
    const up = () => handleTrackPointerUp();
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [isScrubbing, getTrackTime, handleTrackPointerUp]);

  const setLoopInHere = () => {
    const t = currentTime;
    setLoopIn(t);
    if (loopOut != null && loopOut <= t) setLoopOut(null);
  };
  const setLoopOutHere = () => {
    const t = currentTime;
    if (loopIn == null || t <= loopIn) return;
    setLoopOut(t);
  };
  const clearLoop = () => {
    setLoopIn(null);
    setLoopOut(null);
  };

  // Reset replayed set when playing restarts from near beginning
  const handlePlay = () => {
    setIsPlaying(true);
    if (currentTime < 0.5) {
      replayedSetRef.current.clear();
    }
  };

  const handlePause = () => setIsPlaying(false);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      void videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  };

  const seekTo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
      prevTimeRef.current = time;
    }
  };

  const clearAnnotations = () => {
    annotations.forEach((a) => onAnnotationRemove?.(a.id));
    setAnnotations([]);
    replayedSetRef.current.clear();
  };

  return (
    <div className={`graffiti ${className}`} ref={containerRef} style={{ width, height }}>
      <div className="graffiti-toolbar">
        <div className="graffiti-tools">
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
        </div>
        <div className="graffiti-colors">
          {['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de', '#ffffff'].map(
            (c) => (
              <button
                key={c}
                className={color === c ? 'active' : ''}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
                aria-label={`color ${c}`}
              />
            )
          )}
        </div>
        <div className="graffiti-width">
          <input
            type="range"
            min="1"
            max="10"
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            title="stroke width"
          />
        </div>
        <button
          className={`graffiti-play ${isPlaying ? 'playing' : ''}`}
          onClick={togglePlay}
          title={isPlaying ? 'pause' : 'play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <div className="graffiti-speed" title="playback speed">
          {[0.25, 0.5, 1, 2].map((r) => (
            <button
              key={r}
              className={playbackRate === r ? 'active' : ''}
              onClick={() => setPlaybackRate(r)}
            >
              {r}×
            </button>
          ))}
        </div>
        <div className="graffiti-loop">
          <button onClick={setLoopInHere} title="set loop in at current time">[</button>
          <button
            onClick={setLoopOutHere}
            title="set loop out at current time"
            disabled={loopIn == null || currentTime <= loopIn}
          >
            ]
          </button>
          <button
            onClick={clearLoop}
            title="clear loop"
            disabled={loopIn == null && loopOut == null}
          >
            ✕
          </button>
        </div>
        <button onClick={clearAnnotations} className="graffiti-clear" title="clear all">
          🗑️
        </button>
      </div>

      <div className="graffiti-stage" style={{ width, height }}>
        <video
          ref={videoRef}
          src={src}
          width={width}
          height={height}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => {
            if (videoRef.current) {
              setDuration(videoRef.current.duration);
              videoRef.current.playbackRate = playbackRate;
              void videoRef.current.play().catch(() => {});
            }
          }}
          autoPlay
          muted
          loop
          playsInline
          className="graffiti-video"
          onPlay={handlePlay}
          onPause={handlePause}
        />
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="graffiti-canvas"
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          style={{
            cursor:
              tool === 'text'
                ? 'text'
                : tool === 'arrow' || tool === 'pen' || tool === 'marker'
                  ? 'crosshair'
                  : 'default',
            pointerEvents: tool === 'select' ? 'none' : 'auto',
          }}
        />
        {textInput && (
          <input
            type="text"
            className="graffiti-text-input"
            style={{ left: textInput.x, top: textInput.y }}
            autoFocus
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTextSubmit();
              if (e.key === 'Escape') {
                setTextInput(null);
                setTextValue('');
              }
            }}
            onBlur={handleTextSubmit}
            placeholder="Type..."
          />
        )}
      </div>

      <div className="graffiti-timeline">
        <span className="graffiti-time">
          {Math.floor(currentTime / 60)}:
          {String(Math.floor(currentTime % 60)).padStart(2, '0')}
        </span>
        <div
          className={`graffiti-track ${isScrubbing ? 'scrubbing' : ''}`}
          ref={trackRef}
          onMouseDown={handleTrackPointerDown}
          onTouchStart={handleTrackPointerDown}
          onTouchMove={handleTrackPointerMove}
          onTouchEnd={handleTrackPointerUp}
        >
          {loopIn != null && loopOut != null && duration > 0 && (
            <div
              className="graffiti-loop-range"
              style={{
                left: `${(loopIn / duration) * 100}%`,
                width: `${((loopOut - loopIn) / duration) * 100}%`,
              }}
            />
          )}
          <div
            className="graffiti-progress"
            style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
          />
          {loopIn != null && duration > 0 && (
            <div
              className="graffiti-loop-edge loop-in"
              style={{ left: `${(loopIn / duration) * 100}%` }}
              title={`loop in at ${loopIn.toFixed(2)}s`}
            />
          )}
          {loopOut != null && duration > 0 && (
            <div
              className="graffiti-loop-edge loop-out"
              style={{ left: `${(loopOut / duration) * 100}%` }}
              title={`loop out at ${loopOut.toFixed(2)}s`}
            />
          )}
          {annotations.map((a) => (
            <button
              key={a.id}
              className="graffiti-marker"
              style={{ left: `${duration ? (a.timestamp / duration) * 100 : 0}%` }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                replayedSetRef.current.clear();
                seekTo(a.timestamp);
              }}
              title={`annotation at ${Math.floor(a.timestamp)}s`}
            />
          ))}
        </div>
        <span className="graffiti-time">
          {Math.floor(duration / 60)}:
          {String(Math.floor(duration % 60)).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}
