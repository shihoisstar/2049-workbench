import { useEffect, useRef, useState } from 'react';
import { Button, Text, Video, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useLoad } from '@tarojs/taro';
import type { GenerationView, MediaAccess, NativeCaptionReviewValue } from '@wb/contracts';
import { generationUserId, generationWallet, mediaAccess, readGeneration } from '../../services/generation';
import { clearSavedMedia, saveLocalMedia, VideoSaveError, videoSaveMessage } from '../../services/saved-media';
import { savedMediaIO } from '../../services/taro-video-save';
import { MobilePage } from '../../features/studio/MobilePage';
import { Action } from '../../features/studio/shared';
import { NativeCaptionReviewCard } from '../../features/studio/NativeCaptionReviewCard';
import { marketingTaskState, studioDate } from '../../services/marketing-presentation';
import { copyDownloadLink } from '../../services/download-link';
import { ApiError } from '@wb/api-client';

export default function StudioProgress() {
  const [id, setId] = useState('');
  const [job, setJob] = useState<GenerationView | null>(null);
  const [media, setMedia] = useState<MediaAccess | null>(null);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saved, setSaved] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const [playback, setPlayback] = useState('待播放');
  const [position, setPosition] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);
  const [captionReview, setCaptionReview] = useState<NativeCaptionReviewValue | null>(null);
  const [visible, setVisible] = useState(true);
  const [bottomClearance, setBottomClearance] = useState(160);
  useDidShow(() => setVisible(true)); useDidHide(() => setVisible(false));
  useLoad(params => { if (params.id) setId(params.id); });
  useEffect(() => {
    if (!id || !visible) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const result = await readGeneration(id);
        if (!active) return;
        setJob(result); setMessage('');
        if (result.status === 'succeeded') {
          const access = await mediaAccess(id);
          if (active) setMedia(access);
        }
        if (result.status !== 'accepted' || result.actualCredits !== null) {
          try { const wallet = await generationWallet(); if (active) setBalance(wallet.balance); }
          catch { if (active) setBalance(null); }
        }
        if (result.status === 'accepted') timer = setTimeout(() => { void load(); }, 2000);
      } catch (error) { if (active) {
        if (error instanceof ApiError && [403, 404, 410].includes(error.status)) setMessage('本次任务或成片暂时无法访问，请返回作品核对。');
        else { setMessage('连接暂时中断，正在自动重试。原任务保留，可从作品继续查看。'); timer = setTimeout(() => { void load(); }, 5000); }
      } }
    }
    void load();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [id, retry, visible]);
  const task = marketingTaskState(job, captionReview);
  useEffect(() => {
    let active = true;
    const measure = () => { void Taro.nextTick(() => {
      Taro.createSelectorQuery().select(`.studio-result ${media ? '.studio-bottom-action' : '.native-caption-actions'}`).boundingClientRect(rect => {
        if (active && rect && !Array.isArray(rect)) setBottomClearance(Math.max(0, Taro.getWindowInfo().windowHeight - rect.top) + 24);
      }).exec();
    }); };
    measure(); Taro.onWindowResize(measure);
    return () => { active = false; Taro.offWindowResize(measure); };
  }, [media, saved, captionReview?.state]);
  async function save() {
    if (!media || savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setSaved(''); setDownloadUrl(''); setSaveFailed(false);
    try {
      let access;
      try { access = await mediaAccess(id); } catch (error) { throw new VideoSaveError('download', error); }
      if (process.env.TARO_ENV !== 'weapp') {
        const copied = await copyDownloadLink(access.url, globalThis.navigator?.clipboard);
        setSaveFailed(!copied); setDownloadUrl(copied ? '' : access.url);
        setSaved(copied ? '已复制临时下载链接，有效期10分钟' : '复制未完成，请手动复制下方临时链接，有效期10分钟。'); return;
      }
      if (Taro.getDeviceInfo().platform === 'devtools') {
        const file = await saveLocalMedia(access, savedMediaIO(await generationUserId()));
        setSaved(`${file.reused ? '已复用校验完整的本地文件' : '已保存到小程序本地文件'}（开发者工具）；手机相册需真机验证`);
      } else {
        let download;
        try { download = await Taro.downloadFile({ url: access.url }); }
        catch (error) { throw new VideoSaveError('download', error); }
        if (download.statusCode !== 200) throw new VideoSaveError('download');
        try { await Taro.saveVideoToPhotosAlbum({ filePath: download.tempFilePath }); }
        catch (error) { throw new VideoSaveError('album', error); }
        setSaved('已保存到手机相册');
      }
    } catch (error) { setSaveFailed(true); setSaved(videoSaveMessage(error)); }
    finally { savingRef.current = false; setSaving(false); }
  }
  async function clearCache() {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try {
      const result = await Taro.showModal({ title: '清理本地视频缓存？', content: '请先把需要保留的视频导出到电脑。这将删除本账户由此保存功能记录的本地文件；云端作品、草稿、相册及未记录的旧文件保留。云端视频到期后无法重新下载。' });
      if (!result.confirm) return;
      const remaining = await clearSavedMedia(savedMediaIO(await generationUserId()));
      setSaveFailed(remaining > 0);
      setSaved(remaining ? '部分缓存未能清理，请重试。' : '已清理本账户的视频缓存，可重新保存。');
    } catch { setSaveFailed(true); setSaved('缓存未能清理，请重试。'); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return <MobilePage notice={job?.provider === 'mock' ? '开发模拟 · 固定样片体验' : '我的视频 · 制作进度与保存'}><View className="studio-screen studio-result ui-v2">
    <View className="studio-form-body studio-result-body" style={{ paddingBottom: `${bottomClearance}px` }}>
      <View className="marketing-result-heading"><Text className="studio-field-heading">{task.title}</Text><Button className="studio-text-button" id="view-all-works" onClick={() => { void Taro.reLaunch({ url: '/pages/studio-works/index' }); }}>返回作品</Button></View>
      {job?.durationSec === 10 && job.status !== 'failed' && <View id="marketing-task-steps" className="marketing-task-steps">{['生成视频', '核对字幕', '制作成片', '保存视频'].map((label, index) => <Text key={label} className={index === task.step ? 'is-current' : index < task.step ? 'is-done' : ''}>{index < task.step ? '✓' : index + 1} {label}</Text>)}</View>}
      {job?.provider === 'mock' && <View className="studio-preview-feedback">开发模拟演练：使用固定样片，不调用付费模型。</View>}
      {job?.durationSec !== 10 && <Text className="studio-small">任务 {id || '加载中'}</Text>}
      {job?.status === 'accepted' && <View className="studio-preview-feedback">{job.actualCredits !== null ? `已消耗 ${job.actualCredits} ${job.provider === 'mock' ? '测试积分' : '积分'}。视频已生成，字幕修改和合成重试免费。` : `已预留 ${job.reservedCredits} ${job.provider === 'mock' ? '测试积分' : '积分'}。${job.settlementPoint === 'preview' ? '视频可预览后结算一次。' : '成片完成后结算。'}`}离开页面后可继续找回。</View>}
      {job?.durationSec === 10 && job.status === 'accepted' && <NativeCaptionReviewCard jobId={job.id} onReviewChange={setCaptionReview} />}
      {job?.status === 'failed' && <View className="studio-preview-feedback">本次生成失败，预留积分已退还。</View>}
      {media && <><Video id="generated-video" className="marketing-video-preview" src={media.url} controls showCenterPlayBtn showFullscreenBtn objectFit="contain"
        onPlay={() => setPlayback('正在播放')} onEnded={() => setPlayback('播放结束')}
        onTimeUpdate={event => setPosition(event.detail.currentTime)}
        onError={() => { setPlayback('播放失败'); setMessage('视频链接可能已过期，请重新获取'); }} />
        <Text id="video-playback-state" className="studio-small">{playback} · {position.toFixed(1)} 秒</Text>
        <View className="studio-preview-feedback">已消耗 {job?.actualCredits} 积分{balance !== null ? ` · 可用 ${balance} 积分` : ''}。云端有效至 {studioDate(media.expiresAt)}，请及时保存。视频含 AI 标识。</View>
      </>}
      {message && <View className="studio-preview-feedback">{message}<Button onClick={() => setRetry(value => value + 1)}>重新读取</Button></View>}
      {process.env.TARO_ENV === 'weapp' && Taro.getDeviceInfo().platform === 'devtools' && <Button id="clear-video-cache" className="studio-text-button" disabled={saving} onClick={() => { void clearCache(); }}>清理本地视频缓存</Button>}
    </View>
    {media && <View className="studio-bottom-action"><Text className="studio-small">{`${media.width} × ${media.height} · ${(media.durationMs / 1000).toFixed(1)}秒`}</Text>
      {saved && <View id="video-save-state" className={`marketing-save-feedback ${saveFailed ? 'is-error' : ''}`}>{saved}</View>}
      {downloadUrl && <Text id="video-download-link" className="marketing-download-link" selectable>{downloadUrl}</Text>}
      <Action id="save-generated-video" disabled={!media || saving} onClick={() => { void save(); }}>{saving ? '保存中…' : process.env.TARO_ENV === 'weapp' ? '保存视频' : '复制下载链接'}</Action>
    </View>}
  </View></MobilePage>;
}
