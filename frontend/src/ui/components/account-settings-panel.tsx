import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  changePassword,
  clearAuthToken,
  deleteAccount,
  fetchSession,
  logout,
} from "../../lib/api";
import {
  canUsePushNotifications,
  disablePushNotifications,
  enablePushNotifications,
  getPushPermissionState,
  getPushAvailabilityMessage,
  isNativeAndroidApp,
} from "../../lib/push";
import {
  clearNativeAppBadgeCount,
  getNativeAppBadgeSupport,
  sendNativeAppBadgeTestNotification,
  setNativeAppBadgeTestCount,
} from "../../lib/app-badge";

const adminStorageKey = "velora-admin-key";
const founderEmail = "elderawi369@gmail.com";

export function AccountSettingsPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const nativeAndroid = isNativeAndroidApp();
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    retry: false,
  });
  const canAccessAdmin =
    sessionQuery.data?.user?.email?.toLowerCase() === founderEmail;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changeMessage, setChangeMessage] = useState("");
  const [changeError, setChangeError] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const [pushError, setPushError] = useState("");
  const [pushPermissionState, setPushPermissionState] = useState("");
  const [badgeSupport, setBadgeSupport] = useState<"" | "checking" | "supported" | "unsupported">("");
  const [badgeMessage, setBadgeMessage] = useState("");
  const [badgeError, setBadgeError] = useState("");
  const [adminKey, setAdminKey] = useState(
    typeof window !== "undefined"
      ? window.localStorage.getItem(adminStorageKey) ?? ""
      : "",
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPermissionState() {
      try {
        const permissionState = await getPushPermissionState();
        if (!cancelled) {
          setPushPermissionState(permissionState);
        }
      } catch {
        if (!cancelled) {
          setPushPermissionState("");
        }
      }
    }

    void loadPermissionState();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void loadPermissionState();
      }
    }

    function handleWindowFocus() {
      void loadPermissionState();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  useEffect(() => {
    if (!nativeAndroid || !canAccessAdmin) {
      return;
    }

    let cancelled = false;

    async function loadBadgeSupport() {
      setBadgeSupport("checking");
      try {
        const supported = await getNativeAppBadgeSupport();
        if (!cancelled) {
          setBadgeSupport(supported ? "supported" : "unsupported");
        }
      } catch {
        if (!cancelled) {
          setBadgeSupport("unsupported");
        }
      }
    }

    void loadBadgeSupport();
    return () => {
      cancelled = true;
    };
  }, [canAccessAdmin, nativeAndroid]);

  const changePasswordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setChangeError("");
      setChangeMessage("Password updated.");
    },
    onError: (error) => {
      setChangeMessage("");
      setChangeError(error instanceof Error ? error.message : "Unable to update password.");
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      clearAuthToken();
      await logout().catch(() => undefined);
      await queryClient.clear();
      navigate("/signup");
    },
    onError: (error) => {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete account.");
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: async () => {
      clearAuthToken();
      await clearNativeAppBadgeCount();
      queryClient.clear();
      navigate("/login");
    },
  });

  const enablePushMutation = useMutation({
    mutationFn: async () => {
      const supported = await canUsePushNotifications();
      if (!supported) {
        throw new Error(
          (await getPushAvailabilityMessage()) ??
            (nativeAndroid
              ? "Native Android notifications are not available on this device yet."
              : "Push notifications are not available on this browser yet."),
        );
      }

      return enablePushNotifications();
    },
    onSuccess: () => {
      setPushError("");
      setPushMessage(
        nativeAndroid
          ? "Native Android notifications enabled for this device."
          : "Push notifications enabled for this browser.",
      );
      setPushPermissionState("granted");
    },
    onError: (error) => {
      setPushMessage("");
      setPushError(error instanceof Error ? error.message : "Unable to enable push notifications.");
      void getPushPermissionState().then(setPushPermissionState).catch(() => undefined);
    },
  });

  const disablePushMutation = useMutation({
    mutationFn: disablePushNotifications,
    onSuccess: () => {
      setPushError("");
      setPushMessage(
        nativeAndroid
          ? "Native Android notifications disabled for this device."
          : "Push notifications disabled for this browser.",
      );
    },
    onError: (error) => {
      setPushMessage("");
      setPushError(error instanceof Error ? error.message : "Unable to disable push notifications.");
    },
  });

  const showAndroidSettingsWarning = nativeAndroid && pushPermissionState === "denied";

  return (
    <section className="panel form-panel">
      <div className="section-copy compact-copy">
        <p className="eyebrow">Account</p>
        <h2>Manage your session, password, and account.</h2>
      </div>

      <section className="panel form-panel settings-subpanel account-session-panel">
        <div>
          <span className="meta-title">Current session</span>
          <p className="status-message">Log out of Velora on this device.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
          {logoutMutation.isPending ? "Logging out..." : "Log out"}
        </button>
      </section>

      {nativeAndroid ? <section className="panel form-panel settings-subpanel account-session-panel">
        <div>
          <span className="meta-title">AI Companion subscription</span>
          <p className="status-message">View your plan or cancel its automatic monthly renewal through Google Play.</p>
        </div>
        <a className="secondary-button" href="https://play.google.com/store/account/subscriptions?package=com.velorachat.app" target="_blank" rel="noreferrer">Manage subscription</a>
      </section> : null}

      <div className="settings-grid">
        <form
          className="panel form-panel settings-subpanel"
          onSubmit={(event) => {
            event.preventDefault();
            setChangeError("");
            setChangeMessage("");
            changePasswordMutation.mutate({ currentPassword, newPassword });
          }}
        >
          <span className="meta-title">Change password</span>
          <label className="field">
            <span>Current password</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              minLength={8}
              required
            />
          </label>
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
              required
            />
          </label>
          {changeError ? <p className="form-error">{changeError}</p> : null}
          {changeMessage ? <p className="success-message">{changeMessage}</p> : null}
          <button className="secondary-button" type="submit" disabled={changePasswordMutation.isPending}>
            {changePasswordMutation.isPending ? "Saving..." : "Update password"}
          </button>
        </form>

        <form
          className="panel form-panel settings-subpanel danger-panel"
          onSubmit={(event) => {
            event.preventDefault();
            setDeleteError("");
            deleteAccountMutation.mutate({
              currentPassword: deletePassword,
              confirmationText: "DELETE",
            });
          }}
        >
          <span className="meta-title">Delete account</span>
          <p className="status-message">
            This removes your profile, messages, boosts, gifts, and account access.
          </p>
          <label className="field">
            <span>Current password</span>
            <input
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              minLength={8}
              required
            />
          </label>
          <label className="field">
            <span>Type DELETE to confirm</span>
            <input
              type="text"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value.toUpperCase())}
              required
            />
          </label>
          {deleteError ? <p className="form-error">{deleteError}</p> : null}
          <button
            className="danger-button"
            type="submit"
            disabled={deleteAccountMutation.isPending || deleteConfirmation !== "DELETE"}
          >
            {deleteAccountMutation.isPending ? "Deleting..." : "Delete account"}
          </button>
        </form>
      </div>

      <div className="settings-grid">
        <section className="panel form-panel settings-subpanel">
          <span className="meta-title">Push notifications</span>
          <p className="status-message">
            {nativeAndroid
              ? "Enable native Android notifications for new messages, gifts, and activity on this device."
              : "Enable browser notifications for new messages, gifts, and activity when Firebase web push is configured."}
          </p>
          {showAndroidSettingsWarning ? (
            <div className="notification-warning">
              Notifications are currently blocked on this Android device. Turn them back on in
              device settings, then return to Velora and tap `Enable notifications` again.
            </div>
          ) : null}
          {pushError ? <p className="form-error">{pushError}</p> : null}
          {pushMessage ? <p className="success-message">{pushMessage}</p> : null}
          <div className="action-row">
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setPushError("");
                setPushMessage("");
                enablePushMutation.mutate();
              }}
              disabled={enablePushMutation.isPending}
            >
              {enablePushMutation.isPending ? "Enabling..." : "Enable notifications"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setPushError("");
                setPushMessage("");
                disablePushMutation.mutate();
              }}
              disabled={disablePushMutation.isPending}
            >
              {disablePushMutation.isPending ? "Disabling..." : "Disable on this device"}
            </button>
          </div>
        </section>

        {canAccessAdmin ? (
          <section className="panel form-panel settings-subpanel">
            <span className="meta-title">Admin access</span>
            <p className="status-message">
              Keep the moderation console hidden from regular navigation, but still reachable when
              you have the admin key.
            </p>
            <label className="field">
              <span>Admin key</span>
              <input
                type="password"
                value={adminKey}
                onChange={(event) => setAdminKey(event.target.value)}
                placeholder="Paste the admin key"
              />
            </label>
            <div className="action-row">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  window.localStorage.setItem(adminStorageKey, adminKey);
                  navigate("/founder-console");
                  window.dispatchEvent(new Event("velora-admin-key-updated"));
                }}
                disabled={!adminKey.trim()}
              >
                Open admin console
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  window.localStorage.removeItem(adminStorageKey);
                  setAdminKey("");
                  window.dispatchEvent(new Event("velora-admin-key-updated"));
                }}
              >
                Clear admin key
              </button>
            </div>
          </section>
        ) : null}

        {canAccessAdmin && nativeAndroid ? (
          <section className="panel form-panel settings-subpanel">
            <span className="meta-title">Android badge test</span>
            <p className="status-message">
              Test whether this phone and launcher can show a numbered Velora app-icon badge.
            </p>
            <div className="chip-row">
              <span className="chip chip-muted">
                Badge support:{" "}
                {badgeSupport === "checking"
                  ? "Checking..."
                  : badgeSupport === "supported"
                    ? "Supported"
                    : badgeSupport === "unsupported"
                      ? "Not supported"
                      : "Unknown"}
              </span>
              <span className="chip chip-muted">
                Notifications: {pushPermissionState || "unknown"}
              </span>
            </div>
            {badgeError ? <p className="form-error">{badgeError}</p> : null}
            {badgeMessage ? <p className="success-message">{badgeMessage}</p> : null}
            <div className="action-row">
              <button
                className="secondary-button"
                type="button"
                onClick={async () => {
                  setBadgeError("");
                  setBadgeMessage("");
                  const result = await sendNativeAppBadgeTestNotification(7);
                  if (!result.supported) {
                    setBadgeError(
                      "Velora could not post the badge test notification. Enable notifications for the app, then try again.",
                    );
                    return;
                  }
                  void setNativeAppBadgeTestCount(7);
                  setBadgeMessage(
                    "Badge test notification sent. Go to the home screen and check whether Velora shows 7.",
                  );
                }}
              >
                Test badge 7
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={async () => {
                  setBadgeError("");
                  setBadgeMessage("");
                  await clearNativeAppBadgeCount();
                  setBadgeMessage("Badge cleared for Velora.");
                }}
              >
                Clear badge
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
