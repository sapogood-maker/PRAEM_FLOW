-- Add lightweight import/confirmation lifecycle states for operational MVP
ALTER TYPE "TripStatus" ADD VALUE IF NOT EXISTS 'IMPORTED';
ALTER TYPE "TripStatus" ADD VALUE IF NOT EXISTS 'PENDING_CONFIRMATION';

