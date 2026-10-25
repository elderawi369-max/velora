
            importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
            importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

            firebase.initializeApp({
              apiKey: "",
              authDomain: "",
              projectId: "",
              messagingSenderId: "",
              appId: ""
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
          