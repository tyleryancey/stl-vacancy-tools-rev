import { useEffect, useRef, useState } from "react";
import { useStore } from "@/state/store";
import { DEMO_LOGINS } from "@/services";

// Sign-in modal. Mirrors the original's gate (§4.1): a notice that logins are for
// LSEM staff/volunteers, then the form. Backed by the mock provider's demo
// accounts (any password) — no real credentials.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function LoginModal() {
  const open = useStore((s) => s.loginOpen);
  const setOpen = useStore((s) => s.setLoginOpen);
  const login = useStore((s) => s.login);
  const authError = useStore((s) => s.authError);

  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = "login-modal-title";

  // Focus the dialog on open, restore focus to whatever opened it on close
  // (WAI-ARIA dialog pattern — keeps keyboard/screen-reader users oriented).
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => opener?.focus();
  }, [open]);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    setShowForm(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login(email, password);
  };

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    // Trap Tab/Shift+Tab within the dialog (WAI-ARIA modal dialog pattern).
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="login-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <button className="panel-close" onClick={close} aria-label="Close">×</button>

        {!showForm ? (
          <>
            <h2 id={titleId}>Access limited</h2>
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
            <h2 id={titleId}>Sign in</h2>
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
