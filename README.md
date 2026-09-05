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

## What's real vs. what's a known simplification

Everything in the frontend calls the real backend — there is no mock data
left in the project. A few honest simplifications, also noted in
`backend/README.md`:
- No login/password — a client-generated UUID (`x-user-id` header) stands in
  for auth. Good enough for a demo, swappable for real auth later.
- Rebalanced tasks (from a missed session) don't get a fixed clock time —
  they show as "Added" rather than resequencing the whole day.
- Cycling a topic's status by hand in the Subjects screen is a manual
  override; the "real" way status changes is by completing a scheduled task.
