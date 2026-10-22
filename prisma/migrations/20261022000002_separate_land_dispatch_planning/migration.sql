/*
  Split dispatch planning from land orders. Existing scheduling values are preserved
  as dispatch items before the order columns are removed.
*/

-- CreateTable
CREATE TABLE "land_dispatch_items" (
    "id" BIGSERIAL NOT NULL,
    "land_order_id" BIGINT NOT NULL,
    "dispatch_date" DATE NOT NULL,
    "truck" VARCHAR(50),
    "driver" VARCHAR(100),
    "trailer" VARCHAR(100),
    "haul_type" VARCHAR(20) NOT NULL DEFAULT 'long_haul',
    "status" VARCHAR(20) NOT NULL DEFAULT 'planned',
    "todo_note" VARCHAR(500),
    "todo_done" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" BIGINT,
    "updated_by" BIGINT,

    CONSTRAINT "land_dispatch_items_pkey" PRIMARY KEY ("id")
);

INSERT INTO "land_dispatch_items" (
    "land_order_id", "dispatch_date", "truck", "driver", "trailer",
    "haul_type", "status", "todo_note", "todo_done", "sort_order", "updated_at"
)
SELECT
    o."id",
    COALESCE(
      (SELECT MIN(s."stop_date") FROM "land_order_stops" s WHERE s."land_order_id" = o."id"),
      o."created_at"::date
    ),
    o."identifier",
    o."driver",
    o."trailer",
    o."haul_type",
    'planned',
    o."todo_note",
    o."todo_done",
    ROW_NUMBER() OVER (ORDER BY o."id"),
    CURRENT_TIMESTAMP
FROM "land_orders" o;

CREATE UNIQUE INDEX "land_dispatch_items_land_order_id_key" ON "land_dispatch_items"("land_order_id");
CREATE INDEX "idx_land_dispatch_items_date" ON "land_dispatch_items"("dispatch_date");
CREATE INDEX "idx_land_dispatch_items_truck" ON "land_dispatch_items"("truck");
CREATE INDEX "idx_land_dispatch_items_driver" ON "land_dispatch_items"("driver");
CREATE INDEX "idx_land_dispatch_items_status" ON "land_dispatch_items"("status");
CREATE INDEX "idx_land_dispatch_items_haul_type" ON "land_dispatch_items"("haul_type");

ALTER TABLE "land_dispatch_items" ADD CONSTRAINT "land_dispatch_items_land_order_id_fkey" FOREIGN KEY ("land_order_id") REFERENCES "land_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "land_orders" DROP COLUMN IF EXISTS "haul_type";
ALTER TABLE "land_orders" DROP COLUMN IF EXISTS "driver";
ALTER TABLE "land_orders" DROP COLUMN IF EXISTS "trailer";
ALTER TABLE "land_orders" DROP COLUMN IF EXISTS "todo_note";
ALTER TABLE "land_orders" DROP COLUMN IF EXISTS "todo_done";
