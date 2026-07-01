import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const hash = window.location.hash;
    const m = hash.match(/session_id=([^&]+)/);
    if (!m) { navigate("/login"); return; }
    const session_id = m[1];
    (async () => {
      try {
      const r = await api.post("/auth/session", { session_id });
      window.localStorage.setItem("review_io_last_email", r.data.user.email);
      // Refresh via /auth/me so is_admin + plan_until are populated (fixes admin link visibility)
      await refresh();
        const next = window.sessionStorage.getItem("post_login_redirect");
        window.sessionStorage.removeItem("post_login_redirect");
        const dest = next && next.startsWith("/") ? next : "/dashboard";
        window.history.replaceState(null, "", dest);
        navigate(dest, { replace: true });
      } catch (e) {
        navigate("/login", { replace: true });
      }
    })();
  }, [navigate, refresh]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-text-secondary font-mono text-sm" data-testid="auth-callback-loading">Authenticating…</div>
    </div>
  );
}
