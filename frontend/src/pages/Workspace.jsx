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
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Play, Pause, SkipBack, SkipForward, Download, FileDown, MessageCircle, Users } from "lucide-react";
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
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ytReady, setYtReady] = useState(false);
  const [adOpen, setAdOpen] = useState(false);
  const ytPlayerRef = useRef(null);
  const iframeRef = useRef(null);
  const containerRef = useRef(null);

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

  // Load YouTube IFrame API
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
        onReady: () => { setYtReady(true); pollTime(); },
        onStateChange: (e) => setPlaying(e.data === 1),
      },
    });
  };

  const pollTime = () => {
    setInterval(() => {
      const p = ytPlayerRef.current;
      if (p && p.getCurrentTime) {
        try { setCurrentTime(p.getCurrentTime()); } catch { /* ignore */ }
      }
    }, 200);
  };

  const togglePlay = () => {
    const p = ytPlayerRef.current; if (!p) return;
    if (playing) p.pauseVideo(); else p.playVideo();
  };
  const step = (delta) => {
    const p = ytPlayerRef.current; if (!p) return;
    const t = (p.getCurrentTime() || 0) + delta;
    p.seekTo(Math.max(0, t), true);
    setCurrentTime(Math.max(0, t));
  };
  const seekTo = (t) => {
    const p = ytPlayerRef.current; if (p) { p.seekTo(t, true); setCurrentTime(t); }
  };

  // Keyboard shortcuts
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
  }, [playing, ytReady]);

  // Mobile double-tap to skip
  const onPlayerTouch = (e) => {
    const now = Date.now();
    const last = onPlayerTouch.last || 0;
    onPlayerTouch.last = now;
    if (now - last < 300) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.changedTouches[0].clientX - rect.left;
      if (x < rect.width / 2) step(-0.5); else step(0.5);
    }
  };

  const addAnnotation = async ({ tool, color, points }) => {
    try {
      const r = await api.post("/annotations", {
        review_id: id, timestamp: currentTime, tool, color, points,
      });
      setAnnotations(prev => [...prev, r.data]);
    } catch { toast.error("Could not save annotation"); }
  };

  const clearMyAnnotations = async () => {
    const mine = annotations.filter(a => a.owner_id === user.user_id);
    await Promise.all(mine.map(a => api.delete(`/annotations/${a.id}`)));
    setAnnotations(prev => prev.filter(a => a.owner_id !== user.user_id));
  };

  const handlePdfExport = useCallback(async () => {
    if (user.plan === "free") { setAdOpen(true); return; }
    doExportPdf();
  }, [user]); // eslint-disable-line

  const doExportPdf = () => {
    // Lightweight: build a printable HTML report and trigger print
    const win = window.open("", "_blank");
    const annsHtml = annotations.map(a => `<div style="border-bottom:1px solid #232326;padding:8px 0"><b style="color:#5A67D8;font-family:monospace">${formatTimecode(a.timestamp)}</b> — <span>${a.tool}</span> by ${a.owner_name}${a.text? " · " + a.text : ""}</div>`).join("");
    const brand = user.brand_logo ? `<img src="${user.brand_logo}" style="height:32px"/>` : `<div style="font-family:monospace;letter-spacing:.2em;text-transform:uppercase">ZEROSTORE</div>`;
    win.document.write(`<!doctype html><html><head><title>${review.title} — Review</title><style>body{font-family:system-ui;background:#0A0A0B;color:#EDEDF0;padding:32px;max-width:800px;margin:auto}h1{font-size:28px}p{color:#8A8A93}.wm{position:fixed;bottom:8px;right:8px;font-family:monospace;font-size:10px;color:#5C5C66}</style></head><body>${brand}<h1>${review.title}</h1><p>Review by ${user.email} · ${new Date().toLocaleString()}</p><p style="font-family:monospace;font-size:11px;color:#8A8A93">Source: ${review.video_url}</p><h3>Annotations (${annotations.length})</h3>${annsHtml}<div class="wm">${user.email} · ${new Date().toISOString()}</div></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  if (!review) return <div className="min-h-screen bg-background flex items-center justify-center font-mono text-sm text-[#8A8A93]">Loading review…</div>;

  const embed = getEmbedUrl(review.video_type, review.video_id);
  const showWatermark = !review.allow_download;

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#EDEDF0]">
      <TopNav />
      <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-6 grid lg:grid-cols-[1fr_360px] gap-4">
        {/* Left: Player + Toolbar */}
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5C5C66]">{review.video_type} · {review.video_id}</p>
              <h1 className="text-xl sm:text-2xl font-medium truncate">{review.title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-[#5A67D8]" data-testid="current-timecode">{formatTimecode(currentTime)}</span>
              <Button data-testid="export-pdf-button" onClick={handlePdfExport} className="bg-[#121214] border border-[#232326] hover:bg-[#1a1a1d] text-white rounded-sm h-9">
                <FileDown className="w-4 h-4 mr-2"/><span className="font-mono text-xs uppercase tracking-wider">Export PDF</span>
              </Button>
            </div>
          </div>

          <div ref={containerRef} className="relative w-full aspect-video bg-black rounded-sm overflow-hidden border border-[#232326]" onTouchEnd={onPlayerTouch} data-testid="video-stage">
            {review.video_type === "youtube" ? (
              <iframe
                ref={iframeRef}
                src={embed}
                title="player"
                className="absolute inset-0 w-full h-full"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : (
              <iframe
                src={embed}
                title="player"
                className="absolute inset-0 w-full h-full"
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
              />
            )}
            {showWatermark && <Watermark email={user.email}/>}
            <AnnotationCanvas
              annotations={annotations}
              currentTime={currentTime}
              tool={tool}
              color={color}
              onAdd={addAnnotation}
              enabled={tool !== "select" && review.video_type === "youtube"}
            />
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <button onClick={() => step(-0.05)} data-testid="ctrl-prev-frame" className="w-9 h-9 rounded-sm border border-[#232326] hover:bg-[#1a1a1d] flex items-center justify-center" title="-0.05s"><SkipBack className="w-4 h-4"/></button>
              <button onClick={togglePlay} data-testid="ctrl-play" className="w-9 h-9 rounded-sm bg-[#5A67D8] hover:bg-[#4C51BF] flex items-center justify-center">
                {playing ? <Pause className="w-4 h-4"/> : <Play className="w-4 h-4"/>}
              </button>
              <button onClick={() => step(0.05)} data-testid="ctrl-next-frame" className="w-9 h-9 rounded-sm border border-[#232326] hover:bg-[#1a1a1d] flex items-center justify-center" title="+0.05s"><SkipForward className="w-4 h-4"/></button>
              <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-[#5C5C66] hidden sm:inline">Space · ← → for 0.05s step</span>
            </div>
            {/* Toolbar */}
            <div className="w-full lg:w-auto order-3 lg:order-2">
              <Toolbar tool={tool} setTool={setTool} color={color} setColor={setColor} onClear={clearMyAnnotations}/>
            </div>
          </div>

          {/* Mobile bottom sheet trigger */}
          <div className="lg:hidden mt-4 flex gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button data-testid="mobile-comments-trigger" className="flex-1 bg-[#121214] border border-[#232326] rounded-sm h-11">
                  <MessageCircle className="w-4 h-4 mr-2"/><span className="font-mono text-xs uppercase tracking-wider">Comments</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="bg-[#0A0A0B] border-t border-[#232326] h-[75vh] p-0">
                <CommentSidebar reviewId={id} currentTime={currentTime} onSeek={seekTo} currentUser={user}/>
              </SheetContent>
            </Sheet>
            <Sheet>
              <SheetTrigger asChild>
                <Button data-testid="mobile-p2p-trigger" className="bg-[#121214] border border-[#232326] rounded-sm h-11 px-4">
                  <Users className="w-4 h-4"/>
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="bg-[#0A0A0B] border-t border-[#232326] h-[75vh] p-0 overflow-y-auto">
                <P2PCallPanel reviewId={id} currentUser={user}/>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Right: Sidebar (desktop) */}
        <aside className="hidden lg:flex flex-col border border-[#232326] rounded-sm bg-[#0A0A0B] overflow-hidden h-[calc(100vh-160px)] sticky top-20">
          <P2PCallPanel reviewId={id} currentUser={user}/>
          <div className="flex-1 min-h-0">
            <CommentSidebar reviewId={id} currentTime={currentTime} onSeek={seekTo} currentUser={user}/>
          </div>
        </aside>
      </main>

      <AdLockModal open={adOpen} onClose={() => setAdOpen(false)} onComplete={() => { setAdOpen(false); doExportPdf(); }} durationSec={15}/>
    </div>
  );
}
