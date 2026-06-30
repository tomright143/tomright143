import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pause, AlertTriangle } from "lucide-react";

// Full-screen rewarded ad with Page Visibility / focus lock.
// Pauses countdown when tab/window loses focus or hidden.
export default function AdLockModal({ open, onComplete, onClose, durationSec = 15 }) {
  const [remaining, setRemaining] = useState(durationSec);
  const [paused, setPaused] = useState(false);
  const tickRef = useRef(null);

  useEffect(() => {
    if (!open) { setRemaining(durationSec); setPaused(false); return; }
    const evaluate = () => {
      const hidden = document.hidden || !document.hasFocus();
      setPaused(hidden);
    };
    evaluate();
    const onVis = () => evaluate();
    const onFocus = () => evaluate();
    const onBlur = () => evaluate();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, [open, durationSec]);

  useEffect(() => {
    if (!open) return;
    if (paused) return; // hold
    if (remaining <= 0) { onComplete && onComplete(); return; }
    tickRef.current = setTimeout(() => setRemaining(s => s - 1), 1000);
    return () => clearTimeout(tickRef.current);
  }, [open, paused, remaining, onComplete]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-2xl flex items-center justify-center px-6" data-testid="ad-lock-modal">
      <div className="max-w-lg w-full glass rounded-sm p-8 text-center space-y-6 rise">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5A67D8]" data-testid="ad-label">Rewarded ad · free tier</p>
        <div className="aspect-video bg-gradient-to-br from-[#5A67D8] via-[#4C51BF] to-[#121214] rounded-sm flex items-center justify-center">
          <span className="font-mono text-sm uppercase tracking-[0.2em] text-white/80">Sponsored placement</span>
        </div>
        {paused ? (
          <div className="flex items-start gap-3 text-left bg-[#1a1a1d] border border-[#3A3A40] rounded-sm p-4" data-testid="ad-paused-banner">
            <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5"/>
            <div>
              <p className="text-sm font-medium text-[#EDEDF0]">Please keep this screen active to finish generating your PDF.</p>
              <p className="text-xs text-[#8A8A93] mt-1 font-mono">Countdown paused. Resume by focusing this window.</p>
            </div>
          </div>
        ) : (
          <p className="font-mono text-xs uppercase tracking-wider text-[#8A8A93]">Unlocking PDF export in</p>
        )}
        <div className="font-mono text-6xl font-semibold tracking-tight" data-testid="ad-countdown">
          {paused ? <span className="text-[#F59E0B] inline-flex items-center gap-2"><Pause className="w-8 h-8"/>{remaining}s</span> : `${remaining}s`}
        </div>
        <Button data-testid="ad-cancel" onClick={onClose} variant="ghost" className="text-[#8A8A93] hover:text-white">Cancel</Button>
      </div>
    </div>
  );
}
