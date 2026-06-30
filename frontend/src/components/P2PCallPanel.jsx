import React, { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from "lucide-react";

const ICE = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function P2PCallPanel({ reviewId, currentUser }) {
  const [team, setTeam] = useState([]);
  const [peers, setPeers] = useState([]); // ids of online peers in same room
  const [inCall, setInCall] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [remoteStreams, setRemoteStreams] = useState({}); // peerId -> stream
  const wsRef = useRef(null);
  const pcsRef = useRef({}); // peerId -> RTCPeerConnection
  const localRef = useRef(null);
  const localStreamRef = useRef(null);

  useEffect(() => { api.get("/team").then(r => setTeam(r.data)); }, []);

  const wsUrl = () => {
    const backend = process.env.REACT_APP_BACKEND_URL.replace(/^http/, "ws");
    return `${backend}/api/ws/${reviewId}?peer=${encodeURIComponent(currentUser.user_id)}`;
  };

  const startLocal = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    localStreamRef.current = stream;
    if (localRef.current) localRef.current.srcObject = stream;
    return stream;
  };

  const createPC = (peerId) => {
    const pc = new RTCPeerConnection(ICE);
    pcsRef.current[peerId] = pc;
    localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current?.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: "ice", target: peerId, candidate: e.candidate }));
      }
    };
    pc.ontrack = (e) => {
      setRemoteStreams(prev => ({ ...prev, [peerId]: e.streams[0] }));
    };
    return pc;
  };

  const join = async () => {
    await startLocal();
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;
    ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "peers") {
        setPeers(msg.peers);
        for (const pid of msg.peers) {
          const pc = createPC(pid);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          ws.send(JSON.stringify({ type: "offer", target: pid, sdp: offer }));
        }
      } else if (msg.type === "peer-joined") {
        setPeers(prev => Array.from(new Set([...prev, msg.peer])));
      } else if (msg.type === "peer-left") {
        setPeers(prev => prev.filter(p => p !== msg.peer));
        pcsRef.current[msg.peer]?.close();
        delete pcsRef.current[msg.peer];
        setRemoteStreams(prev => { const n = { ...prev }; delete n[msg.peer]; return n; });
      } else if (msg.type === "offer") {
        const pc = pcsRef.current[msg.from] || createPC(msg.from);
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", target: msg.from, sdp: answer }));
      } else if (msg.type === "answer") {
        await pcsRef.current[msg.from]?.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      } else if (msg.type === "ice") {
        try { await pcsRef.current[msg.from]?.addIceCandidate(msg.candidate); } catch { /* ignore */ }
      }
    };
    setInCall(true);
  };

  const leave = () => {
    Object.values(pcsRef.current).forEach(pc => pc.close());
    pcsRef.current = {};
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    setRemoteStreams({});
    setInCall(false);
  };

  useEffect(() => () => leave(), []); // eslint-disable-line

  const toggleMic = () => {
    const s = localStreamRef.current; if (!s) return;
    s.getAudioTracks().forEach(t => t.enabled = !t.enabled);
    setMicOn(s.getAudioTracks()[0]?.enabled);
  };
  const toggleCam = () => {
    const s = localStreamRef.current; if (!s) return;
    s.getVideoTracks().forEach(t => t.enabled = !t.enabled);
    setCamOn(s.getVideoTracks()[0]?.enabled);
  };

  return (
    <div className="p-4 border-b border-[#232326]" data-testid="p2p-panel">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93]">P2P call · {peers.length} live</span>
        {!inCall ? (
          <button onClick={join} data-testid="p2p-join" className="px-2 py-1 bg-[#10B981] text-black rounded-sm font-mono text-[10px] uppercase tracking-wider flex items-center gap-1"><Phone className="w-3 h-3"/>Join</button>
        ) : (
          <button onClick={leave} data-testid="p2p-leave" className="px-2 py-1 bg-[#EF4444] text-white rounded-sm font-mono text-[10px] uppercase tracking-wider flex items-center gap-1"><PhoneOff className="w-3 h-3"/>Leave</button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="aspect-video bg-black border border-[#232326] rounded-sm relative overflow-hidden">
          <video ref={localRef} autoPlay playsInline muted className="w-full h-full object-cover"/>
          <span className="absolute bottom-1 left-1 font-mono text-[9px] text-white/80">you</span>
        </div>
        {Object.entries(remoteStreams).map(([pid, stream]) => (
          <RemoteVideo key={pid} stream={stream} pid={pid}/>
        ))}
      </div>
      {inCall && (
        <div className="flex gap-2 mb-3">
          <button onClick={toggleMic} data-testid="p2p-mic" className={`flex-1 h-8 rounded-sm border ${micOn ? "border-[#232326] text-white" : "border-[#EF4444] text-[#EF4444]"} flex items-center justify-center`}>{micOn ? <Mic className="w-4 h-4"/> : <MicOff className="w-4 h-4"/>}</button>
          <button onClick={toggleCam} data-testid="p2p-cam" className={`flex-1 h-8 rounded-sm border ${camOn ? "border-[#232326] text-white" : "border-[#EF4444] text-[#EF4444]"} flex items-center justify-center`}>{camOn ? <Video className="w-4 h-4"/> : <VideoOff className="w-4 h-4"/>}</button>
        </div>
      )}
      <div className="flex -space-x-2 overflow-hidden">
        {team.slice(0, 6).map(t => {
          const online = peers.includes(t.user_id) || t.user_id === currentUser.user_id && inCall;
          return (
            <div key={t.user_id} className="relative" title={t.name}>
              <Avatar className={`w-8 h-8 border-2 ${online ? "border-[#10B981] ring-online" : "border-[#232326]"}`}>
                <AvatarImage src={t.picture}/><AvatarFallback className="text-[10px] bg-[#1a1a1d]">{t.name?.[0]}</AvatarFallback>
              </Avatar>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RemoteVideo({ stream, pid }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return (
    <div className="aspect-video bg-black border border-[#232326] rounded-sm relative overflow-hidden" data-testid={`remote-video-${pid}`}>
      <video ref={ref} autoPlay playsInline className="w-full h-full object-cover"/>
    </div>
  );
}
