import type { AdapterContext, ChannelView } from './types';
import { atlasFetch } from './adapters/atlas';
export const SPEECH_MODEL = 'minimax/speech-2.6-turbo';
export const GEMINI_SPEECH_MODEL = 'google/gemini-2.5-flash-tts';
const minimaxVoices = ['English_expressive_narrator', 'English_radiant_girl', 'English_magnetic_voiced_man', 'English_compelling_lady1', 'English_Aussie_Bloke', 'English_captivating_female1', 'English_Upbeat_Woman', 'English_Trustworth_Man', 'English_CalmWoman', 'English_UpsetGirl', 'English_Gentle-voiced_man', 'English_Whispering_girl', 'English_Diligent_Man', 'English_Graceful_Lady', 'English_ReservedYoungMan'] as const;
const geminiVoices = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'] as const;
const emotions = ['auto', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm', 'fluent', 'neutral'] as const;
export type SpeechOptions = { model: typeof SPEECH_MODEL; voice: typeof minimaxVoices[number]; speed: number; emotion?: typeof emotions[number] } | { model: typeof GEMINI_SPEECH_MODEL; voice: typeof geminiVoices[number] };
// Controlled Chinese narration trial; no cloning, fallback or implicit retries.
export const atlasSpeechAdapter = {
  async submit(ctx: AdapterContext, channel: ChannelView, text: string, options: SpeechOptions) {
    if (!text.trim() || text.length > 10000 || text.includes('\u0000')) throw Object.assign(new Error('Invalid speech text'), { status: 400 });
    if (!options || ![SPEECH_MODEL, GEMINI_SPEECH_MODEL].includes(options.model)) throw Object.assign(new Error('Explicit speech model and voice required'), { status: 400 });
    const voices: readonly string[] = options.model === SPEECH_MODEL ? minimaxVoices : geminiVoices;
    if (!voices.includes(options.voice)) throw Object.assign(new Error('Voice not documented for this Atlas model'), { status: 400 });
    if (options.model === SPEECH_MODEL && (!Number.isFinite(options.speed) || options.speed < 0.5 || options.speed > 2 || (options.emotion !== undefined && !emotions.includes(options.emotion)))) throw Object.assign(new Error('Invalid speech delivery'), { status: 400 });
    if (options.model === GEMINI_SPEECH_MODEL && ('speed' in options || 'emotion' in options)) throw Object.assign(new Error('Gemini delivery must be specified in text'), { status: 400 });
    const payload = options.model === SPEECH_MODEL
      ? { model: options.model, text, voice: options.voice, language_boost: 'Chinese', format: 'wav', sample_rate: 32000, speed: options.speed, ...(options.emotion === undefined ? {} : { emotion: options.emotion }) }
      : { model: options.model, text, voice: options.voice };
    const { status, body } = await atlasFetch(ctx, `${channel.baseUrl ?? 'https://api.atlascloud.ai'}/api/v1/model/generateAudio`, { method: 'POST', body: JSON.stringify(payload) });
    if (status >= 400) throw Object.assign(new Error(`Speech provider HTTP ${status}`), { status });
    const data = (body.data ?? body) as Record<string, unknown>; const id = data.id;
    if (typeof id !== 'string' || !id.trim() || id.length > 500) throw Object.assign(new Error('Speech receipt missing'), { status: 502 });
    return { providerTaskId: id };
  },
  async poll(ctx: AdapterContext, channel: ChannelView, providerTaskId: string): Promise<{ status: 'queued' | 'processing' | 'succeeded' | 'failed'; audioUrl?: string }> {
    const { status, body } = await atlasFetch(ctx, `${channel.baseUrl ?? 'https://api.atlascloud.ai'}/api/v1/model/prediction/${encodeURIComponent(providerTaskId)}`, { method: 'GET' });
    if (status >= 400) throw Object.assign(new Error(`Speech poll HTTP ${status}`), { status });
    const data = (body.data ?? body) as Record<string, unknown>;
    if (data.status === 'completed') {
      const url = Array.isArray(data.outputs) ? data.outputs[0] : undefined;
      if (typeof url !== 'string' || url.length > 8000 || new URL(url).protocol !== 'https:') return { status: 'failed' };
      return { status: 'succeeded', audioUrl: url };
    }
    if (data.status === 'failed') return { status: 'failed' };
    if (data.status === 'processing') return { status: 'processing' };
    if (['created', 'queued', 'pending'].includes(String(data.status))) return { status: 'queued' };
    throw new Error('Unknown speech state');
  },
};
