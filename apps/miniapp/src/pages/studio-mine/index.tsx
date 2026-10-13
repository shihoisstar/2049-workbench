import { useRef, useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh, useReachBottom } from '@tarojs/taro';
import type { WalletEntry } from '@wb/contracts';
import { deactivateAccount, generationWallet, listWalletEntries } from '../../services/generation';
import { MobilePage, openStudioPage } from '../../features/studio/MobilePage';
import { BottomNav, Icon } from '../../features/studio/shared';
import { studioDate, walletEntryAmount } from '../../services/marketing-presentation';

const typeLabels: Record<WalletEntry['type'], string> = {
  grant: '积分赠送',
  hold: '制作积分预留',
  settle: '制作结算',
  refund: '退款返还',
};

export default function StudioMine() {
  const [balance, setBalance] = useState<number | null>(null);
  const [entries, setEntries] = useState<WalletEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  async function load(more = false) {
    if (busy.current || (more && !cursor)) return;
    busy.current = true; setLoading(true); setError('');
    try {
      const page = await listWalletEntries(more ? cursor! : undefined);
      if (!more) {
        try { setBalance((await generationWallet()).balance); } catch { setBalance(null); }
      }
      setEntries(previous => more
        ? [...previous, ...page.entries.filter(entry => !previous.some(old => old.billingKey === entry.billingKey && old.type === entry.type))]
        : page.entries);
      setCursor(page.nextCursor); setLoaded(true);
    } catch { setError('积分明细暂时无法加载，请稍后重试。'); }
    finally { busy.current = false; setLoading(false); void Taro.stopPullDownRefresh(); }
  }
  async function confirmDeactivation() {
    const modal = await Taro.showModal({
      title: '注销账户',
      content: '注销后身份与余额不可恢复，全部作品与明细将作废。确定继续吗？',
      confirmText: '确认注销',
      confirmColor: '#d91b36',
    });
    if (!modal.confirm) return;
    try {
      await deactivateAccount();
      await Taro.showToast({ title: '账户已注销', icon: 'none' });
      void Taro.reLaunch({ url: process.env.TARO_APP_MARKETING_PILOT === '1' ? '/pages/studio-marketing/index' : '/pages/studio-home/index' });
    } catch {
      await Taro.showToast({ title: '注销失败，请稍后重试', icon: 'none' });
    }
  }
  useDidShow(() => { void load(); });
  usePullDownRefresh(() => { void load(); });
  useReachBottom(() => { if (!error) void load(true); });
  return <MobilePage notice="我的 · 余额与积分明细实时可查"><View className="studio-screen studio-mine">
    <View className="studio-works-heading"><Text className="studio-display">我的</Text><Text className="studio-subtitle">余额与积分明细</Text></View>
    <View className="studio-mine-balance" id="mine-balance">
      <View className="studio-mine-balance-copy">
        <Text className="studio-mine-balance-label">可用积分</Text>
        <Text className="studio-mine-balance-value">{balance ?? '—'}</Text>
      </View>
      <Button className="studio-text-button studio-mine-refresh" disabled={loading} onClick={() => { void load(); }}>刷新</Button>
    </View>
    <View className="studio-works-toolbar"><Text>积分明细</Text><Text className="studio-small">消费与退款全记录</Text></View>
    <Text className="marketing-wallet-note">制作前先预留积分，结算时只返还差额。“已结算”表示这笔制作已结算，不是再次扣费。</Text>
    {error && <View className="studio-preview-feedback" id="mine-error"><Text>{error}</Text><Button onClick={() => { void load(); }}>重新加载</Button></View>}
    {loading && !loaded && <View id="mine-loading" className="marketing-loading"><Text>正在读取积分明细…</Text><View /><View /></View>}
    {!error && loaded && !entries.length && <View id="mine-empty" className="studio-works-empty"><Icon name="user" /><Text className="studio-field-heading">还没有积分流水</Text><Text className="studio-small">完成创作或获得赠送后，这里会记录每一笔变动。</Text></View>}
    <View id="mine-entries">{entries.map(entry => <View key={`${entry.billingKey}:${entry.type}`} className="studio-mine-entry">
      <View className="studio-mine-entry-copy">
        <Text className="studio-mine-entry-title">{typeLabels[entry.type]}</Text>
        <Text className="studio-small">{studioDate(entry.createdAt)}{entry.remark ? ` · ${entry.remark}` : ''}</Text>
      </View>
      <Text className={`studio-mine-entry-amount ${entry.amount > 0 ? 'is-in' : entry.amount < 0 ? 'is-out' : 'is-neutral'}`}>{walletEntryAmount(entry)}</Text>
    </View>)}</View>
    {loading && loaded && <Text className="studio-works-footer">正在更新明细…</Text>}
    {!loading && !error && cursor && <Button className="studio-text-button studio-works-footer" onClick={() => { void load(true); }}>加载更多</Button>}
    {!loading && !error && loaded && entries.length > 0 && !cursor && <Text className="studio-works-footer">已显示全部明细 · 下拉刷新</Text>}
    <Button className="studio-mine-deactivate" id="mine-deactivate" onClick={() => { void confirmDeactivation(); }}>注销账户</Button>
    <BottomNav active="我的" onNavigate={openStudioPage} />
  </View></MobilePage>;
}
