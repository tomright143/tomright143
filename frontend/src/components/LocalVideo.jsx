import React, { useEffect, useRef, useState } from "react";
import { Upload, Radio, Loader2, RefreshCw, VolumeX } from "lucide-react";
import { getLocalFile, clearLocalFile } from "@/lib/localFileStore";

const ICE = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// Zero-storage local video: owner picks a file on their machine and live-broadcasts it
// to reviewers over WebRTC while the tab is open. No upload to any server.
export default function LocalVideo({ reviewId, currentUser, isOwner, onTime, onDuration, onPlaying }) {
  const videoRef = useRef(null);
  const wsRef = useRef(null);
  const pcsRef = useRef({});
  const streamRef = useRef(null);
  const peersRef = useRef([]);
  const [fileChosen, setFileChosen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [muted, setMuted] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const fileInputRef = useRef(null);

  const wsUrl = (role) => {
    const backend = process.env.REACT_APP_BACKEND_URL.replace(/^http/, "ws");
    return `${backend}/api/ws/broadcast/${reviewId}?peer=${encodeURIComponent(currentUser.user_id)}&role=${role}`;
  };
  const send = (msg) => { if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify(msg)); };

  // ---------- OWNER (broadcaster) ----------
  const offerTo = async (peerId) => {
    if (!streamRef.current) return;
    let pc = pcsRef.current[peerId];
    if (!pc) {
      pc = new RTCPeerConnection(ICE);
      pcsRef.current[peerId] = pc;
      streamRef.current.getTracks().forEach(t => pc.addTrack(t, streamRef.current));
      pc.onicecandidate = (e) => { if (e.candidate) send({ type: "ice", target: peerId, candidate: e.candidate }); };
    }
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: "offer", target: peerId, sdp: offer });
    } catch { /* */ }
  };

  const startBroadcast = () => {
    if (streamRef.current) { peersRef.current.forEach(pid => offerTo(pid)); return; }
    const v = videoRef.current;
    const stream = v.captureStream ? v.captureStream() : (v.mozCaptureStream ? v.mozCaptureStream() : null);
    if (!stream || stream.getTracks().length === 0) return;
    streamRef.current = stream;
    peersRef.current.forEach(pid => offerTo(pid));
  };

  const loadFile = (file) => {
    // re-link support: tear down any current broadcast so viewers get the new stream
    Object.values(pcsRef.current).forEach(pc => pc.close());
    pcsRef.current = {};
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    const url = URL.createObjectURL(file);
    const v = videoRef.current;
    v.src = url;
    v.load();
    v.play().catch(() => {});
    setFileChosen(true);
  };

  const pickFile = (e) => { const f = e.target.files?.[0]; if (f) loadFile(f); };
  const relink = () => fileInputRef.current?.click();

  // auto-load a file picked in the Create dialog
  useEffect(() => {
    if (!isOwner || fileChosen) return;
    const f = getLocalFile(reviewId);
    if (f && videoRef.current) { loadFile(f); clearLocalFile(reviewId); }
    // eslint-disable-next-line
  }, [isOwner, reviewId]);

  useEffect(() => {
    if (!isOwner) return;
    const ws = new WebSocket(wsUrl("broadcaster"));
    wsRef.current = ws;
    ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "peers") {
        peersRef.current = msg.peers; setViewerCount(msg.peers.length);
        msg.peers.forEach(pid => offerTo(pid));
      } else if ((msg.type === "role" && msg.role === "viewer") || msg.type === "peer-joined") {
        peersRef.current = Array.from(new Set([...peersRef.current, msg.peer])); setViewerCount(peersRef.current.length);
        offerTo(msg.peer);
      } else if (msg.type === "answer") {
        try { await pcsRef.current[msg.from]?.setRemoteDescription(new RTCSessionDescription(msg.sdp)); } catch { /* */ }
      } else if (msg.type === "ice") {
        try { await pcsRef.current[msg.from]?.addIceCandidate(msg.candidate); } catch { /* */ }
      } else if (msg.type === "peer-left") {
        pcsRef.current[msg.peer]?.close(); delete pcsRef.current[msg.peer];
        peersRef.current = peersRef.current.filter(p => p !== msg.peer); setViewerCount(peersRef.current.length);
      }
    };
    const timeIv = setInterval(() => {
      const v = videoRef.current; if (!v) return;
      onTime?.(v.currentTime); onPlaying?.(!v.paused);
      send({ type: "time", t: v.currentTime, playing: !v.paused, duration: v.duration || 0 });
    }, 200);
    return () => {
      clearInterval(timeIv);
      Object.values(pcsRef.current).forEach(pc => pc.close());
      pcsRef.current = {};
      streamRef.current?.getTracks().forEach(t => t.stop());
      ws.close();
    };
    // eslint-disable-next-line
  }, [isOwner, reviewId]);

  // owner: begin broadcasting as soon as the video has data / starts playing
  useEffect(() => {
    if (!isOwner) return;
    const v = videoRef.current; if (!v) return;
    const onMeta = () => onDuration?.(v.duration || 0);
    const onData = () => startBroadcast();
    const onPlay = () => startBroadcast();
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("loadeddata", onData);
    v.addEventListener("playing", onPlay);
    return () => { v.removeEventListener("loadedmetadata", onMeta); v.removeEventListener("loadeddata", onData); v.removeEventListener("playing", onPlay); };
    // eslint-disable-next-line
  }, [isOwner, fileChosen]);

  // ---------- VIEWER ----------
  useEffect(() => {
    if (isOwner) return;
    const ws = new WebSocket(wsUrl("viewer"));
    wsRef.current = ws;
    ws.onopen = () => send({ type: "role", role: "viewer" });
    ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "offer") {
        let pc = pcsRef.current[msg.from];
        if (pc) { try { pc.close(); } catch { /* */ } }
        pc = new RTCPeerConnection(ICE);
        pcsRef.current[msg.from] = pc;
        pc.ontrack = (e) => {
          if (videoRef.current) {
            videoRef.current.srcObject = e.streams[0];
            setStreaming(true);
            videoRef.current.play().catch(() => {});
          }
        };
        pc.onicecandidate = (e) => { if (e.candidate) send({ type: "ice", target: msg.from, candidate: e.candidate }); };
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: "answer", target: msg.from, sdp: answer });
      } else if (msg.type === "ice") {
        try { await pcsRef.current[msg.from]?.addIceCandidate(msg.candidate); } catch { /* */ }
      } else if (msg.type === "time") {
        onTime?.(msg.t); onPlaying?.(msg.playing); if (msg.duration) onDuration?.(msg.duration);
      } else if (msg.type === "peer-left") {
        setStreaming(false);
      }
    };
    return () => { Object.values(pcsRef.current).forEach(p => p.close()); pcsRef.current = {}; ws.close(); };
    // eslint-disable-next-line
  }, [isOwner, reviewId]);

  const unmute = () => { if (videoRef.current) { videoRef.current.muted = false; setMuted(false); videoRef.current.play().catch(() => {}); } };

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <video ref={videoRef} data-testid="local-video" autoPlay={!isOwner} playsInline muted={!isOwner ? muted : false}
        controls={isOwner && fileChosen} className="w-full h-full object-contain bg-black"/>

      {isOwner && !fileChosen && (
        <label data-testid="local-file-picker" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0A0A0B]/90 cursor-pointer">
          <Upload className="w-8 h-8 text-[#5A67D8]"/>
          <span className="font-mono text-xs uppercase tracking-wider text-[#EDEDF0]">Choose a local video to broadcast</span>
          <span className="font-mono text-[10px] text-[#5C5C66]">Streams live from your computer · nothing is uploaded</span>
          <input type="file" accept="video/*" className="hidden" onChange={pickFile}/>
        </label>
      )}

      {isOwner && fileChosen && (
        <>
          <span className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 bg-[#EF4444]/90 rounded-sm z-20" data-testid="broadcast-live">
            <Radio className="w-3 h-3 text-white animate-pulse"/><span className="font-mono text-[9px] uppercase tracking-wider text-white">Live · {viewerCount} watching</span>
          </span>
          <button onClick={relink} data-testid="relink-file" className="absolute top-2 right-2 z-20 flex items-center gap-1.5 px-2 py-1 bg-[#121214]/90 border border-[#232326] rounded-sm hover:bg-[#1a1a1d]">
            <RefreshCw className="w-3 h-3 text-[#5A67D8]"/><span className="font-mono text-[9px] uppercase tracking-wider text-[#EDEDF0]">Change file</span>
          </button>
          <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={pickFile}/>
        </>
      )}

      {!isOwner && !streaming && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0A0A0B]" data-testid="local-waiting">
          <Loader2 className="w-7 h-7 text-[#5A67D8] animate-spin"/>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]">Waiting for owner to start the broadcast…</span>
        </div>
      )}
      {!isOwner && streaming && muted && (
        <button onClick={unmute} data-testid="unmute-broadcast" className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-[#5A67D8] rounded-sm hover:bg-[#4C51BF]">
          <VolumeX className="w-3.5 h-3.5 text-white"/><span className="font-mono text-[9px] uppercase tracking-wider text-white">Tap to unmute</span>
        </button>
      )}
    </div>
  );
}
