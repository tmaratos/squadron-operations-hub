-- What the squadron has been trusted with, and who has it right now.
--
-- A corporate vehicle is not the squadron's property. It is wing's, lent to the unit on the understanding that
-- the unit can account for it: who drove it, how far, when it was serviced, whether its inspection is current.
-- A unit that cannot answer those questions loses the van, and the honest reason it usually cannot is that the
-- answers lived in one person's phone.
--
-- Nothing here comes from CAPWATCH. The member extract is people and their records - sixty-three tables of
-- membership, duty positions, courses and qualifications, and not one row about a vehicle. Vehicles live in
-- ORMS, which has no extract of its own, so this is the squadron's own book and is kept by hand. The sync now
-- writes down which tables it actually received (migration 0056), so that stays checkable rather than being
-- something somebody remembers being told.

CREATE TABLE IF NOT EXISTS squadron_assets (
  id TEXT PRIMARY KEY,

  -- VEHICLE:   a corporate van, truck or trailer
  -- AIRCRAFT:  assigned aircraft, listed so flights can be booked against it
  -- RADIO:     communications equipment on the unit's property record
  -- EQUIPMENT: anything else signed for - ground team gear, a generator, a projector
  kind TEXT NOT NULL CHECK (kind IN ('VEHICLE', 'AIRCRAFT', 'RADIO', 'EQUIPMENT')),

  name TEXT NOT NULL,
  -- CAP's own number for it: the vehicle number, the tail number, the property tag. What an outside form asks for.
  identifier TEXT,

  -- AVAILABLE:  ready to be booked
  -- OUT:        signed out by somebody right now
  -- GROUNDED:   present but not to be used - unserviceable, inspection lapsed, awaiting parts
  -- RETURNED:   gone back to wing, kept for the history rather than deleted
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'OUT', 'GROUNDED', 'RETURNED')),

  -- The member answerable for it. Wing asks this by name, so the Hub holds it rather than implying it from
  -- whoever last drove.
  custodian_id TEXT,

  assigned_on TEXT,
  notes TEXT,

  -- Vehicle particulars. Null for anything that is not one, rather than a second table for four columns.
  odometer INTEGER,
  registration_expires_on TEXT,
  inspection_due_on TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS squadron_assets_kind ON squadron_assets(kind, status);
-- Asked as "what is lapsing", so the two dates that expire are worth finding without a scan.
CREATE INDEX IF NOT EXISTS squadron_assets_due ON squadron_assets(inspection_due_on);

-- One trip. Open when it is signed out, closed when it comes back.
--
-- The mileage report wing wants is the sum of closed rows over a month, which is why the odometer is recorded
-- at both ends rather than only the total being typed in: a total can be guessed, two readings can be checked
-- against the vehicle and against each other.
CREATE TABLE IF NOT EXISTS asset_bookings (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  member_id TEXT NOT NULL,

  purpose TEXT,
  destination TEXT,

  out_at TEXT NOT NULL,
  odometer_out INTEGER,
  back_at TEXT,
  odometer_in INTEGER,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS asset_bookings_asset ON asset_bookings(asset_id, out_at DESC);
-- An asset can have only one trip open at a time, and this is what makes that true rather than hoped for.
CREATE UNIQUE INDEX IF NOT EXISTS asset_bookings_open ON asset_bookings(asset_id) WHERE back_at IS NULL;
