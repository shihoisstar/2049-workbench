import { useCallback, useEffect, useState } from 'react';
import { View, Text } from '@tarojs/components';
import { Tag } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';

import type { WalletSummary } from '@wb/contracts';

import { deactivate, ensureSession, getWallet, submitFeedback } from '../../services/api';

import './index.scss';

const TYPE_LABEL: Record<string, string> = {
  grant: '赠送',
  hold: '冻结',
  settle: '结算',
  refund: '退回',
};

/** 我的 + 积分明细(T1.3):游客身份、余额、流水四态、注销闭环。 */
export default function Mine() {
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await ensureSession();
      setWallet(await getWallet());
    } catch (e) {
      setError((e as Error).message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onDeactivate = useCallback(async () => {
    try {
      await deactivate();
      Taro.showToast({ title: '已注销,正在以新身份进入', icon: 'none' });
      await load();
    } catch (e) {
      Taro.showToast({ title: (e as Error).message || '注销失败', icon: 'none' });
    }
  }, [load]);

  return (
    <View className="mine-page">
      <View className="mine-card">
        <View className="mine-head">
          <View className="mine-avatar">
            <Text className="mine-avatar-text">游</Text>
          </View>
          <View className="mine-head-body">
            <Text className="mine-name">游客用户</Text>
            <Text className="mine-sub">手机号绑定随小程序认证开放</Text>
          </View>
          <Tag>游客</Tag>
        </View>
        <View className="mine-balance">
          <Text className="mine-balance-num">{wallet ? String(wallet.balance) : '—'}</Text>
          <Text className="mine-balance-unit">积分</Text>
        </View>
        {wallet && (
          <Text className="mine-balance-note">
            注册已赠 1 条 480P 预览额度 · 积分不过期
          </Text>
        )}
        <View
          className="mine-recharge-btn"
          onClick={() => Taro.navigateTo({ url: '/pages/store/index' })}
        >
          <Text className="mine-recharge-btn-text">充值</Text>
        </View>
      </View>

      <View className="mine-section">
        <Text className="mine-section-title">积分明细</Text>
        {error ? (
          <View className="mine-empty">
            <Text className="mine-empty-text">{error}</Text>
          </View>
        ) : !wallet || wallet.entries.length === 0 ? (
          <View className="mine-empty">
            <Text className="mine-empty-text">{loading ? '加载中…' : '暂无流水'}</Text>
          </View>
        ) : (
          wallet.entries.map((e, i) => (
            <View key={`${e.billingKey}-${e.type}-${i}`} className="mine-entry">
              <View className={`mine-entry-badge ${e.amount >= 0 ? 'pos' : 'neg'}`}>
                <Text className="mine-entry-badge-text">{TYPE_LABEL[e.type] ?? e.type}</Text>
              </View>
              <View className="mine-entry-body">
                <Text className="mine-entry-remark">{e.remark ?? e.billingKey}</Text>
                <Text className="mine-entry-time">{new Date(e.createdAt).toLocaleString()}</Text>
              </View>
              <Text className={`mine-entry-amount ${e.amount >= 0 ? 'pos' : 'neg'}`}>
                {e.amount >= 0 ? `+${e.amount}` : String(e.amount)}
              </Text>
            </View>
          ))
        )}
      </View>

      <View
        className="mine-compliance"
        onClick={async () => {
          // H5 端 showModal 支持 editable 输入,但 Taro 类型未收录 → 局部断言
          const showModalEx = Taro.showModal as unknown as (o: Record<string, unknown>) => Promise<{ confirm: boolean; content?: string }>;
          const res = await showModalEx({
            title: '意见反馈',
            content: '告诉我哪里不好用、想要什么功能(1000 字内):',
            editable: true,
            placeholderText: '选填:联系方式(邮箱/微信),方便回访',
            confirmText: '提交',
          });
          if (res.confirm && res.content?.trim()) {
            try {
              await ensureSession();
              await submitFeedback(res.content.trim());
              Taro.showToast({ title: '已收到,感谢反馈', icon: 'success' });
            } catch (e) {
              Taro.showToast({ title: (e as Error).message || '提交失败', icon: 'none' });
            }
          }
        }}
      >
        <Text className="mine-compliance-text">意见反馈</Text>
        <Text className="mine-compliance-arrow">›</Text>
      </View>

      <View
        className="mine-compliance"
        onClick={() =>
          Taro.showModal({
            title: '水印与内容标识说明',
            content:
              '依据《互联网信息服务深度合成管理规定》第十六条、第十七条与《生成式人工智能服务管理暂行办法》第十二条:本平台生成的全部视频均携带显式水印(右下角“2049出片”)与元数据隐式标识,显式水印暂不支持关闭,元数据标识不可去除。成片保存期为 7 天,到期前请及时下载。',
            showCancel: false,
            confirmText: '我已了解',
          })
        }
      >
        <Text className="mine-compliance-text">水印与内容标识说明(合规)</Text>
        <Text className="mine-compliance-arrow">›</Text>
      </View>

      <View className="mine-actions">
        <View className="mine-btn ghost" onClick={() => void load()}>
          <Text className="mine-btn-text ghost">刷新</Text>
        </View>
        <View className="mine-btn danger" onClick={() => void onDeactivate()}>
          <Text className="mine-btn-text danger">注销账号</Text>
        </View>
      </View>
    </View>
  );
}
