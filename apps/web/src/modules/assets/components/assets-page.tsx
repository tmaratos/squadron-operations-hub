import { AssetBoard, type BoardMember } from "@/components/assets/asset-board";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { listAssets, milesInMonth } from "@/lib/assets/assets";
import { getDatabase } from "@/lib/cloudflare";

export async function AssetsPage() {
  const user = await requireUser();
  const month = new Date().toISOString().slice(0, 7);

  const [assets, members, miles] = await Promise.all([
    listAssets(),
    getDatabase()
      .prepare(
        "SELECT id, rank, full_name FROM personnel_members WHERE status = 'ACTIVE' ORDER BY full_name COLLATE NOCASE"
      )
      .all<{ id: string; rank: string | null; full_name: string }>(),
    milesInMonth(month)
  ]);

  const board: BoardMember[] = members.results.map((row) => ({
    id: row.id,
    name: [row.rank, row.full_name].filter(Boolean).join(" ")
  }));

  // The member's own personnel row, so the sign-out box opens with them already chosen. Most sign-outs are the
  // person standing at the keyboard, and the ones that are not are a dropdown away.
  const mine = user.capid
    ? await getDatabase().prepare("SELECT id FROM personnel_members WHERE capid = ?").bind(user.capid).first<{ id: string }>()
    : null;

  const totalMiles = miles.reduce((sum, row) => sum + row.miles, 0);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Squadron"
        title="Vehicles and equipment"
        description="What the squadron has been trusted with, who has it, and what is coming due."
      />

      {totalMiles > 0 ? (
        <p className="ap-miles">
          <strong>{totalMiles.toLocaleString()} miles</strong> this month across{" "}
          {miles.reduce((sum, row) => sum + row.trips, 0)} completed trips
          {miles.length > 1 ? " on " + miles.length + " vehicles" : ""}.
          <span> This is the figure a monthly return asks for, and it is the sum of odometer readings rather than anything typed in afterwards.</span>
        </p>
      ) : null}

      <AssetBoard
        initial={assets}
        members={board}
        canManage={user.globalRole === "SYSTEM_OWNER" || user.globalRole === "ADMINISTRATOR" || user.globalRole === "STAFF_MEMBER"}
        me={mine?.id ?? null}
      />

      <style>{".ap-miles{margin:0;font-size:13.5px;line-height:1.6;padding:11px 14px;border-radius:10px;background:rgba(123,104,238,.1);max-width:80ch}.ap-miles span{display:block;margin-top:3px;color:var(--cu-muted,#656f7d);font-size:12.5px}"}</style>
    </div>
  );
}
