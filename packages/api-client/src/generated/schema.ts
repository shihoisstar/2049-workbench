// Generated from @wb/contracts OpenAPI. Do not edit.
export interface paths {
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
        HealthResponse: {
            /** @enum {string} */
            status: "ok" | "degraded";
            /** @enum {string} */
            apiVersion: "v1";
            uptimeSec: number;
        };
        ErrorBody: {
            /** @enum {number} */
            code: 1000 | 1001 | 1002 | 1003 | 2001 | 2002 | 2003 | 3001 | 3002 | 3003 | 3004 | 4001 | 4002 | 4003 | 5001 | 5002;
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
