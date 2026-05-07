import { initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { firebaseConfig, firebaseWebPushVapidKey, isFirebasePushConfigured } from "../config";
import { registerPushToken, unregisterPushToken } from "./api";

let firebaseAppInitialized = false;
const enableTimeoutMs = 15000;

function isIosBrowser() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandaloneDisplayMode() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    // Safari iOS legacy PWA detection
    ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = enableTimeoutMs) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

function ensureFirebaseApp() {
  if (!firebaseAppInitialized) {
    initializeApp(firebaseConfig);
    firebaseAppInitialized = true;
  }
}

async function getServiceWorkerRegistration() {
  await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  return navigator.serviceWorker.ready;
}

export async function canUsePushNotifications() {
  if (typeof window === "undefined") {
    return false;
  }

  if (isIosBrowser() && !isStandaloneDisplayMode()) {
    return false;
  }

  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    isFirebasePushConfigured() &&
    (await isSupported())
  );
}

export async function getPushAvailabilityMessage() {
  if (typeof window === "undefined") {
    return "Push notifications are only available in the browser.";
  }

  if (!isFirebasePushConfigured()) {
    return "Push notifications are not available until Firebase web push is configured.";
  }

  if (isIosBrowser() && !isStandaloneDisplayMode()) {
    return "On iPhone and iPad, install Velora to the home screen first, then enable notifications from the installed app.";
  }

  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "Push notifications are not supported on this browser.";
  }

  const supported = await isSupported();
  if (!supported) {
    return "Push notifications are not supported on this browser.";
  }

  return null;
}

export async function enablePushNotifications() {
  const unavailableMessage = await getPushAvailabilityMessage();
  if (unavailableMessage) {
    throw new Error(unavailableMessage);
  }

  const permission = await withTimeout(
    Notification.requestPermission(),
    "Notification permission did not complete. Check your browser site permissions and try again.",
  );
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  ensureFirebaseApp();
  const registration = await withTimeout(
    getServiceWorkerRegistration(),
    "The browser could not prepare notifications for this site. Refresh and try again.",
  );
  const messaging = getMessaging();
  const token = await withTimeout(
    getToken(messaging, {
      vapidKey: firebaseWebPushVapidKey,
      serviceWorkerRegistration: registration,
    }),
    "The browser took too long to create a push token. Check browser permissions and try again.",
  );

  if (!token) {
    throw new Error("Unable to create a push token for this browser.");
  }

  await registerPushToken({
    token,
    platform: "web",
    deviceLabel: navigator.userAgent.slice(0, 120),
  });

  return token;
}

export async function syncPushNotificationsIfGranted() {
  const unavailableMessage = await getPushAvailabilityMessage();
  if (unavailableMessage || Notification.permission !== "granted") {
    return;
  }

  ensureFirebaseApp();
  const registration = await getServiceWorkerRegistration();
  const messaging = getMessaging();
  const token = await getToken(messaging, {
    vapidKey: firebaseWebPushVapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    return;
  }

  await registerPushToken({
    token,
    platform: "web",
    deviceLabel: navigator.userAgent.slice(0, 120),
  });
}

export async function disablePushNotifications() {
  const supported = await canUsePushNotifications();
  if (!supported) {
    return;
  }

  ensureFirebaseApp();
  const registration = await getServiceWorkerRegistration();
  const messaging = getMessaging();
  const token = await getToken(messaging, {
    vapidKey: firebaseWebPushVapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    return;
  }

  await unregisterPushToken(token);
}
