import { View, Text } from '@tarojs/components';
import { showToast } from '@tarojs/taro';
import { Button, Progress, Tag } from '@nutui/nutui-react-taro';

import './index.scss';

const FEATURES = [
  { key: 'idea', mark: '灵', title: '灵感成片', desc: '上传参考图 + 一句描述,直接出片' },
  { key: 'tpl', mark: '模', title: '模板复用', desc: '对标热门模板,同款一键套用' },
  { key: 'credit', mark: '积', title: '积分透明', desc: '生成前估算,失败即时退积分' },
];

/** T0.2 验收页:NutUI 组件拼装 + design tokens(ADR-0004:UI=组装,不自研组件)。 */
export default function Index() {
  return (
    <View className="index-page">
      <View className="index-header">
        <Text className="index-brand">2049出片</Text>
        <Tag>工程壳</Tag>
      </View>

      <View className="index-hero">
        <View className="index-hero-glow" />
        <Text className="index-hero-title">把想法,变成片</Text>
        <Text className="index-hero-sub">一句话生成营销短视频</Text>
        <View className="index-hero-pill">
          <Text className="index-hero-pill-text">新用户免费 1 条 480P 预览</Text>
        </View>
        <Button
          type="primary"
          className="index-hero-btn"
          onClick={() => showToast({ title: '生成流水线随 M2 上线', icon: 'none' })}
        >
          免费开始创作
        </Button>
      </View>

      <Text className="index-section-title">今天能做什么</Text>
      {FEATURES.map((f) => (
        <View key={f.key} className="index-feature">
          <View className="index-feature-mark">
            <Text className="index-feature-mark-text">{f.mark}</Text>
          </View>
          <View className="index-feature-body">
            <Text className="index-feature-title">{f.title}</Text>
            <Text className="index-feature-desc">{f.desc}</Text>
          </View>
        </View>
      ))}

      <View className="index-quota">
        <View className="index-quota-row">
          <Text className="index-quota-label">本周免费额度</Text>
          <Text className="index-quota-value">剩余 1 / 1 条</Text>
        </View>
        <Progress percent={100} />
        <Text className="index-quota-note">480P 预览 · 带水印 · TTL 内可下载</Text>
      </View>

      <View className="index-footer">
        <Text className="index-footer-text">Taro × NutUI · weapp + H5 一码双出</Text>
      </View>
    </View>
  );
}
