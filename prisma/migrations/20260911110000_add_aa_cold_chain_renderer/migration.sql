ALTER TABLE "accounting_invoices"
ADD COLUMN "renderer_key" VARCHAR(50);

ALTER TABLE "accounting_invoice_lines"
ADD COLUMN "service_date" DATE,
ADD COLUMN "pickup_address" VARCHAR(500),
ADD COLUMN "drop_address_1" VARCHAR(500),
ADD COLUMN "drop_address_2" VARCHAR(500),
ADD COLUMN "drop_address_3" VARCHAR(500);
