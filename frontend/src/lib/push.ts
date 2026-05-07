import { initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { firebaseConfig, firebaseWebPushVapidKey, isFirebasePushConfigured } from "../config";
import { registerPushToken, unregisterPushToken } from "./api";

let firebaseAppInitialized = false;

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
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    isFirebasePushConfigured() &&
    (await isSupported())
  );
}

export async function enablePushNotifications() {
  const supported = await canUsePushNotifications();
  if (!supported) {
    throw new Error("Push notifications are not available on this browser yet.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  ensureFirebaseApp();
  const registration = await getServiceWorkerRegistration();
  const messaging = getMessaging();
  const token = await getToken(messaging, {
    vapidKey: firebaseWebPushVapidKey,
    serviceWorkerRegistration: registration,
  });

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
  const supported = await canUsePushNotifications();
  if (!supported || Notification.permission !== "granted") {
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
