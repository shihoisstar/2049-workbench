import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { ErrorCode, type UploadResult } from '@wb/contracts';

import { requireAuth } from './auth-route-shared';
import type { StorageService } from '../storage';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function registerUploadRoutes(app: FastifyInstance, storage: StorageService) {
  app.post('/v1/uploads', { preHandler: [requireAuth] }, async (req, reply) => {
    const file = await req.file({ limits: { fileSize: MAX_IMAGE_BYTES } });
    if (!file) {
      return reply.code(400).send({ code: ErrorCode.VALIDATION, message: '缺少图片文件(multipart 字段名 file)' });
    }
    if (!ALLOWED.has(file.mimetype)) {
      return reply.code(400).send({ code: ErrorCode.VALIDATION, message: '仅支持 jpg/png/webp' });
    }
    const buf = await file.toBuffer();
    if (buf.length === 0) {
      return reply.code(400).send({ code: ErrorCode.VALIDATION, message: '图片为空' });
    }
    const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const url = await storage.put(`images/${randomUUID()}.${ext}`, buf);
    return reply.code(201).send({ url } satisfies UploadResult);
  });
}
