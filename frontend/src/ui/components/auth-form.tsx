import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, signup } from "../../lib/api";

type AuthMode = "signup" | "login";

type AuthFormProps = {
  mode: AuthMode;
};

export function AuthForm({ mode }: AuthFormProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (mode === "signup") {
        await signup({ email, password });
        navigate("/create-profile");
      } else {
        await login({ email, password });
        navigate("/browse");
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

        {error ? <p className="form-error">{error}</p> : null}

        <button className="primary-button" type="submit" disabled={isSubmitting}>
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

