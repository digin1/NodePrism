-- AlterTable
ALTER TABLE "servers" ADD COLUMN     "group_id" TEXT;

-- CreateTable
CREATE TABLE "server_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parent_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "server_groups_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "server_groups" ADD CONSTRAINT "server_groups_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "server_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servers" ADD CONSTRAINT "servers_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "server_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

