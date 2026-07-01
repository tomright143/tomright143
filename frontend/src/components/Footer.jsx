import React, { useEffect, useState } from "react";
import api from "@/lib/api";

let _cachedFooter = null;

export default function Footer() {
  const [text, setText] = useState(_cachedFooter);
  useEffect(() => {
    if (_cachedFooter !== null) return;
    api.get("/content").then(r => { _cachedFooter = r.data.footer_text || "Worxpher"; setText(_cachedFooter); }).catch(() => {});
  }, []);
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#0A0A0B]/95 backdrop-blur border-t border-[#232326] py-2 px-4 flex items-center justify-center gap-2" data-testid="footer-pinned">
      <img src="/worxpher-logo.png" alt="Worxpher" className="h-6"/>
      {text && text !== "Worxpher" && <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93]" data-testid="footer-text">{text}</span>}
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5C5C66]">· by</span>
      <a href="https://www.blackfxtudio.net" target="_blank" rel="noreferrer" data-testid="footer-blackfx-link" className="flex items-center gap-1.5 text-white hover:opacity-80 transition">
        <img src="https://static.wixstatic.com/media/7ffb5e_f97d7c629174457abe6c58ad29120ff2~mv2.png/v1/fit/w_2500,h_1330,al_c/7ffb5e_f97d7c629174457abe6c58ad29120ff2~mv2.png" alt="Black Fxtudio" className="h-3.5"/>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] font-medium">Black Fxtudio</span>
      </a>
    </footer>
  );
}
