import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      {
        name: "velora-generate-firebase-sw",
        writeBundle(options) {
          const outDir = typeof options.dir === "string" ? options.dir : "dist";
          const swPath = path.join(outDir, "firebase-messaging-sw.js");
          const content = `
            importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
            importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

            firebase.initializeApp({
              apiKey: ${JSON.stringify(env.VITE_FIREBASE_API_KEY ?? "")},
              authDomain: ${JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN ?? "")},
              projectId: ${JSON.stringify(env.VITE_FIREBASE_PROJECT_ID ?? "")},
              messagingSenderId: ${JSON.stringify(env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "")},
              appId: ${JSON.stringify(env.VITE_FIREBASE_APP_ID ?? "")}
            });

            const messaging = firebase.messaging();

            messaging.onBackgroundMessage((payload) => {
              const title = payload.notification?.title || payload.data?.title || "Velora";
              const body = payload.notification?.body || payload.data?.body || "";
              const link = payload.fcmOptions?.link || payload.data?.link || "/";
              self.registration.showNotification(title, {
                body,
                data: { link },
              });
            });

            self.addEventListener("notificationclick", (event) => {
              event.notification.close();
              const url = event.notification.data?.link || "/";
              event.waitUntil(clients.openWindow(url));
            });
          `;
          fs.writeFileSync(swPath, content);
        },
      },
    ],
    server: {
      port: 5173,
    },
  };
});
