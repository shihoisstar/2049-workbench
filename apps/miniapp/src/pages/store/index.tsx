import { useCallback, useEffect, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Tag } from '@nutui/nutui-react-taro';

import type { StorePackage } from '@wb/contracts';

import { createOrder, devPay, ensureSession, getPackages } from '../../services/api';

import './index.scss';

const RECOMMEND_ID = 'pkg-300'; // 标准档高亮(运营位,随定价策略调)

/** 充值页(T1.5):档位选择 → 下单 → 开发态支付(真实微信支付随商户号)。 */
export default function Store() {
  const [packages, setPackages] = useState<StorePackage[]>([]);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState('');

  const load = useCallback(async () => {
    try {
      await ensureSession();
      setPackages(await getPackages());
    } catch (e) {
      setError((e as Error).message || '加载失败');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onPay = useCallback(
    async (pkg: StorePackage) => {
      if (paying) return;
      setPaying(pkg.id);
      try {
        await ensureSession();
        const order = await createOrder(pkg.id);
        await devPay(order.id);
        Taro.showToast({ title: `充值成功 +${pkg.credits} 积分`, icon: 'none' });
        setTimeout(() => Taro.navigateBack(), 800);
      } catch (e) {
        Taro.showToast({ title: (e as Error).message || '支付失败', icon: 'none' });
      } finally {
        setPaying('');
      }
    },
    [paying],
  );

  return (
    <View className="store-page">
      <View className="store-banner">
        <Text className="store-banner-title">充值积分</Text>
        <Text className="store-banner-sub">积分不过期 · 失败即时退 · 明细可查</Text>
      </View>

      {error ? (
        <View className="store-error">
          <Text className="store-error-text">{error}</Text>
        </View>
      ) : (
        packages.map((p) => (
          <View key={p.id} className={`store-card ${p.id === RECOMMEND_ID ? 'recommend' : ''}`}>
            <View className="store-card-body">
              <View className="store-credits">
                <Text className="store-credits-num">{p.credits}</Text>
                <Text className="store-credits-unit">积分</Text>
              </View>
              <Text className="store-label">{p.label}</Text>
            </View>
            {p.id === RECOMMEND_ID && <Tag type="danger">推荐</Tag>}
            <View
              className={`store-pay-btn ${paying === p.id ? 'disabled' : ''}`}
              onClick={() => void onPay(p)}
            >
              <Text className="store-pay-btn-text">
                {paying === p.id ? '支付中…' : `¥${(p.priceCents / 100).toFixed(0)}`}
              </Text>
            </View>
          </View>
        ))
      )}

      <View className="store-note">
        <Text className="store-note-text">开发态:支付为模拟回调,即时入账;正式支付随商户号开通</Text>
      </View>
    </View>
  );
}
