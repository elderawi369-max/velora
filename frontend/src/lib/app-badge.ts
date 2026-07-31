import { Capacitor, registerPlugin } from "@capacitor/core";

type AppBadgePlugin = {
  setCount(options: { count: number }): Promise<{ ok: true; count: number; supported: boolean }>;
  clear(): Promise<{ ok: true; count: 0 }>;
  isSupported(): Promise<{ supported: boolean }>;
  testNotification(options: { count: number }): Promise<{ ok: true; count: number; supported: boolean }>;
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

export async function getNativeAppBadgeSupport() {
  if (!isNativeAndroidApp()) {
    return false;
  }

  try {
    const result = await AppBadge.isSupported();
    return Boolean(result.supported);
  } catch {
    return false;
  }
}

export async function setNativeAppBadgeTestCount(count: number) {
  if (!isNativeAndroidApp()) {
    return { supported: false };
  }

  const normalizedCount = Math.max(0, Math.floor(count));

  try {
    const result =
      normalizedCount === 0
        ? await AppBadge.clear().then(() => ({ supported: true }))
        : await AppBadge.setCount({ count: normalizedCount });
    return { supported: Boolean(result.supported ?? true) };
  } catch {
    return { supported: false };
  }
}

export async function sendNativeAppBadgeTestNotification(count: number) {
  if (!isNativeAndroidApp()) {
    return { supported: false };
  }

  const normalizedCount = Math.max(1, Math.floor(count));

  try {
    const result = await AppBadge.testNotification({ count: normalizedCount });
    return { supported: Boolean(result.supported ?? true) };
  } catch {
    return { supported: false };
  }
}
