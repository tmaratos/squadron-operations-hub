import { AddressBook } from "@/components/notifications/address-book";
import { AlertComposer } from "@/components/notifications/alert-composer";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { getPrefs, listNotifications } from "@/lib/notify/notifications";
import { listAddresses } from "@/lib/notify/addresses";
import { memberChoice, notificationLevel } from "@/lib/notify/squadron-switch";

export async function NotificationsPage() {
  const user = await requireUser();
  const [notifications, prefs, choice, level] = await Promise.all([
    listNotifications(user.id), getPrefs(user.id), memberChoice(user.id), notificationLevel()
  ]);
  const addresses = user.capid ? await listAddresses(user.capid) : [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Your account"
        title="Notifications"
        description="What the Hub has told you, and what you want to hear about."
      />
      {user.globalRole === "READ_ONLY" ? null : <AlertComposer />}
      <NotificationCenter
        initialNotifications={notifications}
        initialPrefs={prefs}
        addressesOn={addresses.filter((address) => address.notify && address.verified).length}
        initialChoice={choice}
        squadronQuiet={level !== "EVERYTHING"}
      />
      <AddressBook initial={addresses} canManage={Boolean(user.capid)} />
    </div>
  );
}
