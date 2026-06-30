import React, { useEffect, useRef, useState } from "react";

// Renders annotations at current timestamp and captures new ones
export default function AnnotationCanvas({ annotations, currentTime, tool, color, brush = 3, onAdd, enabled }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState([]);

  // Draw annotations whose timestamp is near currentTime (±2s window)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    const w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);

    const visible = annotations.filter(a => Math.abs(a.timestamp - currentTime) < 2.5);
    visible.forEach(a => drawAnnotation(ctx, a, w, h));

    if (drawing && points.length > 0) {
      drawAnnotation(ctx, { tool, color, points, brush }, w, h, true);
    }
  }, [annotations, currentTime, drawing, points, tool, color, brush]);

  // Resize canvas to match container
  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current;
      const ct = containerRef.current;
      if (!c || !ct) return;
      const rect = ct.getBoundingClientRect();
      c.width = rect.width;
      c.height = rect.height;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const getPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX ?? e.touches?.[0]?.clientX) - rect.left) / rect.width;
    const y = ((e.clientY ?? e.touches?.[0]?.clientY) - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  const onDown = (e) => {
    if (!enabled) return;
    e.preventDefault();
    if (tool === "eraser") {
      const p = getPoint(e);
      // mark visible annotations within radius as erased by adding "erase" annotation
      onAdd({ tool: "erase", color: "#000", brush, points: [p] });
      return;
    }
    if (["like", "impressed", "dislike", "tick", "cross"].includes(tool)) {
      const p = getPoint(e);
      onAdd({ tool, color, brush, points: [p] });
      return;
    }
    setDrawing(true);
    setPoints([getPoint(e)]);
  };
  const onMove = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = getPoint(e);
    if (tool === "freehand") setPoints(prev => [...prev, p]);
    else setPoints(prev => [prev[0], p]); // arrow / circle / dashed = 2 points
  };
  const onUp = () => {
    if (!drawing) return;
    setDrawing(false);
    if (points.length >= 1) {
      onAdd({ tool, color, brush, points });
    }
    setPoints([]);
  };

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        data-testid="annotation-canvas"
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: enabled ? "auto" : "none", touchAction: "none", cursor: enabled ? "crosshair" : "default" }}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
      />
    </div>
  );
}

function drawAnnotation(ctx, a, w, h, isLive = false) {
  ctx.save();
  ctx.strokeStyle = a.color || "#5A67D8";
  ctx.fillStyle = a.color || "#5A67D8";
  ctx.lineWidth = a.brush || 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const pts = (a.points || []).map(p => ({ x: p.x * w, y: p.y * h }));
  if (pts.length === 0) { ctx.restore(); return; }

  if (a.tool === "freehand") {
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
  } else if (a.tool === "arrow") {
    if (pts.length < 2) { ctx.restore(); return; }
    const [s, e] = pts;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    const ang = Math.atan2(e.y - s.y, e.x - s.x); const len = 14;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x - len * Math.cos(ang - Math.PI / 6), e.y - len * Math.sin(ang - Math.PI / 6));
    ctx.lineTo(e.x - len * Math.cos(ang + Math.PI / 6), e.y - len * Math.sin(ang + Math.PI / 6));
    ctx.closePath(); ctx.fill();
  } else if (a.tool === "circle") {
    if (pts.length < 2) { ctx.restore(); return; }
    const [s, e] = pts;
    const cx = (s.x + e.x) / 2, cy = (s.y + e.y) / 2;
    const rx = Math.abs(e.x - s.x) / 2, ry = Math.abs(e.y - s.y) / 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  } else if (a.tool === "dashed") {
    if (pts.length < 2) { ctx.restore(); return; }
    ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
  } else if (a.tool === "tick") {
    const p = pts[0]; ctx.beginPath(); ctx.moveTo(p.x - 12, p.y); ctx.lineTo(p.x - 2, p.y + 12); ctx.lineTo(p.x + 16, p.y - 10); ctx.lineWidth = 4; ctx.stroke();
  } else if (a.tool === "cross") {
    const p = pts[0]; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(p.x - 12, p.y - 12); ctx.lineTo(p.x + 12, p.y + 12);
    ctx.moveTo(p.x + 12, p.y - 12); ctx.lineTo(p.x - 12, p.y + 12); ctx.stroke();
  } else if (["like", "impressed", "dislike"].includes(a.tool)) {
    const p = pts[0];
    const emoji = a.tool === "like" ? "👍" : a.tool === "impressed" ? "🔥" : "👎";
    ctx.font = "32px serif";
    ctx.fillText(emoji, p.x - 16, p.y + 12);
  }
  if (isLive) { ctx.globalAlpha = 0.6; }
  ctx.restore();
}
