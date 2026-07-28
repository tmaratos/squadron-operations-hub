import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";

export function CommunicationsPage() {
  return (
    <div className="page-stack communications-center">
      <PageHeader
        eyebrow="Squadron operations"
        title="Communications Center"
        description="Plan announcements, capture decisions, and turn conversations into accountable Hub work."
      />
      <div className="content-grid content-grid--equal">
        <SectionCard title="Announcements" description="Prepare squadron notices and track their approval before publishing through the appropriate official channel.">
          <div className="record-list">
            <div className="record-row">
              <span className="record-row__marker record-row__marker--info" />
              <div className="record-row__content">
                <strong>Announcement workflow</strong>
                <span>Draft, review, approve, and record publication</span>
                <small>Publishing integrations are not currently enabled</small>
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Communication records" description="Keep important decisions and follow-up work in the Hub instead of relying on chat history.">
          <div className="action-list">
            <div className="action-card">
              <span><strong>Record a decision</strong><small>Capture the decision, owner, date, and supporting context.</small></span>
            </div>
            <div className="action-card">
              <span><strong>Create follow-up work</strong><small>Use Tasks and Suspenses to assign an owner and due date.</small></span>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
