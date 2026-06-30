import React from "react";

export default function Watermark({ email }) {
  if (!email) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-10" data-testid="watermark">
      <div className="absolute top-0 left-0 watermark-drift">
        <span className="font-mono text-xs tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.35)" }}>
          {email} · zerostore · {new Date().toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
