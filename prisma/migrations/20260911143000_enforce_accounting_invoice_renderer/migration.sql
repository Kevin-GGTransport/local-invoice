ALTER TABLE "accounting_invoices"
ADD CONSTRAINT "accounting_invoices_renderer_key_check"
CHECK ("renderer_key" IS NULL OR "renderer_key" = 'aa_cold_chain'),
ADD CONSTRAINT "accounting_invoices_renderer_company_check"
CHECK ("renderer_key" IS NULL OR "company" = 'AA'),
ADD CONSTRAINT "accounting_invoices_renderer_template_check"
CHECK ("renderer_key" IS NULL OR "invoice_template_id" IS NULL);
