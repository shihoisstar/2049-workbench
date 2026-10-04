import type { FastifyInstance } from 'fastify';
import { asc, eq } from 'drizzle-orm';

import type { Db } from '../db';
import { templates } from '../schema';

export function registerTemplateRoutes(app: FastifyInstance, db: Db) {
  app.get('/v1/templates', async () => {
    const rows = await db
      .select({
        id: templates.id,
        title: templates.title,
        category: templates.category,
        coverGradient: templates.coverGradient,
        coverMark: templates.coverMark,
        heat: templates.heat,
        promptTemplate: templates.promptTemplate,
      })
      .from(templates)
      .where(eq(templates.active, true))
      .orderBy(asc(templates.sortOrder));
    return { templates: rows };
  });
}
