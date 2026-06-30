import React from "react";
import { Button } from "@/components/ui/button";
import { Film, Layers, Lock, Sparkles } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function Login() {
  const handleLogin = () => {
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#EDEDF0] grid lg:grid-cols-2">
      {/* Left: Brand panel */}
      <div className="hidden lg:flex relative flex-col justify-between p-12 border-r border-[#232326] bg-grid overflow-hidden">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-sm bg-[#5A67D8] flex items-center justify-center">
            <Film className="w-4 h-4 text-white" />
          </div>
          <span className="font-mono text-sm tracking-widest uppercase">Zerostore</span>
        </div>
        <div className="space-y-6 max-w-md rise">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#5C5C66]">Frame-Accurate · Zero-Storage · Collaborative</p>
          <h1 className="text-5xl font-semibold tracking-tight leading-[1.05]">
            Review video<br/>without hosting it.
          </h1>
          <p className="text-[#8A8A93] leading-relaxed">
            Stream from YouTube, Vimeo, or Google Drive. Annotate in real-time with vector tools, thread feedback like Instagram, jump on a P2P call — all in one workspace.
          </p>
          <div className="flex flex-wrap gap-2 pt-2 font-mono text-xs text-[#8A8A93]">
            <span className="px-2 py-1 border border-[#232326] rounded-sm">Frame stepping 0.05s</span>
            <span className="px-2 py-1 border border-[#232326] rounded-sm">WebRTC P2P</span>
            <span className="px-2 py-1 border border-[#232326] rounded-sm">Burn-in watermark</span>
          </div>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5C5C66]">v0.1 · built for studios in india · ad-funded free tier</p>
      </div>

      {/* Right: Auth panel */}
      <div className="flex items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-sm space-y-8 rise">
          <div className="lg:hidden flex items-center gap-2">
            <div className="w-7 h-7 rounded-sm bg-[#5A67D8] flex items-center justify-center">
              <Film className="w-4 h-4 text-white" />
            </div>
            <span className="font-mono text-sm tracking-widest uppercase">Zerostore</span>
          </div>
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-sm text-[#8A8A93] mt-2 font-mono">Continue with your Google workspace.</p>
          </div>
          <Button
            data-testid="google-login-button"
            onClick={handleLogin}
            className="w-full h-12 bg-[#5A67D8] hover:bg-[#4C51BF] text-white rounded-sm border border-[#5A67D8] font-medium"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 mr-3"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"/><path fill="#fff" opacity=".9" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#fff" opacity=".75" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.94l3.66-2.84Z"/><path fill="#fff" opacity=".55" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38Z"/></svg>
            Continue with Google
          </Button>
          <div className="grid grid-cols-3 gap-3 pt-2 text-xs font-mono text-[#5C5C66]">
            <div className="flex flex-col gap-1.5"><Layers className="w-4 h-4 text-[#5A67D8]"/><span>Vector tools</span></div>
            <div className="flex flex-col gap-1.5"><Sparkles className="w-4 h-4 text-[#5A67D8]"/><span>Reaction stamps</span></div>
            <div className="flex flex-col gap-1.5"><Lock className="w-4 h-4 text-[#5A67D8]"/><span>Watermark lock</span></div>
          </div>
          <p className="text-[10px] font-mono text-[#5C5C66] leading-relaxed">By continuing you agree to the terms. Free tier shows a 15s ad on PDF export. Upgrade to remove ads.</p>
        </div>
      </div>
    </div>
  );
}
