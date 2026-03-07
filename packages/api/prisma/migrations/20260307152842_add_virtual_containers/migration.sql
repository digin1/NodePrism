-- CreateTable
CREATE TABLE "virtual_containers" (
    "id" TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "ip_address" TEXT,
    "hostname" TEXT,
    "network_rx_bytes" BIGINT NOT NULL DEFAULT 0,
    "network_tx_bytes" BIGINT NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "last_seen" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "virtual_containers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "virtual_containers_server_id_idx" ON "virtual_containers"("server_id");

-- CreateIndex
CREATE UNIQUE INDEX "virtual_containers_server_id_container_id_key" ON "virtual_containers"("server_id", "container_id");

-- AddForeignKey
ALTER TABLE "virtual_containers" ADD CONSTRAINT "virtual_containers_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
