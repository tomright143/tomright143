import React, { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const unread = items.filter(i => !i.read).length;

  const load = async () => {
    try { const r = await api.get("/notifications"); setItems(r.data); } catch { /* */ }
  };
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const c = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", c); return () => document.removeEventListener("mousedown", c);
  }, []);

  const toggle = async () => {
    setOpen(!open);
    if (!open && unread > 0) { await api.post("/notifications/read"); setTimeout(load, 500); }
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} data-testid="notification-bell" className="relative w-9 h-9 rounded-sm hover:bg-[#121214] flex items-center justify-center">
        <Bell className="w-4 h-4 text-[#8A8A93]"/>
        {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#EF4444] rounded-full" data-testid="notification-dot"/>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-80 max-h-[400px] overflow-y-auto bg-[#121214] border border-[#232326] rounded-sm shadow-xl z-50" data-testid="notifications-panel">
          <div className="px-3 py-2 border-b border-[#232326]"><span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93]">Notifications</span></div>
          {items.length === 0 ? <p className="px-3 py-6 text-xs text-[#5C5C66] text-center font-mono">All caught up.</p> :
            items.map(n => (
              <button key={n.id} onClick={() => { setOpen(false); if (n.review_id) navigate(`/workspace/${n.review_id}`); else if (n.kind === "expiry-soon" || n.kind === "billing") navigate("/pricing"); }} className="w-full text-left px-3 py-2 border-b border-[#232326] hover:bg-[#1a1a1d] block">
                <div className="flex items-start gap-2">
                  <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${n.read ? "bg-[#3A3A40]" : "bg-[#5A67D8]"}`}/>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium">{n.title}</div>
                    <div className="text-[11px] text-[#8A8A93] truncate">{n.body}</div>
                    <div className="font-mono text-[9px] text-[#5C5C66] mt-0.5">{new Date(n.created_at).toLocaleString()}</div>
                  </div>
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
