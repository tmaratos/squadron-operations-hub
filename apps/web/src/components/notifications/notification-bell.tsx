"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

// A count on the bell, so a notice is something you see rather than something you have to go looking for.
export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    let live = true;
    const read = async () => {
      try {
        const response = await fetch("/api/notifications");
        if (!response.ok) return;
        const data = (await response.json()) as { unread?: number };
        if (live) setUnread(data.unread ?? 0);
      } catch {
        // An unreachable Hub is already obvious elsewhere; the bell stays quiet about it.
      }
    };
    read();
    const timer = setInterval(read, 60000);
    return () => { live = false; clearInterval(timer); };
  }, [pathname]);

  return (
    <Link href="/notifications" aria-label={unread ? unread + " unread notifications" : "Notifications"} className="cu-bell">
      <style>{bellCss}</style>
      <Bell size={16} />
      {unread ? <span className="cu-bell-count">{unread > 99 ? "99+" : unread}</span> : null}
    </Link>
  );
}

const bellCss = [
  ".cu-bell{position:relative;display:inline-flex}",
  ".cu-bell-count{position:absolute;top:-5px;right:-6px;min-width:15px;height:15px;padding:0 4px;border-radius:999px;background:#d03b3b;color:#fff;font-size:9.5px;font-weight:700;line-height:15px;text-align:center;box-sizing:border-box}"
].join("");
