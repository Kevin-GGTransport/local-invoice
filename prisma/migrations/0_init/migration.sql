-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "accounting_invoice_lines" (
    "id" BIGSERIAL NOT NULL,
    "accounting_invoice_id" BIGINT NOT NULL,
    "description" VARCHAR(500),
    "quantity" DECIMAL(12,2),
    "unit_price" DECIMAL(12,2),
    "amount" DECIMAL(12,2),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_invoices" (
    "id" BIGSERIAL NOT NULL,
    "company" VARCHAR(20) NOT NULL,
    "master_order_number" VARCHAR(100),
    "order_number" VARCHAR(100),
    "contract_date" DATE,
    "contract_price" DECIMAL(12,2),
    "broker_company" VARCHAR(200),
    "broker_load_number" VARCHAR(100),
    "from_to" VARCHAR(50),
    "invoice_number" VARCHAR(50) NOT NULL,
    "invoice_date" DATE,
    "invoice_price" DECIMAL(12,2),
    "check_date" DATE,
    "check_amount" DECIMAL(12,2),
    "check_number" VARCHAR(100),
    "deduction" VARCHAR(200),
    "rts" VARCHAR(200),
    "difference" VARCHAR(200),
    "notes" TEXT,
    "bill_to" VARCHAR(200),
    "description" TEXT,
    "quantity" DECIMAL(12,2),
    "unit_price" DECIMAL(12,2),
    "pickup_date" DATE,
    "pickup_company" VARCHAR(200),
    "pickup_address" VARCHAR(300),
    "drop_date" DATE,
    "drop_company" VARCHAR(200),
    "drop_address" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT,
    "updated_by" BIGINT,

    CONSTRAINT "accounting_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_accounting_invoice_lines_invoice" ON "accounting_invoice_lines"("accounting_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_invoices_invoice_number_key" ON "accounting_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "idx_accounting_invoices_check_date" ON "accounting_invoices"("check_date");

-- CreateIndex
CREATE INDEX "idx_accounting_invoices_company" ON "accounting_invoices"("company");

-- CreateIndex
CREATE INDEX "idx_accounting_invoices_invoice_date" ON "accounting_invoices"("invoice_date");

-- AddForeignKey
ALTER TABLE "accounting_invoice_lines" ADD CONSTRAINT "accounting_invoice_lines_accounting_invoice_id_fkey" FOREIGN KEY ("accounting_invoice_id") REFERENCES "accounting_invoices"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

