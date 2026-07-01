import React, { useEffect, useState } from "react";
import TopNav from "@/components/TopNav";
import Footer from "@/components/Footer";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Upload, Lock, Download } from "lucide-react";
import { toast } from "sonner";

const COMPANY = {
  name: "Black Fxtudio",
  address: "C201, Crystal Plaza, Andheri West, 400053",
  gst: "27AXJPT1445J1Z2",
  logo: "https://static.wixstatic.com/media/7ffb5e_f97d7c629174457abe6c58ad29120ff2~mv2.png/v1/fit/w_2500,h_1330,al_c/7ffb5e_f97d7c629174457abe6c58ad29120ff2~mv2.png",
};

export default function Settings() {
  const { user, refresh } = useAuth();
  const [gst, setGst] = useState("");
  const [company, setCompany] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [accent, setAccent] = useState("#5A67D8");

  useEffect(() => {
    if (user) { setGst(user.gst_no || ""); setCompany(user.company || ""); setWebsite(user.website || ""); setInstagram(user.instagram || ""); setAccent(user.brand_accent || "#5A67D8"); }
    api.get("/invoices").then(r => setInvoices(r.data)).catch(() => {});
  }, [user]);

  const save = async () => { await api.post("/settings/profile", { gst_no: gst, company }); toast.success("Saved"); refresh(); };
  const saveBrand = async () => {
    if (!["studio", "business"].includes(user?.plan)) return toast.error("Studio/Business plan required");
    await api.post("/settings/profile", { website, instagram, brand_accent: accent });
    toast.success("Brand settings saved"); refresh();
  };

  const onLogo = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (user.plan !== "studio" && user.plan !== "business") return toast.error("Studio/Business plan required");
    if (file.size > 250 * 1024) return toast.error("Logo must be < 250KB");
    const reader = new FileReader();
    reader.onload = async () => { await api.post("/settings/profile", { brand_logo: reader.result }); toast.success("Brand logo updated"); refresh(); };
    reader.readAsDataURL(file);
  };

  const openInvoice = (inv) => {
    const w = window.open("", "_blank");
    w.document.write(`<!doctype html><html><head><title>Invoice ${inv.id}</title><style>body{font-family:system-ui;color:#111;padding:32px;max-width:780px;margin:auto}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd}.muted{color:#777;font-size:12px}.right{text-align:right}</style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start"><img src="${COMPANY.logo}" style="height:50px"/><div class="right"><h1>INVOICE</h1><div class="muted">#${inv.id}</div><div class="muted">${new Date(inv.created_at).toLocaleDateString()}</div></div></div>
      <div style="display:flex;justify-content:space-between;margin-top:24px"><div><b>${COMPANY.name}</b><div class="muted">${COMPANY.address}</div><div class="muted">GSTIN: ${COMPANY.gst}</div></div><div class="right"><b>Bill to</b><div class="muted">${inv.name}</div><div class="muted">${inv.email}</div>${user.gst_no ? `<div class="muted">GSTIN: ${user.gst_no}</div>`:""}</div></div>
      <table><thead><tr><th>Description</th><th class="right">Amount</th></tr></thead><tbody>
      <tr><td>Worxpher · ${inv.plan} plan · 1 month</td><td class="right">₹${inv.base}</td></tr>
      <tr><td>GST @ 18%</td><td class="right">₹${inv.gst}</td></tr>
      <tr><td><b>Total</b></td><td class="right"><b>₹${inv.amount}</b></td></tr>
      </tbody></table>
      <p class="muted" style="margin-top:40px">Thank you for subscribing to Review.io · This is a system-generated invoice from ${COMPANY.name}.</p>
      </body></html>`);
    w.document.close();
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#EDEDF0]">
      <TopNav/>
      <main className="max-w-[860px] mx-auto px-4 sm:px-8 py-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5C5C66]">Account · Settings</p>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Settings.</h1>

        <section className="mt-8 border border-[#232326] rounded-sm bg-[#121214] p-5" data-testid="profile-section">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93] mb-3">Profile</p>
          <div className="flex items-center gap-4">
            <Avatar className="w-14 h-14 border border-[#232326]"><AvatarImage src={user?.picture}/><AvatarFallback>{user?.name?.[0]}</AvatarFallback></Avatar>
            <div>
              <p className="font-medium">{user?.name}</p>
              <p className="font-mono text-xs text-[#8A8A93]">{user?.email}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#5A67D8] mt-1">Plan · {user?.plan}</p>
            </div>
          </div>
          <div className="mt-5 grid sm:grid-cols-2 gap-3">
            <div><label className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]">Company name</label><Input data-testid="company-input" value={company} onChange={e=>setCompany(e.target.value)} className="bg-[#0A0A0B] border-[#232326] mt-1"/></div>
            <div><label className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]">GST number</label><Input data-testid="settings-gst-input" value={gst} onChange={e=>setGst(e.target.value)} placeholder="27AABCU9603R1ZM" className="bg-[#0A0A0B] border-[#232326] mt-1 font-mono text-xs"/></div>
          </div>
          <Button onClick={save} data-testid="save-profile" className="mt-4 bg-[#5A67D8] hover:bg-[#4C51BF] rounded-sm">Save</Button>
        </section>

        <section className="mt-6 border border-[#232326] rounded-sm bg-[#121214] p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93] mb-1">White-label brand logo</p><h3 className="text-base font-medium">Replace app branding on dashboard & PDFs (Studio/Business)</h3></div>
            {!["studio","business"].includes(user?.plan) && <Lock className="w-4 h-4 text-[#5C5C66]"/>}
          </div>
          {user?.brand_logo && <div className="mt-3 border border-[#232326] rounded-sm p-3 bg-[#0A0A0B]"><img src={user.brand_logo} alt="brand" className="h-10"/></div>}
          <label className="inline-flex items-center gap-2 px-3 py-2 mt-3 border border-[#232326] rounded-sm cursor-pointer hover:bg-[#1a1a1d]"><Upload className="w-4 h-4"/><span className="font-mono text-xs uppercase tracking-wider">Upload logo</span><input data-testid="brand-logo-input" type="file" accept="image/*" className="hidden" onChange={onLogo} disabled={!["studio","business"].includes(user?.plan)}/></label>
          <div className="mt-5 grid sm:grid-cols-3 gap-3 pt-4 border-t border-[#232326]">
            <div><label className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]">Website URL</label><Input data-testid="brand-website-input" value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://studio.com" disabled={!["studio","business"].includes(user?.plan)} className="bg-[#0A0A0B] border-[#232326] mt-1 font-mono text-xs"/></div>
            <div><label className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]">Instagram URL</label><Input data-testid="brand-instagram-input" value={instagram} onChange={e=>setInstagram(e.target.value)} placeholder="https://instagram.com/studio" disabled={!["studio","business"].includes(user?.plan)} className="bg-[#0A0A0B] border-[#232326] mt-1 font-mono text-xs"/></div>
            <div><label className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]">Accent colour</label><div className="flex items-center gap-2 mt-1"><input data-testid="brand-accent-input" type="color" value={accent} onChange={e=>setAccent(e.target.value)} disabled={!["studio","business"].includes(user?.plan)} className="w-10 h-9 bg-transparent border border-[#232326] rounded-sm cursor-pointer"/><Input value={accent} onChange={e=>setAccent(e.target.value)} disabled={!["studio","business"].includes(user?.plan)} className="bg-[#0A0A0B] border-[#232326] font-mono text-xs"/></div></div>
          </div>
          <Button onClick={saveBrand} data-testid="save-brand" disabled={!["studio","business"].includes(user?.plan)} className="mt-4 bg-[#5A67D8] hover:bg-[#4C51BF] rounded-sm">Save brand settings</Button>
        </section>

        <section className="mt-6 border border-[#232326] rounded-sm bg-[#121214] p-5" data-testid="invoices-section">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93] mb-3">GST Invoices · {COMPANY.name}</p>
          {invoices.length === 0 ? <p className="text-xs text-[#5C5C66] font-mono">No invoices yet.</p> :
            <div className="space-y-2">{invoices.map(inv => (
              <div key={inv.id} className="flex items-center justify-between border border-[#232326] rounded-sm p-3" data-testid={`invoice-${inv.id}`}>
                <div><div className="font-medium text-sm">{inv.plan} · ₹{inv.amount} <span className="text-[#8A8A93] font-mono text-xs">(base ₹{inv.base} + GST ₹{inv.gst})</span></div><div className="font-mono text-[10px] text-[#5C5C66]">#{inv.id} · {new Date(inv.created_at).toLocaleDateString()}</div></div>
                <Button onClick={() => openInvoice(inv)} className="bg-[#0A0A0B] border border-[#232326] rounded-sm h-8"><Download className="w-3.5 h-3.5 mr-1.5"/><span className="font-mono text-[10px] uppercase tracking-wider">View</span></Button>
              </div>
            ))}</div>
          }
        </section>
      </main>
      <Footer/>
    </div>
  );
}
