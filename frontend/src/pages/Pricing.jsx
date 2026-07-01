import React, { useState, useEffect } from "react";
import TopNav from "@/components/TopNav";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Copy, Smartphone } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const PLANS = [
  { id: "free", name: "Free", price: 0, accent: "#8A8A93", glow: "rgba(138,138,147,0.25)", perks: ["3 active reviews", "15s ad on PDF export", "Static watermark"] },
  { id: "creator", name: "Creator", price: 299, accent: "#5A67D8", glow: "rgba(90,103,216,0.35)", perks: ["No ads on exports", "All vector + reaction tools", "Brush sizes", "Text watermark"] },
  { id: "studio", name: "Studio", price: 799, featured: true, accent: "#F59E0B", glow: "rgba(245,158,11,0.35)", perks: ["Everything in Creator", "White-label brand logo", "Custom GST invoices", "Priority P2P relays"] },
  { id: "business", name: "Business", price: 1499, accent: "#10B981", glow: "rgba(16,185,129,0.35)", perks: ["Everything in Studio", "20 GB upload storage*", "Team workspace", "Annotation analytics"] },
];

// Recognisable UPI app brand chips
const UPI_APPS = [
  { name: "GPay", bg: "#ffffff", fg: "#5f6368", ring: "#e0e0e0",
    svg: (<svg viewBox="0 0 24 24" className="w-4 h-4"><path fill="#4285F4" d="M22.5 12.2c0-.7-.06-1.4-.18-2.05H12v3.88h5.9a5.05 5.05 0 0 1-2.19 3.31v2.74h3.54c2.07-1.9 3.25-4.71 3.25-7.88Z"/><path fill="#34A853" d="M12 23c2.95 0 5.43-.98 7.24-2.65l-3.54-2.74c-.98.66-2.24 1.05-3.7 1.05-2.85 0-5.26-1.92-6.12-4.5H2.13v2.83A11 11 0 0 0 12 23Z"/><path fill="#FBBC04" d="M5.88 14.16a6.6 6.6 0 0 1 0-4.32V7.01H2.13a11 11 0 0 0 0 9.98l3.75-2.83Z"/><path fill="#EA4335" d="M12 5.34c1.61 0 3.05.55 4.19 1.64l3.13-3.13A11 11 0 0 0 12 1 11 11 0 0 0 2.13 7.01l3.75 2.83C6.74 7.26 9.15 5.34 12 5.34Z"/></svg>) },
  { name: "PhonePe", bg: "#5f259f", fg: "#ffffff", ring: "#5f259f",
    svg: (<svg viewBox="0 0 24 24" className="w-4 h-4"><circle cx="12" cy="12" r="12" fill="#5f259f"/><path fill="#fff" d="M16.6 8.1c0-.4-.3-.7-.7-.7h-1.3l-.3-.7c-.1-.3-.4-.5-.7-.5H10c-.2 0-.4.2-.4.4s.2.4.4.4h3.4l.3.7H8.3c-.4 0-.7.3-.7.7s.3.7.7.7h.6v2.8c0 1.9 1 3 2.7 3 .5 0 .9-.1 1.4-.3v1.6c0 .5-.3.8-.8.8h-.6c-.2 0-.4.2-.4.4s.2.4.4.4h.9c1 0 1.7-.6 1.7-1.7V9.5h1.5c.4 0 .7-.3.7-.7Zm-3.8 5.5c-.3.2-.7.3-1 .3-.9 0-1.4-.5-1.4-1.6V9.5h2.4v4.1Z"/></svg>) },
  { name: "Paytm", bg: "#ffffff", fg: "#00baf2", ring: "#e0e0e0",
    svg: (<svg viewBox="0 0 48 24" className="w-6 h-4"><path fill="#002970" d="M7 6H4a2 2 0 0 0-2 2v10h2.6v-3.4H7A4.3 4.3 0 0 0 11.3 10 4.3 4.3 0 0 0 7 6Zm-.2 6H4.6V8.4h2.2a1.8 1.8 0 0 1 0 3.6Z"/><path fill="#00baf2" d="M18 9v.5a3.3 3.3 0 0 0-2-.6 3.6 3.6 0 0 0 0 7.2 3.3 3.3 0 0 0 2-.6v.5h2.4V9Zm-1.7 4.9a1.4 1.4 0 1 1 1.4-1.4 1.4 1.4 0 0 1-1.4 1.4Z"/><path fill="#002970" d="M27.6 9l-1.5 4-1.5-4h-2.5l2.8 6.7-.2.4a1 1 0 0 1-1 .7h-.7V19h1a3 3 0 0 0 2.9-2l3.2-8Z"/><path fill="#00baf2" d="M40.4 8.9a2.7 2.7 0 0 0-2.3 1.1 2.4 2.4 0 0 0-2.1-1.1 2.5 2.5 0 0 0-1.8.7V9H32v7h2.4v-3.8c0-.8.4-1.3 1.1-1.3s1 .5 1 1.3V16h2.4v-3.8c0-.8.4-1.3 1.1-1.3s1 .5 1 1.3V16h2.4v-4.3a2.6 2.6 0 0 0-2.6-2.8Z"/></svg>) },
];

export default function Pricing() {
  const { user, refresh } = useAuth();
  const [upi, setUpi] = useState(null);
  const [selected, setSelected] = useState(null);
  const [txn, setTxn] = useState("");
  const [gst, setGst] = useState(user?.gst_no || "");
  const [content, setContent] = useState(null);

  useEffect(() => { api.get("/billing/upi-info").then(r => setUpi(r.data)); }, []);
  useEffect(() => { api.get("/content").then(r => setContent(r.data)).catch(() => {}); }, []);

  const plans = PLANS.map(p => {
    const ov = content?.plans?.[p.id];
    return ov ? { ...p, name: ov.name || p.name, perks: (ov.perks && ov.perks.length ? ov.perks : p.perks) } : p;
  });

  const request = async (plan) => {
    if (plan === "free") return;
    setSelected(plan);
    try {
      const r = await api.get(`/billing/upi-qr?plan=${plan}`);
      const info = { qr_image: r.data.qr, upi_id: "tomright143-1@okhdfcbank", upi_link: r.data.upi_link, amount: r.data.amount };
      setUpi(info);
      // Mobile: auto-open the UPI pay sheet so the user lands directly in their UPI app
      if (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches) {
        setTimeout(() => { window.location.href = r.data.upi_link; }, 400);
      }
      setTimeout(() => document.querySelector("[data-testid='upi-pay-panel']")?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    } catch { toast.error("Could not generate QR"); }
  };

  const submit = async () => {
    if (!txn) return toast.error("Enter UPI transaction reference after paying");
    try {
      await api.post("/billing/upi-request", { plan: selected, txn_ref: txn, gst_no: gst });
      toast.success("Payment submitted — admin will activate plan shortly.");
      setSelected(null); setTxn(""); refresh();
    } catch (e) { toast.error("Failed"); }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#EDEDF0]">
      <TopNav/>
      <main className="max-w-[1100px] mx-auto px-4 sm:px-8 py-12">
        <div className="text-center mb-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5C5C66]">Pricing · UPI · GST 18% inclusive</p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight mt-2">Plans for studios.</h1>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map(p => {
            const base = (p.price / 1.18).toFixed(2); const gstAmt = (p.price - base).toFixed(2);
            const isCurrent = user?.plan === p.id;
            const isSel = selected === p.id;
            return (
              <div key={p.id} data-testid={`plan-${p.id}`}
                onClick={() => request(p.id)}
                className={`group relative border-2 rounded-sm p-5 transition-all duration-300 ${p.id !== "free" ? "cursor-pointer hover:-translate-y-1.5" : ""} ${isCurrent ? "bg-[#0c1a14]" : "bg-[#121214]"}`}
                style={{
                  borderColor: isCurrent ? "#10B981" : (isSel || p.featured) ? p.accent : "#232326",
                  boxShadow: (isSel || p.featured) ? `0 12px 40px -12px ${p.glow}` : "none",
                }}
                onMouseEnter={e => { if (!isCurrent) { e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.boxShadow = `0 16px 44px -14px ${p.glow}`; } }}
                onMouseLeave={e => { if (!isCurrent && !isSel && !p.featured) { e.currentTarget.style.borderColor = "#232326"; e.currentTarget.style.boxShadow = "none"; } }}
              >
                <span className="absolute top-0 left-0 h-1 w-full rounded-t-sm" style={{ background: p.accent, opacity: isCurrent ? 0 : 0.9 }}/>
                {isCurrent && <span className="absolute -top-2.5 left-4 bg-[#10B981] text-black text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-sm">Current plan</span>}
                {!isCurrent && p.featured && <span className="absolute -top-2.5 right-4 text-white text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-sm" style={{ background: p.accent }}>Popular</span>}
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] mt-1" style={{ color: p.accent }}>{p.name}</p>
                <div className="mt-3 flex items-baseline gap-1"><span className="text-3xl font-semibold">₹{p.price}</span><span className="text-xs text-[#5C5C66] font-mono">/mo</span></div>
                {p.price > 0 && <p className="font-mono text-[9px] text-[#5C5C66] mt-0.5">Base ₹{base} + GST ₹{gstAmt}</p>}
                <ul className="mt-5 space-y-2">{p.perks.map((perk, i) => <li key={i} className="flex items-start gap-2 text-xs"><Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: p.accent }}/>{perk}</li>)}</ul>
                <Button data-testid={`subscribe-${p.id}`} onClick={(e) => { e.stopPropagation(); request(p.id); }} disabled={p.id === "free"}
                  className="w-full mt-5 rounded-sm h-9 text-xs font-medium transition-colors"
                  style={ p.id === "free" ? { background: "#0A0A0B", border: "1px solid #232326", color: "#5C5C66" }
                    : isCurrent ? { background: "#10B981", color: "#000" }
                    : { background: p.accent, color: "#fff" } }>
                  {p.id === "free" ? "Free forever" : isCurrent ? "Extend / pay advance" : "Pay via UPI"}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="text-center text-[10px] font-mono text-[#5C5C66] mt-4">* Business upload storage is a roadmap item — flag this if you want it implemented next.</p>

        {selected && upi && upi.upi_link && (
          <div className="mt-10 border-2 rounded-sm bg-[#121214] p-6 max-w-2xl mx-auto" style={{ borderColor: PLANS.find(x => x.id === selected)?.accent }} data-testid="upi-pay-panel">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] mb-4" style={{ color: PLANS.find(x => x.id === selected)?.accent }}>Pay ₹{upi.amount} via UPI for {selected} · amount auto-locked</p>
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <img src={upi.qr_image} alt="UPI QR" className="w-full rounded-sm border border-[#232326] bg-white p-2" data-testid="upi-qr"/>
                <p className="text-center font-mono text-[9px] uppercase tracking-wider text-[#5C5C66] mt-2">Scan with any UPI app</p>
              </div>
              <div className="space-y-4">
                {/* Prominent Open-in-UPI CTA */}
                <a href={upi.upi_link} data-testid="upi-deeplink" className="block">
                  <div className="w-full h-12 rounded-sm flex items-center justify-center gap-2 bg-[#5A67D8] hover:bg-[#4C51BF] text-white font-medium transition-colors">
                    <Smartphone className="w-4 h-4"/><span className="font-mono text-xs uppercase tracking-wider">Open in UPI app</span>
                  </div>
                </a>
                <div className="flex items-center justify-center gap-2" data-testid="upi-app-chips">
                  {UPI_APPS.map(a => (
                    <a key={a.name} href={upi.upi_link} data-testid={`upi-app-${a.name.toLowerCase()}`} className="flex items-center gap-1.5 px-2.5 h-8 rounded-sm border transition-transform hover:scale-105"
                      style={{ background: a.bg, borderColor: a.ring }}>
                      {a.svg}<span className="text-[10px] font-semibold" style={{ color: a.fg }}>{a.name}</span>
                    </a>
                  ))}
                </div>
                <div><Label className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]">UPI ID</Label>
                  <div className="flex gap-2 mt-1"><Input value={upi.upi_id} readOnly className="bg-[#0A0A0B] border-[#232326] font-mono text-xs" data-testid="upi-id"/><Button onClick={() => { navigator.clipboard.writeText(upi.upi_id); toast.success("Copied"); }} className="bg-[#0A0A0B] border border-[#232326] rounded-sm"><Copy className="w-3.5 h-3.5"/></Button></div>
                </div>
                <div><Label className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]">UPI transaction reference</Label><Input value={txn} onChange={(e) => setTxn(e.target.value)} placeholder="UTR / Txn ID" data-testid="upi-txn" className="bg-[#0A0A0B] border-[#232326] mt-1 font-mono text-xs"/></div>
                <div><Label className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]">GST number (optional, for invoice)</Label><Input value={gst} onChange={(e) => setGst(e.target.value)} placeholder="27AABCU9603R1ZM" data-testid="gst-input" className="bg-[#0A0A0B] border-[#232326] mt-1 font-mono text-xs"/></div>
                <Button onClick={submit} data-testid="upi-submit" className="w-full bg-[#5A67D8] hover:bg-[#4C51BF] rounded-sm">Submit payment</Button>
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer/>
    </div>
  );
}

function Label({ children, className }) { return <label className={className}>{children}</label>; }
