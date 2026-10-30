import { TZDate } from '@date-fns/tz';
import type {
  BlockCategory,
  BlockDiffItem,
  FocusSession,
  Goal,
  PlanVersionChunk,
  PriorityLevel,
  RealityShiftChangeSpec,
  ReplanPreviewResult,
  Routine,
  RoutineOccurrenceOverride,
  ScheduleBlock,
  ScheduleConflict,
  ScheduleResult,
  Task,
  TimeOfDayPreference,
  UnscheduledTaskReport,
  UserProfile,
} from '../types/lifeos.ts';

interface TimeInterval {
  startMs: number;
  endMs: number;
}

const PRIORITY_WEIGHTS: Record<PriorityLevel, number> = {
  critical: 400,
  high: 300,
  medium: 200,
  low: 100,
};

/**
 * Parses "HH:mm" into { hours, minutes }.
 */
export function parseHHmm(hhmm: string): { hours: number; minutes: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((hhmm || '').trim());
  if (!match) {
    throw new Error(`Invalid time format "${hhmm}". Expected HH:mm (00:00 - 23:59).`);
  }
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

/**
 * Formats a UTC epoch timestamp into YYYY-MM-DD in the user's IANA timezone.
 */
export function formatDateKeyInTz(epochMs: number, timezone: string): string {
  const tz = timezone || 'UTC';
  const tzDate = new TZDate(epochMs, tz);
  const y = tzDate.getFullYear();
  const m = String(tzDate.getMonth() + 1).padStart(2, '0');
  const d = String(tzDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Converts a local calendar date (YYYY-MM-DD) and HH:mm in the user's IANA timezone
 * into a UTC epoch millisecond timestamp, accurately handling DST transitions.
 */
export function localDateHHmmToEpochMs(dateKey: string, hhmm: string, timezone: string): number {
  const [yStr, mStr, dStr] = dateKey.split('-');
  const y = Number(yStr);
  const m = Number(mStr) - 1;
  const d = Number(dStr);
  const { hours, minutes } = parseHHmm(hhmm);
  const tz = timezone || 'UTC';
  const tzDate = new TZDate(y, m, d, hours, minutes, 0, 0, tz);
  return tzDate.getTime();
}

/**
 * Advances a YYYY-MM-DD string by `deltaDays` calendar days.
 */
export function addCalendarDays(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Lists all YYYY-MM-DD date keys from startDateKey to endDateKey inclusive.
 */
export function listHorizonDates(startDateKey: string, endDateKey: string): string[] {
  const dates: string[] = [];
  let curr = startDateKey;
  let guard = 0;
  while (curr <= endDateKey && guard < 60) {
    dates.push(curr);
    curr = addCalendarDays(curr, 1);
    guard++;
  }
  return dates;
}

/**
 * Returns day of week (0 = Sunday .. 6 = Saturday) for a YYYY-MM-DD dateKey.
 */
export function getDayOfWeekForDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

/**
 * Computes protected sleep intervals for a calendar dateKey in the user's timezone.
 * Correctly handles overnight windows (e.g., 23:00 -> 07:00 next day) and same-day sleep windows.
 */
export function getSleepIntervalsForHorizon(
  horizonDates: string[],
  sleepStartHHmm: string,
  sleepEndHHmm: string,
  timezone: string
): TimeInterval[] {
  if (!sleepStartHHmm || !sleepEndHHmm || sleepStartHHmm === sleepEndHHmm) {
    return [];
  }
  const { hours: sh, minutes: sm } = parseHHmm(sleepStartHHmm);
  const { hours: eh, minutes: em } = parseHHmm(sleepEndHHmm);
  const isOvernight = sh * 60 + sm > eh * 60 + em;

  const intervals: TimeInterval[] = [];
  // Include the day prior to the first horizon date so overnight sleep spilling into day 1 is protected
  const allDates =
    horizonDates.length > 0
      ? [addCalendarDays(horizonDates[0], -1), ...horizonDates]
      : [];

  for (const dateKey of allDates) {
    const startMs = localDateHHmmToEpochMs(dateKey, sleepStartHHmm, timezone);
    const endDateKey = isOvernight ? addCalendarDays(dateKey, 1) : dateKey;
    const endMs = localDateHHmmToEpochMs(endDateKey, sleepEndHHmm, timezone);
    if (endMs > startMs) {
      intervals.push({ startMs, endMs });
    }
  }
  return mergeIntervals(intervals);
}

/**
 * Merges overlapping or adjacent time intervals.
 */
export function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals]
    .filter((i) => i.endMs > i.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  if (sorted.length === 0) return [];

  const merged: TimeInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, curr.endMs);
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

/**
 * Subtracts busy intervals from a base set of intervals, returning disjoint free intervals.
 */
export function subtractIntervals(base: TimeInterval[], busy: TimeInterval[]): TimeInterval[] {
  const mergedBusy = mergeIntervals(busy);
  let result = [...base];

  for (const b of mergedBusy) {
    const nextResult: TimeInterval[] = [];
    for (const slot of result) {
      if (b.endMs <= slot.startMs || b.startMs >= slot.endMs) {
        nextResult.push(slot);
      } else {
        if (b.startMs > slot.startMs) {
          nextResult.push({ startMs: slot.startMs, endMs: b.startMs });
        }
        if (b.endMs < slot.endMs) {
          nextResult.push({ startMs: b.endMs, endMs: slot.endMs });
        }
      }
    }
    result = nextResult;
  }

  return result.filter((s) => s.endMs - s.startMs >= 60000);
}

/**
 * Expands a Routine definition into bounded occurrences for the given horizon dates,
 * respecting `skippedDates` and per-date `overridesJson` so editing one occurrence
 * never accidentally modifies all occurrences.
 */
export function expandRoutineOccurrences(
  routine: Routine,
  horizonDates: string[]
): Array<{
  routineId: string;
  occurrenceDate: string;
  title: string;
  category: BlockCategory;
  preferredStartHHmm: string;
  preferredEndHHmm: string;
  durationMinutes: number;
  isFixed: boolean;
  priority: PriorityLevel;
}> {
  let overridesMap: Record<string, RoutineOccurrenceOverride> = {};
  try {
    if (routine.overridesJson) {
      overridesMap = JSON.parse(routine.overridesJson);
    }
  } catch {
    overridesMap = {};
  }

  const skippedSet = new Set(routine.skippedDates || []);
  const occurrences: Array<{
    routineId: string;
    occurrenceDate: string;
    title: string;
    category: BlockCategory;
    preferredStartHHmm: string;
    preferredEndHHmm: string;
    durationMinutes: number;
    isFixed: boolean;
    priority: PriorityLevel;
  }> = [];

  for (const dateKey of horizonDates) {
    if (dateKey < routine.startDate) continue;
    if (routine.endDate && dateKey > routine.endDate) continue;
    if (skippedSet.has(dateKey)) continue;

    const dow = getDayOfWeekForDateKey(dateKey);
    let matches = false;

    if (routine.frequency === 'daily') {
      matches = true;
    } else if (routine.frequency === 'weekdays') {
      matches = dow >= 1 && dow <= 5;
    } else if (routine.frequency === 'selected_days' || routine.frequency === 'weekly') {
      matches = (routine.daysOfWeek || []).includes(dow);
    } else if (routine.frequency === 'interval') {
      const startEpoch = Date.parse(`${routine.startDate}T00:00:00Z`);
      const currEpoch = Date.parse(`${dateKey}T00:00:00Z`);
      const diffDays = Math.round((currEpoch - startEpoch) / 86400000);
      const step = Math.max(1, routine.intervalDays || 1);
      matches = diffDays >= 0 && diffDays % step === 0;
    }

    if (!matches) continue;

    const override = overridesMap[dateKey];
    occurrences.push({
      routineId: routine.id,
      occurrenceDate: dateKey,
      title: override?.title || routine.title,
      category: routine.category,
      preferredStartHHmm: override?.preferredStartHHmm || routine.preferredStartHHmm,
      preferredEndHHmm: override?.preferredEndHHmm || routine.preferredEndHHmm,
      durationMinutes: override?.durationMinutes ?? routine.durationMinutes,
      isFixed: override?.isFixed ?? routine.isFixed,
      priority: routine.priority,
    });
  }

  return occurrences;
}

/**
 * Evaluates soft-constraint affinity bonus for placing an activity at a candidate start time.
 */
function scoreCandidateSlot(
  slotStartMs: number,
  durationMinutes: number,
  preferredTimeOfDay: TimeOfDayPreference,
  energyLevel: 'low' | 'medium' | 'high',
  profile: UserProfile,
  existingTaskSlotMs?: number
): number {
  const tz = profile.timezone || 'UTC';
  const tzDate = new TZDate(slotStartMs, tz);
  const hour = tzDate.getHours() + tzDate.getMinutes() / 60;

  let bonus = 0;

  // 1. Time of day preference match
  if (preferredTimeOfDay === 'morning' && hour >= 6 && hour < 12) bonus += 40;
  else if (preferredTimeOfDay === 'afternoon' && hour >= 12 && hour < 17) bonus += 40;
  else if (preferredTimeOfDay === 'evening' && hour >= 17 && hour < 22) bonus += 40;
  else if (preferredTimeOfDay === 'night' && (hour >= 21 || hour < 5)) bonus += 40;

  // 2. Focus window match for high-energy work
  const { hours: fhStart, minutes: fmStart } = parseHHmm(profile.focusStartHHmm || '09:00');
  const { hours: fhEnd, minutes: fmEnd } = parseHHmm(profile.focusEndHHmm || '13:00');
  const focusStartHour = fhStart + fmStart / 60;
  const focusEndHour = fhEnd + fmEnd / 60;
  const inFocusWindow =
    focusStartHour <= focusEndHour
      ? hour >= focusStartHour && hour < focusEndHour
      : hour >= focusStartHour || hour < focusEndHour;

  if (energyLevel === 'high' && inFocusWindow) {
    bonus += 35;
  } else if (energyLevel === 'low' && !inFocusWindow) {
    bonus += 15;
  }

  // 3. Workday preference match
  const dow = tzDate.getDay();
  if ((profile.workDays || [1, 2, 3, 4, 5]).includes(dow)) {
    bonus += 15;
  }

  // 4. Stability bonus: minimize disruption if the task already had an approved slot nearby
  if (existingTaskSlotMs !== undefined) {
    const driftHours = Math.abs(slotStartMs - existingTaskSlotMs) / 3600000;
    if (driftHours < 0.25) bonus += 50;
    else if (driftHours <= 2) bonus += 25;
  }

  // 5. Slight preference for earlier placement in the horizon so deadlines aren't pushed to the last minute
  return bonus;
}

export interface GenerateScheduleInput {
  userId: string;
  planId: string;
  scheduleVersion: number;
  profile: UserProfile;
  tasks: Task[];
  routines: Routine[];
  existingBlocks: ScheduleBlock[];
  horizonStartDate: string; // YYYY-MM-DD
  horizonEndDate: string;   // YYYY-MM-DD
  cutoffIso: string;        // Do not schedule or alter blocks earlier than cutoffIso
  sourceLabel?: 'scheduler' | 'reality_shift';
}

/**
 * Deterministic, Constraint-Aware Scheduling Engine.
 * - Never violates hard constraints (locked blocks, fixed commitments, sleep windows, earliestStartAt, dueAt, minSessionMinutes).
 * - Clips candidate intervals against [earliestStartAt, dueAt] BEFORE checking fit (Engineering Correction #2).
 * - Uses remainingMinutes separately from estimatedMinutes and actualMinutes (Engineering Correction #6).
 * - Produces identical output for identical inputs and settings.
 */
export function generateDeterministicSchedule(input: GenerateScheduleInput): ScheduleResult {
  const perfStart = Date.now();
  const {
    userId,
    planId,
    scheduleVersion,
    profile,
    tasks,
    routines,
    existingBlocks,
    horizonStartDate,
    horizonEndDate,
    cutoffIso,
    sourceLabel = 'scheduler',
  } = input;

  const tz = profile.timezone || 'UTC';
  const horizonDates = listHorizonDates(horizonStartDate, horizonEndDate);
  if (horizonDates.length === 0) {
    return {
      blocks: [],
      unscheduledTasks: [],
      conflicts: [],
      tradeoffs: [],
      capacitySummary: {
        totalHorizonMinutes: 0,
        sleepMinutes: 0,
        fixedMinutes: 0,
        routineMinutes: 0,
        focusTaskMinutes: 0,
        breakMinutes: 0,
        unallocatedMinutes: 0,
        requestedFlexibleMinutes: 0,
        isOverloaded: false,
      },
      computeTimeMs: Date.now() - perfStart,
    };
  }

  const horizonStartMs = localDateHHmmToEpochMs(horizonDates[0], '00:00', tz);
  const horizonEndMs = localDateHHmmToEpochMs(
    addCalendarDays(horizonDates[horizonDates.length - 1], 1),
    '00:00',
    tz
  );
  const cutoffMs = Math.max(horizonStartMs, Date.parse(cutoffIso) || horizonStartMs);

  const conflicts: ScheduleConflict[] = [];
  const tradeoffs: string[] = [];
  const placedBlocks: ScheduleBlock[] = [];
  const reservedIntervals: TimeInterval[] = [];

  const nowIso = cutoffIso || new Date().toISOString();

  // Map previous task start times for stability scoring
  const previousTaskStartMap = new Map<string, number>();
  for (const eb of existingBlocks) {
    if (eb.taskId && !previousTaskStartMap.has(eb.taskId)) {
      previousTaskStartMap.set(eb.taskId, Date.parse(eb.startAt));
    }
  }

  // Helper to register a hard block and detect collisions with existing hard blocks
  const registerHardBlock = (block: ScheduleBlock) => {
    const bStart = Date.parse(block.startAt);
    const bEnd = Date.parse(block.endAt);
    if (isNaN(bStart) || isNaN(bEnd) || bEnd <= bStart) return;

    for (const existing of placedBlocks) {
      const eStart = Date.parse(existing.startAt);
      const eEnd = Date.parse(existing.endAt);
      if (bStart < eEnd && bEnd > eStart) {
        conflicts.push({
          id: `conflict_overlap_${existing.id}_${block.id}`,
          code: 'HARD_OVERLAP_CONFLICT',
          severity: 'error',
          title: `Overlapping Fixed Commitments: "${existing.title}" and "${block.title}"`,
          description: `"${existing.title}" and "${block.title}" occupy overlapping time between ${new Date(
            Math.max(bStart, eStart)
          ).toISOString()} and ${new Date(Math.min(bEnd, eEnd)).toISOString()}.`,
          affectedTaskIds: [existing.taskId, block.taskId].filter(Boolean) as string[],
          remediationOptions: [
            `Adjust the fixed start/end time of "${block.title}".`,
            `Unlock "${existing.title}" so the scheduler can relocate it.`,
          ],
        });
      }
    }

    placedBlocks.push(block);
    reservedIntervals.push({ startMs: bStart, endMs: bEnd });
  };

  // PASS 1A: Preserve past blocks (ending <= cutoffMs or starting < cutoffMs), completed blocks, external calendar blocks, and locked blocks
  const handledTaskIds = new Set<string>();
  const handledRoutineOccurrenceKeys = new Set<string>();

  const sortedExisting = [...existingBlocks].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id.localeCompare(b.id)
  );

  for (const eb of sortedExisting) {
    const bStart = Date.parse(eb.startAt);
    const bEnd = Date.parse(eb.endAt);
    if (bEnd <= horizonStartMs || bStart >= horizonEndMs) continue;

    const isCompleted = eb.status === 'completed';
    const isExternal = eb.source === 'google_calendar' || eb.blockType === 'external_calendar';
    const isLockedOrFixed = eb.locked === true || eb.blockType === 'fixed';

    if (isCompleted || isExternal || isLockedOrFixed) {
      registerHardBlock({
        ...eb,
        scheduleVersion,
        updatedAt: nowIso,
      });
      if (eb.taskId && eb.blockType === 'fixed') {
        handledTaskIds.add(eb.taskId);
      }
      if (eb.routineId && eb.occurrenceDate) {
        handledRoutineOccurrenceKeys.add(`${eb.routineId}_${eb.occurrenceDate}`);
      }
    }
  }

  // PASS 1B: Place Fixed Tasks (`isFixed === true`)
  const sortedFixedTasks = [...tasks]
    .filter((t) => t.isFixed && t.status !== 'complete' && t.status !== 'archived' && t.status !== 'skipped')
    .sort((a, b) => (a.fixedStartAt || '').localeCompare(b.fixedStartAt || '') || a.id.localeCompare(b.id));

  for (const ft of sortedFixedTasks) {
    if (handledTaskIds.has(ft.id)) continue;
    if (!ft.fixedStartAt || !ft.fixedEndAt) continue;

    const fStart = Date.parse(ft.fixedStartAt);
    const fEnd = Date.parse(ft.fixedEndAt);
    if (isNaN(fStart) || isNaN(fEnd) || fEnd <= fStart) continue;
    if (fEnd <= horizonStartMs || fStart >= horizonEndMs) continue;

    const durMins = Math.round((fEnd - fStart) / 60000);
    registerHardBlock({
      id: `blk_fixed_${ft.id}`,
      userId,
      planId,
      scheduleVersion,
      dateKey: formatDateKeyInTz(fStart, tz),
      startAt: new Date(fStart).toISOString(),
      endAt: new Date(fEnd).toISOString(),
      durationMinutes: durMins,
      title: ft.title,
      category: ft.category,
      blockType: 'fixed',
      taskId: ft.id,
      locked: true,
      status: 'planned',
      priority: ft.priority,
      reasonCode: 'FIXED_COMMITMENT',
      source: sourceLabel,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    handledTaskIds.add(ft.id);
  }

  // PASS 1C: Expand Recurring Routines and place Fixed Routines (`isFixed === true`)
  const allRoutineOccurrences = routines
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((r) => expandRoutineOccurrences(r, horizonDates));

  const flexibleRoutineOccurrences: typeof allRoutineOccurrences = [];

  for (const occ of allRoutineOccurrences) {
    const occKey = `${occ.routineId}_${occ.occurrenceDate}`;
    if (handledRoutineOccurrenceKeys.has(occKey)) continue;

    if (occ.isFixed) {
      const rStart = localDateHHmmToEpochMs(occ.occurrenceDate, occ.preferredStartHHmm, tz);
      const rEnd = rStart + occ.durationMinutes * 60000;
      if (rEnd <= cutoffMs) continue;

      registerHardBlock({
        id: `blk_rt_${occ.routineId}_${occ.occurrenceDate}`,
        userId,
        planId,
        scheduleVersion,
        dateKey: occ.occurrenceDate,
        startAt: new Date(rStart).toISOString(),
        endAt: new Date(rEnd).toISOString(),
        durationMinutes: occ.durationMinutes,
        title: occ.title,
        category: occ.category,
        blockType: 'routine',
        routineId: occ.routineId,
        occurrenceDate: occ.occurrenceDate,
        locked: true,
        status: 'planned',
        priority: occ.priority,
        reasonCode: 'FIXED_ROUTINE',
        source: sourceLabel,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      handledRoutineOccurrenceKeys.add(occKey);
    } else {
      flexibleRoutineOccurrences.push(occ);
    }
  }

  // PASS 2: Reserve Sleep Intervals and Compute Available Free Intervals >= cutoffMs
  const sleepIntervals = getSleepIntervalsForHorizon(
    horizonDates,
    profile.sleepStartHHmm,
    profile.sleepEndHHmm,
    tz
  );

  const activeHorizonBase: TimeInterval[] =
    horizonEndMs > cutoffMs ? [{ startMs: cutoffMs, endMs: horizonEndMs }] : [];

  const allUnavailable: TimeInterval[] = [...sleepIntervals, ...reservedIntervals];
  let freeIntervals = subtractIntervals(activeHorizonBase, allUnavailable);

  // Calculate sleep minutes inside the horizon for capacity reporting
  const clippedSleep = sleepIntervals
    .map((s) => ({
      startMs: Math.max(s.startMs, horizonStartMs),
      endMs: Math.min(s.endMs, horizonEndMs),
    }))
    .filter((s) => s.endMs > s.startMs);
  const sleepMinutes = clippedSleep.reduce(
    (acc, s) => acc + Math.round((s.endMs - s.startMs) / 60000),
    0
  );

  // PASS 3: Evaluate and Deterministically Rank Flexible Tasks
  const eligibleTasks = tasks.filter((t) => {
    if (t.isFixed) return false;
    if (t.status === 'complete' || t.status === 'archived' || t.status === 'skipped') return false;
    const rem = t.remainingMinutes ?? Math.max(0, t.estimatedMinutes - (t.actualMinutes || 0));
    return rem > 0;
  });

  // Account for any future locked blocks already covering part of a flexible task
  const lockedTaskMinutesMap = new Map<string, number>();
  for (const pb of placedBlocks) {
    if (pb.taskId && Date.parse(pb.endAt) > cutoffMs && pb.status !== 'completed') {
      lockedTaskMinutesMap.set(pb.taskId, (lockedTaskMinutesMap.get(pb.taskId) || 0) + pb.durationMinutes);
    }
  }

  const scoreTask = (t: Task): number => {
    let score = PRIORITY_WEIGHTS[t.priority] || 200;
    if (t.dueAt) {
      const dueMs = Date.parse(t.dueAt);
      if (!isNaN(dueMs)) {
        const remMins = t.remainingMinutes ?? t.estimatedMinutes;
        const slackHours = (dueMs - cutoffMs - remMins * 60000) / 3600000;
        if (slackHours <= 0) score += 1000;
        else if (slackHours <= 12) score += 700;
        else if (slackHours <= 24) score += 500;
        else if (slackHours <= 48) score += 350;
        else if (slackHours <= 168) score += 200;
        else score += 50;
      }
    }
    if (t.goalId) score += 25;
    return score;
  };

  const rankedTasks = [...eligibleTasks].sort((a, b) => {
    const scoreDiff = scoreTask(b) - scoreTask(a);
    if (scoreDiff !== 0) return scoreDiff;
    const dueA = a.dueAt ? Date.parse(a.dueAt) : Number.MAX_SAFE_INTEGER;
    const dueB = b.dueAt ? Date.parse(b.dueAt) : Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) return dueA - dueB;
    const prioDiff = (PRIORITY_WEIGHTS[b.priority] || 0) - (PRIORITY_WEIGHTS[a.priority] || 0);
    if (prioDiff !== 0) return prioDiff;
    const createdDiff = (a.createdAt || '').localeCompare(b.createdAt || '');
    if (createdDiff !== 0) return createdDiff;
    return a.id.localeCompare(b.id);
  });

  const unscheduledTasks: UnscheduledTaskReport[] = [];
  const breakDurationMs = Math.max(0, profile.breakDurationMinutes ?? 10) * 60000;
  const maxWorkMinutes = Math.max(25, profile.maxContinuousWorkMinutes ?? 90);

  // PASS 4A: Place Flexible Tasks with Deadline-Aware Interval Clipping (Engineering Correction #2)
  for (const task of rankedTasks) {
    const baseRemaining =
      task.remainingMinutes ?? Math.max(0, task.estimatedMinutes - (task.actualMinutes || 0));
    const alreadyScheduledLocked = lockedTaskMinutesMap.get(task.id) || 0;
    let neededMinutes = Math.max(0, baseRemaining - alreadyScheduledLocked);
    if (neededMinutes === 0) continue;

    const earliestStartMs = task.earliestStartAt ? Date.parse(task.earliestStartAt) : null;
    const dueMs = task.dueAt ? Date.parse(task.dueAt) : null;

    // Validate earliestStartAt <= dueAt
    if (
      earliestStartMs !== null &&
      !isNaN(earliestStartMs) &&
      dueMs !== null &&
      !isNaN(dueMs) &&
      earliestStartMs + neededMinutes * 60000 > dueMs
    ) {
      const explanation = `Task "${task.title}" requires ${neededMinutes}m, but the window between earliest start (${task.earliestStartAt}) and deadline (${task.dueAt}) is smaller than the task duration.`;
      unscheduledTasks.push({
        taskId: task.id,
        title: task.title,
        priority: task.priority,
        remainingMinutes: baseRemaining,
        scheduledMinutes: alreadyScheduledLocked,
        unscheduledMinutes: neededMinutes,
        dueAt: task.dueAt,
        reasonCode: 'EARLIEST_START_AFTER_DUE',
        explanation,
      });
      conflicts.push({
        id: `conflict_bounds_${task.id}`,
        code: 'EARLIEST_START_AFTER_DUE',
        severity: 'error',
        title: `Impossible Window for "${task.title}"`,
        description: explanation,
        affectedTaskIds: [task.id],
        remediationOptions: [
          'Move the earliest-start constraint earlier.',
          'Extend the due date or reduce the estimated duration.',
        ],
      });
      continue;
    }

    // Check if deadline is already in the past relative to cutoffMs
    if (dueMs !== null && !isNaN(dueMs) && dueMs <= cutoffMs) {
      const explanation = `Deadline for "${task.title}" (${task.dueAt}) has already passed or is earlier than the current planning start (${cutoffIso}).`;
      unscheduledTasks.push({
        taskId: task.id,
        title: task.title,
        priority: task.priority,
        remainingMinutes: baseRemaining,
        scheduledMinutes: alreadyScheduledLocked,
        unscheduledMinutes: neededMinutes,
        dueAt: task.dueAt,
        reasonCode: 'DEADLINE_IMPOSSIBLE',
        explanation,
      });
      conflicts.push({
        id: `conflict_past_due_${task.id}`,
        code: 'DEADLINE_IMPOSSIBLE',
        severity: 'error',
        title: `Unmet Deadline: "${task.title}"`,
        description: explanation,
        affectedTaskIds: [task.id],
        remediationOptions: [
          'Extend the task deadline to a future time.',
          'Mark the task complete if it was already finished.',
        ],
      });
      continue;
    }

    const minChunk = task.isSplittable
      ? Math.min(neededMinutes, Math.max(15, task.minSessionMinutes || 25))
      : neededMinutes;

    let sessionIndex = 1;
    let scheduledForThisTask = 0;

    while (neededMinutes > 0) {
      const currentMinRequired = task.isSplittable ? Math.min(neededMinutes, minChunk) : neededMinutes;

      // Engineering Correction #2: Clip every candidate free interval against [earliestStartMs, dueMs] BEFORE checking fit
      const candidatePlacements: Array<{
        clippedStartMs: number;
        clippedEndMs: number;
        allocMinutes: number;
        score: number;
      }> = [];

      for (const slot of freeIntervals) {
        const clippedStartMs =
          earliestStartMs !== null && !isNaN(earliestStartMs)
            ? Math.max(slot.startMs, earliestStartMs)
            : slot.startMs;
        const clippedEndMs =
          dueMs !== null && !isNaN(dueMs) ? Math.min(slot.endMs, dueMs) : slot.endMs;

        if (clippedEndMs <= clippedStartMs) continue;

        const availableMinutes = Math.floor((clippedEndMs - clippedStartMs) / 60000);
        if (availableMinutes < currentMinRequired) continue;

        const maxSessionCap = task.isSplittable
          ? Math.min(neededMinutes, availableMinutes, maxWorkMinutes)
          : neededMinutes;

        // Ensure splitting does not leave a remainder smaller than minChunk unless availableMinutes < neededMinutes
        let allocMinutes = maxSessionCap;
        if (
          task.isSplittable &&
          neededMinutes - allocMinutes > 0 &&
          neededMinutes - allocMinutes < minChunk
        ) {
          if (availableMinutes >= neededMinutes && neededMinutes <= maxWorkMinutes + minChunk) {
            allocMinutes = neededMinutes;
          } else if (allocMinutes - minChunk >= minChunk) {
            allocMinutes = neededMinutes - minChunk;
          }
        }

        const score = scoreCandidateSlot(
          clippedStartMs,
          allocMinutes,
          task.preferredTimeOfDay,
          task.energyLevel,
          profile,
          previousTaskStartMap.get(task.id)
        );

        candidatePlacements.push({
          clippedStartMs,
          clippedEndMs,
          allocMinutes,
          score,
        });
      }

      if (candidatePlacements.length === 0) {
        break;
      }

      // Deterministic selection: highest affinity score, then earliest clippedStartMs
      candidatePlacements.sort(
        (a, b) => b.score - a.score || a.clippedStartMs - b.clippedStartMs
      );

      const best = candidatePlacements[0];
      const blockStartMs = best.clippedStartMs;
      const blockEndMs = blockStartMs + best.allocMinutes * 60000;

      const reasonCode =
        dueMs !== null && dueMs - blockEndMs <= 24 * 3600000
          ? 'DEADLINE_URGENT'
          : task.isSplittable && baseRemaining > best.allocMinutes
          ? `SPLIT_SESSION_${sessionIndex}`
          : 'PREFERRED_FOCUS_SLOT';

      const newBlock: ScheduleBlock = {
        id: `blk_task_${task.id}_${sessionIndex}`,
        userId,
        planId,
        scheduleVersion,
        dateKey: formatDateKeyInTz(blockStartMs, tz),
        startAt: new Date(blockStartMs).toISOString(),
        endAt: new Date(blockEndMs).toISOString(),
        durationMinutes: best.allocMinutes,
        title:
          task.isSplittable && baseRemaining > best.allocMinutes
            ? `${task.title} (Part ${sessionIndex})`
            : task.title,
        category: task.category,
        blockType: 'task',
        taskId: task.id,
        locked: false,
        status: 'planned',
        priority: task.priority,
        reasonCode,
        source: sourceLabel,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      placedBlocks.push(newBlock);

      // Reserve the task block AND an optional break buffer if the session reached >= 45m
      const reserveEndMs =
        best.allocMinutes >= 45 && breakDurationMs > 0
          ? Math.min(best.clippedEndMs, blockEndMs + breakDurationMs)
          : blockEndMs;

      if (reserveEndMs > blockEndMs) {
        const breakMins = Math.round((reserveEndMs - blockEndMs) / 60000);
        if (breakMins >= 5) {
          placedBlocks.push({
            id: `blk_break_${task.id}_${sessionIndex}`,
            userId,
            planId,
            scheduleVersion,
            dateKey: formatDateKeyInTz(blockEndMs, tz),
            startAt: new Date(blockEndMs).toISOString(),
            endAt: new Date(reserveEndMs).toISOString(),
            durationMinutes: breakMins,
            title: 'Recovery Break',
            category: 'break',
            blockType: 'break',
            locked: false,
            status: 'planned',
            priority: 'low',
            reasonCode: 'RECOVERY_BUFFER',
            source: sourceLabel,
            createdAt: nowIso,
            updatedAt: nowIso,
          });
        }
      }

      freeIntervals = subtractIntervals(freeIntervals, [
        { startMs: blockStartMs, endMs: reserveEndMs },
      ]);

      neededMinutes -= best.allocMinutes;
      scheduledForThisTask += best.allocMinutes;
      sessionIndex++;
    }

    if (neededMinutes > 0) {
      // Determine precise conflict reason code
      const totalFreeBeforeDue = freeIntervals.reduce((acc, slot) => {
        const cs =
          earliestStartMs !== null && !isNaN(earliestStartMs)
            ? Math.max(slot.startMs, earliestStartMs)
            : slot.startMs;
        const ce = dueMs !== null && !isNaN(dueMs) ? Math.min(slot.endMs, dueMs) : slot.endMs;
        return ce > cs ? acc + Math.floor((ce - cs) / 60000) : acc;
      }, 0);

      let reasonCode: ScheduleConflict['code'] = 'CAPACITY_EXCEEDED';
      let explanation = `Could not fit ${neededMinutes}m of "${task.title}" within the current planning horizon.`;

      if (dueMs !== null && !isNaN(dueMs) && dueMs <= horizonEndMs) {
        if (!task.isSplittable && totalFreeBeforeDue >= neededMinutes) {
          reasonCode = 'INSUFFICIENT_CONTIGUOUS_TIME';
          explanation = `"${task.title}" requires an uninterrupted ${neededMinutes}m block before its deadline, but available free time is fragmented by fixed commitments.`;
        } else {
          reasonCode = 'DEADLINE_IMPOSSIBLE';
          explanation = `Insufficient free time (${totalFreeBeforeDue}m available) before the deadline (${task.dueAt}) to complete the remaining ${neededMinutes}m of "${task.title}".`;
        }
      } else if (!task.isSplittable) {
        reasonCode = 'INSUFFICIENT_CONTIGUOUS_TIME';
        explanation = `No single uninterrupted ${neededMinutes}m window is available in the schedule for unsplittable task "${task.title}".`;
      }

      unscheduledTasks.push({
        taskId: task.id,
        title: task.title,
        priority: task.priority,
        remainingMinutes: baseRemaining,
        scheduledMinutes: alreadyScheduledLocked + scheduledForThisTask,
        unscheduledMinutes: neededMinutes,
        dueAt: task.dueAt,
        reasonCode,
        explanation,
      });

      conflicts.push({
        id: `conflict_unsched_${task.id}`,
        code: reasonCode,
        severity: dueMs !== null ? 'error' : 'warning',
        title:
          reasonCode === 'DEADLINE_IMPOSSIBLE'
            ? `Deadline Risk: "${task.title}"`
            : `Unscheduled Workload: "${task.title}"`,
        description: explanation,
        affectedTaskIds: [task.id],
        remediationOptions: task.isSplittable
          ? [
              'Extend the deadline or defer lower-priority tasks.',
              'Shorten the estimated duration or free up fixed blocks.',
            ]
          : [
              `Enable "Splittable" on "${task.title}" so it can be completed across multiple sessions.`,
              'Move a flexible routine or extend the deadline.',
            ],
      });
    }
  }

  // PASS 4B: Place Flexible Routine Occurrences on their target dateKey
  for (const occ of flexibleRoutineOccurrences) {
    const dayStartMs = Math.max(
      cutoffMs,
      localDateHHmmToEpochMs(occ.occurrenceDate, '00:00', tz)
    );
    const dayEndMs = localDateHHmmToEpochMs(addCalendarDays(occ.occurrenceDate, 1), '00:00', tz);
    if (dayEndMs <= dayStartMs) continue;

    const prefStartMs = localDateHHmmToEpochMs(occ.occurrenceDate, occ.preferredStartHHmm, tz);
    const prefEndMs = localDateHHmmToEpochMs(occ.occurrenceDate, occ.preferredEndHHmm, tz);

    let chosenStartMs: number | null = null;

    // First try within the preferred routine window on that day
    for (const slot of freeIntervals) {
      const cs = Math.max(slot.startMs, dayStartMs, prefStartMs);
      const ce = Math.min(slot.endMs, dayEndMs, prefEndMs > prefStartMs ? prefEndMs : dayEndMs);
      if (ce - cs >= occ.durationMinutes * 60000) {
        chosenStartMs = cs;
        break;
      }
    }

    // Fallback to any free window on that calendar date
    if (chosenStartMs === null) {
      for (const slot of freeIntervals) {
        const cs = Math.max(slot.startMs, dayStartMs);
        const ce = Math.min(slot.endMs, dayEndMs);
        if (ce - cs >= occ.durationMinutes * 60000) {
          chosenStartMs = cs;
          tradeoffs.push(
            `Routine "${occ.title}" on ${occ.occurrenceDate} was shifted outside its preferred window (${occ.preferredStartHHmm}–${occ.preferredEndHHmm}) to accommodate higher-priority work.`
          );
          break;
        }
      }
    }

    if (chosenStartMs !== null) {
      const chosenEndMs = chosenStartMs + occ.durationMinutes * 60000;
      placedBlocks.push({
        id: `blk_rt_${occ.routineId}_${occ.occurrenceDate}`,
        userId,
        planId,
        scheduleVersion,
        dateKey: occ.occurrenceDate,
        startAt: new Date(chosenStartMs).toISOString(),
        endAt: new Date(chosenEndMs).toISOString(),
        durationMinutes: occ.durationMinutes,
        title: occ.title,
        category: occ.category,
        blockType: 'routine',
        routineId: occ.routineId,
        occurrenceDate: occ.occurrenceDate,
        locked: false,
        status: 'planned',
        priority: occ.priority,
        reasonCode: 'ROUTINE_CONSISTENCY',
        source: sourceLabel,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      freeIntervals = subtractIntervals(freeIntervals, [
        { startMs: chosenStartMs, endMs: chosenEndMs },
      ]);
    } else {
      tradeoffs.push(
        `Flexible routine "${occ.title}" on ${occ.occurrenceDate} was skipped due to full capacity.`
      );
    }
  }

  // Sort final blocks chronologically
  placedBlocks.sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id.localeCompare(b.id)
  );

  // Calculate capacity summary
  const totalHorizonMinutes = Math.max(0, Math.round((horizonEndMs - horizonStartMs) / 60000));
  let fixedMinutes = 0;
  let routineMinutes = 0;
  let focusTaskMinutes = 0;
  let breakMinutes = 0;

  for (const b of placedBlocks) {
    if (b.blockType === 'fixed' || b.blockType === 'external_calendar') {
      fixedMinutes += b.durationMinutes;
    } else if (b.blockType === 'routine') {
      routineMinutes += b.durationMinutes;
    } else if (b.blockType === 'break') {
      breakMinutes += b.durationMinutes;
    } else {
      focusTaskMinutes += b.durationMinutes;
    }
  }

  const unallocatedMinutes = Math.max(
    0,
    totalHorizonMinutes -
      sleepMinutes -
      fixedMinutes -
      routineMinutes -
      focusTaskMinutes -
      breakMinutes
  );

  const requestedFlexibleMinutes = eligibleTasks.reduce(
    (acc, t) =>
      acc + (t.remainingMinutes ?? Math.max(0, t.estimatedMinutes - (t.actualMinutes || 0))),
    0
  );

  return {
    blocks: placedBlocks,
    unscheduledTasks,
    conflicts,
    tradeoffs,
    capacitySummary: {
      totalHorizonMinutes,
      sleepMinutes,
      fixedMinutes,
      routineMinutes,
      focusTaskMinutes,
      breakMinutes,
      unallocatedMinutes,
      requestedFlexibleMinutes,
      isOverloaded: unscheduledTasks.length > 0,
    },
    computeTimeMs: Math.max(1, Date.now() - perfStart),
  };
}

/**
 * Reality Shift Replanning Engine.
 * Produces an isolated before-and-after preview without mutating live inputs.
 */
export function computeRealityShiftPreview(params: {
  userId: string;
  planId: string;
  baseVersion: number;
  profile: UserProfile;
  tasks: Task[];
  routines: Routine[];
  currentBlocks: ScheduleBlock[];
  horizonStartDate: string;
  horizonEndDate: string;
  cutoffIso: string;
  changeSpec: RealityShiftChangeSpec;
}): ReplanPreviewResult {
  const perfStart = Date.now();
  const {
    userId,
    planId,
    baseVersion,
    profile,
    tasks,
    routines,
    currentBlocks,
    horizonStartDate,
    horizonEndDate,
    cutoffIso,
    changeSpec,
  } = params;

  const proposedVersion = baseVersion + 1;
  const tz = profile.timezone || 'UTC';

  // Deep clone inputs so preview calculation never mutates live records
  const clonedTasks: Task[] = tasks.map((t) => ({ ...t }));
  const clonedRoutines: Routine[] = routines.map((r) => ({
    ...r,
    daysOfWeek: [...(r.daysOfWeek || [])],
    skippedDates: [...(r.skippedDates || [])],
  }));
  const clonedBlocks: ScheduleBlock[] = currentBlocks.map((b) => ({ ...b }));

  let effectiveCutoffMs = Date.parse(cutoffIso);
  let capacityReducedMinutes = 0;

  // Apply structured Reality Shift changeSpec to the isolated clone
  if (changeSpec.scenarioType === 'late_start' && changeSpec.shiftStartMinutes) {
    effectiveCutoffMs += changeSpec.shiftStartMinutes * 60000;
    capacityReducedMinutes += changeSpec.shiftStartMinutes;
  } else if (changeSpec.newCutoffIso) {
    const parsed = Date.parse(changeSpec.newCutoffIso);
    if (!isNaN(parsed) && parsed > effectiveCutoffMs) {
      capacityReducedMinutes += Math.round((parsed - effectiveCutoffMs) / 60000);
      effectiveCutoffMs = parsed;
    }
  }

  if (changeSpec.scenarioType === 'task_overrun') {
    const extra = changeSpec.extraMinutes || 60;
    const targetTask = changeSpec.overrunTaskId
      ? clonedTasks.find((t) => t.id === changeSpec.overrunTaskId)
      : clonedTasks.find((t) => t.status !== 'complete' && !t.isFixed);
    if (targetTask) {
      targetTask.remainingMinutes = (targetTask.remainingMinutes ?? targetTask.estimatedMinutes) + extra;
      targetTask.estimatedMinutes += extra;
      capacityReducedMinutes += extra;
    }
  }

  if (changeSpec.scenarioType === 'unexpected_event' && changeSpec.unexpectedEvent) {
    const ev = changeSpec.unexpectedEvent;
    const sMs = Date.parse(ev.startAt);
    const eMs = Date.parse(ev.endAt);
    if (!isNaN(sMs) && !isNaN(eMs) && eMs > sMs) {
      const dur = Math.round((eMs - sMs) / 60000);
      capacityReducedMinutes += dur;
      clonedBlocks.push({
        id: `blk_shift_event_${Date.now()}`,
        userId,
        planId,
        scheduleVersion: proposedVersion,
        dateKey: formatDateKeyInTz(sMs, tz),
        startAt: new Date(sMs).toISOString(),
        endAt: new Date(eMs).toISOString(),
        durationMinutes: dur,
        title: ev.title || 'Unexpected Commitment',
        category: ev.category || 'work',
        blockType: 'fixed',
        locked: true,
        status: 'planned',
        priority: 'high',
        reasonCode: 'REALITY_SHIFT_FIXED_EVENT',
        source: 'reality_shift',
        createdAt: cutoffIso,
        updatedAt: cutoffIso,
      });
    }
  }

  if (changeSpec.scenarioType === 'defer_task_tomorrow') {
    const target = changeSpec.deferTaskId
      ? clonedTasks.find((t) => t.id === changeSpec.deferTaskId)
      : clonedTasks.find((t) => !t.isFixed && t.status !== 'complete');
    if (target) {
      const tomorrowDateKey = addCalendarDays(formatDateKeyInTz(effectiveCutoffMs, tz), 1);
      const tomorrowStartMs = localDateHHmmToEpochMs(
        tomorrowDateKey,
        profile.focusStartHHmm || '09:00',
        tz
      );
      target.earliestStartAt = new Date(tomorrowStartMs).toISOString();
    }
  }

  if (changeSpec.scenarioType === 'reserve_evening_free') {
    const todayKey = formatDateKeyInTz(effectiveCutoffMs, tz);
    const freeStartHHmm = changeSpec.freeFromHHmm || '19:00';
    const fStartMs = localDateHHmmToEpochMs(todayKey, freeStartHHmm, tz);
    const fEndMs = localDateHHmmToEpochMs(
      todayKey,
      profile.sleepStartHHmm || '23:00',
      tz
    );
    const actualEndMs =
      fEndMs > fStartMs
        ? fEndMs
        : localDateHHmmToEpochMs(addCalendarDays(todayKey, 1), '00:00', tz);
    if (actualEndMs > fStartMs) {
      const dur = Math.round((actualEndMs - fStartMs) / 60000);
      capacityReducedMinutes += dur;
      clonedBlocks.push({
        id: `blk_free_evening_${todayKey}`,
        userId,
        planId,
        scheduleVersion: proposedVersion,
        dateKey: todayKey,
        startAt: new Date(fStartMs).toISOString(),
        endAt: new Date(actualEndMs).toISOString(),
        durationMinutes: dur,
        title: 'Protected Personal Free Evening',
        category: 'personal',
        blockType: 'fixed',
        locked: true,
        status: 'planned',
        priority: 'high',
        reasonCode: 'PROTECTED_FREE_TIME',
        source: 'reality_shift',
        createdAt: cutoffIso,
        updatedAt: cutoffIso,
      });
    }
  }

  if (changeSpec.scenarioType === 'urgent_deadline' && changeSpec.urgentTask) {
    const ut = changeSpec.urgentTask;
    clonedTasks.push({
      id: `task_urgent_${Date.now()}`,
      userId,
      title: ut.title,
      description: 'Added via Reality Shift urgent deadline.',
      category: ut.category || 'academic',
      priority: ut.priority || 'critical',
      estimatedMinutes: ut.estimatedMinutes,
      actualMinutes: 0,
      remainingMinutes: ut.estimatedMinutes,
      dueAt: ut.dueAt,
      isFixed: false,
      isSplittable: true,
      minSessionMinutes: 30,
      preferredTimeOfDay: 'any',
      energyLevel: 'high',
      status: 'inbox',
      createdAt: cutoffIso,
      updatedAt: cutoffIso,
    });
  }

  if (changeSpec.scenarioType === 'complete_task' && changeSpec.completeTaskId) {
    const target = clonedTasks.find((t) => t.id === changeSpec.completeTaskId);
    if (target) {
      target.status = 'complete';
      target.remainingMinutes = 0;
      target.completedAt = cutoffIso;
    }
    for (const b of clonedBlocks) {
      if (b.taskId === changeSpec.completeTaskId) {
        b.status = 'completed';
      }
    }
  }

  const effectiveCutoffIso = new Date(effectiveCutoffMs).toISOString();

  const scheduleResult = generateDeterministicSchedule({
    userId,
    planId,
    scheduleVersion: proposedVersion,
    profile,
    tasks: clonedTasks,
    routines: clonedRoutines,
    existingBlocks: clonedBlocks,
    horizonStartDate,
    horizonEndDate,
    cutoffIso: effectiveCutoffIso,
    sourceLabel: 'reality_shift',
  });

  // Compute real block-level differences between currentBlocks and scheduleResult.blocks
  const diffs = computeScheduleDiffs(currentBlocks, scheduleResult.blocks);
  const movedCount = diffs.filter((d) => d.changeType === 'moved').length;
  const addedCount = diffs.filter((d) => d.changeType === 'added').length;
  const removedCount = diffs.filter((d) => d.changeType === 'removed').length;
  const unchangedLockedCount = scheduleResult.blocks.filter((b) => b.locked).length;

  const summaryParts: string[] = [];
  if (capacityReducedMinutes > 0) {
    summaryParts.push(`Available scheduling window shifted by ${capacityReducedMinutes} minutes.`);
  }
  if (movedCount > 0) {
    summaryParts.push(`${movedCount} flexible activity block(s) were relocated.`);
  }
  if (addedCount > 0) {
    summaryParts.push(`${addedCount} new block(s) added.`);
  }
  if (removedCount > 0) {
    summaryParts.push(`${removedCount} previous block(s) displaced.`);
  }
  summaryParts.push(`${unchangedLockedCount} locked/fixed commitment(s) remained protected.`);
  if (scheduleResult.unscheduledTasks.length > 0) {
    summaryParts.push(
      `${scheduleResult.unscheduledTasks.length} flexible task(s) could not fit before their deadline or horizon end.`
    );
  }

  return {
    baseVersion,
    proposedVersion,
    cutoffIso: effectiveCutoffIso,
    changeSpec,
    beforeBlocks: currentBlocks,
    afterBlocks: scheduleResult.blocks,
    diffs,
    unscheduledTasks: scheduleResult.unscheduledTasks,
    conflicts: scheduleResult.conflicts,
    summaryText: summaryParts.join(' '),
    capacityDeltaMinutes: -capacityReducedMinutes,
    computeTimeMs: Math.max(1, Date.now() - perfStart),
  };
}

/**
 * Computes exact differences between `beforeBlocks` and `afterBlocks`.
 */
export function computeScheduleDiffs(
  beforeBlocks: ScheduleBlock[],
  afterBlocks: ScheduleBlock[]
): BlockDiffItem[] {
  const diffs: BlockDiffItem[] = [];
  const beforeByKey = new Map<string, ScheduleBlock>();

  const getKey = (b: ScheduleBlock) =>
    b.taskId ? `task_${b.id}` : b.routineId ? `rt_${b.routineId}_${b.occurrenceDate}` : b.id;

  for (const b of beforeBlocks) {
    if (b.blockType === 'break') continue;
    beforeByKey.set(getKey(b), b);
  }

  const seenKeys = new Set<string>();

  for (const a of afterBlocks) {
    if (a.blockType === 'break') continue;
    const key = getKey(a);
    seenKeys.add(key);
    const prev = beforeByKey.get(key);

    if (!prev) {
      diffs.push({
        blockId: a.id,
        title: a.title,
        changeType: 'added',
        afterStartAt: a.startAt,
        afterEndAt: a.endAt,
        reason: a.reasonCode,
      });
    } else if (prev.startAt !== a.startAt || prev.endAt !== a.endAt) {
      diffs.push({
        blockId: a.id,
        title: a.title,
        changeType: prev.durationMinutes !== a.durationMinutes ? 'duration_changed' : 'moved',
        beforeStartAt: prev.startAt,
        beforeEndAt: prev.endAt,
        afterStartAt: a.startAt,
        afterEndAt: a.endAt,
        reason: a.reasonCode,
      });
    } else {
      diffs.push({
        blockId: a.id,
        title: a.title,
        changeType: 'unchanged',
        beforeStartAt: prev.startAt,
        beforeEndAt: prev.endAt,
        afterStartAt: a.startAt,
        afterEndAt: a.endAt,
        reason: a.locked ? 'Protected fixed/locked commitment' : 'Optimal slot unchanged',
      });
    }
  }

  for (const [key, prev] of beforeByKey.entries()) {
    if (!seenKeys.has(key)) {
      diffs.push({
        blockId: prev.id,
        title: prev.title,
        changeType: 'removed',
        beforeStartAt: prev.startAt,
        beforeEndAt: prev.endAt,
        reason: 'Displaced due to reduced capacity or updated constraints',
      });
    }
  }

  return diffs;
}

/**
 * Splits a list of ScheduleBlocks into bounded chunks of at most `maxPerChunk` (default 40)
 * to prevent oversized Firestore documents (Engineering Correction #4).
 */
export function chunkScheduleBlocks(
  userId: string,
  version: number,
  blocks: ScheduleBlock[],
  createdAt: string,
  maxPerChunk = 40
): PlanVersionChunk[] {
  const chunks: PlanVersionChunk[] = [];
  for (let i = 0; i < blocks.length; i += maxPerChunk) {
    const chunkIndex = Math.floor(i / maxPerChunk);
    chunks.push({
      id: `v_${version}_chunk_${chunkIndex}`,
      userId,
      version,
      chunkIndex,
      blocks: blocks.slice(i, i + maxPerChunk),
      createdAt,
    });
  }
  if (chunks.length === 0) {
    chunks.push({
      id: `v_${version}_chunk_0`,
      userId,
      version,
      chunkIndex: 0,
      blocks: [],
      createdAt,
    });
  }
  return chunks;
}

/**
 * Computes deterministic goal progress from completed milestones and linked tasks.
 */
export function computeGoalProgressPercent(goal: Goal, linkedTasks: Task[]): number {
  const milestones = goal.milestones || [];
  if (milestones.length === 0 && linkedTasks.length === 0) {
    return goal.status === 'completed' ? 100 : 0;
  }

  const totalItems = milestones.length + linkedTasks.length;
  const completedMilestones = milestones.filter((m) => m.completed).length;
  const completedTasks = linkedTasks.filter((t) => t.status === 'complete').length;
  return Math.round(((completedMilestones + completedTasks) / totalItems) * 100);
}

/**
 * Computes accurate elapsed seconds for a FocusSession across browser tab suspension or refresh.
 * Paused time is never counted as active effort.
 */
export function computeFocusElapsedSeconds(session: FocusSession, nowMs: number = Date.now()): number {
  const base = Math.max(0, session.accumulatedSeconds || 0);
  if (session.status !== 'running' || !session.lastResumedAt) {
    return base;
  }
  const resumedMs = Date.parse(session.lastResumedAt);
  if (isNaN(resumedMs) || nowMs <= resumedMs) {
    return base;
  }
  return base + Math.floor((nowMs - resumedMs) / 1000);
}

/**
 * Records focus session effort onto a Task without automatically marking the task complete
 * merely because its estimated duration has elapsed (Engineering Correction #6).
 */
export function applyFocusEffortToTask(
  task: Task,
  addedSeconds: number,
  explicitlyMarkComplete: boolean,
  nowIso: string
): Task {
  const addedMinutes = Math.max(1, Math.round(addedSeconds / 60));
  const nextActual = (task.actualMinutes || 0) + addedMinutes;
  const currentRemaining =
    task.remainingMinutes ?? Math.max(0, task.estimatedMinutes - (task.actualMinutes || 0));

  if (explicitlyMarkComplete) {
    return {
      ...task,
      actualMinutes: nextActual,
      remainingMinutes: 0,
      status: 'complete',
      completedAt: nowIso,
      updatedAt: nowIso,
    };
  }

  // Do NOT mark complete automatically if remainingMinutes reaches 0; keep at least 5m remaining or user-adjustable
  const nextRemaining = Math.max(0, currentRemaining - addedMinutes);
  return {
    ...task,
    actualMinutes: nextActual,
    remainingMinutes: nextRemaining,
    status: task.status === 'complete' ? 'complete' : 'in_progress',
    updatedAt: nowIso,
  };
}
