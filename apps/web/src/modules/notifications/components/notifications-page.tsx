import { AlertComposer } from "@/components/notifications/alert-composer";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { getPrefs, listNotifications } from "@/lib/notify/notifications";

export async function NotificationsPage() {
  const user = await requireUser();
  const [notifications, prefs] = await Promise.all([listNotifications(user.id), getPrefs(user.id)]);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Your account"
        title="Notifications"
        description="What the Hub has told you, and what you want to hear about."
      />
      {user.globalRole === "READ_ONLY" ? null : <AlertComposer />}
      <NotificationCenter initialNotifications={notifications} initialPrefs={prefs} emailAddress={user.email} />
    </div>
  );
}
