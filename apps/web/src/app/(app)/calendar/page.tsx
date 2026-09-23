import { CalendarPage } from "@/modules/calendar";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const offset = Number(m);
  return <CalendarPage monthOffset={Number.isFinite(offset) ? Math.max(-24, Math.min(24, offset)) : 0} />;
}
