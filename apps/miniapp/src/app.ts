import { PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';

import { ensureSession } from './services/api';

import '@nutui/nutui-react-taro/dist/style.css';
import './app.scss';

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // 游客静默登录(登录授权屏):失败不阻塞 UI,各屏按需重试
    ensureSession().catch((e: unknown) => {
      console.warn('guest session failed:', (e as Error).message);
    });
  });

  return children;
}

export default App;
