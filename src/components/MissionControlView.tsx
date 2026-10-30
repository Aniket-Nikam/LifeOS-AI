import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  FlaskConical,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import {
  addCalendarDays,
  formatDateKeyInTz,
  getSleepIntervalsForHorizon,
  listHorizonDates,
} from '../lib/scheduler';
import { BlockCategory } from '../types/lifeos';

const CATEGORY_BORDER_COLOR: Record<BlockCategory, string> = {
  academic: 'border-l-[#22D3EE]',
  coding: 'border-l-[#14B8A6]',
  work: 'border-l-sky-400',
  fitness: 'border-l-emerald-400',
  hobby: 'border-l-[#F59E0B]',
  personal: 'border-l-[#A78BFA]',
  break: 'border-l-slate-500',
  external: 'border-l-indigo-400',
};

export function MissionControlView({
  onQuickAddTask,
}: {
  onQuickAddTask: () => void;
}) {
  const {
    profile,
    tasks,
    goals,
    scheduleBlocks,
    conflicts,
    unscheduledTasks,
    lastComputeTimeMs,
    setActiveTab,
    generateScheduleForHorizon,
    toggleTaskComplete,
    startFocusSession,
    isBusy,
  } = useLifeOS();

  const tz = profile?.timezone || 'UTC';
  const todayKey = formatDateKeyInTz(Date.now(), tz);

  const todaysBlocks = scheduleBlocks
    .filter((b) => b.dateKey === todayKey && b.blockType !== 'break')
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  const todaysBreakBlocks = scheduleBlocks.filter(
    (b) => b.dateKey === todayKey && b.blockType === 'break'
  );

  const completedTasks = tasks.filter((t) => t.status === 'complete');
  const activeFlexibleTasks = tasks.filter(
    (t) => !t.isFixed && t.status !== 'complete' && t.status !== 'archived' && t.status !== 'skipped'
  );

  const priorityTasks = [...activeFlexibleTasks]
    .sort((a, b) => {
      const rank = { critical: 4, high: 3, medium: 2, low: 1 };
      return rank[b.priority] - rank[a.priority];
    })
    .slice(0, 4);

  const remainingWorkloadMinutes = activeFlexibleTasks.reduce(
    (acc, t) => acc + (t.remainingMinutes ?? Math.max(0, t.estimatedMinutes - (t.actualMinutes || 0))),
    0
  );

  const upcomingDeadlines = tasks
    .filter((t) => t.dueAt && t.status !== 'complete')
    .sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!))
    .slice(0, 4);

  const nowMs = Date.now();
  const nextActivity =
    todaysBlocks.find((b) => b.status !== 'completed' && Date.parse(b.endAt) > nowMs) ||
    todaysBlocks[0] ||
    null;

  // Calculate today's exact capacity distribution in minutes
  const sleepIntervalsToday = profile
    ? getSleepIntervalsForHorizon([todayKey], profile.sleepStartHHmm, profile.sleepEndHHmm, tz)
    : [];
  const sleepMinutesToday = Math.min(
    600,
    sleepIntervalsToday.reduce((acc, s) => acc + Math.round((s.endMs - s.startMs) / 60000), 0) / 2
  );

  const fixedMins = todaysBlocks
    .filter((b) => b.blockType === 'fixed' || b.blockType === 'external_calendar')
    .reduce((acc, b) => acc + b.durationMinutes, 0);
  const focusWorkMins = todaysBlocks
    .filter((b) => b.blockType === 'task')
    .reduce((acc, b) => acc + b.durationMinutes, 0);
  const routineMins = todaysBlocks
    .filter((b) => b.blockType === 'routine')
    .reduce((acc, b) => acc + b.durationMinutes, 0);
  const breakMins = todaysBreakBlocks.reduce((acc, b) => acc + b.durationMinutes, 0);

  const wakingAvailableMinutes = Math.max(240, 1440 - Math.round(sleepMinutesToday));
  const totalAllocatedToday = fixedMins + focusWorkMins + routineMins + breakMins;
  const unallocatedMins = Math.max(0, wakingAvailableMinutes - totalAllocatedToday);
  const isOverCapacity = unscheduledTasks.length > 0 || totalAllocatedToday > wakingAvailableMinutes;

  const hourOfDay = new Date().getHours();
  const greetingPrefix =
    hourOfDay < 12 ? 'Good morning' : hourOfDay < 18 ? 'Good afternoon' : 'Good evening';

  const formatTimeShort = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: tz,
      }).format(new Date(iso));
    } catch {
      return iso.slice(11, 16);
    }
  };

  // 7-day weekly planning overview
  const weekDates = listHorizonDates(todayKey, addCalendarDays(todayKey, 6));
  const weeklyOverview = weekDates.map((dKey) => {
    const blocksForDay = scheduleBlocks.filter((b) => b.dateKey === dKey && b.blockType !== 'break');
    const mins = blocksForDay.reduce((acc, b) => acc + b.durationMinutes, 0);
    const [y, m, d] = dKey.split('-').map(Number);
    const shortWeekday = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: 'UTC',
    });
    return {
      dateKey: dKey,
      shortWeekday,
      dayNum: d,
      blockCount: blocksForDay.length,
      totalMinutes: mins,
    };
  });

  return (
    <div className="space-y-6">
      {/* Top Area: Command Header with Concise Day Summary & Prominent Actions */}
      <section className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722] p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500 dark:text-[#94A3B8]">
              <span className="uppercase tracking-wider text-cyan-600 dark:text-[#22D3EE] font-semibold">
                Mission Control
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{todayKey}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">Solver {lastComputeTimeMs}ms</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-[#F1F5F9]">
              {greetingPrefix}, {profile?.displayName?.split(' ')[0] || 'Builder'}.
            </h1>
            <p className="text-sm text-slate-600 dark:text-[#94A3B8] leading-relaxed">
              You have{' '}
              <span className="font-semibold text-slate-900 dark:text-[#F1F5F9] font-mono tabular-nums">
                {todaysBlocks.length}
              </span>{' '}
              scheduled activities today ({Math.floor(totalAllocatedToday / 60)}h{' '}
              {totalAllocatedToday % 60}m allocated),{' '}
              <span className="font-semibold text-teal-600 dark:text-[#14B8A6] font-mono tabular-nums">
                {Math.floor(unallocatedMins / 60)}h {unallocatedMins % 60}m
              </span>{' '}
              of open buffer, and{' '}
              <span className="font-semibold text-slate-900 dark:text-[#F1F5F9] font-mono tabular-nums">
                {activeFlexibleTasks.length}
              </span>{' '}
              active flexible tasks ({Math.floor(remainingWorkloadMinutes / 60)}h{' '}
              {remainingWorkloadMinutes % 60}m remaining effort).
            </p>
          </div>

          {/* Prominent Command Actions */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => generateScheduleForHorizon(7)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-[#22D3EE] hover:bg-[#22D3EE]/90 text-[#080C14] transition-all cursor-pointer shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
              <span>Plan My Day</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reality_shift')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border border-[#A78BFA]/45 bg-[#A78BFA]/15 hover:bg-[#A78BFA]/25 text-violet-700 dark:text-[#A78BFA] transition-all cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Reality Shift</span>
            </button>
            <button
              type="button"
              onClick={onQuickAddTask}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#161F2D] hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-[#F1F5F9] transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#22D3EE]" />
              <span>Add Task</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('simulator')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#161F2D] hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9] transition-colors cursor-pointer"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>Simulator</span>
            </button>
          </div>
        </div>

        {/* Integrated Waking Capacity & Allocation Strip */}
        <div className="mt-6 pt-5 border-t border-slate-200/80 dark:border-slate-800/80 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-600 dark:text-[#94A3B8]">
              <span className="font-semibold text-slate-900 dark:text-[#F1F5F9]">
                Today&apos;s Capacity Allocation
              </span>
              <span>·</span>
              <span className="font-mono tabular-nums">
                Sleep {profile?.sleepStartHHmm}–{profile?.sleepEndHHmm} protected
              </span>
            </div>
            <div className="font-mono tabular-nums">
              {isOverCapacity ? (
                <span className="text-[#FB7185] font-semibold">
                  Capacity Warning · {unscheduledTasks.length} unscheduled
                </span>
              ) : (
                <span className="text-[#14B8A6] font-semibold">
                  Feasible · {unallocatedMins}m available time
                </span>
              )}
            </div>
          </div>

          <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-[#080C14] overflow-hidden flex border border-slate-200/60 dark:border-slate-800">
            <div
              style={{ width: `${Math.min(100, (fixedMins / wakingAvailableMinutes) * 100)}%` }}
              className="bg-indigo-500 h-full transition-all"
              title={`Fixed Commitments: ${fixedMins}m`}
            />
            <div
              style={{ width: `${Math.min(100, (focusWorkMins / wakingAvailableMinutes) * 100)}%` }}
              className="bg-[#22D3EE] h-full transition-all"
              title={`Planned Focus Work: ${focusWorkMins}m`}
            />
            <div
              style={{ width: `${Math.min(100, (routineMins / wakingAvailableMinutes) * 100)}%` }}
              className="bg-[#14B8A6] h-full transition-all"
              title={`Routines: ${routineMins}m`}
            />
            <div
              style={{ width: `${Math.min(100, (breakMins / wakingAvailableMinutes) * 100)}%` }}
              className="bg-[#F59E0B]/80 h-full transition-all"
              title={`Recovery Breaks: ${breakMins}m`}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 text-[11px] text-slate-500 dark:text-[#94A3B8] font-mono tabular-nums">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-xs bg-indigo-500" />
                Fixed {fixedMins}m
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-xs bg-[#22D3EE]" />
                Focus {focusWorkMins}m
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-xs bg-[#14B8A6]" />
                Routines {routineMins}m
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-xs bg-[#F59E0B]" />
                Breaks {breakMins}m
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-xs bg-slate-600" />
                Available {unallocatedMins}m
              </span>
            </div>
            <span>
              Completed Tasks: {completedTasks.length} / {tasks.length}
            </span>
          </div>
        </div>
      </section>

      {/* Main Command Area: Large Today Timeline (Left 7 Cols) + Next Activity, Deadlines & Priority Tasks (Right 5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Cols: Visually Compelling Today Timeline */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722] p-6">
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-200/80 dark:border-slate-800/80">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-[#F1F5F9]">
                Today&apos;s Timeline
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                Chronological constraint-verified schedule for {todayKey}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('timeline')}
              className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 dark:text-[#22D3EE] hover:underline cursor-pointer"
            >
              <span>Full Time Canvas</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {todaysBlocks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-10 text-center space-y-3">
              <Clock className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-800 dark:text-[#F1F5F9]">
                  No activities scheduled for today yet
                </p>
                <p className="text-xs text-slate-500 dark:text-[#94A3B8] max-w-md mx-auto">
                  Click &quot;Plan My Day&quot; to run the deterministic constraint solver across
                  your tasks and routines, or add a new task first.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => generateScheduleForHorizon(7)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#22D3EE] text-[#080C14] hover:bg-[#22D3EE]/90 transition-colors cursor-pointer"
                >
                  Plan My Day
                </button>
                <button
                  type="button"
                  onClick={onQuickAddTask}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-[#F1F5F9] hover:bg-slate-100 dark:hover:bg-[#161F2D] transition-colors cursor-pointer"
                >
                  Add Task
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {todaysBlocks.map((block) => {
                const isDone = block.status === 'completed';
                const isNext = nextActivity?.id === block.id;
                const borderAccent =
                  CATEGORY_BORDER_COLOR[block.category] || 'border-l-[#22D3EE]';

                return (
                  <div
                    key={block.id}
                    className={`group rounded-lg border border-slate-200/80 dark:border-slate-800/90 border-l-4 ${borderAccent} p-3.5 flex items-center justify-between gap-4 transition-all ${
                      isNext
                        ? 'bg-cyan-500/5 dark:bg-[#161F2D]'
                        : 'bg-slate-50/50 dark:bg-[#080C14]/60 hover:bg-slate-100/70 dark:hover:bg-[#161F2D]/70'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 min-w-0 flex-1">
                      <div className="sm:w-28 shrink-0 font-mono tabular-nums text-xs flex sm:block items-center gap-2">
                        <div className="font-semibold text-slate-800 dark:text-[#F1F5F9]">
                          {formatTimeShort(block.startAt)}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                          {formatTimeShort(block.endAt)} · {block.durationMinutes}m
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-semibold truncate ${
                              isDone
                                ? 'line-through text-slate-400 dark:text-slate-500'
                                : 'text-slate-900 dark:text-[#F1F5F9]'
                            }`}
                          >
                            {block.title}
                          </span>
                          {block.locked && (
                            <Lock
                              className="w-3.5 h-3.5 text-indigo-400 shrink-0"
                              aria-label="Locked commitment"
                            />
                          )}
                          {isNext && !isDone && (
                            <span className="text-[10px] font-mono uppercase tracking-wider text-[#22D3EE] shrink-0">
                              Next
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-[#94A3B8] mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="capitalize">{block.category}</span>
                          <span>·</span>
                          <span className="capitalize">{block.priority} priority</span>
                          <span className="hidden sm:inline">·</span>
                          <span className="hidden sm:inline font-mono text-[11px] opacity-80">
                            {block.reasonCode}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {block.taskId && !isDone && (
                        <button
                          type="button"
                          onClick={() => {
                            startFocusSession(block.taskId!, block.durationMinutes);
                            setActiveTab('my_day');
                          }}
                          aria-label={`Start focus timer for ${block.title}`}
                          className="p-2 rounded-lg text-cyan-600 dark:text-[#22D3EE] hover:bg-[#22D3EE]/15 transition-colors cursor-pointer"
                          title="Start Focus Timer"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      {block.taskId && (
                        <button
                          type="button"
                          onClick={() => toggleTaskComplete(block.taskId!)}
                          aria-label={`Mark ${block.title} ${isDone ? 'incomplete' : 'complete'}`}
                          className={`p-2 rounded-lg transition-colors cursor-pointer ${
                            isDone
                              ? 'text-[#14B8A6] bg-[#14B8A6]/15'
                              : 'text-slate-400 hover:text-[#14B8A6] hover:bg-slate-800'
                          }`}
                          title={isDone ? 'Completed' : 'Mark Complete'}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right 5 Cols: Next Scheduled Activity, Upcoming Deadlines & Priority Tasks */}
        <div className="lg:col-span-5 space-y-6">
          {/* Next Scheduled Activity Spotlight */}
          <section className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722] p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-600 dark:text-[#22D3EE]">
                Up Next on Timeline
              </span>
              {nextActivity && (
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-[#94A3B8]">
                  {formatTimeShort(nextActivity.startAt)} – {formatTimeShort(nextActivity.endAt)}
                </span>
              )}
            </div>
            {nextActivity ? (
              <div className="flex items-center justify-between gap-4 mt-1">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 dark:text-[#F1F5F9] truncate">
                    {nextActivity.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-[#94A3B8] capitalize mt-0.5">
                    {nextActivity.category} · {nextActivity.durationMinutes}m · {nextActivity.priority} priority
                  </p>
                </div>
                {nextActivity.taskId && (
                  <button
                    type="button"
                    onClick={() => {
                      startFocusSession(nextActivity.taskId!, nextActivity.durationMinutes);
                      setActiveTab('my_day');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#22D3EE] hover:bg-[#22D3EE]/90 text-[#080C14] text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Start Focus</span>
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                No upcoming activities on today&apos;s timeline.
              </p>
            )}
          </section>

          {/* Upcoming Deadlines */}
          <section className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-[#F1F5F9]">
                Upcoming Deadlines
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('tasks')}
                className="text-xs text-cyan-600 dark:text-[#22D3EE] hover:underline cursor-pointer"
              >
                All Tasks ({tasks.length})
              </button>
            </div>
            {upcomingDeadlines.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                No active tasks with upcoming deadlines.
              </p>
            ) : (
              <div className="divide-y divide-slate-200/70 dark:divide-slate-800/80">
                {upcomingDeadlines.map((t) => (
                  <div key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-[#F1F5F9] truncate">
                        {t.title}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-[#94A3B8] font-mono tabular-nums mt-0.5">
                        Due{' '}
                        {new Date(t.dueAt!).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {t.remainingMinutes}m left
                      </p>
                    </div>
                    <span
                      className={`text-[11px] font-mono uppercase shrink-0 ${
                        t.priority === 'critical'
                          ? 'text-[#FB7185] font-semibold'
                          : 'text-[#F59E0B]'
                      }`}
                    >
                      {t.priority}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Priority Flexible Tasks */}
          <section className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-[#F1F5F9]">
                Priority Queue
              </h2>
              <button
                type="button"
                onClick={onQuickAddTask}
                className="text-xs text-cyan-600 dark:text-[#22D3EE] hover:underline cursor-pointer"
              >
                + New Task
              </button>
            </div>
            {priorityTasks.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                All flexible tasks are complete.
              </p>
            ) : (
              <div className="divide-y divide-slate-200/70 dark:divide-slate-800/80">
                {priorityTasks.map((t) => (
                  <div key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-[#F1F5F9] truncate">
                        {t.title}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-[#94A3B8] font-mono tabular-nums mt-0.5">
                        Est {t.estimatedMinutes}m · Rem {t.remainingMinutes}m · {t.category}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        startFocusSession(t.id, Math.min(60, t.remainingMinutes || 45));
                        setActiveTab('my_day');
                      }}
                      className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-[#161F2D] hover:bg-[#22D3EE]/20 text-xs font-medium text-slate-700 dark:text-[#22D3EE] transition-colors shrink-0 cursor-pointer"
                    >
                      Focus
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Secondary Area: Weekly Planning Overview, Goal Progress & Scheduling Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 7-Day Weekly Planning Overview */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-[#F1F5F9]">
                7-Day Planning Overview
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                Allocated workload across the active horizon
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('timeline')}
              className="text-xs text-cyan-600 dark:text-[#22D3EE] hover:underline cursor-pointer"
            >
              Weekly Grid →
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {weeklyOverview.map((day) => {
              const isToday = day.dateKey === todayKey;
              const hours = (day.totalMinutes / 60).toFixed(1);
              return (
                <div
                  key={day.dateKey}
                  className={`rounded-lg border p-2 text-center ${
                    isToday
                      ? 'border-[#22D3EE]/50 bg-[#22D3EE]/10'
                      : 'border-slate-200/70 dark:border-slate-800 bg-slate-50/50 dark:bg-[#080C14]/50'
                  }`}
                >
                  <div className="text-[10px] font-mono uppercase text-slate-500 dark:text-[#94A3B8]">
                    {day.shortWeekday}
                  </div>
                  <div className="text-xs font-bold font-mono text-slate-900 dark:text-[#F1F5F9] mt-0.5">
                    {day.dayNum}
                  </div>
                  <div className="mt-2 text-[11px] font-mono tabular-nums text-cyan-600 dark:text-[#22D3EE]">
                    {hours}h
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 dark:text-[#94A3B8]">
                    {day.blockCount}b
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Goal Progress */}
        <section className="lg:col-span-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-[#F1F5F9] flex items-center gap-1.5">
              <Target className="w-4 h-4 text-[#14B8A6]" />
              <span>Goal Progress</span>
            </h2>
            <button
              type="button"
              onClick={() => setActiveTab('goals')}
              className="text-xs text-cyan-600 dark:text-[#22D3EE] hover:underline cursor-pointer"
            >
              Manage
            </button>
          </div>

          {goals.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
              No active goals yet. Create a goal to track milestone completion.
            </p>
          ) : (
            <div className="space-y-3">
              {goals.slice(0, 3).map((g) => (
                <div key={g.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-900 dark:text-[#F1F5F9] truncate">
                      {g.title}
                    </span>
                    <span className="font-mono tabular-nums text-[#14B8A6]">
                      {g.progressPercent}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#080C14] overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, g.progressPercent)}%` }}
                      className="h-full bg-[#14B8A6] transition-all"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Relevant Scheduling Insights & Diagnostics */}
        <section className="lg:col-span-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722] p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles className="w-4 h-4 text-[#A78BFA]" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-[#F1F5F9]">
              Schedule Health
            </h2>
          </div>

          {conflicts.length > 0 || unscheduledTasks.length > 0 ? (
            <div className="space-y-2.5 text-xs">
              {conflicts.slice(0, 2).map((c) => (
                <div
                  key={c.id}
                  className="p-2.5 rounded-lg border border-[#FB7185]/35 bg-[#FB7185]/10 text-[#FB7185]"
                >
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{c.title}</span>
                  </div>
                  <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-0.5">
                    {c.description}
                  </p>
                </div>
              ))}
              {unscheduledTasks.slice(0, 2).map((u) => (
                <div
                  key={u.taskId}
                  className="p-2.5 rounded-lg border border-[#F59E0B]/35 bg-[#F59E0B]/10 space-y-1"
                >
                  <p className="font-semibold text-[#F59E0B]">
                    Unscheduled ({u.unscheduledMinutes}m): {u.title}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('reality_shift')}
                    className="text-[#22D3EE] hover:underline font-medium cursor-pointer"
                  >
                    Resolve in Reality Shift →
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 rounded-lg border border-slate-200/70 dark:border-slate-800 bg-slate-50/50 dark:bg-[#080C14]/60 text-xs space-y-1.5">
              <p className="font-semibold text-[#14B8A6]">Constraint-Verified & Feasible</p>
              <p className="text-slate-600 dark:text-[#94A3B8] leading-relaxed">
                All {activeFlexibleTasks.length} flexible tasks fit within your waking focus windows
                without violating fixed commitments or deadlines.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
