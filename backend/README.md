# AI Study Planner Generator — Backend

A cost-effective, explainable study-plan generator. The core is a **deterministic
scheduling engine** — no AI required to produce a plan. A **thin AI layer**
sits on top only for parsing free-text plan adjustments the rule-based parser
can't classify ("I have a family function tomorrow, rearrange my plan without
hurting my exam prep"). This keeps the product fast, free to run, and fully
explainable — every decision the planner makes can be traced back to a number,
not a black-box model call.

## Why this architecture

```
                STUDENT INPUT (subjects, topics, exam dates, daily capacity)
                                     │
                                     ▼
                     ┌───────────────────────────┐
                     │   SCHEDULING ENGINE        │   <- 100% deterministic
                     │   (schedulingEngine.js)     │
                     │                             │
                     │  Priority Score =           │
                     │   0.40 × examUrgency         │
                     │  +0.20 × difficulty          │
                     │  +0.25 × weakness            │
                     │  +0.15 × remainingWork       │
                     │                             │
                     │  + spaced repetition due-check│
                     │  + energy-adjusted capacity   │
                     │  + break blocks               │
                     └──────────────┬──────────────┘
                                    ▼
                              STUDY PLAN (Tasks)
                                    │
                 ┌──────────────────┴──────────────────┐
                 ▼                                      ▼
            COMPLETED                                 MISSED
                 │                                      │
     updates spaced-repetition state          ┌─────────────────────┐
     (schedulingEngine intervals)             │  ADAPTIVE ENGINE     │  <- deterministic
                                               │ (adaptiveEngine.js)  │
                                               │ redistributes minutes│
                                               │ across next N days,  │
                                               │ respecting capacity  │
                                               └──────────┬───────────┘
                                                           ▼
                                                    UPDATED PLAN

        Free-text tweak: "I'm tired today" / "move Math to tomorrow"
                                    │
                                    ▼
                     ┌───────────────────────────┐
                     │  RULE-BASED INTENT PARSER  │   <- tried first, free, instant
                     │   (intentParser.js)        │
                     └──────────────┬─────────────┘
                          matched? │ no match
                          │        ▼
                          │  ┌─────────────────────┐
                          │  │  AI FALLBACK (Groq)  │   <- only for unstructured text
                          │  │  (groqService.js)    │
                          │  └──────────┬───────────┘
                          ▼             ▼
                     structured intent { intent, params }
                                    │
                                    ▼
                 Deterministic code applies the change
                 (scheduling/adaptive engine — AI never
                  edits the plan directly)
```

**The key interview talking point:** AI interprets messy language into a
strict schema; the application (not the model) decides what actually happens
to the plan. This is cheaper, faster, and impossible for the AI to get
"creatively wrong" in a way that corrupts your data.

## Features implemented

- **Priority formula** with exam urgency, difficulty, weakness (derived from a
  student-given confidence score), and remaining-syllabus weighting — all
  normalized so no single factor dominates.
- **Deterministic "Why today?" reasoning** on every task (e.g. *"Exam in 4
  days • weak topic • not reviewed in 6 days"*) — generated from the same
  numbers used to rank it. No AI call needed for this.
- **Simplified spaced repetition** (1 → 3 → 7 → 14 day intervals), adjusted by
  student self-reported feedback (easy / normal / difficult) after completing
  a revision.
- **Energy-aware capacity**: a student can log today as high/normal/low
  energy; the day's total available minutes scale accordingly (this is where
  you'd wire "schedule hard topics for high-energy days" in a v2).
- **Task types**: `LEARN`, `PRACTICE` (reserved for future granularity),
  `REVISE`, `MOCK_TEST`, `REVIEW_MISTAKES` (reserved), `BREAK`.
- **Adaptive replanning**: missing a task redistributes its minutes across the
  next few days without violating each day's capacity.
- **Plan Health** traffic light (🟢/🟡/🔴): remaining required study time vs.
  time available before the nearest exam — a single deterministic number.
- **No login system.** The frontend generates a UUID once (client-side,
  `crypto.randomUUID()`), stores it in `localStorage`, and sends it as an
  `x-user-id` header. This intentionally trades "real auth" for spending that
  time on the scheduler instead — the part of the brief that actually matters.
- **AI used sparingly, not "once per day."** It only fires when the rule-based
  intent parser can't classify a free-text plan-adjustment request.

## Data model

```
Subject { userId, name, examDate?, difficulty(1-5), confidence(1-5),
          topics: [{ name, status, lastStudiedDate, reviewStage, revisionCount }] }

StudyPlan { userId, startDate, endDate, dailyCapacityMinutes, timePreference }

Task { userId, planId, subjectId?, subjectName?, topic, date, startTime,
       duration, type, priorityScore, status, reason }

EnergyLog { userId, date, level }
```

## API reference

All routes below require an `x-user-id: <uuid>` header.

| Method | Route                  | Body / Params                                   | Purpose |
|--------|------------------------|--------------------------------------------------|---------|
| GET    | `/api/health`          | —                                                  | Server healthcheck (no `x-user-id` needed) |
| POST   | `/api/subjects`        | `{ name, examDate?, difficulty?, confidence?, topics: [string] }` | Add a subject |
| GET    | `/api/subjects`        | —                                                  | List subjects |
| PUT    | `/api/subjects/:id`    | `{ name?, examDate?, difficulty?, confidence?, addTopics?: [string] }` | Update a subject |
| DELETE | `/api/subjects/:id`    | —                                                  | Remove a subject |
| POST   | `/api/plan/generate`   | `{ dailyCapacityMinutes, timePreference?, days? }` | Generate the full plan (Tasks) |
| GET    | `/api/plan/today`      | —                                                  | Today's tasks + Plan Health |
| GET    | `/api/plan/health`     | —                                                  | Plan Health only |
| POST   | `/api/plan/energy`     | `{ date, level: 'high'|'normal'|'low' }`           | Log today's energy |
| POST   | `/api/plan/adjust`     | `{ text: "I'm tired today" }`                      | Free-text plan adjustment |
| GET    | `/api/plan/:date`      | `date = YYYY-MM-DD`                                | Tasks for a specific day |
| POST   | `/api/tasks/:id/complete` | `{ feedback?: 'easy'|'normal'|'difficult' }`    | Mark a task done, update spaced-rep state |
| POST   | `/api/tasks/:id/miss`  | —                                                  | Mark a task missed, triggers adaptive replanning |

## Setup

```bash
npm install
cp .env.example .env      # then fill in MONGO_URI (GROQ_API_KEY is optional)
npm run dev                # nodemon, or `npm start` for plain node
```

## Deploying for free

1. **Database**: create a free MongoDB Atlas cluster, add a database user,
   whitelist `0.0.0.0/0` (or your host's IPs), copy the connection string into
   `MONGO_URI`.
2. **Backend host**: push this repo to GitHub, then create a new Web Service
   on Render (or Railway) pointing at it. Build command: `npm install`. Start
   command: `npm start`. Add `MONGO_URI` (and optionally `GROQ_API_KEY`) as
   environment variables in the dashboard.
3. **AI (optional)**: create a free Groq API key at console.groq.com and set
   `GROQ_API_KEY` — the app works fine without it, just with a smaller set of
   understood phrasings for plan adjustments.

## Known limitations / honest next steps

- `MOVE_SUBJECT` moves a task to a new date without re-checking that day's
  capacity — a good v2 improvement (reflow the target day too).
- Rebalanced tasks from `missTask`/`BLOCK_TODAY` get `startTime: null` (shown
  as "added today" rather than a fixed slot) since resequencing a whole day's
  clock times on every change adds complexity beyond this task's scope.
- `AVG_MINUTES_PER_TOPIC` (90 min) in Plan Health is a flat estimate rather
  than per-subject/difficulty-aware — simple on purpose, easy to justify and
  easy to improve later.
- No password auth by design (see Data model section) — swappable for
  JWT/Google login later without touching the scheduling logic at all.
