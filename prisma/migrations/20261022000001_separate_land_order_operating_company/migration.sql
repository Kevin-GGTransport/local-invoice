/*
 陆运订单的「运营公司」独立于开票公司 companies 表。
  此迁移仅调整陆运订单自身字段，不改变开票账单/开票公司数据。
*/
ALTER TABLE "land_orders" RENAME COLUMN "company_code" TO "operating_company";

ALTER TABLE "land_orders" ALTER COLUMN "operating_company" TYPE VARCHAR(100);

ALTER INDEX "idx_land_orders_company_code" RENAME TO "idx_land_orders_operating_company";
