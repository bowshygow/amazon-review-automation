create extension if not exists "uuid-ossp";

-- CreateTable
CREATE TABLE "amazon_orders" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "amazon_order_id" VARCHAR(255) NOT NULL,
    "purchase_date" TIMESTAMPTZ(6) NOT NULL,
    "delivery_date" TIMESTAMPTZ(6),
    "order_status" VARCHAR(50) NOT NULL DEFAULT 'Shipped',
    "order_total" JSONB NOT NULL,
    "marketplace_id" VARCHAR(50) NOT NULL,
    "buyer_info" JSONB DEFAULT '{}',
    "items" JSONB DEFAULT '[]',
    "is_returned" BOOLEAN DEFAULT false,
    "return_date" TIMESTAMPTZ(6),
    "review_request_sent" BOOLEAN DEFAULT false,
    "review_request_date" TIMESTAMPTZ(6),
    "review_request_status" VARCHAR(50),
    "review_request_error" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amazon_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "order_id" UUID NOT NULL,
    "amazon_order_id" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "retry_count" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amazon_api_config" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "client_id" VARCHAR(255) NOT NULL,
    "client_secret" VARCHAR(255) NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "marketplace_id" VARCHAR(50) NOT NULL,
    "access_token" TEXT,
    "token_expires_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amazon_api_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "action" VARCHAR(100) NOT NULL,
    "details" JSONB DEFAULT '{}',
    "order_id" UUID,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "amazon_orders_amazon_order_id_key" ON "amazon_orders"("amazon_order_id");

-- CreateIndex
CREATE INDEX "idx_amazon_orders_amazon_order_id" ON "amazon_orders"("amazon_order_id");

-- CreateIndex
CREATE INDEX "idx_amazon_orders_delivery_date" ON "amazon_orders"("delivery_date");

-- CreateIndex
CREATE INDEX "idx_amazon_orders_review_request_sent" ON "amazon_orders"("review_request_sent");

-- CreateIndex
CREATE INDEX "idx_amazon_orders_is_returned" ON "amazon_orders"("is_returned");

-- CreateIndex
CREATE INDEX "idx_amazon_orders_order_status" ON "amazon_orders"("order_status");

-- CreateIndex
CREATE INDEX "idx_amazon_orders_marketplace_id" ON "amazon_orders"("marketplace_id");

-- CreateIndex
CREATE INDEX "idx_review_requests_order_id" ON "review_requests"("order_id");

-- CreateIndex
CREATE INDEX "idx_review_requests_amazon_order_id" ON "review_requests"("amazon_order_id");

-- CreateIndex
CREATE INDEX "idx_review_requests_status" ON "review_requests"("status");

-- CreateIndex
CREATE INDEX "idx_review_requests_created_at" ON "review_requests"("created_at");

-- CreateIndex
CREATE INDEX "idx_activity_logs_action" ON "activity_logs"("action");

-- CreateIndex
CREATE INDEX "idx_activity_logs_order_id" ON "activity_logs"("order_id");

-- CreateIndex
CREATE INDEX "idx_activity_logs_created_at" ON "activity_logs"("created_at");

-- AddForeignKey
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "amazon_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "amazon_orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

