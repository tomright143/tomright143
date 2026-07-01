import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users } from "lucide-react";

// Live presence: sends a heartbeat and polls who is currently viewing the review.
export default function PresenceBar({ reviewId }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (!reviewId) return;
    let alive = true;
    const beat = async () => {
      try {
        await api.post(`/reviews/${reviewId}/heartbeat`);
        const r = await api.get(`/reviews/${reviewId}/presence`);
        if (alive) setUsers(r.data.users || []);
      } catch { /* ignore */ }
    };
    beat();
    const iv = setInterval(beat, 5000);
    return () => { alive = false; clearInterval(iv); };
  }, [reviewId]);

  return (
    <div className="flex items-center gap-2" data-testid="presence-bar">
      <Users className="w-4 h-4 text-[#10B981]"/>
      <span className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]" data-testid="presence-count">{users.length} viewing</span>
      <div className="flex -space-x-2">
        {users.slice(0, 6).map(u => (
          <div key={u.user_id} className="relative" title={`${u.name}${u.is_owner ? " (owner)" : ""}`}>
            <Avatar className="w-7 h-7 border-2 border-[#10B981]">
              <AvatarImage src={u.picture}/>
              <AvatarFallback className="text-[9px] bg-[#1a1a1d]">{u.name?.[0] || "?"}</AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#10B981] border-2 border-[#0A0A0B]" data-testid={`presence-dot-${u.user_id}`}/>
          </div>
        ))}
      </div>
    </div>
  );
}
