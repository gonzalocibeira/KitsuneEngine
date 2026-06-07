import React from "react";
import type { AuthenticationService, LoginCredentials } from "./auth";

export function LoginScreen({
  authenticationService,
  onAuthenticated
}: {
  authenticationService: AuthenticationService;
  onAuthenticated: () => void;
}) {
  const [credentials, setCredentials] = React.useState<LoginCredentials>({ username: "", password: "" });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const result = await authenticationService.login(credentials);
      if (result.ok) {
        onAuthenticated();
        return;
      }
      setError(result.message);
    } catch {
      setError("Unable to sign in. Please try again.");
    }
    setSubmitting(false);
  }

  return (
    <main className="login-screen">
      <section className="login-intro" aria-labelledby="tamamo-login-title">
        <div className="login-mark" aria-hidden="true">
          <span />
          <span />
        </div>
        <p className="eyebrow">Kitsune Engine</p>
        <h1 id="tamamo-login-title">Tamamo</h1>
        <p className="login-tagline">Shape worlds. Stage encounters. Build the path ahead.</p>
      </section>

      <section className="login-panel">
        <div>
          <p className="eyebrow">Maker Access</p>
          <h2>Enter the workshop</h2>
          <p>Sign in to continue to your project workspace.</p>
        </div>
        <form className="login-form" onSubmit={login}>
          <label>
            Username
            <input
              autoComplete="username"
              autoFocus
              value={credentials.username}
              onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={credentials.password}
              onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
            />
          </label>
          <button className="primary login-button" disabled={submitting}>
            {submitting ? "Entering..." : "Login"}
          </button>
          {error && <p className="login-error" role="alert">{error}</p>}
        </form>
        <p className="login-note">Preview access accepts any username and password.</p>
      </section>
    </main>
  );
}
