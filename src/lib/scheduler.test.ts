import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFocusEffortToTask,
  chunkScheduleBlocks,
  computeFocusElapsedSeconds,
  computeRealityShiftPreview,
  expandRoutineOccurrences,
  generateDeterministicSchedule,
  getSleepIntervalsForHorizon,
  localDateHHmmToEpochMs,
} from './scheduler';
import { FocusSession, Routine, ScheduleBlock, Task, UserProfile } from '../types/lifeos';

const baseProfile: UserProfile = {
  userId: 'user_test_1',
  displayName: 'Alex Mercer',
  timezone: 'America/New_York',
  sleepStartHHmm: '23:30',
  sleepEndHHmm: '07:30',
  focusStartHHmm: '09:00',
  focusEndHHmm: '13:00',
  workDays: [1, 2, 3, 4, 5],
  breakDurationMinutes: 10,
  maxContinuousWorkMinutes: 90,
  theme: 'dark',
  onboardingComplete: true,
  createdAt: '2026-10-30T10:00:00.000Z',
  updatedAt: '2026-10-30T10:00:00.000Z',
};

test('1. Overnight sleep windows span midnight and protect unavailable hours', () => {
  const sleepIntervals = getSleepIntervalsForHorizon(
    ['2026-10-30'],
    '23:30',
    '07:30',
    'America/New_York'
  );
  // Expect both previous night spilling into 2026-10-30 07:30 and 2026-10-30 23:30 -> 2026-10-31 07:30
  assert.equal(sleepIntervals.length, 2);
  for (const interval of sleepIntervals) {
    assert.equal((interval.endMs - interval.startMs) / 3600000, 8);
  }
});

test('2. Deadline-aware interval clipping clips partial free slots against earliestStartAt and dueAt', () => {
  // Free day starts at 08:00 EDT (12:00Z).
  // Suppose task has earliestStartAt = 09:15 EDT (13:15Z) and dueAt = 10:30 EDT (14:30Z), needing 60m.
  // Without clipping [08:00, 23:30] against [09:15, 10:30], a naive scheduler might schedule at 08:00 (violating earliestStart)
  // or reject a partial slot. With clipping, it MUST schedule inside [09:15, 10:30] EDT!
  const task: Task = {
    id: 'task_clip_1',
    userId: 'user_test_1',
    title: 'Clipped Deadline Task',
    description: 'Must clip free slot to [earliestStartAt, dueAt]',
    category: 'academic',
    priority: 'critical',
    estimatedMinutes: 60,
    actualMinutes: 0,
    remainingMinutes: 60,
    earliestStartAt: '2026-10-30T13:15:00.000Z', // 09:15 EDT
    dueAt: '2026-10-30T14:30:00.000Z',           // 10:30 EDT
    isFixed: false,
    isSplittable: false,
    minSessionMinutes: 60,
    preferredTimeOfDay: 'morning',
    energyLevel: 'high',
    status: 'inbox',
    createdAt: '2026-10-30T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
  };

  const res = generateDeterministicSchedule({
    userId: 'user_test_1',
    planId: 'plan_1',
    scheduleVersion: 1,
    profile: baseProfile,
    tasks: [task],
    routines: [],
    existingBlocks: [],
    horizonStartDate: '2026-10-30',
    horizonEndDate: '2026-10-30',
    cutoffIso: '2026-10-30T12:00:00.000Z', // 08:00 EDT
  });

  assert.equal(res.unscheduledTasks.length, 0);
  const scheduledTaskBlocks = res.blocks.filter((b) => b.taskId === 'task_clip_1');
  assert.equal(scheduledTaskBlocks.length, 1);
  assert.ok(Date.parse(scheduledTaskBlocks[0].startAt) >= Date.parse(task.earliestStartAt!));
  assert.ok(Date.parse(scheduledTaskBlocks[0].endAt) <= Date.parse(task.dueAt!));
});

test('3. Tasks never schedule beyond hard deadlines and emit explicit conflict reports when impossible', () => {
  // Only 30m remains before dueAt (12:00Z cutoff to 12:30Z dueAt), but task needs 90m
  const impossibleTask: Task = {
    id: 'task_imp_1',
    userId: 'user_test_1',
    title: 'Systems Architecture Paper',
    description: 'Needs 90m before 12:30Z',
    category: 'academic',
    priority: 'critical',
    estimatedMinutes: 90,
    actualMinutes: 0,
    remainingMinutes: 90,
    dueAt: '2026-10-30T12:30:00.000Z',
    isFixed: false,
    isSplittable: false,
    minSessionMinutes: 90,
    preferredTimeOfDay: 'morning',
    energyLevel: 'high',
    status: 'inbox',
    createdAt: '2026-10-30T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
  };

  const res = generateDeterministicSchedule({
    userId: 'user_test_1',
    planId: 'plan_1',
    scheduleVersion: 1,
    profile: baseProfile,
    tasks: [impossibleTask],
    routines: [],
    existingBlocks: [],
    horizonStartDate: '2026-10-30',
    horizonEndDate: '2026-10-30',
    cutoffIso: '2026-10-30T12:00:00.000Z',
  });

  // Must NOT schedule past dueAt
  const scheduled = res.blocks.filter((b) => b.taskId === 'task_imp_1');
  assert.equal(scheduled.length, 0);
  assert.equal(res.unscheduledTasks.length, 1);
  assert.equal(res.unscheduledTasks[0].reasonCode, 'DEADLINE_IMPOSSIBLE');
  assert.ok(res.conflicts.some((c) => c.code === 'DEADLINE_IMPOSSIBLE'));
});

test('4. Determinism: identical inputs and settings yield identical plans', () => {
  const tasks: Task[] = [
    {
      id: 't1',
      userId: 'user_test_1',
      title: 'Operating Systems Lab',
      description: 'Kernel threads',
      category: 'coding',
      priority: 'high',
      estimatedMinutes: 120,
      actualMinutes: 0,
      remainingMinutes: 120,
      dueAt: '2026-10-30T22:00:00.000Z',
      isFixed: false,
      isSplittable: true,
      minSessionMinutes: 45,
      preferredTimeOfDay: 'morning',
      energyLevel: 'high',
      status: 'inbox',
      createdAt: '2026-10-30T08:00:00.000Z',
      updatedAt: '2026-10-30T08:00:00.000Z',
    },
    {
      id: 't2',
      userId: 'user_test_1',
      title: 'Read Chapter 4',
      description: 'Networking fundamentals',
      category: 'academic',
      priority: 'medium',
      estimatedMinutes: 45,
      actualMinutes: 0,
      remainingMinutes: 45,
      isFixed: false,
      isSplittable: false,
      minSessionMinutes: 45,
      preferredTimeOfDay: 'afternoon',
      energyLevel: 'medium',
      status: 'inbox',
      createdAt: '2026-10-30T08:05:00.000Z',
      updatedAt: '2026-10-30T08:05:00.000Z',
    },
  ];

  const runA = generateDeterministicSchedule({
    userId: 'user_test_1',
    planId: 'plan_1',
    scheduleVersion: 1,
    profile: baseProfile,
    tasks,
    routines: [],
    existingBlocks: [],
    horizonStartDate: '2026-10-30',
    horizonEndDate: '2026-10-30',
    cutoffIso: '2026-10-30T12:00:00.000Z',
  });

  const runB = generateDeterministicSchedule({
    userId: 'user_test_1',
    planId: 'plan_1',
    scheduleVersion: 1,
    profile: baseProfile,
    tasks: [...tasks].reverse(),
    routines: [],
    existingBlocks: [],
    horizonStartDate: '2026-10-30',
    horizonEndDate: '2026-10-30',
    cutoffIso: '2026-10-30T12:00:00.000Z',
  });

  assert.deepEqual(runA.blocks, runB.blocks);
});

test('5. Routine expansion supports single-occurrence skip and override without mutating other dates', () => {
  const gymRoutine: Routine = {
    id: 'rt_gym',
    userId: 'user_test_1',
    title: 'Gym Strength Session',
    category: 'fitness',
    frequency: 'selected_days',
    daysOfWeek: [1, 3, 5, 6], // Mon, Wed, Fri, Sat
    intervalDays: 1,
    startDate: '2026-10-26',
    preferredStartHHmm: '17:30',
    preferredEndHHmm: '19:00',
    durationMinutes: 60,
    isFixed: false,
    priority: 'high',
    skippedDates: ['2026-10-28'], // Skip Wednesday
    overridesJson: JSON.stringify({
      '2026-10-30': {
        dateKey: '2026-10-30',
        title: 'Gym — Upper Body Focus',
        durationMinutes: 75,
      },
    }),
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  };

  // 2026-10-26 is Mon, 27 Tue, 28 Wed, 29 Thu, 30 Fri, 31 Sat
  const occs = expandRoutineOccurrences(gymRoutine, [
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
  ]);

  // Wed 28 skipped -> only Mon 26, Fri 30, Sat 31
  assert.equal(occs.length, 3);
  assert.deepEqual(
    occs.map((o) => o.occurrenceDate),
    ['2026-10-26', '2026-10-30', '2026-10-31']
  );
  // Fri 30 has overridden title and duration, Mon 26 & Sat 31 retain original 60m
  assert.equal(occs[0].durationMinutes, 60);
  assert.equal(occs[1].title, 'Gym — Upper Body Focus');
  assert.equal(occs[1].durationMinutes, 75);
  assert.equal(occs[2].durationMinutes, 60);
});

test('6. Reality Shift preview preserves locked and completed blocks and never mutates original arrays', () => {
  const lockedClass: ScheduleBlock = {
    id: 'blk_class_1',
    userId: 'user_test_1',
    planId: 'plan_1',
    scheduleVersion: 1,
    dateKey: '2026-10-30',
    startAt: '2026-10-30T14:00:00.000Z', // 10:00 AM EDT
    endAt: '2026-10-30T15:30:00.000Z',   // 11:30 AM EDT
    durationMinutes: 90,
    title: 'CS 401: Distributed Systems Lecture',
    category: 'academic',
    blockType: 'fixed',
    locked: true,
    status: 'planned',
    priority: 'critical',
    reasonCode: 'FIXED_COMMITMENT',
    source: 'scheduler',
    createdAt: '2026-10-30T08:00:00.000Z',
    updatedAt: '2026-10-30T08:00:00.000Z',
  };

  const flexibleBlock: ScheduleBlock = {
    id: 'blk_task_flex1_1',
    userId: 'user_test_1',
    planId: 'plan_1',
    scheduleVersion: 1,
    dateKey: '2026-10-30',
    startAt: '2026-10-30T12:00:00.000Z', // 08:00 AM EDT
    endAt: '2026-10-30T13:00:00.000Z',   // 09:00 AM EDT
    durationMinutes: 60,
    title: 'Algorithm Problem Set',
    category: 'academic',
    blockType: 'task',
    taskId: 'flex1',
    locked: false,
    status: 'planned',
    priority: 'high',
    reasonCode: 'PREFERRED_FOCUS_SLOT',
    source: 'scheduler',
    createdAt: '2026-10-30T08:00:00.000Z',
    updatedAt: '2026-10-30T08:00:00.000Z',
  };

  const flexTask: Task = {
    id: 'flex1',
    userId: 'user_test_1',
    title: 'Algorithm Problem Set',
    description: 'Dynamic programming',
    category: 'academic',
    priority: 'high',
    estimatedMinutes: 60,
    actualMinutes: 0,
    remainingMinutes: 60,
    isFixed: false,
    isSplittable: false,
    minSessionMinutes: 60,
    preferredTimeOfDay: 'morning',
    energyLevel: 'high',
    status: 'scheduled',
    createdAt: '2026-10-30T08:00:00.000Z',
    updatedAt: '2026-10-30T08:00:00.000Z',
  };

  const currentBlocks = [flexibleBlock, lockedClass];
  const preview = computeRealityShiftPreview({
    userId: 'user_test_1',
    planId: 'plan_1',
    baseVersion: 1,
    profile: baseProfile,
    tasks: [flexTask],
    routines: [],
    currentBlocks,
    horizonStartDate: '2026-10-30',
    horizonEndDate: '2026-10-30',
    cutoffIso: '2026-10-30T12:00:00.000Z', // 08:00 AM EDT
    changeSpec: {
      scenarioType: 'late_start',
      summary: 'Woke up 2 hours late (10:00 AM EDT)',
      shiftStartMinutes: 120,
    },
  });

  // Original array must be untouched
  assert.equal(currentBlocks[0].startAt, '2026-10-30T12:00:00.000Z');
  // Locked class at 14:00Z-15:30Z must remain at exact same time
  const afterClass = preview.afterBlocks.find((b) => b.id === 'blk_class_1');
  assert.ok(afterClass);
  assert.equal(afterClass.startAt, '2026-10-30T14:00:00.000Z');
  // Flexible task must have moved to after the 10:00-11:30 AM class (>= 15:30Z)
  const afterFlex = preview.afterBlocks.find((b) => b.taskId === 'flex1');
  assert.ok(afterFlex);
  assert.ok(Date.parse(afterFlex.startAt) >= Date.parse('2026-10-30T15:30:00.000Z'));
});

test('7. Focus timer accuracy across tab suspension and separate effort tracking without auto-completion', () => {
  const session: FocusSession = {
    id: 'fs_1',
    userId: 'user_test_1',
    taskId: 't_focus',
    taskTitle: 'Build AI Agent',
    status: 'running',
    plannedMinutes: 30,
    startedAt: '2026-10-30T12:00:00.000Z',
    lastResumedAt: '2026-10-30T12:10:00.000Z',
    accumulatedSeconds: 300, // 5 mins prior to pause
    notes: '',
    createdAt: '2026-10-30T12:00:00.000Z',
    updatedAt: '2026-10-30T12:10:00.000Z',
  };

  // Simulate 25 minutes of tab suspension until 12:35:00Z
  const elapsed = computeFocusElapsedSeconds(session, Date.parse('2026-10-30T12:35:00.000Z'));
  assert.equal(elapsed, 300 + 25 * 60); // 1800 seconds = 30m

  // When paused, additional wall-clock time is NOT counted
  const pausedSession: FocusSession = { ...session, status: 'paused', accumulatedSeconds: 1800 };
  assert.equal(computeFocusElapsedSeconds(pausedSession, Date.parse('2026-10-30T14:00:00.000Z')), 1800);

  // Applying 35m of effort to a 30m task without explicitlyMarkComplete must NOT mark the task complete!
  const task: Task = {
    id: 't_focus',
    userId: 'user_test_1',
    title: 'Build AI Agent',
    description: '',
    category: 'coding',
    priority: 'high',
    estimatedMinutes: 30,
    actualMinutes: 0,
    remainingMinutes: 30,
    isFixed: false,
    isSplittable: true,
    minSessionMinutes: 15,
    preferredTimeOfDay: 'morning',
    energyLevel: 'high',
    status: 'scheduled',
    createdAt: '2026-10-30T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
  };

  const updatedTask = applyFocusEffortToTask(task, 35 * 60, false, '2026-10-30T12:35:00.000Z');
  assert.equal(updatedTask.actualMinutes, 35);
  assert.equal(updatedTask.remainingMinutes, 0);
  assert.notEqual(updatedTask.status, 'complete'); // Engineering Correction #6 verified!
});

test('8. DST boundary and bounded chunking verification', () => {
  // 2026-11-01 is US Daylight Saving Time fallback date in America/New_York
  const dstStart = localDateHHmmToEpochMs('2026-11-01', '09:00', 'America/New_York');
  const dstEnd = localDateHHmmToEpochMs('2026-11-01', '10:00', 'America/New_York');
  assert.equal((dstEnd - dstStart) / 60000, 60);

  // Test chunkScheduleBlocks splits 95 blocks into 3 chunks (40, 40, 15)
  const dummyBlocks: ScheduleBlock[] = Array.from({ length: 95 }, (_, idx) => ({
    id: `b_${idx}`,
    userId: 'u1',
    planId: 'p1',
    scheduleVersion: 2,
    dateKey: '2026-10-30',
    startAt: '2026-10-30T12:00:00.000Z',
    endAt: '2026-10-30T12:30:00.000Z',
    durationMinutes: 30,
    title: `Block ${idx}`,
    category: 'coding',
    blockType: 'task',
    locked: false,
    status: 'planned',
    priority: 'medium',
    reasonCode: 'TEST',
    source: 'scheduler',
    createdAt: '2026-10-30T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
  }));
  const chunks = chunkScheduleBlocks('u1', 2, dummyBlocks, '2026-10-30T10:00:00.000Z', 40);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].blocks.length, 40);
  assert.equal(chunks[1].blocks.length, 40);
  assert.equal(chunks[2].blocks.length, 15);
});
