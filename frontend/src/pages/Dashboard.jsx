import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import TopNav from "@/components/TopNav";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Play, Trash2, Clock, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { parseVideoUrl } from "@/lib/videoUtils";

export default function Dashboard() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [allowDownload, setAllowDownload] = useState(false);
  const navigate = useNavigate();

  const fetchReviews = async () => {
    try { const r = await api.get("/reviews"); setReviews(r.data); }
    catch { toast.error("Could not load reviews"); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchReviews(); }, []);

  const create = async () => {
    if (!title || !url) { toast.error("Title and URL required"); return; }
    const parsed = parseVideoUrl(url);
    if (!parsed) { toast.error("URL must be YouTube, Vimeo or Google Drive"); return; }
    try {
      const r = await api.post("/reviews", { title, video_url: url, video_type: parsed.type, allow_download: allowDownload });
      setOpen(false); setTitle(""); setUrl(""); setAllowDownload(false);
      navigate(`/workspace/${r.data.id}`);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this review?")) return;
    await api.delete(`/reviews/${id}`); fetchReviews();
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#EDEDF0]">
      <TopNav />
      <main className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5C5C66] mb-2">Workspace · My active reviews</p>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">Reviews.</h1>
            <p className="text-[#8A8A93] mt-2 text-sm">Stream-only. Annotate frame-accurately. Comment in threads. Call in P2P.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="new-review-button" className="bg-[#5A67D8] hover:bg-[#4C51BF] text-white rounded-sm h-11 px-5">
                <Plus className="w-4 h-4 mr-2"/> New review
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#121214] border-[#232326] text-[#EDEDF0]">
              <DialogHeader>
                <DialogTitle className="font-mono uppercase tracking-wider text-sm">Create review</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#8A8A93]">Title</Label>
                  <Input data-testid="new-review-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Q4 brand cut v3" className="bg-[#0A0A0B] border-[#232326] rounded-sm"/>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#8A8A93]">Stream URL (YouTube / Vimeo / Drive)</Label>
                  <Input data-testid="new-review-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." className="bg-[#0A0A0B] border-[#232326] rounded-sm font-mono text-xs"/>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[#232326]">
                  <div>
                    <Label className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#8A8A93]">Allow download</Label>
                    <p className="text-xs text-[#5C5C66] mt-1">Off forces watermark lock</p>
                  </div>
                  <Switch checked={allowDownload} onCheckedChange={setAllowDownload} data-testid="new-review-allow-download"/>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={create} data-testid="create-review-submit" className="bg-[#5A67D8] hover:bg-[#4C51BF] text-white rounded-sm">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="font-mono text-sm text-[#8A8A93]">Loading…</div>
        ) : reviews.length === 0 ? (
          <div className="border border-dashed border-[#232326] rounded-sm p-12 text-center" data-testid="empty-reviews">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5C5C66]">No reviews yet</p>
            <p className="text-[#8A8A93] mt-2">Paste a stream link to start your first review.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reviews.map((r, i) => (
              <div key={r.id} data-testid={`review-card-${r.id}`} className="group border border-[#232326] hover:border-[#3A3A40] rounded-sm bg-[#121214] overflow-hidden rise" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="aspect-video bg-[#0A0A0B] relative overflow-hidden">
                  {r.video_type === "youtube" ? (
                    <img src={`https://i.ytimg.com/vi/${r.video_id}/hqdefault.jpg`} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition"/>
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#121214] to-[#0A0A0B] flex items-center justify-center"><Play className="w-10 h-10 text-[#3A3A40]"/></div>
                  )}
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/70 rounded-sm">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-[#8A8A93]">{r.video_type}</span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium tracking-tight truncate">{r.title}</h3>
                    <button onClick={() => del(r.id)} data-testid={`delete-review-${r.id}`} className="text-[#5C5C66] hover:text-[#EF4444] transition">
                      <Trash2 className="w-3.5 h-3.5"/>
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-1.5 text-[#5C5C66] font-mono text-[10px]">
                      <Clock className="w-3 h-3"/>{new Date(r.created_at).toLocaleDateString()}
                    </div>
                    <Button onClick={() => navigate(`/workspace/${r.id}`)} data-testid={`open-review-${r.id}`} variant="ghost" className="h-7 px-2 text-[#5A67D8] hover:text-white hover:bg-[#5A67D8] rounded-sm">
                      <span className="font-mono text-[10px] uppercase tracking-wider">Open</span>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
