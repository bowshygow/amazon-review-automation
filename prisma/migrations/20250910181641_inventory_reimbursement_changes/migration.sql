-- CreateEnum
CREATE TYPE "InventoryLedgerStatus" AS ENUM ('WAITING', 'CLAIMABLE', 'RESOLVED', 'CLAIMED', 'PAID');

-- CreateTable
CREATE TABLE "inventory_ledger_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "event_date" TIMESTAMP(3) NOT NULL,
    "fnsku" VARCHAR(50) NOT NULL,
    "asin" VARCHAR(20) NOT NULL,
    "sku" VARCHAR(100) NOT NULL,
    "product_title" TEXT NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "reference_id" VARCHAR(100),
    "quantity" INTEGER NOT NULL,
    "fulfillment_center" VARCHAR(20),
    "disposition" VARCHAR(50),
    "reconciled_quantity" INTEGER NOT NULL DEFAULT 0,
    "unreconciled_quantity" INTEGER NOT NULL DEFAULT 0,
    "country" VARCHAR(10) NOT NULL DEFAULT 'US',
    "raw_timestamp" TIMESTAMPTZ NOT NULL,
    "store_id" UUID,
    "status" "InventoryLedgerStatus" NOT NULL DEFAULT 'WAITING',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inventory_ledger_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_inventory_ledger_events_event_date" ON "inventory_ledger_events"("event_date");

-- CreateIndex
CREATE INDEX "idx_inventory_ledger_events_fnsku" ON "inventory_ledger_events"("fnsku");

-- CreateIndex
CREATE INDEX "idx_inventory_ledger_events_asin" ON "inventory_ledger_events"("asin");

-- CreateIndex
CREATE INDEX "idx_inventory_ledger_events_sku" ON "inventory_ledger_events"("sku");

-- CreateIndex
CREATE INDEX "idx_inventory_ledger_events_event_type" ON "inventory_ledger_events"("event_type");

-- CreateIndex
CREATE INDEX "idx_inventory_ledger_events_status" ON "inventory_ledger_events"("status");

-- CreateIndex
CREATE INDEX "idx_inventory_ledger_events_fulfillment_center" ON "inventory_ledger_events"("fulfillment_center");

-- CreateIndex
CREATE INDEX "idx_inventory_ledger_events_unreconciled_quantity" ON "inventory_ledger_events"("unreconciled_quantity");

-- CreateIndex
CREATE INDEX "idx_inventory_ledger_events_raw_timestamp" ON "inventory_ledger_events"("raw_timestamp");

-- CreateIndex
CREATE INDEX "idx_inventory_ledger_events_store_id" ON "inventory_ledger_events"("store_id");

-- CreateIndex
CREATE INDEX "idx_inventory_ledger_events_status_event_date" ON "inventory_ledger_events"("status", "event_date");

-- CreateIndex
CREATE INDEX "idx_inventory_ledger_events_event_type_status" ON "inventory_ledger_events"("event_type", "status");

-- CreateIndex
CREATE INDEX "idx_inventory_ledger_events_fnsku_event_date" ON "inventory_ledger_events"("fnsku", "event_date");
