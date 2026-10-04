import { useCallback, useEffect, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Tag } from '@nutui/nutui-react-taro';

import type { Template } from '@wb/contracts';

import { ensureSession, getTemplates, getWallet } from '../../services/api';

import './index.scss';


const TABS = [
  { key: 'home', label: '首页', url: '/pages/index/index', active: true },
  { key: 'create', label: '创作', url: '/pages/create/index', active: false },
  { key: 'mine', label: '我的', url: '/pages/mine/index', active: false },
];

/** 模板 feed 首页(T3.2):对标 S02 结构(顶部积分入口/hero/分类 chips/双列卡/底部导航),
 * 差异化=真实积分余额条 + 不放假倒计时;视觉走黑红 tokens。 */
export default function Index() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [category, setCategory] = useState('全部');
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        await ensureSession();
        const [tplList, wallet] = await Promise.all([getTemplates(), getWallet().catch(() => null)]);
        setTemplates(tplList); // getTemplates 已返回数组(getTemplates 内部解包 templates 字段)
        if (wallet) setBalance(wallet.balance);
      } catch {
        // feed 为公开内容;余额拉不到不影响浏览
      }
    })();
  }, []);

  const categories = ['全部', ...new Set(templates.map((t) => t.category))];
  const shown = category === '全部' ? templates : templates.filter((t) => t.category === category);

  const goCreate = useCallback((tpl?: Template) => {
    if (tpl) Taro.setStorageSync('wb_prefill', { promptTemplate: tpl.promptTemplate, title: tpl.title });
    Taro.navigateTo({ url: '/pages/create/index' });
  }, []);

  const goTab = useCallback((url: string) => {
    if (!url.includes('pages/index')) Taro.redirectTo({ url });
  }, []);

  return (
    <View className="index-page">
      <View className="index-header">
        <Text className="index-brand">2049出片</Text>
        <View
          className="index-coin"
          onClick={() => Taro.navigateTo({ url: '/pages/store/index' })}
        >
          <Text className="index-coin-num">{balance === null ? '—' : String(balance)}</Text>
          <Text className="index-coin-unit">积分</Text>
          <Text className="index-coin-arrow">›</Text>
        </View>
      </View>

      <View className="index-banner">
        <View className="index-hero">
          <View className="index-hero-glow" />
          <Text className="index-hero-title">AI 门店视频</Text>
          <Text className="index-hero-sub">一句话生成爆款种草视频</Text>
        </View>
      </View>

      <View className="index-cta">
        <View className="index-cta-btn" onClick={() => goCreate()}>
          <Text className="index-cta-btn-text">免费开始创作</Text>
        </View>
      </View>

      <View className="index-chips">
        {(categories || []).map((c) => (
          <View key={c} className={`index-chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>
            <Text className={`index-chip-text ${category === c ? 'active' : ''}`}>{c}</Text>
          </View>
        ))}
      </View>

      <View className="index-feed">
        {(shown || []).map((t) => (
          <View key={t.id} className="index-tpl" onClick={() => goCreate(t)}>
            <View className="index-tpl-cover" style={{ background: t.coverGradient }}>
              <Text className="index-tpl-cover-mark">{t.coverMark}</Text>
            </View>
            <View className="index-tpl-body">
              <Text className="index-tpl-title">{t.title}</Text>
              <View className="index-tpl-row">
                <Tag>{t.category}</Tag>
                <Text className="index-tpl-heat">近期使用 {t.heat}</Text>
              </View>
              <View className="index-tpl-cta">
                <Text className="index-tpl-cta-text">✦ 生成同款</Text>
              </View>
            </View>
          </View>
        ))}
        {shown.length === 0 && (
          <View className="index-empty">
            <Text className="index-empty-text">该分类暂无模板</Text>
          </View>
        )}
      </View>

      <View className="index-tabbar">
        {(TABS || []).map((t) => (
          <View key={t.key} className="index-tab" onClick={() => goTab(t.url)}>
            <View className={`index-tab-dot ${t.active ? 'active' : ''}`} />
            <Text className={`index-tab-label ${t.active ? 'active' : ''}`}>{t.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
