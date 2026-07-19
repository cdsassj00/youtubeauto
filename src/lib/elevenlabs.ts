import fs from 'node:fs/promises';
import path from 'node:path';
import { parseBuffer } from 'music-metadata';
import { config } from '../config.js';

const API_BASE = 'https://api.elevenlabs.io/v1';

/**
 * ElevenLabs TTS 로 나레이션 mp3 를 생성해 저장하고, 실제 재생 길이(초)를 반환한다.
 */
export async function synthesizeSpeech(params: {
  text: string;
  outPath: string;
}): Promise<{ durationSec: number }> {
  const { text, outPath } = params;

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

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, buffer);

  const meta = await parseBuffer(buffer, { mimeType: 'audio/mpeg' });
  const durationSec = meta.format.duration;
  if (!durationSec || durationSec <= 0) {
    throw new Error(`오디오 길이를 측정할 수 없습니다: ${outPath}`);
  }

  return { durationSec };
}
