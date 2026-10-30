import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  onAuthStateChanged,
  OperationType,
  signInWithGoogle,
  signOutUser,
  User,
} from '../lib/firebase';
import {
  addCalendarDays,
  applyFocusEffortToTask,
  computeFocusElapsedSeconds,
  computeGoalProgressPercent,
  computeRealityShiftPreview,
  formatDateKeyInTz,
  generateDeterministicSchedule,
} from '../lib/scheduler';
import { buildCollegeStudentDemoScenario } from '../lib/seedData';
import {
  ActivityLog,
  FocusSession,
  Goal,
  Plan,
  PlanVersion,
  RealityShiftChangeSpec,
  ReplanPreviewResult,
  Routine,
  ScheduleBlock,
  ScheduleConflict,
  SimulationRecord,
  Task,
  UnscheduledTaskReport,
  UserProfile,
} from '../types/lifeos';

export type NavTab =
  | 'mission_control'
  | 'my_day'
  | 'timeline'
  | 'tasks'
  | 'goals'
  | 'routines'
  | 'reality_shift'
  | 'simulator'
  | 'insights'
  | 'settings';

interface DemoSandboxState {
  profile: UserProfile;
  tasks: Task[];
  goals: Goal[];
  routines: Routine[];
  scheduleBlocks: ScheduleBlock[];
  plan: Plan;
  planVersions: PlanVersion[];
  versionSnapshots: Record<number, ScheduleBlock[]>;
  focusSessions: FocusSession[];
  activities: ActivityLog[];
  simulations: SimulationRecord[];
}

const DEMO_STORAGE_KEY = 'lifeos_demo_sandbox_v2';

function createInitialDemoState(): DemoSandboxState {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  const seed = buildCollegeStudentDemoScenario('demo_student', tz, Date.now());
  const horizonEnd = addCalendarDays(seed.todayDateKey, 6);
  const nowIso = new Date().toISOString();

  const initialSchedule = generateDeterministicSchedule({
    userId: 'demo_student',
    planId: 'active',
    scheduleVersion: 1,
    profile: seed.profile,
    tasks: seed.tasks,
    routines: seed.routines,
    existingBlocks: [],
    horizonStartDate: seed.todayDateKey,
    horizonEndDate: horizonEnd,
    cutoffIso: nowIso,
    sourceLabel: 'scheduler',
  });

  const plan: Plan = {
    id: 'active',
    userId: 'demo_student',
    horizonStart: seed.todayDateKey,
    horizonEnd,
    currentVersion: 1,
    status: 'active',
    lastReason: 'Initial 7-day student schedule generated',
    updatedAt: nowIso,
  };

  const v1: PlanVersion = {
    id: 'v_1',
    userId: 'demo_student',
    planId: 'active',
    version: 1,
    parentVersion: 0,
    reason: 'Initial 7-day student schedule generated',
    blockCount: initialSchedule.blocks.length,
    chunkCount: 1,
    summaryText: `Generated ${initialSchedule.blocks.length} schedule blocks across 7 days.`,
    serverValidated: true,
    createdAt: nowIso,
  };

  return {
    profile: seed.profile,
    tasks: seed.tasks,
    goals: seed.goals,
    routines: seed.routines,
    scheduleBlocks: initialSchedule.blocks,
    plan,
    planVersions: [v1],
    versionSnapshots: { 1: initialSchedule.blocks },
    focusSessions: [
      {
        id: 'fs_seed_1',
        userId: 'demo_student',
        taskId: 'task_ai_solver',
        taskTitle: 'Implement Constraint Solver & Reality Shift Diffs',
        status: 'completed',
        plannedMinutes: 45,
        startedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
        endedAt: new Date(Date.now() - 3600000 * 2.5).toISOString(),
        accumulatedSeconds: 1800,
        notes: 'Completed interval normalizer and unit test harness.',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ],
    activities: [
      {
        id: 'act_seed_1',
        userId: 'demo_student',
        action: 'plan_generated',
        targetId: 'v_1',
        summary: `Initial 7-day student schedule generated (v1, ${initialSchedule.blocks.length} blocks)`,
        createdAt: nowIso,
      },
    ],
    simulations: [],
  };
}

interface LifeOSContextValue {
  user: User | null;
  authReady: boolean;
  isDemoMode: boolean;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  profile: UserProfile | null;
  tasks: Task[];
  goals: Goal[];
  routines: Routine[];
  scheduleBlocks: ScheduleBlock[];
  plan: Plan | null;
  planVersions: PlanVersion[];
  focusSessions: FocusSession[];
  activities: ActivityLog[];
  simulations: SimulationRecord[];
  conflicts: ScheduleConflict[];
  unscheduledTasks: UnscheduledTaskReport[];
  lastComputeTimeMs: number;
  activePreview: ReplanPreviewResult | null;
  setActivePreview: (preview: ReplanPreviewResult | null) => void;
  toastMessage: { text: string; type: 'success' | 'error' | 'info' } | null;
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  isBusy: boolean;
  // Auth & Workspace actions
  loginWithGoogle: () => Promise<void>;
  enterStudentDemoMode: () => void;
  resetStudentDemoData: () => void;
  loadStudentScenarioIntoAccount: () => Promise<void>;
  logout: () => Promise<void>;
  // Profile & Theme
  saveProfile: (updates: Partial<UserProfile>) => Promise<void>;
  toggleTheme: () => Promise<void>;
  // Task CRUD
  saveTask: (taskInput: Omit<Task, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<Task>;
  deleteTask: (taskId: string) => Promise<void>;
  toggleTaskComplete: (taskId: string) => Promise<void>;
  duplicateTask: (taskId: string) => Promise<void>;
  // Goal CRUD
  saveGoal: (goalInput: Omit<Goal, 'id' | 'userId' | 'progressPercent' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteGoal: (goalId: string) => Promise<void>;
  toggleGoalMilestone: (goalId: string, milestoneId: string) => Promise<void>;
  // Routine CRUD
  saveRoutine: (routineInput: Omit<Routine, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteRoutine: (routineId: string) => Promise<void>;
  skipRoutineOccurrence: (routineId: string, dateKey: string) => Promise<void>;
  overrideRoutineOccurrence: (
    routineId: string,
    dateKey: string,
    override: { title?: string; preferredStartHHmm?: string; preferredEndHHmm?: string; durationMinutes?: number; isFixed?: boolean }
  ) => Promise<void>;
  restoreRoutineOccurrences: (routineId: string) => Promise<void>;
  // Schedule & Block manipulation
  generateScheduleForHorizon: (days?: number) => Promise<void>;
  updateScheduleBlock: (blockId: string, updates: Partial<ScheduleBlock>) => Promise<boolean>;
  deleteScheduleBlock: (blockId: string) => Promise<void>;
  // Reality Shift & Versioning
  runRealityShiftPreview: (changeSpec: RealityShiftChangeSpec) => Promise<ReplanPreviewResult>;
  applyRealityShiftPreview: (preview: ReplanPreviewResult) => Promise<void>;
  undoLastPlanVersion: () => Promise<void>;
  // Simulator
  runWhatIfSimulation: (title: string, changeSpec: RealityShiftChangeSpec) => Promise<ReplanPreviewResult>;
  // Focus Session
  activeFocusSession: FocusSession | null;
  startFocusSession: (taskId: string, plannedMinutes?: number) => Promise<void>;
  pauseFocusSession: () => Promise<void>;
  resumeFocusSession: () => Promise<void>;
  finishFocusSession: (markTaskComplete: boolean, notes?: string, overrideMinutes?: number) => Promise<void>;
  // Server AI helpers
  authenticatedFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const LifeOSContext = createContext<LifeOSContextValue | null>(null);

export function LifeOSProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1' || params.get('demo') === '1';
  });

  const [activeTab, setActiveTab] = useState<NavTab>('mission_control');
  const [demoState, setDemoState] = useState<DemoSandboxState>(() => {
    try {
      const saved = localStorage.getItem(DEMO_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore storage errors
    }
    return createInitialDemoState();
  });

  // Firestore state for authenticated users
  const [fsProfile, setFsProfile] = useState<UserProfile | null>(null);
  const [fsTasks, setFsTasks] = useState<Task[]>([]);
  const [fsGoals, setFsGoals] = useState<Goal[]>([]);
  const [fsRoutines, setFsRoutines] = useState<Routine[]>([]);
  const [fsBlocks, setFsBlocks] = useState<ScheduleBlock[]>([]);
  const [fsPlan, setFsPlan] = useState<Plan | null>(null);
  const [fsPlanVersions, setFsPlanVersions] = useState<PlanVersion[]>([]);
  const [fsFocusSessions, setFsFocusSessions] = useState<FocusSession[]>([]);
  const [fsActivities, setFsActivities] = useState<ActivityLog[]>([]);
  const [fsSimulations, setFsSimulations] = useState<SimulationRecord[]>([]);

  const [activePreview, setActivePreview] = useState<ReplanPreviewResult | null>(null);
  const [lastComputeTimeMs, setLastComputeTimeMs] = useState<number>(4);
  const [isBusy, setIsBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback(
    (text: string, type: 'success' | 'error' | 'info' = 'info') => {
      setToastMessage({ text, type });
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = window.setTimeout(() => {
        setToastMessage(null);
      }, 4500);
    },
    []
  );

  // Save demo state to localStorage
  useEffect(() => {
    if (isDemoMode) {
      try {
        localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demoState));
      } catch {
        // ignore quota errors
      }
    }
  }, [demoState, isDemoMode]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setIsDemoMode(false);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Attach Firestore listeners when authenticated
  useEffect(() => {
    if (!authReady || !user || isDemoMode) {
      return;
    }
    const uid = user.uid;
    const unsubs: Array<() => void> = [];

    const profilePath = `users/${uid}`;
    unsubs.push(
      onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          if (snap.exists()) {
            setFsProfile(snap.data() as UserProfile);
          } else {
            // Initialize clean default profile (onboardingComplete: false)
            const nowIso = new Date().toISOString();
            const defaultProfile: UserProfile = {
              userId: uid,
              displayName: user.displayName || user.email?.split('@')[0] || 'LifeOS User',
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
              sleepStartHHmm: '23:30',
              sleepEndHHmm: '07:30',
              focusStartHHmm: '09:00',
              focusEndHHmm: '13:00',
              workDays: [1, 2, 3, 4, 5],
              breakDurationMinutes: 10,
              maxContinuousWorkMinutes: 90,
              theme: 'dark',
              onboardingComplete: false,
              createdAt: nowIso,
              updatedAt: nowIso,
            };
            setDoc(doc(db, 'users', uid), defaultProfile).catch((err) =>
              handleFirestoreError(err, OperationType.CREATE, profilePath)
            );
            setFsProfile(defaultProfile);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, profilePath)
      )
    );

    const bindCollection = <T extends { id: string }>(
      subcol: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>
    ) => {
      const path = `users/${uid}/${subcol}`;
      unsubs.push(
        onSnapshot(
          collection(db, 'users', uid, subcol),
          (snap) => {
            const list: T[] = [];
            snap.forEach((d) => list.push({ ...(d.data() as any), id: d.id }));
            setter(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, path)
        )
      );
    };

    bindCollection<Task>('tasks', setFsTasks);
    bindCollection<Goal>('goals', setFsGoals);
    bindCollection<Routine>('routines', setFsRoutines);
    bindCollection<ScheduleBlock>('scheduleBlocks', setFsBlocks);
    bindCollection<PlanVersion>('planVersions', setFsPlanVersions);
    bindCollection<FocusSession>('focusSessions', setFsFocusSessions);
    bindCollection<ActivityLog>('activities', setFsActivities);
    bindCollection<SimulationRecord>('simulations', setFsSimulations);

    const planPath = `users/${uid}/plans/active`;
    unsubs.push(
      onSnapshot(
        doc(db, 'users', uid, 'plans', 'active'),
        (snap) => {
          if (snap.exists()) {
            setFsPlan({ ...(snap.data() as Plan), id: snap.id });
          } else {
            setFsPlan(null);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, planPath)
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, user, isDemoMode]);

  const profile = isDemoMode ? demoState.profile : fsProfile;
  const tasks = isDemoMode ? demoState.tasks : fsTasks;
  const routines = isDemoMode ? demoState.routines : fsRoutines;
  const scheduleBlocks = isDemoMode ? demoState.scheduleBlocks : fsBlocks;
  const plan = isDemoMode ? demoState.plan : fsPlan;
  const planVersions = isDemoMode ? demoState.planVersions : fsPlanVersions;
  const focusSessions = isDemoMode ? demoState.focusSessions : fsFocusSessions;
  const activities = isDemoMode ? demoState.activities : fsActivities;
  const simulations = isDemoMode ? demoState.simulations : fsSimulations;

  // Deterministically compute goal progress from linked tasks & milestones
  const goals = useMemo(() => {
    const rawGoals = isDemoMode ? demoState.goals : fsGoals;
    return rawGoals.map((g) => {
      const linked = tasks.filter((t) => t.goalId === g.id);
      return {
        ...g,
        progressPercent: computeGoalProgressPercent(g, linked),
      };
    });
  }, [isDemoMode, demoState.goals, fsGoals, tasks]);

  // Synchronize `<html class="dark">` with active theme
  useEffect(() => {
    const activeTheme = profile?.theme || 'dark';
    const root = document.documentElement;
    if (activeTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [profile?.theme]);

  // Compute live schedule evaluation (unscheduled tasks & conflicts)
  const liveEval = useMemo(() => {
    if (!profile) {
      return { conflicts: [] as ScheduleConflict[], unscheduledTasks: [] as UnscheduledTaskReport[] };
    }
    const todayKey = formatDateKeyInTz(Date.now(), profile.timezone);
    const horizonEnd = plan?.horizonEnd || addCalendarDays(todayKey, 6);
    const res = generateDeterministicSchedule({
      userId: profile.userId,
      planId: plan?.id || 'active',
      scheduleVersion: plan?.currentVersion || 1,
      profile,
      tasks,
      routines,
      existingBlocks: scheduleBlocks,
      horizonStartDate: plan?.horizonStart || todayKey,
      horizonEndDate: horizonEnd,
      cutoffIso: new Date().toISOString(),
    });
    return {
      conflicts: res.conflicts,
      unscheduledTasks: res.unscheduledTasks,
    };
  }, [profile, tasks, routines, scheduleBlocks, plan]);

  const authenticatedFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const headers = new Headers(options.headers || {});
      headers.set('Content-Type', 'application/json');
      if (isDemoMode) {
        headers.set('x-lifeos-demo', 'true');
      } else if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        headers.set('Authorization', `Bearer ${token}`);
      }
      return fetch(url, {
        ...options,
        headers,
      });
    },
    [isDemoMode]
  );

  const loginWithGoogle = useCallback(async () => {
    try {
      setIsBusy(true);
      await signInWithGoogle();
      setIsDemoMode(false);
      showToast('Signed in with Google.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Google Sign-In failed.', 'error');
    } finally {
      setIsBusy(false);
    }
  }, [showToast]);

  const enterStudentDemoMode = useCallback(() => {
    setIsDemoMode(true);
    showToast('Entered isolated Student Demo Workspace.', 'info');
  }, [showToast]);

  const resetStudentDemoData = useCallback(() => {
    const fresh = createInitialDemoState();
    setDemoState(fresh);
    setActivePreview(null);
    showToast('Reset Student Demo Workspace to initial scenario.', 'success');
  }, [showToast]);

  const logout = useCallback(async () => {
    if (isDemoMode) {
      setIsDemoMode(false);
      showToast('Exited Demo Mode.', 'info');
      return;
    }
    await signOutUser();
    showToast('Signed out.', 'info');
  }, [isDemoMode, showToast]);

  const saveProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!profile) return;
      const nowIso = new Date().toISOString();
      const updated: UserProfile = {
        ...profile,
        ...updates,
        userId: profile.userId,
        updatedAt: nowIso,
      };
      if (isDemoMode) {
        setDemoState((prev) => ({ ...prev, profile: updated }));
        showToast('Preferences saved.', 'success');
        return;
      }
      const path = `users/${profile.userId}`;
      try {
        await setDoc(doc(db, 'users', profile.userId), updated);
        showToast('Preferences saved.', 'success');
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [profile, isDemoMode, showToast]
  );

  const toggleTheme = useCallback(async () => {
    if (!profile) return;
    const nextTheme = profile.theme === 'dark' ? 'light' : 'dark';
    await saveProfile({ theme: nextTheme });
  }, [profile, saveProfile]);

  const logActivity = useCallback(
    async (action: string, targetId: string, summary: string) => {
      if (!profile) return;
      const nowIso = new Date().toISOString();
      const act: ActivityLog = {
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: profile.userId,
        action,
        targetId,
        summary: summary.slice(0, 500),
        createdAt: nowIso,
      };
      if (isDemoMode) {
        setDemoState((prev) => ({
          ...prev,
          activities: [act, ...prev.activities].slice(0, 100),
        }));
        return;
      }
      const path = `users/${profile.userId}/activities/${act.id}`;
      try {
        const { id, ...data } = act;
        await setDoc(doc(db, 'users', profile.userId, 'activities', id), data);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [profile, isDemoMode]
  );

  // Task CRUD
  const saveTask = useCallback(
    async (
      taskInput: Omit<Task, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<Task> => {
      if (!profile) throw new Error('Profile not ready');
      const nowIso = new Date().toISOString();
      const existing = taskInput.id ? tasks.find((t) => t.id === taskInput.id) : undefined;
      const taskId = existing?.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      const cleanTask: Task = {
        ...taskInput,
        id: taskId,
        userId: profile.userId,
        title: taskInput.title.trim().slice(0, 200),
        description: (taskInput.description || '').slice(0, 2000),
        estimatedMinutes: Math.max(5, Math.min(1440, Math.round(taskInput.estimatedMinutes))),
        actualMinutes: Math.max(0, Math.round(taskInput.actualMinutes || 0)),
        remainingMinutes: Math.max(0, Math.min(1440, Math.round(taskInput.remainingMinutes))),
        minSessionMinutes: Math.max(
          5,
          Math.min(480, Math.round(taskInput.minSessionMinutes || 25))
        ),
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      if (isDemoMode) {
        setDemoState((prev) => {
          const filtered = prev.tasks.filter((t) => t.id !== taskId);
          return { ...prev, tasks: [cleanTask, ...filtered] };
        });
        await logActivity(existing ? 'task_updated' : 'task_created', taskId, `${existing ? 'Updated' : 'Created'} task "${cleanTask.title}"`);
        showToast(`Task "${cleanTask.title}" saved.`, 'success');
        return cleanTask;
      }

      const path = `users/${profile.userId}/tasks/${taskId}`;
      try {
        const { id, ...docData } = cleanTask;
        const sanitized = Object.fromEntries(
          Object.entries(docData).filter(([_, v]) => v !== undefined && v !== '')
        );
        await setDoc(doc(db, 'users', profile.userId, 'tasks', taskId), sanitized);
        await logActivity(existing ? 'task_updated' : 'task_created', taskId, `${existing ? 'Updated' : 'Created'} task "${cleanTask.title}"`);
        showToast(`Task "${cleanTask.title}" saved.`, 'success');
        return cleanTask;
      } catch (err) {
        handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, path);
      }
    },
    [profile, tasks, isDemoMode, logActivity, showToast]
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      if (!profile) return;
      const target = tasks.find((t) => t.id === taskId);
      if (isDemoMode) {
        setDemoState((prev) => ({
          ...prev,
          tasks: prev.tasks.filter((t) => t.id !== taskId),
          scheduleBlocks: prev.scheduleBlocks.filter((b) => b.taskId !== taskId),
        }));
        showToast(`Deleted task "${target?.title || taskId}".`, 'info');
        return;
      }
      const path = `users/${profile.userId}/tasks/${taskId}`;
      try {
        await deleteDoc(doc(db, 'users', profile.userId, 'tasks', taskId));
        for (const blk of scheduleBlocks.filter((b) => b.taskId === taskId)) {
          await deleteDoc(doc(db, 'users', profile.userId, 'scheduleBlocks', blk.id));
        }
        await logActivity('task_deleted', taskId, `Deleted task "${target?.title || taskId}"`);
        showToast(`Deleted task "${target?.title || taskId}".`, 'info');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [profile, tasks, scheduleBlocks, isDemoMode, logActivity, showToast]
  );

  const toggleTaskComplete = useCallback(
    async (taskId: string) => {
      const target = tasks.find((t) => t.id === taskId);
      if (!target || !profile) return;
      const isNowComplete = target.status !== 'complete';
      const nowIso = new Date().toISOString();

      const updated: Task = {
        ...target,
        status: isNowComplete ? 'complete' : 'inbox',
        remainingMinutes: isNowComplete ? 0 : target.estimatedMinutes,
        completedAt: isNowComplete ? nowIso : undefined,
        updatedAt: nowIso,
      };

      await saveTask(updated);

      // Update associated scheduleBlocks status
      if (isDemoMode) {
        setDemoState((prev) => ({
          ...prev,
          scheduleBlocks: prev.scheduleBlocks.map((b) =>
            b.taskId === taskId
              ? { ...b, status: isNowComplete ? 'completed' : 'planned', updatedAt: nowIso }
              : b
          ),
        }));
      } else {
        for (const blk of scheduleBlocks.filter((b) => b.taskId === taskId)) {
          const { id, ...rest } = blk;
          await setDoc(doc(db, 'users', profile.userId, 'scheduleBlocks', id), {
            ...rest,
            status: isNowComplete ? 'completed' : 'planned',
            updatedAt: nowIso,
          });
        }
      }
    },
    [tasks, profile, saveTask, isDemoMode, scheduleBlocks]
  );

  const duplicateTask = useCallback(
    async (taskId: string) => {
      const target = tasks.find((t) => t.id === taskId);
      if (!target) return;
      const { id, userId, createdAt, updatedAt, completedAt, ...rest } = target;
      await saveTask({
        ...rest,
        title: `${target.title} (Copy)`,
        status: 'inbox',
        actualMinutes: 0,
        remainingMinutes: target.estimatedMinutes,
      });
    },
    [tasks, saveTask]
  );

  // Goal CRUD
  const saveGoal = useCallback(
    async (
      goalInput: Omit<Goal, 'id' | 'userId' | 'progressPercent' | 'createdAt' | 'updatedAt'> & {
        id?: string;
      }
    ) => {
      if (!profile) return;
      const nowIso = new Date().toISOString();
      const existing = goalInput.id ? goals.find((g) => g.id === goalInput.id) : undefined;
      const goalId = existing?.id || `goal_${Date.now()}`;
      const linked = tasks.filter((t) => t.goalId === goalId);

      const tempGoal: Goal = {
        ...goalInput,
        id: goalId,
        userId: profile.userId,
        title: goalInput.title.trim().slice(0, 200),
        description: (goalInput.description || '').slice(0, 2000),
        milestones: (goalInput.milestones || []).slice(0, 25),
        progressPercent: 0,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
      };
      tempGoal.progressPercent = computeGoalProgressPercent(tempGoal, linked);

      if (isDemoMode) {
        setDemoState((prev) => ({
          ...prev,
          goals: [tempGoal, ...prev.goals.filter((g) => g.id !== goalId)],
        }));
        showToast(`Goal "${tempGoal.title}" saved.`, 'success');
        return;
      }

      const path = `users/${profile.userId}/goals/${goalId}`;
      try {
        const { id, ...docData } = tempGoal;
        await setDoc(doc(db, 'users', profile.userId, 'goals', goalId), docData);
        showToast(`Goal "${tempGoal.title}" saved.`, 'success');
      } catch (err) {
        handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, path);
      }
    },
    [profile, goals, tasks, isDemoMode, showToast]
  );

  const deleteGoal = useCallback(
    async (goalId: string) => {
      if (!profile) return;
      if (isDemoMode) {
        setDemoState((prev) => ({
          ...prev,
          goals: prev.goals.filter((g) => g.id !== goalId),
        }));
        showToast('Goal deleted.', 'info');
        return;
      }
      const path = `users/${profile.userId}/goals/${goalId}`;
      try {
        await deleteDoc(doc(db, 'users', profile.userId, 'goals', goalId));
        showToast('Goal deleted.', 'info');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [profile, isDemoMode, showToast]
  );

  const toggleGoalMilestone = useCallback(
    async (goalId: string, milestoneId: string) => {
      const target = goals.find((g) => g.id === goalId);
      if (!target) return;
      const updatedMilestones = target.milestones.map((m) =>
        m.id === milestoneId ? { ...m, completed: !m.completed } : m
      );
      await saveGoal({
        ...target,
        milestones: updatedMilestones,
      });
    },
    [goals, saveGoal]
  );

  // Routine CRUD
  const saveRoutine = useCallback(
    async (
      routineInput: Omit<Routine, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: string }
    ) => {
      if (!profile) return;
      const nowIso = new Date().toISOString();
      const existing = routineInput.id
        ? routines.find((r) => r.id === routineInput.id)
        : undefined;
      const routineId = existing?.id || `rt_${Date.now()}`;

      const cleanRoutine: Routine = {
        ...routineInput,
        id: routineId,
        userId: profile.userId,
        title: routineInput.title.trim().slice(0, 200),
        durationMinutes: Math.max(5, Math.min(720, Math.round(routineInput.durationMinutes))),
        intervalDays: Math.max(1, Math.min(90, Math.round(routineInput.intervalDays || 1))),
        skippedDates: (routineInput.skippedDates || []).slice(0, 365),
        overridesJson: (routineInput.overridesJson || '{}').slice(0, 10000),
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      if (isDemoMode) {
        setDemoState((prev) => ({
          ...prev,
          routines: [cleanRoutine, ...prev.routines.filter((r) => r.id !== routineId)],
        }));
        showToast(`Routine "${cleanRoutine.title}" saved.`, 'success');
        return;
      }

      const path = `users/${profile.userId}/routines/${routineId}`;
      try {
        const { id, ...docData } = cleanRoutine;
        const sanitized = Object.fromEntries(
          Object.entries(docData).filter(([_, v]) => v !== undefined && v !== '')
        );
        await setDoc(doc(db, 'users', profile.userId, 'routines', routineId), sanitized);
        showToast(`Routine "${cleanRoutine.title}" saved.`, 'success');
      } catch (err) {
        handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, path);
      }
    },
    [profile, routines, isDemoMode, showToast]
  );

  const deleteRoutine = useCallback(
    async (routineId: string) => {
      if (!profile) return;
      if (isDemoMode) {
        setDemoState((prev) => ({
          ...prev,
          routines: prev.routines.filter((r) => r.id !== routineId),
          scheduleBlocks: prev.scheduleBlocks.filter((b) => b.routineId !== routineId),
        }));
        showToast('Routine deleted.', 'info');
        return;
      }
      const path = `users/${profile.userId}/routines/${routineId}`;
      try {
        await deleteDoc(doc(db, 'users', profile.userId, 'routines', routineId));
        showToast('Routine deleted.', 'info');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [profile, isDemoMode, showToast]
  );

  const skipRoutineOccurrence = useCallback(
    async (routineId: string, dateKey: string) => {
      const rt = routines.find((r) => r.id === routineId);
      if (!rt) return;
      const skipped = Array.from(new Set([...(rt.skippedDates || []), dateKey]));
      await saveRoutine({ ...rt, skippedDates: skipped });
      showToast(`Skipped "${rt.title}" on ${dateKey} without modifying other occurrences.`, 'info');
    },
    [routines, saveRoutine, showToast]
  );

  const overrideRoutineOccurrence = useCallback(
    async (
      routineId: string,
      dateKey: string,
      override: {
        title?: string;
        preferredStartHHmm?: string;
        preferredEndHHmm?: string;
        durationMinutes?: number;
        isFixed?: boolean;
      }
    ) => {
      const rt = routines.find((r) => r.id === routineId);
      if (!rt) return;
      let parsed: Record<string, any> = {};
      try {
        parsed = JSON.parse(rt.overridesJson || '{}');
      } catch {
        parsed = {};
      }
      parsed[dateKey] = {
        ...(parsed[dateKey] || {}),
        dateKey,
        ...override,
      };
      await saveRoutine({
        ...rt,
        overridesJson: JSON.stringify(parsed),
      });
      showToast(`Updated single occurrence of "${rt.title}" on ${dateKey}.`, 'success');
    },
    [routines, saveRoutine, showToast]
  );

  const restoreRoutineOccurrences = useCallback(
    async (routineId: string) => {
      const rt = routines.find((r) => r.id === routineId);
      if (!rt) return;
      await saveRoutine({ ...rt, skippedDates: [], overridesJson: '{}' });
      showToast(`Restored all occurrences for "${rt.title}".`, 'success');
    },
    [routines, saveRoutine, showToast]
  );

  // Schedule Generation via Server Endpoint
  const generateScheduleForHorizon = useCallback(
    async (days = 7) => {
      if (!profile) return;
      setIsBusy(true);
      try {
        const todayKey = formatDateKeyInTz(Date.now(), profile.timezone);
        const endKey = addCalendarDays(todayKey, Math.max(0, days - 1));
        const cutoffIso = new Date().toISOString();

        const resp = await authenticatedFetch('/api/plans/generate', {
          method: 'POST',
          body: JSON.stringify({
            planId: 'active',
            profile,
            tasks,
            routines,
            existingBlocks: scheduleBlocks,
            horizonStartDate: todayKey,
            horizonEndDate: endKey,
            cutoffIso,
            baseVersion: plan?.currentVersion ?? null,
          }),
        });

        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data.error || 'Failed to generate schedule');
        }

        const resultBlocks: ScheduleBlock[] = data.scheduleResult.blocks;
        const nextVer: number = data.version;
        setLastComputeTimeMs(data.scheduleResult.computeTimeMs || 5);

        if (isDemoMode) {
          const nowIso = new Date().toISOString();
          const newPlanVersion: PlanVersion = {
            id: `v_${nextVer}`,
            userId: profile.userId,
            planId: 'active',
            version: nextVer,
            parentVersion: plan?.currentVersion || 0,
            reason: `Generated ${days}-day schedule (${todayKey} to ${endKey})`,
            blockCount: resultBlocks.length,
            chunkCount: 1,
            summaryText: `Scheduled ${resultBlocks.length} blocks (${data.scheduleResult.unscheduledTasks.length} unscheduled).`,
            serverValidated: true,
            createdAt: nowIso,
          };
          setDemoState((prev) => ({
            ...prev,
            scheduleBlocks: resultBlocks,
            plan: data.plan,
            planVersions: [newPlanVersion, ...prev.planVersions],
            versionSnapshots: {
              ...prev.versionSnapshots,
              [nextVer]: resultBlocks,
            },
            activities: [
              {
                id: `act_${Date.now()}`,
                userId: profile.userId,
                action: 'plan_generated',
                targetId: `v_${nextVer}`,
                summary: `Generated ${days}-day schedule (v${nextVer}, ${resultBlocks.length} blocks)`,
                createdAt: nowIso,
              },
              ...prev.activities,
            ],
          }));
        }

        showToast(
          `Generated v${nextVer} schedule: ${resultBlocks.length} blocks placed (${data.scheduleResult.unscheduledTasks.length} unscheduled).`,
          data.scheduleResult.unscheduledTasks.length > 0 ? 'info' : 'success'
        );
      } catch (err: any) {
        showToast(err.message || 'Schedule generation failed.', 'error');
      } finally {
        setIsBusy(false);
      }
    },
    [profile, tasks, routines, scheduleBlocks, plan, authenticatedFetch, isDemoMode, showToast]
  );

  // Interactive Time Canvas block move / resize / lock with collision & sleep constraint validation
  const updateScheduleBlock = useCallback(
    async (blockId: string, updates: Partial<ScheduleBlock>): Promise<boolean> => {
      if (!profile) return false;
      const target = scheduleBlocks.find((b) => b.id === blockId);
      if (!target) return false;

      const candidate: ScheduleBlock = {
        ...target,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      const sMs = Date.parse(candidate.startAt);
      const eMs = Date.parse(candidate.endAt);
      if (isNaN(sMs) || isNaN(eMs) || eMs <= sMs) {
        showToast('Invalid start or end time.', 'error');
        return false;
      }

      candidate.durationMinutes = Math.round((eMs - sMs) / 60000);
      candidate.dateKey = formatDateKeyInTz(sMs, profile.timezone);

      // Check for collisions with other non-break blocks
      const colliding = scheduleBlocks.find((other) => {
        if (other.id === blockId || other.blockType === 'break') return false;
        const oStart = Date.parse(other.startAt);
        const oEnd = Date.parse(other.endAt);
        return sMs < oEnd && eMs > oStart;
      });

      if (colliding) {
        showToast(
          `Collision detected with "${colliding.title}". Move rejected to preserve schedule integrity.`,
          'error'
        );
        return false;
      }

      // Check task deadline if linked to a task
      if (candidate.taskId) {
        const linkedTask = tasks.find((t) => t.id === candidate.taskId);
        if (linkedTask?.dueAt && eMs > Date.parse(linkedTask.dueAt)) {
          showToast(
            `Cannot move "${candidate.title}" past its hard deadline (${new Date(
              linkedTask.dueAt
            ).toLocaleString()}).`,
            'error'
          );
          return false;
        }
        if (linkedTask?.earliestStartAt && sMs < Date.parse(linkedTask.earliestStartAt)) {
          showToast(
            `Cannot schedule "${candidate.title}" before its earliest permitted start.`,
            'error'
          );
          return false;
        }
      }

      if (isDemoMode) {
        setDemoState((prev) => ({
          ...prev,
          scheduleBlocks: prev.scheduleBlocks.map((b) => (b.id === blockId ? candidate : b)),
        }));
        showToast(`Updated "${candidate.title}".`, 'success');
        return true;
      }

      const path = `users/${profile.userId}/scheduleBlocks/${blockId}`;
      try {
        const { id, ...docData } = candidate;
        const sanitized = Object.fromEntries(
          Object.entries(docData).filter(([_, v]) => v !== undefined && v !== '')
        );
        await setDoc(doc(db, 'users', profile.userId, 'scheduleBlocks', blockId), sanitized);
        showToast(`Updated "${candidate.title}".`, 'success');
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [profile, scheduleBlocks, tasks, isDemoMode, showToast]
  );

  const deleteScheduleBlock = useCallback(
    async (blockId: string) => {
      if (!profile) return;
      if (isDemoMode) {
        setDemoState((prev) => ({
          ...prev,
          scheduleBlocks: prev.scheduleBlocks.filter((b) => b.id !== blockId),
        }));
        showToast('Removed block from timeline.', 'info');
        return;
      }
      const path = `users/${profile.userId}/scheduleBlocks/${blockId}`;
      try {
        await deleteDoc(doc(db, 'users', profile.userId, 'scheduleBlocks', blockId));
        showToast('Removed block from timeline.', 'info');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [profile, isDemoMode, showToast]
  );

  // Reality Shift Preview (Never mutates live schedule)
  const runRealityShiftPreview = useCallback(
    async (changeSpec: RealityShiftChangeSpec): Promise<ReplanPreviewResult> => {
      if (!profile) throw new Error('Profile not initialized');
      setIsBusy(true);
      try {
        const todayKey = formatDateKeyInTz(Date.now(), profile.timezone);
        const horizonStartDate = plan?.horizonStart || todayKey;
        const horizonEndDate = plan?.horizonEnd || addCalendarDays(todayKey, 6);

        const resp = await authenticatedFetch('/api/plans/preview-replan', {
          method: 'POST',
          body: JSON.stringify({
            planId: plan?.id || 'active',
            baseVersion: plan?.currentVersion || 1,
            profile,
            tasks,
            routines,
            currentBlocks: scheduleBlocks,
            horizonStartDate,
            horizonEndDate,
            cutoffIso: new Date().toISOString(),
            changeSpec,
          }),
        });

        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data.error || 'Failed to compute Reality Shift preview');
        }

        const preview = data.preview as ReplanPreviewResult;
        setActivePreview(preview);
        setLastComputeTimeMs(preview.computeTimeMs || 5);
        return preview;
      } finally {
        setIsBusy(false);
      }
    },
    [profile, plan, tasks, routines, scheduleBlocks, authenticatedFetch]
  );

  // Reality Shift Apply (Server-validated version transition)
  const applyRealityShiftPreview = useCallback(
    async (preview: ReplanPreviewResult) => {
      if (!profile) return;
      const currentVer = plan?.currentVersion || 1;
      if (preview.baseVersion !== currentVer) {
        showToast(
          `Stale preview detected (computed on v${preview.baseVersion}, active is v${currentVer}). Please recalculate preview.`,
          'error'
        );
        return;
      }

      setIsBusy(true);
      try {
        const todayKey = formatDateKeyInTz(Date.now(), profile.timezone);
        const horizonStartDate = plan?.horizonStart || todayKey;
        const horizonEndDate = plan?.horizonEnd || addCalendarDays(todayKey, 6);

        const resp = await authenticatedFetch('/api/plans/apply-replan', {
          method: 'POST',
          body: JSON.stringify({
            planId: plan?.id || 'active',
            baseVersion: preview.baseVersion,
            horizonStartDate,
            horizonEndDate,
            reason: `Reality Shift: ${preview.changeSpec.summary}`,
            summaryText: preview.summaryText,
            afterBlocks: preview.afterBlocks,
          }),
        });

        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data.error || 'Failed to apply Reality Shift replan');
        }

        const nextVer: number = data.version;

        if (isDemoMode) {
          const nowIso = new Date().toISOString();
          const newPv: PlanVersion = {
            id: `v_${nextVer}`,
            userId: profile.userId,
            planId: 'active',
            version: nextVer,
            parentVersion: preview.baseVersion,
            reason: `Reality Shift: ${preview.changeSpec.summary}`,
            blockCount: preview.afterBlocks.length,
            chunkCount: 1,
            summaryText: preview.summaryText,
            serverValidated: true,
            createdAt: nowIso,
          };
          setDemoState((prev) => ({
            ...prev,
            scheduleBlocks: preview.afterBlocks.map((b) => ({
              ...b,
              scheduleVersion: nextVer,
            })),
            plan: data.plan,
            planVersions: [newPv, ...prev.planVersions],
            versionSnapshots: {
              ...prev.versionSnapshots,
              [nextVer]: preview.afterBlocks,
            },
            activities: [
              {
                id: `act_${Date.now()}`,
                userId: profile.userId,
                action: 'reality_shift_applied',
                targetId: `v_${nextVer}`,
                summary: `Applied Reality Shift v${nextVer}: ${preview.changeSpec.summary}`,
                createdAt: nowIso,
              },
              ...prev.activities,
            ],
          }));
        }

        setActivePreview(null);
        showToast(`Approved & committed Plan v${nextVer}.`, 'success');
      } catch (err: any) {
        showToast(err.message || 'Could not apply replan.', 'error');
      } finally {
        setIsBusy(false);
      }
    },
    [profile, plan, authenticatedFetch, isDemoMode, showToast]
  );

  // Undo Last Plan Version (Server-validated rollback)
  const undoLastPlanVersion = useCallback(async () => {
    if (!profile || !plan || plan.currentVersion <= 1) {
      showToast('No previous schedule version available to undo.', 'info');
      return;
    }

    setIsBusy(true);
    try {
      const targetVer = plan.currentVersion - 1;
      const fallbackBlocks = isDemoMode ? demoState.versionSnapshots[targetVer] || [] : [];

      const resp = await authenticatedFetch('/api/plans/undo', {
        method: 'POST',
        body: JSON.stringify({
          planId: plan.id,
          currentVersion: plan.currentVersion,
          targetVersion: targetVer,
          fallbackBlocks,
          horizonStartDate: plan.horizonStart,
          horizonEndDate: plan.horizonEnd,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Undo failed');
      }

      const nextVer: number = data.version;
      const restored: ScheduleBlock[] = data.restoredBlocks || fallbackBlocks;

      if (isDemoMode) {
        const nowIso = new Date().toISOString();
        setDemoState((prev) => ({
          ...prev,
          scheduleBlocks: restored.map((b) => ({ ...b, scheduleVersion: nextVer })),
          plan: data.plan,
          planVersions: [
            {
              id: `v_${nextVer}`,
              userId: profile.userId,
              planId: 'active',
              version: nextVer,
              parentVersion: plan.currentVersion,
              reason: `Undo: Restored schedule state from v${targetVer}`,
              blockCount: restored.length,
              chunkCount: 1,
              summaryText: `Restored ${restored.length} blocks from v${targetVer}.`,
              serverValidated: true,
              createdAt: nowIso,
            },
            ...prev.planVersions,
          ],
          versionSnapshots: {
            ...prev.versionSnapshots,
            [nextVer]: restored,
          },
          activities: [
            {
              id: `act_${Date.now()}`,
              userId: profile.userId,
              action: 'plan_undone',
              targetId: `v_${nextVer}`,
              summary: `Undid changes and restored schedule snapshot from v${targetVer}`,
              createdAt: nowIso,
            },
            ...prev.activities,
          ],
        }));
      }

      setActivePreview(null);
      showToast(`Restored schedule state from v${targetVer} (now at v${nextVer}).`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Undo failed.', 'error');
    } finally {
      setIsBusy(false);
    }
  }, [profile, plan, isDemoMode, demoState.versionSnapshots, authenticatedFetch, showToast]);

  // What-If Simulator (Isolated Sandbox)
  const runWhatIfSimulation = useCallback(
    async (title: string, changeSpec: RealityShiftChangeSpec): Promise<ReplanPreviewResult> => {
      if (!profile) throw new Error('Profile not ready');
      setIsBusy(true);
      try {
        const todayKey = formatDateKeyInTz(Date.now(), profile.timezone);
        const resp = await authenticatedFetch('/api/simulations/run', {
          method: 'POST',
          body: JSON.stringify({
            baseVersion: plan?.currentVersion || 1,
            profile,
            tasks,
            routines,
            currentBlocks: scheduleBlocks,
            horizonStartDate: plan?.horizonStart || todayKey,
            horizonEndDate: plan?.horizonEnd || addCalendarDays(todayKey, 6),
            cutoffIso: new Date().toISOString(),
            changeSpec,
          }),
        });

        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data.error || 'Simulation failed');
        }

        const simResult = data.simulation as ReplanPreviewResult;
        const nowIso = new Date().toISOString();
        const simRecord: SimulationRecord = {
          id: `sim_${Date.now()}`,
          userId: profile.userId,
          title: title.slice(0, 200),
          baseVersion: simResult.baseVersion,
          scenarioType: changeSpec.scenarioType,
          summaryText: simResult.summaryText.slice(0, 2000),
          scheduledCount: simResult.afterBlocks.filter((b) => b.blockType !== 'break').length,
          unscheduledCount: simResult.unscheduledTasks.length,
          conflictCount: simResult.conflicts.length,
          createdAt: nowIso,
        };

        if (isDemoMode) {
          setDemoState((prev) => ({
            ...prev,
            simulations: [simRecord, ...prev.simulations].slice(0, 25),
          }));
        } else {
          const { id, ...docData } = simRecord;
          await setDoc(doc(db, 'users', profile.userId, 'simulations', id), docData);
        }

        return simResult;
      } finally {
        setIsBusy(false);
      }
    },
    [profile, plan, tasks, routines, scheduleBlocks, authenticatedFetch, isDemoMode]
  );

  // Focus Session Execution Tracking (Single active session guard + timestamp accuracy)
  const activeFocusSession = useMemo(
    () => focusSessions.find((s) => s.status === 'running' || s.status === 'paused') || null,
    [focusSessions]
  );

  const startFocusSession = useCallback(
    async (taskId: string, plannedMinutes?: number) => {
      if (!profile) return;
      if (activeFocusSession) {
        showToast(
          `A focus session for "${activeFocusSession.taskTitle}" is already active. Complete or stop it first.`,
          'error'
        );
        return;
      }
      const targetTask = tasks.find((t) => t.id === taskId);
      if (!targetTask) return;

      const nowIso = new Date().toISOString();
      const newSession: FocusSession = {
        id: `fs_${Date.now()}`,
        userId: profile.userId,
        taskId: targetTask.id,
        taskTitle: targetTask.title,
        status: 'running',
        plannedMinutes: plannedMinutes || Math.min(60, Math.max(15, targetTask.remainingMinutes || targetTask.estimatedMinutes)),
        startedAt: nowIso,
        lastResumedAt: nowIso,
        accumulatedSeconds: 0,
        notes: '',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      if (isDemoMode) {
        setDemoState((prev) => ({
          ...prev,
          focusSessions: [newSession, ...prev.focusSessions],
        }));
      } else {
        const { id, ...docData } = newSession;
        await setDoc(doc(db, 'users', profile.userId, 'focusSessions', id), docData);
      }
      showToast(`Focus timer started for "${targetTask.title}".`, 'info');
    },
    [profile, activeFocusSession, tasks, isDemoMode, showToast]
  );

  const pauseFocusSession = useCallback(async () => {
    if (!profile || !activeFocusSession || activeFocusSession.status !== 'running') return;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const totalElapsed = computeFocusElapsedSeconds(activeFocusSession, nowMs);

    const updated: FocusSession = {
      ...activeFocusSession,
      status: 'paused',
      accumulatedSeconds: totalElapsed,
      lastResumedAt: undefined,
      updatedAt: nowIso,
    };

    if (isDemoMode) {
      setDemoState((prev) => ({
        ...prev,
        focusSessions: prev.focusSessions.map((s) => (s.id === updated.id ? updated : s)),
      }));
      return;
    }

    const { id, lastResumedAt, ...docData } = updated;
    await setDoc(doc(db, 'users', profile.userId, 'focusSessions', id), docData);
  }, [profile, activeFocusSession, isDemoMode]);

  const resumeFocusSession = useCallback(async () => {
    if (!profile || !activeFocusSession || activeFocusSession.status !== 'paused') return;
    const nowIso = new Date().toISOString();
    const updated: FocusSession = {
      ...activeFocusSession,
      status: 'running',
      lastResumedAt: nowIso,
      updatedAt: nowIso,
    };

    if (isDemoMode) {
      setDemoState((prev) => ({
        ...prev,
        focusSessions: prev.focusSessions.map((s) => (s.id === updated.id ? updated : s)),
      }));
      return;
    }

    const { id, ...docData } = updated;
    await setDoc(doc(db, 'users', profile.userId, 'focusSessions', id), docData);
  }, [profile, activeFocusSession, isDemoMode]);

  const finishFocusSession = useCallback(
    async (markTaskComplete: boolean, notes = '', overrideMinutes?: number) => {
      if (!profile || !activeFocusSession) return;
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const computedSeconds = computeFocusElapsedSeconds(activeFocusSession, nowMs);
      const finalSeconds =
        overrideMinutes !== undefined && overrideMinutes >= 0
          ? Math.round(overrideMinutes * 60)
          : Math.max(60, computedSeconds);

      const finishedSession: FocusSession = {
        ...activeFocusSession,
        status: 'completed',
        accumulatedSeconds: finalSeconds,
        endedAt: nowIso,
        notes: notes.slice(0, 1000),
        updatedAt: nowIso,
      };
      delete finishedSession.lastResumedAt;

      const targetTask = tasks.find((t) => t.id === activeFocusSession.taskId);
      let updatedTask: Task | null = null;
      if (targetTask) {
        updatedTask = applyFocusEffortToTask(targetTask, finalSeconds, markTaskComplete, nowIso);
      }

      if (isDemoMode) {
        setDemoState((prev) => ({
          ...prev,
          focusSessions: prev.focusSessions.map((s) =>
            s.id === finishedSession.id ? finishedSession : s
          ),
          tasks: updatedTask
            ? prev.tasks.map((t) => (t.id === updatedTask!.id ? updatedTask! : t))
            : prev.tasks,
        }));
      } else {
        const { id, ...docData } = finishedSession;
        const cleanSession = Object.fromEntries(
          Object.entries(docData).filter(([_, v]) => v !== undefined)
        );
        await setDoc(doc(db, 'users', profile.userId, 'focusSessions', id), cleanSession);
        if (updatedTask) {
          await saveTask(updatedTask);
        }
      }

      const loggedMins = Math.round(finalSeconds / 60);
      await logActivity(
        'focus_completed',
        activeFocusSession.taskId,
        `Logged ${loggedMins}m focus session on "${activeFocusSession.taskTitle}"${
          markTaskComplete ? ' (Marked Complete)' : ' (Effort updated, task remains open)'
        }`
      );
      showToast(
        `Logged ${loggedMins}m on "${activeFocusSession.taskTitle}"${
          markTaskComplete ? ' and marked complete.' : '.'
        }`,
        'success'
      );
    },
    [profile, activeFocusSession, tasks, isDemoMode, saveTask, logActivity, showToast]
  );

  // Explicit opt-in import of the College Student Demo Scenario into an authenticated account
  const loadStudentScenarioIntoAccount = useCallback(async () => {
    if (!profile) return;
    if (isDemoMode) {
      resetStudentDemoData();
      return;
    }
    setIsBusy(true);
    try {
      const seed = buildCollegeStudentDemoScenario(profile.userId, profile.timezone, Date.now());
      const batch = writeBatch(db);

      for (const g of seed.goals) {
        const { id, ...data } = g;
        batch.set(doc(db, 'users', profile.userId, 'goals', id), data);
      }
      for (const r of seed.routines) {
        const { id, ...data } = r;
        batch.set(doc(db, 'users', profile.userId, 'routines', id), data);
      }
      for (const t of seed.tasks) {
        const { id, ...data } = t;
        const clean = Object.fromEntries(
          Object.entries(data).filter(([_, v]) => v !== undefined && v !== '')
        );
        batch.set(doc(db, 'users', profile.userId, 'tasks', id), clean);
      }

      await batch.commit();
      showToast('Imported College Student Demo Scenario into your workspace.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${profile.userId}`);
    } finally {
      setIsBusy(false);
    }
  }, [profile, isDemoMode, resetStudentDemoData, showToast]);

  const value: LifeOSContextValue = {
    user,
    authReady,
    isDemoMode,
    activeTab,
    setActiveTab,
    profile,
    tasks,
    goals,
    routines,
    scheduleBlocks,
    plan,
    planVersions,
    focusSessions,
    activities,
    simulations,
    conflicts: liveEval.conflicts,
    unscheduledTasks: liveEval.unscheduledTasks,
    lastComputeTimeMs,
    activePreview,
    setActivePreview,
    toastMessage,
    showToast,
    isBusy,
    loginWithGoogle,
    enterStudentDemoMode,
    resetStudentDemoData,
    loadStudentScenarioIntoAccount,
    logout,
    saveProfile,
    toggleTheme,
    saveTask,
    deleteTask,
    toggleTaskComplete,
    duplicateTask,
    saveGoal,
    deleteGoal,
    toggleGoalMilestone,
    saveRoutine,
    deleteRoutine,
    skipRoutineOccurrence,
    overrideRoutineOccurrence,
    restoreRoutineOccurrences,
    generateScheduleForHorizon,
    updateScheduleBlock,
    deleteScheduleBlock,
    runRealityShiftPreview,
    applyRealityShiftPreview,
    undoLastPlanVersion,
    runWhatIfSimulation,
    activeFocusSession,
    startFocusSession,
    pauseFocusSession,
    resumeFocusSession,
    finishFocusSession,
    authenticatedFetch,
  };

  return <LifeOSContext.Provider value={value}>{children}</LifeOSContext.Provider>;
}

export function useLifeOS(): LifeOSContextValue {
  const ctx = useContext(LifeOSContext);
  if (!ctx) {
    throw new Error('useLifeOS must be used inside a LifeOSProvider');
  }
  return ctx;
}
