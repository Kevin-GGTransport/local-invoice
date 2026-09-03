-- Add TONU status to accounting invoices; existing records default to false.
ALTER TABLE "accounting_invoices"
ADD COLUMN "tonu" BOOLEAN NOT NULL DEFAULT false;
