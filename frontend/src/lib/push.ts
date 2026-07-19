import { Capacitor } from "@capacitor/core";
import { PushNotifications, type ActionPerformed, type Token } from "@capacitor/push-notifications";
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { firebaseConfig, firebaseWebPushVapidKey, isFirebasePushConfigured } from "../config";
import { registerPushToken, unregisterPushToken } from "./api";

let firebaseAppInitialized = false;
const enableTimeoutMs = 15000;
const nativePushTokenStorageKey = "velora-native-push-token";
const nativePushPromptedStorageKey = "velora-native-push-prompted";
let nativeListenersAttached = false;
let nativeRegistrationWaiters: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

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

export function isNativeAndroidApp() {
  return Capacitor.getPlatform() === "android" && Capacitor.isNativePlatform();
}

export async function getPushPermissionState() {
  if (typeof window === "undefined") {
    return "unsupported" as const;
  }

  if (isNativeAndroidApp()) {
    const permissions = await PushNotifications.checkPermissions();
    return permissions.receive;
  }

  if (!("Notification" in window)) {
    return "unsupported" as const;
  }

  return Notification.permission;
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

function getStoredNativePushToken() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(nativePushTokenStorageKey) ?? "";
}

function saveNativePushToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(nativePushTokenStorageKey, token);
}

function clearStoredNativePushToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(nativePushTokenStorageKey);
}

function hasPromptedForNativePush() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(nativePushPromptedStorageKey) === "true";
}

function markNativePushPrompted() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(nativePushPromptedStorageKey, "true");
}

function rejectNativeRegistrationWaiters(error: Error) {
  for (const waiter of nativeRegistrationWaiters) {
    waiter.reject(error);
  }
  nativeRegistrationWaiters = [];
}

function resolveNativeRegistrationWaiters(token: string) {
  for (const waiter of nativeRegistrationWaiters) {
    waiter.resolve(token);
  }
  nativeRegistrationWaiters = [];
}

function formatNativePushError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unable to enable native Android notifications.";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("firebaseapp") ||
    normalized.includes("default firebaseapp") ||
    normalized.includes("google-services") ||
    normalized.includes("messaging") ||
    normalized.includes("fcm")
  ) {
    return "Native Android notifications are not configured in this build yet. Add the Firebase Android app config and rebuild.";
  }

  if (normalized.includes("service_not_available")) {
    return "Android notification services are not available right now. Make sure Google Play services is up to date and try again.";
  }

  return message;
}

async function ensureNativeAndroidListeners() {
  if (!isNativeAndroidApp() || nativeListenersAttached) {
    return;
  }

  await PushNotifications.addListener("registration", (token: Token) => {
    saveNativePushToken(token.value);
    resolveNativeRegistrationWaiters(token.value);
  });

  await PushNotifications.addListener("registrationError", (error) => {
    rejectNativeRegistrationWaiters(new Error(formatNativePushError(error?.error ?? error)));
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (event: ActionPerformed) => {
    const link = event.notification.data?.link;
    if (typeof window === "undefined" || typeof link !== "string" || !link) {
      return;
    }

    const destination = link.startsWith("http") ? link : `${window.location.origin}${link}`;
    window.location.assign(destination);
  });

  nativeListenersAttached = true;
}

async function getNativeAndroidPushToken(forceRefresh = false) {
  await ensureNativeAndroidListeners();

  if (!forceRefresh) {
    const stored = getStoredNativePushToken();
    if (stored) {
      return stored;
    }
  }

  const existingPermissions = await PushNotifications.checkPermissions();
  let receivePermission = existingPermissions.receive;

  if (receivePermission === "prompt") {
    const requestedPermissions = await PushNotifications.requestPermissions();
    receivePermission = requestedPermissions.receive;
  }

  if (receivePermission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const registration = new Promise<string>((resolve, reject) => {
    nativeRegistrationWaiters.push({ resolve, reject });
  });

  await PushNotifications.register();
  return withTimeout(
    registration,
    "Native Android notification setup took too long. Check Google Play services and try again.",
  );
}

async function getServiceWorkerRegistration() {
  await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  return navigator.serviceWorker.ready;
}

export async function canUsePushNotifications() {
  if (typeof window === "undefined") {
    return false;
  }

  if (isNativeAndroidApp()) {
    return true;
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

  if (isNativeAndroidApp()) {
    return null;
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

  if (isNativeAndroidApp()) {
    const token = await getNativeAndroidPushToken(true);
    await registerPushToken({
      token,
      platform: "android",
      deviceLabel: navigator.userAgent.slice(0, 120),
    });
    return token;
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
  if (isNativeAndroidApp()) {
    try {
      const permissions = await PushNotifications.checkPermissions();
      if (permissions.receive !== "granted") {
        return;
      }

      const token = await getNativeAndroidPushToken();
      if (!token) {
        return;
      }

      await registerPushToken({
        token,
        platform: "android",
        deviceLabel: navigator.userAgent.slice(0, 120),
      });
    } catch {
      return;
    }

    return;
  }

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

export async function ensureNativeAndroidPushPromptedOnce() {
  if (!isNativeAndroidApp()) {
    return;
  }

  const permissions = await PushNotifications.checkPermissions();
  if (permissions.receive === "granted") {
    markNativePushPrompted();
    await syncPushNotificationsIfGranted();
    return;
  }

  if (permissions.receive === "denied" || hasPromptedForNativePush()) {
    return;
  }

  markNativePushPrompted();
  await enablePushNotifications();
}

export async function disablePushNotifications() {
  if (isNativeAndroidApp()) {
    const token = getStoredNativePushToken();
    if (!token) {
      return;
    }

    await unregisterPushToken(token);
    clearStoredNativePushToken();
    return;
  }

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
