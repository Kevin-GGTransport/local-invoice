/*
  Search latency:
  pg_trgm GIN indexes can serve case-insensitive contains searches, including
  leading-wildcard ILIKE patterns used by the quick-search UI. One multicolumn
  GIN index per searched table also lets PostgreSQL combine OR predicates.

  List latency:
  Composite indexes support the common date filters and stable list ordering.
*/

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "idx_accounting_invoices_search_trgm"
ON "accounting_invoices"
USING gin (
  "invoice_number" gin_trgm_ops,
  "master_order_number" gin_trgm_ops,
  "order_number" gin_trgm_ops,
  "broker_load_number" gin_trgm_ops,
  "notes" gin_trgm_ops,
  "bill_to" gin_trgm_ops
);

CREATE INDEX "idx_accounting_invoice_reconciliations_search_trgm"
ON "accounting_invoice_reconciliations"
USING gin ("check_number" gin_trgm_ops);

CREATE INDEX "idx_accounting_invoices_company_invoice_date"
ON "accounting_invoices"("company", "invoice_date");

CREATE INDEX "idx_land_orders_search_trgm"
ON "land_orders"
USING gin (
  "identifier" gin_trgm_ops,
  "operating_company" gin_trgm_ops,
  "load_number" gin_trgm_ops,
  "broker" gin_trgm_ops,
  "dispatch_person" gin_trgm_ops,
  "delivery_person" gin_trgm_ops,
  "note" gin_trgm_ops
);

CREATE INDEX "idx_land_order_stops_search_trgm"
ON "land_order_stops"
USING gin (
  "company_name" gin_trgm_ops,
  "address" gin_trgm_ops,
  "city" gin_trgm_ops,
  "state" gin_trgm_ops,
  "zip_code" gin_trgm_ops,
  "reference_numbers" gin_trgm_ops,
  "stop_note" gin_trgm_ops
);

CREATE INDEX "idx_land_order_stops_type_date_order"
ON "land_order_stops"("stop_type", "stop_date", "land_order_id");

CREATE INDEX "idx_land_dispatch_items_search_trgm"
ON "land_dispatch_items"
USING gin (
  "truck" gin_trgm_ops,
  "driver" gin_trgm_ops,
  "trailer" gin_trgm_ops,
  "todo_note" gin_trgm_ops
);

CREATE INDEX "idx_land_dispatch_items_date_order_id"
ON "land_dispatch_items"("dispatch_date", "sort_order", "id");
