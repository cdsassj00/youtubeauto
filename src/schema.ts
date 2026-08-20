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
  'code', // 실제 파일/코드/설정 예시 한 화면
  'image', // AI 그림 한 장으로 보여주는 장면 (화풍 설정이 실제로 적용되는 유일한 씬 타입)
  'metric', // 큰 숫자 하나 (상자·화살표 없음)
  'bars', // 막대 비교 (길이로 크기 차이)
  'outro', // 마무리/구독 유도
]);

/**
 * 큰 숫자 한 개짜리 화면.
 *
 * 도식이 늘 "상자 + 화살표"로만 보이던 이유는 부품이 하나뿐이어서였다. 수치는 상자에
 * 가두면 오히려 안 읽히므로, 숫자만 화면 가운데 크게 두는 별도 타입으로 뺀다.
 */
export const MetricSchema = z.object({
  value: z.string(), // "82%", "3배", "1994년" — 단위·기호를 붙인 채로
  label: z.string(), // 무엇의 수치인가 (16자 이내)
  note: z.string().default(''), // 한 줄 부연 (선택)
});

/** 막대 비교 — 항목의 크기 차이를 길이로 보여준다. */
export const BarsSchema = z.object({
  unit: z.string().default(''), // "%", "만원", "초" 등 숫자 뒤에 붙일 단위
  items: z
    .array(
      z.object({
        label: z.string(), // 12자 이내
        value: z.number(),
      }),
    )
    .min(2)
    .max(5),
});

/**
 * title/outro 씬에서 실제로 렌더링되는 평면(flat) 2D 라인 아이콘 목록(생활코딩 스타일 레퍼런스).
 * 각 아이콘은 특정 개념과 1:1로 대응한다(자물쇠=보안/권한, DB=데이터, 서버=인프라, 시계=시간/지연 등) —
 * "장식용 아무 아이콘"이 아니라 그 씬이 실제로 설명하는 대상을 가리키도록 대본 생성 시 골라야 한다.
 */
export const IconKind = z.enum([
  'document', // 문서/자료/정의
  'chat', // 질문/대화/논쟁
  'search', // 조사/분석/검색
  'lock', // 보안/권한/잠금
  'key', // 인증/접근권한
  'database', // 데이터/저장소
  'server', // 인프라/백엔드/실행 환경
  'cloud', // 클라우드/원격 서비스
  'terminal', // 코드/커맨드/실행
  'gear', // 설정/구성
  'link', // 연결/통합/연동
  'check', // 완료/검증/성공
  'warning', // 주의/오류/리스크
  'user', // 개인/사용자
  'users', // 팀/커뮤니티/여러 사람
  'clock', // 시간/속도/지연
  'chart', // 성장/통계/수치
  'mail', // 알림/커뮤니케이션/전달
]);

/** visual="code" 씬에 쓰는 실제 파일/코드 예시 한 화면 (에디터 창처럼 렌더링됨). */
export const CodeExampleSchema = z.object({
  filename: z.string(), // 예: "skills/harness/SKILL.md", "hooks/pre-tool-use.sh"
  language: z.string().default('text'), // 하이라이트 힌트용 (yaml/json/bash/markdown 등, 실제 색칠은 안 함)
  code: z.string(), // 실제 화면에 보일 코드/설정 텍스트 (짧게, 8~14줄 이내)
});

export const SceneSchema = z.object({
  id: z.string(),
  heading: z.string(), // 화면 상단 짧은 제목
  narration: z.string(), // 성우가 읽을 나레이션 (해당 언어)
  bullets: z.array(z.string()).max(5).default([]),
  // AI 일러스트용 영어 시각 묘사 — 폴백 전용(icon 이 없을 때만 사용). title/outro 는 기본적으로
  // 아래 icon 필드로 렌더링되므로 보통 채울 필요 없다.
  illustration: z.string().default(''),
  // 실사 푸티지 엔진에서 화면 아래에 아주 옅게 까는 한 줄 — 시연 대상, 사례 사이트, 출처 표기.
  // "지금 이 얘기는 어디서 확인할 수 있나"를 화면을 방해하지 않고 남기기 위한 자리다.
  sourceNote: z.string().default(''),
  // title/outro 씬에서 실제로 렌더링되는 평면 2D 아이콘. 이 씬이 설명하는 구체적 대상과
  // 맞는 아이콘을 고른다(예: 보안 얘기면 lock, 데이터 얘기면 database).
  icon: IconKind.optional(),
  visual: VisualKind,
  /**
   * 이 씬을 어떤 화풍으로 그릴지. Mixed 컴포지션에서만 쓰인다.
   *
   * ★왜 씬 단위인가★ 지금까지는 컴포지션 하나가 영상 전체의 화풍을 정했다(Whiteboard 로
   * 렌더하면 12분 내내 화이트보드). 미드폼은 한 화풍으로 8분을 버티지 못한다 — 같은 그림이
   * 계속 나오면 중간에 나간다. 씬마다 다른 엔진으로 그리려면 화풍이 씬에 붙어야 한다.
   * 비워 두면 standard 로 그려지므로 기존 대본은 그대로 동작한다.
   */
  engine: z
    .enum(['standard', 'illustrated', 'scrapbook', 'whiteboard', 'listing', 'footage', 'stock'])
    .optional(),
  /**
   * 주식 데일리 전용 화면 데이터.
   *
   * ★불릿으로는 표를 못 그린다★ 처음엔 종목 목록을 bullets 로 넘겼는데, 그 엔진들은
   * 사진을 깔도록 만들어진 것이라 제목만 띄우고 내용을 자막에 떠넘겼다. 화면에 표와
   * 막대를 그리려면 값이 구조로 와야 한다.
   */
  stock: z
    .object({
      kind: z.enum(['prevTable', 'rotation', 'scoreBars', 'flow', 'cards', 'chains', 'headline']),
      rows: z
        .array(z.object({ name: z.string(), from: z.string().default(''), to: z.string().default(''), pct: z.number().default(0), note: z.string().default('') }))
        .default([]),
      groups: z.array(z.object({ label: z.string(), items: z.array(z.string()), tone: z.enum(['keep', 'in', 'out']) })).default([]),
      /** 카드형 화면(엔진 비교) — 제목·설명·값·목록을 한 장씩. */
      cards: z
        .array(z.object({ title: z.string(), sub: z.string().default(''), value: z.string().default(''), items: z.array(z.string()).default([]), highlight: z.boolean().default(false) }))
        .default([]),
      big: z.string().default(''),
      caption: z.string().default(''),
    })
    .optional(),
  diagram: DiagramSchema.optional(),
  comparison: z
    .object({
      leftTitle: z.string(),
      leftItems: z.array(z.string()).max(4),
      rightTitle: z.string(),
      rightItems: z.array(z.string()).max(4),
    })
    .optional(),
  code: CodeExampleSchema.optional(),
  metric: MetricSchema.optional(),
  bars: BarsSchema.optional(),
});

export type Scene = z.infer<typeof SceneSchema>;

export const ScriptSchema = z.object({
  title: z.string(), // 유튜브 영상 제목
  description: z.string(), // 유튜브 설명란
  tags: z.array(z.string()).max(15),
  topic: z.string(), // 이번 회차 주제
  // 썸네일에 크게 박을 후킹 문구 (8~14자). 설명문이 아니라 "긴장"이 있는 한 방.
  thumbnailHeadline: z.string(),
  // 문구를 짧게 쓰는 대신 "무엇에 대한 영상인지"를 남기는 구석 배지 (제품·회사명). 없으면 배지 생략.
  thumbnailBadge: z.string().optional().default(''),
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
  imagePath?: string; // 일러스트 staticFile 상대경로 (예: img/s1.png) — illustrated 엔진용
  durationSec: number; // 측정된 오디오 길이
  startFrame: number;
  durationInFrames: number;
  /**
   * 이 씬 위에 얹을 스톡 영상 컷들(src/lib/broll.ts 가 배치, stock.ts 가 내려받음).
   * fromFrame 은 "씬 시작 기준" 상대 프레임이다 — 전체 타임라인 기준이 아니다.
   * 한 화면이 15~20초씩 정지해 프리젠테이션처럼 보이던 것을 끊어주는 용도.
   */
  broll?: {
    path: string;
    /** 영상이면 OffthreadVideo, 사진이면 Img 로 렌더한다(사진도 켄번즈를 걸면 컷으로 기능한다). */
    kind: 'video' | 'photo';
    fromFrame: number;
    durationInFrames: number;
  }[];
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
  /** 이 영상 전체(코드로 그리는 발표자료/등각 도식 + AI 일러스트)가 라이트/다크 중 무엇을 쓸지.
   * 영상 단위로 한 번 정해 일관되게 적용한다(씬마다 바뀌면 어색함). 기본은 light. */
  theme?: 'light' | 'dark';
  /** 배경음악 staticFile 상대경로 (예: audio/bgm.wav). 없으면 무음. */
  bgm?: string;
  /**
   * 효과음(audio/sfx/*.wav)이 실제로 만들어졌는가.
   * ★플래그가 필요한 이유★ 파일이 없는데 staticFile 로 참조하면 렌더가 통째로 실패한다.
   * 소리 하나 때문에 20분짜리 영상을 잃지 않도록, 만들어졌을 때만 화면이 참조한다.
   */
  sfx?: boolean;
};
