import { useState } from "react";
import { useStore } from "@/state/store";
import { DEMO_LOGINS } from "@/services";

// Sign-in modal. Mirrors the original's gate (§4.1): a notice that logins are for
// LSEM staff/volunteers, then the form. Backed by the mock provider's demo
// accounts (any password) — no real credentials.

export function LoginModal() {
  const open = useStore((s) => s.loginOpen);
  const setOpen = useStore((s) => s.setLoginOpen);
  const login = useStore((s) => s.login);
  const authError = useStore((s) => s.authError);

  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!open) return null;

  const close = () => {
    setOpen(false);
    setShowForm(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login(email, password);
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="login-modal" onClick={(e) => e.stopPropagation()}>
        <button className="panel-close" onClick={close} aria-label="Close">×</button>

        {!showForm ? (
          <>
            <h2>Access limited</h2>
            <p className="login-note">
              The case-management features are only available to Legal Services of Eastern
              Missouri (LSEM) staff and volunteers. The public vacancy map is available to
              everyone without signing in.
            </p>
            <button className="login-continue" onClick={() => setShowForm(true)}>
              Continue to login
            </button>
          </>
        ) : (
          <>
            <h2>Sign in</h2>
            <form onSubmit={submit} className="login-form">
              <label>
                Email
                <input type="email" value={email} autoFocus required
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@example.org" />
              </label>
              <label>
                Password
                <input type="password" value={password} required
                  onChange={(e) => setPassword(e.target.value)} placeholder="any password (demo)" />
              </label>
              {authError && <div className="login-error">{authError}</div>}
              <button type="submit" className="login-submit">Sign in</button>
            </form>
            <div className="login-demos">
              <div className="login-demos-title">Demo accounts (any password):</div>
              {DEMO_LOGINS.map((d) => (
                <button key={d.email} type="button" className="login-demo-chip"
                  onClick={() => { setEmail(d.email); setPassword("demo"); }}>
                  {d.email} <span>{d.role}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
