import { useEffect, useState } from 'react';
import { Button, Text, Video, View } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import type { GenerationView, MediaAccess } from '@wb/contracts';
import { generationWallet, mediaAccess, readGeneration } from '../../services/generation';
import { MobilePage } from '../../features/studio/MobilePage';
import { Action } from '../../features/studio/shared';

export default function StudioProgress() {
  const [id, setId] = useState('');
  const [job, setJob] = useState<GenerationView | null>(null);
  const [media, setMedia] = useState<MediaAccess | null>(null);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [playback, setPlayback] = useState('待播放');
  const [position, setPosition] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);
  useLoad(params => { if (params.id) setId(params.id); });
  useEffect(() => {
    if (!id) return;
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
        if (result.status !== 'accepted') {
          const wallet = await generationWallet();
          if (active) setBalance(wallet.balance);
        } else timer = setTimeout(() => { void load(); }, 2000);
      } catch { if (active) setMessage('暂时无法读取任务或成片，请重试；不要重复创建任务'); }
    }
    void load();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [id, retry]);
  async function save() {
    if (!media || saving) return;
    setSaving(true); setSaved('');
    try {
      const access = await mediaAccess(id);
      if (process.env.TARO_ENV !== 'weapp') {
        await Taro.setClipboardData({ data: access.url });
        setSaved('已复制临时下载链接，有效期10分钟'); return;
      }
      const download = await Taro.downloadFile({ url: access.url });
      if (download.statusCode !== 200) throw new Error('Download failed');
      if (Taro.getDeviceInfo().platform === 'devtools') {
        const file = await new Promise<{ savedFilePath: string }>((resolve, reject) => Taro.getFileSystemManager().saveFile({ tempFilePath: download.tempFilePath, success: resolve, fail: reject }));
        const info = await new Promise<{ size: number; digest?: string }>((resolve, reject) => Taro.getFileSystemManager().getFileInfo({ filePath: file.savedFilePath, digestAlgorithm: 'md5', success: resolve, fail: reject }));
        if (info.size !== access.byteLength) throw new Error('Saved file size mismatch');
        await Taro.setStorage({ key: 'wb_v2_saved_media', data: { jobId: id, filePath: file.savedFilePath, size: info.size, md5: info.digest } });
        setSaved('已保存到小程序本地文件（开发者工具）；手机相册需真机验证');
      } else {
        await Taro.saveVideoToPhotosAlbum({ filePath: download.tempFilePath });
        setSaved('已保存到手机相册');
      }
    } catch { setSaved('保存失败，请检查下载连接或相册权限后重试'); }
    finally { setSaving(false); }
  }
  return <MobilePage notice="真实任务 · 失败退还预留积分"><View className="studio-screen studio-result">
    <View className="studio-form-body studio-result-body">
      <Text className="studio-field-heading">{job?.status === 'succeeded' ? '你的成片已就绪' : job?.status === 'failed' ? '生成未完成' : '正在生成与处理视频'}</Text>
      <Text className="studio-small">任务 {id || '加载中'}</Text>
      {job?.status === 'accepted' && <View className="studio-preview-feedback">已预留 {job.reservedCredits} 积分。离开页面不会中断任务，可从首页继续查看。</View>}
      {job?.status === 'failed' && <View className="studio-preview-feedback">本次生成失败，预留积分已退还。</View>}
      {media && <><Video id="generated-video" src={media.url} controls showCenterPlayBtn objectFit="contain"
        style={{ width: '100%', height: '420px', marginTop: '18px', background: '#171719' }}
        onPlay={() => setPlayback('正在播放')} onEnded={() => setPlayback('播放结束')}
        onTimeUpdate={event => setPosition(event.detail.currentTime)}
        onError={() => { setPlayback('播放失败'); setMessage('视频链接可能已过期，请重新获取'); }} />
        <Text id="video-playback-state" className="studio-small">{playback} · {position.toFixed(1)} 秒</Text>
        <View className="studio-preview-feedback">已消耗 {job?.actualCredits} 积分{balance !== null ? ` · 可用 ${balance} 积分` : ''}。视频含 AI 标识，请在7天内保存。</View>
      </>}
      {message && <View className="studio-preview-feedback">{message}<Button onClick={() => setRetry(value => value + 1)}>重新读取</Button></View>}
      {saved && <View id="video-save-state" className="studio-preview-feedback">{saved}</View>}
    </View>
    <View className="studio-bottom-action"><Text className="studio-small">{media ? `${media.width} × ${media.height} · ${(media.durationMs / 1000).toFixed(1)}秒` : '任务状态会自动更新'}</Text>
      <Action id="save-generated-video" disabled={!media || saving} onClick={() => { void save(); }}>{saving ? '保存中…' : process.env.TARO_ENV === 'weapp' ? '保存视频' : '复制下载链接'}</Action>
    </View>
  </View></MobilePage>;
}
