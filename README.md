# StudyFlow — AI Study Planner Generator

A cost-effective, explainable study-plan generator built for the Brainheaters
preselection task. See `backend/README.md` for the full architecture writeup
(the deterministic scheduling engine, priority formula, adaptive replanning,
and where AI is and isn't used) — that's the doc to read before the interview.

```
study-planner-app/
  backend/    Express + MongoDB API, deterministic scheduling engine, AI fallback
  frontend/   React + Vite + Tailwind UI, wired to the real backend API
```

## Run locally (two servers, fastest for development)

Terminal 1 — backend:
```bash
cd backend
npm install
cp .env.example .env      # fill in MONGO_URI (AI keys optional)
npm run dev                # http://localhost:5000
```

Terminal 2 — frontend:
```bash
cd frontend
npm install
cp .env.example .env       # defaults to http://localhost:5000/api, fine as-is
npm run dev                 # http://localhost:5173
```

Open http://localhost:5173 — onboard with a subject or two, and it'll call
the real backend the whole way through (no mock data left anywhere).

## Deploy as ONE service (simplest for a demo link)

The backend can serve the built frontend directly, so you only need a single
Render/Railway service and one URL to submit.

```bash
cd frontend
npm install
npm run build                        # outputs frontend/dist
cp -r dist/* ../backend/public/      # backend/server.js serves this if present
cd ../backend
npm install
npm start                            # now serves both API and UI on :5000
```

To deploy: push this whole repo to GitHub, create a Render Web Service
rooted at `backend/`, with:
- Build command: `npm install --prefix ../frontend && npm run build --prefix ../frontend && mkdir -p public && cp -r ../frontend/dist/* public/ && npm install`
- Start command: `npm start`
- Env vars: `MONGO_URI` (required), `GEMINI_API_KEY` or `GROQ_API_KEY` (optional)

(Or just build locally as shown above, commit `backend/public/` to the repo,
and point Render at `backend/` with build command `npm install` — simpler,
slightly less clean.)

## Deploy as TWO services (if you'd rather keep them separate)

- Deploy `backend/` to Render as its own Web Service (env vars as above).
- Deploy `frontend/` to Render/Vercel/Netlify as a static site, with
  `VITE_API_BASE_URL` set to your backend's deployed URL + `/api`.

## V2.0 Architecture Highlights

StudyFlow V2.0 introduces an end-to-end, syllabus-driven study planner modeled on real university curricula:
1. **Shared Syllabus Catalog**: Global `Subject` → `Module` → `Concept` catalog (seeded from Mumbai University CE Sem VII: `CSC701`, `CSC702`, `CSDC7013`, `CSDC7022`), separated from per-student progress (`StudentSubject`, `StudentProgress`).
2. **Three Strategic Goals**: `PASS` (high-yield concepts & essentials only), `SCORE_WELL` (broad coverage + revision), and `FULL_PREPARATION` (full syllabus).
3. **Feasibility Engine**: Mathematically assesses required vs available time prior to generation (`ON_TRACK`, `TIGHT`, `AT_RISK`, `EMERGENCY`). In emergency mode, prunes low-yield concepts and returns an explicit shortage message.
4. **Adaptive Spaced Repetition**: Exam-deadline aware intervals that accelerate/collapse as exams approach rather than dropping revisions.
5. **Strict AI Boundary & Zero-AI Fallback**: The AI parser converts free text into a strict schema validated against MongoDB in application code (no hallucinations, no AI schedule editing). If AI is unconfigured or returns unknown, a manual fallback modal allows direct structured plan generation.

## Seed the Mumbai University Syllabus (Backend)
```bash
cd backend
npm run seed:syllabus
```

## What's real vs. what's a known simplification

Everything in the frontend calls the real backend — there is zero mock data. A few honest simplifications:
- **Client Identity**: Uses a client-generated UUID (`x-user-id` header) or JWT token. Intentionally prioritized scheduling logic depth over authentication ceremony.
- **Clock Resequencing**: Rebalanced tasks (from missed sessions or workload cuts) receive `startTime: null` ("Added today" / "Rebalanced") rather than dynamically recalculating full 24-hour clock timelines.
- **LLM Boundary**: The LLM only parses natural language to a JSON intent. The application code handles 100% of syllabus validation and scheduling. When LLM keys are unset, manual fallback forms bypass AI entirely.
- **Move Subject Target Day Capacity**: `MOVE_SUBJECT` shifts sessions to tomorrow or a target date without re-running the full daily capacity check for that target day.
