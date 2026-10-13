import { useState } from 'react';
import { Button, Image, Input, Text, Textarea, View } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { MobilePage } from '../../features/studio/MobilePage';
import { Action } from '../../features/studio/shared';
import { createDramaProject, getDramaScript } from '../../services/generation';
import catClouds from '../../assets/studio/cat-clouds.png';

const genres = ['通用', '动作', '玄幻', '言情', '悬疑', '古装', '现代', '穿越', '重生', '都市', '宫斗', '喜剧', '科幻', '校园', '青春'] as const;
const tones = ['通用', '严肃', '搞笑', '讽刺', '稳重', '简洁'] as const;
const looks = ['3D国创', '都市言情', '美式3D', '都市漫画'] as const;
const ratios = ['4:3', '3:4', '16:9', '9:16'] as const;
type Mode = 'idea' | 'script';

function Choices({ values, value, onChange }: { values: readonly string[]; value: string; onChange: (value: string) => void }) {
  return <View className="drama-choices">{values.map(item => <Button key={item}
    className={`drama-choice ${value === item ? 'is-active' : ''}`} onClick={() => onChange(item)}>{item}</Button>)}</View>;
}

export default function CreateDrama() {
  const [mode, setMode] = useState<Mode>('idea');
  const [title, setTitle] = useState('');
  const [titles, setTitles] = useState<Record<Mode, string>>({ idea: '', script: '' });
  const [idea, setIdea] = useState('');
  const [script, setScript] = useState('');
  const [genre, setGenre] = useState<(typeof genres)[number]>('通用');
  const [tone, setTone] = useState<(typeof tones)[number]>('通用');
  const [look, setLook] = useState<(typeof looks)[number]>('3D国创');
  const [ratio, setRatio] = useState<(typeof ratios)[number]>('9:16');
  const [episodes, setEpisodes] = useState('5');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [moreSettings, setMoreSettings] = useState(false);
  useLoad(params => {
    const nextMode = params.mode === 'script' ? 'script' : 'idea';
    setMode(nextMode);
    if (nextMode === 'idea' && params.template === 'cat-clouds') {
      setTitle('云海飞行日记'); setGenre('科幻');
      setIdea('一只橘猫驾驶小飞船，穿过粉色云海，寻找失踪的月亮。途中，它收到一封来自未来自己的信：不要害怕，最远的星星也记得回家的路。');
    }
    if (nextMode === 'script' && typeof params.sourceScriptId === 'string') {
      void (async () => {
        try {
          const source = await getDramaScript(params.sourceScriptId);
          setTitle(`${source.title.slice(0, 26)} 副本`); setScript(source.latestVersion.content);
          report(`已载入剧本版本 ${source.latestVersion.ordinal}，保存后会创建新项目`);
        } catch { report('原剧本无法载入，请返回项目后重试'); }
      })();
    }
  });
  const content = mode === 'idea' ? idea : script;
  const limit = mode === 'idea' ? 1000 : 20000;
  function report(text: string) {
    setMessage(text);
    void Taro.showToast({ title: text, icon: 'none' });
  }

  async function save() {
    if (saving) return;
    if (!title.trim()) { report('请填写漫剧名称'); return; }
    if (!content.trim()) { report(mode === 'idea' ? '请填写你的想法' : '请填写剧本内容'); return; }
    if (!/^[1-9]\d?$/.test(episodes) || Number(episodes) > 40) { report('总集数必须是1至40的整数'); return; }
    setSaving(true);
    try {
      const project = await createDramaProject({ mode, title: title.trim(), content, look, aspectRatio: ratio,
        episodeCount: Number(episodes), ...(mode === 'idea' ? { genre, tone } : {}) });
      try { await Taro.setStorage({ key: `wb:drama-draft:${mode}`, data: {
        version: 1, mode, title: title.trim(), content, look, ratio, episodes: Number(episodes),
        ...(mode === 'idea' ? { genre, tone } : {}), savedAt: new Date().toISOString(),
      } }); } catch { report('云端项目已保存，本机备份未保存'); }
      if (project.mode === 'idea') {
        report('想法项目已保存，剧本生成尚未开放');
        void Taro.redirectTo({ url: `/pages/studio-drama-project/index?id=${project.id}` });
      }
      else {
        report(project.activeVersion?.parse.status === 'parsed' ? '云端项目和剧本已保存' : '云端剧本已保存，需要修复格式');
        void Taro.redirectTo({ url: '/pages/studio-drama-library/index' });
      }
    } catch { report('云端保存失败，请检查网络后重试'); }
    finally { setSaving(false); }
  }

  async function saveDraft() {
    if (!/^[1-9]\d?$/.test(episodes) || Number(episodes) > 40) { report('总集数必须是1至40的整数'); return; }
    try {
      await Taro.setStorage({ key: `wb:drama-draft:${mode}`, data: { version: 1, mode, title, content, look, ratio,
        episodes: Number(episodes), ...(mode === 'idea' ? { genre, tone } : {}), savedAt: new Date().toISOString() } });
      report('本机草稿已保存');
    } catch { report('草稿未保存，请先复制内容'); }
  }

  async function restore() {
    try {
      const { data } = await Taro.getStorage({ key: `wb:drama-draft:${mode}` });
      if (data?.version !== 1 || data.mode !== mode || typeof data.title !== 'string' || data.title.length > 30 ||
          typeof data.content !== 'string' || data.content.length > limit || !looks.includes(data.look) ||
          !['4:3', '3:4', '16:9', '9:16'].includes(data.ratio) || !Number.isInteger(data.episodes) ||
          data.episodes < 1 || data.episodes > 40 ||
          (mode === 'idea' && (!genres.includes(data.genre) || !tones.includes(data.tone)))) {
        report('草稿格式不兼容，请重新填写'); return;
      }
      setTitle(data.title); setLook(data.look); setRatio(data.ratio); setEpisodes(String(data.episodes));
      if (mode === 'idea') { setIdea(data.content); setGenre(data.genre); setTone(data.tone); }
      else setScript(data.content);
      report('已恢复本机草稿，可继续编辑');
    } catch { report('本机没有可恢复的该模式草稿'); }
  }

  return <MobilePage><View className="studio-screen studio-drama-create ui-v2">
    <View className="studio-form-body drama-create-body">
      <Text className="v2-eyebrow">2049出片 / 一个故事的开始</Text>
      <Text className="v2-create-headline">好故事，{'\n'}从你开始。</Text>
      <Choices values={['想法创作', '已有剧本']} value={mode === 'idea' ? '想法创作' : '已有剧本'}
        onChange={value => { const nextMode = value === '想法创作' ? 'idea' : 'script'; setTitles(previous => ({ ...previous, [mode]: title })); setTitle(nextMode === mode ? title : titles[nextMode]); setMode(nextMode); setMessage(''); }} />
      <Text className="studio-field-heading">漫剧名称</Text>
      <Input id="drama-title" className="drama-title-input" value={title} maxlength={30} placeholder="给你的故事起个名字" onInput={event => setTitle(event.detail.value)} />
      <Text className="studio-small">{title.length}/30</Text>
      <View className="studio-field-title"><Text>{mode === 'idea' ? '输入想法' : '输入剧本'}</Text>
        <Button className="studio-text-button" onClick={() => { void restore(); }}>恢复本机草稿</Button></View>
      <Textarea id="drama-content" key={mode} className="drama-content-input" value={content} maxlength={limit}
        placeholder={mode === 'idea' ? '描述人物、故事背景和冲突…' : '粘贴完整剧本，保留集数、场景和对白…'}
        onInput={event => { if (mode === 'idea') setIdea(event.detail.value); else setScript(event.detail.value); }} />
      <View className="studio-field-title"><Text className="studio-small">{content.length}/{limit}</Text>
        {mode === 'idea' && <Button className="v2-inspire" onClick={() => {
          if (idea.trim()) { report('请先清空内容，避免覆盖你的想法'); return; }
          setIdea('一只橘猫驾驶小飞船，穿过粉色云海，寻找失踪的月亮。它发现月亮留下的最后一封信，收件人竟然是自己。');
        }}>✦ 试试灵感</Button>}
        <Button className="studio-text-button" onClick={() => {
          void Taro.showModal({ title: '清空当前内容？', content: '仅清空当前模式输入，不会删除已保存的本机草稿。' }).then(result => {
            if (result.confirm) { if (mode === 'idea') setIdea(''); else setScript(''); }
          });
        }}>清空</Button></View>
      <Text className="studio-field-heading">视频风格</Text>
      <Choices values={looks} value={look} onChange={value => { if (looks.includes(value as (typeof looks)[number])) setLook(value as (typeof looks)[number]); }} />
      <View className="v2-style-preview"><Image src={catClouds} mode="aspectFill" /><Text>画面参考 · 非实时风格生成</Text></View>
      {mode === 'idea' && <Button className="v2-settings" onClick={() => setMoreSettings(!moreSettings)}>更多设置 <Text>{moreSettings ? '收起 −' : '题材、语气 ＋'}</Text></Button>}
      {moreSettings && mode === 'idea' && <><Text className="studio-field-heading">故事类型</Text>
        <Choices values={genres} value={genre} onChange={value => { if (genres.includes(value as (typeof genres)[number])) setGenre(value as (typeof genres)[number]); }} />
        <Text className="studio-field-heading">剧本风格</Text><Choices values={tones} value={tone} onChange={value => { if (tones.includes(value as (typeof tones)[number])) setTone(value as (typeof tones)[number]); }} /></>}
      <Text className="studio-field-heading">视频尺寸</Text>
      <Choices values={ratios} value={ratio} onChange={value => { if (ratios.includes(value as (typeof ratios)[number])) setRatio(value as (typeof ratios)[number]); }} />
      <Text className="studio-field-heading">总集数</Text>
      <Choices values={['5', '10', '15', '20', '25', '30', '40']} value={episodes} onChange={setEpisodes} />
      <Input className="drama-episodes-input" type="number" value={episodes} maxlength={2} placeholder="自定义1–40集" onInput={event => setEpisodes(event.detail.value)} />
      <Button className="studio-text-button" onClick={() => { void saveDraft(); }}>保存本机草稿</Button>
      <Text className="studio-small">保存会创建云端项目；想法模式只保存待生成想法，已有剧本会立即建立可修复的解析版本。本机草稿仅作恢复备份。</Text>
      {message && <View className="studio-preview-feedback">{message}</View>}
    </View>
    <View className="studio-bottom-action"><Text className="studio-small">云端项目，不扣积分</Text><Action id="drama-create-submit" disabled={saving} onClick={() => { void save(); }}>{saving ? '正在保存…' : mode === 'idea' ? '保存想法项目' : '导入剧本'}</Action></View>
  </View></MobilePage>;
}
