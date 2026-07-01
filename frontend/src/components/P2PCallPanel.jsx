import React, { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, PhoneCall } from "lucide-react";
import { toast } from "sonner";

const ICE = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function P2PCallPanel({ reviewId, currentUser }) {
  const [team, setTeam] = useState([]);
  const [peers, setPeers] = useState([]);      // online peer ids in this room
  const [inCall, setInCall] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [incoming, setIncoming] = useState(null); // {from, name}
  const [calling, setCalling] = useState(null);    // peerId we are ringing
  const wsRef = useRef(null);
  const pcsRef = useRef({});
  const localStreamRef = useRef(null);
  const localRef = useRef(null);
  const ringRef = useRef(null); // { ctx, osc, gain, timer }

  useEffect(() => { api.get("/team").then(r => setTeam(r.data)); }, []);

  const nameFor = (pid) => team.find(t => t.user_id === pid)?.name || "Someone";

  // ---- Ringtone (WebAudio, no external asset) ----
  const startRing = () => {
    if (ringRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination);
      const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = 460; osc.connect(gain); osc.start();
      let on = false;
      const timer = setInterval(() => { on = !on; gain.gain.setTargetAtTime(on ? 0.15 : 0, ctx.currentTime, 0.01); }, 500);
      ringRef.current = { ctx, osc, gain, timer };
    } catch { /* ignore */ }
  };
  const stopRing = () => {
    const r = ringRef.current; if (!r) return;
    clearInterval(r.timer); try { r.osc.stop(); r.ctx.close(); } catch { /* */ }
    ringRef.current = null;
  };

  const send = (msg) => { if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify(msg)); };

  const wsUrl = () => {
    const backend = process.env.REACT_APP_BACKEND_URL.replace(/^http/, "ws");
    return `${backend}/api/ws/${reviewId}?peer=${encodeURIComponent(currentUser.user_id)}`;
  };

  const startLocal = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    localStreamRef.current = stream;
    if (localRef.current) localRef.current.srcObject = stream;
    setInCall(true);
    return stream;
  };

  const createPC = (peerId) => {
    let pc = pcsRef.current[peerId];
    if (pc) return pc;
    pc = new RTCPeerConnection(ICE);
    pcsRef.current[peerId] = pc;
    localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
    pc.onicecandidate = (e) => { if (e.candidate) send({ type: "ice", target: peerId, candidate: e.candidate }); };
    pc.ontrack = (e) => setRemoteStreams(prev => ({ ...prev, [peerId]: e.streams[0] }));
    return pc;
  };

  // Persistent signaling connection (presence + incoming invites)
  useEffect(() => {
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;
    ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "peers") setPeers(msg.peers);
      else if (msg.type === "peer-joined") setPeers(prev => Array.from(new Set([...prev, msg.peer])));
      else if (msg.type === "peer-left") {
        setPeers(prev => prev.filter(p => p !== msg.peer));
        pcsRef.current[msg.peer]?.close(); delete pcsRef.current[msg.peer];
        setRemoteStreams(prev => { const n = { ...prev }; delete n[msg.peer]; return n; });
      } else if (msg.type === "call-invite") {
        if (!inCall) { setIncoming({ from: msg.from, name: msg.caller || nameFor(msg.from) }); startRing(); }
        else send({ type: "call-reject", target: msg.from });
      } else if (msg.type === "call-cancel") {
        setIncoming(cur => (cur && cur.from === msg.from ? null : cur)); stopRing();
      } else if (msg.type === "call-accept") {
        setCalling(null);
        await startLocal();
        const pc = createPC(msg.from);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send({ type: "offer", target: msg.from, sdp: offer });
      } else if (msg.type === "call-reject") {
        setCalling(null); toast.message(`${nameFor(msg.from)} declined the call`);
      } else if (msg.type === "offer") {
        const pc = createPC(msg.from);
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: "answer", target: msg.from, sdp: answer });
      } else if (msg.type === "answer") {
        await pcsRef.current[msg.from]?.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      } else if (msg.type === "ice") {
        try { await pcsRef.current[msg.from]?.addIceCandidate(msg.candidate); } catch { /* */ }
      }
    };
    return () => { hangUp(); ws.close(); };
    // eslint-disable-next-line
  }, [reviewId]);

  const callUser = async (peerId) => {
    await startLocal();
    setCalling(peerId);
    send({ type: "call-invite", target: peerId, caller: currentUser.name });
  };
  const cancelCall = () => { if (calling) send({ type: "call-cancel", target: calling }); setCalling(null); };

  const acceptCall = async () => {
    stopRing();
    const from = incoming.from; setIncoming(null);
    await startLocal();
    send({ type: "call-accept", target: from });
  };
  const rejectCall = () => { stopRing(); if (incoming) send({ type: "call-reject", target: incoming.from }); setIncoming(null); };

  const hangUp = () => {
    stopRing();
    Object.values(pcsRef.current).forEach(pc => pc.close());
    pcsRef.current = {};
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setRemoteStreams({}); setInCall(false); setCalling(null);
  };

  const toggleMic = () => { const s = localStreamRef.current; if (!s) return; s.getAudioTracks().forEach(t => t.enabled = !t.enabled); setMicOn(s.getAudioTracks()[0]?.enabled); };
  const toggleCam = () => { const s = localStreamRef.current; if (!s) return; s.getVideoTracks().forEach(t => t.enabled = !t.enabled); setCamOn(s.getVideoTracks()[0]?.enabled); };

  const onlineOthers = team.filter(t => t.user_id !== currentUser.user_id && peers.includes(t.user_id));

  return (
    <div className="p-4 border-b border-[#232326]" data-testid="p2p-panel">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93]">P2P call · {peers.length} online</span>
        {inCall && <button onClick={hangUp} data-testid="p2p-leave" className="px-2 py-1 bg-[#EF4444] text-white rounded-sm font-mono text-[10px] uppercase tracking-wider flex items-center gap-1"><PhoneOff className="w-3 h-3"/>Leave</button>}
      </div>

      {(inCall || Object.keys(remoteStreams).length > 0) && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="aspect-video bg-black border border-[#232326] rounded-sm relative overflow-hidden">
            <video ref={localRef} autoPlay playsInline muted className="w-full h-full object-cover"/>
            <span className="absolute bottom-1 left-1 font-mono text-[9px] text-white/80">you</span>
          </div>
          {Object.entries(remoteStreams).map(([pid, stream]) => <RemoteVideo key={pid} stream={stream} pid={pid} name={nameFor(pid)}/>)}
        </div>
      )}

      {inCall && (
        <div className="flex gap-2 mb-3">
          <button onClick={toggleMic} data-testid="p2p-mic" className={`flex-1 h-8 rounded-sm border ${micOn ? "border-[#232326] text-white" : "border-[#EF4444] text-[#EF4444]"} flex items-center justify-center`}>{micOn ? <Mic className="w-4 h-4"/> : <MicOff className="w-4 h-4"/>}</button>
          <button onClick={toggleCam} data-testid="p2p-cam" className={`flex-1 h-8 rounded-sm border ${camOn ? "border-[#232326] text-white" : "border-[#EF4444] text-[#EF4444]"} flex items-center justify-center`}>{camOn ? <Video className="w-4 h-4"/> : <VideoOff className="w-4 h-4"/>}</button>
        </div>
      )}

      {/* Online users you can call */}
      <div className="space-y-1.5" data-testid="p2p-online-list">
        {onlineOthers.length === 0 && <p className="font-mono text-[10px] text-[#5C5C66]">No one else is online right now.</p>}
        {onlineOthers.map(t => (
          <div key={t.user_id} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Avatar className="w-7 h-7 border-2 border-[#10B981]"><AvatarImage src={t.picture}/><AvatarFallback className="text-[9px] bg-[#1a1a1d]">{t.name?.[0]}</AvatarFallback></Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#10B981] border-2 border-[#0A0A0B]"/>
              </div>
              <span className="text-xs truncate max-w-[120px]">{t.name}</span>
            </div>
            {calling === t.user_id ? (
              <button onClick={cancelCall} data-testid={`p2p-cancel-${t.user_id}`} className="px-2 h-7 bg-[#EF4444] text-white rounded-sm font-mono text-[9px] uppercase tracking-wider flex items-center gap-1 animate-pulse"><PhoneOff className="w-3 h-3"/>Ringing…</button>
            ) : (
              <button onClick={() => callUser(t.user_id)} data-testid={`p2p-call-${t.user_id}`} className="px-2 h-7 bg-[#10B981] text-black rounded-sm font-mono text-[9px] uppercase tracking-wider flex items-center gap-1"><Phone className="w-3 h-3"/>Call</button>
            )}
          </div>
        ))}
      </div>

      {/* Incoming call modal */}
      {incoming && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur flex items-center justify-center px-6" data-testid="incoming-call-modal">
          <div className="w-full max-w-xs border border-[#232326] bg-[#121214] rounded-sm p-6 text-center">
            <PhoneCall className="w-8 h-8 text-[#10B981] mx-auto animate-bounce"/>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93] mt-4">Incoming call</p>
            <p className="text-lg font-semibold mt-1">{incoming.name}</p>
            <div className="flex gap-2 mt-5">
              <button onClick={rejectCall} data-testid="reject-call" className="flex-1 h-10 bg-[#EF4444] text-white rounded-sm flex items-center justify-center gap-1.5"><PhoneOff className="w-4 h-4"/><span className="font-mono text-[10px] uppercase tracking-wider">Decline</span></button>
              <button onClick={acceptCall} data-testid="accept-call" className="flex-1 h-10 bg-[#10B981] text-black rounded-sm flex items-center justify-center gap-1.5"><Phone className="w-4 h-4"/><span className="font-mono text-[10px] uppercase tracking-wider">Accept</span></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RemoteVideo({ stream, pid, name }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return (
    <div className="aspect-video bg-black border border-[#232326] rounded-sm relative overflow-hidden" data-testid={`remote-video-${pid}`}>
      <video ref={ref} autoPlay playsInline className="w-full h-full object-cover"/>
      <span className="absolute bottom-1 left-1 font-mono text-[9px] text-white/80">{name}</span>
    </div>
  );
}
