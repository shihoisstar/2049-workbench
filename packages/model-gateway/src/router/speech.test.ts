import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atlasSpeechAdapter, SPEECH_MODEL, GEMINI_SPEECH_MODEL } from './speech';
import type { SpeechOptions } from './speech';
import type { AdapterContext, ChannelView } from './types';
const channel = { baseUrl: 'https://speech.invalid' } as ChannelView;
const originalVoice = { model: SPEECH_MODEL, voice: 'English_expressive_narrator', speed: 1 } as const;
test('speech submits explicit voice and model-specific delivery once, accepts both receipt envelopes', async () => {
  for (const options of [originalVoice, { model: SPEECH_MODEL, voice: 'English_Upbeat_Woman', speed: 1.1, emotion: 'happy' }, { model: GEMINI_SPEECH_MODEL, voice: 'Aoede' }, { model: GEMINI_SPEECH_MODEL, voice: 'Leda' }] as const) {
  for (const body of [{ id: 's1' }, { data: { id: 's1' } }]) {
    let calls = 0; const context = { secret: 'fixture', timeoutMs: 1000, fetchImpl: async (_url: unknown, init: RequestInit) => { calls++; const input = JSON.parse(String(init.body)); assert.equal(input.model, options.model); assert.equal(input.voice, options.voice); assert.equal(input.text, '一起出发。'); if (options.model === SPEECH_MODEL) { assert.equal(input.language_boost, 'Chinese'); assert.equal(input.format, 'wav'); assert.equal(input.speed, options.speed); assert.equal(input.emotion, 'emotion' in options ? options.emotion : undefined); } else assert.deepEqual(input, {model: options.model, text: '一起出发。', voice: options.voice}); return new Response(JSON.stringify(body)); } } as AdapterContext;
    assert.equal((await atlasSpeechAdapter.submit(context, channel, '一起出发。', options)).providerTaskId, 's1'); assert.equal(calls, 1);
  }
  }
});
test('speech rejection, response loss and invalid input never retry a paid request', async () => {
  for (const kind of ['reject', 'loss', 'missing']) {
    let calls = 0; const context = { secret: 'fixture', timeoutMs: 1000, fetchImpl: async () => { calls++; if (kind === 'loss') throw new Error('lost'); return new Response(kind === 'missing' ? '{}' : '{}', { status: kind === 'reject' ? 429 : 200 }); } } as unknown as AdapterContext;
    await assert.rejects(atlasSpeechAdapter.submit(context, channel, '一起出发。', originalVoice)); assert.equal(calls, 1);
    await assert.rejects(atlasSpeechAdapter.submit(context, channel, '', originalVoice)); assert.equal(calls, 1);
    for (const options of [undefined, {...originalVoice, voice:'Chinese (Mandarin)_Crisp_Girl'}, {...originalVoice, speed:NaN}, {...originalVoice, speed:3}, {...originalVoice, emotion:'unlisted'}, {model:GEMINI_SPEECH_MODEL, voice:'Leda', speed:1}]) {
      await assert.rejects(atlasSpeechAdapter.submit(context, channel, '一起出发。', options as SpeechOptions)); assert.equal(calls, 1);
    }
  }
});
test('speech polling returns bounded outputs, rejects empty/unknown results and uses GET', async () => {
  for (const [body, expected] of [[{ data: { status: 'completed', outputs: ['https://audio.invalid/a.wav'] } }, 'succeeded'], [{ status: 'completed', outputs: [] }, 'failed'], [{ status: 'processing' }, 'processing']] as const) {
    const context = { secret: 'fixture', timeoutMs: 1000, fetchImpl: async (url: unknown, init: RequestInit) => { assert.ok(String(url).endsWith('id%2F1')); assert.equal(init.method, 'GET'); return new Response(JSON.stringify(body)); } } as AdapterContext;
    assert.equal((await atlasSpeechAdapter.poll(context, channel, 'id/1')).status, expected);
  }
  const context = { secret: 'fixture', timeoutMs: 1000, fetchImpl: async () => new Response('{}') } as unknown as AdapterContext;
  await assert.rejects(atlasSpeechAdapter.poll(context, channel, 'id'));
});
