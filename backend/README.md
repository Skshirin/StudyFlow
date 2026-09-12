# AI Study Planner Generator — Backend

A cost-effective, explainable study-plan generator. The core is a **deterministic
scheduling engine** — no AI required to produce a plan. A **thin AI layer**
sits on top only for parsing free-text plan adjustments the rule-based parser
can't classify ("I have a family function tomorrow, rearrange my plan without
hurting my exam prep"). This keeps the product fast, free to run, and fully
explainable — every decision the planner makes can be traced back to a number,
not a black-box model call.

## Why this architectu## Architecture & Core Philosophy (V2.0 Syllabus-Aware)

```
                 STUDENT INPUT / GOAL (PASS, SCORE_WELL, FULL_PREPARATION)
                                      │
                                      ▼
                      ┌───────────────────────────┐
                      │   FEASIBILITY ENGINE      │   <- Mathematical pre-check
                      │   (feasibilityEngine.js)  │
                      │                           │
                      │ Required vs Available Time│
                      │ States:                   │
                      │ - ON_TRACK   (req <= 80%) │
                      │ - TIGHT      (80-105%)    │
                      │ - AT_RISK    (105-130%)   │
                      │ - EMERGENCY  (>130% or    │
                      │   <=2 days to exam)       │
                      └─────────────┬─────────────┘
                                    │
                         Emergency? │ No / Pruned
                                    ▼
                      ┌───────────────────────────┐
                      │   SCHEDULING ENGINE       │   <- 100% deterministic
                      │   (schedulingEngine.js)   │
                      │                           │
                      │ Priority Score =          │
                      │  0.25 × examUrgency       │
                      │ +0.20 × examRelevance     │
                      │ +0.20 × importance        │
                      │ +0.20 × weakness          │
                      │ +0.15 × remainingWork     │
                      │  × goalWeight Multiplier  │
                      │                           │
                      │ + concept study minutes   │
                      │ + adaptive spaced-rep     │
                      │   (exam deadline clamped) │
                      │ + energy capacity scale   │
                      └─────────────┬─────────────┘
                                    ▼
                             STUDY PLAN (Tasks)
                                    │
                 ┌──────────────────┴──────────────────┐
                 ▼                                     ▼
            COMPLETED                                MISSED
                 │                                     │
      updates StudentProgress                ┌──────────────────┐
      reviewStage, lastStudiedAt,            │ ADAPTIVE ENGINE  │ <- priority-aware
      revisionCount & status                 │(adaptiveEngine.js│
                                             │- hard exam bounds│
                                             │- re-scores score │
                                             │- displaces lower │
                                             │  priority tasks  │
                                             └────────┬─────────┘
                                                      ▼
                                                UPDATED PLAN

        Natural language: "I only have 2h today" / "I'm weak in Syntax Analysis"
                                    │
                                    ▼
                     ┌─────────────────────────────┐
                     │  RULE-BASED INTENT PARSER   │  <- deterministic regex, free, instant
                     │   (intentParser.js)         │
                     └──────────────┬──────────────┘
                          matched?  │ no match
                          │         ▼
                          │  ┌───────────────────────┐
                          │  │  AI FALLBACK LAYER    │  <- Gemini / Groq LLM
                          │  │ (gemini / groqService)│
                          │  └──────────┬────────────┘
                          ▼             ▼
                     Strict JSON Schema Payload
                                    │
                                    ▼
                     ┌─────────────────────────────┐
                     │   STRICT INTENT VALIDATOR   │  <- Application-level gatekeeper
                     │   (intentValidator.js)      │  <- Validates against real DB collections
                     └──────────────┬──────────────┘
                          valid?    │ invalid / unknown topic / no AI keys
                          │         ▼
                          │  Graceful Manual Fallback Modal
                          │  (bypasses AI entirely with structured inputs)
                          ▼
                 Deterministic Controller Execution
                 (AI never touches schedules directly)
```

**The key interview talking point:** The AI's *only* job is converting unstructured language into a strict JSON schema. Application code validates every subject, module, and concept against the live catalog in MongoDB before executing. Scheduling, feasibility, and adaptive replanning are 100% deterministic code. Even with zero AI keys configured, the entire application generates and adapts plans seamlessly.

---

## Features Implemented (V2.0)

- **Centralized Mumbai University Syllabus Catalog**: Seeded from official CE Semester VII curriculum (`CSC701`, `CSC702`, `CSDC7013`, `CSDC7022`) across 24 modules and 49 concepts with importance, difficulty, exam relevance, and study minutes.
- **Three Strategic Study Goals**:
  - `PASS`: Prioritizes high examRelevance and importance concepts, weak areas first, and essential prerequisites. Skips low-value concepts if time doesn't allow.
  - `SCORE_WELL`: Broader coverage across high and medium importance concepts with revision and practice sessions layered in.
  - `FULL_PREPARATION`: Comprehensive syllabus coverage subject to mathematical feasibility verification.
- **Feasibility Engine**: Mathematically evaluates required study minutes against available runway before generating a plan. If in `EMERGENCY`, prunes low-yield concepts, prioritizes high-yield topics, and returns an explicit shortage message without silent truncation.
- **Adaptive Spaced-Repetition**: Spaced repetition intervals (`[1, 3, 7, 14]`) respect the student's `examDate`. Intervals are pulled earlier or collapsed as the exam approaches rather than silently skipping revisions.
- **Priority-Aware Missed-Session Recalculation**: Missing a session never schedules work past the exam date. It recalculates priority scores under the shortened runway and displaces lower-priority tasks or explicitly postpones work if runway is exhausted.
- **Zero-AI & Manual Fallback**: When natural-language requests return `UNKNOWN` or when AI API keys are unconfigured, the UI presents a structured manual form (`Subject`, `Goal`, `Days`, `Hours/day`) that executes directly.

---

## Data Model (V2.0 Shared Syllabus Architecture)

### Shared Syllabus Catalog (Global / University)
One single set of documents for all students; never duplicated per user.
```
Subject (shared) { code, name, credits, createdAt }
Module (shared)  { subjectId, name, order, hours, createdAt }
Concept (shared) { moduleId, name, description, importance (1-3), difficulty (1-3),
                   examRelevance (1-3), estimatedStudyMinutes, order, createdAt }
Resource (shared){ conceptId, title, type: 'video'|'notes'|'practice'|'article'|'other' }
```

### Per-Student Layer (Personalized Progress & Plan)
```
StudentSubject  { userId, subjectId, examDate?, confidence (1-5),
                  targetGoal: 'PASS'|'SCORE_WELL'|'FULL_PREPARATION', availableHours, createdAt }

StudentProgress { userId, conceptId, status: 'not_started'|'in_progress'|'completed'|'needs_revision'|'mastered',
                  completionPercentage (0-100), confidence (1-5), lastStudiedAt?,
                  reviewStage (0-3), revisionCount, timestamps }

StudyPlan       { userId, startDate, endDate, dailyCapacityMinutes, timePreference, targetGoal }

Task            { userId, planId, subjectId?, subjectName?, topic, date, startTime,
                  duration, type, priorityScore, status, reason, timestamps }

EnergyLog       { userId, date, level }
```

---

## API Reference

All routes below require an `x-user-id: <uuid>` header (or standard JWT `Bearer` token).

| Method | Route                  | Body / Params                                   | Purpose |
|--------|------------------------|--------------------------------------------------|---------|
| GET    | `/api/health`          | —                                                  | Server healthcheck |
| GET    | `/api/subjects`        | —                                                  | List enrolled student subjects with module/concept progress |
| POST   | `/api/subjects`        | `{ subjectId, examDate?, targetGoal?, confidence? }` | Enroll student in a shared syllabus subject |
| PUT    | `/api/subjects/:id`    | `{ examDate?, targetGoal?, confidence? }`          | Update subject enrollment preferences |
| DELETE | `/api/subjects/:id`    | —                                                  | Drop a subject enrollment |
| POST   | `/api/plan/generate`   | `{ dailyCapacityMinutes, days?, targetGoal?, subjectId? }` | Run Feasibility & Generate full plan tasks |
| GET    | `/api/plan/today`      | —                                                  | Today's tasks with importance/examRelevance badges + Plan Health |
| POST   | `/api/plan/adjust`     | `{ text: "I only have 2 hours today" }`            | Natural-language adjustment with validation & fallback |
| GET    | `/api/plan/:date`      | `date = YYYY-MM-DD`                                | Tasks for a specific date |
| POST   | `/api/tasks/:id/complete` | `{ feedback?: 'easy'|'normal'|'difficult' }`    | Complete task, advance reviewStage & StudentProgress |
| POST   | `/api/tasks/:id/miss`  | —                                                  | Priority-aware missed-task recalculation |

---

## Known Limitations / Honest Next Steps (Interview Discussion Points)

1. **Rebalanced Tasks Lack Fixed Time Slots**: Tasks redistributed due to missed sessions or workload reductions receive `startTime: null` (displaying as "Added today" / "Rebalanced") rather than resequencing the entire day's clock schedule. Resequencing clocks dynamically would require full timeline reflow.
2. **Move Subject Date Collision Check**: `MOVE_SUBJECT` shifts sessions to tomorrow or a target date without re-running the full daily capacity check for that target day. A production engine should reflow the destination day.
3. **Single Active Goal per Subject**: A student configures one goal (`PASS`, `SCORE_WELL`, `FULL_PREPARATION`) per subject at a time. Multi-goal split plans (e.g. "pass Module 1, score well on Module 2") are not modeled.
4. **Auth Model**: Default client identity uses a client-generated UUID via `x-user-id` header (though JWT token auth middleware is also supported). This intentionally prioritized scheduling algorithm depth over auth boilerplate for the demo.
5. **LLM Context Boundary**: The LLM prompt receives subject names and user requests but never whole curriculum graphs; validation happens deterministically in Node.js against MongoDB. If a student uses colloquial slang not in the rule parser, it gracefully falls back to the manual input form.
6. **Task Resequencing**: `AVG_MINUTES_PER_TOPIC` (90 min) in legacy Plan Health is superseded by exact `Concept.estimatedStudyMinutes` in V2.0, but legacy fallback routes still utilize the baseline approximation when non-syllabus subjects are encountered.
