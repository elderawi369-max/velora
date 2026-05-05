import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { changePassword, clearAuthToken, deleteAccount, logout } from "../../lib/api";

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
    </section>
  );
}
