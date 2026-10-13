import { zodToJsonSchema } from 'zod-to-json-schema';
import { TextGenerationReceipt, TextGenerationUsage } from './text-generation';
import { SubmitDramaScriptJob, ConfirmDramaScript, DramaScriptJobView, DramaScriptQuote } from './drama-script-job';
import { SubmitScriptBatch, ScriptBatch, ScriptBatchQuote } from './script-batch';
import { MarketingCopyInput, MarketingCopyQuote, SubmitMarketingCopy, MarketingCopyJob, MarketingCopyReviewList } from './marketing-copy';
import { MarketingCategory } from './generation';

import { GuestLoginRequest, GuestBootstrapRequest, GuestSession } from './auth';
import { ErrorBody } from './errors';
import { HealthResponse } from './health';
import { CreateOrderRequest, StoreOrder, StoreOrders, StorePackages } from './store';
import { CreateFeedbackRequest, FeedbackCreated } from './feedback';
import { CreateTaskRequest, GenerationTask, GenerationTasks } from './tasks';
import { Templates } from './templates';
import { GenerateImageRequest, GenerateImageResult } from './images';
import { PolishRequest, PolishResult } from './polish';
import { UploadResult } from './uploads';
import { WalletEntryList, WalletSummary } from './wallet';
import { API_VERSION } from './version';
import { MaterialView } from './materials';
import { OpsReceiptRequest, OpsReviewActionResult, OpsReviewList } from './ops';
import { ScriptReviewList, ReviewScriptRequest, ScriptReviewResult } from './script-review';
import { PortraitReviewList, ReviewPortraitRequest, PortraitReviewResult } from './portrait-review';
import { CreateStoryboardPlan, UpdateStoryboardPlanShot, StoryboardPlan } from './storyboard-plan';
import { PlanImageRequest, SubmitPlanImage, PlanImageQuote, SelectPlanImage, PlanImage, PlanImageList } from './plan-image';
import { PlanVideoRequest, SubmitPlanVideo, PlanVideoQuote, PlanExportList } from './plan-video';
import { ProductionShot, DramaProductionPlan, MarketingProductionRequest, MarketingProductionPlan } from './production-plan';
import { NativeMarketingInput, NativeMarketingQuote, SubmitNativeMarketing } from './native-marketing';
import { NativeCaptionReview, ConfirmNativeCaptions, NativeSourceAccess, ResumeNativeMedia } from './native-captions';
import { ConfirmRoleAppearance, DramaPreparation, SaveDramaPreparation } from './drama-preparation';
import { MaterialAccess } from './materials';
import { PortraitRequest, SubmitPortrait, SelectPortrait, PortraitQuote, PortraitJobView, PortraitJobList } from './portrait';
import { GenerationList, GenerationSettings, GenerationQuote, SubmitGeneration, GenerationView, MediaAccess } from './generation';
import { CreateDramaProject, DramaProjectList, DramaProjectView, DramaScriptList, DramaScriptVersion, DramaScriptView, RepairDramaScript, CreateDramaRole, CreateDramaRoleVersion, DramaRole, DramaRoleVersion, CreateDramaScene, CreateDramaSceneVersion, DramaScene, DramaSceneVersion, CreateDramaStoryboardShot, CreateDramaStoryboardCandidate, DramaStoryboardCandidate, DramaStoryboardShot, DramaProjectWorkflow, SubmitDramaImageJob, DramaImageJobView, DramaImageAccess, SubmitDramaShotVideoJob, DramaShotVideoJobView, DramaShotVideoAccess, CreateDramaExport, DramaExportJobView, DramaExportAccess } from './drama';

/**
 * OpenAPI 文档唯一生成处:T0.3 契约 = health + 统一错误码 + 鉴权骨架。
 * 新端点流程:加 Zod schema → 注册进 paths → contract:snapshot 重签 → 前端经 @wb/contracts 取类型,零手写。
 */
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const idParameter = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: '2049出片 API',
      version: API_VERSION,
      description: '契约唯一事实源 @wb/contracts 生成;禁止手改 openapi.json。',
    },
    servers: [{ url: '/', description: '相对路径,按部署环境替换' }],
    paths: {
      '/v2/marketing/video/{id}/review': {
        get: { security: [{ opaqueSession: [] }], parameters: [idParameter], responses: { '200': { description: '本人原声字幕草稿，原片未准备时为null', content: { 'application/json': { schema: { anyOf: [ref('NativeCaptionReview'), { type: 'null' }] } } } } } },
        post: { security: [{ opaqueSession: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('ConfirmNativeCaptions') } } }, responses: { '200': { description: '固定已核对字幕并继续合成，不重新生成视频或扣费', content: { 'application/json': { schema: ref('NativeCaptionReview') } } } } },
      },
      '/v2/marketing/video/{id}/source': { get: { security: [{ opaqueSession: [] }], parameters: [idParameter], responses: { '200': { description: '本人原声视频的短时预览', content: { 'application/json': { schema: ref('NativeSourceAccess') } } } } } },
      '/v2/marketing/video/{id}/resume': { post: { security: [{ opaqueSession: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('ResumeNativeMedia') } } }, responses: { '204': { description: '继续原任务的字幕或合成阶段' } } } },
      '/v2/marketing/video/quote': {
        post: { security: [{ opaqueSession: [] }], requestBody: { required: true, content: { 'application/json': { schema: ref('NativeMarketingInput') } } }, responses: { '200': { description: '绑定本人内容与素材的10秒报价；正式价格未配置时关闭', content: { 'application/json': { schema: ref('NativeMarketingQuote') } } } } },
      },
      '/v2/marketing/video': {
        post: { security: [{ opaqueSession: [] }], requestBody: { required: true, content: { 'application/json': { schema: ref('SubmitNativeMarketing') } } }, responses: { '200': { description: '10秒开发模拟受理；真实受理尚未开放', content: { 'application/json': { schema: ref('GenerationView') } } } } },
      },
      '/v2/drama/storyboard-plans/{id}/production-plan': {
        get: { security: [{ opaqueSession: [] }], parameters: [idParameter], responses: { '200': { description: '免费制作建议，含全部原文、分集和估算时长，不创建付费任务', content: { 'application/json': { schema: ref('DramaProductionPlan') } } } } },
      },
      '/v2/marketing/production-plan': {
        post: { security: [{ opaqueSession: [] }], requestBody: { required: true, content: { 'application/json': { schema: ref('MarketingProductionRequest') } } }, responses: { '200': { description: '免费检查口播长度，不补写商家事实、不受理生成', content: { 'application/json': { schema: ref('MarketingProductionPlan') } } } } },
      },
      '/v2/drama/storyboard-plans/{id}/exports': {
        get: { security: [{ opaqueSession: [] }], parameters: [idParameter], responses: { '200': { description: '本人该计划每集最近导出', content: { 'application/json': { schema: ref('PlanExportList') } } } } },
      },
      '/v2/drama/candidates/{id}/plan-video-quote': {
        post: { security: [{ opaqueSession: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('PlanVideoRequest') } } }, responses: { '200': { description: '当前选图的开发模拟视频报价', content: { 'application/json': { schema: ref('PlanVideoQuote') } } } } },
      },
      '/v2/drama/candidates/{id}/plan-video-jobs': {
        post: { security: [{ opaqueSession: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('SubmitPlanVideo') } } }, responses: { '200': { description: '冻结当前镜头的模拟视频作业或重放', content: { 'application/json': { schema: ref('DramaShotVideoJobView') } } } } },
        get: { security: [{ opaqueSession: [] }], parameters: [idParameter], responses: { '200': { description: '本人此候选最近视频任务', content: { 'application/json': { schema: { anyOf: [ref('DramaShotVideoJobView'), { type: 'null' }] } } } } } },
      },
      '/v2/drama/storyboard-plans/{id}/image-quote': {
        post: { security: [{ opaqueSession: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('PlanImageRequest') } } }, responses: { '200': { description: '已核对镜头的单张开发模拟报价，真实生成未开放', content: { 'application/json': { schema: ref('PlanImageQuote') } } } } },
      },
      '/v2/drama/storyboard-plans/{id}/images': {
        post: { security: [{ opaqueSession: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('SubmitPlanImage') } } }, responses: { '201': { description: '创建冻结引用的候选与图片任务', content: { 'application/json': { schema: ref('PlanImage') } } } } },
        get: { security: [{ opaqueSession: [] }], parameters: [idParameter, { name: 'shotKey', in: 'query', required: true, schema: { type: 'string' } }, { name: 'cursor', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: '本人镜头的候选历史', content: { 'application/json': { schema: ref('PlanImageList') } } } } },
      },
      '/v2/drama/storyboard-images/{id}/select': {
        post: { security: [{ opaqueSession: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('SelectPlanImage') } } }, responses: { '200': { description: '选定符合当前内容且未过期的图片', content: { 'application/json': { schema: ref('PlanImage') } } } } },
      },
      '/v2/drama/projects/{id}/storyboard-plan': {
        get: { security: [{ opaqueSession: [] }], parameters: [idParameter], responses: { '200': { description: '本人最近的分镜草稿', content: { 'application/json': { schema: { anyOf: [ref('StoryboardPlan'), { type: 'null' }] } } } } } },
        post: { security: [{ opaqueSession: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('CreateStoryboardPlan') } } }, responses: { '200': { description: '免费整理已确认角色和剧本，不生成图片', content: { 'application/json': { schema: ref('StoryboardPlan') } } } } },
      },
      '/v2/drama/storyboard-plans/{id}': {
        get: { security: [{ opaqueSession: [] }], parameters: [idParameter], responses: { '200': { description: '本人固定版本的分镜草稿', content: { 'application/json': { schema: ref('StoryboardPlan') } } } } },
        post: { security: [{ opaqueSession: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('UpdateStoryboardPlanShot') } } }, responses: { '200': { description: '保存单个镜头内容与出镜角色', content: { 'application/json': { schema: ref('StoryboardPlan') } } } } },
      },
      '/v2/ops/review/portraits': {
        get: { security: [{ opsToken: [] }], parameters: [{ name: 'cursor', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: '角色形象未知受理核对队列', content: { 'application/json': { schema: ref('PortraitReviewList') } } } } },
      },
      '/v2/ops/review/portraits/{id}': {
        post: { security: [{ opsToken: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('ReviewPortraitRequest') } } }, responses: { '200': { description: '核实任务归属后补登供应商任务，或确认未受理并退款', content: { 'application/json': { schema: ref('PortraitReviewResult') } } }, '409': { description: '处置冲突或已不需要核对' } } },
      },
      '/v2/drama/projects/{id}/portrait-quote': { post: { security: [{ opaqueSession: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('PortraitRequest') } } }, responses: { '200': { description: '单张角色候选报价', content: { 'application/json': { schema: ref('PortraitQuote') } } } } } },
      '/v2/drama/projects/{id}/portrait-jobs': {
        post: { security: [{ opaqueSession: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('SubmitPortrait') } } }, responses: { '201': { description: '受理角色候选任务或原请求重放', content: { 'application/json': { schema: ref('PortraitJobView') } } } } },
        get: { security: [{ opaqueSession: [] }], parameters: [idParameter, { name: 'roleKey', in: 'query', required: true, schema: { type: 'string' } }, { name: 'cursor', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: '本人角色候选历史', content: { 'application/json': { schema: ref('PortraitJobList') } } } } },
      },
      '/v2/drama/portrait-jobs/{id}': { get: { security: [{ opaqueSession: [] }], parameters: [idParameter], responses: { '200': { description: '本人角色候选状态', content: { 'application/json': { schema: ref('PortraitJobView') } } } } } },
      '/v2/drama/portrait-jobs/{id}/select': { post: { security: [{ opaqueSession: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('SelectPortrait') } } }, responses: { '200': { description: '将候选填入准备草稿，尚待用户确认形象', content: { 'application/json': { schema: ref('DramaPreparation') } } } } } },
      '/v2/materials/{id}/access': {
        get: { security: [{ opaqueSession: [] }], parameters: [idParameter], responses: { '200': { description: '本人有效参考素材的短时预览链接', content: { 'application/json': { schema: ref('MaterialAccess') } } }, '410': { description: '素材已过期' } } },
      },
      '/v2/drama/projects/{id}/role-appearance': {
        post: { security: [{ opaqueSession: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('ConfirmRoleAppearance') } } }, responses: { '200': { description: '将准备中的有效参考图确认为固定角色版本，不扣积分', content: { 'application/json': { schema: ref('DramaPreparation') } } }, '409': { description: '准备版本变化、仅配音或参考图不可用' } } },
      },
      '/v2/drama/projects/{id}/preparation': {
        get: { security: [{ opaqueSession: [] }], parameters: [idParameter], responses: { '200': { description: '已确认版本的角色场景草稿', content: { 'application/json': { schema: ref('DramaPreparation') } } } } },
        post: { security: [{ opaqueSession: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('SaveDramaPreparation') } } }, responses: { '200': { description: '云端保存的准备草稿', content: { 'application/json': { schema: ref('DramaPreparation') } } }, '409': { description: '未确认剧本或准备版本已变化' } } },
      },
      '/v2/ops/review/drama-scripts': {
        get: { security: [{ opsToken: [] }], parameters: [{ name: 'cursor', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: '未知或超时提交的核对队列', content: { 'application/json': { schema: ref('ScriptReviewList') } } } } },
      },
      '/v2/marketing/copy/quote': {
        post: { security: [{ opaqueSession: [] }], requestBody: { required: true, content: { 'application/json': { schema: ref('MarketingCopyInput') } } }, responses: { '200': { description: '文案报价，不预留费用', content: { 'application/json': { schema: ref('MarketingCopyQuote') } } } } },
      },
      '/v2/marketing/copy/jobs': {
        post: { security: [{ opaqueSession: [] }], requestBody: { required: true, content: { 'application/json': { schema: ref('SubmitMarketingCopy') } } }, responses: { '201': { description: '文案任务受理或原请求重放', content: { 'application/json': { schema: ref('MarketingCopyJob') } } } } },
      },
      '/v2/marketing/copy/jobs/latest': {
        get: { security: [{ opaqueSession: [] }], parameters: [{ name: 'category', in: 'query', required: true, schema: zodToJsonSchema(MarketingCategory, { target: 'openApi3' }) }], responses: { '200': { description: '本人分类最近文案任务', content: { 'application/json': { schema: { nullable: true, allOf: [ref('MarketingCopyJob')] } } } } } },
      },
      '/v2/marketing/copy/jobs/{id}': {
        get: { security: [{ opaqueSession: [] }], parameters: [idParameter], responses: { '200': { description: '文案任务及用户资料', content: { 'application/json': { schema: ref('MarketingCopyJob') } } } } },
      },
      '/v2/ops/review/marketing-copy': {
        get: { security: [{ opsToken: [] }], responses: { '200': { description: '需核对的文案提交', content: { 'application/json': { schema: ref('MarketingCopyReviewList') } } } } },
      },
      '/v2/ops/review/marketing-copy/{id}': {
        post: { security: [{ opsToken: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('ReviewScriptRequest') } } }, responses: { '200': { description: '审计处置及原任务状态', content: { 'application/json': { schema: ref('MarketingCopyJob') } } } } },
      },
      '/v2/ops/review/drama-scripts/{id}': {
        post: { security: [{ opsToken: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('ReviewScriptRequest') } } }, responses: { '200': { description: '登记回执等待处理，或确认未受理并退款；附核对记录', content: { 'application/json': { schema: ref('ScriptReviewResult') } } }, '409': { description: '处理冲突或已不需要核对' } } },
      },
      '/v2/drama/projects/{id}/script-quote': {
        get: { security: [{ opaqueSession: [] }], parameters: [idParameter], responses: { '200': { description: '本人项目第1集剧本报价，未开放时不展示价格', content: { 'application/json': { schema: ref('DramaScriptQuote') } } } } },
      },
      '/v2/drama/projects/{id}/script-jobs': {
        post: { security: [{ opaqueSession: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('SubmitDramaScriptJob') } } }, responses: { '201': { description: '按确认报价受理或幂等重放；mock免费', content: { 'application/json': { schema: ref('DramaScriptJobView') } } }, '402': { description: '积分不足' }, '409': { description: '报价变更或请求冲突' }, '503': { description: '受理未开放' } } },
        get: { security: [{ opaqueSession: [] }], parameters: [idParameter], responses: { '200': { description: '最新作业，无作业为null', content: { 'application/json': { schema: { nullable: true, allOf: [ref('DramaScriptJobView')] } } } } } },
      },
      '/v2/drama/script-jobs/{id}': {
        get: { security: [{ opaqueSession: [] }], parameters: [idParameter], responses: { '200': { description: '本人作业及草稿', content: { 'application/json': { schema: ref('DramaScriptJobView') } } } } },
      },
      '/v2/drama/projects/{id}/script-confirmation': {
        post: { security: [{ opaqueSession: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('ConfirmDramaScript') } } }, responses: { '201': { description: '确认并固定剧本版本', content: { 'application/json': { schema: ref('DramaProjectView') } } } } },
      },
      '/v2/drama/projects/{id}/script-batch-quote': {
        get: { security: [{ opaqueSession: [] }], parameters: [idParameter], responses: { '200': { description: '剩余剧本集数与总报价', content: { 'application/json': { schema: ref('ScriptBatchQuote') } } } } },
      },
      '/v2/drama/projects/{id}/script-batches': {
        post: { security: [{ opaqueSession: [] }], parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: ref('SubmitScriptBatch') } } }, responses: { '201': { description: '剧本批次受理或原请求重放', content: { 'application/json': { schema: ref('ScriptBatch') } } } } },
      },
      '/v2/drama/projects/{id}/script-batches/latest': {
        get: { security: [{ opaqueSession: [] }], parameters: [idParameter], responses: { '200': { description: '本人项目最近剧本批次', content: { 'application/json': { schema: { nullable: true, allOf: [ref('ScriptBatch')] } } } } } },
      },
      '/v2/drama/script-batches/{id}': {
        get: { security: [{ opaqueSession: [] }], parameters: [idParameter], responses: { '200': { description: '逐集进度与汇总剧本', content: { 'application/json': { schema: ref('ScriptBatch') } } } } },
      },
      '/v2/drama/projects': {
        post: {
          summary: '创建本人漫剧项目；已有剧本生成不可变首版本并解析，想法模式只保存待生成项目', security: [{ opaqueSession: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('CreateDramaProject') } } },
          responses: {
            '201': { description: '项目已保存', content: { 'application/json': { schema: ref('DramaProjectView') } } },
            '400': { description: '字段非法', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '403': { description: '账户已注销', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
        get: {
          summary: '本人漫剧项目分页列表', security: [{ opaqueSession: [] }],
          parameters: [{ name: 'cursor', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: '项目列表', content: { 'application/json': { schema: ref('DramaProjectList') } } },
            '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '404': { description: '游标不可用', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/v2/drama/projects/{id}': {
        get: {
          summary: '读取本人漫剧项目及固定剧本版本', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: '项目', content: { 'application/json': { schema: ref('DramaProjectView') } } },
            '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '404': { description: '项目不存在或不属于本人', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/v2/drama/projects/{id}/workflow': {
        get: {
          summary: '读取本人项目的角色、场景、镜头和不可变候选计划', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: '项目工作流', content: { 'application/json': { schema: ref('DramaProjectWorkflow') } } }, '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } }, '404': { description: '项目不存在或不属于本人', content: { 'application/json': { schema: ref('ErrorBody') } } } },
        },
      },
      '/v2/drama/projects/{id}/roles': {
        post: {
          summary: '创建角色及不可变首版本，绑定本人有效参考素材', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('CreateDramaRole') } } },
          responses: { '201': { description: '角色', content: { 'application/json': { schema: ref('DramaRole') } } }, '400': { description: '字段非法', content: { 'application/json': { schema: ref('ErrorBody') } } }, '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } }, '404': { description: '项目或素材不存在', content: { 'application/json': { schema: ref('ErrorBody') } } }, '409': { description: '素材过期或项目没有固定剧本', content: { 'application/json': { schema: ref('ErrorBody') } } } },
        },
      },
      '/v2/drama/roles/{id}/versions': {
        post: {
          summary: '追加角色版本，不覆盖历史角色参考', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('CreateDramaRoleVersion') } } },
          responses: { '201': { description: '角色版本', content: { 'application/json': { schema: ref('DramaRoleVersion') } } }, '400': { description: '字段非法', content: { 'application/json': { schema: ref('ErrorBody') } } }, '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } }, '404': { description: '角色或素材不存在', content: { 'application/json': { schema: ref('ErrorBody') } } }, '409': { description: '素材过期', content: { 'application/json': { schema: ref('ErrorBody') } } } },
        },
      },
      '/v2/drama/projects/{id}/scenes': {
        post: {
          summary: '创建场景及不可变首版本', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('CreateDramaScene') } } },
          responses: { '201': { description: '场景', content: { 'application/json': { schema: ref('DramaScene') } } }, '400': { description: '字段非法', content: { 'application/json': { schema: ref('ErrorBody') } } }, '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } }, '404': { description: '项目不存在', content: { 'application/json': { schema: ref('ErrorBody') } } }, '409': { description: '项目没有固定剧本', content: { 'application/json': { schema: ref('ErrorBody') } } } },
        },
      },
      '/v2/drama/scenes/{id}/versions': {
        post: {
          summary: '追加场景版本，不覆盖历史描述', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('CreateDramaSceneVersion') } } },
          responses: { '201': { description: '场景版本', content: { 'application/json': { schema: ref('DramaSceneVersion') } } }, '400': { description: '字段非法', content: { 'application/json': { schema: ref('ErrorBody') } } }, '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } }, '404': { description: '场景不存在', content: { 'application/json': { schema: ref('ErrorBody') } } } },
        },
      },
      '/v2/drama/projects/{id}/shots': {
        post: {
          summary: '创建项目镜头的提示词快照', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('CreateDramaStoryboardShot') } } },
          responses: { '201': { description: '镜头', content: { 'application/json': { schema: ref('DramaStoryboardShot') } } }, '400': { description: '字段非法', content: { 'application/json': { schema: ref('ErrorBody') } } }, '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } }, '404': { description: '项目不存在', content: { 'application/json': { schema: ref('ErrorBody') } } }, '409': { description: '项目没有固定剧本或镜头已存在', content: { 'application/json': { schema: ref('ErrorBody') } } } },
        },
      },
      '/v2/drama/shots/{id}/candidates': {
        post: {
          summary: '保存待生成候选的角色、场景、剧本与提示词快照；不会创建模型任务', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('CreateDramaStoryboardCandidate') } } },
          responses: { '201': { description: '候选计划', content: { 'application/json': { schema: ref('DramaStoryboardCandidate') } } }, '400': { description: '字段非法', content: { 'application/json': { schema: ref('ErrorBody') } } }, '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } }, '404': { description: '镜头或版本不属于本人项目', content: { 'application/json': { schema: ref('ErrorBody') } } }, '409': { description: '角色参考素材过期', content: { 'application/json': { schema: ref('ErrorBody') } } } },
        },
      },
      '/v2/drama/candidates/{id}/select': {
        post: {
          summary: '选择一个候选计划；同一镜头原选择会取消，但候选记录不可变', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: '已选择候选', content: { 'application/json': { schema: ref('DramaStoryboardCandidate') } } }, '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } }, '404': { description: '候选不存在或不属于本人', content: { 'application/json': { schema: ref('ErrorBody') } } } },
        },
      },
      '/v2/drama/candidates/{id}/image-jobs': {
        post: {
          summary: '受理一个候选图像生成作业；默认关闭，开启时冻结独立积分预留', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('SubmitDramaImageJob') } } },
          responses: { '200': { description: '已受理候选图像作业', content: { 'application/json': { schema: ref('DramaImageJobView') } } }, '400': { description: '字段非法', content: { 'application/json': { schema: ref('ErrorBody') } } }, '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } }, '404': { description: '候选不存在或不属于本人', content: { 'application/json': { schema: ref('ErrorBody') } } }, '409': { description: '参考素材过期或请求冲突', content: { 'application/json': { schema: ref('ErrorBody') } } }, '503': { description: '图像受理未开启', content: { 'application/json': { schema: ref('ErrorBody') } } } },
        },
      },
      '/v2/drama/image-jobs/{id}': {
        get: {
          summary: '读取本人候选图像作业状态；不包含供应商回执或 URL', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: '候选图像作业', content: { 'application/json': { schema: ref('DramaImageJobView') } } }, '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } }, '404': { description: '作业不存在或不属于本人', content: { 'application/json': { schema: ref('ErrorBody') } } } },
        },
      },
      '/v2/drama/image-jobs/{id}/media': {
        get: {
          summary: '仅本人已发布候选图的短时私有访问链接', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: '有效期不超过10分钟且不超过资产到期时间', content: { 'application/json': { schema: ref('DramaImageAccess') } } },
            '400': { description: '非法ID', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '404': { description: '无本人已发布候选图', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '410': { description: '资产已过期', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '503': { description: '存储不可用', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/v2/drama/candidates/{id}/video-jobs': {
        post: {
          summary: '受理所选候选的逐镜视频作业；幂等并按现有规则预留积分', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('SubmitDramaShotVideoJob') } } },
          responses: { '200': { description: '新受理或幂等重放', content: { 'application/json': { schema: ref('DramaShotVideoJobView') } } }, '400': { description: '字段非法', content: { 'application/json': { schema: ref('ErrorBody') } } }, '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } }, '402': { description: '余额不足', content: { 'application/json': { schema: ref('ErrorBody') } } }, '404': { description: '候选不存在或不属于本人', content: { 'application/json': { schema: ref('ErrorBody') } } }, '409': { description: '候选未选定、图像未发布或请求冲突', content: { 'application/json': { schema: ref('ErrorBody') } } }, '503': { description: '逐镜视频受理未开启', content: { 'application/json': { schema: ref('ErrorBody') } } } },
        },
      },
      '/v2/drama/video-jobs/{id}': {
        get: {
          summary: '读取本人逐镜视频状态；不暴露内部输出引用或供应商回执', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: '逐镜视频作业', content: { 'application/json': { schema: ref('DramaShotVideoJobView') } } }, '400': { description: '非法ID', content: { 'application/json': { schema: ref('ErrorBody') } } }, '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } }, '404': { description: '作业不存在或不属于本人', content: { 'application/json': { schema: ref('ErrorBody') } } } },
        },
      },
      '/v2/drama/video-jobs/{id}/media': {
        get: {
          summary: '仅本人已发布逐镜视频的短时私有 MP4 访问链接', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: '有效期不超过10分钟且不超过资产到期时间', content: { 'application/json': { schema: ref('DramaShotVideoAccess') } } }, '400': { description: '非法ID', content: { 'application/json': { schema: ref('ErrorBody') } } }, '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } }, '404': { description: '无本人已发布逐镜视频', content: { 'application/json': { schema: ref('ErrorBody') } } }, '410': { description: '资产已过期', content: { 'application/json': { schema: ref('ErrorBody') } } }, '503': { description: '存储不可用', content: { 'application/json': { schema: ref('ErrorBody') } } } },
        },
      },
      '/v2/drama/projects/{id}/exports': {
        post: {
          summary: '创建本人项目的免费 mock 成片导出；快照所有已选定且已发布的逐镜视频', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('CreateDramaExport') } } },
          responses: { '201': { description: '新导出或幂等重放', content: { 'application/json': { schema: ref('DramaExportJobView') } } }, '400': { description: '字段非法', content: { 'application/json': { schema: ref('ErrorBody') } } }, '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } }, '404': { description: '项目不存在或不属于本人', content: { 'application/json': { schema: ref('ErrorBody') } } }, '409': { description: '镜头视频尚未发布或请求冲突', content: { 'application/json': { schema: ref('ErrorBody') } } } },
        },
      },
      '/v2/drama/exports/{id}': {
        get: {
          summary: '读取本人导出作业状态；不暴露内部输出引用或 manifest', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: '导出作业', content: { 'application/json': { schema: ref('DramaExportJobView') } } }, '400': { description: '非法ID', content: { 'application/json': { schema: ref('ErrorBody') } } }, '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } }, '404': { description: '作业不存在或不属于本人', content: { 'application/json': { schema: ref('ErrorBody') } } } },
        },
      },
      '/v2/drama/exports/{id}/media': {
        get: {
          summary: '仅本人已发布导出成片的短时私有 MP4 访问链接', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: '有效期不超过10分钟且不超过资产到期时间', content: { 'application/json': { schema: ref('DramaExportAccess') } } }, '400': { description: '非法ID', content: { 'application/json': { schema: ref('ErrorBody') } } }, '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } }, '404': { description: '无本人已发布导出成片', content: { 'application/json': { schema: ref('ErrorBody') } } }, '410': { description: '资产已过期', content: { 'application/json': { schema: ref('ErrorBody') } } }, '503': { description: '存储不可用', content: { 'application/json': { schema: ref('ErrorBody') } } } },
        },
      },
      '/v2/drama/scripts': {
        get: {
          summary: '本人剧本库分页列表', security: [{ opaqueSession: [] }],
          parameters: [{ name: 'cursor', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: '剧本列表', content: { 'application/json': { schema: ref('DramaScriptList') } } },
            '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '404': { description: '游标不可用', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/v2/drama/scripts/{id}': {
        get: {
          summary: '读取本人剧本及最新可修复版本', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: '剧本', content: { 'application/json': { schema: ref('DramaScriptView') } } },
            '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '404': { description: '剧本不存在或不属于本人', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/v2/drama/scripts/{id}/versions': {
        post: {
          summary: '追加人工修复版本并重新解析；不覆盖历史版本', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('RepairDramaScript') } } },
          responses: {
            '201': { description: '新剧本版本', content: { 'application/json': { schema: ref('DramaScriptVersion') } } },
            '400': { description: '字段非法', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '404': { description: '剧本不存在或不属于本人', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/v2/materials': {
        post: {
          summary: '上传营销视频参考图素材(multipart 字段 file,≤10M,jpg/png/webp);入库后7天内可用于生成',
          security: [{ opaqueSession: [] }],
          requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object',
            properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } } } },
          responses: {
            '201': { description: '素材元数据', content: { 'application/json': { schema: ref('MaterialView') } } },
            '400': { description: '类型/尺寸/解析失败', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '413': { description: '超过10M', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/v2/ops/review/generations': {
        get: {
          summary: '未知受理工单列表(运营通道,x-ops-token;不对C端暴露)',
          security: [{ opsToken: [] }],
          responses: {
            '200': { description: '未知受理队列', content: { 'application/json': { schema: ref('OpsReviewList') } } },
            '401': { description: '运营口令缺失或不匹配', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/v2/ops/review/generations/{id}/receipt': {
        post: {
          summary: '登记迟到受理回执,任务恢复轮询(幂等;仅受理 unknown 状态)',
          security: [{ opsToken: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('OpsReceiptRequest') } } },
          responses: {
            '200': { description: '已登记并恢复', content: { 'application/json': { schema: ref('OpsReviewActionResult') } } },
            '400': { description: '参数错误', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '401': { description: '运营口令缺失或不匹配', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '404': { description: '任务不存在', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '409': { description: '状态非 unknown', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/v2/ops/review/generations/{id}/reject': {
        post: {
          summary: '拒收未知受理:退还预留积分并终止任务',
          security: [{ opsToken: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: '已拒收并退款', content: { 'application/json': { schema: ref('OpsReviewActionResult') } } },
            '401': { description: '运营口令缺失或不匹配', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '404': { description: '任务不存在', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '409': { description: '状态非 unknown', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/v2/generation/{id}/media': {
        get: {
          summary: '仅本人已发布成片的短时私有访问链接', security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: '有效期不超过10分钟且不超过资产到期时间', content: { 'application/json': { schema: ref('MediaAccess') } } },
            '400': { description: '非法ID', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '404': { description: '无本人已发布资产', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '410': { description: '资产已过期', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '503': { description: '存储不可用', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/v2/generation/quote': {
        post: {
          summary: '服务端营销视频报价；不创建任务、不预留积分',
          requestBody: { required: true, content: { 'application/json': { schema: ref('GenerationSettings') } } },
          responses: {
            '200': { description: '当前报价和受理能力', content: { 'application/json': { schema: ref('GenerationQuote') } } },
            '400': { description: '参数错误', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/v2/generation': {
        get: {
          summary: '本人视频任务列表，按创建时间倒序，每页20条', security: [{ opaqueSession: [] }],
          parameters: [{ name: 'cursor', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: '任务列表', content: { 'application/json': { schema: ref('GenerationList') } } },
            '400': { description: '参数错误', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '401': { description: '未登录', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '404': { description: '游标不可用', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
        post: {
          summary: '幂等受理营销视频；执行链未就绪时拒绝且不预留积分',
          security: [{ opaqueSession: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('SubmitGeneration') } } },
          responses: {
            '200': { description: '新受理或原请求重放', content: { 'application/json': { schema: ref('GenerationView') } } },
            '400': { description: '无效参数', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '402': { description: '余额不足', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '401': { description: '会话无效', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '403': { description: '账户停用', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '409': { description: '报价变更或幂等冲突', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '503': { description: '生成执行链不可用', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/v2/generation/{id}': {
        get: {
          summary: '仅查询本人任务；内部资产引用不作为下载地址返回',
          security: [{ opaqueSession: [] }],
          parameters: [{ ...idParameter, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: '任务状态', content: { 'application/json': { schema: ref('GenerationView') } } },
            '400': { description: '无效ID', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '401': { description: '会话无效', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '404': { description: '任务不存在或不属于本人', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/healthz': {
        get: {
          summary: '存活探测(LB / CI)',
          responses: {
            '200': {
              description: '健康',
              content: { 'application/json': { schema: ref('HealthResponse') } },
            },
          },
        },
      },
      '/readyz': {
        get: {
          summary: '新 API 数据库就绪探测',
          responses: {
            '200': {
              description: '可受理请求',
              content: { 'application/json': { schema: ref('HealthResponse') } },
            },
            '503': {
              description: '依赖服务不可用',
              content: { 'application/json': { schema: ref('ErrorBody') } },
            },
          },
        },
      },
      '/v1/auth/guest': {
        post: {
          summary: '游客登录(实现:T1.1 Fastify)',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('GuestLoginRequest') } },
          },
          responses: {
            '200': {
              description: '会话签发',
              content: { 'application/json': { schema: ref('GuestSession') } },
            },
            '400': {
              description: '参数校验失败',
              content: { 'application/json': { schema: ref('ErrorBody') } },
            },
          },
        },
      },
      '/v2/auth/guest': {
        post: {
          summary: '使用游客秘密凭据创建或恢复身份；注册赠送只发放一次',
          requestBody: { required: true, content: { 'application/json': { schema: ref('GuestBootstrapRequest') } } },
          responses: {
            '200': { description: '不透明会话', content: { 'application/json': { schema: ref('GuestSession') } } },
            '400': { description: '凭据格式错误', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '403': { description: '账户已注销', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/v2/auth/deactivate': {
        post: {
          summary: '注销当前账户并撤销全部会话',
          security: [{ opaqueSession: [] }],
          responses: {
            '204': { description: '已注销' },
            '401': { description: '无效或已过期会话', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '403': { description: '账户已注销', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/v2/wallet': {
        get: {
          summary: '当前会话账户的余额和最近20条流水；不接受账户ID参数',
          security: [{ opaqueSession: [] }],
          responses: {
            '200': { description: '钱包概览', content: { 'application/json': { schema: ref('WalletSummary') } } },
            '401': { description: '无效或已过期会话', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '403': { description: '账户已注销', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/v2/wallet/entries': {
        get: {
          summary: '本人积分流水完整分页，按时间倒序，每页20条；游标由上一页响应下发',
          security: [{ opaqueSession: [] }],
          parameters: [{ name: 'cursor', in: 'query', required: false, schema: { type: 'string', minLength: 1, maxLength: 200 } }],
          responses: {
            '200': { description: '流水页', content: { 'application/json': { schema: ref('WalletEntryList') } } },
            '400': { description: '游标格式非法', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '401': { description: '无效或已过期会话', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '403': { description: '账户已注销', content: { 'application/json': { schema: ref('ErrorBody') } } },
            '404': { description: '游标不可用', content: { 'application/json': { schema: ref('ErrorBody') } } },
          },
        },
      },
      '/v1/auth/deactivate': {
        post: {
          summary: '账号注销(软删除;实现:T1.1)',
          security: [{ bearerAuth: [] }],
          responses: {
            '204': { description: '已注销' },
            '401': {
              description: '未登录/凭证失效',
              content: { 'application/json': { schema: ref('ErrorBody') } },
            },
          },
        },
      },
      '/v1/uploads': {
        post: {
          summary: '上传参考图(V1 传图生成;multipart 字段 file,≤10M,jpg/png/webp)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: { file: { type: 'string', format: 'binary' } },
                  required: ['file'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: '上传完成',
              content: { 'application/json': { schema: ref('UploadResult') } },
            },
          },
        },
      },
      '/v1/wallet': {
        get: {
          summary: '钱包概览:余额+最近流水(实现:T1.2)',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: '余额与流水',
              content: { 'application/json': { schema: ref('WalletSummary') } },
            },
            '401': {
              description: '未登录',
              content: { 'application/json': { schema: ref('ErrorBody') } },
            },
          },
        },
      },
      '/v1/store/packages': {
        get: {
          summary: '充值档位列表(T1.4)',
          responses: {
            '200': {
              description: '档位',
              content: { 'application/json': { schema: ref('StorePackages') } },
            },
          },
        },
      },
      '/v1/store/orders': {
        post: {
          summary: '创建充值订单(T1.4;微信支付参数随商户号接入,当前阻塞墙)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CreateOrderRequest') } },
          },
          responses: {
            '201': {
              description: '订单已创建',
              content: { 'application/json': { schema: ref('StoreOrder') } },
            },
            '401': {
              description: '未登录',
              content: { 'application/json': { schema: ref('ErrorBody') } },
            },
          },
        },
        get: {
          summary: '我的订单列表(T1.4)',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: '订单',
              content: { 'application/json': { schema: ref('StoreOrders') } },
            },
          },
        },
      },
      '/v1/store/orders/{id}/dev-pay': {
        post: {
          parameters: [idParameter],
          summary: 'DEV-ONLY:模拟支付回调(NODE_ENV=production 时 404;真实微信回调随商户号)',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: '订单已支付并入账',
              content: { 'application/json': { schema: ref('StoreOrder') } },
            },
          },
        },
      },
      '/v1/templates': {
        get: {
          summary: '模板 feed(T3.2 首页;生成同款→预填创作表单)',
          responses: {
            '200': {
              description: '模板列表',
              content: { 'application/json': { schema: ref('Templates') } },
            },
          },
        },
      },
      '/v1/feedback': {
        post: {
          summary: '提交用户反馈(OPS-01;落库后运营可见)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CreateFeedbackRequest') } },
          },
          responses: {
            '201': {
              description: '已受理',
              content: { 'application/json': { schema: ref('FeedbackCreated') } },
            },
          },
        },
      },
      '/v1/images/generate': {
        post: {
          summary: 'AI 绘画/改图(V1;改图传 imageUrls;每用户每小时 5 次)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('GenerateImageRequest') } },
          },
          responses: {
            '200': {
              description: '生成结果图',
              content: { 'application/json': { schema: ref('GenerateImageResult') } },
            },
          },
        },
      },
      '/v1/polish': {
        post: {
          summary: 'AI 文案优化(一句卖点 → 结构化口播稿;V0 免费不计费)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('PolishRequest') } },
          },
          responses: {
            '200': {
              description: '优化后的文案',
              content: { 'application/json': { schema: ref('PolishResult') } },
            },
          },
        },
      },
      '/v1/tasks': {
        post: {
          summary: '创建生成任务(冻结估算积分并入队;实现:T2.2)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CreateTaskRequest') } },
          },
          responses: {
            '202': {
              description: '任务已受理',
              content: { 'application/json': { schema: ref('GenerationTask') } },
            },
            '402': {
              description: '积分不足',
              content: { 'application/json': { schema: ref('ErrorBody') } },
            },
          },
        },
        get: {
          summary: '我的任务列表',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: '任务列表',
              content: { 'application/json': { schema: ref('GenerationTasks') } },
            },
          },
        },
      },
      '/v1/tasks/{id}': {
        get: {
          parameters: [idParameter],
          summary: '任务详情(进度轮询)',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: '任务',
              content: { 'application/json': { schema: ref('GenerationTask') } },
            },
          },
        },
      },
      '/v1/tasks/{id}/cancel': {
        post: {
          parameters: [idParameter],
          summary: '取消任务(失败/取消全额退积分)',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: '取消后的任务',
              content: { 'application/json': { schema: ref('GenerationTask') } },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        opaqueSession: { type: 'http', scheme: 'bearer', description: 'V2服务端存储哈希的不透明会话，非JWT' },
        opsToken: { type: 'apiKey', in: 'header', name: 'x-ops-token', description: '运营处置口令,仅服务端配置持有' },
      },
      schemas: {
        PlanImageRequest: zodToJsonSchema(PlanImageRequest, { target: 'openApi3' }),
        PlanVideoRequest: zodToJsonSchema(PlanVideoRequest, { target: 'openApi3' }),
        PlanExportList: zodToJsonSchema(PlanExportList, { target: 'openApi3' }),
        ProductionShot: zodToJsonSchema(ProductionShot, { target: 'openApi3', $refStrategy: 'none' }),
        DramaProductionPlan: zodToJsonSchema(DramaProductionPlan, { target: 'openApi3', $refStrategy: 'none' }),
        NativeMarketingInput: zodToJsonSchema(NativeMarketingInput, { target: 'openApi3', $refStrategy: 'none' }),
        NativeCaptionReview: zodToJsonSchema(NativeCaptionReview, { target: 'openApi3', $refStrategy: 'none' }),
        ConfirmNativeCaptions: zodToJsonSchema(ConfirmNativeCaptions, { target: 'openApi3', $refStrategy: 'none' }),
        NativeSourceAccess: zodToJsonSchema(NativeSourceAccess, { target: 'openApi3', $refStrategy: 'none' }),
        ResumeNativeMedia: zodToJsonSchema(ResumeNativeMedia, { target: 'openApi3', $refStrategy: 'none' }),
        NativeMarketingQuote: zodToJsonSchema(NativeMarketingQuote, { target: 'openApi3', $refStrategy: 'none' }),
        SubmitNativeMarketing: zodToJsonSchema(SubmitNativeMarketing, { target: 'openApi3', $refStrategy: 'none' }),
        MarketingProductionRequest: zodToJsonSchema(MarketingProductionRequest, { target: 'openApi3', $refStrategy: 'none' }),
        MarketingProductionPlan: zodToJsonSchema(MarketingProductionPlan, { target: 'openApi3', $refStrategy: 'none' }),
        SubmitPlanVideo: zodToJsonSchema(SubmitPlanVideo, { target: 'openApi3' }),
        PlanVideoQuote: zodToJsonSchema(PlanVideoQuote, { target: 'openApi3' }),
        SubmitPlanImage: zodToJsonSchema(SubmitPlanImage, { target: 'openApi3' }),
        PlanImageQuote: zodToJsonSchema(PlanImageQuote, { target: 'openApi3' }),
        SelectPlanImage: zodToJsonSchema(SelectPlanImage, { target: 'openApi3' }),
        PlanImage: zodToJsonSchema(PlanImage, { target: 'openApi3' }),
        PlanImageList: zodToJsonSchema(PlanImageList, { target: 'openApi3' }),
        CreateStoryboardPlan: zodToJsonSchema(CreateStoryboardPlan, { target: 'openApi3' }),
        UpdateStoryboardPlanShot: zodToJsonSchema(UpdateStoryboardPlanShot, { target: 'openApi3' }),
        StoryboardPlan: zodToJsonSchema(StoryboardPlan, { target: 'openApi3' }),
        CreateDramaProject: zodToJsonSchema(CreateDramaProject, { target: 'openApi3' }),
        DramaProjectView: zodToJsonSchema(DramaProjectView, { target: 'openApi3' }),
        DramaProjectList: zodToJsonSchema(DramaProjectList, { target: 'openApi3' }),
        DramaScriptList: zodToJsonSchema(DramaScriptList, { target: 'openApi3' }),
        DramaScriptView: zodToJsonSchema(DramaScriptView, { target: 'openApi3' }),
        DramaScriptVersion: zodToJsonSchema(DramaScriptVersion, { target: 'openApi3' }),
        RepairDramaScript: zodToJsonSchema(RepairDramaScript, { target: 'openApi3' }),
        CreateDramaRole: zodToJsonSchema(CreateDramaRole, { target: 'openApi3' }),
        CreateDramaRoleVersion: zodToJsonSchema(CreateDramaRoleVersion, { target: 'openApi3' }),
        DramaRoleVersion: zodToJsonSchema(DramaRoleVersion, { target: 'openApi3' }),
        DramaRole: zodToJsonSchema(DramaRole, { target: 'openApi3' }),
        CreateDramaScene: zodToJsonSchema(CreateDramaScene, { target: 'openApi3' }),
        CreateDramaSceneVersion: zodToJsonSchema(CreateDramaSceneVersion, { target: 'openApi3' }),
        DramaSceneVersion: zodToJsonSchema(DramaSceneVersion, { target: 'openApi3' }),
        DramaScene: zodToJsonSchema(DramaScene, { target: 'openApi3' }),
        CreateDramaStoryboardShot: zodToJsonSchema(CreateDramaStoryboardShot, { target: 'openApi3' }),
        CreateDramaStoryboardCandidate: zodToJsonSchema(CreateDramaStoryboardCandidate, { target: 'openApi3' }),
        DramaStoryboardCandidate: zodToJsonSchema(DramaStoryboardCandidate, { target: 'openApi3' }),
        DramaStoryboardShot: zodToJsonSchema(DramaStoryboardShot, { target: 'openApi3' }),
        DramaProjectWorkflow: zodToJsonSchema(DramaProjectWorkflow, { target: 'openApi3' }),
        SubmitDramaImageJob: zodToJsonSchema(SubmitDramaImageJob, { target: 'openApi3' }),
        DramaImageJobView: zodToJsonSchema(DramaImageJobView, { target: 'openApi3' }),
        DramaImageAccess: zodToJsonSchema(DramaImageAccess, { target: 'openApi3' }),
        SubmitDramaShotVideoJob: zodToJsonSchema(SubmitDramaShotVideoJob, { target: 'openApi3' }),
        DramaShotVideoJobView: zodToJsonSchema(DramaShotVideoJobView, { target: 'openApi3' }),
        DramaShotVideoAccess: zodToJsonSchema(DramaShotVideoAccess, { target: 'openApi3' }),
        CreateDramaExport: zodToJsonSchema(CreateDramaExport, { target: 'openApi3' }),
        SubmitDramaScriptJob: zodToJsonSchema(SubmitDramaScriptJob, { target: 'openApi3' }),
        SubmitScriptBatch: zodToJsonSchema(SubmitScriptBatch, { target: 'openApi3' }),
        MarketingCopyInput: zodToJsonSchema(MarketingCopyInput, { target: 'openApi3' }),
        MarketingCopyQuote: zodToJsonSchema(MarketingCopyQuote, { target: 'openApi3' }),
        SubmitMarketingCopy: zodToJsonSchema(SubmitMarketingCopy, { target: 'openApi3' }),
        MarketingCopyJob: zodToJsonSchema(MarketingCopyJob, { target: 'openApi3' }),
        MarketingCopyReviewList: zodToJsonSchema(MarketingCopyReviewList, { target: 'openApi3' }),
        ScriptBatchQuote: zodToJsonSchema(ScriptBatchQuote, { target: 'openApi3' }),
        ScriptBatch: zodToJsonSchema(ScriptBatch, { target: 'openApi3' }),
        DramaScriptQuote: zodToJsonSchema(DramaScriptQuote, { target: 'openApi3' }),
        TextGenerationReceipt: zodToJsonSchema(TextGenerationReceipt, { target: 'openApi3' }),
        TextGenerationUsage: zodToJsonSchema(TextGenerationUsage, { target: 'openApi3' }),
        ConfirmDramaScript: zodToJsonSchema(ConfirmDramaScript, { target: 'openApi3' }),
        DramaScriptJobView: zodToJsonSchema(DramaScriptJobView, { target: 'openApi3' }),
        DramaExportJobView: zodToJsonSchema(DramaExportJobView, { target: 'openApi3' }),
        DramaExportAccess: zodToJsonSchema(DramaExportAccess, { target: 'openApi3' }),
        MaterialView: zodToJsonSchema(MaterialView, { target: 'openApi3' }),
        OpsReviewList: zodToJsonSchema(OpsReviewList, { target: 'openApi3' }),
        ScriptReviewList: zodToJsonSchema(ScriptReviewList, { target: 'openApi3' }),
        ReviewScriptRequest: zodToJsonSchema(ReviewScriptRequest, { target: 'openApi3' }),
        ScriptReviewResult: zodToJsonSchema(ScriptReviewResult, { target: 'openApi3' }),
        PortraitReviewList: zodToJsonSchema(PortraitReviewList, { target: 'openApi3' }),
        ReviewPortraitRequest: zodToJsonSchema(ReviewPortraitRequest, { target: 'openApi3' }),
        PortraitReviewResult: zodToJsonSchema(PortraitReviewResult, { target: 'openApi3' }),
        DramaPreparation: zodToJsonSchema(DramaPreparation, { target: 'openApi3' }),
        ConfirmRoleAppearance: zodToJsonSchema(ConfirmRoleAppearance, { target: 'openApi3' }),
        MaterialAccess: zodToJsonSchema(MaterialAccess, { target: 'openApi3' }),
        PortraitRequest: zodToJsonSchema(PortraitRequest, { target: 'openApi3' }),
        SubmitPortrait: zodToJsonSchema(SubmitPortrait, { target: 'openApi3' }),
        SelectPortrait: zodToJsonSchema(SelectPortrait, { target: 'openApi3' }),
        PortraitQuote: zodToJsonSchema(PortraitQuote, { target: 'openApi3' }),
        PortraitJobView: zodToJsonSchema(PortraitJobView, { target: 'openApi3' }),
        PortraitJobList: zodToJsonSchema(PortraitJobList, { target: 'openApi3' }),
        SaveDramaPreparation: zodToJsonSchema(SaveDramaPreparation, { target: 'openApi3' }),
        OpsReceiptRequest: zodToJsonSchema(OpsReceiptRequest, { target: 'openApi3' }),
        OpsReviewActionResult: zodToJsonSchema(OpsReviewActionResult, { target: 'openApi3' }),
        MediaAccess: zodToJsonSchema(MediaAccess, { target: 'openApi3' }),
        GenerationSettings: zodToJsonSchema(GenerationSettings, { target: 'openApi3' }),
        GenerationQuote: zodToJsonSchema(GenerationQuote, { target: 'openApi3' }),
        SubmitGeneration: zodToJsonSchema(SubmitGeneration, { target: 'openApi3' }),
        GenerationList: zodToJsonSchema(GenerationList, { target: 'openApi3' }),
        GenerationView: zodToJsonSchema(GenerationView, { target: 'openApi3' }),
        GenerateImageRequest: zodToJsonSchema(GenerateImageRequest, { target: 'openApi3' }),
        GenerateImageResult: zodToJsonSchema(GenerateImageResult, { target: 'openApi3' }),
        PolishRequest: zodToJsonSchema(PolishRequest, { target: 'openApi3' }),
        PolishResult: zodToJsonSchema(PolishResult, { target: 'openApi3' }),
        UploadResult: zodToJsonSchema(UploadResult, { target: 'openApi3' }),
        CreateFeedbackRequest: zodToJsonSchema(CreateFeedbackRequest, { target: 'openApi3' }),
        FeedbackCreated: zodToJsonSchema(FeedbackCreated, { target: 'openApi3' }),
        Templates: zodToJsonSchema(Templates, { target: 'openApi3' }),
        CreateTaskRequest: zodToJsonSchema(CreateTaskRequest, { target: 'openApi3' }),
        GenerationTask: zodToJsonSchema(GenerationTask, { target: 'openApi3' }),
        GenerationTasks: zodToJsonSchema(GenerationTasks, { target: 'openApi3' }),
        StorePackages: zodToJsonSchema(StorePackages, { target: 'openApi3' }),
        CreateOrderRequest: zodToJsonSchema(CreateOrderRequest, { target: 'openApi3' }),
        StoreOrder: zodToJsonSchema(StoreOrder, { target: 'openApi3' }),
        StoreOrders: zodToJsonSchema(StoreOrders, { target: 'openApi3' }),
        WalletSummary: zodToJsonSchema(WalletSummary, { target: 'openApi3' }),
        WalletEntryList: zodToJsonSchema(WalletEntryList, { target: 'openApi3' }),
        HealthResponse: zodToJsonSchema(HealthResponse, { target: 'openApi3' }),
        ErrorBody: zodToJsonSchema(ErrorBody, { target: 'openApi3' }),
        GuestLoginRequest: zodToJsonSchema(GuestLoginRequest, { target: 'openApi3' }),
        GuestBootstrapRequest: zodToJsonSchema(GuestBootstrapRequest, { target: 'openApi3' }),
        GuestSession: zodToJsonSchema(GuestSession, { target: 'openApi3' }),
      },
    },
  };
}

/** 端点注册表(进 contract-snapshot:端点增删即契约漂移)。 */
export function endpointList(doc = buildOpenApiDocument()): string[] {
  return Object.entries(doc.paths)
    .flatMap(([path, item]) => Object.keys(item).map((m) => `${m.toUpperCase()} ${path}`))
    .sort();
}

