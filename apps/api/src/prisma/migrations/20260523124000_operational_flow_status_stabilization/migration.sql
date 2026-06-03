-- Stabilization for refactored operational flow statuses
-- Adds explicit BOARDED and IN_TRANSIT trip lifecycle states.
ALTER TYPE "TripStatus" ADD VALUE IF NOT EXISTS 'BOARDED';
ALTER TYPE "TripStatus" ADD VALUE IF NOT EXISTS 'IN_TRANSIT';
