import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
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
      setUser(r.data.user);
        window.history.replaceState(null, "", "/dashboard");
        navigate("/dashboard", { replace: true, state: { user: r.data.user } });
      } catch (e) {
        navigate("/login", { replace: true });
      }
    })();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-text-secondary font-mono text-sm" data-testid="auth-callback-loading">Authenticating…</div>
    </div>
  );
}
