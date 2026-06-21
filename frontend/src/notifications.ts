const TAG = "shortforge-stage";

export function canUseNotifications(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!canUseNotifications()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/**
 * Show a system notification (works when the tab/window is in the background).
 */
export function notifyStageReady(title: string, body: string): void {
  if (!canUseNotifications() || Notification.permission !== "granted") return;

  try {
    const notification = new Notification(title, {
      body,
      icon: "/vite.svg",
      tag: TAG,
      requireInteraction: false,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    setTimeout(() => notification.close(), 12000);
  } catch {
    /* ignore — some browsers block without permission */
  }
}

export function notifyStageFailed(title: string, body: string): void {
  notifyStageReady(title, body);
}
