export default defineAppConfig({
  pages: process.env.TARO_APP_STUDIO_PREVIEW === '1'
    ? process.env.TARO_ENV === 'weapp'
      ? ['pages/studio-home/index', 'pages/studio-marketing/index', 'pages/studio-storyboard/index', 'pages/studio-drama-create/index', 'pages/studio-progress/index']
      : ['pages/studio-preview/index', 'pages/studio-home/index', 'pages/studio-marketing/index', 'pages/studio-storyboard/index', 'pages/studio-drama-create/index', 'pages/studio-progress/index']
    : ['pages/index/index', 'pages/mine/index', 'pages/store/index', 'pages/create/index', 'pages/progress/index', 'pages/works/index'],
  window: {
    navigationBarTitleText: '2049出片',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f2f3f5',
  },
});
