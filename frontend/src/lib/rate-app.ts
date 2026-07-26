import { Capacitor } from "@capacitor/core";

const veloraAndroidPackageName = "com.velorachat.app";
const playStoreWebUrl = `https://play.google.com/store/apps/details?id=${veloraAndroidPackageName}`;
const playStoreIntentUrl = `market://details?id=${veloraAndroidPackageName}`;

export function canPromptForAndroidRating() {
  return Capacitor.getPlatform() === "android" && Capacitor.isNativePlatform();
}

export function openVeloraPlayStoreRating() {
  if (typeof window === "undefined") {
    return;
  }

  if (!canPromptForAndroidRating()) {
    window.open(playStoreWebUrl, "_blank", "noopener,noreferrer");
    return;
  }

  let fallbackTimer = 0;
  const clearFallback = () => {
    if (fallbackTimer) {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = 0;
    }
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      clearFallback();
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  fallbackTimer = window.setTimeout(() => {
    clearFallback();
    window.location.assign(playStoreWebUrl);
  }, 900);

  window.location.assign(playStoreIntentUrl);
}
