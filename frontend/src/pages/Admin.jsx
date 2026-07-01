import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import TopNav from "@/components/TopNav";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Trash2, Plus, Check } from "lucide-react";

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState("stats");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [ads, setAds] = useState([]);
  const [newAdmin, setNewAdmin] = useState("");
  const [newAd, setNewAd] = useState({ title: "", video_url: "", image_url: "", duration: 15, budget: 0, expiry: "" });

  const [prices, setPrices] = useState({ creator: 299, studio: 799, business: 1499 });
  const savePrices = async () => { await api.post("/admin/plans", prices); toast.success("Plan prices updated"); };

  const [content, setContent] = useState({ landing_headline: "", landing_tagline: "", footer_text: "", plans: {} });
  const saveContent = async () => { await api.post("/admin/content", content); toast.success("Site content updated"); };
  const setPlanField = (id, field, value) => setContent(c => ({ ...c, plans: { ...c.plans, [id]: { ...(c.plans?.[id] || {}), [field]: value } } }));

  const [planConfig, setPlanConfig] = useState({});
  const savePlanConfig = async () => { await api.post("/admin/plans/config", planConfig); toast.success("Plan features & offers updated"); load(); };
  const setLimit = (id, key, value) => setPlanConfig(c => ({ ...c, [id]: { ...c[id], limits: { ...(c[id]?.limits || {}), [key]: value } } }));
  const setEnabled = (id, value) => setPlanConfig(c => ({ ...c, [id]: { ...c[id], enabled: value } }));
  const setOffer = (id, key, value) => setPlanConfig(c => ({ ...c, [id]: { ...c[id], offer: { ...(c[id]?.offer || {}), [key]: value } } }));

  const [coupons, setCoupons] = useState([]);
  const [newCoupon, setNewCoupon] = useState({ code: "", percent: 20, expires_at: "", new_users_only: true });
  const addCoupon = async () => {
    if (!newCoupon.code) return toast.error("Enter a coupon code");
    await api.post("/admin/coupons", { ...newCoupon, plans: [] });
    setNewCoupon({ code: "", percent: 20, expires_at: "", new_users_only: true }); loadCoupons(); toast.success("Coupon created");
  };
  const delCoupon = async (code) => { await api.delete(`/admin/coupons/${code}`); loadCoupons(); };
  const loadCoupons = async () => { const r = await api.get("/admin/coupons"); setCoupons(r.data); };

  const load = async () => {
    const [s, u, p, a, ad, pl, ct, pc, cp] = await Promise.all([
      api.get("/admin/stats"), api.get("/admin/users"), api.get("/admin/payments"),
      api.get("/admin/admins"), api.get("/admin/ads"), api.get("/billing/plans"), api.get("/content"),
      api.get("/plans/config"), api.get("/admin/coupons"),
    ]);
    setStats(s.data); setUsers(u.data); setPayments(p.data); setAdmins(a.data); setAds(ad.data);
    setPrices(pl.data.prices);
    setContent({ landing_headline: ct.data.landing_headline || "", landing_tagline: ct.data.landing_tagline || "", footer_text: ct.data.footer_text || "", plans: ct.data.plans || {} });
    setPlanConfig(pc.data); setCoupons(cp.data);
  };
  useEffect(() => { if (user?.is_admin) load(); }, [user]);

  if (user && !user.is_admin) return <Navigate to="/dashboard"/>;

  const approve = async (pid) => { await api.post(`/admin/payments/${pid}/approve`); toast.success("Approved + plan activated"); load(); };
  const addAdmin = async () => { if (!newAdmin) return; await api.post("/admin/admins", { email: newAdmin.trim().toLowerCase() }); setNewAdmin(""); load(); };
  const delAdmin = async (email) => { await api.delete(`/admin/admins/${encodeURIComponent(email)}`); load(); };
  const addAd = async () => { if (!newAd.title) return; await api.post("/admin/ads", newAd); setNewAd({ title: "", video_url: "", image_url: "", duration: 15, budget: 0, expiry: "" }); load(); };
  const delAd = async (id) => { await api.delete(`/admin/ads/${id}`); load(); };

  const resetUser = async (u) => {
    const first = window.confirm(`⚠️ RESET all data for ${u.email}?\n\nThis permanently deletes ALL their reviews, annotations and comments. This cannot be undone.`);
    if (!first) return;
    const typed = window.prompt(`To confirm, type the user's email exactly:\n${u.email}`);
    if (typed?.trim().toLowerCase() !== u.email.toLowerCase()) { toast.error("Email did not match — reset cancelled"); return; }
    try {
      const r = await api.post(`/admin/users/${u.user_id}/reset`);
      toast.success(`Wiped ${r.data.reviews_deleted} reviews · ${r.data.annotations_deleted} annotations · ${r.data.comments_deleted} comments`);
      load();
    } catch { toast.error("Reset failed"); }
  };

  const TABS = [["stats","Overview"],["content","Content"],["features","Plans & Offers"],["coupons","Coupons"],["pricing","Pricing"],["payments","Payments"],["ads","Ads"],["admins","Admins"],["users","Users"]];

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#EDEDF0]">
      <TopNav/>
      <main className="max-w-[1200px] mx-auto px-4 sm:px-8 py-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5A67D8]">Admin · Worxpher</p>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Console.</h1>
        <div className="mt-6 flex gap-1 border-b border-[#232326] overflow-x-auto no-scrollbar">
          {TABS.map(([id, label]) => (
            <button key={id} data-testid={`admin-tab-${id}`} onClick={() => setTab(id)} className={`px-3 py-2 font-mono text-[10px] uppercase tracking-wider border-b-2 ${tab === id ? "border-[#5A67D8] text-white" : "border-transparent text-[#8A8A93] hover:text-white"}`}>{label}</button>
          ))}
        </div>
        <div className="mt-6">
          {tab === "stats" && stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="admin-stats">
              {[["Users", stats.users_total],["Active today", stats.active_today],["Reviews", stats.reviews_total],["Pending payments", stats.pending_payments]].map(([l, v]) => (
                <div key={l} className="border border-[#232326] rounded-sm bg-[#121214] p-4"><div className="text-2xl font-semibold">{v}</div><div className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A93] mt-1">{l}</div></div>
              ))}
              <div className="border border-[#232326] rounded-sm bg-[#121214] p-4 col-span-2 md:col-span-4"><p className="font-mono text-[10px] uppercase text-[#8A8A93] mb-2">By plan</p><div className="flex gap-4 flex-wrap text-sm">{Object.entries(stats.by_plan).map(([k,v]) => <span key={k}><b className="text-[#5A67D8]">{v}</b> {k}</span>)}</div></div>
            </div>
          )}
          {tab === "content" && (
            <div className="space-y-4 max-w-2xl" data-testid="admin-content">
              <div className="border border-[#232326] rounded-sm bg-[#121214] p-5 space-y-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93]">Landing / login copy</p>
                <div><label className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]">Headline</label><Input data-testid="content-headline" value={content.landing_headline} onChange={e=>setContent({...content, landing_headline:e.target.value})} className="bg-[#0A0A0B] border-[#232326] mt-1"/></div>
                <div><label className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]">Tagline</label><textarea data-testid="content-tagline" value={content.landing_tagline} onChange={e=>setContent({...content, landing_tagline:e.target.value})} rows={3} className="w-full bg-[#0A0A0B] border border-[#232326] rounded-sm mt-1 p-2 text-sm"/></div>
                <div><label className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]">Footer text</label><Input data-testid="content-footer" value={content.footer_text} onChange={e=>setContent({...content, footer_text:e.target.value})} className="bg-[#0A0A0B] border-[#232326] mt-1"/></div>
              </div>
              <div className="border border-[#232326] rounded-sm bg-[#121214] p-5 space-y-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93]">Pricing plan copy (leave blank to use defaults)</p>
                {["free","creator","studio","business"].map(id => (
                  <div key={id} className="grid sm:grid-cols-2 gap-2 pb-3 border-b border-[#232326] last:border-0">
                    <div><label className="font-mono text-[10px] uppercase tracking-wider text-[#5A67D8]">{id} · name</label><Input data-testid={`content-plan-name-${id}`} value={content.plans?.[id]?.name || ""} onChange={e=>setPlanField(id,"name",e.target.value)} className="bg-[#0A0A0B] border-[#232326] mt-1"/></div>
                    <div><label className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]">perks (one per line)</label><textarea data-testid={`content-plan-perks-${id}`} value={(content.plans?.[id]?.perks || []).join("\n")} onChange={e=>setPlanField(id,"perks",e.target.value.split("\n").filter(Boolean))} rows={3} className="w-full bg-[#0A0A0B] border border-[#232326] rounded-sm mt-1 p-2 text-xs font-mono"/></div>
                  </div>
                ))}
              </div>
              <Button onClick={saveContent} data-testid="save-content" className="bg-[#5A67D8] hover:bg-[#4C51BF] rounded-sm">Save content</Button>
            </div>
          )}
          {tab === "features" && (
            <div className="space-y-4 max-w-3xl" data-testid="admin-features">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93]">Feature limits, plan on/off & offers · -1 = unlimited</p>
              {["free","creator","studio","business"].map(id => {
                const pc = planConfig[id] || { limits: {}, offer: {} };
                const L = pc.limits || {};
                const numFields = [["max_reviews","Max reviews"],["max_reviewers","Max reviewers"],["storage_gb","Storage GB"]];
                const boolFields = [["ads_on_export","Ads on export"],["white_label","White-label"],["local_broadcast","Local broadcast"],["pdf_export","PDF export"]];
                return (
                  <div key={id} className="border border-[#232326] rounded-sm bg-[#121214] p-4" data-testid={`plan-cfg-${id}`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-xs uppercase tracking-[0.2em] text-[#5A67D8]">{id}</span>
                      <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" data-testid={`plan-enabled-${id}`} checked={pc.enabled !== false} onChange={e=>setEnabled(id, e.target.checked)}/><span className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]">{pc.enabled !== false ? "Enabled" : "Hidden"}</span></label>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {numFields.map(([k,label]) => (
                        <div key={k}><label className="font-mono text-[9px] uppercase tracking-wider text-[#8A8A93]">{label}</label><Input type="number" data-testid={`limit-${id}-${k}`} value={L[k] ?? 0} onChange={e=>setLimit(id,k,parseInt(e.target.value))} className="bg-[#0A0A0B] border-[#232326] mt-1 h-8"/></div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-3">
                      {boolFields.map(([k,label]) => (
                        <label key={k} className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" data-testid={`limit-${id}-${k}`} checked={!!L[k]} onChange={e=>setLimit(id,k,e.target.checked)}/><span className="font-mono text-[10px] text-[#EDEDF0]">{label}</span></label>
                      ))}
                    </div>
                    {id !== "free" && (
                      <div className="flex items-end gap-3 mt-3 pt-3 border-t border-[#232326]">
                        <div><label className="font-mono text-[9px] uppercase tracking-wider text-[#F59E0B]">Offer %</label><Input type="number" data-testid={`offer-percent-${id}`} value={pc.offer?.percent || 0} onChange={e=>setOffer(id,"percent",parseInt(e.target.value)||0)} className="bg-[#0A0A0B] border-[#232326] mt-1 h-8 w-24"/></div>
                        <div><label className="font-mono text-[9px] uppercase tracking-wider text-[#F59E0B]">Until (date)</label><Input type="date" data-testid={`offer-until-${id}`} value={pc.offer?.until || ""} onChange={e=>setOffer(id,"until",e.target.value)} className="bg-[#0A0A0B] border-[#232326] mt-1 h-8"/></div>
                      </div>
                    )}
                  </div>
                );
              })}
              <Button onClick={savePlanConfig} data-testid="save-plan-config" className="bg-[#5A67D8] hover:bg-[#4C51BF] rounded-sm">Save plans & offers</Button>
            </div>
          )}
          {tab === "coupons" && (
            <div className="space-y-4 max-w-2xl" data-testid="admin-coupons">
              <div className="border border-[#232326] rounded-sm bg-[#121214] p-4 grid sm:grid-cols-4 gap-2 items-end">
                <div><label className="font-mono text-[9px] uppercase tracking-wider text-[#8A8A93]">Code</label><Input data-testid="coupon-code" value={newCoupon.code} onChange={e=>setNewCoupon({...newCoupon, code:e.target.value.toUpperCase()})} placeholder="WELCOME20" className="bg-[#0A0A0B] border-[#232326] mt-1 font-mono uppercase"/></div>
                <div><label className="font-mono text-[9px] uppercase tracking-wider text-[#8A8A93]">Percent %</label><Input type="number" data-testid="coupon-percent" value={newCoupon.percent} onChange={e=>setNewCoupon({...newCoupon, percent:parseInt(e.target.value)||0})} className="bg-[#0A0A0B] border-[#232326] mt-1"/></div>
                <div><label className="font-mono text-[9px] uppercase tracking-wider text-[#8A8A93]">Expires</label><Input type="date" data-testid="coupon-expiry" value={newCoupon.expires_at} onChange={e=>setNewCoupon({...newCoupon, expires_at:e.target.value})} className="bg-[#0A0A0B] border-[#232326] mt-1"/></div>
                <Button onClick={addCoupon} data-testid="create-coupon" className="bg-[#5A67D8] hover:bg-[#4C51BF] rounded-sm">Create</Button>
                <label className="flex items-center gap-1.5 cursor-pointer sm:col-span-4"><input type="checkbox" data-testid="coupon-newusers" checked={newCoupon.new_users_only} onChange={e=>setNewCoupon({...newCoupon, new_users_only:e.target.checked})}/><span className="font-mono text-[10px] text-[#8A8A93]">New users only · single-use per user</span></label>
              </div>
              <div className="border border-[#232326] rounded-sm overflow-hidden">
                <table className="w-full text-sm"><thead><tr className="border-b border-[#232326] text-left"><th className="p-3 font-mono text-[10px] uppercase">Code</th><th className="p-3 font-mono text-[10px] uppercase">Off</th><th className="p-3 font-mono text-[10px] uppercase">Expires</th><th className="p-3 font-mono text-[10px] uppercase">New only</th><th className="p-3 font-mono text-[10px] uppercase">Used</th><th className="p-3"></th></tr></thead><tbody>
                {coupons.length === 0 && <tr><td colSpan={6} className="p-4 font-mono text-[10px] text-[#5C5C66]">No coupons yet.</td></tr>}
                {coupons.map(c => <tr key={c.code} className="border-b border-[#232326]" data-testid={`coupon-row-${c.code}`}><td className="p-3 font-mono">{c.code}</td><td className="p-3">{c.percent}%</td><td className="p-3 font-mono text-xs">{c.expires_at || "—"}</td><td className="p-3">{c.new_users_only ? "Yes" : "No"}</td><td className="p-3">{c.redemptions || 0}</td><td className="p-3"><button data-testid={`delete-coupon-${c.code}`} onClick={()=>delCoupon(c.code)} className="text-[#EF4444] hover:underline font-mono text-[10px] uppercase">Delete</button></td></tr>)}
                </tbody></table>
              </div>
            </div>
          )}
          {tab === "pricing" && (
            <div className="border border-[#232326] rounded-sm bg-[#121214] p-5 max-w-md" data-testid="admin-pricing">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93] mb-4">Plan prices (GST 18% inclusive)</p>
              {["creator","studio","business"].map(k => (
                <div key={k} className="flex items-center gap-3 mb-3">
                  <span className="font-mono text-xs uppercase tracking-wider w-24">{k}</span>
                  <span className="font-mono text-xs">₹</span>
                  <Input data-testid={`price-${k}`} type="number" value={prices[k]} onChange={e => setPrices({...prices, [k]: +e.target.value})} className="bg-[#0A0A0B] border-[#232326] max-w-[140px]"/>
                </div>
              ))}
              <Button onClick={savePrices} data-testid="save-prices" className="bg-[#5A67D8] hover:bg-[#4C51BF] rounded-sm mt-2">Save</Button>
            </div>
          )}
          {tab === "payments" && (
            <div className="border border-[#232326] rounded-sm bg-[#121214] overflow-hidden" data-testid="admin-payments-table">
              <table className="w-full text-sm"><thead><tr className="border-b border-[#232326] text-left"><th className="p-3 font-mono text-[10px] uppercase">User</th><th className="p-3 font-mono text-[10px] uppercase">Plan</th><th className="p-3 font-mono text-[10px] uppercase">Amount</th><th className="p-3 font-mono text-[10px] uppercase">Txn</th><th className="p-3 font-mono text-[10px] uppercase">Status</th><th></th></tr></thead><tbody>
              {payments.map(p => <tr key={p.id} className="border-b border-[#232326]"><td className="p-3">{p.email}</td><td className="p-3">{p.plan}</td><td className="p-3 font-mono">₹{p.amount}</td><td className="p-3 font-mono text-xs">{p.txn_ref}</td><td className="p-3 font-mono text-xs">{p.status}</td><td className="p-3">{p.status === "pending" && <Button data-testid={`approve-${p.id}`} onClick={() => approve(p.id)} className="bg-[#10B981] text-black hover:bg-[#0a8763] h-7 px-2 rounded-sm text-xs">Approve</Button>}</td></tr>)}
              </tbody></table>
            </div>
          )}
          {tab === "ads" && (
            <div className="space-y-4">
              <div className="border border-[#232326] rounded-sm bg-[#121214] p-4">
                <p className="font-mono text-[10px] uppercase text-[#8A8A93] mb-3">Add ad</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  <Input placeholder="Title" value={newAd.title} onChange={e=>setNewAd({...newAd, title:e.target.value})} data-testid="ad-title" className="bg-[#0A0A0B] border-[#232326]"/>
                  <Input placeholder="Video URL (YT/MP4)" value={newAd.video_url} onChange={e=>setNewAd({...newAd, video_url:e.target.value})} data-testid="ad-video-url" className="bg-[#0A0A0B] border-[#232326]"/>
                  <Input placeholder="Image URL" value={newAd.image_url} onChange={e=>setNewAd({...newAd, image_url:e.target.value})} className="bg-[#0A0A0B] border-[#232326]"/>
                  <Input placeholder="Duration (sec)" type="number" value={newAd.duration} onChange={e=>setNewAd({...newAd, duration:+e.target.value})} className="bg-[#0A0A0B] border-[#232326]"/>
                  <Input placeholder="Budget ₹" type="number" value={newAd.budget} onChange={e=>setNewAd({...newAd, budget:+e.target.value})} className="bg-[#0A0A0B] border-[#232326]"/>
                  <Input placeholder="Expiry (YYYY-MM-DD)" value={newAd.expiry} onChange={e=>setNewAd({...newAd, expiry:e.target.value})} className="bg-[#0A0A0B] border-[#232326]"/>
                </div>
                <Button data-testid="add-ad-btn" onClick={addAd} className="mt-3 bg-[#5A67D8] hover:bg-[#4C51BF] rounded-sm"><Plus className="w-3.5 h-3.5 mr-1.5"/>Add ad</Button>
              </div>
              <div className="space-y-2">{ads.map(a => (
                <div key={a.id} className="border border-[#232326] rounded-sm bg-[#121214] p-3 flex items-center justify-between" data-testid={`ad-row-${a.id}`}>
                  <div><div className="font-medium">{a.title}</div><div className="font-mono text-[10px] text-[#8A8A93]">{a.plays} plays · {a.clicks} clicks · ₹{a.budget} budget · {a.duration}s</div></div>
                  <button onClick={() => delAd(a.id)} className="text-[#EF4444] hover:opacity-70"><Trash2 className="w-4 h-4"/></button>
                </div>
              ))}</div>
            </div>
          )}
          {tab === "admins" && (
            <div className="space-y-4">
              <div className="flex gap-2"><Input value={newAdmin} onChange={e=>setNewAdmin(e.target.value)} placeholder="email@domain.com" data-testid="new-admin-email" className="bg-[#0A0A0B] border-[#232326]"/><Button onClick={addAdmin} data-testid="add-admin-btn" className="bg-[#5A67D8] hover:bg-[#4C51BF] rounded-sm">Add admin</Button></div>
              <div className="space-y-2">{admins.map(a => (
                <div key={a.email} className="flex items-center justify-between border border-[#232326] rounded-sm bg-[#121214] p-3">
                  <span>{a.email} {a.default && <span className="font-mono text-[10px] text-[#5A67D8] ml-2">DEFAULT</span>}</span>
                  {!a.default && <button onClick={() => delAdmin(a.email)} className="text-[#EF4444]"><Trash2 className="w-4 h-4"/></button>}
                </div>
              ))}</div>
            </div>
          )}
          {tab === "users" && (
            <div className="border border-[#232326] rounded-sm bg-[#121214] overflow-hidden">
              <table className="w-full text-sm"><thead><tr className="border-b border-[#232326] text-left"><th className="p-3 font-mono text-[10px] uppercase">User</th><th className="p-3 font-mono text-[10px] uppercase">Email</th><th className="p-3 font-mono text-[10px] uppercase">Plan</th><th className="p-3 font-mono text-[10px] uppercase">Last login</th><th className="p-3 font-mono text-[10px] uppercase">Actions</th></tr></thead><tbody>
              {users.map(u => <tr key={u.user_id} className="border-b border-[#232326]"><td className="p-3">{u.name}</td><td className="p-3 font-mono text-xs">{u.email}</td><td className="p-3"><span className="font-mono text-[10px] uppercase px-2 py-0.5 border border-[#5A67D8] text-[#5A67D8] rounded-sm">{u.plan}</span></td><td className="p-3 font-mono text-xs text-[#8A8A93]">{u.last_login ? new Date(u.last_login).toLocaleString() : "—"}</td><td className="p-3"><Button data-testid={`reset-user-${u.user_id}`} onClick={() => resetUser(u)} className="bg-[#1a0a0a] border border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444] hover:text-white h-7 px-2 rounded-sm text-xs"><Trash2 className="w-3 h-3 mr-1"/>Reset data</Button></td></tr>)}
              </tbody></table>
            </div>
          )}
        </div>
      </main>
      <Footer/>
    </div>
  );
}
