import { useState } from "react";
import { requestPasswordReset } from "../../lib/api";
import { TurnstileWidget } from "../components/turnstile-widget";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const result = await requestPasswordReset({ email, turnstileToken });
      setMessage(result.message);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to request a password reset right now.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="content-section narrow">
      <section className="section-copy">
        <p className="eyebrow">Password recovery</p>
        <h1>Start a secure reset if you can’t get back into the account.</h1>
      </section>

      <form className="panel form-panel" onSubmit={handleSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>

        <p className="form-hint">
          Enter the email on your account and we&apos;ll send a secure reset link if it exists.
        </p>

        <TurnstileWidget onTokenChange={setTurnstileToken} />

        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="success-message">{message}</p> : null}

        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting || !turnstileToken}
        >
          {isSubmitting ? "Submitting..." : "Request password reset"}
        </button>
      </form>
    </main>
  );
}
