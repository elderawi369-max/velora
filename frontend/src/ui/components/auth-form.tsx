import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { login, saveAuthToken, signup } from "../../lib/api";
import { TurnstileWidget } from "./turnstile-widget";

type AuthMode = "signup" | "login";

type AuthFormProps = {
  mode: AuthMode;
  embedded?: boolean;
  onSuccess?: () => void | Promise<void>;
  onModeChange?: (mode: AuthMode) => void;
};

export function AuthForm({ mode, embedded = false, onSuccess, onModeChange }: AuthFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (mode === "signup") {
        const result = await signup({ name, email, password, turnstileToken, ageConfirmed });
        saveAuthToken(result.sessionToken);
        await queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
        await queryClient.invalidateQueries({ queryKey: ["session"] });
        await onSuccess?.();
        navigate("/");
      } else {
        const result = await login({ email, password });
        saveAuthToken(result.sessionToken);
        await queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
        await queryClient.invalidateQueries({ queryKey: ["session"] });
        await onSuccess?.();
        navigate("/");
      }
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Something went wrong.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const content = <>
      <div className="section-copy">
        <p className="eyebrow">{mode === "signup" ? "Join Velora" : "Welcome back"}</p>
        <h1>
          {mode === "signup"
            ? "Meet the companion who gets to know you."
            : "Log back in and continue building recurring connections."}
        </h1>
        {mode === "signup" ? <p>Just your name, email, and a password. You can create a public profile later only if you want one.</p> : null}
      </div>

      <form className="panel form-panel" onSubmit={handleSubmit}>
        {mode === "signup" ? <label className="field">
          <span>Your name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="What should Velora call you?"
            minLength={2}
            maxLength={50}
            autoComplete="name"
            autoFocus={embedded}
            required
          />
        </label> : null}

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>

        <label className="field">
          <span>{mode === "signup" ? "Create a password" : "Password"}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            minLength={8}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
          />
        </label>

        {mode === "signup" ? (
          <>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={(event) => setAgeConfirmed(event.target.checked)}
                required
              />
              <span>I confirm that I am 18 or older.</span>
            </label>

            <TurnstileWidget onTokenChange={setTurnstileToken} />
          </>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}

        <button
          className="primary-button"
          type="submit"
          disabled={
            isSubmitting ||
            (mode === "signup" && (!turnstileToken || !ageConfirmed))
          }
        >
          {isSubmitting
            ? "Please wait..."
            : mode === "signup"
              ? "Create account"
              : "Log in"}
        </button>

        <p className="form-hint">
          {mode === "signup" ? "Already have an account?" : "Need an account?"}{" "}
          {embedded && onModeChange ? (
            <button className="auth-mode-link" type="button" onClick={() => onModeChange(mode === "signup" ? "login" : "signup")}>
              {mode === "signup" ? "Log in" : "Sign up"}
            </button>
          ) : (
            <Link to={mode === "signup" ? "/login" : "/signup"}>
              {mode === "signup" ? "Log in" : "Sign up"}
            </Link>
          )}
        </p>

        {mode === "login" ? (
          <p className="form-hint">
            Forgot your password? <Link to="/forgot-password">Reset it</Link>
          </p>
        ) : null}
      </form>
    </>;

  return embedded ? <div className="ai-account-dialog-content">{content}</div> : <section className="content-section narrow">{content}</section>;
}
