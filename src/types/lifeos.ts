export type TaskCategory = 'academic' | 'coding' | 'work' | 'fitness' | 'hobby' | 'personal';
export type BlockCategory = TaskCategory | 'break' | 'external';
export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';
export type TimeOfDayPreference = 'morning' | 'afternoon' | 'evening' | 'night' | 'any';
export type EnergyLevel = 'low' | 'medium' | 'high';
export type TaskStatus = 'inbox' | 'scheduled' | 'in_progress' | 'complete' | 'skipped' | 'archived';
export type BlockType = 'task' | 'routine' | 'fixed' | 'break' | 'external_calendar';
export type BlockStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';
export type BlockSource = 'scheduler' | 'manual' | 'reality_shift' | 'google_calendar';
export type RoutineFrequency = 'daily' | 'weekdays' | 'selected_days' | 'weekly' | 'interval';

export interface UserProfile {
  userId: string;
  displayName: string;
  timezone: string;
  sleepStartHHmm: string; // e.g., "23:30" or "01:00"
  sleepEndHHmm: string;   // e.g., "07:30" or "09:00"
  focusStartHHmm: string; // e.g., "09:00"
  focusEndHHmm: string;   // e.g., "13:00"
  workDays: number[];     // 0=Sun .. 6=Sat
  breakDurationMinutes: number;
  maxContinuousWorkMinutes: number;
  theme: 'dark' | 'light';
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: TaskCategory;
  priority: PriorityLevel;
  estimatedMinutes: number;
  actualMinutes: number;
  remainingMinutes: number; // Tracked separately from estimatedMinutes and actualMinutes
  earliestStartAt?: string; // ISO timestamp
  dueAt?: string;           // ISO timestamp
  isFixed: boolean;
  fixedStartAt?: string;    // ISO timestamp if isFixed
  fixedEndAt?: string;      // ISO timestamp if isFixed
  isSplittable: boolean;
  minSessionMinutes: number;
  preferredTimeOfDay: TimeOfDayPreference;
  energyLevel: EnergyLevel;
  status: TaskStatus;
  goalId?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoalMilestone {
  id: string;
  title: string;
  completed: boolean;
  targetMinutes?: number;
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: TaskCategory;
  targetDate: string; // YYYY-MM-DD or ISO
  milestones: GoalMilestone[];
  progressPercent: number;
  status: 'active' | 'completed' | 'paused';
  createdAt: string;
  updatedAt: string;
}

export interface RoutineOccurrenceOverride {
  dateKey: string; // YYYY-MM-DD
  title?: string;
  preferredStartHHmm?: string;
  preferredEndHHmm?: string;
  durationMinutes?: number;
  isFixed?: boolean;
}

export interface Routine {
  id: string;
  userId: string;
  title: string;
  category: TaskCategory;
  frequency: RoutineFrequency;
  daysOfWeek: number[]; // 0=Sun .. 6=Sat
  intervalDays: number;
  startDate: string;    // YYYY-MM-DD
  endDate?: string;     // YYYY-MM-DD
  preferredStartHHmm: string; // e.g., "17:30"
  preferredEndHHmm: string;   // e.g., "19:00"
  durationMinutes: number;
  isFixed: boolean;
  priority: PriorityLevel;
  skippedDates: string[]; // YYYY-MM-DD
  overridesJson: string;  // JSON map of dateKey -> RoutineOccurrenceOverride
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleBlock {
  id: string;
  userId: string;
  planId: string;
  scheduleVersion: number;
  dateKey: string; // YYYY-MM-DD in user's local timezone
  startAt: string; // ISO string
  endAt: string;   // ISO string
  durationMinutes: number;
  title: string;
  category: BlockCategory;
  blockType: BlockType;
  taskId?: string;
  routineId?: string;
  occurrenceDate?: string;
  locked: boolean;
  status: BlockStatus;
  priority: PriorityLevel;
  reasonCode: string;
  source: BlockSource;
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  id: string;
  userId: string;
  horizonStart: string; // YYYY-MM-DD
  horizonEnd: string;   // YYYY-MM-DD
  currentVersion: number;
  status: 'active' | 'archived';
  lastReason: string;
  updatedAt: string;
}

export interface PlanVersion {
  id: string;
  userId: string;
  planId: string;
  version: number;
  parentVersion: number;
  reason: string;
  blockCount: number;
  chunkCount: number;
  summaryText: string;
  serverValidated: boolean;
  createdAt: string;
}

export interface PlanVersionChunk {
  id: string;
  userId: string;
  version: number;
  chunkIndex: number;
  blocks: ScheduleBlock[];
  createdAt: string;
}

export interface FocusSession {
  id: string;
  userId: string;
  taskId: string;
  taskTitle: string;
  status: 'running' | 'paused' | 'completed' | 'stopped';
  plannedMinutes: number;
  startedAt: string;
  lastResumedAt?: string;
  endedAt?: string;
  accumulatedSeconds: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  targetId: string;
  summary: string;
  createdAt: string;
}

export interface SimulationRecord {
  id: string;
  userId: string;
  title: string;
  baseVersion: number;
  scenarioType: string;
  summaryText: string;
  scheduledCount: number;
  unscheduledCount: number;
  conflictCount: number;
  createdAt: string;
}

export type ConflictSeverity = 'error' | 'warning';

export interface ScheduleConflict {
  id: string;
  code:
    | 'HARD_OVERLAP_CONFLICT'
    | 'DEADLINE_IMPOSSIBLE'
    | 'INSUFFICIENT_CONTIGUOUS_TIME'
    | 'CAPACITY_EXCEEDED'
    | 'EARLIEST_START_AFTER_DUE'
    | 'OUTSIDE_PLANNING_HORIZON';
  severity: ConflictSeverity;
  title: string;
  description: string;
  affectedTaskIds: string[];
  remediationOptions: string[];
}

export interface UnscheduledTaskReport {
  taskId: string;
  title: string;
  priority: PriorityLevel;
  remainingMinutes: number;
  scheduledMinutes: number;
  unscheduledMinutes: number;
  dueAt?: string;
  reasonCode: ScheduleConflict['code'];
  explanation: string;
}

export interface ScheduleResult {
  blocks: ScheduleBlock[];
  unscheduledTasks: UnscheduledTaskReport[];
  conflicts: ScheduleConflict[];
  tradeoffs: string[];
  capacitySummary: {
    totalHorizonMinutes: number;
    sleepMinutes: number;
    fixedMinutes: number;
    routineMinutes: number;
    focusTaskMinutes: number;
    breakMinutes: number;
    unallocatedMinutes: number;
    requestedFlexibleMinutes: number;
    isOverloaded: boolean;
  };
  computeTimeMs: number;
}

export interface RealityShiftChangeSpec {
  scenarioType:
    | 'late_start'
    | 'task_overrun'
    | 'unexpected_event'
    | 'reduce_remaining_day'
    | 'defer_task_tomorrow'
    | 'reserve_evening_free'
    | 'urgent_deadline'
    | 'complete_task'
    | 'custom';
  summary: string;
  shiftStartMinutes?: number; // e.g., +120 for waking up 2 hours late
  newCutoffIso?: string;
  overrunTaskId?: string;
  extraMinutes?: number;
  unexpectedEvent?: {
    title: string;
    startAt: string;
    endAt: string;
    category?: TaskCategory;
  };
  deferTaskId?: string;
  freeFromHHmm?: string; // e.g., "19:00"
  urgentTask?: {
    title: string;
    estimatedMinutes: number;
    dueAt: string;
    priority: PriorityLevel;
    category: TaskCategory;
  };
  completeTaskId?: string;
  ambiguities?: string[];
}

export interface BlockDiffItem {
  blockId: string;
  title: string;
  changeType: 'unchanged' | 'moved' | 'added' | 'removed' | 'duration_changed';
  beforeStartAt?: string;
  beforeEndAt?: string;
  afterStartAt?: string;
  afterEndAt?: string;
  reason: string;
}

export interface ReplanPreviewResult {
  baseVersion: number;
  proposedVersion: number;
  cutoffIso: string;
  changeSpec: RealityShiftChangeSpec;
  beforeBlocks: ScheduleBlock[];
  afterBlocks: ScheduleBlock[];
  diffs: BlockDiffItem[];
  unscheduledTasks: UnscheduledTaskReport[];
  conflicts: ScheduleConflict[];
  summaryText: string;
  capacityDeltaMinutes: number;
  computeTimeMs: number;
}
