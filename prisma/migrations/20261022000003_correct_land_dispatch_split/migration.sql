/*
  Correct the initial split migration:
  - No historical order is automatically scheduled. The prior feature was not
    released, so all rows created solely by 20261022000002 are removed.
  - Order "planned" is an ambiguous dispatch concept; use confirmed instead.
  - Match the schema default for dispatch updated_at.
*/

DELETE FROM "land_dispatch_items";

UPDATE "land_orders" SET "status" = 'confirmed' WHERE "status" = 'planned';

ALTER TABLE "land_dispatch_items"
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
