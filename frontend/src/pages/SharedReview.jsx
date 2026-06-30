import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import AnnotationCanvas from "@/components/AnnotationCanvas";
import Toolbar from "@/components/Toolbar";
import AdLockModal from "@/components/AdLockModal";
import CommentSidebar from "@/components/CommentSidebar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { getEmbedUrl, formatTimecode } from "@/lib/videoUtils";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";

export default function SharedReview() {
  const { token } = useParams();
  const { user } = useAuth();
  const [review, setReview] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [adOpen, setAdOpen] = useState(false);
  const [tool, setTool] = useState("select");
  const [color, setColor] = useState("#EF4444");
  const [brush, setBrush] = useState(4);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const ytPlayerRef = useRef(null);
  const iframeRef = useRef(null);

  useEffect(() => {
    (async () => {
      const r = await api.get(`/shared/${token}`);
      setReview(r.data.review);
      if (r.data.show_ad) setAdOpen(true);
      const a = await api.get(`/annotations/${r.data.review.id}`);
      setAnnotations(a.data);
    })();
  }, [token]);

  useEffect(() => {
    if (!review || review.video_type !== "youtube") return;
    if (window.YT && window.YT.Player) { init(); return; }
    const tag = document.createElement("script"); tag.src = "https://www.youtube.com/iframe_api"; document.body.appendChild(tag);
    window.onYouTubeIframeAPIReady = init;
    // eslint-disable-next-line
  }, [review]);

  const init = () => {
    if (!iframeRef.current || !review) return;
    ytPlayerRef.current = new window.YT.Player(iframeRef.current, {
      events: {
        onReady: (e) => { setDuration(e.target.getDuration()); setInterval(() => { try { setCurrentTime(ytPlayerRef.current.getCurrentTime()); } catch { /* */ } }, 150); },
        onStateChange: (e) => setPlaying(e.data === 1),
      },
    });
  };

  const togglePlay = () => { const p = ytPlayerRef.current; if (!p) return; if (playing) p.pauseVideo(); else p.playVideo(); };
  const step = (d) => { const p = ytPlayerRef.current; if (!p) return; p.seekTo(Math.max(0, p.getCurrentTime() + d), true); };
  const seekTo = (t) => { const p = ytPlayerRef.current; if (p) { p.seekTo(t, true); setCurrentTime(t); } };
  const toggleMute = () => { const p = ytPlayerRef.current; if (!p) return; if (muted) { p.unMute(); setMuted(false); } else { p.mute(); setMuted(true); } };

  const addAnnotation = async ({ tool, color, brush, points }) => {
    if (!user) return;
    const r = await api.post("/annotations", { review_id: review.id, timestamp: currentTime, tool, color, brush, points });
    setAnnotations(prev => [...prev, r.data]);
  };

  if (!review) return <div className="min-h-screen bg-[#0A0A0B] text-[#EDEDF0] flex items-center justify-center">Loading…</div>;

  const embed = getEmbedUrl(review.video_type, review.video_id) + (review.video_type === "youtube" ? "&controls=0&disablekb=1&iv_load_policy=3&fs=0" : "");
  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#EDEDF0]">
      <header className="border-b border-[#232326] py-3 px-4 sm:px-8 flex items-center justify-between">
        <div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5A67D8]">Shared review · view + annotate</p><h1 className="text-lg font-medium">{review.title}</h1></div>
        {!user && <Button data-testid="shared-signin" onClick={() => { window.location.href = "/login"; }} className="bg-[#5A67D8] rounded-sm">Sign in to comment</Button>}
      </header>
      <main className="max-w-[1100px] mx-auto px-3 sm:px-6 py-4 grid lg:grid-cols-[1fr_340px] gap-4">
        <div>
          <div className="relative w-full aspect-video bg-black rounded-sm overflow-hidden border border-[#232326]" data-testid="shared-video-stage">
            {review.video_type === "youtube" ? <iframe ref={iframeRef} src={embed} title="player" className="absolute inset-0 w-full h-full" allow="autoplay; encrypted-media"/> : <iframe src={embed} title="player" className="absolute inset-0 w-full h-full" allow="autoplay; encrypted-media"/>}
            <AnnotationCanvas annotations={annotations} currentTime={currentTime} tool={tool} color={color} brush={brush} onAdd={addAnnotation} enabled={!!user && tool !== "select" && review.video_type === "youtube"}/>
          </div>
          <input type="range" min={0} max={duration || 100} step={0.05} value={currentTime} onChange={(e) => seekTo(parseFloat(e.target.value))} className="w-full h-2 mt-3 appearance-none rounded-sm cursor-pointer accent-[#5A67D8]" style={{ background: `linear-gradient(to right, #5A67D8 0%, #5A67D8 ${progress}%, #232326 ${progress}%, #232326 100%)` }}/>
          <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <button onClick={() => step(-0.05)} className="w-9 h-9 rounded-sm border border-[#232326] flex items-center justify-center"><SkipBack className="w-4 h-4"/></button>
              <button onClick={togglePlay} className="w-9 h-9 rounded-sm bg-[#5A67D8] flex items-center justify-center">{playing ? <Pause className="w-4 h-4"/> : <Play className="w-4 h-4"/>}</button>
              <button onClick={() => step(0.05)} className="w-9 h-9 rounded-sm border border-[#232326] flex items-center justify-center"><SkipForward className="w-4 h-4"/></button>
              <button onClick={toggleMute} className="w-9 h-9 rounded-sm border border-[#232326] ml-1 flex items-center justify-center">{muted ? <VolumeX className="w-4 h-4 text-[#EF4444]"/> : <Volume2 className="w-4 h-4"/>}</button>
              <span className="ml-2 font-mono text-xs text-[#5A67D8]">{formatTimecode(currentTime)} / {formatTimecode(duration)}</span>
            </div>
            {user && <Toolbar tool={tool} setTool={setTool} color={color} setColor={setColor} brush={brush} setBrush={setBrush} onClear={() => {}}/>}
          </div>
        </div>
        <aside className="border border-[#232326] rounded-sm overflow-hidden h-[calc(100vh-200px)]"><CommentSidebar reviewId={review.id} currentTime={currentTime} onSeek={seekTo}/></aside>
      </main>
      <Footer/>
      <AdLockModal open={adOpen} onClose={() => setAdOpen(false)} onComplete={() => setAdOpen(false)} durationSec={15}/>
    </div>
  );
}
