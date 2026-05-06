import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { changePassword, clearAuthToken, deleteAccount, logout } from "../../lib/api";
import {
  canUsePushNotifications,
  disablePushNotifications,
  enablePushNotifications,
} from "../../lib/push";

const adminStorageKey = "velora-admin-key";

export function AccountSettingsPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changeMessage, setChangeMessage] = useState("");
  const [changeError, setChangeError] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const [pushError, setPushError] = useState("");
  const [adminKey, setAdminKey] = useState(
    typeof window !== "undefined"
      ? window.localStorage.getItem(adminStorageKey) ?? ""
      : "",
  );

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

  const enablePushMutation = useMutation({
    mutationFn: async () => {
      const supported = await canUsePushNotifications();
      if (!supported) {
        throw new Error("Push notifications are not available until Firebase web push is configured.");
      }

      return enablePushNotifications();
    },
    onSuccess: () => {
      setPushError("");
      setPushMessage("Push notifications enabled for this browser.");
    },
    onError: (error) => {
      setPushMessage("");
      setPushError(error instanceof Error ? error.message : "Unable to enable push notifications.");
    },
  });

  const disablePushMutation = useMutation({
    mutationFn: disablePushNotifications,
    onSuccess: () => {
      setPushError("");
      setPushMessage("Push notifications disabled for this browser.");
    },
    onError: (error) => {
      setPushMessage("");
      setPushError(error instanceof Error ? error.message : "Unable to disable push notifications.");
    },
  });

  return (
    <section className="panel form-panel">
      <div className="section-copy compact-copy">
        <p className="eyebrow">Account</p>
        <h2>Update your password or close the account.</h2>
      </div>

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
            Enable real browser notifications for new messages, gifts, and activity when Firebase
            web push is configured.
          </p>
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
                navigate("/admin");
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
      </div>
    </section>
  );
}
