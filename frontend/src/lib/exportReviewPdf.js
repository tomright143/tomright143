import { jsPDF } from "jspdf";
import api from "@/lib/api";
import { toast } from "sonner";
import { formatTimecode } from "@/lib/videoUtils";

const loadImage = (src, cors) => new Promise((resolve) => {
  const img = new Image();
  if (cors) img.crossOrigin = "anonymous";
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

const buildFrameImage = async (overlayDataUrl, thumbImg) => {
  const cw = 640, ch = 360;
  const off = document.createElement("canvas");
  off.width = cw; off.height = ch;
  const ctx = off.getContext("2d");
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cw, ch);
  if (thumbImg) {
    const ir = thumbImg.width / thumbImg.height, cr = cw / ch;
    let dw = cw, dh = ch, dx = 0, dy = 0;
    if (ir > cr) { dh = ch; dw = ch * ir; dx = (cw - dw) / 2; } else { dw = cw; dh = cw / ir; dy = (ch - dh) / 2; }
    ctx.drawImage(thumbImg, dx, dy, dw, dh);
  }
  if (overlayDataUrl) {
    const ov = await loadImage(overlayDataUrl, false);
    if (ov) ctx.drawImage(ov, 0, 0, cw, ch);
  }
  try { return off.toDataURL("image/jpeg", 0.85); } catch { return null; }
};

// Compiles a frame-by-frame review PDF (screenshot + annotations + comment) for ALL timestamped comments.
// player: optional { seek(t) } used to move the source to each comment's timestamp before capture.
export async function exportReviewPdf({ review, user, player, canvasSelector = "[data-testid='annotation-canvas']", onStart, onProgress, onFinish }) {
  let comments = [];
  try { comments = (await api.get(`/comments/${review.id}`)).data; } catch { /* */ }
  const timed = comments.filter(c => c.timestamp != null).sort((a, b) => a.timestamp - b.timestamp);
  if (timed.length === 0) { toast.error("No timestamped comments to compile"); return; }

  const canvas = document.querySelector(canvasSelector);
  const thumbSrc = review.video_type === "youtube" ? `https://i.ytimg.com/vi/${review.video_id}/maxresdefault.jpg` : "";
  const thumbImg = thumbSrc ? await loadImage(thumbSrc, true) : null;

  onStart?.(timed.length);
  const frames = [];
  for (let i = 0; i < timed.length; i++) {
    const c = timed[i];
    try {
      if (player?.seek) { player.seek(c.timestamp); await new Promise(r => setTimeout(r, 650)); }
      let overlay = "";
      try { overlay = canvas ? canvas.toDataURL("image/png") : ""; } catch { overlay = ""; }
      const img = await buildFrameImage(overlay, thumbImg);
      frames.push({ comment: c, img });
    } catch { frames.push({ comment: c, img: null }); }
    onProgress?.(i + 1);
  }

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;
  const accent = [90, 103, 216];

  doc.setFillColor(10, 10, 11); doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text("WORXPHER", M, 34);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(150, 150, 160);
  doc.text("Frame-by-frame review list", M, 50);
  doc.setTextColor(180, 180, 190); doc.setFontSize(8);
  doc.text(new Date().toLocaleString(), pageW - M, 34, { align: "right" });
  doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text(doc.splitTextToSize(review.title, pageW - 2 * M), M, 96);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110, 110, 120);
  doc.text(`${timed.length} timestamped comments · exported by ${user.email}`, M, 112);

  let y = 132;
  const imgW = 230, imgH = imgW * 9 / 16;
  frames.forEach(({ comment, img }) => {
    const blockH = Math.max(imgH, 90) + 18;
    if (y + blockH > pageH - 40) { doc.addPage(); y = 40; }
    if (img) { try { doc.addImage(img, "JPEG", M, y, imgW, imgH); } catch { /* */ } }
    else { doc.setFillColor(20, 20, 22); doc.rect(M, y, imgW, imgH, "F"); }
    const tx = M + imgW + 16;
    const tw = pageW - tx - M;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 24);
    doc.text(doc.splitTextToSize(comment.owner_name || "Reviewer", tw), tx, y + 14);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(accent[0], accent[1], accent[2]);
    doc.text(`@ ${formatTimecode(comment.timestamp)}`, tx, y + 30);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(50, 50, 55);
    doc.text(doc.splitTextToSize(comment.text || "", tw), tx, y + 48);
    doc.setDrawColor(225, 225, 228); doc.line(M, y + blockH - 8, pageW - M, y + blockH - 8);
    y += blockH;
  });

  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(140, 140, 150);
    doc.text(`Worxpher · by Black Fxtudio · ${user.email}`, M, pageH - 20);
    doc.text(`${i} / ${pages}`, pageW - M, pageH - 20, { align: "right" });
  }

  const safeTitle = (review.title || "review").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`${safeTitle}-worxpher-review.pdf`);
  onFinish?.();
  toast.success("Review PDF downloaded");
}
