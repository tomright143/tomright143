import React from "react";
import TopNav from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const PLANS = [
  { id: "free", name: "Free", price: "₹0", suffix: "/forever",
    perks: ["Frame-accurate annotations", "Up to 3 active reviews", "15s rewarded ad on PDF export", "Static watermark"] },
  { id: "creator", name: "Creator", price: "₹299", suffix: "/month",
    perks: ["Everything in Free", "Remove ads on PDF export", "All vector tools + reaction stamps", "Secure text watermarking"] },
  { id: "studio", name: "Studio", price: "₹799", suffix: "/month", featured: true,
    perks: ["Everything in Creator", "White-label brand logo on PDF + dashboard", "Dynamic asset storage", "Priority P2P relays"] },
];

export default function Pricing() {
  const { user, refresh } = useAuth();
  const subscribe = async (plan) => {
    try {
      await api.post("/billing/subscribe", { plan });
      toast.success(`Switched to ${plan} (MOCKED)`);
      refresh();
    } catch (e) { toast.error("Failed"); }
  };
  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#EDEDF0]">
      <TopNav />
      <main className="max-w-[1100px] mx-auto px-4 sm:px-8 py-12 sm:py-20">
        <div className="text-center mb-12">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5C5C66]">Pricing · Razorpay (MOCKED for demo)</p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight mt-2">Stream cheap. Ship faster.</h1>
          <p className="text-[#8A8A93] mt-3 max-w-xl mx-auto">Indian-priced plans for solo creators and white-label studios. Cancel anytime.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {PLANS.map(p => (
            <div key={p.id} data-testid={`plan-${p.id}`} className={`relative border rounded-sm p-6 bg-[#121214] ${p.featured ? "border-[#5A67D8]" : "border-[#232326]"}`}>
              {p.featured && <span className="absolute -top-2.5 right-4 bg-[#5A67D8] text-white text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-sm">Most popular</span>}
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93]">{p.name}</p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight">{p.price}</span>
                <span className="text-xs text-[#5C5C66] font-mono">{p.suffix}</span>
              </div>
              <ul className="mt-6 space-y-2.5">
                {p.perks.map((perk, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[#EDEDF0]">
                    <Check className="w-4 h-4 text-[#5A67D8] shrink-0 mt-0.5"/>{perk}
                  </li>
                ))}
              </ul>
              <Button
                data-testid={`subscribe-${p.id}`}
                onClick={() => subscribe(p.id)}
                disabled={user?.plan === p.id}
                className={`w-full mt-6 rounded-sm h-10 ${p.id === "free" ? "bg-[#1a1a1d] border border-[#232326]" : p.featured ? "bg-[#5A67D8] hover:bg-[#4C51BF]" : "bg-[#121214] border border-[#5A67D8] text-[#5A67D8] hover:bg-[#5A67D8] hover:text-white"}`}>
                {user?.plan === p.id ? "Current plan" : `Choose ${p.name}`}
              </Button>
            </div>
          ))}
        </div>
        <p className="text-center font-mono text-[10px] text-[#5C5C66] uppercase tracking-[0.2em] mt-10">⚠ Payments MOCKED · Razorpay live keys can be plugged in later</p>
      </main>
    </div>
  );
}
