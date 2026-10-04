CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"cover_gradient" text NOT NULL,
	"cover_mark" text NOT NULL,
	"heat" text NOT NULL,
	"prompt_template" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
-- seed:模板(T3.2 feed;定价/热度 placeholder,运营随后台扩充)
INSERT INTO "templates" ("id","title","category","cover_gradient","cover_mark","heat","prompt_template","active","sort_order")
VALUES
  ('tpl-001','爆裂口播 · 30 秒快闪','剧情带货','linear-gradient(160deg,#ff4d5e,#7a0619)','快','4.5w','30秒快节奏口播短视频:开场3秒抛出痛点钩子,中段给出3条解决方案,结尾引导点击小黄车。画面节奏快,字幕大而醒目。',true,1),
  ('tpl-002','探店打卡 · 沉浸式','探店视频','linear-gradient(160deg,#9be0e4,#0f5f63)','探','10w','沉浸式探店视频:第一视角走进门店,镜头扫过招牌/环境/招牌菜,配合真实环境音,结尾给出位置标签和优惠信息。',true,2),
  ('tpl-003','产品特写 · 种草向','产品种草','linear-gradient(160deg,#8b7ff0,#31236e)','种','2.3w','产品特写种草视频:微距展示产品细节与使用过程,柔和光线,突出质感,配合简洁字幕说明卖点。',true,3),
  ('tpl-004','节日祝福 · 情绪向','节日热点','linear-gradient(160deg,#ffd28a,#8a4b12)','节','1.8w','节日祝福情绪短片:温暖色调,家庭/朋友聚会场景,慢镜头+抒情配乐,结尾出现节日祝福字幕。',true,4)
ON CONFLICT ("id") DO NOTHING;
