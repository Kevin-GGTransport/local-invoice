-- Land transportation orders and ordered pickup/drop stops.
CREATE TABLE "land_orders" (
    "id" BIGSERIAL NOT NULL,
    "identifier" VARCHAR(50),
    "company_code" VARCHAR(20) NOT NULL,
    "dispatch_person" VARCHAR(100),
    "broker" VARCHAR(100),
    "load_number" VARCHAR(100),
    "quantity" DECIMAL(10,2),
    "pallet_positions" DECIMAL(10,2),
    "weight_lbs" DECIMAL(12,2),
    "price" DECIMAL(12,2),
    "load_type" VARCHAR(20) NOT NULL DEFAULT 'full',
    "haul_type" VARCHAR(20) NOT NULL DEFAULT 'local',
    "driver" VARCHAR(100),
    "trailer" VARCHAR(100),
    "delivery_person" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "note" VARCHAR(500),
    "todo_note" VARCHAR(500),
    "todo_done" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" BIGINT,
    "updated_by" BIGINT,

    CONSTRAINT "land_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "land_order_stops" (
    "id" BIGSERIAL NOT NULL,
    "land_order_id" BIGINT NOT NULL,
    "stop_type" VARCHAR(10) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "company_name" VARCHAR(200) NOT NULL,
    "address" VARCHAR(500),
    "city" VARCHAR(100) NOT NULL,
    "state" VARCHAR(50) NOT NULL,
    "zip_code" VARCHAR(20),
    "stop_date" DATE NOT NULL,
    "time_from" VARCHAR(5),
    "time_to" VARCHAR(5),
    "time_type" VARCHAR(30) DEFAULT 'FCFS',
    "reference_numbers" VARCHAR(500),
    "stop_note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "land_order_stops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_land_orders_company_code" ON "land_orders"("company_code");
CREATE INDEX "idx_land_orders_status" ON "land_orders"("status");
CREATE INDEX "idx_land_orders_created_at" ON "land_orders"("created_at");
CREATE INDEX "idx_land_orders_driver" ON "land_orders"("driver");
CREATE INDEX "idx_land_orders_identifier" ON "land_orders"("identifier");
CREATE UNIQUE INDEX "uk_land_order_stops_order_sequence" ON "land_order_stops"("land_order_id", "sequence");
CREATE INDEX "idx_land_order_stops_order_type" ON "land_order_stops"("land_order_id", "stop_type");
CREATE INDEX "idx_land_order_stops_date" ON "land_order_stops"("stop_date");

-- AddForeignKey
ALTER TABLE "land_order_stops" ADD CONSTRAINT "land_order_stops_land_order_id_fkey" FOREIGN KEY ("land_order_id") REFERENCES "land_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
