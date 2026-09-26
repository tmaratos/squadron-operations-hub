import { PageHeader } from "@/components/page-header";
import { FinanceTracker } from "@/components/finance/finance-tracker";
import { requireUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/auth/repository";
import { getWorkspaceTree } from "@/lib/work/structure";
import {
  budgetFor,
  currentFiscalYear,
  fiscalYearsWithActivity,
  listMeetings,
  listObligations,
  listTransactions,
  openingBalance
} from "@/lib/finance/finance";
import { findings, summarise } from "@/lib/finance/findings";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const user = await requireUser();
  const fiscalYear = currentFiscalYear();
  const transactions = await listTransactions(fiscalYear);
  const [budget, meetings, opening, obligations, years, spaces, users] = await Promise.all([
    budgetFor(fiscalYear, transactions),
    listMeetings(fiscalYear),
    openingBalance(fiscalYear),
    listObligations(),
    fiscalYearsWithActivity(),
    getWorkspaceTree().catch(() => []),
    listUsers().catch(() => [])
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Finance"
        title="Finance tracker"
        description="What came in, what went out, and what the unit said it would spend. Not a list of tasks: an entry has an amount, a date, a category and a paper trail, and the questions worth asking of it are arithmetic."
      />
      <FinanceTracker
        initial={{
          fiscalYear,
          transactions,
          budget,
          meetings,
          obligations,
          openingSource: opening?.source ?? null,
          summary: summarise(transactions, budget, fiscalYear, opening?.cents ?? null, obligations),
          findings: findings({ transactions, budget, meetings, fiscalYear, openingCents: opening?.cents ?? null, obligations })
        }}
        years={years}
        canEdit={user.globalRole !== "READ_ONLY"}
        people={users.filter((entry) => entry.status === "APPROVED").map((entry) => ({ userId: entry.id, fullName: entry.fullName }))}
        lists={spaces.flatMap((space) => space.lists.map((list) => ({ id: list.id, name: list.name, spaceName: space.name })))}
      />
    </div>
  );
}
