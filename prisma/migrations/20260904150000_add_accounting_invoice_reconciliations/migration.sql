CREATE TABLE "accounting_invoice_reconciliations" (
    "id" BIGSERIAL NOT NULL,
    "accounting_invoice_id" BIGINT NOT NULL,
    "request_id" VARCHAR(100) NOT NULL,
    "check_date" DATE NOT NULL,
    "check_amount" DECIMAL(12,2) NOT NULL,
    "check_number" VARCHAR(100) NOT NULL,
    "notes" VARCHAR(500),
    "voided_at" TIMESTAMPTZ(6),
    "voided_by" BIGINT,
    "void_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT,
    "updated_by" BIGINT,

    CONSTRAINT "accounting_invoice_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounting_invoice_reconciliations_request_id_key"
ON "accounting_invoice_reconciliations"("request_id");

CREATE INDEX "idx_reconciliations_invoice_active"
ON "accounting_invoice_reconciliations"("accounting_invoice_id", "voided_at");

CREATE INDEX "idx_reconciliations_check_date"
ON "accounting_invoice_reconciliations"("check_date");

CREATE INDEX "idx_reconciliations_check_number"
ON "accounting_invoice_reconciliations"("check_number");

ALTER TABLE "accounting_invoice_reconciliations"
ADD CONSTRAINT "accounting_invoice_reconciliations_accounting_invoice_id_fkey"
FOREIGN KEY ("accounting_invoice_id") REFERENCES "accounting_invoices"("id")
ON DELETE RESTRICT ON UPDATE NO ACTION;

-- 把旧表中三个字段都完整的记录迁移为首条销账明细。
-- 部分填写的历史异常记录保留在主表，不猜测缺失值。
INSERT INTO "accounting_invoice_reconciliations" (
    "accounting_invoice_id",
    "request_id",
    "check_date",
    "check_amount",
    "check_number",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by"
)
SELECT
    "id",
    'legacy-' || "id"::text,
    "check_date",
    "check_amount",
    "check_number",
    "updated_at",
    "updated_at",
    "updated_by",
    "updated_by"
FROM "accounting_invoices"
WHERE "check_date" IS NOT NULL
  AND "check_amount" IS NOT NULL
  AND NULLIF(BTRIM("check_number"), '') IS NOT NULL;
