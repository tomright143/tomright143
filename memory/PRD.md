# Zero-Storage Video Review & Collaboration Platform — PRD

## Original Problem Statement (verbatim summary)
Production-ready, mobile-responsive cross-platform web app called **"Zero-Storage Video Review & Collaboration Platform"**. No heavy video storage — stream from YouTube/Vimeo/Google Drive. Frame-accurate canvas annotations, threaded Instagram-style comments with @mentions, dynamic floating watermark, WebRTC P2P call panel, 15–20s Page-Visibility ad-lock for PDF export on free tier, Razorpay subscription plans (Creator ₹299/mo, Studio ₹799/mo white-label). Desktop: two-panel layout. Mobile: bottom sheet drawer for comments + FAB toolbar.

## User Choices (Iteration 1)
- Authentication: **Emergent-managed Google Auth**
- Payments: **Razorpay MOCKED** for now
- P2P WebRTC: real cross-network signaling via WebSocket (`/api/ws/{review_id}`) with public STUN servers
- Design: emergent.sh palette + style (dark Swiss/high-contrast, #5A67D8 accent, JetBrains Mono accents)

## Architecture
- **Frontend**: React 19 + React Router + Tailwind + shadcn/ui + sonner + lucide-react
- **Backend**: FastAPI + Motor (MongoDB async) + Emergent Auth integration + WebSocket signaling hub
- **DB**: MongoDB collections — `users`, `user_sessions`, `reviews`, `annotations`, `comments`
- All API routes prefixed `/api/*`; WebSocket at `/api/ws/{review_id}?peer=<user_id>`

## Personas
- **Solo Creator**: free tier, accepts 15s ad to export PDF
- **Studio**: Studio plan with white-label logo + dynamic asset storage
- **Reviewer/Client**: joins via shared link to leave timed feedback

## Implemented in Iteration 1 (Feb 2026)
- Emergent OAuth login → dashboard
- Dashboard: list/create/delete reviews; create-review dialog parses YouTube/Vimeo/Drive URL & extracts video_id
- Workspace: 16:9 player + transparent canvas overlay, frame-step 0.05s (← →), Space play/pause, double-tap mobile skip
- Annotations: arrow, circle, dashed line, freehand, tick, cross + reaction stamps Like/Impressed/Not-liked; per-tool color picker; saved with normalized (x,y) + timestamp; visible during ±2.5s window
- Threaded comments (1-level reply, Instagram-style) with @mention suggestions, timecode-seek, embedded clickable hyperlinks
- WebRTC P2P call panel: WebSocket signaling, public STUN, online ring pulse on team avatars, mic/cam toggle, multi-peer
- Dynamic drifting watermark (30-40% opacity) on every player when download disallowed
- Page-Visibility / focus-lock 15s rewarded ad modal — pauses countdown when tab hidden/blurred and shows "Please keep this screen active to finish generating your PDF."
- Razorpay subscription (MOCKED): Creator ₹299 / Studio ₹799 instant upgrade endpoint
- PDF export: opens print-ready report including review URL, annotations, timestamps, and brand logo (Studio plan) or app branding (Free/Creator)
- Settings: white-label brand logo upload (Studio only, persisted as data-URL)
- Mobile: bottom sheet drawer for comments + bottom sheet for P2P panel; horizontal scrolling toolbar dock

## Implemented in Iteration 2 — Worxpher fork (Jun 2026)
- **Rebrand Review.io → Worxpher**: transparent cropped logo at `/frontend/public/worxpher-logo.png` used in TopNav, Login, Footer, SharedReview, index.html title, Admin header; PDF/invoice branding text switched to "Worxpher"; API root returns "Worxpher API".
- **PDF Export Engine rebuild** (Workspace.jsx): jsPDF-based compiled review list — progress modal ("Capturing frame X of Y"), seeks player to each of ALL timestamped comments, composites YouTube thumbnail + annotation-canvas overlay, downloads a multi-page A4 PDF with dark-text Worxpher wordmark header + per-page footer.
- **Cancel Plan bug FIXED** (Dashboard.jsx): replaced flaky window.confirm with shadcn AlertDialog (confirm-cancel-plan) + e.stopPropagation; hits /api/billing/cancel then refresh(). Verified working by testing agent.
- **Google Drive playback**: embed URL now `/preview?usp=drivesdk` + iframe allow autoplay (videoUtils.js).
- **Admin link visibility FIXED**: AuthCallback now calls refresh() (→ /auth/me) after session so is_admin/plan_until populate immediately.
- **Workspace Edit/Delete**: header buttons (workspace-edit-button/delete-button) with edit dialog + delete confirm → navigates to dashboard.
- **Admin Reset User Data**: backend POST /api/admin/users/{user_id}/reset wipes user's reviews/annotations/comments; Admin Users tab has reset-user-{id} button with double-confirm (confirm + type-email prompt).
- **Pricing overhaul** (Pricing.jsx): per-plan accent colors + hover lift/glow, prominent "Open in UPI app" CTA (upi-deeplink), GPay/PhonePe/Paytm brand chips, mobile auto-opens UPI pay sheet on plan tap.
- **Annotation frame precision**: visible window tightened ±2.5s → ±0.15s (AnnotationCanvas.jsx).
- **Share link auth gate**: backend already required auth; SharedReview now shows shared-auth-gate + Google sign-in for unauthenticated visitors; post-login redirect returns to the shared URL (sessionStorage). Any logged-in user can view.

## Test Status (updated)
- iteration_2.json — backend 100% / frontend 100%. Recurring cancel-plan bug CONFIRMED FIXED. No critical/minor issues.

## Implemented in Iteration 3 — Collaboration + White-label + CMS (Jun 2026)
- **Shared-review UI parity**: SharedReview now mirrors the creator Workspace (wide two-panel, bigger video, P2P panel + comment sidebar, mobile sheet). Larger Worxpher logo (~2.5x) across Login/TopNav/Shared/Footer.
- **Live online presence**: `PresenceBar` (HTTP heartbeat every 5s → `/reviews/{id}/heartbeat` + `/reviews/{id}/presence`, 15s window, opportunistic stale cleanup) shows "N viewing" + green-dot avatars on Workspace & Shared.
- **Real-time refresh**: comments (CommentSidebar) and annotation pointers (Workspace/Shared) poll every 4s so collaborators' notes/pointers appear live.
- **Google Drive removed** everywhere (parse/embed/create form/backend). 
- **Local-file live broadcast** (`LocalVideo.jsx` + `/api/ws/broadcast/{id}`): owner picks a local video → plays + `captureStream()` → WebRTC-broadcasts live to reviewers while tab is open (zero upload); broadcaster relays playback time so viewers' annotations stay in sync. New `video_type='local'`.
- **Real WebRTC calling** (`P2PCallPanel` rewrite): persistent signaling connection; lists online users; click Call → targeted invite → callee gets WebAudio **ringtone** + Accept/Reject modal; audio+video mesh.
- **White-label (Studio/Business)**: custom logo (existing) + accent color + website & Instagram links shown in TopNav; edited in Settings; gated server-side in `/settings/profile`.
- **Admin CMS** (`/content` public GET, `/admin/content` POST): edit landing headline/tagline/footer text + pricing plan names/perks via new Admin "Content" tab; consumed by Login, Footer, Pricing.

## Test Status (updated)
- iteration_3.json — backend 8/8 / frontend 100%. No bugs. NOTE: live WebRTC media (local broadcast + P2P calling) verified at DOM/endpoint/signaling level only; **actual media streaming needs manual 2-browser validation**.

## Deferred / Backlog (P1)
- Real Razorpay live keys (orders + webhook)
- Self-serve ad upload & scheduling for premium business users
- PDF burn-in date/time/email overlay on downloaded video stream (server-side compositing)
- Capacitor/Cordova hybrid mobile wrapping
- Annotation edit/delete UI per item (only "clear my annotations" exists)
- Permanent screen-recording prevention (CSS-only mitigation — true DRM not feasible in browser)

## Backlog (P2)
- Email/in-app notifications on @mention
- Public share links / viewer-only access
- Asset library for Studio (logo presets, stamps custom uploads)
- Review version history / multiple cuts

## Test Status
- iteration_1.json — backend 100% / frontend 100% (2 LOW-priority non-blocking notes about testid naming and ad-paused banner only mounted when document hidden)

## Next Action Items
- Plug real Razorpay test keys (the user can drop them into `/app/backend/.env` and we swap mocks for real order flow)
- Implement true PDF burn-in for video exports if user demands
- Add notification fan-out on @mentions
