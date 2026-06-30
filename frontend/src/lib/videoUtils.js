export function parseVideoUrl(url) {
  if (!url) return null;
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_\-]{6,})/);
  if (m) return { type: "youtube", id: m[1] };
  m = url.match(/vimeo\.com\/(\d+)/);
  if (m) return { type: "vimeo", id: m[1] };
  m = url.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_\-]+)/);
  if (m) return { type: "gdrive", id: m[1] };
  m = url.match(/drive\.google\.com\/open\?id=([A-Za-z0-9_\-]+)/);
  if (m) return { type: "gdrive", id: m[1] };
  return null;
}

export function getEmbedUrl(type, id) {
  if (type === "youtube") return `https://www.youtube.com/embed/${id}?enablejsapi=1&modestbranding=1&rel=0`;
  if (type === "vimeo") return `https://player.vimeo.com/video/${id}`;
  if (type === "gdrive") return `https://drive.google.com/file/d/${id}/preview`;
  return "";
}

export function formatTimecode(sec) {
  if (!Number.isFinite(sec)) return "00:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
}
