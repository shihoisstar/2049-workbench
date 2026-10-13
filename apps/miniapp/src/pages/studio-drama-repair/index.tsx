import { useState } from 'react';
import { Button, Text, Textarea, View } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import type { DramaScriptViewValue } from '@wb/contracts';
import { MobilePage } from '../../features/studio/MobilePage';
import { Action, Icon } from '../../features/studio/shared';
import { getDramaScript, repairDramaScript } from '../../services/generation';

export default function DramaRepair() {
  const [script, setScript] = useState<DramaScriptViewValue | null>(null);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useLoad(params => {
    if (typeof params.id !== 'string') { setError('剧本地址无效。'); return; }
    void (async () => {
      try {
        const loaded = await getDramaScript(params.id);
        setScript(loaded); setContent(loaded.latestVersion.content);
      } catch { setError('剧本无法加载，可能已不存在或不属于当前账户。'); }
    })();
  });

  async function repair() {
    if (!script || !content.trim() || submitting || content === script.latestVersion.content) return;
    setSubmitting(true); setError('');
    try {
      const version = await repairDramaScript(script.id, content);
      await Taro.showToast({ title: version.parse.status === 'parsed' ? '已保存并解析' : '已保存，仍需修复格式', icon: 'none' });
      void Taro.navigateBack();
    } catch { setError('保存修复版本失败，请检查网络后重试。'); }
    finally { setSubmitting(false); }
  }

  const diagnostics = script?.latestVersion.parse.diagnostics ?? [];
  return <MobilePage notice="云端剧本修复 · 保存后将新增版本，不会覆盖历史内容"><View className="studio-screen studio-drama-repair ui-v2">
    {!script && !error && <Text className="studio-works-footer">正在加载剧本…</Text>}
    {error && <View className="studio-preview-feedback"><Text>{error}</Text><Button className="studio-text-button" onClick={() => { void Taro.navigateBack(); }}>返回剧本库</Button></View>}
    {script && <View className="studio-form-body drama-repair-body">
      <View className="studio-library-heading"><Text className="studio-display">修复剧本</Text><Text className="studio-subtitle">{script.title}</Text></View>
      <View className="studio-repair-meta"><Text>当前版本 {script.latestVersion.ordinal}</Text><Text>{script.latestVersion.parse.status === 'parsed' ? '已解析' : '待修复'}</Text></View>
      {diagnostics.length > 0 && <View className="studio-repair-diagnostics"><Text className="studio-tool-title">请检查以下格式</Text>{diagnostics.map(item => <Text key={`${item.line}-${item.message}`} className="studio-small">第 {item.line} 行：{item.message}</Text>)}</View>}
      <Text className="studio-field-heading">剧本内容</Text>
      <Textarea className="drama-content-input" value={content} maxlength={20000} onInput={event => setContent(event.detail.value)} />
      <Text className="studio-small">{content.length}/20000 · 使用“## 第1集”、“**场景1：地点**”和“人物：对白”格式。</Text>
    </View>}
    {script && <View className="studio-bottom-action"><Text className="studio-small">保存后新增版本 {script.latestVersion.ordinal + 1}</Text><Action disabled={submitting || !content.trim() || content === script.latestVersion.content} onClick={() => { void repair(); }}><Icon name="edit" />{submitting ? '正在保存' : '保存修复版本'}</Action></View>}
  </View></MobilePage>;
}
