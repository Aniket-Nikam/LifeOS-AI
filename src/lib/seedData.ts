import { addCalendarDays, formatDateKeyInTz, localDateHHmmToEpochMs } from './scheduler';
import { Goal, Routine, Task, UserProfile } from '../types/lifeos';

/**
 * Generates the authentic Part 21 College Student Demonstration Scenario dataset
 * anchored dynamically to the user's current local date and timezone.
 *
 * NOTE: Never automatically inserted into real authenticated accounts!
 * Only used in the isolated Demo Sandbox or when a user explicitly clicks "Load Student Demo Scenario".
 */
export function buildCollegeStudentDemoScenario(
  userId: string,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
  referenceEpochMs: number = Date.now()
): {
  profile: UserProfile;
  goals: Goal[];
  routines: Routine[];
  tasks: Task[];
  todayDateKey: string;
} {
  const todayDateKey = formatDateKeyInTz(referenceEpochMs, timezone);
  const tomorrowDateKey = addCalendarDays(todayDateKey, 1);
  const dayPlus2Key = addCalendarDays(todayDateKey, 2);
  const dayPlus3Key = addCalendarDays(todayDateKey, 3);
  const dayPlus5Key = addCalendarDays(todayDateKey, 5);
  const nowIso = new Date(referenceEpochMs).toISOString();

  const profile: UserProfile = {
    userId,
    displayName: 'Maya Lin (CS & AI Undergrad)',
    timezone,
    sleepStartHHmm: '23:30',
    sleepEndHHmm: '07:30',
    focusStartHHmm: '09:00',
    focusEndHHmm: '13:00',
    workDays: [1, 2, 3, 4, 5],
    breakDurationMinutes: 10,
    maxContinuousWorkMinutes: 90,
    theme: 'dark',
    onboardingComplete: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const goals: Goal[] = [
    {
      id: 'goal_exams',
      userId,
      title: 'Ace Systems & Networking Midterms',
      description: 'Complete distributed consensus notes, practice exams, and lab checkpoints.',
      category: 'academic',
      targetDate: addCalendarDays(todayDateKey, 10),
      milestones: [
        { id: 'm1', title: 'Review Raft & Paxos lecture notes', completed: true, targetMinutes: 90 },
        { id: 'm2', title: 'Complete Networking TCP congestion problem set', completed: false, targetMinutes: 120 },
        { id: 'm3', title: 'Take timed practice midterm exam', completed: false, targetMinutes: 90 },
      ],
      progressPercent: 33,
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'goal_ai_project',
      userId,
      title: 'Ship Adaptive Scheduler Capstone MVP',
      description: 'Build deterministic interval solver, Firestore rules, and Reality Shift diff engine.',
      category: 'coding',
      targetDate: addCalendarDays(todayDateKey, 7),
      milestones: [
        { id: 'm4', title: 'Design schema & security rules', completed: true, targetMinutes: 60 },
        { id: 'm5', title: 'Implement deadline interval clipping solver', completed: false, targetMinutes: 120 },
        { id: 'm6', title: 'End-to-end Playwright verification pass', completed: false, targetMinutes: 60 },
      ],
      progressPercent: 33,
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'goal_wellness',
      userId,
      title: 'Consistent Strength & Creative Balance',
      description: 'Maintain 4x/week gym training, 3x/week acoustic guitar, and evening reading.',
      category: 'fitness',
      targetDate: addCalendarDays(todayDateKey, 30),
      milestones: [
        { id: 'm7', title: 'Complete 4 gym sessions this week', completed: false, targetMinutes: 240 },
        { id: 'm8', title: 'Learn fingerstyle arrangement on guitar', completed: false, targetMinutes: 135 },
      ],
      progressPercent: 25,
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  const routines: Routine[] = [
    {
      id: 'rt_gym',
      userId,
      title: 'Gym — Strength & Conditioning',
      category: 'fitness',
      frequency: 'selected_days',
      daysOfWeek: [1, 3, 5, 6], // Mon, Wed, Fri, Sat
      intervalDays: 1,
      startDate: addCalendarDays(todayDateKey, -7),
      preferredStartHHmm: '17:30',
      preferredEndHHmm: '19:30',
      durationMinutes: 60,
      isFixed: false,
      priority: 'high',
      skippedDates: [],
      overridesJson: '{}',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'rt_guitar',
      userId,
      title: 'Guitar Fingerstyle Practice',
      category: 'hobby',
      frequency: 'selected_days',
      daysOfWeek: [2, 4, 0], // Tue, Thu, Sun
      intervalDays: 1,
      startDate: addCalendarDays(todayDateKey, -7),
      preferredStartHHmm: '19:30',
      preferredEndHHmm: '21:30',
      durationMinutes: 45,
      isFixed: false,
      priority: 'medium',
      skippedDates: [],
      overridesJson: '{}',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'rt_reading',
      userId,
      title: 'Evening Deep Reading (Designing Data-Intensive Apps)',
      category: 'personal',
      frequency: 'weekdays',
      daysOfWeek: [1, 2, 3, 4, 5],
      intervalDays: 1,
      startDate: addCalendarDays(todayDateKey, -7),
      preferredStartHHmm: '21:30',
      preferredEndHHmm: '23:00',
      durationMinutes: 30,
      isFixed: false,
      priority: 'medium',
      skippedDates: [],
      overridesJson: '{}',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  // Fixed classes today and tomorrow + flexible academic/coding/creative tasks
  const lecture1Start = localDateHHmmToEpochMs(todayDateKey, '10:00', timezone);
  const lecture1End = localDateHHmmToEpochMs(todayDateKey, '11:30', timezone);

  const seminarStart = localDateHHmmToEpochMs(todayDateKey, '14:00', timezone);
  const seminarEnd = localDateHHmmToEpochMs(todayDateKey, '15:15', timezone);

  const tomorrowLectureStart = localDateHHmmToEpochMs(tomorrowDateKey, '10:00', timezone);
  const tomorrowLectureEnd = localDateHHmmToEpochMs(tomorrowDateKey, '11:30', timezone);

  const dueTonightMs = localDateHHmmToEpochMs(todayDateKey, '22:30', timezone);
  const dueTomorrowMs = localDateHHmmToEpochMs(tomorrowDateKey, '20:00', timezone);
  const dueDay2Ms = localDateHHmmToEpochMs(dayPlus2Key, '18:00', timezone);
  const dueDay3Ms = localDateHHmmToEpochMs(dayPlus3Key, '21:00', timezone);
  const dueDay5Ms = localDateHHmmToEpochMs(dayPlus5Key, '17:00', timezone);

  const tasks: Task[] = [
    {
      id: 'task_class_cs401',
      userId,
      title: 'CS 401: Distributed Systems Lecture',
      description: 'Fixed university lecture in Gates Hall Rm 104.',
      category: 'academic',
      priority: 'critical',
      estimatedMinutes: 90,
      actualMinutes: 0,
      remainingMinutes: 90,
      isFixed: true,
      fixedStartAt: new Date(lecture1Start).toISOString(),
      fixedEndAt: new Date(lecture1End).toISOString(),
      isSplittable: false,
      minSessionMinutes: 90,
      preferredTimeOfDay: 'morning',
      energyLevel: 'high',
      status: 'scheduled',
      goalId: 'goal_exams',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'task_class_ai310',
      userId,
      title: 'AI 310: Probabilistic Graphical Models Lab',
      description: 'Mandatory afternoon lab session.',
      category: 'academic',
      priority: 'critical',
      estimatedMinutes: 75,
      actualMinutes: 0,
      remainingMinutes: 75,
      isFixed: true,
      fixedStartAt: new Date(seminarStart).toISOString(),
      fixedEndAt: new Date(seminarEnd).toISOString(),
      isSplittable: false,
      minSessionMinutes: 75,
      preferredTimeOfDay: 'afternoon',
      energyLevel: 'medium',
      status: 'scheduled',
      goalId: 'goal_exams',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'task_class_tomorrow',
      userId,
      title: 'CS 405: Computer Networks Lecture',
      description: 'Fixed morning lecture.',
      category: 'academic',
      priority: 'critical',
      estimatedMinutes: 90,
      actualMinutes: 0,
      remainingMinutes: 90,
      isFixed: true,
      fixedStartAt: new Date(tomorrowLectureStart).toISOString(),
      fixedEndAt: new Date(tomorrowLectureEnd).toISOString(),
      isSplittable: false,
      minSessionMinutes: 90,
      preferredTimeOfDay: 'morning',
      energyLevel: 'high',
      status: 'scheduled',
      goalId: 'goal_exams',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'task_net_pset',
      userId,
      title: 'Networking TCP Congestion Control Problem Set',
      description: 'Complete problems 1-5 and simulate cubic congestion window.',
      category: 'academic',
      priority: 'critical',
      estimatedMinutes: 90,
      actualMinutes: 0,
      remainingMinutes: 90,
      dueAt: new Date(dueTonightMs).toISOString(),
      isFixed: false,
      isSplittable: true,
      minSessionMinutes: 45,
      preferredTimeOfDay: 'morning',
      energyLevel: 'high',
      status: 'inbox',
      goalId: 'goal_exams',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'task_ai_solver',
      userId,
      title: 'Implement Constraint Solver & Reality Shift Diffs',
      description: 'Write TypeScript interval clipping and before/after comparison unit tests.',
      category: 'coding',
      priority: 'high',
      estimatedMinutes: 120,
      actualMinutes: 30,
      remainingMinutes: 90,
      dueAt: new Date(dueTomorrowMs).toISOString(),
      isFixed: false,
      isSplittable: true,
      minSessionMinutes: 45,
      preferredTimeOfDay: 'morning',
      energyLevel: 'high',
      status: 'in_progress',
      goalId: 'goal_ai_project',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'task_freelance_api',
      userId,
      title: 'Freelance Client: Webhook Retry Endpoint Review',
      description: 'Audit idempotency keys and exponential backoff logic for client staging.',
      category: 'work',
      priority: 'high',
      estimatedMinutes: 60,
      actualMinutes: 0,
      remainingMinutes: 60,
      dueAt: new Date(dueDay2Ms).toISOString(),
      isFixed: false,
      isSplittable: false,
      minSessionMinutes: 60,
      preferredTimeOfDay: 'afternoon',
      energyLevel: 'medium',
      status: 'inbox',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'task_exam_prep',
      userId,
      title: 'Distributed Systems Midterm Synthesis & Practice Exam',
      description: 'Timed 90-minute practice exam covering linearizability and vector clocks.',
      category: 'academic',
      priority: 'high',
      estimatedMinutes: 90,
      actualMinutes: 0,
      remainingMinutes: 90,
      dueAt: new Date(dueDay3Ms).toISOString(),
      isFixed: false,
      isSplittable: false,
      minSessionMinutes: 90,
      preferredTimeOfDay: 'morning',
      energyLevel: 'high',
      status: 'inbox',
      goalId: 'goal_exams',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'task_sketching',
      userId,
      title: 'Architectural Perspective Sketching Study',
      description: 'Two-point perspective ink study in sketchbook.',
      category: 'hobby',
      priority: 'low',
      estimatedMinutes: 45,
      actualMinutes: 0,
      remainingMinutes: 45,
      dueAt: new Date(dueDay5Ms).toISOString(),
      isFixed: false,
      isSplittable: false,
      minSessionMinutes: 45,
      preferredTimeOfDay: 'evening',
      energyLevel: 'low',
      status: 'inbox',
      goalId: 'goal_wellness',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  return {
    profile,
    goals,
    routines,
    tasks,
    todayDateKey,
  };
}
