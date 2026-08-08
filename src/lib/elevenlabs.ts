import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { parseBuffer } from 'music-metadata';
import { config } from '../config.js';
import { recordUsage } from './usage.js';

const API_BASE = 'https://api.elevenlabs.io/v1';

/**
 * ElevenLabs TTS 로 나레이션 mp3 를 생성해 저장하고, 실제 재생 길이(초)를 반환한다.
 */
export async function synthesizeSpeech(params: {
  text: string;
  outPath: string;
}): Promise<{ durationSec: number }> {
  const { text, outPath } = params;
  recordUsage({ kind: 'elevenlabs', step: 'narration', model: config.elevenLabsModelId, chars: text.length });

  const res = await fetch(
    `${API_BASE}/text-to-speech/${config.elevenLabsVoiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': config.elevenLabsApiKey(),
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: config.elevenLabsModelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `ElevenLabs TTS 실패 (${res.status}): ${body.slice(0, 500)}`,
    );
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, Buffer.from(await res.arrayBuffer()));

  // ★NARRATION_SPEED 를 여기서 적용한다★
  //
  // 예전에는 이 값이 3D 엔진에서만 동작했다(web3d-deck/narrate-deck.mjs 가 atempo 를 건다).
  // illustrated 엔진은 이 파일을 쓰는데 여기에는 속도 처리가 아예 없어서, 워크플로가
  // NARRATION_SPEED=1.12 를 넘겨도 실제로는 항상 1.0 배로 나갔다 — 화면에는 설정이
  // 걸린 것처럼 보이는데 영상은 안 바뀌는, 이 저장소에서 여러 번 반복된 그 종류의 버그다.
  await applySpeed(outPath);

  // 길이는 반드시 "가속을 끝낸 파일"에서 다시 잰다. 이 값이 씬 길이를 정하므로,
  // 원본 길이를 쓰면 화면이 나레이션보다 그만큼 길게 늘어져 버린다.
  const meta = await parseBuffer(await fs.readFile(outPath), { mimeType: 'audio/mpeg' });
  const durationSec = meta.format.duration;
  if (!durationSec || durationSec <= 0) {
    throw new Error(`오디오 길이를 측정할 수 없습니다: ${outPath}`);
  }

  return { durationSec };
}

/**
 * mp3 를 제자리에서 배속한다. atempo 는 피치를 유지한 채 속도만 바꾼다(1.2배로 올려도
 * 목소리가 높아지지 않는다). 실패하면 원본을 그대로 둔다 — 속도는 있으면 좋은 것이지,
 * 이것 때문에 영상 전체가 죽으면 안 된다.
 */
async function applySpeed(outPath: string): Promise<void> {
  const speed = config.narrationSpeed;
  // atempo 필터의 유효 범위는 0.5~2.0 이고 config 가 이미 같은 범위로 조인다.
  if (!ffmpegPath || Math.abs(speed - 1) < 0.001) return;

  const fast = `${outPath}.fast.mp3`;
  const r = spawnSync(
    ffmpegPath,
    ['-hide_banner', '-loglevel', 'error', '-y', '-i', outPath, '-filter:a', `atempo=${speed}`, fast],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    console.warn(`    · 나레이션 배속(${speed}x) 실패, 원본 속도로 진행:`, (r.stderr || '').slice(0, 200));
    await fs.rm(fast, { force: true });
    return;
  }
  await fs.rename(fast, outPath);
}
