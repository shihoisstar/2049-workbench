-- 充值档位更新(方案 A 拍板 2026-10-05;1 积分=¥0.01,2× 毛利)
-- 执行:psql -U wb -d workbench < ops-credit-packages.sql
UPDATE "credit_packages" SET "label"='入门档', "credits"=990,  "price_cents"=990  WHERE "id"='pkg-60';
UPDATE "credit_packages" SET "label"='标准档', "credits"=5000, "price_cents"=4900, "id"='pkg-49' WHERE "id"='pkg-300';
UPDATE "credit_packages" SET "label"='超值档', "credits"=10000, "price_cents"=9800, "id"='pkg-98' WHERE "id"='pkg-980';
