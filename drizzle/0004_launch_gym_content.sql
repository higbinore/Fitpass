-- Phase 0004: demo content fields and original static image paths.
-- Existing gyms receive empty arrays; only the approved launch gym gets the
-- demonstration amenities/equipment and local static image references.
-- No plan or payment rows are changed.
ALTER TABLE public.gyms
  ADD COLUMN amenities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN equipment jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE public.gyms ADD CONSTRAINT gyms_amenities_array_valid CHECK (jsonb_typeof(amenities) = 'array');
--> statement-breakpoint
ALTER TABLE public.gyms ADD CONSTRAINT gyms_equipment_array_valid CHECK (jsonb_typeof(equipment) = 'array');
--> statement-breakpoint
UPDATE public.gyms
SET amenities = '["Air conditioning", "Lockers", "Showers", "Changing rooms", "Free Wi-Fi", "Drinking water station", "Secure parking"]'::jsonb,
    equipment = '["Treadmills", "Stationary bikes", "Rowing machines", "Free weights", "Power racks", "Cable machines", "Leg press", "Bench press stations"]'::jsonb,
    logo_url = '/demo/fitpass-elite-logo.svg',
    facility_photo_urls = '["/demo/fitpass-elite-gym-floor.svg", "/demo/fitpass-elite-free-weights.svg", "/demo/fitpass-elite-cardio.svg"]'::jsonb,
    updated_at = now()
WHERE slug = 'fitpass-elite-fitness-club';
