import React, { useEffect, useRef } from "react";

export default function AdSenseUnit() {
  const ref = useRef(null);
  useEffect(() => {
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* ignore */ }
  }, []);
  return (
    <ins ref={ref} className="adsbygoogle"
      style={{ display: "block", textAlign: "center", minHeight: 280 }}
      data-ad-layout="in-article"
      data-ad-format="fluid"
      data-ad-client="ca-pub-8818562112316343"
      data-ad-slot="1141026543"
      data-testid="adsense-unit"
    />
  );
}
