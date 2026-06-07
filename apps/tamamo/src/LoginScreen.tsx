import React from "react";
import { BrandedHomeScreen } from "@kitsune/ui";
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
    <BrandedHomeScreen
      backHref="/"
      title="Tamamo"
      tagline="Shape worlds. Stage encounters. Build the path ahead."
      panelEyebrow="Maker Access"
      panelTitle="Enter the workshop"
      panelDescription="Sign in to continue to your project workspace."
    >
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
        <button className="branded-home-button primary login-button" disabled={submitting}>
          {submitting ? "Entering..." : "Login"}
        </button>
        {error && <p className="login-error" role="alert">{error}</p>}
      </form>
      <p className="branded-home-note">Preview access accepts any username and password.</p>
    </BrandedHomeScreen>
  );
}
