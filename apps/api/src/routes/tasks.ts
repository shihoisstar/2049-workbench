import type { FastifyInstance } from 'fastify';
import { CreateTaskRequest, ErrorCode } from '@wb/contracts';

import { requireAuth } from './auth-route-shared';
import type { TaskService } from '../tasks';

export interface TaskRouteDeps {
  tasks: TaskService;
  /** 入队器(队列在 worker 进程消费;测试可注入 stub) */
  enqueue: (taskId: string) => Promise<void>;
}

export function registerTaskRoutes(app: FastifyInstance, deps: TaskRouteDeps) {
  app.post<{ Body: unknown }>('/v1/tasks', { preHandler: [requireAuth] }, async (req, reply) => {
    const { sub } = req.user as { sub: string };
    const parsed = CreateTaskRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: ErrorCode.VALIDATION, message: '参数校验失败' });
    }
    try {
      // V0 模型路由:默认 mock(开发)/ 火山(生产,有 KEY 时 gateway-setup 决定)
      const model = process.env.TASK_DEFAULT_MODEL ?? 'seedance-2.0-fast';
      const { task, billingKey } = await deps.tasks.create(sub, { ...parsed.data, model });
      await deps.tasks.markQueued(task.id);
      await deps.enqueue(task.id);
      const queued = await deps.tasks.get(sub, task.id);
      void billingKey;
      return reply.code(202).send(queued);
    } catch (e) {
      const err = e as { code?: number; statusCode?: number; message?: string };
      if (err.code === ErrorCode.INSUFFICIENT_CREDITS) {
        return reply.code(402).send({ code: ErrorCode.INSUFFICIENT_CREDITS, message: '积分不足,请充值' });
      }
      throw e;
    }
  });

  app.get<{ Params: { id: string } }>('/v1/tasks/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { sub } = req.user as { sub: string };
    const task = await deps.tasks.get(sub, req.params.id);
    if (!task) return reply.code(404).send({ code: ErrorCode.TASK_NOT_FOUND, message: '任务不存在' });
    return task;
  });

  app.get('/v1/tasks', { preHandler: [requireAuth] }, async (req) => {
    const { sub } = req.user as { sub: string };
    return { tasks: await deps.tasks.list(sub) };
  });

  app.post<{ Params: { id: string } }>(
    '/v1/tasks/:id/cancel',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { sub } = req.user as { sub: string };
      try {
        return await deps.tasks.cancel(sub, req.params.id);
      } catch (e) {
        const err = e as { code?: number };
        if (err.code === ErrorCode.TASK_ILLEGAL_TRANSITION) {
          return reply.code(409).send({ code: ErrorCode.TASK_ILLEGAL_TRANSITION, message: '任务已终态,无法取消' });
        }
        throw e;
      }
    },
  );
}
