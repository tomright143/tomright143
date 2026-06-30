import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import AnnotationCanvas from "@/components/AnnotationCanvas";
import Toolbar from "@/components/Toolbar";
import Watermark from "@/components/Watermark";
import AdLockModal from "@/components/AdLockModal";
import CommentSidebar from "@/components/CommentSidebar";
import P2PCallPanel from "@/components/P2PCallPanel";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Play, Pause, SkipBack, SkipForward, FileDown, MessageCircle, Users, Volume2, VolumeX, Share2, Copy } from "lucide-react";
import { getEmbedUrl, formatTimecode } from "@/lib/videoUtils";
import { toast } from "sonner";

export default function Workspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [review, setReview] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [tool, setTool] = useState("select");
  const [color, setColor] = useState("#5A67D8");
  const [brush, setBrush] = useState(4);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [adOpen, setAdOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const ytPlayerRef = useRef(null);
  const iframeRef = useRef(null);
  useEffect(() => {
    if (review) api.get(`/comments/${id}`).then(r => setComments(r.data));
  }, [id, review]);

  const reload = () => api.get(`/comments/${id}`).then(r => setComments(r.data));

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(`/reviews/${id}`);
        setReview(r.data);
        const a = await api.get(`/annotations/${id}`);
        setAnnotations(a.data);
      } catch { navigate("/dashboard"); }
    })();
  }, [id, navigate]);

  useEffect(() => {
    if (!review || review.video_type !== "youtube") return;
    if (window.YT && window.YT.Player) { initYT(); return; }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
    window.onYouTubeIframeAPIReady = initYT;
    // eslint-disable-next-line
  }, [review]);

  const initYT = () => {
    if (!iframeRef.current || !review) return;
    ytPlayerRef.current = new window.YT.Player(iframeRef.current, {
      events: {
        onReady: (e) => { setDuration(e.target.getDuration()); pollTime(); },
        onStateChange: (e) => setPlaying(e.data === 1),
      },
    });
  };

  const pollTime = () => {
    setInterval(() => {
      const p = ytPlayerRef.current;
      if (p && p.getCurrentTime) {
        try {
          setCurrentTime(p.getCurrentTime());
          if (!duration) setDuration(p.getDuration() || 0);
        } catch { /* ignore */ }
      }
    }, 150);
  };

  const togglePlay = () => { const p = ytPlayerRef.current; if (!p) return; if (playing) p.pauseVideo(); else p.playVideo(); };
  const step = (delta) => { const p = ytPlayerRef.current; if (!p) return; const t = (p.getCurrentTime() || 0) + delta; p.seekTo(Math.max(0, t), true); setCurrentTime(Math.max(0, t)); };
  const seekTo = (t) => { const p = ytPlayerRef.current; if (p) { p.seekTo(t, true); setCurrentTime(t); } };
  const toggleMute = () => { const p = ytPlayerRef.current; if (!p) return; if (muted) { p.unMute(); setMuted(false); } else { p.mute(); setMuted(true); } };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); step(-0.05); }
      else if (e.code === "ArrowRight") { e.preventDefault(); step(0.05); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line
  }, [playing]);

  const addAnnotation = async ({ tool, color, brush, points }) => {
    try {
      const r = await api.post("/annotations", { review_id: id, timestamp: currentTime, tool, color, brush, points });
      setAnnotations(prev => [...prev, r.data]);
    } catch { toast.error("Could not save annotation"); }
  };

  const clearMine = async () => {
    const mine = annotations.filter(a => a.owner_id === user.user_id);
    await Promise.all(mine.map(a => api.delete(`/annotations/${a.id}`)));
    setAnnotations(prev => prev.filter(a => a.owner_id !== user.user_id));
  };

  const handlePdfExport = useCallback(() => {
    if (user.plan === "free") { setAdOpen(true); return; }
    doExportPdf();
  }, [user]); // eslint-disable-line

  const doExportPdf = () => {
    const win = window.open("", "_blank");
    const annsHtml = annotations.map(a => `<div style="border-bottom:1px solid #232326;padding:8px 0"><b style="color:#5A67D8;font-family:monospace">${formatTimecode(a.timestamp)}</b> — ${a.tool} by ${a.owner_name}</div>`).join("");
    const brand = user.brand_logo ? `<img src="${user.brand_logo}" style="height:36px"/>` : `<div style="font-family:monospace;letter-spacing:.2em;text-transform:uppercase;font-weight:600">REVIEW.IO</div>`;
    win.document.write(`<!doctype html><html><head><title>${review.title} — Review.io</title><style>body{font-family:system-ui;background:#fff;color:#111;padding:32px;max-width:800px;margin:auto}h1{font-size:28px;margin:.2em 0}p{color:#555}.foot{margin-top:32px;font-family:monospace;font-size:10px;color:#888;border-top:1px solid #ddd;padding-top:12px}</style></head><body>${brand}<h1>${review.title}</h1><p>By ${user.email} · ${new Date().toLocaleString()}</p><p style="font-family:monospace;font-size:11px">Source: ${review.video_url}</p><h3>Annotations (${annotations.length})</h3>${annsHtml}<div class="foot">Review.io by Black Fxtudio · ${user.email}</div></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  const shareLink = () => {
    const url = `${window.location.origin}/shared/${review.share_token}`;
    navigator.clipboard.writeText(url);
    toast.success("Share link copied");
  };

  if (!review) return <div className="min-h-screen bg-background flex items-center justify-center font-mono text-sm text-[#8A8A93]">Loading…</div>;

  const embed = getEmbedUrl(review.video_type, review.video_id) + (review.video_type === "youtube" ? "&controls=0&disablekb=1&iv_load_policy=3&fs=0" : "");
  const showWatermark = !review.allow_download;
  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#EDEDF0]">
      <TopNav />
      <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-6 grid lg:grid-cols-[1fr_360px] gap-4">
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5C5C66]">{review.video_type} · {review.video_id}</p>
              <h1 className="text-xl sm:text-2xl font-medium truncate">{review.title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-[#5A67D8]" data-testid="current-timecode">{formatTimecode(currentTime)} / {formatTimecode(duration)}</span>
              <Button data-testid="share-button" onClick={shareLink} className="bg-[#121214] border border-[#232326] hover:bg-[#1a1a1d] rounded-sm h-9"><Share2 className="w-4 h-4 mr-2"/><span className="font-mono text-xs uppercase tracking-wider">Share</span></Button>
              <Button data-testid="export-pdf-button" onClick={handlePdfExport} className="bg-[#121214] border border-[#232326] hover:bg-[#1a1a1d] rounded-sm h-9"><FileDown className="w-4 h-4 mr-2"/><span className="font-mono text-xs uppercase tracking-wider">PDF</span></Button>
            </div>
          </div>

          <div className="relative w-full aspect-video bg-black rounded-sm overflow-hidden border border-[#232326]" data-testid="video-stage">
            {review.video_type === "youtube" ? (
              <iframe ref={iframeRef} src={embed} title="player" className="absolute inset-0 w-full h-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/>
            ) : (
              <iframe src={embed} title="player" className="absolute inset-0 w-full h-full" allow="autoplay; encrypted-media; fullscreen" allowFullScreen/>
            )}
            {showWatermark && false && <Watermark email={user.email}/>}
            <AnnotationCanvas annotations={annotations} currentTime={currentTime} tool={tool} color={color} brush={brush} onAdd={addAnnotation} enabled={tool !== "select" && review.video_type === "youtube"}/>
          </div>

          {/* Scrubber with comment pins */}
          <div className="mt-3 relative" data-testid="scrubber-container">
            <input type="range" min={0} max={duration || 100} step={0.05} value={currentTime}
              onChange={(e) => seekTo(parseFloat(e.target.value))}
              data-testid="video-scrubber"
              className="w-full h-2 appearance-none bg-[#121214] rounded-sm cursor-pointer accent-[#5A67D8]"
              style={{ background: `linear-gradient(to right, #5A67D8 0%, #5A67D8 ${progress}%, #232326 ${progress}%, #232326 100%)` }}/>
            {duration > 0 && comments.filter(c => c.timestamp != null).map(c => (
              <button key={c.id} title={`${c.owner_name}: ${c.text.slice(0,40)}`} onClick={() => seekTo(c.timestamp)}
                data-testid={`scrubber-pin-${c.id}`}
                className="absolute -top-1.5 w-3 h-3 rounded-full bg-[#F59E0B] border-2 border-[#0A0A0B] hover:scale-125 transition"
                style={{ left: `calc(${(c.timestamp / duration) * 100}% - 6px)` }}/>
            ))}
          </div>

          <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <button onClick={() => step(-0.05)} data-testid="ctrl-prev-frame" className="w-9 h-9 rounded-sm border border-[#232326] hover:bg-[#1a1a1d] flex items-center justify-center"><SkipBack className="w-4 h-4"/></button>
              <button onClick={togglePlay} data-testid="ctrl-play" className="w-9 h-9 rounded-sm bg-[#5A67D8] hover:bg-[#4C51BF] flex items-center justify-center">{playing ? <Pause className="w-4 h-4"/> : <Play className="w-4 h-4"/>}</button>
              <button onClick={() => step(0.05)} data-testid="ctrl-next-frame" className="w-9 h-9 rounded-sm border border-[#232326] hover:bg-[#1a1a1d] flex items-center justify-center"><SkipForward className="w-4 h-4"/></button>
              <button onClick={toggleMute} data-testid="ctrl-mute" className="w-9 h-9 rounded-sm border border-[#232326] hover:bg-[#1a1a1d] flex items-center justify-center ml-1">{muted ? <VolumeX className="w-4 h-4 text-[#EF4444]"/> : <Volume2 className="w-4 h-4"/>}</button>
            </div>
            <div className="w-full lg:w-auto">
              <Toolbar tool={tool} setTool={setTool} color={color} setColor={setColor} brush={brush} setBrush={setBrush} onClear={clearMine}/>
            </div>
          </div>

          {/* Mobile inline comments (Instagram-style always visible) */}
          <div className="lg:hidden mt-6" data-testid="mobile-comments-inline">
            <div className="border border-[#232326] rounded-sm bg-[#0A0A0B] h-[60vh] overflow-hidden">
              <CommentSidebar reviewId={id} currentTime={currentTime} onSeek={seekTo}/>
            </div>
            <div className="mt-3 flex justify-center">
              <Sheet>
                <SheetTrigger asChild><Button data-testid="mobile-p2p-trigger" className="bg-[#10B981] text-black hover:bg-[#0a8763] rounded-sm h-11 px-4"><Users className="w-4 h-4 mr-2"/><span className="font-mono text-xs uppercase tracking-wider">P2P Call</span></Button></SheetTrigger>
                <SheetContent side="bottom" className="bg-[#0A0A0B] border-t border-[#232326] h-[75vh] p-0 overflow-y-auto"><P2PCallPanel reviewId={id} currentUser={user}/></SheetContent>
              </Sheet>
            </div>
          </div>
        </div>

        <aside className="hidden lg:flex flex-col border border-[#232326] rounded-sm bg-[#0A0A0B] overflow-hidden h-[calc(100vh-160px)] sticky top-20">
          <P2PCallPanel reviewId={id} currentUser={user}/>
          <div className="flex-1 min-h-0"><CommentSidebar reviewId={id} currentTime={currentTime} onSeek={seekTo}/></div>
        </aside>
      </main>
      <Footer/>
      <AdLockModal open={adOpen} onClose={() => setAdOpen(false)} onComplete={() => { setAdOpen(false); doExportPdf(); }} durationSec={15}/>
    </div>
  );
}
