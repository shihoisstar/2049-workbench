import { useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import { Action, art, Cover, Icon, PageHeader, previewNotice } from './shared';

const shots = [
  {
    title: '雨夜街角',
    type: '远景',
    description: '雨中的城市，女孩撑着透明雨伞走过街角，回头望向镜头，眼神中藏着故事。',
  },
  {
    title: '窗边来信',
    type: '中景',
    description: '女孩在窗边写信，雨滴轻敲玻璃，神情温柔而专注。',
  },
  { title: '回眸', type: '特写', description: '女孩抬起头，眼中有光，似乎下定了某个决定。' },
];
export function StoryboardScreen({ onBack }: { onBack: () => void }) {
  const [candidate, setCandidate] = useState(0);
  const [selectedShot, setSelectedShot] = useState(2);
  const [demonstrated, setDemonstrated] = useState(false);
  return (
    <View className="studio-screen studio-storyboard" data-testid="studio-storyboard">
      <PageHeader title="雨夜来信  第1集" onBack={onBack} detail="···" />
      <View className="studio-story-body">
        <View className="studio-steps">
          {['剧本', '角色', '分镜', '成片'].map((label, index) => (
            <View
              key={label}
              className={`studio-step ${index < 3 ? 'is-reached' : ''} ${index === 2 ? 'is-current' : ''}`}
            >
              <View className="studio-step-track">
                <Text className="studio-step-number">{index < 2 ? '✓' : index + 1}</Text>
              </View>
              <Text>{label}</Text>
            </View>
          ))}
        </View>
        <View className="studio-story-heading">
          <View>
            <Text className="studio-field-heading">分镜工作台</Text>
            <Text className="studio-small">将剧本拆解为镜头，生成专属的动漫分镜</Text>
          </View>
          <Button
            className="studio-add-shot"
            onClick={() => previewNotice('预览展示三个镜头，完整编辑将在后续开放')}
          >
            <Icon name="plus" />
            添加镜头
          </Button>
        </View>
        <View className="studio-shot-list">
          {shots.map((shot, index) => (
            <View
              className={`studio-shot ${selectedShot === index ? 'is-selected' : ''}`}
              key={shot.title}
            >
              <Button className="studio-shot-main" onClick={() => setSelectedShot(index)}>
                <View className={`studio-shot-image studio-shot-image--${index}`}>
                  <Cover src={art.rain} />
                  <Text className="studio-shot-number">0{index + 1}</Text>
                </View>
                <View className="studio-shot-copy">
                  <View className="studio-shot-top">
                    <Text className="studio-small">shot 0{index + 1}</Text>
                    <Text>···</Text>
                  </View>
                  <View className="studio-shot-name">
                    <Text>{shot.title}</Text>
                    <Text
                      className={`studio-status studio-status--${index === 0 || demonstrated ? 'done' : index === 1 ? 'working' : 'waiting'}`}
                    >
                      {index === 0 || demonstrated
                        ? '✓ 已完成'
                        : index === 1
                          ? '◌ 生成中'
                          : '◌ 待生成'}
                    </Text>
                  </View>
                  <Text className="studio-small">{shot.type} · 5秒</Text>
                  {index === 1 && !demonstrated && (
                    <View className="studio-shot-progress">
                      <View>
                        <View />
                      </View>
                      <Text>60%</Text>
                    </View>
                  )}
                  <Text className="studio-shot-description">{shot.description}</Text>
                </View>
              </Button>
              {selectedShot === index && (
                <View className="studio-candidates">
                  <Button
                    className="studio-candidate-label"
                    onClick={() => setCandidate((candidate + 1) % 3)}
                  >
                    <Icon name="refresh" />
                    更换候选
                  </Button>
                  <View className="studio-candidate-options">
                    {[0, 1, 2].map((value) => (
                      <Button
                        className={`studio-candidate studio-candidate--${value} ${candidate === value ? 'is-active' : ''}`}
                        key={value}
                        aria-label={`选择候选${value + 1}`}
                        onClick={() => setCandidate(value)}
                      >
                        <Cover src={art.rain} />
                        {candidate === value && <Text>✓</Text>}
                      </Button>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>
        <View className="studio-field-title studio-characters-heading">
          <Text>角色设定</Text>
          <Button
            className="studio-text-button"
            onClick={() => previewNotice('角色编辑页面将在后续实现')}
          >
            编辑角色 <Icon name="arrow" />
          </Button>
        </View>
        <View className="studio-characters">
          <View className="studio-character-profile">
            <Cover src={art.fantasy} />
            <View>
              <Text>林晚</Text>
              <Text className="studio-small">女主角</Text>
            </View>
          </View>
          <View className="studio-character-looks">
            {[0, 1, 2].map((value) => (
              <View className={`studio-character-look studio-character-look--${value}`} key={value}>
                <Cover src={art.rain} />
              </View>
            ))}
          </View>
          <Button
            className="studio-add-character"
            onClick={() => previewNotice('此处为角色资产预览')}
          >
            <Icon name="plus" />
            <Text>添加角色</Text>
          </Button>
        </View>
        {demonstrated && (
          <View className="studio-preview-feedback" data-testid="studio-story-feedback">
            已演示完成状态。未调用模型，未生成镜头，未扣费。
          </View>
        )}
      </View>
      <View className="studio-bottom-action">
        <View className="studio-completion">
          <Text>
            <Text className="studio-completion-number">{demonstrated ? '3/3' : '1/3'}</Text>{' '}
            个镜头已完成
          </Text>
          <View className="studio-completion-track">
            <View style={{ width: demonstrated ? '100%' : '33.33%' }} />
          </View>
        </View>
        <Action onClick={() => setDemonstrated(!demonstrated)}>
          {demonstrated ? '重置预览' : '生成待完成镜头'}
          <Icon name="arrow" />
        </Action>
      </View>
    </View>
  );
}
