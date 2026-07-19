import React, { useMemo } from 'react';
import rough from 'roughjs';
import type { RoughGenerator } from 'roughjs/bin/generator';
import type { Drawable, OpSet } from 'roughjs/bin/core';

/**
 * roughjs 로 만든 손그림 도형을 "그려지는" 애니메이션과 함께 렌더한다.
 * pathLength=1 트릭으로 DOM 측정 없이 stroke-dashoffset 드로우 온 효과를 낸다.
 */

function SketchDrawable({
  gen,
  drawable,
  progress,
  strokeWidth,
}: {
  gen: RoughGenerator;
  drawable: Drawable;
  progress: number; // 0..1, 외곽선이 그려지는 진행도
  strokeWidth: number;
}) {
  const sets: OpSet[] = drawable.sets ?? [];
  const opts = drawable.options;
  return (
    <>
      {sets.map((set, i) => {
        const d = gen.opsToPath(set);
        if (set.type === 'path') {
          // 외곽선: 드로우 온
          return (
            <path
              key={i}
              d={d}
              stroke={opts.stroke}
              strokeWidth={opts.strokeWidth ?? strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - progress}
            />
          );
        }
        // 채움(해칭 등): 외곽선이 어느 정도 그려진 뒤 서서히 등장
        const fillOpacity = Math.max(0, (progress - 0.4) / 0.6);
        return (
          <path
            key={i}
            d={d}
            stroke={opts.fill}
            strokeWidth={opts.fillWeight ?? 2}
            fill={set.type === 'fillPath' ? opts.fill : 'none'}
            opacity={fillOpacity}
          />
        );
      })}
    </>
  );
}

export function RoughBox({
  x,
  y,
  width,
  height,
  progress = 1,
  stroke = '#1e1e1e',
  fill,
  fillStyle = 'hachure',
  strokeWidth = 3,
  roughness = 1.4,
  seed = 1,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  progress?: number;
  stroke?: string;
  fill?: string;
  fillStyle?: string;
  strokeWidth?: number;
  roughness?: number;
  seed?: number;
}) {
  const gen = useMemo(() => rough.generator(), []);
  const drawable = useMemo(
    () =>
      gen.rectangle(x, y, width, height, {
        stroke,
        fill,
        fillStyle,
        fillWeight: 2,
        hachureGap: 8,
        strokeWidth,
        roughness,
        bowing: 1.2,
        seed,
      }),
    [gen, x, y, width, height, stroke, fill, fillStyle, strokeWidth, roughness, seed],
  );
  return (
    <SketchDrawable gen={gen} drawable={drawable} progress={progress} strokeWidth={strokeWidth} />
  );
}

export function RoughEllipse({
  cx,
  cy,
  width,
  height,
  progress = 1,
  stroke = '#1e1e1e',
  fill,
  strokeWidth = 3,
  roughness = 1.4,
  seed = 1,
}: {
  cx: number;
  cy: number;
  width: number;
  height: number;
  progress?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  roughness?: number;
  seed?: number;
}) {
  const gen = useMemo(() => rough.generator(), []);
  const drawable = useMemo(
    () =>
      gen.ellipse(cx, cy, width, height, {
        stroke,
        fill,
        fillStyle: 'solid',
        strokeWidth,
        roughness,
        seed,
      }),
    [gen, cx, cy, width, height, stroke, fill, strokeWidth, roughness, seed],
  );
  return (
    <SketchDrawable gen={gen} drawable={drawable} progress={progress} strokeWidth={strokeWidth} />
  );
}

export function RoughLine({
  x1,
  y1,
  x2,
  y2,
  progress = 1,
  stroke = '#1e1e1e',
  strokeWidth = 3,
  roughness = 1.2,
  seed = 1,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  progress?: number;
  stroke?: string;
  strokeWidth?: number;
  roughness?: number;
  seed?: number;
}) {
  const gen = useMemo(() => rough.generator(), []);
  const drawable = useMemo(
    () => gen.line(x1, y1, x2, y2, { stroke, strokeWidth, roughness, seed }),
    [gen, x1, y1, x2, y2, stroke, strokeWidth, roughness, seed],
  );
  return (
    <SketchDrawable gen={gen} drawable={drawable} progress={progress} strokeWidth={strokeWidth} />
  );
}

/** 화살표: 선 + 촉. progress 로 함께 그려진다. */
export function RoughArrow({
  x1,
  y1,
  x2,
  y2,
  progress = 1,
  stroke = '#1e1e1e',
  strokeWidth = 3,
  seed = 1,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  progress?: number;
  stroke?: string;
  strokeWidth?: number;
  seed?: number;
}) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 22;
  const ax1 = x2 - head * Math.cos(angle - Math.PI / 7);
  const ay1 = y2 - head * Math.sin(angle - Math.PI / 7);
  const ax2 = x2 - head * Math.cos(angle + Math.PI / 7);
  const ay2 = y2 - head * Math.sin(angle + Math.PI / 7);
  const headProgress = Math.max(0, (progress - 0.7) / 0.3);
  return (
    <>
      <RoughLine x1={x1} y1={y1} x2={x2} y2={y2} progress={progress} stroke={stroke} strokeWidth={strokeWidth} seed={seed} />
      <RoughLine x1={x2} y1={y2} x2={ax1} y2={ay1} progress={headProgress} stroke={stroke} strokeWidth={strokeWidth} seed={seed + 1} />
      <RoughLine x1={x2} y1={y2} x2={ax2} y2={ay2} progress={headProgress} stroke={stroke} strokeWidth={strokeWidth} seed={seed + 2} />
    </>
  );
}

/** 형광펜 밑줄 (텍스트 강조용). */
export function Highlighter({
  x,
  y,
  width,
  color = '#ffe066',
  progress = 1,
}: {
  x: number;
  y: number;
  width: number;
  color?: string;
  progress?: number;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={width * progress}
      height={24}
      fill={color}
      opacity={0.55}
      rx={4}
    />
  );
}
