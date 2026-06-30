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
