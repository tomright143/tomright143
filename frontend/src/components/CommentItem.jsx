import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Reply, Link as LinkIcon } from "lucide-react";
import { formatTimecode } from "@/lib/videoUtils";

function CommentRow({ c, onReply, onSeek, isReply }) {
  const parts = (c.text || "").split(/(https?:\/\/[^\s]+)/g);
  return (
    <div className="flex gap-2.5" data-testid={`comment-${c.id}`}>
      <Avatar className={isReply ? "w-6 h-6 shrink-0" : "w-7 h-7 shrink-0"}>
        <AvatarImage src={c.owner_picture}/>
        <AvatarFallback className="text-[10px] bg-[#1a1a1d]">{c.owner_name?.[0]}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{c.owner_name}</span>
          {c.timestamp != null && (
            <button
              onClick={() => onSeek(c.timestamp)}
              className="font-mono text-[10px] text-[#5A67D8] hover:underline"
              data-testid={`seek-${c.id}`}
            >
              @ {formatTimecode(c.timestamp)}
            </button>
          )}
          <span className="font-mono text-[10px] text-[#5C5C66]">
            {new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <p className="text-sm text-[#EDEDF0] mt-1 leading-relaxed break-words">
          {parts.map((p, i) => {
            const isLink = /^https?:\/\//.test(p);
            if (isLink) {
              return (
                <a key={i} href={p} target="_blank" rel="noreferrer" className="text-[#5A67D8] underline inline-flex items-center gap-1">
                  <LinkIcon className="w-3 h-3"/>{p}
                </a>
              );
            }
            return <span key={i}>{p}</span>;
          })}
        </p>
        {!isReply && (
          <button
            onClick={() => onReply(c.id)}
            data-testid={`reply-${c.id}`}
            className="text-[10px] text-[#5C5C66] hover:text-white mt-1 font-mono uppercase tracking-wider inline-flex items-center gap-1"
          >
            <Reply className="w-3 h-3"/>Reply
          </button>
        )}
      </div>
    </div>
  );
}

export default function CommentItem({ c, replies, onReply, onSeek }) {
  return (
    <div className="space-y-2">
      <CommentRow c={c} onReply={onReply} onSeek={onSeek} isReply={false}/>
      {replies.length > 0 && (
        <div className="ml-9 border-l border-[#232326] pl-3 space-y-3">
          {replies.map(r => (
            <CommentRow key={r.id} c={r} onReply={onReply} onSeek={onSeek} isReply={true}/>
          ))}
        </div>
      )}
    </div>
  );
}
