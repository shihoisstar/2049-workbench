import { useEffect, useRef, useState } from 'react';
import { Button, Text, Textarea, Video, View } from '@tarojs/components';
import { useDidHide, useDidShow } from '@tarojs/taro';
import type { NativeCaptionReviewValue, ConfirmNativeCaptionsValue } from '@wb/contracts';
import { confirmNativeCaptions, loadNativeCaptionDraft, nativeCaptionReview, nativeSourceAccess, pendingNativeCaptions, resumeNativeMedia, saveNativeCaptionDraft } from '../../services/generation';

export function NativeCaptionReviewCard({ jobId, onReviewChange }: { jobId: string; onReviewChange: (value: NativeCaptionReviewValue | null) => void }) {
  const [review, setReview] = useState<NativeCaptionReviewValue | null>(null); const [draft, setDraft] = useState<Omit<ConfirmNativeCaptionsValue, 'requestKey'> | null>(null);
  const draftRef = useRef(draft); const [source, setSource] = useState(''); const sourceRef = useRef<{ jobId: string; expires: string } | null>(null);
  const [pending, setPending] = useState<ConfirmNativeCaptionsValue | null>(null); const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [message, setMessage] = useState(''); const [reload, setReload] = useState(0); const [visible, setVisible] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const emptyCaption = draft?.cues.findIndex(cue => !cue.text.trim()) ?? -1;
  useDidShow(() => setVisible(true)); useDidHide(() => setVisible(false));
  useEffect(() => { draftRef.current = null; sourceRef.current = null; setDraft(null); setSource(''); setReview(null); onReviewChange(null); setPending(null); setEditing(false); }, [jobId]);
  useEffect(() => {
    if (!visible) return; let active = true; let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      try {
        const value = await nativeCaptionReview(jobId); const original = await pendingNativeCaptions(jobId); const saved = await loadNativeCaptionDraft(jobId);
        if (!active) return; setReview(value); onReviewChange(value); setPending(original); setMessage('');
        if (value && value.state !== 'transcribing' && draftRef.current?.revision !== value.revision) {
          const next = value.state === 'review' && saved?.revision === value.revision ? saved : { revision: value.revision, cues: value.cues };
          draftRef.current = next; setDraft(next);
        }
        if (value && (sourceRef.current?.jobId !== jobId || Date.parse(sourceRef.current.expires) - Date.now() < 30000)) {
          const access = await nativeSourceAccess(jobId); if (!active) return; sourceRef.current = { jobId, expires: access.urlExpiresAt }; setSource(access.url);
        }
      } catch { if (active) setMessage('暂时无法读取字幕，已有修改保留。'); }
      finally { if (active) timer = setTimeout(() => { void refresh(); }, 2500); }
    }
    void refresh(); return () => { active = false; if (timer) clearTimeout(timer); };
  }, [jobId, visible, reload]);
  function edit(index: number, text: string) {
    if (!draftRef.current || busy || pending) return; const next = { ...draftRef.current, cues: draftRef.current.cues.map((cue, at) => at === index ? { ...cue, text } : cue) };
    draftRef.current = next; setDraft(next); setSaveStatus('正在保存修改…');
    void saveNativeCaptionDraft(jobId, next).then(() => setSaveStatus('修改已保存在本机'), () => setSaveStatus('当前修改尚未保存，请保留页面后重试。'));
  }
  async function confirm() {
    if (busyRef.current || !draftRef.current) return; busyRef.current = true; setBusy(true); setMessage('');
    try { const value = await confirmNativeCaptions(jobId, draftRef.current); setReview(value); onReviewChange(value); setPending(null); setEditing(false); }
    catch { setPending(await pendingNativeCaptions(jobId)); setMessage('确认结果待核对，请刷新或继续确认原请求。'); }
    finally { busyRef.current = false; setBusy(false); setReload(value => value + 1); }
  }
  async function retry() { if (busyRef.current) return; busyRef.current = true; setBusy(true); try { await resumeNativeMedia(jobId); setMessage('正在继续处理原视频，不会重新生成或扣费。'); } catch { setMessage('暂未恢复，请稍后重试。'); } finally { busyRef.current = false; setBusy(false); setReload(value => value + 1); } }
  return <View className="native-caption-review">
    <Text className="caption-instruction">{review?.state === 'review' ? '先播放原声，再核对字幕。发现错字可直接修改。' : review?.state === 'ready' ? '正在把已确认的字幕加入原视频，完成后可保存。' : '正在保存原视频并识别字幕，你可以先离开，从作品继续查看。'}</Text>
    {source && <Video id="native-source-video" className="marketing-video-preview" src={source} controls showFullscreenBtn objectFit="contain" onError={() => { sourceRef.current = null; setReload(value => value + 1); }} />}
    {source && <Text className="studio-small">原视频保留7天，请及时确认字幕并保存成片。</Text>}
    {review?.state === 'review' && draft && <>
      <Text className="studio-small">字幕按原声识别，可能有同音字。只需改错字，再确认完成；不会重新生成视频。</Text>
      {draft.cues.map((cue, index) => <View className="native-caption-line" key={index}><Text className="studio-small">第 {index + 1} 句</Text>{editing ? <Textarea className="native-caption-input" aria-label={`第 ${index + 1} 句字幕`} value={cue.text} maxlength={160} disabled={busy || !!pending} onInput={event => edit(index, event.detail.value)} /> : <Text className="native-caption-text">{cue.text}</Text>}</View>)}
      <View className="native-caption-actions"><Text id="native-caption-draft-state" className="studio-small">{emptyCaption >= 0 ? `第 ${emptyCaption + 1} 句字幕为空，请填写后再确认；空行尚未保存。` : saveStatus || '字幕确认后制作成片 · 修改与合成免费'}</Text><View className="native-caption-buttons"><Button className="studio-text-button native-caption-edit" disabled={busy || !!pending} onClick={() => setEditing(value => !value)}>{editing ? '收起编辑' : '修改字幕'}</Button>
        <Button className="native-caption-confirm" disabled={busy || draft.cues.some(cue => !cue.text.trim())} onClick={() => { void confirm(); }}>{busy ? '正在确认…' : pending ? '核对本次确认' : '确认字幕并完成'}</Button></View></View>
    </>}
    {review?.issue && <Text className="studio-preview-feedback">{review.issue === 'transcription_failed' ? '字幕识别暂未完成，原视频已保留。' : '合成暂未完成，已确认字幕和原视频都已保留。'}</Text>}
    {message && <Text className="studio-small">{message}</Text>}
    {(message || review?.issue) && <Button className="studio-text-button native-caption-refresh" onClick={() => setReload(value => value + 1)}>重新读取字幕状态</Button>}
    {(!review || !!review.issue) && <Button className="studio-text-button native-caption-retry" disabled={busy} onClick={() => { void retry(); }}>继续处理原视频</Button>}
  </View>;
}
