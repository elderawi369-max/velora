import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { login, saveAuthToken, signup } from "../../lib/api";
import { TurnstileWidget } from "./turnstile-widget";

type AuthMode = "signup" | "login";

type AuthFormProps = {
  mode: AuthMode;
};

export function AuthForm({ mode }: AuthFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
        const result = await signup({ email, password, turnstileToken, ageConfirmed });
        saveAuthToken(result.sessionToken);
        await queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
        await queryClient.invalidateQueries({ queryKey: ["session"] });
        navigate("/create-profile");
      } else {
        const result = await login({ email, password });
        saveAuthToken(result.sessionToken);
        await queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
        await queryClient.invalidateQueries({ queryKey: ["session"] });
        navigate(result.hasProfile ? "/my-profile" : "/create-profile");
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

  return (
    <section className="content-section narrow">
      <div className="section-copy">
        <p className="eyebrow">{mode === "signup" ? "Join Velora" : "Welcome back"}</p>
        <h1>
          {mode === "signup"
            ? "Create your account and shape your chat identity."
            : "Log back in and continue building recurring connections."}
        </h1>
      </div>

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

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            minLength={8}
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
          <Link to={mode === "signup" ? "/login" : "/signup"}>
            {mode === "signup" ? "Log in" : "Sign up"}
          </Link>
        </p>
      </form>
    </section>
  );
}
