-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'queued', 'delivering', 'retrying', 'delivered', 'dlq');

-- CreateTable
CREATE TABLE "endpoints" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "description" TEXT,
    "event_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "rate_limit_per_second" INTEGER NOT NULL DEFAULT 25,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_raw" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "endpoint_id" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lock_token" TEXT,
    "locked_until" TIMESTAMP(3),
    "last_status_code" INTEGER,
    "last_error" TEXT,
    "last_duration_ms" INTEGER,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status_code" INTEGER,
    "error" VARCHAR(500),
    "duration_ms" INTEGER NOT NULL,
    "response_snippet" VARCHAR(600),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "endpoints_active_idx" ON "endpoints"("active");

-- CreateIndex
CREATE UNIQUE INDEX "events_idempotency_key_key" ON "events"("idempotency_key");

-- CreateIndex
CREATE INDEX "events_created_at_idx" ON "events"("created_at");

-- CreateIndex
CREATE INDEX "deliveries_status_next_attempt_at_idx" ON "deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "deliveries_endpoint_id_idx" ON "deliveries"("endpoint_id");

-- CreateIndex
CREATE INDEX "deliveries_created_at_idx" ON "deliveries"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_event_id_endpoint_id_key" ON "deliveries"("event_id", "endpoint_id");

-- CreateIndex
CREATE INDEX "attempts_delivery_id_created_at_idx" ON "attempts"("delivery_id", "created_at");

-- CreateIndex
CREATE INDEX "attempts_created_at_idx" ON "attempts"("created_at");

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "endpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
