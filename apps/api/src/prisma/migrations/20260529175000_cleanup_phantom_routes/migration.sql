-- Cleanup phantom routes: routes that were created without any patient (Trip) records.
-- These records should never have existed and are safe to remove.
-- Dependent optional FK columns are nulled out first to avoid constraint violations.

-- Null routeId in OperationalTimeline for phantom routes
UPDATE "OperationalTimeline"
SET "routeId" = NULL
WHERE "routeId" IN (
  SELECT r.id FROM "Route" r
  WHERE NOT EXISTS (SELECT 1 FROM "Trip" t WHERE t."routeId" = r.id)
);

-- Null routeId in OperationEvent for phantom routes
UPDATE "OperationEvent"
SET "routeId" = NULL
WHERE "routeId" IN (
  SELECT r.id FROM "Route" r
  WHERE NOT EXISTS (SELECT 1 FROM "Trip" t WHERE t."routeId" = r.id)
);

-- Null routeId in WhatsappLog for phantom routes
UPDATE "WhatsappLog"
SET "routeId" = NULL
WHERE "routeId" IN (
  SELECT r.id FROM "Route" r
  WHERE NOT EXISTS (SELECT 1 FROM "Trip" t WHERE t."routeId" = r.id)
);

-- Null routeId in VehicleTracking for phantom routes
UPDATE "VehicleTracking"
SET "routeId" = NULL
WHERE "routeId" IN (
  SELECT r.id FROM "Route" r
  WHERE NOT EXISTS (SELECT 1 FROM "Trip" t WHERE t."routeId" = r.id)
);

-- Null routeId in GeoFenceEvent for phantom routes
UPDATE "GeoFenceEvent"
SET "routeId" = NULL
WHERE "routeId" IN (
  SELECT r.id FROM "Route" r
  WHERE NOT EXISTS (SELECT 1 FROM "Trip" t WHERE t."routeId" = r.id)
);

-- Delete phantom routes (no Trip records)
DELETE FROM "Route"
WHERE NOT EXISTS (
  SELECT 1 FROM "Trip" t WHERE t."routeId" = "Route".id
);
