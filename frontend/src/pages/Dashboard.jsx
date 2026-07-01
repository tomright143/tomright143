import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import TopNav from "@/components/TopNav";
import Footer from "@/components/Footer";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Play, Trash2, Clock, Star, Share2, Users, Folder, TrendingUp, Award, Edit, AlertTriangle, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { parseVideoUrl } from "@/lib/videoUtils";
import { setLocalFile } from "@/lib/localFileStore";
import { useAuth } from "@/contexts/AuthContext";

export default function Dashboard() {
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [allowDownload, setAllowDownload] = useState(true);
  const [sourceLocal, setSourceLocal] = useState(false);
  const [localFile, setLocalFileState] = useState(null);
  const navigate = useNavigate();
  const { user, refresh } = useAuth();

  const [payments, setPayments] = useState([]);

  const fetchAll = async () => {
    try {
      const [r, s, pm] = await Promise.all([api.get("/reviews"), api.get("/me/stats"), api.get("/billing/payments")]);
      setReviews(r.data); setStats(s.data); setPayments(pm.data);
    } catch { toast.error("Could not load"); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, []);

  const create = async () => {
    if (!title) return toast.error("Title required");
    let payload;
    if (sourceLocal) {
      if (!localFile) return toast.error("Please locate a video file");
      payload = { title, video_url: `local://${localFile.name}`, video_type: "local", allow_download: allowDownload };
    } else {
      if (!url) return toast.error("Title and URL required");
      const parsed = parseVideoUrl(url);
      if (!parsed) return toast.error("URL must be YouTube or Vimeo");
      payload = { title, video_url: url, video_type: parsed.type, allow_download: allowDownload };
    }
    try {
      const r = await api.post("/reviews", payload);
      if (sourceLocal && localFile) setLocalFile(r.data.id, localFile);
      setOpen(false); setTitle(""); setUrl(""); setAllowDownload(false); setSourceLocal(false); setLocalFileState(null);
      navigate(`/workspace/${r.data.id}`);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const [editing, setEditing] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAllow, setEditAllow] = useState(true);

  const openEdit = (e, r) => { e.stopPropagation(); setEditing(r); setEditTitle(r.title); setEditAllow(r.allow_download); };
  const saveEdit = async () => {
    await api.patch(`/reviews/${editing.id}`, { title: editTitle, allow_download: editAllow });
    setEditing(null); fetchAll(); toast.success("Project updated");
  };

  const planUntil = user?.plan_until ? new Date(user.plan_until) : null;
  const daysLeft = planUntil ? Math.max(0, Math.ceil((planUntil - new Date()) / (1000*60*60*24))) : null;
  const danger = daysLeft != null && daysLeft <= 7;

  const [cancelOpen, setCancelOpen] = useState(false);
  const cancelPlan = async () => {
    try {
      await api.post("/billing/cancel");
      toast.success("Plan cancelled — active till expiry date");
      setCancelOpen(false);
      await refresh();
      fetchAll();
    } catch (e) { toast.error("Could not cancel — try again"); }
  };

  const del = async (e, id) => { e.stopPropagation(); if (!window.confirm("Delete this review?")) return; await api.delete(`/reviews/${id}`); fetchAll(); };
  const share = (e, token) => { e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}/shared/${token}`); toast.success("Share link copied"); };

  const refLink = `${window.location.origin}/login?ref=${user?.user_id}`;
  const copyRef = () => { navigator.clipboard.writeText(refLink); toast.success("Referral link copied"); };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#EDEDF0]">
      <TopNav />
      <main className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5C5C66] mb-2">Workspace · Welcome {user?.name?.split(" ")[0]}</p>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">Reviews.</h1>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="new-review-button" className="bg-[#5A67D8] hover:bg-[#4C51BF] text-white rounded-sm h-11 px-5"><Plus className="w-4 h-4 mr-2"/>New review</Button></DialogTrigger>
            <DialogContent className="bg-[#121214] border-[#232326] text-[#EDEDF0]">
              <DialogHeader><DialogTitle className="font-mono uppercase tracking-wider text-sm">Create review</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5"><Label className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#8A8A93]">Title</Label><Input data-testid="new-review-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Q4 brand cut v3" className="bg-[#0A0A0B] border-[#232326] rounded-sm"/></div>
                <div className="flex gap-2">
                  <button type="button" data-testid="source-url" onClick={() => setSourceLocal(false)} className={`flex-1 h-9 rounded-sm border font-mono text-[10px] uppercase tracking-wider ${!sourceLocal ? "border-[#5A67D8] text-white bg-[#5A67D8]/10" : "border-[#232326] text-[#8A8A93]"}`}>Stream URL</button>
                  <button type="button" data-testid="source-local" onClick={() => setSourceLocal(true)} className={`flex-1 h-9 rounded-sm border font-mono text-[10px] uppercase tracking-wider ${sourceLocal ? "border-[#5A67D8] text-white bg-[#5A67D8]/10" : "border-[#232326] text-[#8A8A93]"}`}>Local file · live</button>
                </div>
                {!sourceLocal ? (
                  <div className="space-y-1.5"><Label className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#8A8A93]">Stream URL</Label><Input data-testid="new-review-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." className="bg-[#0A0A0B] border-[#232326] rounded-sm font-mono text-xs"/><p className="text-[10px] font-mono text-[#5C5C66] mt-1">Supported: YouTube & Vimeo links.</p></div>
                ) : (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 px-3 py-3 border border-dashed border-[#5A67D8] rounded-sm cursor-pointer hover:bg-[#5A67D8]/10" data-testid="local-file-input-label">
                      <Folder className="w-4 h-4 text-[#5A67D8]"/>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#EDEDF0]">{localFile ? localFile.name : "Locate video file…"}</span>
                      <input data-testid="local-file-input" type="file" accept="video/*" className="hidden" onChange={(e) => setLocalFileState(e.target.files?.[0] || null)}/>
                    </label>
                    <p className="text-[10px] font-mono text-[#5C5C66]">Streams live from your computer to reviewers while your tab is open — nothing is uploaded.</p>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-[#232326]"><div><Label className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#8A8A93]">Allow download</Label></div><Switch checked={allowDownload} onCheckedChange={setAllowDownload}/></div>
              </div>
              <DialogFooter><Button onClick={create} data-testid="create-review-submit" className="bg-[#5A67D8] hover:bg-[#4C51BF] rounded-sm">Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Subscription card — show whenever paid plan */}
        {user?.plan && user.plan !== "free" && (
          <div className={`border rounded-sm p-4 mb-6 flex items-center justify-between gap-4 flex-wrap ${danger ? "border-[#EF4444] bg-[#1a0a0a]" : "border-[#232326] bg-[#121214]"}`} data-testid="subscription-card">
            <div className="flex items-center gap-3">
              {danger && <AlertTriangle className="w-5 h-5 text-[#EF4444]"/>}
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93]">Plan · {user.plan}</p>
                {daysLeft != null ? (
                  <>
                    <p className={`text-lg font-semibold ${danger ? "text-[#EF4444]" : ""}`} data-testid="days-left">{daysLeft} day{daysLeft !== 1 ? "s" : ""} left {danger && "· EXPIRING SOON"}</p>
                    <p className="font-mono text-[10px] text-[#5C5C66]">Expires on {planUntil.toLocaleDateString()}</p>
                  </>
                ) : (
                  <p className="text-lg font-semibold">Active · expiry not set</p>
                )}
                {daysLeft != null && <div className="w-48 h-1 bg-[#232326] rounded-sm mt-1.5"><div className={`h-full rounded-sm ${danger ? "bg-[#EF4444]" : "bg-[#5A67D8]"}`} style={{ width: `${Math.min(100, (daysLeft / 30) * 100)}%` }}/></div>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => navigate("/pricing")} data-testid="pay-advance" className={`${danger ? "bg-[#EF4444] hover:bg-[#dc2626]" : "bg-[#5A67D8] hover:bg-[#4C51BF]"} text-white rounded-sm h-9`}>Pay advance</Button>
              {!user.cancel_at_end ? <Button onClick={(e) => { e.stopPropagation(); setCancelOpen(true); }} data-testid="cancel-plan" className="bg-[#0A0A0B] border border-[#232326] hover:bg-[#1a1a1d] text-white rounded-sm h-9 text-xs">Cancel plan</Button> : <span className="font-mono text-[10px] uppercase tracking-wider text-[#F59E0B] self-center">Cancelled · ends on expiry</span>}
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10" data-testid="stats-grid">
          {[
            { label: "Total projects", value: stats?.total_projects ?? "—", icon: Folder },
            { label: "This month", value: stats?.monthly_projects ?? "—", icon: TrendingUp },
            { label: "Stars received", value: stats?.total_stars ?? "—", icon: Star },
            { label: "Referrals", value: `${stats?.referrals ?? 0}/10`, icon: Users },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="border border-[#232326] rounded-sm bg-[#121214] p-4 rise" style={{ animationDelay: `${i*60}ms` }}>
                <Icon className="w-4 h-4 text-[#5A67D8] mb-2"/>
                <div className="text-2xl font-semibold tracking-tight">{s.value}</div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#8A8A93] mt-1">{s.label}</div>
              </div>
            );
          })}
        </div>

        {/* Referral progress */}
        <div className="border border-[#232326] rounded-sm bg-[#121214] p-5 mb-10" data-testid="referral-card">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2"><Award className="w-4 h-4 text-[#5A67D8]"/><span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5A67D8]">Bonus · Free Creator month</span></div>
              <p className="text-sm text-[#EDEDF0] mt-2">Invite <b>10 friends</b> + create <b>3 projects</b> → unlock <b>Creator</b> plan free for 30 days.</p>
              <p className="font-mono text-[10px] text-[#8A8A93] mt-1">Progress · {stats?.referrals ?? 0}/10 invites · {stats?.total_projects ?? 0}/3 projects {stats?.bonus_eligible && <span className="text-[#10B981]">· UNLOCKED</span>}</p>
            </div>
            <Button onClick={copyRef} data-testid="copy-referral" className="bg-[#0A0A0B] border border-[#5A67D8] text-[#5A67D8] hover:bg-[#5A67D8] hover:text-white rounded-sm h-9"><Share2 className="w-3.5 h-3.5 mr-1.5"/><span className="font-mono text-xs uppercase tracking-wider">Copy invite link</span></Button>
          </div>
        </div>

        {loading ? <div className="font-mono text-sm text-[#8A8A93]">Loading…</div> :
          reviews.length === 0 ? (
            <div className="border border-dashed border-[#232326] rounded-sm p-12 text-center" data-testid="empty-reviews"><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5C5C66]">No reviews yet</p></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reviews.map((r, i) => (
                <div key={r.id} data-testid={`review-card-${r.id}`} onClick={() => navigate(`/workspace/${r.id}`)} className="group cursor-pointer border border-[#232326] hover:border-[#5A67D8] rounded-sm bg-[#121214] overflow-hidden rise transition" style={{ animationDelay: `${i*60}ms` }}>
                  <div className="aspect-video bg-[#0A0A0B] relative overflow-hidden">
                    {r.video_type === "youtube" ? <img src={`https://i.ytimg.com/vi/${r.video_id}/hqdefault.jpg`} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition"/> : <div className="w-full h-full flex items-center justify-center"><Play className="w-10 h-10 text-[#3A3A40]"/></div>}
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/70 rounded-sm"><span className="font-mono text-[9px] uppercase tracking-wider text-[#8A8A93]">{r.video_type}</span></div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium tracking-tight truncate">{r.title}</h3>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-3 text-[#5C5C66] font-mono text-[10px]"><Clock className="w-3 h-3"/>{new Date(r.created_at).toLocaleDateString()}<span>· {r.view_count || 0} views</span></div>
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => share(e, r.share_token)} data-testid={`share-${r.id}`} className="text-[#5C5C66] hover:text-[#5A67D8] p-1"><Share2 className="w-3.5 h-3.5"/></button>
                        <button onClick={(e) => del(e, r.id)} data-testid={`delete-review-${r.id}`} className="text-[#5C5C66] hover:text-[#EF4444] p-1"><Trash2 className="w-3.5 h-3.5"/></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </main>
      {/* Subscription history */}
      {payments.length > 0 && (
        <section className="max-w-[1400px] mx-auto px-4 sm:px-8 pb-12" data-testid="subscription-history">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5C5C66] mb-3">Subscription history</p>
          <div className="border border-[#232326] rounded-sm bg-[#121214] overflow-hidden">
            <table className="w-full text-sm"><thead><tr className="border-b border-[#232326] text-left"><th className="p-3 font-mono text-[10px] uppercase">Date</th><th className="p-3 font-mono text-[10px] uppercase">Plan</th><th className="p-3 font-mono text-[10px] uppercase">Amount</th><th className="p-3 font-mono text-[10px] uppercase">Txn</th><th className="p-3 font-mono text-[10px] uppercase">Status</th></tr></thead><tbody>
              {payments.map(p => (
                <tr key={p.id} className="border-b border-[#232326]" data-testid={`payment-row-${p.id}`}>
                  <td className="p-3 font-mono text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="p-3 uppercase font-mono text-xs">{p.plan}</td>
                  <td className="p-3 font-mono">₹{p.amount} <span className="text-[#5C5C66] text-[10px]">(₹{p.base}+GST ₹{p.gst})</span></td>
                  <td className="p-3 font-mono text-xs text-[#8A8A93]">{p.txn_ref || "—"}</td>
                  <td className="p-3"><span className={`font-mono text-[10px] uppercase px-2 py-0.5 rounded-sm border ${p.status === "approved" ? "border-[#10B981] text-[#10B981]" : "border-[#F59E0B] text-[#F59E0B]"}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </section>
      )}
      {editing && (
        <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
          <DialogContent className="bg-[#121214] border-[#232326] text-[#EDEDF0]">
            <DialogHeader><DialogTitle className="font-mono uppercase tracking-wider text-sm">Edit project</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div><Label className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#8A8A93]">Title</Label><Input data-testid="edit-title-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="bg-[#0A0A0B] border-[#232326] rounded-sm mt-1"/></div>
              <div className="flex items-center justify-between pt-2 border-t border-[#232326]"><Label className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#8A8A93]">Allow clean download</Label><Switch data-testid="edit-allow-download" checked={editAllow} onCheckedChange={setEditAllow}/></div>
              <p className="text-[10px] font-mono text-[#5C5C66]">When ON, downloaded video is clean (no watermark). When OFF, download is disabled.</p>
            </div>
            <DialogFooter><Button onClick={saveEdit} data-testid="save-edit" className="bg-[#5A67D8] hover:bg-[#4C51BF] rounded-sm">Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent className="bg-[#121214] border-[#232326] text-[#EDEDF0]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono uppercase tracking-wider text-sm">Cancel {user?.plan} plan?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#8A8A93] text-sm">It will remain active until the expiry date, then revert to Free (3-project cap). You can resubscribe anytime.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-plan-dismiss" className="bg-[#0A0A0B] border-[#232326] text-white hover:bg-[#1a1a1d] rounded-sm">Keep plan</AlertDialogCancel>
            <AlertDialogAction data-testid="confirm-cancel-plan" onClick={cancelPlan} className="bg-[#EF4444] hover:bg-[#dc2626] text-white rounded-sm">Yes, cancel</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Footer/>
    </div>
  );
}