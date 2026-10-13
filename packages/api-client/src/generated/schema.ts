// Generated from @wb/contracts OpenAPI. Do not edit.
export interface paths {
    "/v2/marketing/video/{id}/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 本人原声字幕草稿，原片未准备时为null */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NativeCaptionReview"] | null;
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ConfirmNativeCaptions"];
                };
            };
            responses: {
                /** @description 固定已核对字幕并继续合成，不重新生成视频或扣费 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NativeCaptionReview"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/marketing/video/{id}/source": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 本人原声视频的短时预览 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NativeSourceAccess"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/marketing/video/{id}/resume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ResumeNativeMedia"];
                };
            };
            responses: {
                /** @description 继续原任务的字幕或合成阶段 */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/marketing/video/quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["NativeMarketingInput"];
                };
            };
            responses: {
                /** @description 绑定本人内容与素材的10秒报价；正式价格未配置时关闭 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NativeMarketingQuote"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/marketing/video": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SubmitNativeMarketing"];
                };
            };
            responses: {
                /** @description 10秒开发模拟受理；真实受理尚未开放 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GenerationView"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/storyboard-plans/{id}/production-plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 免费制作建议，含全部原文、分集和估算时长，不创建付费任务 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaProductionPlan"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/marketing/production-plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["MarketingProductionRequest"];
                };
            };
            responses: {
                /** @description 免费检查口播长度，不补写商家事实、不受理生成 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MarketingProductionPlan"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/storyboard-plans/{id}/exports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 本人该计划每集最近导出 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PlanExportList"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/candidates/{id}/plan-video-quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["PlanVideoRequest"];
                };
            };
            responses: {
                /** @description 当前选图的开发模拟视频报价 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PlanVideoQuote"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/candidates/{id}/plan-video-jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 本人此候选最近视频任务 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaShotVideoJobView"] | null;
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SubmitPlanVideo"];
                };
            };
            responses: {
                /** @description 冻结当前镜头的模拟视频作业或重放 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaShotVideoJobView"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/storyboard-plans/{id}/image-quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["PlanImageRequest"];
                };
            };
            responses: {
                /** @description 已核对镜头的单张开发模拟报价，真实生成未开放 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PlanImageQuote"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/storyboard-plans/{id}/images": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query: {
                    shotKey: string;
                    cursor?: string;
                };
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 本人镜头的候选历史 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PlanImageList"];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SubmitPlanImage"];
                };
            };
            responses: {
                /** @description 创建冻结引用的候选与图片任务 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PlanImage"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/storyboard-images/{id}/select": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SelectPlanImage"];
                };
            };
            responses: {
                /** @description 选定符合当前内容且未过期的图片 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PlanImage"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects/{id}/storyboard-plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 本人最近的分镜草稿 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StoryboardPlan"] | null;
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateStoryboardPlan"];
                };
            };
            responses: {
                /** @description 免费整理已确认角色和剧本，不生成图片 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StoryboardPlan"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/storyboard-plans/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 本人固定版本的分镜草稿 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StoryboardPlan"];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["UpdateStoryboardPlanShot"];
                };
            };
            responses: {
                /** @description 保存单个镜头内容与出镜角色 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StoryboardPlan"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/ops/review/portraits": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    cursor?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 角色形象未知受理核对队列 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PortraitReviewList"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/ops/review/portraits/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ReviewPortraitRequest"];
                };
            };
            responses: {
                /** @description 核实任务归属后补登供应商任务，或确认未受理并退款 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PortraitReviewResult"];
                    };
                };
                /** @description 处置冲突或已不需要核对 */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects/{id}/portrait-quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["PortraitRequest"];
                };
            };
            responses: {
                /** @description 单张角色候选报价 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PortraitQuote"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects/{id}/portrait-jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query: {
                    roleKey: string;
                    cursor?: string;
                };
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 本人角色候选历史 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PortraitJobList"];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SubmitPortrait"];
                };
            };
            responses: {
                /** @description 受理角色候选任务或原请求重放 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PortraitJobView"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/portrait-jobs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 本人角色候选状态 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PortraitJobView"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/portrait-jobs/{id}/select": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SelectPortrait"];
                };
            };
            responses: {
                /** @description 将候选填入准备草稿，尚待用户确认形象 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaPreparation"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/materials/{id}/access": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 本人有效参考素材的短时预览链接 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MaterialAccess"];
                    };
                };
                /** @description 素材已过期 */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects/{id}/role-appearance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ConfirmRoleAppearance"];
                };
            };
            responses: {
                /** @description 将准备中的有效参考图确认为固定角色版本，不扣积分 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaPreparation"];
                    };
                };
                /** @description 准备版本变化、仅配音或参考图不可用 */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects/{id}/preparation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 已确认版本的角色场景草稿 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaPreparation"];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SaveDramaPreparation"];
                };
            };
            responses: {
                /** @description 云端保存的准备草稿 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaPreparation"];
                    };
                };
                /** @description 未确认剧本或准备版本已变化 */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/ops/review/drama-scripts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    cursor?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 未知或超时提交的核对队列 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ScriptReviewList"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/marketing/copy/quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["MarketingCopyInput"];
                };
            };
            responses: {
                /** @description 文案报价，不预留费用 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MarketingCopyQuote"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/marketing/copy/jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SubmitMarketingCopy"];
                };
            };
            responses: {
                /** @description 文案任务受理或原请求重放 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MarketingCopyJob"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/marketing/copy/jobs/latest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query: {
                    category: "commerce" | "store_visit";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 本人分类最近文案任务 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MarketingCopyJob"] | null;
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/marketing/copy/jobs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 文案任务及用户资料 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MarketingCopyJob"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/ops/review/marketing-copy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 需核对的文案提交 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MarketingCopyReviewList"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/ops/review/marketing-copy/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ReviewScriptRequest"];
                };
            };
            responses: {
                /** @description 审计处置及原任务状态 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MarketingCopyJob"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/ops/review/drama-scripts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ReviewScriptRequest"];
                };
            };
            responses: {
                /** @description 登记回执等待处理，或确认未受理并退款；附核对记录 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ScriptReviewResult"];
                    };
                };
                /** @description 处理冲突或已不需要核对 */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects/{id}/script-quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 本人项目第1集剧本报价，未开放时不展示价格 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaScriptQuote"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects/{id}/script-jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 最新作业，无作业为null */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaScriptJobView"] | null;
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SubmitDramaScriptJob"];
                };
            };
            responses: {
                /** @description 按确认报价受理或幂等重放；mock免费 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaScriptJobView"];
                    };
                };
                /** @description 积分不足 */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description 报价变更或请求冲突 */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description 受理未开放 */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/script-jobs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 本人作业及草稿 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaScriptJobView"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects/{id}/script-confirmation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ConfirmDramaScript"];
                };
            };
            responses: {
                /** @description 确认并固定剧本版本 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaProjectView"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects/{id}/script-batch-quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 剩余剧本集数与总报价 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ScriptBatchQuote"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects/{id}/script-batches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SubmitScriptBatch"];
                };
            };
            responses: {
                /** @description 剧本批次受理或原请求重放 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ScriptBatch"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects/{id}/script-batches/latest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 本人项目最近剧本批次 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ScriptBatch"] | null;
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/script-batches/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 逐集进度与汇总剧本 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ScriptBatch"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 本人漫剧项目分页列表 */
        get: {
            parameters: {
                query?: {
                    cursor?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 项目列表 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaProjectList"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 游标不可用 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        /** 创建本人漫剧项目；已有剧本生成不可变首版本并解析，想法模式只保存待生成项目 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateDramaProject"];
                };
            };
            responses: {
                /** @description 项目已保存 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaProjectView"];
                    };
                };
                /** @description 字段非法 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 账户已注销 */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取本人漫剧项目及固定剧本版本 */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 项目 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaProjectView"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 项目不存在或不属于本人 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects/{id}/workflow": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取本人项目的角色、场景、镜头和不可变候选计划 */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 项目工作流 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaProjectWorkflow"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 项目不存在或不属于本人 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects/{id}/roles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 创建角色及不可变首版本，绑定本人有效参考素材 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateDramaRole"];
                };
            };
            responses: {
                /** @description 角色 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaRole"];
                    };
                };
                /** @description 字段非法 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 项目或素材不存在 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 素材过期或项目没有固定剧本 */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/roles/{id}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 追加角色版本，不覆盖历史角色参考 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateDramaRoleVersion"];
                };
            };
            responses: {
                /** @description 角色版本 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaRoleVersion"];
                    };
                };
                /** @description 字段非法 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 角色或素材不存在 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 素材过期 */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects/{id}/scenes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 创建场景及不可变首版本 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateDramaScene"];
                };
            };
            responses: {
                /** @description 场景 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaScene"];
                    };
                };
                /** @description 字段非法 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 项目不存在 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 项目没有固定剧本 */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/scenes/{id}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 追加场景版本，不覆盖历史描述 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateDramaSceneVersion"];
                };
            };
            responses: {
                /** @description 场景版本 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaSceneVersion"];
                    };
                };
                /** @description 字段非法 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 场景不存在 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects/{id}/shots": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 创建项目镜头的提示词快照 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateDramaStoryboardShot"];
                };
            };
            responses: {
                /** @description 镜头 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaStoryboardShot"];
                    };
                };
                /** @description 字段非法 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 项目不存在 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 项目没有固定剧本或镜头已存在 */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/shots/{id}/candidates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 保存待生成候选的角色、场景、剧本与提示词快照；不会创建模型任务 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateDramaStoryboardCandidate"];
                };
            };
            responses: {
                /** @description 候选计划 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaStoryboardCandidate"];
                    };
                };
                /** @description 字段非法 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 镜头或版本不属于本人项目 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 角色参考素材过期 */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/candidates/{id}/select": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 选择一个候选计划；同一镜头原选择会取消，但候选记录不可变 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 已选择候选 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaStoryboardCandidate"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 候选不存在或不属于本人 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/candidates/{id}/image-jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 受理一个候选图像生成作业；默认关闭，开启时冻结独立积分预留 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SubmitDramaImageJob"];
                };
            };
            responses: {
                /** @description 已受理候选图像作业 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaImageJobView"];
                    };
                };
                /** @description 字段非法 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 候选不存在或不属于本人 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 参考素材过期或请求冲突 */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 图像受理未开启 */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/image-jobs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取本人候选图像作业状态；不包含供应商回执或 URL */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 候选图像作业 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaImageJobView"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 作业不存在或不属于本人 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/image-jobs/{id}/media": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 仅本人已发布候选图的短时私有访问链接 */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 有效期不超过10分钟且不超过资产到期时间 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaImageAccess"];
                    };
                };
                /** @description 非法ID */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 无本人已发布候选图 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 资产已过期 */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 存储不可用 */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/candidates/{id}/video-jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 受理所选候选的逐镜视频作业；幂等并按现有规则预留积分 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SubmitDramaShotVideoJob"];
                };
            };
            responses: {
                /** @description 新受理或幂等重放 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaShotVideoJobView"];
                    };
                };
                /** @description 字段非法 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 余额不足 */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 候选不存在或不属于本人 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 候选未选定、图像未发布或请求冲突 */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 逐镜视频受理未开启 */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/video-jobs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取本人逐镜视频状态；不暴露内部输出引用或供应商回执 */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 逐镜视频作业 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaShotVideoJobView"];
                    };
                };
                /** @description 非法ID */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 作业不存在或不属于本人 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/video-jobs/{id}/media": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 仅本人已发布逐镜视频的短时私有 MP4 访问链接 */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 有效期不超过10分钟且不超过资产到期时间 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaShotVideoAccess"];
                    };
                };
                /** @description 非法ID */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 无本人已发布逐镜视频 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 资产已过期 */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 存储不可用 */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/projects/{id}/exports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 创建本人项目的免费 mock 成片导出；快照所有已选定且已发布的逐镜视频 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateDramaExport"];
                };
            };
            responses: {
                /** @description 新导出或幂等重放 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaExportJobView"];
                    };
                };
                /** @description 字段非法 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 项目不存在或不属于本人 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 镜头视频尚未发布或请求冲突 */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/exports/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取本人导出作业状态；不暴露内部输出引用或 manifest */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 导出作业 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaExportJobView"];
                    };
                };
                /** @description 非法ID */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 作业不存在或不属于本人 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/exports/{id}/media": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 仅本人已发布导出成片的短时私有 MP4 访问链接 */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 有效期不超过10分钟且不超过资产到期时间 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaExportAccess"];
                    };
                };
                /** @description 非法ID */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 无本人已发布导出成片 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 资产已过期 */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 存储不可用 */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/scripts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 本人剧本库分页列表 */
        get: {
            parameters: {
                query?: {
                    cursor?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 剧本列表 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaScriptList"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 游标不可用 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/scripts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取本人剧本及最新可修复版本 */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 剧本 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaScriptView"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 剧本不存在或不属于本人 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/drama/scripts/{id}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 追加人工修复版本并重新解析；不覆盖历史版本 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["RepairDramaScript"];
                };
            };
            responses: {
                /** @description 新剧本版本 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DramaScriptVersion"];
                    };
                };
                /** @description 字段非法 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 剧本不存在或不属于本人 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/materials": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 上传营销视频参考图素材(multipart 字段 file,≤10M,jpg/png/webp);入库后7天内可用于生成 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "multipart/form-data": {
                        /** Format: binary */
                        file: string;
                    };
                };
            };
            responses: {
                /** @description 素材元数据 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MaterialView"];
                    };
                };
                /** @description 类型/尺寸/解析失败 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 超过10M */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/ops/review/generations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 未知受理工单列表(运营通道,x-ops-token;不对C端暴露) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 未知受理队列 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OpsReviewList"];
                    };
                };
                /** @description 运营口令缺失或不匹配 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/ops/review/generations/{id}/receipt": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 登记迟到受理回执,任务恢复轮询(幂等;仅受理 unknown 状态) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["OpsReceiptRequest"];
                };
            };
            responses: {
                /** @description 已登记并恢复 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OpsReviewActionResult"];
                    };
                };
                /** @description 参数错误 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 运营口令缺失或不匹配 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 任务不存在 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 状态非 unknown */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/ops/review/generations/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 拒收未知受理:退还预留积分并终止任务 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 已拒收并退款 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OpsReviewActionResult"];
                    };
                };
                /** @description 运营口令缺失或不匹配 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 任务不存在 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 状态非 unknown */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/generation/{id}/media": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 仅本人已发布成片的短时私有访问链接 */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 有效期不超过10分钟且不超过资产到期时间 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MediaAccess"];
                    };
                };
                /** @description 非法ID */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 无本人已发布资产 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 资产已过期 */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 存储不可用 */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/generation/quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 服务端营销视频报价；不创建任务、不预留积分 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["GenerationSettings"];
                };
            };
            responses: {
                /** @description 当前报价和受理能力 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GenerationQuote"];
                    };
                };
                /** @description 参数错误 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/generation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 本人视频任务列表，按创建时间倒序，每页20条 */
        get: {
            parameters: {
                query?: {
                    cursor?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 任务列表 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GenerationList"];
                    };
                };
                /** @description 参数错误 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 游标不可用 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        /** 幂等受理营销视频；执行链未就绪时拒绝且不预留积分 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SubmitGeneration"];
                };
            };
            responses: {
                /** @description 新受理或原请求重放 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GenerationView"];
                    };
                };
                /** @description 无效参数 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 会话无效 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 余额不足 */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 账户停用 */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 报价变更或幂等冲突 */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 生成执行链不可用 */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/generation/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 仅查询本人任务；内部资产引用不作为下载地址返回 */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 任务状态 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GenerationView"];
                    };
                };
                /** @description 无效ID */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 会话无效 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 任务不存在或不属于本人 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/healthz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 存活探测(LB / CI) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 健康 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["HealthResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/readyz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 新 API 数据库就绪探测 */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 可受理请求 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["HealthResponse"];
                    };
                };
                /** @description 依赖服务不可用 */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/guest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 游客登录(实现:T1.1 Fastify) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["GuestLoginRequest"];
                };
            };
            responses: {
                /** @description 会话签发 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GuestSession"];
                    };
                };
                /** @description 参数校验失败 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/auth/guest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 使用游客秘密凭据创建或恢复身份；注册赠送只发放一次 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["GuestBootstrapRequest"];
                };
            };
            responses: {
                /** @description 不透明会话 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GuestSession"];
                    };
                };
                /** @description 凭据格式错误 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 账户已注销 */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/auth/deactivate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 注销当前账户并撤销全部会话 */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 已注销 */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description 无效或已过期会话 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 账户已注销 */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/wallet": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 当前会话账户的余额和最近20条流水；不接受账户ID参数 */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 钱包概览 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["WalletSummary"];
                    };
                };
                /** @description 无效或已过期会话 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 账户已注销 */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/wallet/entries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 本人积分流水完整分页，按时间倒序，每页20条；游标由上一页响应下发 */
        get: {
            parameters: {
                query?: {
                    cursor?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 流水页 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["WalletEntryList"];
                    };
                };
                /** @description 游标格式非法 */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 无效或已过期会话 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 账户已注销 */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
                /** @description 游标不可用 */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/deactivate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 账号注销(软删除;实现:T1.1) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 已注销 */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description 未登录/凭证失效 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/uploads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 上传参考图(V1 传图生成;multipart 字段 file,≤10M,jpg/png/webp) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "multipart/form-data": {
                        /** Format: binary */
                        file: string;
                    };
                };
            };
            responses: {
                /** @description 上传完成 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UploadResult"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/wallet": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 钱包概览:余额+最近流水(实现:T1.2) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 余额与流水 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["WalletSummary"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/store/packages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 充值档位列表(T1.4) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 档位 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StorePackages"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/store/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 我的订单列表(T1.4) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 订单 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StoreOrders"];
                    };
                };
            };
        };
        put?: never;
        /** 创建充值订单(T1.4;微信支付参数随商户号接入,当前阻塞墙) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateOrderRequest"];
                };
            };
            responses: {
                /** @description 订单已创建 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StoreOrder"];
                    };
                };
                /** @description 未登录 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/store/orders/{id}/dev-pay": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** DEV-ONLY:模拟支付回调(NODE_ENV=production 时 404;真实微信回调随商户号) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 订单已支付并入账 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StoreOrder"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 模板 feed(T3.2 首页;生成同款→预填创作表单) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 模板列表 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Templates"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/feedback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 提交用户反馈(OPS-01;落库后运营可见) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateFeedbackRequest"];
                };
            };
            responses: {
                /** @description 已受理 */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FeedbackCreated"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/images/generate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** AI 绘画/改图(V1;改图传 imageUrls;每用户每小时 5 次) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["GenerateImageRequest"];
                };
            };
            responses: {
                /** @description 生成结果图 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GenerateImageResult"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/polish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** AI 文案优化(一句卖点 → 结构化口播稿;V0 免费不计费) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["PolishRequest"];
                };
            };
            responses: {
                /** @description 优化后的文案 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PolishResult"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/tasks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 我的任务列表 */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 任务列表 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GenerationTasks"];
                    };
                };
            };
        };
        put?: never;
        /** 创建生成任务(冻结估算积分并入队;实现:T2.2) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateTaskRequest"];
                };
            };
            responses: {
                /** @description 任务已受理 */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GenerationTask"];
                    };
                };
                /** @description 积分不足 */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorBody"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/tasks/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 任务详情(进度轮询) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 任务 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GenerationTask"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/tasks/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 取消任务(失败/取消全额退积分) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 取消后的任务 */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GenerationTask"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        PlanImageRequest: {
            shotKey: string;
            planRevision: number;
        };
        PlanVideoRequest: {
            planRevision: number;
        };
        PlanExportList: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            projectId: string;
            episodeNumber: number;
            /** Format: uuid */
            requestKey: string;
            /** @enum {string} */
            status: "accepted" | "succeeded" | "failed";
            failureCode: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            finishedAt: string | null;
        }[];
        ProductionShot: {
            key: string;
            episodeNumber: number;
            sceneNumber: number;
            shotNumber: number;
            heading: string;
            sourceShotKeys: string[];
            sourceLines: number[];
            sourceText: string;
            content: string;
            roleKeys: string[];
            spokenLines: {
                speaker: string;
                text: string;
                voiceOver: boolean;
            }[];
            timing: {
                minimumMs: number;
                maximumMs: number;
            };
            suggestedVideoDurationSec: (5 | 10) | null;
            issues: ("requires_split" | "too_many_roles" | "description_too_long")[];
        };
        DramaProductionPlan: {
            /** Format: uuid */
            planId: string;
            /** Format: uuid */
            projectId: string;
            /** Format: uuid */
            scriptVersionId: string;
            planRevision: number;
            version: string;
            current: boolean;
            /** @enum {string} */
            timingBasis: "text_estimate_3_to_4_units_per_second";
            /** @enum {boolean} */
            canGenerate: false;
            /** @enum {unknown|null} */
            estimatedCostCents: "null" | null;
            originalShotCount: number;
            proposedShotCount: number;
            episodes: {
                number: number;
                timing: {
                    minimumMs: number;
                    maximumMs: number;
                };
                /** @enum {number} */
                targetMinimumMs: 60000;
                /** @enum {number} */
                targetMaximumMs: 120000;
                shots: {
                    key: string;
                    episodeNumber: number;
                    sceneNumber: number;
                    shotNumber: number;
                    heading: string;
                    sourceShotKeys: string[];
                    sourceLines: number[];
                    sourceText: string;
                    content: string;
                    roleKeys: string[];
                    spokenLines: {
                        speaker: string;
                        text: string;
                        voiceOver: boolean;
                    }[];
                    timing: {
                        minimumMs: number;
                        maximumMs: number;
                    };
                    suggestedVideoDurationSec: (5 | 10) | null;
                    issues: ("requires_split" | "too_many_roles" | "description_too_long")[];
                }[];
                issues: ("episode_missing" | "duration_short" | "duration_long" | "shot_needs_review")[];
            }[];
        };
        NativeMarketingInput: {
            /** @enum {string} */
            category: "commerce" | "store_visit";
            /** @enum {number} */
            durationSec: 10;
            /** @enum {string} */
            resolution: "720p";
            /** @enum {string} */
            aspectRatio: "9:16";
            prompt: string;
            /** @default [] */
            materialIds: string[];
            /** Format: uuid */
            copyJobId?: string;
        };
        NativeCaptionReview: {
            /** Format: uuid */
            jobId: string;
            /** @enum {string} */
            state: "transcribing" | "review" | "ready";
            revision: number;
            durationMs: number;
            transcript: string;
            cues: {
                startMs: number;
                endMs: number;
                text: string;
            }[];
            /** @enum {string|null} */
            issue: "transcription_failed" | "render_failed" | null;
            /** Format: uuid */
            confirmationRequestKey: string | null;
            /** Format: date-time */
            expiresAt: string;
        };
        ConfirmNativeCaptions: {
            /** Format: uuid */
            requestKey: string;
            revision: number;
            cues: {
                startMs: number;
                endMs: number;
                text: string;
            }[];
        };
        NativeSourceAccess: {
            /** Format: uri */
            url: string;
            /** Format: date-time */
            urlExpiresAt: string;
            /** Format: date-time */
            expiresAt: string;
            sha256: string;
            width: number;
            height: number;
            durationMs: number;
        };
        ResumeNativeMedia: Record<string, never>;
        NativeMarketingQuote: {
            /** @enum {string} */
            settlementPoint: "preview";
            /** @enum {string} */
            category: "commerce" | "store_visit";
            /** @enum {number} */
            durationSec: 10;
            /** @enum {string} */
            resolution: "720p";
            /** @enum {string} */
            aspectRatio: "9:16";
            /** @enum {string} */
            mode: "disabled" | "mock" | "atlas";
            available: boolean;
            credits: number | null;
            version: string | null;
        };
        SubmitNativeMarketing: {
            /** @enum {string} */
            category: "commerce" | "store_visit";
            /** @enum {number} */
            durationSec: 10;
            /** @enum {string} */
            resolution: "720p";
            /** @enum {string} */
            aspectRatio: "9:16";
            prompt: string;
            /** @default [] */
            materialIds: string[];
            /** Format: uuid */
            copyJobId?: string;
            /** Format: uuid */
            requestKey: string;
            quoteVersion: string;
        };
        MarketingProductionRequest: {
            /** @enum {string} */
            category: "commerce" | "store_visit";
            text: string;
            durationSec: 5 | 10;
        };
        MarketingProductionPlan: {
            /** @enum {string} */
            category: "commerce" | "store_visit";
            durationSec: 5 | 10;
            version: string;
            /** @enum {string} */
            timingBasis: "text_estimate_3_to_4_units_per_second";
            voiceover: string;
            timing: {
                minimumMs: number;
                maximumMs: number;
            };
            issues: ("voiceover_missing" | "voiceover_too_long" | "picture_missing")[];
            /** @enum {boolean} */
            canGenerate: false;
            /** @enum {unknown|null} */
            estimatedCostCents: "null" | null;
        };
        SubmitPlanVideo: {
            planRevision: number;
            /** Format: uuid */
            requestKey: string;
            quoteVersion: string;
        };
        PlanVideoQuote: {
            /** @enum {string} */
            mode: "disabled" | "mock";
            credits: number | null;
            version: string | null;
        };
        SubmitPlanImage: {
            shotKey: string;
            planRevision: number;
            /** Format: uuid */
            requestKey: string;
            quoteVersion: string;
        };
        PlanImageQuote: {
            /** @enum {string} */
            mode: "disabled" | "mock";
            credits: number | null;
            version: string | null;
        };
        SelectPlanImage: {
            planRevision: number;
        };
        PlanImage: {
            /** Format: uuid */
            candidateId: string;
            /** Format: uuid */
            planId: string;
            /** Format: uuid */
            shotId: string;
            shotKey: string;
            planRevision: number;
            roleVersionIds: string[];
            content: string;
            current: boolean;
            /** Format: date-time */
            selectedAt: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            expiresAt: string | null;
            /** Format: uuid */
            jobId: string;
            /** Format: uuid */
            requestKey: string;
            /** @enum {string} */
            provider: "mock";
            /** @enum {string} */
            status: "accepted" | "succeeded" | "failed";
            reservedCredits: number;
            actualCredits: number | null;
            failureCode: string | null;
        };
        PlanImageList: {
            items: {
                /** Format: uuid */
                candidateId: string;
                /** Format: uuid */
                planId: string;
                /** Format: uuid */
                shotId: string;
                shotKey: string;
                planRevision: number;
                roleVersionIds: string[];
                content: string;
                current: boolean;
                /** Format: date-time */
                selectedAt: string | null;
                /** Format: date-time */
                createdAt: string;
                /** Format: date-time */
                expiresAt: string | null;
                /** Format: uuid */
                jobId: string;
                /** Format: uuid */
                requestKey: string;
                /** @enum {string} */
                provider: "mock";
                /** @enum {string} */
                status: "accepted" | "succeeded" | "failed";
                reservedCredits: number;
                actualCredits: number | null;
                failureCode: string | null;
            }[];
            /** Format: uuid */
            nextCursor: string | null;
        };
        CreateStoryboardPlan: {
            /** Format: uuid */
            scriptVersionId: string;
            preparationRevision: number;
        };
        UpdateStoryboardPlanShot: {
            baseRevision: number;
            shotKey: string;
            content: string;
            roleKeys: string[];
            reviewed: boolean;
        };
        StoryboardPlan: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            projectId: string;
            /** Format: uuid */
            scriptVersionId: string;
            preparationRevision: number;
            revision: number;
            current: boolean;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            roles: {
                key: string;
                name: string;
                /** @enum {string} */
                usage: "visual" | "voice_only";
                description: string;
                /** Format: uuid */
                roleVersionId: string | null;
                /** Format: uuid */
                referenceMaterialId: string | null;
                referenceSha256: string | null;
            }[];
            shots: {
                key: string;
                episodeNumber: number;
                sceneNumber: number;
                shotNumber: number;
                heading: string;
                sceneDescription: string;
                sourceLine: number;
                sourceText: string;
                content: string;
                roleKeys: string[];
                reviewed: boolean;
            }[];
        };
        CreateDramaProject: {
            /** @enum {string} */
            mode: "idea" | "script";
            title: string;
            content: string;
            /** @enum {string} */
            look: "3D国创" | "都市言情" | "美式3D" | "都市漫画";
            /** @enum {string} */
            aspectRatio: "4:3" | "3:4" | "16:9" | "9:16";
            episodeCount: number;
            /** @enum {string} */
            genre?: "通用" | "动作" | "玄幻" | "言情" | "悬疑" | "古装" | "现代" | "穿越" | "重生" | "都市" | "宫斗" | "喜剧" | "科幻" | "校园" | "青春";
            /** @enum {string} */
            tone?: "通用" | "严肃" | "搞笑" | "讽刺" | "稳重" | "简洁";
        };
        DramaProjectView: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            scriptId: string | null;
            /** Format: uuid */
            activeVersionId: string | null;
            /** @enum {string} */
            mode: "idea" | "script";
            title: string;
            idea: string | null;
            /** @enum {string} */
            look: "3D国创" | "都市言情" | "美式3D" | "都市漫画";
            /** @enum {string} */
            aspectRatio: "4:3" | "3:4" | "16:9" | "9:16";
            episodeCount: number;
            /** @enum {string|null} */
            genre: "通用" | "动作" | "玄幻" | "言情" | "悬疑" | "古装" | "现代" | "穿越" | "重生" | "都市" | "宫斗" | "喜剧" | "科幻" | "校园" | "青春" | null;
            /** @enum {string|null} */
            tone: "通用" | "严肃" | "搞笑" | "讽刺" | "稳重" | "简洁" | null;
            /** Format: date-time */
            createdAt: string;
            activeVersion: {
                /** Format: uuid */
                id: string;
                ordinal: number;
                content: string;
                /** @enum {string} */
                source: "imported" | "manual_repair" | "mock_generated" | "ai_generated";
                parse: {
                    /** @enum {string} */
                    status: "parsed" | "needs_repair";
                    /** @default [] */
                    roles: string[];
                    episodes: {
                        number: number;
                        scenes: {
                            number: number;
                            heading: string;
                            dialogueCount: number;
                        }[];
                    }[];
                    diagnostics: {
                        line: number;
                        message: string;
                    }[];
                };
                /** Format: date-time */
                createdAt: string;
            } | null;
            /**
             * Format: uuid
             * @default null
             */
            confirmedVersionId: string | null;
        };
        DramaProjectList: {
            items: {
                /** Format: uuid */
                id: string;
                /** Format: uuid */
                scriptId: string | null;
                /** Format: uuid */
                activeVersionId: string | null;
                /** @enum {string} */
                mode: "idea" | "script";
                title: string;
                idea: string | null;
                /** @enum {string} */
                look: "3D国创" | "都市言情" | "美式3D" | "都市漫画";
                /** @enum {string} */
                aspectRatio: "4:3" | "3:4" | "16:9" | "9:16";
                episodeCount: number;
                /** @enum {string|null} */
                genre: "通用" | "动作" | "玄幻" | "言情" | "悬疑" | "古装" | "现代" | "穿越" | "重生" | "都市" | "宫斗" | "喜剧" | "科幻" | "校园" | "青春" | null;
                /** @enum {string|null} */
                tone: "通用" | "严肃" | "搞笑" | "讽刺" | "稳重" | "简洁" | null;
                /** Format: date-time */
                createdAt: string;
                activeVersion: {
                    /** Format: uuid */
                    id: string;
                    ordinal: number;
                    content: string;
                    /** @enum {string} */
                    source: "imported" | "manual_repair" | "mock_generated" | "ai_generated";
                    parse: {
                        /** @enum {string} */
                        status: "parsed" | "needs_repair";
                        /** @default [] */
                        roles: string[];
                        episodes: {
                            number: number;
                            scenes: {
                                number: number;
                                heading: string;
                                dialogueCount: number;
                            }[];
                        }[];
                        diagnostics: {
                            line: number;
                            message: string;
                        }[];
                    };
                    /** Format: date-time */
                    createdAt: string;
                } | null;
                /**
                 * Format: uuid
                 * @default null
                 */
                confirmedVersionId: string | null;
            }[];
            /** Format: uuid */
            nextCursor: string | null;
        };
        DramaScriptList: {
            items: {
                /** Format: uuid */
                id: string;
                title: string;
                latestVersion: {
                    /** Format: uuid */
                    id: string;
                    ordinal: number;
                    content: string;
                    /** @enum {string} */
                    source: "imported" | "manual_repair" | "mock_generated" | "ai_generated";
                    parse: {
                        /** @enum {string} */
                        status: "parsed" | "needs_repair";
                        /** @default [] */
                        roles: string[];
                        episodes: {
                            number: number;
                            scenes: {
                                number: number;
                                heading: string;
                                dialogueCount: number;
                            }[];
                        }[];
                        diagnostics: {
                            line: number;
                            message: string;
                        }[];
                    };
                    /** Format: date-time */
                    createdAt: string;
                };
                /** Format: date-time */
                createdAt: string;
            }[];
            /** Format: uuid */
            nextCursor: string | null;
        };
        DramaScriptView: {
            /** Format: uuid */
            id: string;
            title: string;
            latestVersion: {
                /** Format: uuid */
                id: string;
                ordinal: number;
                content: string;
                /** @enum {string} */
                source: "imported" | "manual_repair" | "mock_generated" | "ai_generated";
                parse: {
                    /** @enum {string} */
                    status: "parsed" | "needs_repair";
                    /** @default [] */
                    roles: string[];
                    episodes: {
                        number: number;
                        scenes: {
                            number: number;
                            heading: string;
                            dialogueCount: number;
                        }[];
                    }[];
                    diagnostics: {
                        line: number;
                        message: string;
                    }[];
                };
                /** Format: date-time */
                createdAt: string;
            };
            /** Format: date-time */
            createdAt: string;
        };
        DramaScriptVersion: {
            /** Format: uuid */
            id: string;
            ordinal: number;
            content: string;
            /** @enum {string} */
            source: "imported" | "manual_repair" | "mock_generated" | "ai_generated";
            parse: {
                /** @enum {string} */
                status: "parsed" | "needs_repair";
                /** @default [] */
                roles: string[];
                episodes: {
                    number: number;
                    scenes: {
                        number: number;
                        heading: string;
                        dialogueCount: number;
                    }[];
                }[];
                diagnostics: {
                    line: number;
                    message: string;
                }[];
            };
            /** Format: date-time */
            createdAt: string;
        };
        RepairDramaScript: {
            content: string;
        };
        CreateDramaRole: {
            name: string;
            description: string;
            /** Format: uuid */
            referenceMaterialId: string;
        };
        CreateDramaRoleVersion: {
            description: string;
            /** Format: uuid */
            referenceMaterialId: string;
        };
        DramaRoleVersion: {
            /** Format: uuid */
            id: string;
            ordinal: number;
            description: string;
            /** Format: uuid */
            referenceMaterialId: string;
            referenceSha256: string;
            /** Format: date-time */
            createdAt: string;
        };
        DramaRole: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            projectId: string;
            name: string;
            /** Format: date-time */
            createdAt: string;
            latestVersion: {
                /** Format: uuid */
                id: string;
                ordinal: number;
                description: string;
                /** Format: uuid */
                referenceMaterialId: string;
                referenceSha256: string;
                /** Format: date-time */
                createdAt: string;
            };
        };
        CreateDramaScene: {
            name: string;
            description: string;
        };
        CreateDramaSceneVersion: {
            description: string;
        };
        DramaSceneVersion: {
            /** Format: uuid */
            id: string;
            ordinal: number;
            description: string;
            /** Format: date-time */
            createdAt: string;
        };
        DramaScene: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            projectId: string;
            name: string;
            /** Format: date-time */
            createdAt: string;
            latestVersion: {
                /** Format: uuid */
                id: string;
                ordinal: number;
                description: string;
                /** Format: date-time */
                createdAt: string;
            };
        };
        CreateDramaStoryboardShot: {
            episodeNumber: number;
            sceneNumber: number;
            prompt: string;
        };
        CreateDramaStoryboardCandidate: {
            /** Format: uuid */
            roleVersionId: string;
            /** Format: uuid */
            sceneVersionId: string;
            prompt: string;
        };
        DramaStoryboardCandidate: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            scriptVersionId: string;
            /** Format: uuid */
            roleVersionId: string;
            /** Format: uuid */
            sceneVersionId: string;
            ordinal: number;
            prompt: string;
            /** Format: date-time */
            selectedAt: string | null;
            /** Format: date-time */
            createdAt: string;
            imageJob: {
                /** Format: uuid */
                id: string;
                /** @enum {string} */
                status: "accepted" | "succeeded" | "failed";
                failureCode: string | null;
            } | null;
            videoJob: {
                /** Format: uuid */
                id: string;
                /** @enum {string} */
                status: "accepted" | "succeeded" | "failed";
                failureCode: string | null;
            } | null;
        };
        DramaStoryboardShot: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            projectId: string;
            episodeNumber: number;
            sceneNumber: number;
            prompt: string;
            /** Format: date-time */
            createdAt: string;
            candidates: {
                /** Format: uuid */
                id: string;
                /** Format: uuid */
                scriptVersionId: string;
                /** Format: uuid */
                roleVersionId: string;
                /** Format: uuid */
                sceneVersionId: string;
                ordinal: number;
                prompt: string;
                /** Format: date-time */
                selectedAt: string | null;
                /** Format: date-time */
                createdAt: string;
                imageJob: {
                    /** Format: uuid */
                    id: string;
                    /** @enum {string} */
                    status: "accepted" | "succeeded" | "failed";
                    failureCode: string | null;
                } | null;
                videoJob: {
                    /** Format: uuid */
                    id: string;
                    /** @enum {string} */
                    status: "accepted" | "succeeded" | "failed";
                    failureCode: string | null;
                } | null;
            }[];
        };
        DramaProjectWorkflow: {
            roles: {
                /** Format: uuid */
                id: string;
                /** Format: uuid */
                projectId: string;
                name: string;
                /** Format: date-time */
                createdAt: string;
                latestVersion: {
                    /** Format: uuid */
                    id: string;
                    ordinal: number;
                    description: string;
                    /** Format: uuid */
                    referenceMaterialId: string;
                    referenceSha256: string;
                    /** Format: date-time */
                    createdAt: string;
                };
            }[];
            scenes: {
                /** Format: uuid */
                id: string;
                /** Format: uuid */
                projectId: string;
                name: string;
                /** Format: date-time */
                createdAt: string;
                latestVersion: {
                    /** Format: uuid */
                    id: string;
                    ordinal: number;
                    description: string;
                    /** Format: date-time */
                    createdAt: string;
                };
            }[];
            shots: {
                /** Format: uuid */
                id: string;
                /** Format: uuid */
                projectId: string;
                episodeNumber: number;
                sceneNumber: number;
                prompt: string;
                /** Format: date-time */
                createdAt: string;
                candidates: {
                    /** Format: uuid */
                    id: string;
                    /** Format: uuid */
                    scriptVersionId: string;
                    /** Format: uuid */
                    roleVersionId: string;
                    /** Format: uuid */
                    sceneVersionId: string;
                    ordinal: number;
                    prompt: string;
                    /** Format: date-time */
                    selectedAt: string | null;
                    /** Format: date-time */
                    createdAt: string;
                    imageJob: {
                        /** Format: uuid */
                        id: string;
                        /** @enum {string} */
                        status: "accepted" | "succeeded" | "failed";
                        failureCode: string | null;
                    } | null;
                    videoJob: {
                        /** Format: uuid */
                        id: string;
                        /** @enum {string} */
                        status: "accepted" | "succeeded" | "failed";
                        failureCode: string | null;
                    } | null;
                }[];
            }[];
        };
        SubmitDramaImageJob: {
            /** Format: uuid */
            requestKey: string;
        };
        DramaImageJobView: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            candidateId: string;
            /** Format: uuid */
            requestKey: string;
            model: string;
            reservedCredits: number;
            /** @enum {string} */
            status: "accepted" | "succeeded" | "failed";
            outputRef: string | null;
            actualCredits: number | null;
            failureCode: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            finishedAt: string | null;
        };
        DramaImageAccess: {
            /** Format: uuid */
            assetId: string;
            /** Format: uuid */
            jobId: string;
            /** Format: uri */
            url: string;
            /** Format: date-time */
            urlExpiresAt: string;
            /** Format: date-time */
            expiresAt: string;
            sha256: string;
            byteLength: number;
            width: number;
            height: number;
        };
        SubmitDramaShotVideoJob: {
            /** Format: uuid */
            requestKey: string;
        };
        DramaShotVideoJobView: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            shotId: string;
            /** Format: uuid */
            candidateId: string;
            /** Format: uuid */
            requestKey?: string;
            /** @enum {string} */
            status: "accepted" | "succeeded" | "failed";
            failureCode: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            finishedAt: string | null;
        };
        DramaShotVideoAccess: {
            /** Format: uuid */
            assetId: string;
            /** Format: uuid */
            jobId: string;
            /** Format: uri */
            url: string;
            /** Format: date-time */
            urlExpiresAt: string;
            /** Format: date-time */
            expiresAt: string;
            sha256: string;
            byteLength: number;
            width: number;
            height: number;
            durationMs: number;
        };
        CreateDramaExport: {
            episodeNumber: number;
            /** Format: uuid */
            requestKey: string;
            /** Format: uuid */
            planId?: string;
            planRevision?: number;
        };
        SubmitDramaScriptJob: {
            /** Format: uuid */
            requestKey: string;
            quoteVersion?: string;
        };
        SubmitScriptBatch: {
            /** Format: uuid */
            requestKey: string;
            quoteVersion: string;
        };
        MarketingCopyInput: {
            /** @enum {string} */
            category: "commerce" | "store_visit";
            durationSec?: 5 | 10;
            text: string;
        };
        MarketingCopyQuote: {
            /** @enum {string} */
            mode: "disabled" | "mock" | "atlas";
            credits: number | null;
            version: string | null;
        };
        SubmitMarketingCopy: {
            /** @enum {string} */
            category: "commerce" | "store_visit";
            durationSec?: 5 | 10;
            text: string;
            /** Format: uuid */
            requestKey: string;
            quoteVersion: string;
        };
        MarketingCopyJob: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            requestKey: string;
            /** @enum {string} */
            category: "commerce" | "store_visit";
            sourceText: string;
            quoteVersion: string;
            /** @enum {string} */
            provider: "mock" | "atlas";
            durationSec?: 5 | 10;
            /** @enum {string} */
            status: "accepted" | "succeeded" | "failed";
            /** @enum {string|null} */
            submissionStatus: "submitting" | "unknown" | "received" | "rejected" | null;
            /** @enum {string} */
            billingStatus: "none" | "held" | "settled" | "refunded";
            reservedCredits: number;
            actualCredits: number | null;
            failureCode: string | null;
            result: {
                text: string;
                usedFacts: string[];
            } | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            finishedAt: string | null;
        };
        MarketingCopyReviewList: {
            /** Format: uuid */
            jobId: string;
            /** @enum {string} */
            category: "commerce" | "store_visit";
            model: string;
            reservedCredits: number;
            /** Format: date-time */
            submittedAt: string;
        }[];
        ScriptBatchQuote: {
            /** @enum {string} */
            mode: "disabled" | "mock" | "atlas";
            version: string | null;
            credits: number | null;
            creditsPerEpisode: number | null;
            episodeCount: number;
            reusedEpisodes: number[];
            toGenerate: number[];
        };
        ScriptBatch: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            projectId: string;
            /** Format: uuid */
            requestKey: string;
            quoteVersion: string;
            /** @enum {string} */
            status: "accepted" | "succeeded" | "needs_attention";
            /** @enum {string} */
            provider: "mock" | "atlas";
            episodeCount: number;
            reservedCredits: number;
            actualCredits: number;
            heldCredits: number;
            refundedCredits: number;
            episodes: {
                number: number;
                /** @enum {string} */
                status: "reused" | "waiting" | "generating" | "review_required" | "succeeded" | "needs_repair" | "failed" | "paused";
                /** Format: uuid */
                jobId: string | null;
                /** Format: uuid */
                scriptId: string | null;
                /** Format: uuid */
                versionId: string | null;
                failureCode: string | null;
            }[];
            /** Format: uuid */
            draftScriptId: string | null;
            draftVersion: {
                /** Format: uuid */
                id: string;
                ordinal: number;
                content: string;
                /** @enum {string} */
                source: "imported" | "manual_repair" | "mock_generated" | "ai_generated";
                parse: {
                    /** @enum {string} */
                    status: "parsed" | "needs_repair";
                    /** @default [] */
                    roles: string[];
                    episodes: {
                        number: number;
                        scenes: {
                            number: number;
                            heading: string;
                            dialogueCount: number;
                        }[];
                    }[];
                    diagnostics: {
                        line: number;
                        message: string;
                    }[];
                };
                /** Format: date-time */
                createdAt: string;
            } | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            finishedAt: string | null;
        };
        DramaScriptQuote: {
            /** @enum {string} */
            mode: "disabled";
            /** @enum {unknown|null} */
            credits: "null" | null;
            /** @enum {unknown|null} */
            version: "null" | null;
            /** @enum {number} */
            episodeNumber: 1;
        } | {
            /** @enum {string} */
            mode: "mock";
            /** @enum {number} */
            credits: 0;
            version: string;
            /** @enum {number} */
            episodeNumber: 1;
        } | {
            /** @enum {string} */
            mode: "atlas";
            credits: number;
            version: string;
            /** @enum {number} */
            episodeNumber: 1;
        };
        TextGenerationReceipt: {
            provider: string;
            model: string;
            responseId: string | null;
            finishReason: string | null;
            text: string;
            textTruncated: boolean;
            usage: {
                inputTokens: number | null;
                outputTokens: number | null;
                cachedInputTokens: number | null;
                reasoningTokens: number | null;
            } | null;
        };
        TextGenerationUsage: {
            inputTokens: number | null;
            outputTokens: number | null;
            cachedInputTokens: number | null;
            reasoningTokens: number | null;
        };
        ConfirmDramaScript: {
            /** Format: uuid */
            versionId: string;
        };
        DramaScriptJobView: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            projectId: string;
            /** Format: uuid */
            requestKey: string;
            /** @enum {string} */
            status: "accepted" | "succeeded" | "failed";
            /** @enum {string} */
            provider: "mock" | "atlas";
            /**
             * @default null
             * @enum {string|null}
             */
            submissionStatus: "submitting" | "received" | "unknown" | "rejected" | null;
            /**
             * @default none
             * @enum {string}
             */
            billingStatus: "none" | "held" | "settled" | "refunded";
            /** @default 0 */
            reservedCredits: number;
            /** @default null */
            actualCredits: number | null;
            /** @default null */
            quoteVersion: string | null;
            failureCode: string | null;
            /** Format: uuid */
            draftScriptId: string | null;
            draftVersion: {
                /** Format: uuid */
                id: string;
                ordinal: number;
                content: string;
                /** @enum {string} */
                source: "imported" | "manual_repair" | "mock_generated" | "ai_generated";
                parse: {
                    /** @enum {string} */
                    status: "parsed" | "needs_repair";
                    /** @default [] */
                    roles: string[];
                    episodes: {
                        number: number;
                        scenes: {
                            number: number;
                            heading: string;
                            dialogueCount: number;
                        }[];
                    }[];
                    diagnostics: {
                        line: number;
                        message: string;
                    }[];
                };
                /** Format: date-time */
                createdAt: string;
            } | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            finishedAt: string | null;
        };
        DramaExportJobView: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            projectId: string;
            episodeNumber: number;
            /** Format: uuid */
            requestKey: string;
            /** @enum {string} */
            status: "accepted" | "succeeded" | "failed";
            failureCode: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            finishedAt: string | null;
        };
        DramaExportAccess: {
            /** Format: uuid */
            assetId: string;
            /** Format: uuid */
            jobId: string;
            /** Format: uri */
            url: string;
            /** Format: date-time */
            urlExpiresAt: string;
            /** Format: date-time */
            expiresAt: string;
            sha256: string;
            byteLength: number;
            width: number;
            height: number;
            durationMs: number;
        };
        MaterialView: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            status: "active" | "expired";
            /** @enum {string} */
            contentType: "image/jpeg" | "image/png" | "image/webp";
            byteLength: number;
            sha256: string;
            width: number;
            height: number;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            expiresAt: string;
        };
        OpsReviewList: {
            items: {
                /** Format: uuid */
                jobId: string;
                /** Format: uuid */
                userId: string;
                prompt: string;
                /** @enum {string} */
                resolution: "480p" | "720p";
                reservedCredits: number;
                providerKey: string;
                /** Format: date-time */
                createdAt: string;
            }[];
        };
        ScriptReviewList: {
            items: {
                /** Format: uuid */
                jobId: string;
                /** Format: uuid */
                projectId: string;
                title: string;
                model: string;
                /** @enum {string} */
                submissionStatus: "submitting" | "unknown";
                reservedCredits: number;
                /** Format: date-time */
                submittedAt: string;
            }[];
            /** Format: uuid */
            nextCursor: string | null;
        };
        ReviewScriptRequest: {
            /** @enum {string} */
            action: "receipt";
            /** Format: uuid */
            requestKey: string;
            reason: string;
            evidenceReference: string;
            response: {
                provider: string;
                model: string;
                responseId: string | null;
                finishReason: string | null;
                text: string;
                textTruncated: boolean;
                usage: {
                    inputTokens: number | null;
                    outputTokens: number | null;
                    cachedInputTokens: number | null;
                    reasoningTokens: number | null;
                } | null;
            };
        } | {
            /** @enum {string} */
            action: "reject";
            /** Format: uuid */
            requestKey: string;
            reason: string;
            evidenceReference: string;
            /** @enum {boolean} */
            confirmedNotAccepted: true;
        };
        ScriptReviewResult: {
            job: {
                /** Format: uuid */
                id: string;
                /** Format: uuid */
                projectId: string;
                /** Format: uuid */
                requestKey: string;
                /** @enum {string} */
                status: "accepted" | "succeeded" | "failed";
                /** @enum {string} */
                provider: "mock" | "atlas";
                /**
                 * @default null
                 * @enum {string|null}
                 */
                submissionStatus: "submitting" | "received" | "unknown" | "rejected" | null;
                /**
                 * @default none
                 * @enum {string}
                 */
                billingStatus: "none" | "held" | "settled" | "refunded";
                /** @default 0 */
                reservedCredits: number;
                /** @default null */
                actualCredits: number | null;
                /** @default null */
                quoteVersion: string | null;
                failureCode: string | null;
                /** Format: uuid */
                draftScriptId: string | null;
                draftVersion: {
                    /** Format: uuid */
                    id: string;
                    ordinal: number;
                    content: string;
                    /** @enum {string} */
                    source: "imported" | "manual_repair" | "mock_generated" | "ai_generated";
                    parse: {
                        /** @enum {string} */
                        status: "parsed" | "needs_repair";
                        /** @default [] */
                        roles: string[];
                        episodes: {
                            number: number;
                            scenes: {
                                number: number;
                                heading: string;
                                dialogueCount: number;
                            }[];
                        }[];
                        diagnostics: {
                            line: number;
                            message: string;
                        }[];
                    };
                    /** Format: date-time */
                    createdAt: string;
                } | null;
                /** Format: date-time */
                createdAt: string;
                /** Format: date-time */
                finishedAt: string | null;
            };
            review: {
                /** @enum {string} */
                action: "receipt" | "reject";
                /** Format: uuid */
                requestKey: string;
                reason: string;
                evidenceReference: string;
                /** @enum {string} */
                authSource: "ops-token";
                /** Format: date-time */
                reviewedAt: string;
            };
        };
        PortraitReviewList: {
            items: {
                /** Format: uuid */
                jobId: string;
                /** Format: uuid */
                projectId: string;
                roleName: string;
                model: string;
                /** @enum {string} */
                provider: "mock" | "atlas";
                /** @enum {string} */
                submissionStatus: "submitting" | "unknown";
                reservedCredits: number;
                /** Format: date-time */
                submittedAt: string;
            }[];
            /** Format: uuid */
            nextCursor: string | null;
        };
        ReviewPortraitRequest: {
            /** Format: uuid */
            requestKey: string;
            reason: string;
            evidenceReference: string;
            /** @enum {string} */
            action: "receipt";
            /** @enum {string} */
            provider: "mock" | "atlas";
            model: string;
            providerTaskId: string;
            /** @enum {boolean} */
            confirmedTaskOwnership: true;
        } | {
            /** Format: uuid */
            requestKey: string;
            reason: string;
            evidenceReference: string;
            /** @enum {string} */
            action: "reject";
            /** @enum {boolean} */
            confirmedNotAccepted: true;
        };
        PortraitReviewResult: {
            job: {
                /** Format: uuid */
                id: string;
                /** @enum {string} */
                status: "accepted" | "succeeded" | "failed";
                /** @enum {string} */
                submissionStatus: "submitting" | "unknown" | "submitted" | "rejected";
                reservedCredits: number;
                actualCredits: number | null;
            };
            review: {
                /** @enum {string} */
                action: "receipt" | "reject";
                /** Format: uuid */
                requestKey: string;
                reason: string;
                evidenceReference: string;
                /** @enum {string} */
                authSource: "ops-token";
                /** Format: date-time */
                reviewedAt: string;
            };
        };
        DramaPreparation: {
            /** Format: uuid */
            projectId: string;
            /** Format: uuid */
            scriptVersionId: string;
            scriptVersionOrdinal: number;
            revision: number;
            /** Format: date-time */
            updatedAt: string | null;
            roles: {
                key: string;
                name: string;
                /** @enum {string} */
                usage: "visual" | "voice_only";
                description: string;
                /**
                 * Format: uuid
                 * @default null
                 */
                referenceMaterialId: string | null;
                evidence: string[];
                /** @default null */
                selection: {
                    /** Format: uuid */
                    roleVersionId: string;
                    /** Format: uuid */
                    referenceMaterialId: string;
                    referenceSha256: string;
                    /** Format: date-time */
                    expiresAt: string;
                    /** Format: date-time */
                    confirmedAt: string;
                    /** @enum {string} */
                    status: "confirmed" | "needs_confirmation" | "expired";
                } | null;
            }[];
            scenes: {
                key: string;
                description: string;
                episodeNumber: number;
                sceneNumber: number;
                heading: string;
            }[];
        };
        ConfirmRoleAppearance: {
            /** Format: uuid */
            scriptVersionId: string;
            preparationRevision: number;
            roleKey: string;
        };
        MaterialAccess: {
            /** Format: uuid */
            materialId: string;
            /** Format: uri */
            url: string;
            /** Format: date-time */
            urlExpiresAt: string;
            /** Format: date-time */
            expiresAt: string;
        };
        PortraitRequest: {
            roleKey: string;
            preparationRevision: number;
        };
        SubmitPortrait: {
            roleKey: string;
            preparationRevision: number;
            /** Format: uuid */
            requestKey: string;
            quoteVersion: string;
        };
        SelectPortrait: {
            preparationRevision: number;
        };
        PortraitQuote: {
            /** @enum {string} */
            mode: "disabled" | "mock" | "atlas";
            credits: number | null;
            version: string | null;
        };
        PortraitJobView: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            projectId: string;
            roleKey: string;
            roleName: string;
            description: string;
            /** Format: uuid */
            requestKey: string;
            quoteVersion: string;
            /** @enum {string} */
            provider: "mock" | "atlas";
            /** @enum {string} */
            status: "accepted" | "succeeded" | "failed";
            /** @enum {string|null} */
            submissionStatus: "submitting" | "submitted" | "unknown" | "rejected" | null;
            failureCode: string | null;
            reservedCredits: number;
            actualCredits: number | null;
            /** Format: uuid */
            materialId: string | null;
            current: boolean;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            expiresAt: string | null;
        };
        PortraitJobList: {
            items: {
                /** Format: uuid */
                id: string;
                /** Format: uuid */
                projectId: string;
                roleKey: string;
                roleName: string;
                description: string;
                /** Format: uuid */
                requestKey: string;
                quoteVersion: string;
                /** @enum {string} */
                provider: "mock" | "atlas";
                /** @enum {string} */
                status: "accepted" | "succeeded" | "failed";
                /** @enum {string|null} */
                submissionStatus: "submitting" | "submitted" | "unknown" | "rejected" | null;
                failureCode: string | null;
                reservedCredits: number;
                actualCredits: number | null;
                /** Format: uuid */
                materialId: string | null;
                current: boolean;
                /** Format: date-time */
                createdAt: string;
                /** Format: date-time */
                expiresAt: string | null;
            }[];
            /** Format: uuid */
            nextCursor: string | null;
        };
        SaveDramaPreparation: {
            /** Format: uuid */
            scriptVersionId: string;
            baseRevision: number;
            roles: {
                key: string;
                name: string;
                /** @enum {string} */
                usage: "visual" | "voice_only";
                description: string;
                /**
                 * Format: uuid
                 * @default null
                 */
                referenceMaterialId: string | null;
            }[];
            scenes: {
                key: string;
                description: string;
            }[];
        };
        OpsReceiptRequest: {
            providerTaskId: string;
        };
        OpsReviewActionResult: {
            /** Format: uuid */
            jobId: string;
            /** @enum {string} */
            action: "receipt" | "reject";
            /** @enum {string} */
            status: "accepted" | "failed";
        };
        MediaAccess: {
            /** Format: uuid */
            assetId: string;
            /** Format: uuid */
            jobId: string;
            /** Format: uri */
            url: string;
            /** Format: date-time */
            urlExpiresAt: string;
            /** Format: date-time */
            expiresAt: string;
            sha256: string;
            byteLength: number;
            width: number;
            height: number;
            durationMs: number;
        };
        GenerationSettings: {
            /** @enum {string} */
            resolution: "480p" | "720p";
            /** @enum {string} */
            aspectRatio: "9:16" | "16:9" | "1:1";
            /** @enum {number} */
            durationSec: 5;
        };
        GenerationQuote: {
            /** @enum {string} */
            resolution: "480p" | "720p";
            /** @enum {string} */
            aspectRatio: "9:16" | "16:9" | "1:1";
            /** @enum {number} */
            durationSec: 5;
            version: string;
            credits: number;
            available: boolean;
        };
        SubmitGeneration: {
            /** @enum {string} */
            resolution: "480p" | "720p";
            /** @enum {string} */
            aspectRatio: "9:16" | "16:9" | "1:1";
            /** @enum {number} */
            durationSec: 5;
            /** Format: uuid */
            requestKey: string;
            quoteVersion: string;
            prompt: string;
            /** @enum {string} */
            category?: "commerce" | "store_visit";
            /** Format: uuid */
            copyJobId?: string;
            /** @default [] */
            materialIds: string[];
        };
        GenerationList: {
            items: {
                /** @enum {string} */
                resolution: "480p" | "720p";
                /** @enum {string} */
                aspectRatio: "9:16" | "16:9" | "1:1";
                durationSec: 5 | 10;
                /** @enum {string} */
                provider?: "mock" | "atlas";
                /** @enum {string} */
                settlementPoint?: "preview" | "export";
                /** Format: uuid */
                id: string;
                requestKey: string;
                prompt: string;
                /** @enum {string} */
                category?: "commerce" | "store_visit";
                /** Format: uuid */
                copyJobId?: string;
                /** @enum {string} */
                status: "accepted" | "succeeded" | "failed";
                reservedCredits: number;
                actualCredits: number | null;
                materialIds: string[];
                /** Format: date-time */
                createdAt: string;
                /** Format: date-time */
                finishedAt: string | null;
            }[];
            /** Format: uuid */
            nextCursor: string | null;
        };
        GenerationView: {
            /** @enum {string} */
            resolution: "480p" | "720p";
            /** @enum {string} */
            aspectRatio: "9:16" | "16:9" | "1:1";
            durationSec: 5 | 10;
            /** @enum {string} */
            provider?: "mock" | "atlas";
            /** @enum {string} */
            settlementPoint?: "preview" | "export";
            /** Format: uuid */
            id: string;
            requestKey: string;
            prompt: string;
            /** @enum {string} */
            category?: "commerce" | "store_visit";
            /** Format: uuid */
            copyJobId?: string;
            /** @enum {string} */
            status: "accepted" | "succeeded" | "failed";
            reservedCredits: number;
            actualCredits: number | null;
            materialIds: string[];
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            finishedAt: string | null;
        };
        GenerateImageRequest: {
            prompt: string;
            imageUrls?: string[];
            /**
             * @default 1:1
             * @enum {string}
             */
            aspectRatio: "1:1" | "16:9" | "9:16" | "3:4" | "4:3";
        };
        GenerateImageResult: {
            /** Format: uri */
            imageUrl: string;
        };
        PolishRequest: {
            text: string;
        };
        PolishResult: {
            text: string;
        };
        UploadResult: {
            /** Format: uri */
            url: string;
        };
        CreateFeedbackRequest: {
            content: string;
            contact?: string;
        };
        FeedbackCreated: {
            id: string;
        };
        Templates: {
            templates: {
                id: string;
                title: string;
                category: string;
                coverGradient: string;
                coverMark: string;
                heat: string;
                promptTemplate: string;
            }[];
        };
        CreateTaskRequest: {
            prompt: string;
            imageUrls?: string[];
            /**
             * @default 9:16
             * @enum {string}
             */
            aspectRatio: "16:9" | "9:16" | "1:1";
            /**
             * @default 480p
             * @enum {string}
             */
            resolution: "480p" | "720p" | "1080p";
            /** @default 5 */
            durationSec: number;
        };
        GenerationTask: {
            id: string;
            /** @enum {string} */
            status: "created" | "queued" | "running" | "succeeded" | "failed" | "canceled";
            prompt: string;
            imageUrls: string[];
            aspectRatio: string;
            resolution: string;
            durationSec: number;
            estimateCredits: number;
            attempts: number;
            videoUrl: string | null;
            errorCode: number | null;
            errorMessage: string | null;
            createdAt: string;
            updatedAt: string;
            finishedAt: string | null;
        };
        GenerationTasks: {
            tasks: {
                id: string;
                /** @enum {string} */
                status: "created" | "queued" | "running" | "succeeded" | "failed" | "canceled";
                prompt: string;
                imageUrls: string[];
                aspectRatio: string;
                resolution: string;
                durationSec: number;
                estimateCredits: number;
                attempts: number;
                videoUrl: string | null;
                errorCode: number | null;
                errorMessage: string | null;
                createdAt: string;
                updatedAt: string;
                finishedAt: string | null;
            }[];
        };
        StorePackages: {
            packages: {
                id: string;
                label: string;
                credits: number;
                priceCents: number;
            }[];
        };
        CreateOrderRequest: {
            packageId: string;
        };
        StoreOrder: {
            id: string;
            packageId: string;
            credits: number;
            priceCents: number;
            /** @enum {string} */
            status: "created" | "paid" | "closed";
            createdAt: string;
        };
        StoreOrders: {
            orders: {
                id: string;
                packageId: string;
                credits: number;
                priceCents: number;
                /** @enum {string} */
                status: "created" | "paid" | "closed";
                createdAt: string;
            }[];
        };
        WalletSummary: {
            balance: number;
            entries: {
                billingKey: string;
                /** @enum {string} */
                type: "hold" | "settle" | "refund" | "grant";
                amount: number;
                remark: string | null;
                createdAt: string;
            }[];
        };
        WalletEntryList: {
            entries: {
                billingKey: string;
                /** @enum {string} */
                type: "hold" | "settle" | "refund" | "grant";
                amount: number;
                remark: string | null;
                createdAt: string;
            }[];
            nextCursor: string | null;
        };
        HealthResponse: {
            /** @enum {string} */
            status: "ok" | "degraded";
            /** @enum {string} */
            apiVersion: "v1";
            uptimeSec: number;
        };
        ErrorBody: {
            /** @enum {number} */
            code: 1000 | 1001 | 1002 | 1003 | 2001 | 2002 | 2003 | 3001 | 3002 | 3003 | 3004 | 4001 | 4002 | 4003 | 4004 | 4005 | 4006 | 4007 | 4008 | 4009 | 5001 | 5002 | 6001;
            message: string;
            requestId?: string;
            details?: unknown;
        };
        GuestLoginRequest: {
            deviceId: string;
        };
        GuestBootstrapRequest: {
            credential: string;
        };
        GuestSession: {
            token: string;
            userId: string;
            expiresInSec: number;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
