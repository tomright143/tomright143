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

  const load = async () => {
    const [s, u, p, a, ad] = await Promise.all([
      api.get("/admin/stats"), api.get("/admin/users"), api.get("/admin/payments"),
      api.get("/admin/admins"), api.get("/admin/ads"),
    ]);
    setStats(s.data); setUsers(u.data); setPayments(p.data); setAdmins(a.data); setAds(ad.data);
  };
  useEffect(() => { if (user?.is_admin) load(); }, [user]);

  if (user && !user.is_admin) return <Navigate to="/dashboard"/>;

  const approve = async (pid) => { await api.post(`/admin/payments/${pid}/approve`); toast.success("Approved + plan activated"); load(); };
  const addAdmin = async () => { if (!newAdmin) return; await api.post("/admin/admins", { email: newAdmin.trim().toLowerCase() }); setNewAdmin(""); load(); };
  const delAdmin = async (email) => { await api.delete(`/admin/admins/${encodeURIComponent(email)}`); load(); };
  const addAd = async () => { if (!newAd.title) return; await api.post("/admin/ads", newAd); setNewAd({ title: "", video_url: "", image_url: "", duration: 15, budget: 0, expiry: "" }); load(); };
  const delAd = async (id) => { await api.delete(`/admin/ads/${id}`); load(); };

  const TABS = [["stats","Overview"],["payments","Payments"],["ads","Ads"],["admins","Admins"],["users","Users"]];

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#EDEDF0]">
      <TopNav/>
      <main className="max-w-[1200px] mx-auto px-4 sm:px-8 py-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5A67D8]">Admin · Review.io</p>
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
              <table className="w-full text-sm"><thead><tr className="border-b border-[#232326] text-left"><th className="p-3 font-mono text-[10px] uppercase">User</th><th className="p-3 font-mono text-[10px] uppercase">Email</th><th className="p-3 font-mono text-[10px] uppercase">Plan</th><th className="p-3 font-mono text-[10px] uppercase">Last login</th></tr></thead><tbody>
              {users.map(u => <tr key={u.user_id} className="border-b border-[#232326]"><td className="p-3">{u.name}</td><td className="p-3 font-mono text-xs">{u.email}</td><td className="p-3"><span className="font-mono text-[10px] uppercase px-2 py-0.5 border border-[#5A67D8] text-[#5A67D8] rounded-sm">{u.plan}</span></td><td className="p-3 font-mono text-xs text-[#8A8A93]">{u.last_login ? new Date(u.last_login).toLocaleString() : "—"}</td></tr>)}
              </tbody></table>
            </div>
          )}
        </div>
      </main>
      <Footer/>
    </div>
  );
}
