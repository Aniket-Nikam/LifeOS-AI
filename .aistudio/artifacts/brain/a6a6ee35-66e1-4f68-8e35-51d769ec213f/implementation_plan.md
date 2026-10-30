# LifeOS — The Adaptive Personal Operating System

LifeOS is a full-stack, constraint-aware personal operating system that transforms scattered academic, professional, and personal commitments into realistic time-blocked schedules—and deterministically adapts those plans with before-and-after previews when real life shifts.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Approval-First Gate & Interactive Provisioning Required After Approval**
> In accordance with Part 1 of your specification, **zero application code or configuration files have been modified**. Upon your approval of this plan, we will immediately trigger the official Google AI Studio provisioning flow for **Firebase (Authentication & Cloud Firestore)** and optional **Google Calendar OAuth (Read-Only)** before writing implementation code.

- **Confirmed Decision 1 — Deterministic Scheduling vs. AI Interpretation**: All time math, interval calculation, collision detection, session splitting, and deadline feasibility checks execute inside a 100% deterministic TypeScript scheduling engine. Gemini (`gemini-3.8-flash` / `gemini-4-argon` via `@google/genai` on the Express backend) is strictly scoped to natural-language task parsing, Reality Shift intent extraction, bottleneck explanations, and copilot suggestions—and can never bypass hard constraints or mutate an active schedule without explicit user approval.
- **Confirmed Decision 2 — Preview-First Transactional Replanning**: Reality Shift and What-If Simulations never overwrite active schedule blocks directly. They compute an isolated proposal against a versioned plan snapshot (`scheduleVersion`), present a visual diff and conflict report, and commit via atomic batch/transaction checks only when the user clicks **Approve & Apply Plan**.
- **Confirmed Decision 3 — Optional Demo Workspace Isolation**: New authenticated accounts start with a clean workspace after onboarding (never polluted with fictional tasks). A clearly labeled **Demo Mode / Load Student Scenario** toggle allows testing the complete 14-step college student scenario in an isolated sandbox or via explicit opt-in seed import.

---

## 1. Overview & Core Concept (Problem Restatement & Workflows)

### The Actual Problem LifeOS Solves
Traditional to-do lists and static calendars fail when managing competing, heterogeneous obligations—such as university lectures, exam preparation, software engineering projects, freelance work, gym sessions, guitar practice, reading, sketching, social outings, and sleep. A flat task list captures *what* needs doing, but cannot answer:
1. **Capacity & Placement**: *When* should each task happen given fixed classes, sleep windows, and energy rhythms, and what realistically fits today?
2. **Constraint Protection**: Which commitments are non-negotiable (locked classes, sleep, deadlines) versus flexible or splittable?
3. **Adaptive Replanning (Reality Shift)**: When real life deviates—waking up two hours late, an assignment taking 90 extra minutes, or an unexpected 3 PM–4 PM meeting—how do we recalculate the remainder of the day/week without overwriting completed tasks, moving locked blocks, or silently missing deadlines?

### Primary Users & Core Workflows
- **Target Persona**: College students, technical builders, freelancers, and multi-priority professionals balancing fixed schedules, hard deadlines, and recurring habits.
- **Core End-to-End Workflows**:
  1. **Authentication & Guided Onboarding**: Sign in with Google via Firebase Auth $\rightarrow$ configure timezone (with overnight sleep/work support), sleep window, focus hours, break preferences, initial goals, and recurring routines.
  2. **Capture & Structure (Tasks, Goals, Routines)**: Add tasks manually or via natural-language AI parsing (*"Study networking for two hours before Thursday evening"* $\rightarrow$ user-reviewed structured fields), link tasks to measurable Goals/Milestones, and define bounded Recurring Routines.
  3. **Deterministic Schedule Generation**: Run the constraint solver over a daily or 7-day horizon $\rightarrow$ place fixed commitments and sleep protection first $\rightarrow$ allocate flexible/splittable tasks by urgency, priority, and energy match $\rightarrow$ inspect scheduled blocks, capacity breakdown, and any unscheduled-task conflict reports.
  4. **Interactive Time Canvas Manipulation**: View and adjust the Daily Vertical Timeline or 7-Day Grid via drag-and-drop (`@dnd-kit`) or accessible keyboard/form controls, with live collision/constraint validation on every move or resize.
  5. **Reality Shift (Adaptive Replanning)**: Trigger *"Reality Shift — Replan My Day"* via natural language or quick presets $\rightarrow$ inspect the before-and-after diff, displaced tasks, and reason codes $\rightarrow$ explicitly **Approve** (committing a new `planVersion` with 1-click **Undo**) or **Reject**.
  6. **What-If Simulator**: Experiment with hypothetical schedule changes (e.g., waking up at 9 AM, adding a Friday project deadline, reserving an evening off) in a zero-mutation sandbox with side-by-side capacity and trade-off metrics.
  7. **Focus Execution & Time Intelligence**: Run timestamp-accurate countdown/elapsed focus timers that survive tab suspension $\rightarrow$ record actual effort against planned estimates $\rightarrow$ analyze real historical completion accuracy, category allocation, and replanning frequency in Recharts.

---

## 2. User Experience & Visual Design

### Visual Identity & Theme
- **Aesthetic Direction**: Sophisticated Mission-Control SaaS interface—high-craft, calm precision, zero decorative bloat or fake telemetry tickers.
- **Dual-Theme Palette (Dark Default + Light Mode)**:
  - Configured via Tailwind CSS v4 `@custom-variant dark (&:where(.dark, .dark *));` with complete surface/text/border pairing.
  - **Dark Canvas (Default)**: Deep Midnight Navy (`#0B0F19` / `slate-950`) primary canvas, Charcoal-Tinted structural surfaces (`#111827` / `slate-900`) with 1px subtle borders (`border-slate-800/80`), Electric Cyan (`#06B6D4`) and Teal (`#14B8A6`) primary interactive accents, Controlled Ultraviolet (`#8B5CF6`) for AI/Reality Shift highlights, Emerald (`#10B981`) for nominal/completed states, Amber (`#F59E0B`) for approaching deadline warnings, and Rose/Crimson (`#F43F5E`) for hard conflicts.
  - **Light Canvas**: Crisp Alabaster (`#F8FAFC`) canvas, pure white (`#FFFFFF`) structural surfaces with `border-slate-200`, deep slate (`#0F172A`) typography, and high-contrast Teal/Cyan action accents.
- **Typography & Tabular Discipline (2+1 Font Rule)**:
  - **Display & Navigation**: `Outfit` (geometric, modern authority for section headers and mission-control metrics).
  - **Body & Dense UI Controls**: `Plus Jakarta Sans` (exceptional legibility at 12px–15px for task rows and timeline blocks).
  - **Timestamps, Durations & Analytics**: `JetBrains Mono` with strict `tabular-nums` (`font-variant-numeric: tabular-nums`) so all timers, start/end intervals, and capacity percentages align vertically without layout jitter.
- **Spatial Architecture & Anti-Slop Discipline**:
  - **Desktop Viewport**: 256px left navigation sidebar (`Mission Control`, `My Day`, `Timeline`, `Tasks`, `Goals`, `Routines`, `Reality Shift`, `Simulator`, `Insights`, `Settings`) + clean top bar (current date/local time, Quick Add, Generate Plan, Replan, Profile/Theme menu) + spacious main workspace canvas.
  - **Single-Elevation Depth**: Flat structural panels separated by 1px hairline borders; zero nested card sandwiches, zero thick left borders, and unboxed typographic metadata (`Category · 45m · High Priority`).
  - **Mobile & Accessibility**: Compact bottom/drawer navigation on small viewports, touch targets $\ge 44\text{px}$, full keyboard navigation (`focus-visible` rings), `prefers-reduced-motion` compliance, and explicit form-based schedule editing modals as accessible alternatives to drag-and-drop.

---

## 3. Key Product Decisions, Determinism vs. AI, & Risk Analysis

### Deterministic Scheduling Engine vs. Gemini AI Responsibilities
To guarantee trust, safety, and repeatability, LifeOS enforces a strict architectural firewall between **Gemini AI** and the **Deterministic Scheduling Engine**:

| Capability Layer | Engine / Owner | Strict Rules & Guarantees |
| :--- | :--- | :--- |
| **Time Window & Interval Math** | Deterministic TypeScript Engine | Normalizes timezones (`date-fns` / `Intl`), handles overnight sleep/work windows across midnight, and tests DST boundaries. |
| **Hard Constraint Enforcement** | Deterministic TypeScript Engine | Fixed events, locked blocks, sleep windows, earliest start, due dates, minimum session lengths, and non-overlapping rules are **never** violated. |
| **Task Scoring & Placement** | Deterministic TypeScript Engine | Identical inputs + settings always produce identical schedules. Uses explicit, documented priority/deadline urgency scoring and greedy interval packing with session splitting. |
| **Natural-Language Task Parsing** | Gemini (`POST /api/ai/parse-task`) | Extracts candidate title, duration, category, priority, and due window using strict JSON `responseSchema`. Flags ambiguous dates for user confirmation before saving. |
| **Reality Shift Intent Parsing** | Gemini (`POST /api/ai/interpret-change`) | Translates *"I woke up 2 hours late"* or *"Meeting 3-4 PM"* into structured constraint mutations (e.g., `shiftStartWindow`, `addFixedBlock`, `extendTaskDuration`). User reviews before the deterministic solver runs. |
| **Schedule Explanation & Copilot** | Gemini (`POST /api/ai/explain-plan`) | Reads actual user tasks, scheduled blocks, and solver conflict codes to explain *why* a task moved or propose 3 concrete ways to resolve a bottleneck. Never fabricates tasks or medical advice. |

### Implementation Risks, Authorization Gates & Scope Boundaries
1. **Firebase Provisioning Gate**: Requires user acceptance in the AI Studio Firebase setup UI before database provisioning (`ProvisionFirebase` RPC) and rule deployment (`DeployRules` RPC).
2. **Gemini Model Selection & Quota**: We will use `gemini-3.8-flash` as the default high-speed model for low-latency structured task parsing, intent extraction, and copilot explanations (avoiding paid-key bottlenecks unless complex reasoning is requested), with graceful fallback to manual structured forms if AI quota or network is unavailable.
3. **Optional Google Calendar Integration**: Supported via Google AI Studio's client-side Workspace OAuth flow (`https://www.googleapis.com/auth/calendar.readonly`). Requires explicit user consent via the OAuth setup card. Imported events are treated strictly as read-only busy constraints with clear source attribution. If the user skips Google Calendar OAuth, native fixed events and `.ics` / `.csv` / `.json` import/export remain 100% functional.
4. **Global Mathematical Optimality vs. Bounded Heuristic**: NP-hard mixed-integer scheduling across arbitrary splittable horizons can stall browsers/servers. We explicitly implement a **deterministic, constraint-verified urgency-first heuristic with bounded session splitting and local swap refinement**—guaranteeing sub-100ms execution, 100% hard-constraint compliance, and transparent conflict reason codes without falsely claiming global mathematical optimality.

---

## 4. Technical Architecture, Algorithms & Data Strategy

### System Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                        CLIENT (React 19 + TypeScript + Tailwind v4)                  │
│                                                                                      │
│  ┌──────────────────┐   ┌─────────────────────────────────────────────────────────┐  │
│  │ Navigation Shell │   │ Primary Views & Interactive Workspaces                  │  │
│  │ • Mission Control│   │ • MissionControlView (Capacity, Next Up, Smart Alerts)  │  │
│  │ • My Day / Focus │   │ • TimeCanvasView (Daily Vertical + 7-Day @dnd-kit Grid) │  │
│  │ • Timeline (D/W) │   │ • TasksGoalsRoutinesView (CRUD, NL Quick Add, Filters)  │  │
│  │ • Tasks & Goals  │   │ • RealityShiftView (Scenario Input, Diff Preview, Undo) │  │
│  │ • Routines       │   │ • SimulatorView (Isolated Sandbox & Delta Comparison)   │  │
│  │ • Reality Shift  │   │ • FocusExecutionView (Timestamp-Accurate Persistent Tmr)│  │
│  │ • Simulator      │   │ • InsightsExportsView (Recharts, CSV/JSON/ICS, GCal)    │  │
│  │ • Insights & Set.│   └───────────────────────────┬─────────────────────────────┘  │
│  └──────────────────┘                               │                                │
│                                                     ▼                                │
│  ┌────────────────────────────────────────────────────────────────────────────────┐  │
│  │Deterministic Scheduling & Validation Core (Shared TypeScript Pure Modules)     │  │
│  │ • Interval Normalizer (Overnight & Timezone/DST Safe)                          │  │
│  │ • Recurrence Expander (Bounded Horizon Occurrences + Exception Overrides)      │  │
│  │ • Constraint Solver & Splitter (Hard Rules, Soft Scoring, Reason Codes)        │  │
│  │ • Diff & Version Engine (Before/After Comparison, Stale-Version Guard)         │  │
│  └──────────────────────┬─────────────────────────────────────────┬───────────────┘  │
└─────────────────────────┼─────────────────────────────────────────┼──────────────────┘
                          │ Firestore SDK (Auth-Scoped)             │ REST + Bearer Token
                          ▼                                         ▼
┌─────────────────────────────────────────────┐   ┌────────────────────────────────────┐
│  FIREBASE (Auth + Cloud Firestore)          │   │  NODE.JS / EXPRESS SERVER (server.ts)│
│  • Google Sign-In (signInWithPopup)         │   │  • Token Verification Middleware   │
│  • Zero-Trust Rules (users/{uid}/**)        │   │  • Rate Limiting & Schema Guards   │
│  • Atomic WriteBatch / Transactions         │   │  • POST /api/ai/parse-task         │
│    for Plan Versions, Blocks & Undo         │   │  • POST /api/ai/interpret-change   │
│  • Collections: tasks, goals, routines,     │   │  • POST /api/ai/explain-plan       │
│    scheduleBlocks, plans, planVersions,     │   │  • POST /api/ai/copilot            │
│    focusSessions, activities, simulations   │   │  • Shared @google/genai Client     │
└─────────────────────────────────────────────┘   └────────────────────────────────────┘
```

### Core Libraries & Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, `lucide-react` (affordance icons), `recharts` (analytics), `date-fns` + `@date-fns/tz` (timezone and overnight interval arithmetic), `@dnd-kit/core` + `@dnd-kit/sortable` (accessible drag-and-drop with keyboard sensors).
- **Backend**: Express (`server.ts` with Vite middleware in dev), `@google/genai` (`>= 2.25.0`, server-only), Firebase Auth token verification.
- **Persistence**: Firebase Authentication (Google Sign-In) and Cloud Firestore with atomic transactions/batches and hardened `firestore.rules`.
- **Automated Testing**: Node built-in test runner (`node:test` + `node:assert/strict` executed via `npx --yes tsx --test`) covering all scheduling, recurrence, overnight, Reality Shift, and timer math invariants.

### Firestore Data Model & Zero-Trust Security Rules
All collections are strictly isolated under `/users/{uid}` so no user can ever read, list, or mutate another user's documents. Every document stores explicit `userId: uid`, ISO/Timestamp fields, and bounded strings/arrays validated by `firebase-blueprint.json` and `firestore.rules`:

1. **`users/{uid}`**: `displayName`, `email`, `timezone` (IANA string, e.g., `"America/New_York"`), `sleepWindow` (`{ startHHmm: "23:30", endHHmm: "07:30" }`), `focusWindows` (bounded list of preferred intervals), `workDays` (`number[]`), `breakPreference` (`{ minBreakMinutes, afterWorkMinutes }`), `theme` (`"dark" | "light"`), `onboardingComplete` (`boolean`), `activePlanVersion` (`number`), `createdAt`, `updatedAt`.
2. **`users/{uid}/tasks/{taskId}`**: `userId`, `title`, `description`, `category` (`"academic" | "coding" | "work" | "fitness" | "hobby" | "personal"`), `priority` (`"low" | "medium" | "high" | "critical"`), `estimatedMinutes` (`1..1440`), `actualMinutes` (`>= 0`), `earliestStartAt` (optional ISO), `dueAt` (optional ISO), `isFixed` (`boolean`), `fixedStartAt`, `fixedEndAt`, `isSplittable` (`boolean`), `minSessionMinutes` (`15..480`), `preferredTimeOfDay` (`"morning" | "afternoon" | "evening" | "night" | "any"`), `energyLevel` (`"low" | "medium" | "high"`), `status` (`"inbox" | "scheduled" | "in_progress" | "complete" | "skipped" | "archived"`), `goalId` (optional), `completedAt` (optional), `createdAt`, `updatedAt`.
3. **`users/{uid}/goals/{goalId}`**: `userId`, `title`, `description`, `category`, `targetDate`, `milestones` (bounded array $\le 25$ of `{ id, title, completed, targetMinutes }`), `progressPercent` (computed deterministically from completed milestones or linked task completion), `status` (`"active" | "completed" | "paused"`), `createdAt`, `updatedAt`.
4. **`users/{uid}/routines/{routineId}`**: `userId`, `title`, `category`, `frequency` (`"daily" | "weekdays" | "selected_days" | "weekly" | "interval"`), `daysOfWeek` (`number[]`, `0..6`), `intervalDays` (optional), `startDate` (`YYYY-MM-DD`), `endDate` (optional `YYYY-MM-DD`), `preferredWindow` (`{ startHHmm, endHHmm }`), `durationMinutes`, `isFixed` (`boolean`), `priority`, `exceptions` (bounded map/array of skipped or overridden occurrence dates `YYYY-MM-DD` so editing one occurrence never mutates all occurrences), `createdAt`, `updatedAt`.
5. **`users/{uid}/scheduleBlocks/{blockId}`**: `userId`, `planId`, `scheduleVersion` (`number`), `dateKey` (`YYYY-MM-DD` in user timezone), `startAt` (UTC ISO), `endAt` (UTC ISO), `durationMinutes`, `title`, `category`, `blockType` (`"task" | "routine" | "fixed" | "break" | "external_calendar"`), `taskId` (optional), `routineId` (optional), `occurrenceDate` (optional), `locked` (`boolean`), `status` (`"planned" | "in_progress" | "completed" | "skipped"`), `priority`, `reasonCode` (e.g., `"DEADLINE_URGENT"`, `"PREFERRED_FOCUS_WINDOW"`, `"FIXED_COMMITMENT"`, `"SPLIT_SESSION_1_OF_2"`), `source` (`"scheduler" | "manual" | "reality_shift" | "google_calendar"`), `createdAt`, `updatedAt`.
6. **`users/{uid}/plans/{planId}`**: `userId`, `horizonStart` (`YYYY-MM-DD`), `horizonEnd` (`YYYY-MM-DD`), `currentVersion` (`number`), `status` (`"active" | "archived"`), `lastGeneratedAt`, `updatedAt`.
7. **`users/{uid}/planVersions/{versionId}`**: `userId`, `planId`, `version` (`number`), `parentVersion` (`number`), `reason` (e.g., `"Initial Generation"`, `"Reality Shift: Woke up 2 hours late"`, `"Manual Move"`), `blocksSnapshot` (bounded serialized block list for atomic rollback), `changeSummary` (`{ addedCount, movedCount, displacedTaskIds, unscheduledTaskIds, explanation }`), `createdAt`.
8. **`users/{uid}/focusSessions/{sessionId}`**: `userId`, `taskId`, `scheduleBlockId` (optional), `status` (`"running" | "paused" | "completed" | "stopped"`), `plannedMinutes`, `startedAt` (ISO), `lastResumedAt` (ISO or null), `endedAt` (ISO or null), `accumulatedSeconds` (`number`), `notes`, `createdAt`, `updatedAt`.
9. **`users/{uid}/activities/{activityId}`**: `userId`, `action` (`"task_created" | "task_completed" | "plan_generated" | "reality_shift_applied" | "plan_undone" | "focus_completed"`), `targetId`, `summary`, `createdAt`.
10. **`users/{uid}/simulations/{simulationId}`**: `userId`, `title`, `basePlanVersion` (`number`), `hypotheticalChanges` (structured overrides), `resultSummary` (capacity delta, scheduled vs. unscheduled counts, deadline conflicts, simulated blocks), `createdAt`.

**Security Rules Summary (`firestore.rules`)**:
- `rules_version = '2';` with global default-deny `match /{document=**} { allow read, write: if false; }`.
- Strict owner gate `isOwner(uid)`: `request.auth != null && request.auth.uid == uid && request.auth.token.email_verified == true`.
- Path ID validation (`isValidId`) and strict schema/size helper functions (`isValidTask`, `isValidScheduleBlock`, etc.) enforcing `hasAll`/`hasOnly` keys, string length limits, numeric bounds (`estimatedMinutes > 0 && estimatedMinutes <= 1440`), and immutability of `userId` and `createdAt`.

### Deterministic Scheduling & Reality Shift Algorithms

1. **Horizon & Time Window Normalization**:
   - Given a target horizon $[T_{\text{start}}, T_{\text{end}}]$ and user timezone, each calendar day is expanded into UTC intervals.
   - **Overnight Sleep / Work Support**: If a sleep window is `23:30` to `07:30` (or `02:00` to `10:00`), the normalizer splits or spans across midnight seamlessly using timezone-aware epoch intervals $[s_i, e_i]$.
2. **Hard Constraint Reservation (Pass 1)**:
   - Reserves unavailable intervals in strict order:
     1. Past intervals ($t < T_{\text{cutoff}}$, preserving all completed/past blocks untouched).
     2. Protected sleep windows for each day in the horizon.
     3. Imported external calendar busy blocks (`source === "google_calendar"`).
     4. User-locked schedule blocks (`locked === true`) and fixed-time tasks/routines (`isFixed === true`).
   - **Hard Conflict Detection**: If two fixed/locked commitments overlap each other, the solver immediately records a `HARD_OVERLAP_CONFLICT` with the exact colliding titles and timestamps, never silently dropping either commitment.
3. **Free Interval Extraction & Break Buffering (Pass 2)**:
   - Subtracts all reserved blocks from the horizon to yield sorted, disjoint available intervals $F = \{[a_1, b_1], [a_2, b_2], \dots\}$.
4. **Deterministic Task & Routine Eligibility & Scoring (Pass 3)**:
   - Expands active recurring routines into bounded occurrences for the horizon (skipping dates marked in `routine.exceptions` or already completed).
   - Filters incomplete flexible tasks (`status` in `inbox` or `scheduled`) where remaining effort $R_t = \max(0, \text{estimatedMinutes} - \text{actualMinutes}) > 0$.
   - Computes a deterministic composite score for each item (with lexicographical tie-breaking by `dueAt`, `priorityWeight`, `createdAt`, and `id` so identical inputs always yield identical schedules):
     $$\text{Score}(t) = W_{\text{deadline}}(\text{slackHours}) + W_{\text{priority}}(t) + W_{\text{routine}}(t) + W_{\text{goal}}(t)$$
     where tasks with approaching deadlines ($\text{slackHours} = (\text{dueAt} - T_{\text{cutoff}}) - R_t$) receive highest urgency weight.
5. **Duration-Aware Placement & Session Splitting (Pass 4)**:
   - For each ranked task/routine $t$:
     - Filters available intervals $[a_k, b_k] \in F$ to those satisfying `a_k >= earliestStartAt` and `b_k <= dueAt` (if `dueAt` exists).
     - Ranks candidate slots by soft-constraint affinity: matching `preferredTimeOfDay`, matching `focusWindows` for `high` energy tasks, and minimizing displacement from the task's previous scheduled time in the current active plan.
     - **Unsplittable Tasks (`isSplittable === false`)**: Requires a single contiguous slot $\ge R_t$.
     - **Splittable Tasks (`isSplittable === true`)**: Allocates across one or more slots where each chunk is $\ge \text{minSessionMinutes}$ (or equals the final remainder), automatically inserting configured break buffers (`breakPreference`) between consecutive focus sessions.
     - **Unmet Deadline & Capacity Reporting**: If a task cannot be placed before `dueAt` or within total free capacity, it is added to `unscheduledTasks[]` with a structured reason code (`INSUFFICIENT_CONTIGUOUS_TIME`, `DEADLINE_IMPOSSIBLE_GIVEN_FIXED_COMMITMENTS`, `EARLIEST_START_AFTER_DUE`, or `CAPACITY_EXCEEDED`) and human-readable remediation options.

### Architecture for Previews, Transactions, Undo & Version History
- **Preview Isolation**: When a user triggers **Reality Shift** or edits constraints, the solver runs against an in-memory clone of the active `scheduleVersion` ($V_n$). The resulting candidate plan ($V_{\text{preview}}$) is stored solely in preview state (or `simulations` collection) with a computed `PlanDiff` (`unchangedBlocks`, `movedBlocks`, `addedBlocks`, `displacedTasks`, `conflictWarnings`). Live `scheduleBlocks` are untouched.
- **Optimistic Concurrency & Transactional Commit**: When the user clicks **Approve & Apply Plan**, a Firestore `runTransaction` reads `plans/{planId}`. It verifies `plan.currentVersion === preview.baseVersion`. If another tab or action incremented `currentVersion` in the meantime, the transaction aborts with a `STALE_PLAN_VERSION` warning and prompts a 1-click recalculation. Otherwise, it atomically writes the new `planVersions/{versionId}` snapshot, updates `scheduleBlocks`, increments `currentVersion` to $V_{n+1}$, and logs an activity record.
- **Safe Undo**: Clicking **Undo Last Replan** verifies that the active plan is still at $V_{n+1}$ (warning the user if manual edits occurred after $V_{n+1}$), then atomically restores the `blocksSnapshot` from $V_n$ and increments the version audit trail.

---

## 5. Phased Development Roadmap

We will implement and verify LifeOS incrementally across 7 disciplined phases:

- **Phase A — Foundation & Provisioning**:
  - Enable Firebase (Auth + Firestore) via AI Studio UI; configure `firebase-blueprint.json` and hardened zero-trust `firestore.rules`.
  - Build the responsive application shell (10-item Left Sidebar, Top Bar, Dark/Light theme system, Error Boundaries, and Guided First-Time Onboarding flow).
- **Phase B — Real Productivity Data (Tasks, Goals, Routines, Settings)**:
  - Full CRUD for Tasks (all 18 specification fields, validation, search/filter/sort, duplicate prevention, completion history).
  - Full CRUD for Goals (milestones, linked tasks, deterministic progress calculation) and Recurring Routines (daily/weekday/weekly/interval rules, single-occurrence skip/override exceptions).
- **Phase C — Deterministic Scheduling Core & Interactive Time Canvas**:
  - Implement pure TypeScript scheduling engine (`scheduler.ts`) with overnight window normalization, hard/soft constraints, session splitting, break buffers, and conflict reason codes.
  - Build Daily Vertical Timeline (with current-time indicator) and 7-Day Weekly Grid with `@dnd-kit` drag/resize, lock/unlock toggles, collision validation, and accessible form-based move/resize modals.
  - Write and pass comprehensive unit tests (`scheduler.test.ts`) using `node:test`.
- **Phase D — Signature Features: Reality Shift, Versioning, Undo & What-If Simulator**:
  - Build the **Reality Shift** engine: preset & custom disruption scenarios, cutoff-aware recalculation preserving completed/locked blocks, side-by-side Before vs. After visual diff, transactional approval, stale-version guard, and 1-click Undo.
  - Build the **What-If Simulator** sandbox with isolated constraint overrides and capacity/deadline trade-off comparison cards.
- **Phase E — Server-Side Gemini AI Intelligence**:
  - Build Express backend endpoints (`/api/ai/parse-task`, `/api/ai/interpret-change`, `/api/ai/explain-plan`, `/api/ai/copilot`) using `@google/genai` (`gemini-3.8-flash`) with strict JSON schema validation and Firebase ID token verification.
  - Wire natural-language task entry review modal, Reality Shift NL interpreter, and contextual AI Planning Copilot drawer.
- **Phase F — Focus Execution Mode, Time Intelligence Analytics & Interoperability**:
  - Build timestamp-accurate Focus Mode timer (surviving tab backgrounding/refresh, preventing overlapping active sessions, updating task `actualMinutes`).
  - Build Recharts Insights dashboard (Planned vs. Actual duration, Category Allocation, Deadline Completion, Replanning Frequency, data-backed observations).
  - Implement JSON/CSV/ICS export (with CSV formula-injection sanitization), CSV task import with preview/validation, optional Google Calendar read-only sync, and isolated Student Demo Mode loader.
- **Phase G — Hardening, Acceptance Test Matrix & Launch Verification**:
  - Execute automated unit tests (`npx --yes tsx --test`) and headless Chromium end-to-end verification (`playwright-cli`) across all 45 acceptance criteria in Part 22.
  - Include in-app documentation/guide panel (Requirements Summary, Implementation Checklist, Changelog, Testing Guide) aligned with the Handshake AI Mission.

---

## 6. Requirement-to-Implementation Checklist

| Spec Part | Requirement Summary | Planned Implementation Mechanism | Verification Method |
| :--- | :--- | :--- | :--- |
| **Part 4** | Deep midnight/navy UI, electric cyan/teal accents, dark default + light theme, 10-item sidebar, accessible | Tailwind v4 `@custom-variant dark`, `Outfit` + `Plus Jakarta Sans` + `JetBrains Mono tabular-nums`, semantic HTML + ARIA | Visual inspection & Playwright DOM/contrast audit |
| **Part 5 & 18** | Firebase Auth + Firestore persistence, 10 normalized user-scoped collections, zero-trust security rules | `firebase-blueprint.json`, `firestore.rules` with `isOwner(uid)` & schema guards, `handleFirestoreError` | ESLint security rules check + multi-user isolation test |
| **Part 6** | Google Sign-In + skippable onboarding supporting overnight sleep/work schedules & clean starter workspace | Firebase `signInWithPopup`, 4-step Onboarding wizard with overnight HH:mm support, optional Demo Mode toggle | Onboarding E2E flow + refresh persistence check |
| **Part 7** | Mission Control dashboard with real counts, timeline preview, capacity bar, and grounded smart alerts | Live Firestore listeners + deterministic capacity/conflict selectors; all 5 CTA buttons wired | Dashboard state assertions against real task records |
| **Part 8** | 18-field Task CRUD, search/filter/sort, natural-language task entry with review before save | Task manager view + `/api/ai/parse-task` returning structured JSON candidate for user confirmation | Unit + UI CRUD tests & invalid input rejection tests |
| **Part 9** | Goals with milestones/linked tasks + Routines with bounded horizon occurrences & single-occurrence edits | Deterministic milestone progress calculator + recurrence expander supporting per-date `exceptions` map | Recurrence unit tests (skip/edit single occurrence, TZ safety) |
| **Part 10** | Deterministic constraint-aware scheduler (hard rules, soft preferences, session splitting, conflict reports) | Pure TypeScript solver in `src/lib/scheduler.ts` with deterministic tie-breaking and reason codes | 12+ automated `node:test` cases (overlaps, locks, sleep, midnight, DST) |
| **Part 11** | Daily vertical timeline & 7-day weekly grid with drag/resize, lock toggles, and accessible form fallback | `@dnd-kit` interactive canvas + collision validator + accessible quick-edit modal | Drag/resize & keyboard modal scheduling tests |
| **Part 12** | Reality Shift replanning with preview diff, explicit approval, version check, and Undo | `planVersions` snapshots, Firestore transaction version guard, Before/After diff viewer, Undo rollback | Automated tests for preview isolation, stale reject, and Undo |
| **Part 13** | What-If Simulator sandbox with trade-off metrics and explicit confirmation to apply | Isolated in-memory + `simulations` collection runner comparing focus hours, displaced tasks, and conflicts | Verify live blocks never mutate during simulation |
| **Part 14** | AI Planning Copilot grounded in real user records, schema-validated, zero guilt/medical claims | Server-side `/api/ai/copilot` & `/api/ai/explain-plan` passing sanitized user context to `gemini-3.8-flash` | Copilot response schema & constraint verification |
| **Part 15** | Focus Mode timer accurate across tab suspension/refresh, single active session guard, updates `actualMinutes` | Epoch delta tracking (`Date.now() - Date.parse(lastResumedAt) + accumulatedSeconds`) persisted in Firestore | Timer suspension simulation & task effort update test |
| **Part 16 & 17** | Recharts analytics, data-backed insights, CSV/JSON/ICS export (formula-safe), CSV import preview, optional GCal | Recharts views, RFC 5545 `.ics` generator, CSV sanitizer (`'=+@-` escaping), optional Workspace Calendar read-only | Export/import validation & empty-state analytics test |
| **Part 21–25** | 14-step college student demo scenario, 45 acceptance tests, Handshake AI mission documentation | Optional 1-click Student Demo Workspace seeder + live Acceptance Test Matrix & Mission Guide drawer | Full 45-point verification pass before completion |
