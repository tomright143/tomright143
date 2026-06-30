import React, { useState, useEffect } from "react";
import TopNav from "@/components/TopNav";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Copy } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const PLANS = [
  { id: "free", name: "Free", price: 0, perks: ["3 active reviews", "15s ad on PDF export", "Static watermark"] },
  { id: "creator", name: "Creator", price: 299, perks: ["No ads on exports", "All vector + reaction tools", "Brush sizes", "Text watermark"] },
  { id: "studio", name: "Studio", price: 799, featured: true, perks: ["Everything in Creator", "White-label brand logo", "Custom GST invoices", "Priority P2P relays"] },
  { id: "business", name: "Business", price: 1499, perks: ["Everything in Studio", "20 GB upload storage*", "Team workspace", "Annotation analytics"] },
];

export default function Pricing() {
  const { user, refresh } = useAuth();
  const [upi, setUpi] = useState(null);
  const [selected, setSelected] = useState(null);
  const [txn, setTxn] = useState("");
  const [gst, setGst] = useState(user?.gst_no || "");

  useEffect(() => { api.get("/billing/upi-info").then(r => setUpi(r.data)); }, []);

  const request = async (plan) => {
    if (plan === "free") return;
    setSelected(plan);
    try {
      const r = await api.get(`/billing/upi-qr?plan=${plan}`);
      setUpi({ qr_image: r.data.qr, upi_id: "tomright143-1@okhdfcbank", upi_link: r.data.upi_link, amount: r.data.amount });
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
          {PLANS.map(p => {
            const base = (p.price / 1.18).toFixed(2); const gstAmt = (p.price - base).toFixed(2);
            const isCurrent = user?.plan === p.id;
            return (
              <div key={p.id} data-testid={`plan-${p.id}`} className={`relative border-2 rounded-sm p-5 transition ${isCurrent ? "border-[#10B981] bg-[#0c1a14] ring-2 ring-[#10B981]/30" : p.featured ? "border-[#5A67D8] bg-[#121214]" : "border-[#232326] bg-[#121214]"}`}>
                {isCurrent && <span className="absolute -top-2.5 left-4 bg-[#10B981] text-black text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-sm">Current plan</span>}
                {!isCurrent && p.featured && <span className="absolute -top-2.5 right-4 bg-[#5A67D8] text-white text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-sm">Popular</span>}
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93]">{p.name}</p>
                <div className="mt-3 flex items-baseline gap-1"><span className="text-3xl font-semibold">₹{p.price}</span><span className="text-xs text-[#5C5C66] font-mono">/mo</span></div>
                {p.price > 0 && <p className="font-mono text-[9px] text-[#5C5C66] mt-0.5">Base ₹{base} + GST ₹{gstAmt}</p>}
                <ul className="mt-5 space-y-2">{p.perks.map((perk, i) => <li key={i} className="flex items-start gap-2 text-xs"><Check className="w-3.5 h-3.5 text-[#5A67D8] shrink-0 mt-0.5"/>{perk}</li>)}</ul>
                <Button data-testid={`subscribe-${p.id}`} onClick={() => request(p.id)} disabled={p.id === "free"} className={`w-full mt-5 rounded-sm h-9 text-xs ${isCurrent ? "bg-[#10B981] text-black hover:bg-[#0a8763]" : p.featured ? "bg-[#5A67D8] hover:bg-[#4C51BF]" : "bg-[#0A0A0B] border border-[#5A67D8] text-[#5A67D8] hover:bg-[#5A67D8] hover:text-white"}`}>
                  {p.id === "free" ? "Free forever" : isCurrent ? "Extend / pay advance" : "Pay via UPI"}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="text-center text-[10px] font-mono text-[#5C5C66] mt-4">* Business upload storage is a roadmap item — flag this if you want it implemented next.</p>

        {selected && upi && (
          <div className="mt-10 border border-[#5A67D8] rounded-sm bg-[#121214] p-6 max-w-2xl mx-auto" data-testid="upi-pay-panel">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5A67D8] mb-3">Pay ₹{upi.amount} via UPI for {selected} · amount auto-locked</p>
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <img src={upi.qr_image} alt="UPI QR" className="w-full rounded-sm border border-[#232326] bg-white p-2" data-testid="upi-qr"/>
                <a href={upi.upi_link} className="block mt-2 text-center font-mono text-[10px] uppercase tracking-wider text-[#5A67D8] hover:underline" data-testid="upi-deeplink">Open in UPI app →</a>
              </div>
              <div className="space-y-4">
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
