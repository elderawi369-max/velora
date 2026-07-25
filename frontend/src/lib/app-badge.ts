import { Capacitor, registerPlugin } from "@capacitor/core";

type AppBadgePlugin = {
  setCount(options: { count: number }): Promise<{ ok: true; count: number; supported: boolean }>;
  clear(): Promise<{ ok: true; count: 0 }>;
  isSupported(): Promise<{ supported: boolean }>;
};

const AppBadge = registerPlugin<AppBadgePlugin>("AppBadge");

function isNativeAndroidApp() {
  return Capacitor.getPlatform() === "android" && Capacitor.isNativePlatform();
}

export async function syncNativeAppBadgeCount(count: number) {
  if (!isNativeAndroidApp()) {
    return;
  }

  const normalizedCount = Math.max(0, Math.floor(count));

  try {
    if (normalizedCount === 0) {
      await AppBadge.clear();
      return;
    }

    await AppBadge.setCount({ count: normalizedCount });
  } catch {
    return;
  }
}

export async function clearNativeAppBadgeCount() {
  if (!isNativeAndroidApp()) {
    return;
  }

  try {
    await AppBadge.clear();
  } catch {
    return;
  }
}
