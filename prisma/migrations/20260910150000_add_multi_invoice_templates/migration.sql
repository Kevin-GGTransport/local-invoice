ALTER TABLE "invoice_templates" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "accounting_invoices" ADD COLUMN "invoice_template_id" BIGINT;

WITH latest_active AS (
  SELECT DISTINCT ON (company_id) id, company_id
  FROM invoice_templates
  WHERE status = 'active'
  ORDER BY company_id, updated_at DESC, id DESC
)
UPDATE invoice_templates SET is_default = true
WHERE id IN (SELECT id FROM latest_active);

-- 将存量账单锁定到迁移前各公司当前启用的模版。
-- 若存在异常的多份 active，与旧打印逻辑一致地选 updated_at 最新的一份。
WITH latest_active AS (
  SELECT DISTINCT ON (company_id) id, company_id
  FROM invoice_templates
  WHERE status = 'active'
  ORDER BY company_id, updated_at DESC, id DESC
)
UPDATE accounting_invoices AS invoice
SET invoice_template_id = latest_active.id
FROM companies AS company
JOIN latest_active ON latest_active.company_id = company.id
WHERE invoice.company = company.code
  AND invoice.invoice_template_id IS NULL;

-- 只要公司存在已启用模版，其存量账单就必须已完成回填；否则中止迁移。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM accounting_invoices AS invoice
    JOIN companies AS company ON company.code = invoice.company
    WHERE invoice.invoice_template_id IS NULL
      AND EXISTS (
        SELECT 1 FROM invoice_templates AS template
        WHERE template.company_id = company.id AND template.status = 'active'
      )
  ) THEN
    RAISE EXCEPTION '存在未能锁定已启用模版的历史账单，迁移已取消';
  END IF;
END $$;

CREATE INDEX "idx_invoice_templates_company_default" ON "invoice_templates"("company_id", "is_default");
ALTER TABLE "invoice_templates" ADD CONSTRAINT "ck_invoice_templates_default_is_active"
  CHECK (NOT "is_default" OR "status" = 'active');
CREATE UNIQUE INDEX "uk_invoice_templates_one_default_per_company" ON "invoice_templates"("company_id")
  WHERE "is_default" = true AND "status" = 'active';
CREATE INDEX "idx_accounting_invoices_template" ON "accounting_invoices"("invoice_template_id");
ALTER TABLE "accounting_invoices" ADD CONSTRAINT "accounting_invoices_invoice_template_id_fkey"
  FOREIGN KEY ("invoice_template_id") REFERENCES "invoice_templates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
