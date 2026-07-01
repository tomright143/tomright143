import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import AnnotationCanvas from "@/components/AnnotationCanvas";
import Toolbar from "@/components/Toolbar";
import AdLockModal from "@/components/AdLockModal";
import CommentSidebar from "@/components/CommentSidebar";
import P2PCallPanel from "@/components/P2PCallPanel";
import PresenceBar from "@/components/PresenceBar";
import LocalVideo from "@/components/LocalVideo";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { getEmbedUrl, formatTimecode } from "@/lib/videoUtils";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Users } from "lucide-react";

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
  const [authRequired, setAuthRequired] = useState(false);
  const ytPlayerRef = useRef(null);
  const iframeRef = useRef(null);

  const doLogin = () => {
    window.sessionStorage.setItem("post_login_redirect", window.location.pathname);
    const redirectUrl = window.location.origin + window.location.pathname;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(`/shared/${token}`);
        setReview(r.data.review);
        if (r.data.show_ad) setAdOpen(true);
        const a = await api.get(`/annotations/${r.data.review.id}`);
        setAnnotations(a.data);
      } catch (e) {
        if (e.response?.status === 401) setAuthRequired(true);
      }
    })();
  }, [token]);

  // Real-time: keep annotation pointers fresh
  useEffect(() => {
    if (!review) return;
    const iv = setInterval(() => { api.get(`/annotations/${review.id}`).then(r => setAnnotations(r.data)).catch(() => {}); }, 4000);
    return () => clearInterval(iv);
  }, [review]);

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

  if (authRequired) return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#EDEDF0] flex flex-col items-center justify-center gap-6 px-6" data-testid="shared-auth-gate">
      <img src="/worxpher-logo.png" alt="Worxpher" className="h-16"/>
      <div className="text-center max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">This is a private review</h1>
        <p className="text-sm text-[#8A8A93] mt-2 font-mono">Sign in with Google to view and leave feedback on this shared project.</p>
      </div>
      <Button data-testid="shared-auth-login" onClick={doLogin} className="h-12 px-6 bg-[#5A67D8] hover:bg-[#4C51BF] text-white rounded-sm">
        <svg viewBox="0 0 24 24" className="w-4 h-4 mr-3"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"/><path fill="#fff" opacity=".9" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#fff" opacity=".75" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.94l3.66-2.84Z"/><path fill="#fff" opacity=".55" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38Z"/></svg>
        Continue with Google
      </Button>
    </div>
  );

  if (!review) return <div className="min-h-screen bg-[#0A0A0B] text-[#EDEDF0] flex items-center justify-center">Loading…</div>;

  const isOwner = user?.user_id === review.owner_id;
  const isYouTube = review.video_type === "youtube";
  const isLocal = review.video_type === "local";
  const embed = getEmbedUrl(review.video_type, review.video_id) + (isYouTube ? "&controls=0&disablekb=1&iv_load_policy=3&fs=0" : "");
  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#EDEDF0]">
      <header className="border-b border-[#232326] py-3 px-4 sm:px-8 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/worxpher-logo.png" alt="Worxpher" className="h-12"/>
          <div className="border-l border-[#232326] pl-3 min-w-0"><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5A67D8]">Shared review · view + annotate</p><h1 className="text-lg font-medium truncate">{review.title}</h1></div>
        </div>
        <div className="flex items-center gap-3">
          {user && <PresenceBar reviewId={review.id}/>}
          {!user && <Button data-testid="shared-signin" onClick={doLogin} className="bg-[#5A67D8] rounded-sm">Sign in to comment</Button>}
        </div>
      </header>
      <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4 grid lg:grid-cols-[1fr_360px] gap-4">
        <div>
          <div className="relative w-full aspect-video bg-black rounded-sm overflow-hidden border border-[#232326]" data-testid="shared-video-stage">
            {isYouTube ? (
              <iframe ref={iframeRef} src={embed} title="player" className="absolute inset-0 w-full h-full" allow="autoplay; encrypted-media"/>
            ) : isLocal ? (
              user ? <LocalVideo reviewId={review.id} currentUser={user} isOwner={isOwner} onTime={setCurrentTime} onDuration={setDuration} onPlaying={setPlaying}/>
                   : <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]">Sign in to watch the live broadcast</div>
            ) : (
              <iframe src={embed} title="player" className="absolute inset-0 w-full h-full" allow="autoplay; encrypted-media"/>
            )}
            <AnnotationCanvas annotations={annotations} currentTime={currentTime} tool={tool} color={color} brush={brush} onAdd={addAnnotation} enabled={!!user && tool !== "select" && (isYouTube || isLocal)}/>
          </div>

          {isYouTube && (
            <div className="mt-3 relative">
              <input type="range" min={0} max={duration || 100} step={0.05} value={currentTime} onChange={(e) => seekTo(parseFloat(e.target.value))} data-testid="shared-scrubber" className="w-full h-2 appearance-none rounded-sm cursor-pointer accent-[#5A67D8]" style={{ background: `linear-gradient(to right, #5A67D8 0%, #5A67D8 ${progress}%, #232326 ${progress}%, #232326 100%)` }}/>
            </div>
          )}

          <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
            {isYouTube ? (
              <div className="flex items-center gap-1">
                <button onClick={() => step(-0.05)} className="w-9 h-9 rounded-sm border border-[#232326] flex items-center justify-center"><SkipBack className="w-4 h-4"/></button>
                <button onClick={togglePlay} data-testid="shared-play" className="w-9 h-9 rounded-sm bg-[#5A67D8] flex items-center justify-center">{playing ? <Pause className="w-4 h-4"/> : <Play className="w-4 h-4"/>}</button>
                <button onClick={() => step(0.05)} className="w-9 h-9 rounded-sm border border-[#232326] flex items-center justify-center"><SkipForward className="w-4 h-4"/></button>
                <button onClick={toggleMute} className="w-9 h-9 rounded-sm border border-[#232326] ml-1 flex items-center justify-center">{muted ? <VolumeX className="w-4 h-4 text-[#EF4444]"/> : <Volume2 className="w-4 h-4"/>}</button>
                <span className="ml-2 font-mono text-xs text-[#5A67D8]">{formatTimecode(currentTime)} / {formatTimecode(duration)}</span>
              </div>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#5C5C66]">{formatTimecode(currentTime)} / {formatTimecode(duration)} · live broadcast</span>
            )}
            {user && <Toolbar tool={tool} setTool={setTool} color={color} setColor={setColor} brush={brush} setBrush={setBrush} onClear={() => {}}/>}
          </div>

          {/* Mobile inline comments + P2P */}
          <div className="lg:hidden mt-6">
            <div className="border border-[#232326] rounded-sm bg-[#0A0A0B] h-[55vh] overflow-hidden">
              <CommentSidebar reviewId={review.id} currentTime={currentTime} onSeek={seekTo}/>
            </div>
            {user && (
              <div className="mt-3 flex justify-center">
                <Sheet>
                  <SheetTrigger asChild><Button data-testid="shared-mobile-p2p" className="bg-[#10B981] text-black hover:bg-[#0a8763] rounded-sm h-11 px-4"><Users className="w-4 h-4 mr-2"/><span className="font-mono text-xs uppercase tracking-wider">P2P Call</span></Button></SheetTrigger>
                  <SheetContent side="bottom" className="bg-[#0A0A0B] border-t border-[#232326] h-[75vh] p-0 overflow-y-auto"><P2PCallPanel reviewId={review.id} currentUser={user}/></SheetContent>
                </Sheet>
              </div>
            )}
          </div>
        </div>

        <aside className="hidden lg:flex flex-col border border-[#232326] rounded-sm bg-[#0A0A0B] overflow-hidden h-[calc(100vh-160px)] sticky top-4">
          {user && <P2PCallPanel reviewId={review.id} currentUser={user}/>}
          <div className="flex-1 min-h-0"><CommentSidebar reviewId={review.id} currentTime={currentTime} onSeek={seekTo}/></div>
        </aside>
      </main>
      <Footer/>
      <AdLockModal open={adOpen} onClose={() => setAdOpen(false)} onComplete={() => setAdOpen(false)} durationSec={15}/>
    </div>
  );
}
