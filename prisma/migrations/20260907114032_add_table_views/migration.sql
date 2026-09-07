-- CreateTable
CREATE TABLE "table_views" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "table_key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "config" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "table_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_table_views_user_table" ON "table_views"("user_id", "table_key");

-- CreateIndex
CREATE UNIQUE INDEX "uk_table_views_user_table_name" ON "table_views"("user_id", "table_key", "name");

-- AddForeignKey
ALTER TABLE "table_views" ADD CONSTRAINT "table_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
