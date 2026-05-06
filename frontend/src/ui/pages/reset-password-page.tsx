import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../../lib/api";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialToken = searchParams.get("token") ?? "";
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasLinkToken = Boolean(initialToken);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      await resetPassword({ token, newPassword });
      setMessage("Password reset complete. You can log in with the new password now.");
      setTimeout(() => navigate("/login"), 1000);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to reset the password right now.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="content-section narrow">
      <section className="section-copy">
        <p className="eyebrow">Reset password</p>
        <h1>Set a new password and get back into the account.</h1>
      </section>

      <form className="panel form-panel" onSubmit={handleSubmit}>
        {hasLinkToken ? (
          <p className="form-hint">
            Your secure reset link is ready. Choose a new password below.
          </p>
        ) : (
          <label className="field">
            <span>Reset token</span>
            <input
              type="text"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste the reset token or use the full reset link"
              required
            />
          </label>
        )}

        <label className="field">
          <span>New password</span>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={8}
            placeholder="At least 8 characters"
            required
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="success-message">{message}</p> : null}

        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Set new password"}
        </button>

        <p className="form-hint">
          Back to <Link to="/login">login</Link>
        </p>
      </form>
    </main>
  );
}
