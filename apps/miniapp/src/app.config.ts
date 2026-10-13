export default defineAppConfig({
  pages: process.env.TARO_APP_MARKETING_PILOT === '1'
    ? ['pages/studio-marketing/index', 'pages/studio-works/index', 'pages/studio-progress/index', 'pages/studio-mine/index']
    : process.env.TARO_APP_STUDIO_PREVIEW === '1'
    ? process.env.TARO_ENV === 'weapp'
      ? ['pages/studio-home/index', 'pages/studio-marketing/index', 'pages/studio-storyboard/index', 'pages/studio-drama-create/index', 'pages/studio-drama-library/index', 'pages/studio-drama-repair/index', 'pages/studio-drama-projects/index', 'pages/studio-drama-project/index', 'pages/studio-drama-prepare/index', 'pages/studio-drama-plan/index', 'pages/studio-progress/index', 'pages/studio-works/index', 'pages/studio-mine/index']
      : ['pages/studio-preview/index', 'pages/studio-home/index', 'pages/studio-marketing/index', 'pages/studio-storyboard/index', 'pages/studio-drama-create/index', 'pages/studio-drama-library/index', 'pages/studio-drama-repair/index', 'pages/studio-drama-projects/index', 'pages/studio-drama-project/index', 'pages/studio-drama-prepare/index', 'pages/studio-drama-plan/index', 'pages/studio-progress/index', 'pages/studio-works/index', 'pages/studio-mine/index']
    : ['pages/index/index', 'pages/mine/index', 'pages/store/index', 'pages/create/index', 'pages/progress/index', 'pages/works/index'],
  window: {
    navigationBarTitleText: '2049出片',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f2f3f5',
  },
});
