import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, MessageCircle } from "lucide-react";
import { formatTimecode } from "@/lib/videoUtils";
import CommentItem from "@/components/CommentItem";

export default function CommentSidebar({ reviewId, currentTime, onSeek }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [team, setTeam] = useState([]);

  const refresh = async () => {
    const r = await api.get(`/comments/${reviewId}`);
    setComments(r.data);
  };
  // Privacy: only users currently ACTIVE on this review can be seen & @mentioned
  const refreshActive = async () => {
    try { const r = await api.get(`/reviews/${reviewId}/presence`); setTeam(r.data.users || []); } catch { /* */ }
  };
  useEffect(() => { refresh(); refreshActive(); }, [reviewId]); // eslint-disable-line
  useEffect(() => {
    const iv = setInterval(() => { refresh().catch(() => {}); refreshActive(); }, 4000);
    return () => clearInterval(iv);
  }, [reviewId]); // eslint-disable-line

  const handleSend = async () => {
    if (!text.trim()) return;
    const mentions = Array.from(text.matchAll(/@([\w.]+)/g)).map(m => m[1]);
    await api.post("/comments", { review_id: reviewId, text, timestamp: currentTime, parent_id: replyTo, mentions });
    setText(""); setReplyTo(null); refresh();
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const tree = useMemo(() => {
    const byParent = {};
    comments.forEach(c => {
      const k = c.parent_id || "root";
      if (!byParent[k]) byParent[k] = [];
      byParent[k].push(c);
    });
    return byParent;
  }, [comments]);

  const root = tree["root"] || [];

  return (
    <div className="flex flex-col h-full bg-[#0A0A0B]" data-testid="comment-sidebar">
      <div className="px-4 py-3 border-b border-[#232326] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-[#5A67D8]"/>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93]">Thread · {comments.length}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {root.length === 0 && (
          <p className="text-xs text-[#5C5C66] font-mono">No comments yet. Drop a frame-accurate note.</p>
        )}
        {root.map(c => (
          <CommentItem key={c.id} c={c} replies={tree[c.id] || []} onReply={(id) => setReplyTo(id)} onSeek={onSeek}/>
        ))}
      </div>
      <div className="border-t border-[#232326] p-3 space-y-2">
        {replyTo && (
          <div className="flex items-center justify-between bg-[#121214] border border-[#232326] rounded-sm px-2 py-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#8A8A93]">Replying…</span>
            <button onClick={() => setReplyTo(null)} className="text-[10px] text-[#5C5C66] hover:text-white">cancel</button>
          </div>
        )}
        <Textarea
          data-testid="comment-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={`@mention · Enter to send · ${formatTimecode(currentTime)}`}
          rows={2}
          className="bg-[#121214] border-[#232326] rounded-sm resize-none text-sm"
        />
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-[#5A67D8]" data-testid="comment-timecode">@ {formatTimecode(currentTime)}</span>
          <Button data-testid="comment-send" onClick={handleSend} className="h-8 px-3 bg-[#5A67D8] hover:bg-[#4C51BF] rounded-sm">
            <Send className="w-3.5 h-3.5 mr-1.5"/>
            <span className="font-mono text-[10px] uppercase tracking-wider">Send</span>
          </Button>
        </div>
        {team.length > 0 && text.includes("@") && (
          <div className="border border-[#232326] rounded-sm bg-[#121214] max-h-32 overflow-y-auto" data-testid="mention-suggestions">
            {team.slice(0, 5).map(t => (
              <button
                key={t.user_id}
                className="w-full text-left px-2 py-1.5 hover:bg-[#1a1a1d] flex items-center gap-2"
                onClick={() => setText(text.replace(/@\w*$/, `@${(t.email || "").split("@")[0]} `))}
              >
                <Avatar className="w-5 h-5">
                  <AvatarImage src={t.picture}/>
                  <AvatarFallback className="text-[8px]">{t.name?.[0]}</AvatarFallback>
                </Avatar>
                <span className="text-xs">{t.name}</span>
                <span className="text-[10px] text-[#5C5C66] font-mono">{t.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
