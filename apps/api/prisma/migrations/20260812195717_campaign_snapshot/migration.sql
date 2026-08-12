/*
  Warnings:

  - Added the required column `snapshotJson` to the `EmailCampaign` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "EmailCampaign" ADD COLUMN     "snapshotJson" JSONB NOT NULL;
