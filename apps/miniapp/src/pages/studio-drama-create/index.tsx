import { useState } from 'react';
import { Button, Input, Text, Textarea, View } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { MobilePage } from '../../features/studio/MobilePage';
import { Action } from '../../features/studio/shared';

const genres = ['通用', '动作', '玄幻', '言情', '悬疑', '古装', '现代', '穿越', '重生', '都市', '宫斗', '喜剧', '科幻', '校园', '青春'];
const tones = ['通用', '严肃', '搞笑', '讽刺', '稳重', '简洁'];
const looks = ['3D国创', '都市言情', '美式3D', '都市漫画'];
type Mode = 'idea' | 'script';

function Choices({ values, value, onChange }: { values: string[]; value: string; onChange: (value: string) => void }) {
  return <View className="drama-choices">{values.map(item => <Button key={item}
    className={`drama-choice ${value === item ? 'is-active' : ''}`} onClick={() => onChange(item)}>{item}</Button>)}</View>;
}

export default function CreateDrama() {
  const [mode, setMode] = useState<Mode>('idea');
  const [title, setTitle] = useState('');
  const [idea, setIdea] = useState('');
  const [script, setScript] = useState('');
  const [genre, setGenre] = useState('通用');
  const [tone, setTone] = useState('通用');
  const [look, setLook] = useState('3D国创');
  const [ratio, setRatio] = useState('9:16');
  const [episodes, setEpisodes] = useState('5');
  const [message, setMessage] = useState('');
  useLoad(params => { setMode(params.mode === 'script' ? 'script' : 'idea'); });
  const content = mode === 'idea' ? idea : script;
  const limit = mode === 'idea' ? 1000 : 20000;
  function report(text: string) {
    setMessage(text);
    void Taro.showToast({ title: text, icon: 'none' });
  }

  async function save() {
    if (!title.trim()) { report('请填写漫剧名称'); return; }
    if (!content.trim()) { report(mode === 'idea' ? '请填写你的想法' : '请填写剧本内容'); return; }
    if (!/^[1-9]\d?$/.test(episodes) || Number(episodes) > 40) { report('总集数必须是1至40的整数'); return; }
    try {
      await Taro.setStorage({ key: `wb:drama-draft:${mode}`, data: {
        version: 1, mode, title: title.trim(), content, look, ratio, episodes: Number(episodes),
        ...(mode === 'idea' ? { genre, tone } : {}), savedAt: new Date().toISOString(),
      } });
      report('已保存到本机，未创建生成任务、未扣费');
    } catch { report('本机保存失败，请重试'); }
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

  return <MobilePage><View className="studio-screen studio-drama-create">
    <View className="studio-form-body drama-create-body">
      <Choices values={['想法创作', '已有剧本']} value={mode === 'idea' ? '想法创作' : '已有剧本'}
        onChange={value => { setMode(value === '想法创作' ? 'idea' : 'script'); setMessage(''); }} />
      <Text className="studio-field-heading">漫剧名称</Text>
      <Input className="drama-title-input" value={title} maxlength={30} placeholder="给你的故事起个名字" onInput={event => setTitle(event.detail.value)} />
      <Text className="studio-small">{title.length}/30</Text>
      <View className="studio-field-title"><Text>{mode === 'idea' ? '输入想法' : '输入剧本'}</Text>
        <Button className="studio-text-button" onClick={() => { void restore(); }}>恢复本机草稿</Button></View>
      <Textarea key={mode} className="drama-content-input" value={content} maxlength={limit}
        placeholder={mode === 'idea' ? '描述人物、故事背景和冲突…' : '粘贴完整剧本，保留集数、场景和对白…'}
        onInput={event => { if (mode === 'idea') setIdea(event.detail.value); else setScript(event.detail.value); }} />
      <View className="studio-field-title"><Text className="studio-small">{content.length}/{limit}</Text>
        <Button className="studio-text-button" onClick={() => {
          void Taro.showModal({ title: '清空当前内容？', content: '仅清空当前模式输入，不会删除已保存的本机草稿。' }).then(result => {
            if (result.confirm) { if (mode === 'idea') setIdea(''); else setScript(''); }
          });
        }}>清空</Button></View>
      <Text className="studio-field-heading">视频风格</Text>
      <Choices values={looks} value={look} onChange={setLook} />
      {mode === 'idea' && <><Text className="studio-field-heading">故事类型</Text>
        <Choices values={genres} value={genre} onChange={setGenre} />
        <Text className="studio-field-heading">剧本风格</Text><Choices values={tones} value={tone} onChange={setTone} /></>}
      <Text className="studio-field-heading">视频尺寸</Text>
      <Choices values={['4:3', '3:4', '16:9', '9:16']} value={ratio} onChange={setRatio} />
      <Text className="studio-field-heading">总集数</Text>
      <Choices values={['5', '10', '15', '20', '25', '30', '40']} value={episodes} onChange={setEpisodes} />
      <Input className="drama-episodes-input" type="number" value={episodes} maxlength={2} placeholder="自定义1–40集" onInput={event => setEpisodes(event.detail.value)} />
      <Text className="studio-small">每种模式保留一份本机草稿，再次保存会覆盖旧草稿。当前设置不会触发模型调用。</Text>
      {message && <View className="studio-preview-feedback">{message}</View>}
    </View>
    <View className="studio-bottom-action"><Text className="studio-small">草稿仅保存在本机</Text><Action onClick={() => { void save(); }}>保存创作草稿</Action></View>
  </View></MobilePage>;
}
