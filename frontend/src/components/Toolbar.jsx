import React, { useState } from "react";
import { MousePointer2, ArrowUpRight, Circle, Minus, PenLine, Check, X, ThumbsUp, Flame, ThumbsDown, Trash2, Brush, Eraser } from "lucide-react";

const TOOLS = [
  { id: "select", icon: MousePointer2, label: "Select" },
  { id: "arrow", icon: ArrowUpRight, label: "Arrow" },
  { id: "circle", icon: Circle, label: "Circle" },
  { id: "dashed", icon: Minus, label: "Dashed" },
  { id: "freehand", icon: PenLine, label: "Brush" },
  { id: "tick", icon: Check, label: "Tick" },
  { id: "cross", icon: X, label: "Cross" },
  { id: "like", icon: ThumbsUp, label: "Like" },
  { id: "impressed", icon: Flame, label: "Wow" },
  { id: "dislike", icon: ThumbsDown, label: "Not liked" },
];
const COLORS = ["#5A67D8", "#EF4444", "#10B981", "#F59E0B", "#EDEDF0"];
const SIZES = [2, 4, 6, 10];

export default function Toolbar({ tool, setTool, color, setColor, brush, setBrush, onClear }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass rounded-sm px-3 py-2 flex items-center gap-1 overflow-x-auto no-scrollbar" data-testid="annotation-toolbar">
      {TOOLS.map(t => {
        const Active = tool === t.id; const Icon = t.icon;
        return (
          <button key={t.id} data-testid={`tool-${t.id}`} onClick={() => setTool(t.id)} title={t.label}
            className={`shrink-0 w-9 h-9 rounded-sm flex items-center justify-center transition border ${Active ? "bg-[#5A67D8] border-[#5A67D8] text-white" : "border-transparent text-[#8A8A93] hover:text-white hover:bg-[#1a1a1d]"}`}>
            <Icon className="w-4 h-4"/>
          </button>
        );
      })}
      <div className="h-6 w-px bg-[#232326] mx-1 shrink-0"/>
      <div className="flex items-center gap-1 shrink-0">
        {COLORS.map(c => (
          <button key={c} data-testid={`color-${c}`} onClick={() => setColor(c)}
            className={`w-5 h-5 rounded-full border-2 transition ${color === c ? "border-white" : "border-[#232326]"}`}
            style={{ background: c }} aria-label={`color ${c}`}/>
        ))}
      </div>
      <div className="h-6 w-px bg-[#232326] mx-1 shrink-0"/>
      <div className="relative shrink-0">
        <button data-testid="tool-brush-size" onClick={() => setOpen(!open)} title="Brush size" className="w-9 h-9 rounded-sm flex items-center justify-center text-[#8A8A93] hover:text-white hover:bg-[#1a1a1d]">
          <Brush className="w-4 h-4"/>
        </button>
        {open && (
          <div className="absolute bottom-12 right-0 bg-[#121214] border border-[#232326] rounded-sm p-2 flex gap-2 z-50">
            {SIZES.map(s => (
              <button key={s} data-testid={`brush-${s}`} onClick={() => { setBrush(s); setOpen(false); }}
                className={`w-9 h-9 flex items-center justify-center rounded-sm border ${brush === s ? "border-[#5A67D8]" : "border-[#232326]"}`}>
                <span className="rounded-full bg-white" style={{ width: s + 2, height: s + 2 }}/>
              </button>
            ))}
          </div>
        )}
      </div>
      <button data-testid="tool-clear" onClick={onClear} title="Clear" className="shrink-0 w-9 h-9 rounded-sm flex items-center justify-center text-[#8A8A93] hover:text-[#EF4444] hover:bg-[#1a1a1d]">
        <Trash2 className="w-4 h-4"/>
      </button>
    </div>
  );
}
