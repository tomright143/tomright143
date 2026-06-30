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

  const exportFrame = () => {
    const frameComments = comments.filter(c => c.timestamp != null && Math.abs(c.timestamp - currentTime) < 3);
    const frameAnns = annotations.filter(a => Math.abs(a.timestamp - currentTime) < 1.5);
    const thumb = review.video_type === "youtube" ? `https://i.ytimg.com/vi/${review.video_id}/hqdefault.jpg` : "";
    const brand = user.brand_logo ? `<img src="${user.brand_logo}" style="height:36px"/>` : `<div style="font-family:monospace;letter-spacing:.2em;text-transform:uppercase;font-weight:600">REVIEW.IO</div>`;
    const cmtHtml = frameComments.map(c => `<div style="display:flex;gap:10px;padding:10px;border-bottom:1px solid #ddd;align-items:flex-start"><img src="${c.owner_picture||''}" style="width:32px;height:32px;border-radius:50%;background:#eee"/><div><div style="font-weight:600;font-size:13px">${c.owner_name} <span style="font-family:monospace;font-size:10px;color:#5A67D8">@${formatTimecode(c.timestamp)}</span></div><div style="font-size:13px;margin-top:2px">${c.text}</div></div></div>`).join("");
    const annHtml = frameAnns.map(a => `<li>${a.tool} by ${a.owner_name} @ ${formatTimecode(a.timestamp)}</li>`).join("");
    const w = window.open("", "_blank");
    w.document.write(`<!doctype html><html><head><title>Frame ${formatTimecode(currentTime)} — ${review.title}</title><style>body{font-family:system-ui;color:#111;padding:32px;max-width:780px;margin:auto}img.t{width:100%;border-radius:6px}h1{margin:8px 0}p.muted{color:#777;font-size:12px}ul{padding-left:18px}.foot{font-family:monospace;font-size:10px;color:#888;border-top:1px solid #ddd;padding-top:12px;margin-top:32px}</style></head><body>${brand}<h1>${review.title}</h1><p class="muted">Frame snapshot @ <b>${formatTimecode(currentTime)}</b> · ${new Date().toLocaleString()}</p>${thumb ? `<img class="t" src="${thumb}"/>` : ""}<h3>Annotations at this frame (${frameAnns.length})</h3><ul>${annHtml || "<li>none</li>"}</ul><h3>Comments around this frame (${frameComments.length})</h3>${cmtHtml || "<p class='muted'>No comments</p>"}<div class="foot">Review.io by Black Fxtudio · exported by ${user.email}</div></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  const handlePdfExport = useCallback(() => {
    if (user.plan === "free") { setAdOpen(true); return; }
    doExportPdf();
  }, [user]); // eslint-disable-line

  const doExportPdf = async () => {
    const timed = comments.filter(c => c.timestamp != null).sort((a,b) => a.timestamp - b.timestamp);
    const p = ytPlayerRef.current;
    const canvas = document.querySelector("[data-testid='annotation-canvas']");
    const frames = [];
    const thumb = review.video_type === "youtube" ? `https://i.ytimg.com/vi/${review.video_id}/maxresdefault.jpg` : "";
    toast.message(`Compiling Review List · ${timed.length} frames…`);
    for (const c of timed) {
      try {
        if (p && p.seekTo) { p.seekTo(c.timestamp, true); p.pauseVideo(); }
        await new Promise(r => setTimeout(r, 700));
        const overlay = canvas ? canvas.toDataURL("image/png") : "";
        frames.push({ comment: c, overlay });
      } catch { frames.push({ comment: c, overlay: "" }); }
    }
    const brand = user.brand_logo ? `<img src="${user.brand_logo}" style="height:36px"/>` : `<div style="font-family:monospace;letter-spacing:.2em;text-transform:uppercase;font-weight:600;font-size:14px">REVIEW.IO</div>`;
    const itemsHtml = frames.map(({comment, overlay}) => `
      <div class="row">
        <div class="frame"><img src="${thumb}" class="thumb"/>${overlay ? `<img src="${overlay}" class="overlay"/>` : ""}</div>
        <div class="meta">
          <div class="head"><img src="${comment.owner_picture||''}" class="avatar"/><div><div class="name">${comment.owner_name}</div><div class="tc">@ ${formatTimecode(comment.timestamp)}</div></div></div>
          <p class="txt">${(comment.text||"").replace(/</g,"&lt;")}</p>
        </div>
      </div>`).join("");
    const w = window.open("", "_blank");
    w.document.write(`<!doctype html><html><head><title>Review List · ${review.title}</title><style>
      @page { size:A4; margin:18mm }
      body{font-family:system-ui;color:#111;max-width:780px;margin:auto;padding:24px}
      h1{margin:8px 0;font-size:24px}p.sub{color:#777;font-size:12px;margin:0}
      .row{display:flex;gap:14px;padding:14px 0;border-bottom:1px solid #e5e5e5;page-break-inside:avoid}
      .frame{position:relative;width:280px;flex-shrink:0;background:#000;border-radius:6px;overflow:hidden;aspect-ratio:16/9}
      .thumb,.overlay{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
      .overlay{object-fit:fill}
      .meta{flex:1;min-width:0}
      .head{display:flex;gap:8px;align-items:center}.avatar{width:32px;height:32px;border-radius:50%;background:#eee;object-fit:cover}
      .name{font-weight:600;font-size:13px}.tc{font-family:monospace;font-size:11px;color:#5A67D8}
      .txt{font-size:13px;margin:6px 0 0;line-height:1.5}
      .foot{margin-top:36px;font-family:monospace;font-size:10px;color:#888;border-top:1px solid #ddd;padding-top:12px;text-align:center}
    </style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start">${brand}<div style="text-align:right"><h1 style="margin:0">Review List</h1><p class="sub">${new Date().toLocaleString()}</p></div></div>
      <h2 style="margin-top:14px;font-size:18px">${review.title}</h2>
      <p class="sub">${timed.length} timestamped comments · exported by ${user.email}</p>
      ${itemsHtml || "<p class='sub' style='margin-top:24px'>No timestamped comments to compile.</p>"}
      <div class="foot">Review.io · by Black Fxtudio · ${user.email}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 800);
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
              <Button data-testid="export-pdf-button" onClick={handlePdfExport} className="bg-[#5A67D8] hover:bg-[#4C51BF] text-white rounded-sm h-9"><FileDown className="w-4 h-4 mr-2"/><span className="font-mono text-xs uppercase tracking-wider">Export PDF</span></Button>
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
