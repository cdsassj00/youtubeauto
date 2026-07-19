import { z } from 'zod';

/**
 * 대본(script) 및 렌더링 매니페스트(manifest)의 공유 타입 정의.
 * Claude 가 구조화 출력으로 채우는 스키마이자, Remotion 이 입력 props 로 받는 타입.
 */

/** 손그림 다이어그램의 노드/엣지 (Excalidraw 스타일 도식). */
export const DiagramSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
      }),
    )
    .max(6),
  edges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().optional(),
      }),
    )
    .max(8),
});

export type Diagram = z.infer<typeof DiagramSchema>;

export const VisualKind = z.enum([
  'title', // 표지/도입
  'bullets', // 핵심 포인트 손글씨 나열
  'diagram', // 개념 도식(노드+화살표)
  'comparison', // 좌/우 비교
  'quote', // 한 문장 강조
  'outro', // 마무리/구독 유도
]);

export const SceneSchema = z.object({
  id: z.string(),
  heading: z.string(), // 화면 상단 짧은 제목
  narration: z.string(), // 성우가 읽을 나레이션 (해당 언어)
  bullets: z.array(z.string()).max(5).default([]),
  visual: VisualKind,
  diagram: DiagramSchema.optional(),
  comparison: z
    .object({
      leftTitle: z.string(),
      leftItems: z.array(z.string()).max(4),
      rightTitle: z.string(),
      rightItems: z.array(z.string()).max(4),
    })
    .optional(),
});

export type Scene = z.infer<typeof SceneSchema>;

export const ScriptSchema = z.object({
  title: z.string(), // 유튜브 영상 제목
  description: z.string(), // 유튜브 설명란
  tags: z.array(z.string()).max(15),
  topic: z.string(), // 이번 회차 주제
  scenes: z.array(SceneSchema).min(6),
});

export type Script = z.infer<typeof ScriptSchema>;

/**
 * TTS 로 오디오를 만든 뒤, 실제 길이를 붙인 렌더 매니페스트.
 * (Remotion 컴포지션 props 로 쓰이므로 interface 가 아닌 type 으로 선언 —
 *  type 이어야 Record<string, unknown> 에 할당 가능.)
 */
export type SceneWithAudio = Scene & {
  audioPath: string; // staticFile 상대경로 (예: audio/s1.mp3)
  durationSec: number; // 측정된 오디오 길이
  startFrame: number;
  durationInFrames: number;
};

export type RenderManifest = {
  title: string;
  topic: string;
  fps: number;
  width: number;
  height: number;
  totalDurationInFrames: number;
  scenes: SceneWithAudio[];
  createdAt: string;
  /** 배경음악 staticFile 상대경로 (예: audio/bgm.wav). 없으면 무음. */
  bgm?: string;
};
