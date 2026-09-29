import { getDatabase } from "@/lib/cloudflare";

// The squadron's vehicles, aircraft and signed-for equipment, and who has them.
//
// Written for the questions somebody is actually asked: where is the van, who had it last, how many miles did
// we put on it in September, is its inspection still current. Each of those is a query here rather than a
// phone call.
//
// The one rule worth stating: a trip is opened and closed, never entered as a total. Two odometer readings can
// be checked against the vehicle and against the previous trip; a mileage figure typed in afterwards is a
// number somebody remembered, and it is the number wing is given.

export type AssetKind = "VEHICLE" | "AIRCRAFT" | "RADIO" | "EQUIPMENT";
export type AssetStatus = "AVAILABLE" | "OUT" | "GROUNDED" | "RETURNED";

export interface AssetBooking {
  id: string;
  memberId: string;
  memberName: string | null;
  purpose: string | null;
  destination: string | null;
  outAt: string;
  odometerOut: number | null;
  backAt: string | null;
  odometerIn: number | null;
  /** Null while the trip is open, because a distance is only known once the vehicle is back. */
  miles: number | null;
}

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  identifier: string | null;
  status: AssetStatus;
  custodianId: string | null;
  custodianName: string | null;
  assignedOn: string | null;
  notes: string | null;
  odometer: number | null;
  registrationExpiresOn: string | null;
  inspectionDueOn: string | null;
  openBooking: AssetBooking | null;
  /** What is about to lapse, said once here so every page phrases it the same way. */
  warnings: string[];
}

const SOON_DAYS = 30;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const then = Date.parse(date);
  if (!Number.isFinite(then)) return null;
  return Math.round((then - Date.parse(today())) / 86_400_000);
}

function warningsFor(row: { kind: string; registration_expires_on: string | null; inspection_due_on: string | null }): string[] {
  const warnings: string[] = [];
  const checks: Array<[string, string | null]> = [
    ["Registration", row.registration_expires_on],
    ["Inspection", row.inspection_due_on]
  ];
  for (const [what, when] of checks) {
    const days = daysUntil(when);
    if (days === null) continue;
    if (days < 0) warnings.push(what + " lapsed " + Math.abs(days) + (Math.abs(days) === 1 ? " day ago" : " days ago"));
    else if (days <= SOON_DAYS) warnings.push(what + " due in " + days + (days === 1 ? " day" : " days"));
  }
  return warnings;
}

export async function listAssets(): Promise<Asset[]> {
  const db = getDatabase();

  const rows = await db
    .prepare(
      "SELECT a.*, m.full_name AS custodian_name FROM squadron_assets a " +
      "LEFT JOIN personnel_members m ON m.id = a.custodian_id " +
      // Retired kit sinks to the bottom rather than vanishing: the history of a van wing took back is still the
      // squadron's answer to a question about last year.
      "ORDER BY CASE a.status WHEN 'RETURNED' THEN 1 ELSE 0 END, a.kind, a.name"
    )
    .all<Record<string, string | number | null>>();

  if (!rows.results.length) return [];

  const open = await db
    .prepare(
      "SELECT b.*, m.full_name AS member_name FROM asset_bookings b " +
      "LEFT JOIN personnel_members m ON m.id = b.member_id WHERE b.back_at IS NULL"
    )
    .all<Record<string, string | number | null>>();

  const openByAsset = new Map<string, AssetBooking>();
  open.results.forEach((row) => {
    openByAsset.set(String(row.asset_id), {
      id: String(row.id),
      memberId: String(row.member_id),
      memberName: row.member_name === null ? null : String(row.member_name),
      purpose: row.purpose === null ? null : String(row.purpose),
      destination: row.destination === null ? null : String(row.destination),
      outAt: String(row.out_at),
      odometerOut: row.odometer_out === null ? null : Number(row.odometer_out),
      backAt: null,
      odometerIn: null,
      miles: null
    });
  });

  return rows.results.map((row) => ({
    id: String(row.id),
    kind: String(row.kind) as AssetKind,
    name: String(row.name),
    identifier: row.identifier === null ? null : String(row.identifier),
    status: String(row.status) as AssetStatus,
    custodianId: row.custodian_id === null ? null : String(row.custodian_id),
    custodianName: row.custodian_name === null ? null : String(row.custodian_name),
    assignedOn: row.assigned_on === null ? null : String(row.assigned_on),
    notes: row.notes === null ? null : String(row.notes),
    odometer: row.odometer === null ? null : Number(row.odometer),
    registrationExpiresOn: row.registration_expires_on === null ? null : String(row.registration_expires_on),
    inspectionDueOn: row.inspection_due_on === null ? null : String(row.inspection_due_on),
    openBooking: openByAsset.get(String(row.id)) ?? null,
    warnings: warningsFor({
      kind: String(row.kind),
      registration_expires_on: row.registration_expires_on === null ? null : String(row.registration_expires_on),
      inspection_due_on: row.inspection_due_on === null ? null : String(row.inspection_due_on)
    })
  }));
}

export async function bookingsFor(assetId: string, limit = 40): Promise<AssetBooking[]> {
  const rows = await getDatabase()
    .prepare(
      "SELECT b.*, m.full_name AS member_name FROM asset_bookings b " +
      "LEFT JOIN personnel_members m ON m.id = b.member_id " +
      "WHERE b.asset_id = ? ORDER BY b.out_at DESC LIMIT ?"
    )
    .bind(assetId, limit)
    .all<Record<string, string | number | null>>();

  return rows.results.map((row) => {
    const out = row.odometer_out === null ? null : Number(row.odometer_out);
    const back = row.odometer_in === null ? null : Number(row.odometer_in);
    return {
      id: String(row.id),
      memberId: String(row.member_id),
      memberName: row.member_name === null ? null : String(row.member_name),
      purpose: row.purpose === null ? null : String(row.purpose),
      destination: row.destination === null ? null : String(row.destination),
      outAt: String(row.out_at),
      odometerOut: out,
      backAt: row.back_at === null ? null : String(row.back_at),
      odometerIn: back,
      miles: out !== null && back !== null && back >= out ? back - out : null
    };
  });
}

export interface AssetResult {
  ok: boolean;
  message: string;
}

export async function saveAsset(input: {
  id?: string;
  kind: AssetKind;
  name: string;
  identifier: string | null;
  custodianId: string | null;
  assignedOn: string | null;
  notes: string | null;
  odometer: number | null;
  registrationExpiresOn: string | null;
  inspectionDueOn: string | null;
}): Promise<AssetResult> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const name = input.name.trim();
  if (!name) return { ok: false, message: "It needs a name." };

  if (input.id) {
    await db
      .prepare(
        "UPDATE squadron_assets SET kind = ?, name = ?, identifier = ?, custodian_id = ?, assigned_on = ?, " +
        "notes = ?, odometer = ?, registration_expires_on = ?, inspection_due_on = ?, updated_at = ? WHERE id = ?"
      )
      .bind(input.kind, name, input.identifier, input.custodianId, input.assignedOn, input.notes,
            input.odometer, input.registrationExpiresOn, input.inspectionDueOn, now, input.id)
      .run();
    return { ok: true, message: name + " has been updated." };
  }

  await db
    .prepare(
      "INSERT INTO squadron_assets (id, kind, name, identifier, status, custodian_id, assigned_on, notes, " +
      "odometer, registration_expires_on, inspection_due_on, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, 'AVAILABLE', ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(crypto.randomUUID(), input.kind, name, input.identifier, input.custodianId, input.assignedOn,
          input.notes, input.odometer, input.registrationExpiresOn, input.inspectionDueOn, now, now)
    .run();

  return { ok: true, message: name + " has been added." };
}

export async function setStatus(assetId: string, status: AssetStatus): Promise<AssetResult> {
  const db = getDatabase();

  // OUT is not a state anybody sets by hand: it is what signing the vehicle out means. Allowing it here would
  // let the board say a van is out with no trip attached, which is exactly the record that helps nobody.
  if (status === "OUT") return { ok: false, message: "Sign it out to a member instead." };

  const open = await db
    .prepare("SELECT id FROM asset_bookings WHERE asset_id = ? AND back_at IS NULL")
    .bind(assetId)
    .first<{ id: string }>();
  if (open) return { ok: false, message: "It is signed out. Book it back in first." };

  await db
    .prepare("UPDATE squadron_assets SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, new Date().toISOString(), assetId)
    .run();

  return { ok: true, message: status === "GROUNDED" ? "Marked unserviceable." : status === "RETURNED" ? "Marked returned to wing." : "Marked available." };
}

export async function signOut(input: {
  assetId: string;
  memberId: string;
  purpose: string | null;
  destination: string | null;
  odometerOut: number | null;
}): Promise<AssetResult> {
  const db = getDatabase();

  const asset = await db
    .prepare("SELECT name, status, odometer FROM squadron_assets WHERE id = ?")
    .bind(input.assetId)
    .first<{ name: string; status: string; odometer: number | null }>();
  if (!asset) return { ok: false, message: "That is not something the squadron holds." };
  if (asset.status === "GROUNDED") return { ok: false, message: asset.name + " is marked unserviceable." };
  if (asset.status === "RETURNED") return { ok: false, message: asset.name + " has gone back to wing." };
  if (asset.status === "OUT") return { ok: false, message: asset.name + " is already signed out." };

  // A reading below the last one is a typo often enough that accepting it would put negative miles in the
  // monthly return, so it is refused with both numbers shown rather than silently corrected.
  if (input.odometerOut !== null && asset.odometer !== null && input.odometerOut < asset.odometer) {
    return {
      ok: false,
      message: "That reading is lower than the last one recorded (" + asset.odometer + "). Check the dashboard."
    };
  }

  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "INSERT INTO asset_bookings (id, asset_id, member_id, purpose, destination, out_at, odometer_out, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(crypto.randomUUID(), input.assetId, input.memberId, input.purpose, input.destination, now,
            input.odometerOut, now, now),
    db.prepare("UPDATE squadron_assets SET status = 'OUT', updated_at = ? WHERE id = ?").bind(now, input.assetId)
  ]);

  return { ok: true, message: asset.name + " is signed out." };
}

export async function bookBack(input: { assetId: string; odometerIn: number | null }): Promise<AssetResult> {
  const db = getDatabase();

  const open = await db
    .prepare("SELECT id, odometer_out FROM asset_bookings WHERE asset_id = ? AND back_at IS NULL")
    .bind(input.assetId)
    .first<{ id: string; odometer_out: number | null }>();
  if (!open) return { ok: false, message: "That is not signed out." };

  if (input.odometerIn !== null && open.odometer_out !== null && input.odometerIn < open.odometer_out) {
    return {
      ok: false,
      message: "That reading is lower than when it went out (" + open.odometer_out + "). Check the dashboard."
    };
  }

  const now = new Date().toISOString();
  const statements = [
    db
      .prepare("UPDATE asset_bookings SET back_at = ?, odometer_in = ?, updated_at = ? WHERE id = ?")
      .bind(now, input.odometerIn, now, open.id),
    db.prepare("UPDATE squadron_assets SET status = 'AVAILABLE', updated_at = ? WHERE id = ?").bind(now, input.assetId)
  ];

  // The asset carries the latest reading so the next sign-out has something to check against, and so the card
  // shows the mileage without reading the whole trip history to find it.
  if (input.odometerIn !== null) {
    statements.push(
      db.prepare("UPDATE squadron_assets SET odometer = ? WHERE id = ?").bind(input.odometerIn, input.assetId)
    );
  }

  await db.batch(statements);

  const miles = input.odometerIn !== null && open.odometer_out !== null ? input.odometerIn - open.odometer_out : null;
  return { ok: true, message: miles === null ? "Booked back in." : "Booked back in. " + miles + (miles === 1 ? " mile" : " miles") + " this trip." };
}

/** Closed trips in a calendar month, which is the shape of the return wing asks for. */
export async function milesInMonth(month: string): Promise<Array<{ assetId: string; name: string; identifier: string | null; miles: number; trips: number }>> {
  const rows = await getDatabase()
    .prepare(
      "SELECT a.id, a.name, a.identifier, COUNT(*) AS trips, " +
      "SUM(b.odometer_in - b.odometer_out) AS miles FROM asset_bookings b " +
      "JOIN squadron_assets a ON a.id = b.asset_id " +
      "WHERE b.back_at IS NOT NULL AND b.odometer_in IS NOT NULL AND b.odometer_out IS NOT NULL " +
      "AND substr(b.back_at, 1, 7) = ? GROUP BY a.id ORDER BY a.name"
    )
    .bind(month)
    .all<{ id: string; name: string; identifier: string | null; trips: number; miles: number }>();

  return rows.results.map((row) => ({
    assetId: row.id,
    name: row.name,
    identifier: row.identifier,
    miles: Number(row.miles ?? 0),
    trips: Number(row.trips ?? 0)
  }));
}

export async function deleteAsset(assetId: string): Promise<AssetResult> {
  const db = getDatabase();
  const trips = await db
    .prepare("SELECT COUNT(*) AS n FROM asset_bookings WHERE asset_id = ?")
    .bind(assetId)
    .first<{ n: number }>();

  // Deleting something with a history would take the mileage record with it, and that record is the unit's
  // answer to wing about a vehicle it no longer has. Marked returned instead, which is what actually happened.
  if ((trips?.n ?? 0) > 0) {
    return { ok: false, message: "It has trips recorded against it. Mark it returned to wing instead, so the history stays." };
  }

  await db.prepare("DELETE FROM squadron_assets WHERE id = ?").bind(assetId).run();
  return { ok: true, message: "Removed." };
}
