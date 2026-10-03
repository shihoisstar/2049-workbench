import { PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';

import '@nutui/nutui-react-taro/dist/style.css';
import './app.scss';

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // T0.2:启动埋点/游客态初始化随 T1.1 落地
  });

  return children;
}

export default App;
