import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Edit3,
  Filter,
  Play,
  Plus,
  Repeat,
  Search,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import { formatDateKeyInTz } from '../lib/scheduler';
import {
  EnergyLevel,
  GoalMilestone,
  PriorityLevel,
  Routine,
  RoutineFrequency,
  Task,
  TaskCategory,
  TaskStatus,
  TimeOfDayPreference,
} from '../types/lifeos';

const CATEGORIES: TaskCategory[] = ['academic', 'coding', 'work', 'fitness', 'hobby', 'personal'];
const PRIORITIES: PriorityLevel[] = ['low', 'medium', 'high', 'critical'];
const WEEKDAYS = [
  { d: 0, label: 'Sun' },
  { d: 1, label: 'Mon' },
  { d: 2, label: 'Tue' },
  { d: 3, label: 'Wed' },
  { d: 4, label: 'Thu' },
  { d: 5, label: 'Fri' },
  { d: 6, label: 'Sat' },
];

export function TasksView({
  openCreateModalSignal,
  onClearCreateSignal,
}: {
  openCreateModalSignal?: boolean;
  onClearCreateSignal?: () => void;
}) {
  const {
    profile,
    tasks,
    goals,
    saveTask,
    deleteTask,
    toggleTaskComplete,
    duplicateTask,
    startFocusSession,
    setActiveTab,
    authenticatedFetch,
    showToast,
  } = useLifeOS();

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'due' | 'priority' | 'duration' | 'created'>('due');

  // Natural language AI parser state
  const [nlInput, setNlInput] = useState('');
  const [isParsingNl, setIsParsingNl] = useState(false);
  const [nlAmbiguities, setNlAmbiguities] = useState<string[]>([]);

  // Task Modal Form State
  const [isModalOpen, setIsModalOpen] = useState(Boolean(openCreateModalSignal));
  const [editingTaskId, setEditingTaskId] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('academic');
  const [priority, setPriority] = useState<PriorityLevel>('high');
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);
  const [actualMinutes, setActualMinutes] = useState(0);
  const [remainingMinutes, setRemainingMinutes] = useState(60);
  const [earliestStartAt, setEarliestStartAt] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [isFixed, setIsFixed] = useState(false);
  const [fixedStartAt, setFixedStartAt] = useState('');
  const [fixedEndAt, setFixedEndAt] = useState('');
  const [isSplittable, setIsSplittable] = useState(true);
  const [minSessionMinutes, setMinSessionMinutes] = useState(30);
  const [preferredTimeOfDay, setPreferredTimeOfDay] = useState<TimeOfDayPreference>('morning');
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel>('high');
  const [status, setStatus] = useState<TaskStatus>('inbox');
  const [goalId, setGoalId] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  React.useEffect(() => {
    if (openCreateModalSignal) {
      openNewTaskModal();
      onClearCreateSignal?.();
    }
  }, [openCreateModalSignal]);

  const toLocalDateTimeInput = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  };

  const openNewTaskModal = () => {
    setEditingTaskId(undefined);
    setTitle('');
    setDescription('');
    setCategory('academic');
    setPriority('high');
    setEstimatedMinutes(60);
    setActualMinutes(0);
    setRemainingMinutes(60);
    setEarliestStartAt('');
    setDueAt('');
    setIsFixed(false);
    setFixedStartAt('');
    setFixedEndAt('');
    setIsSplittable(true);
    setMinSessionMinutes(30);
    setPreferredTimeOfDay('morning');
    setEnergyLevel('high');
    setStatus('inbox');
    setGoalId('');
    setNlAmbiguities([]);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditTaskModal = (t: Task) => {
    setEditingTaskId(t.id);
    setTitle(t.title);
    setDescription(t.description || '');
    setCategory(t.category);
    setPriority(t.priority);
    setEstimatedMinutes(t.estimatedMinutes);
    setActualMinutes(t.actualMinutes || 0);
    setRemainingMinutes(t.remainingMinutes ?? t.estimatedMinutes);
    setEarliestStartAt(toLocalDateTimeInput(t.earliestStartAt));
    setDueAt(toLocalDateTimeInput(t.dueAt));
    setIsFixed(t.isFixed);
    setFixedStartAt(toLocalDateTimeInput(t.fixedStartAt));
    setFixedEndAt(toLocalDateTimeInput(t.fixedEndAt));
    setIsSplittable(t.isSplittable);
    setMinSessionMinutes(t.minSessionMinutes || 30);
    setPreferredTimeOfDay(t.preferredTimeOfDay);
    setEnergyLevel(t.energyLevel);
    setStatus(t.status);
    setGoalId(t.goalId || '');
    setNlAmbiguities([]);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleParseNaturalLanguage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlInput.trim()) return;
    setIsParsingNl(true);
    try {
      const resp = await authenticatedFetch('/api/ai/parse-task', {
        method: 'POST',
        body: JSON.stringify({
          text: nlInput.trim(),
          referenceNowIso: new Date().toISOString(),
          timezone: profile?.timezone || 'UTC',
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to parse task');
      }
      const p = data.parsed;
      openNewTaskModal();
      setTitle(p.title || nlInput.trim());
      setDescription(p.description || '');
      setCategory(p.category || 'academic');
      setPriority(p.priority || 'medium');
      const est = Number(p.estimatedMinutes) || 60;
      setEstimatedMinutes(est);
      setRemainingMinutes(est);
      setIsSplittable(Boolean(p.isSplittable));
      setMinSessionMinutes(Number(p.minSessionMinutes) || Math.min(30, est));
      setPreferredTimeOfDay(p.preferredTimeOfDay || 'any');
      setEnergyLevel(p.energyLevel || 'medium');
      if (p.dueAt) {
        setDueAt(toLocalDateTimeInput(p.dueAt));
      }
      setNlAmbiguities(Array.isArray(p.ambiguities) ? p.ambiguities : []);
      setNlInput('');
    } catch (err: any) {
      showToast(err.message || 'Natural language parse failed.', 'error');
    } finally {
      setIsParsingNl(false);
    }
  };

  const handleSubmitTaskForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError('Task title is required.');
      return;
    }
    if (!Number.isFinite(estimatedMinutes) || estimatedMinutes < 5 || estimatedMinutes > 1440) {
      setFormError('Estimated duration must be between 5 and 1440 minutes.');
      return;
    }
    if (!Number.isFinite(remainingMinutes) || remainingMinutes < 0 || remainingMinutes > 1440) {
      setFormError('Remaining effort must be between 0 and 1440 minutes.');
      return;
    }

    const earliestIso = earliestStartAt ? new Date(earliestStartAt).toISOString() : undefined;
    const dueIso = dueAt ? new Date(dueAt).toISOString() : undefined;

    if (earliestIso && dueIso && Date.parse(earliestIso) >= Date.parse(dueIso)) {
      setFormError('Earliest start time must be earlier than the due date/time.');
      return;
    }

    const fStartIso = isFixed && fixedStartAt ? new Date(fixedStartAt).toISOString() : undefined;
    const fEndIso = isFixed && fixedEndAt ? new Date(fixedEndAt).toISOString() : undefined;

    if (isFixed && (!fStartIso || !fEndIso || Date.parse(fEndIso) <= Date.parse(fStartIso))) {
      setFormError('Fixed commitments require valid start and end timestamps.');
      return;
    }

    await saveTask({
      id: editingTaskId,
      title: title.trim(),
      description: description.trim(),
      category,
      priority,
      estimatedMinutes,
      actualMinutes,
      remainingMinutes,
      earliestStartAt: earliestIso,
      dueAt: dueIso,
      isFixed,
      fixedStartAt: fStartIso,
      fixedEndAt: fEndIso,
      isSplittable,
      minSessionMinutes,
      preferredTimeOfDay,
      energyLevel,
      status,
      goalId: goalId || undefined,
    });

    setIsModalOpen(false);
  };

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const weight: Record<PriorityLevel, number> = { critical: 4, high: 3, medium: 2, low: 1 };

    return tasks
      .filter((t) => {
        if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
        if (statusFilter !== 'all' && t.status !== statusFilter) return false;
        if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
        if (
          q &&
          !t.title.toLowerCase().includes(q) &&
          !(t.description || '').toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'priority') {
          return (weight[b.priority] || 0) - (weight[a.priority] || 0);
        }
        if (sortBy === 'duration') {
          return b.remainingMinutes - a.remainingMinutes;
        }
        if (sortBy === 'created') {
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        }
        const dueA = a.dueAt ? Date.parse(a.dueAt) : Number.MAX_SAFE_INTEGER;
        const dueB = b.dueAt ? Date.parse(b.dueAt) : Number.MAX_SAFE_INTEGER;
        return dueA - dueB;
      });
  }, [tasks, searchQuery, categoryFilter, statusFilter, priorityFilter, sortBy]);

  return (
    <div className="space-y-6">
      {/* Header + Natural Language Quick Entry */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-cyan-600 dark:text-[#22D3EE]">
              Execution & Constraint Inventory
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-[#F1F5F9] mt-0.5">
              Task Management Engine
            </h1>
            <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
              Separate estimated, actual, and remaining effort tracking with hard/soft scheduling
              constraints.
            </p>
          </div>
          <button
            type="button"
            onClick={openNewTaskModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#22D3EE] hover:bg-[#22D3EE]/90 text-[#080C14] transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Task</span>
          </button>
        </div>

        {/* Natural-Language Task Entry Bar */}
        <form onSubmit={handleParseNaturalLanguage} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Sparkles className="w-4 h-4 text-[#A78BFA] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={nlInput}
              onChange={(e) => setNlInput(e.target.value)}
              placeholder='Natural-language entry: e.g., "Study networking for two hours before Thursday evening"'
              aria-label="Natural language task entry"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C14] pl-10 pr-4 py-2.5 text-xs text-slate-900 dark:text-[#F1F5F9] focus:border-[#22D3EE] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={isParsingNl || !nlInput.trim()}
            className="px-4 py-2.5 text-xs font-semibold rounded-lg border border-[#A78BFA]/40 bg-[#A78BFA]/15 hover:bg-[#A78BFA]/25 text-violet-700 dark:text-[#A78BFA] disabled:opacity-50 transition-colors cursor-pointer shrink-0"
          >
            {isParsingNl ? 'Parsing with AI...' : 'Parse & Review Fields'}
          </button>
        </form>

        {/* Search, Filter & Sort Controls */}
        <div className="pt-2 flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks by title or description..."
              aria-label="Search tasks"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C14] pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-[#F1F5F9]"
            />
          </div>

          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C14] px-3 py-1.5 text-xs text-slate-700 dark:text-[#94A3B8]"
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C14] px-3 py-1.5 text-xs text-slate-700 dark:text-[#94A3B8]"
          >
            <option value="all">All Statuses</option>
            <option value="inbox">Inbox</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="complete">Complete</option>
            <option value="skipped">Skipped</option>
          </select>

          <select
            aria-label="Filter by priority"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C14] px-3 py-1.5 text-xs text-slate-700 dark:text-[#94A3B8]"
          >
            <option value="all">All Priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            aria-label="Sort tasks by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C14] px-3 py-1.5 text-xs text-slate-700 dark:text-[#94A3B8]"
          >
            <option value="due">Sort: Due Date</option>
            <option value="priority">Sort: Priority</option>
            <option value="duration">Sort: Remaining Duration</option>
            <option value="created">Sort: Recently Added</option>
          </select>
        </div>
      </div>

      {/* Tasks Table / List */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722] overflow-hidden">
        {filteredTasks.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Filter className="w-7 h-7 text-slate-400 mx-auto" />
            <p className="text-sm font-medium text-slate-800 dark:text-[#F1F5F9]">
              No matching tasks found
            </p>
            <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
              Create a new task or clear your active search filters.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
            {filteredTasks.map((t) => {
              const isComplete = t.status === 'complete';
              const linkedGoal = goals.find((g) => g.id === t.goalId);

              return (
                <div
                  key={t.id}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-[#161F2D]/60 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleTaskComplete(t.id)}
                      aria-label={`Mark "${t.title}" ${isComplete ? 'incomplete' : 'complete'}`}
                      className={`mt-0.5 p-1 rounded-md transition-colors cursor-pointer ${
                        isComplete
                          ? 'text-[#14B8A6] bg-[#14B8A6]/15'
                          : 'text-slate-400 hover:text-[#14B8A6]'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          className={`text-sm font-semibold ${
                            isComplete
                              ? 'line-through text-slate-400 dark:text-slate-500'
                              : 'text-slate-900 dark:text-[#F1F5F9]'
                          }`}
                        >
                          {t.title}
                        </h3>
                        <span
                          className={`text-[11px] font-mono uppercase ${
                            t.priority === 'critical'
                              ? 'text-[#FB7185] font-semibold'
                              : t.priority === 'high'
                              ? 'text-[#F59E0B]'
                              : 'text-slate-500 dark:text-[#94A3B8]'
                          }`}
                        >
                          {t.priority}
                        </span>
                      </div>

                      {t.description && (
                        <p className="text-xs text-slate-500 dark:text-[#94A3B8] line-clamp-1">
                          {t.description}
                        </p>
                      )}

                      {/* Unboxed Metadata Discipline */}
                      <div className="text-xs text-slate-500 dark:text-[#94A3B8] font-mono tabular-nums flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-sans capitalize">{t.category}</span>
                        <span>·</span>
                        <span>Est: {t.estimatedMinutes}m</span>
                        <span>·</span>
                        <span>Actual: {t.actualMinutes || 0}m</span>
                        <span>·</span>
                        <span className="text-cyan-600 dark:text-[#22D3EE] font-semibold">
                          Rem: {t.remainingMinutes}m
                        </span>
                        <span>·</span>
                        <span className="font-sans">
                          {t.isFixed
                            ? 'Fixed Window'
                            : t.isSplittable
                            ? `Splittable (min ${t.minSessionMinutes}m)`
                            : 'Uninterrupted'}
                        </span>
                        {t.dueAt && (
                          <>
                            <span>·</span>
                            <span className="text-[#F59E0B]">
                              Due {new Date(t.dueAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </>
                        )}
                        {linkedGoal && (
                          <>
                            <span>·</span>
                            <span className="font-sans text-teal-600 dark:text-[#14B8A6]">
                              Goal: {linkedGoal.title}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Row Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isComplete && (
                      <button
                        type="button"
                        onClick={() => {
                          startFocusSession(t.id);
                          setActiveTab('my_day');
                        }}
                        aria-label={`Start Focus on "${t.title}"`}
                        className="p-2 rounded-lg text-cyan-600 dark:text-[#22D3EE] hover:bg-[#22D3EE]/15 cursor-pointer"
                        title="Start Focus Session"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditTaskModal(t)}
                      aria-label={`Edit "${t.title}"`}
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-[#F1F5F9] hover:bg-slate-100 dark:hover:bg-[#161F2D] cursor-pointer"
                      title="Edit Task"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateTask(t.id)}
                      aria-label={`Duplicate "${t.title}"`}
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-[#F1F5F9] hover:bg-slate-100 dark:hover:bg-[#161F2D] cursor-pointer"
                      title="Duplicate Task"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    {confirmDeleteId === t.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteTask(t.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-1 text-xs font-semibold bg-[#FB7185] text-[#080C14] rounded cursor-pointer"
                        >
                          Confirm Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 text-xs text-slate-400 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(t.id)}
                        aria-label={`Delete "${t.title}"`}
                        className="p-2 rounded-lg text-slate-400 hover:text-[#FB7185] hover:bg-[#FB7185]/10 cursor-pointer"
                        title="Delete Task"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Task Modal (18 Specification Fields) */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-modal-title"
        >
          <form
            onSubmit={handleSubmitTaskForm}
            className="w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-900 text-slate-100 p-6 space-y-4 shadow-2xl my-8"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 id="task-modal-title" className="text-base font-semibold">
                {editingTaskId ? 'Edit Task' : 'Review & Save Task'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>

            {nlAmbiguities.length > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300 space-y-1">
                <p className="font-semibold">AI Parsing Note — Please Review Ambiguous Details:</p>
                {nlAmbiguities.map((a, idx) => (
                  <p key={idx}>• {a}</p>
                ))}
              </div>
            )}

            {formError && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="tf-title" className="block text-xs text-slate-400 mb-1">
                  Task Title *
                </label>
                <input
                  id="tf-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="e.g., Networking TCP Problem Set"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="tf-desc" className="block text-xs text-slate-400 mb-1">
                  Description
                </label>
                <textarea
                  id="tf-desc"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                />
              </div>

              <div>
                <label htmlFor="tf-cat" className="block text-xs text-slate-400 mb-1">
                  Category
                </label>
                <select
                  id="tf-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TaskCategory)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="tf-prio" className="block text-xs text-slate-400 mb-1">
                  Priority
                </label>
                <select
                  id="tf-prio"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* Separate Estimated, Actual, and Remaining Effort (Engineering Correction #6) */}
              <div>
                <label htmlFor="tf-est" className="block text-xs text-slate-400 mb-1">
                  Estimated Duration (minutes)
                </label>
                <input
                  id="tf-est"
                  type="number"
                  min={5}
                  max={1440}
                  value={estimatedMinutes}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setEstimatedMinutes(v);
                    if (!editingTaskId) setRemainingMinutes(v);
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="tf-act" className="block text-xs text-slate-400 mb-1">
                    Actual Tracked (m)
                  </label>
                  <input
                    id="tf-act"
                    type="number"
                    min={0}
                    max={10000}
                    value={actualMinutes}
                    onChange={(e) => setActualMinutes(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="tf-rem" className="block text-xs text-slate-400 mb-1">
                    Remaining Effort (m)
                  </label>
                  <input
                    id="tf-rem"
                    type="number"
                    min={0}
                    max={1440}
                    value={remainingMinutes}
                    onChange={(e) => setRemainingMinutes(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="tf-earliest" className="block text-xs text-slate-400 mb-1">
                  Earliest Permitted Start (Optional)
                </label>
                <input
                  id="tf-earliest"
                  type="datetime-local"
                  value={earliestStartAt}
                  onChange={(e) => setEarliestStartAt(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
                />
              </div>

              <div>
                <label htmlFor="tf-due" className="block text-xs text-slate-400 mb-1">
                  Hard Deadline / Due Date (Optional)
                </label>
                <input
                  id="tf-due"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
                />
              </div>

              <div>
                <label htmlFor="tf-tod" className="block text-xs text-slate-400 mb-1">
                  Preferred Time of Day
                </label>
                <select
                  id="tf-tod"
                  value={preferredTimeOfDay}
                  onChange={(e) => setPreferredTimeOfDay(e.target.value as TimeOfDayPreference)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="any">Any Available Window</option>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                  <option value="night">Night</option>
                </select>
              </div>

              <div>
                <label htmlFor="tf-energy" className="block text-xs text-slate-400 mb-1">
                  Energy Requirement
                </label>
                <select
                  id="tf-energy"
                  value={energyLevel}
                  onChange={(e) => setEnergyLevel(e.target.value as EnergyLevel)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="high">High Cognitive Focus</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low / Relaxed</option>
                </select>
              </div>

              <div>
                <label htmlFor="tf-goal" className="block text-xs text-slate-400 mb-1">
                  Associated Goal
                </label>
                <select
                  id="tf-goal"
                  value={goalId}
                  onChange={(e) => setGoalId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="">No Linked Goal</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="tf-min-sess" className="block text-xs text-slate-400 mb-1">
                  Minimum Session Length (minutes)
                </label>
                <input
                  id="tf-min-sess"
                  type="number"
                  min={5}
                  max={480}
                  value={minSessionMinutes}
                  onChange={(e) => setMinSessionMinutes(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
                />
              </div>

              <div className="sm:col-span-2 flex flex-wrap items-center gap-6 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSplittable}
                    onChange={(e) => setIsSplittable(e.target.checked)}
                    disabled={isFixed}
                  />
                  <span>Splittable across multiple sessions</span>
                </label>

                <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFixed}
                    onChange={(e) => setIsFixed(e.target.checked)}
                  />
                  <span>Fixed-time commitment (Class / Appointment)</span>
                </label>
              </div>

              {isFixed && (
                <>
                  <div>
                    <label htmlFor="tf-fstart" className="block text-xs text-slate-400 mb-1">
                      Fixed Start Date/Time *
                    </label>
                    <input
                      id="tf-fstart"
                      type="datetime-local"
                      value={fixedStartAt}
                      onChange={(e) => setFixedStartAt(e.target.value)}
                      required
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
                    />
                  </div>
                  <div>
                    <label htmlFor="tf-fend" className="block text-xs text-slate-400 mb-1">
                      Fixed End Date/Time *
                    </label>
                    <input
                      id="tf-fend"
                      type="datetime-local"
                      value={fixedEndAt}
                      onChange={(e) => setFixedEndAt(e.target.value)}
                      required
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 cursor-pointer"
              >
                Save Task
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function GoalsView() {
  const { goals, tasks, saveGoal, deleteGoal, toggleGoalMilestone } = useLifeOS();

  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('academic');
  const [targetDate, setTargetDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [milestoneInputs, setMilestoneInputs] = useState<string[]>([
    'Complete foundational review',
    'Finish core deliverables',
  ]);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const milestones: GoalMilestone[] = milestoneInputs
      .map((m) => m.trim())
      .filter(Boolean)
      .map((m, idx) => ({
        id: `ms_${Date.now()}_${idx}`,
        title: m,
        completed: false,
        targetMinutes: 60,
      }));

    await saveGoal({
      title: title.trim(),
      description: description.trim(),
      category,
      targetDate,
      milestones,
      status: 'active',
    });
    setTitle('');
    setDescription('');
    setIsOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Goals & Milestones
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Progress is computed deterministically from completed milestones and linked tasks.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Goal</span>
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
          <Target className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">No active goals</p>
          <p className="text-xs text-slate-500">
            Create a goal with milestones and link tasks to track long-term progress.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {goals.map((goal) => {
            const linkedTasks = tasks.filter((t) => t.goalId === goal.id);
            return (
              <div
                key={goal.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                        {goal.category} · Target {goal.targetDate}
                      </p>
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                        {goal.title}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold font-mono tabular-nums text-cyan-500">
                        {goal.progressPercent}%
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteGoal(goal.id)}
                        aria-label={`Delete goal ${goal.title}`}
                        className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {goal.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{goal.description}</p>
                  )}

                  {/* Deterministic Progress Bar */}
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      style={{ width: `${goal.progressPercent}%` }}
                      className="h-full bg-cyan-500 transition-all"
                    />
                  </div>

                  {/* Milestones */}
                  <div className="space-y-1.5 pt-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Milestones ({goal.milestones.filter((m) => m.completed).length}/
                      {goal.milestones.length})
                    </p>
                    {goal.milestones.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer py-1"
                      >
                        <input
                          type="checkbox"
                          checked={m.completed}
                          onChange={() => toggleGoalMilestone(goal.id, m.id)}
                          className="rounded border-slate-700"
                        />
                        <span className={m.completed ? 'line-through text-slate-400' : ''}>
                          {m.title}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Linked Tasks Summary */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  Linked Tasks: {linkedTasks.filter((t) => t.status === 'complete').length}/
                  {linkedTasks.length} completed
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleCreateGoal}
            className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 text-slate-100 p-6 space-y-4"
          >
            <h3 className="text-base font-semibold">Create Long-Term Goal</h3>
            <div>
              <label htmlFor="gf-title" className="block text-xs text-slate-400 mb-1">
                Goal Title *
              </label>
              <input
                id="gf-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="gf-desc" className="block text-xs text-slate-400 mb-1">
                Description
              </label>
              <input
                id="gf-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="gf-cat" className="block text-xs text-slate-400 mb-1">
                  Category
                </label>
                <select
                  id="gf-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TaskCategory)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="gf-date" className="block text-xs text-slate-400 mb-1">
                  Target Date
                </label>
                <input
                  id="gf-date"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-slate-400">Milestones</p>
              {milestoneInputs.map((val, idx) => (
                <input
                  key={idx}
                  type="text"
                  value={val}
                  onChange={(e) => {
                    const next = [...milestoneInputs];
                    next[idx] = e.target.value;
                    setMilestoneInputs(next);
                  }}
                  placeholder={`Milestone ${idx + 1}`}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100"
                />
              ))}
              <button
                type="button"
                onClick={() => setMilestoneInputs([...milestoneInputs, ''])}
                className="text-xs text-cyan-400 hover:underline"
              >
                + Add another milestone
              </button>
            </div>
            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-2 text-xs text-slate-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-500 text-slate-950"
              >
                Save Goal
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function RoutinesView() {
  const {
    profile,
    routines,
    saveRoutine,
    deleteRoutine,
    skipRoutineOccurrence,
    overrideRoutineOccurrence,
    restoreRoutineOccurrences,
  } = useLifeOS();

  const todayKey = formatDateKeyInTz(Date.now(), profile?.timezone || 'UTC');

  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TaskCategory>('fitness');
  const [frequency, setFrequency] = useState<RoutineFrequency>('selected_days');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 3, 5, 6]);
  const [intervalDays, setIntervalDays] = useState(2);
  const [preferredStartHHmm, setPreferredStartHHmm] = useState('17:30');
  const [preferredEndHHmm, setPreferredEndHHmm] = useState('19:30');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [isFixed, setIsFixed] = useState(false);
  const [priority, setPriority] = useState<PriorityLevel>('high');

  // Single occurrence edit modal state
  const [singleOccRoutine, setSingleOccRoutine] = useState<Routine | null>(null);
  const [singleOccDate, setSingleOccDate] = useState(todayKey);
  const [singleOccTitle, setSingleOccTitle] = useState('');
  const [singleOccDuration, setSingleOccDuration] = useState(60);

  const toggleDay = (d: number) => {
    setDaysOfWeek((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };

  const handleCreateRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await saveRoutine({
      title: title.trim(),
      category,
      frequency,
      daysOfWeek,
      intervalDays,
      startDate: todayKey,
      preferredStartHHmm,
      preferredEndHHmm,
      durationMinutes,
      isFixed,
      priority,
      skippedDates: [],
      overridesJson: '{}',
    });
    setTitle('');
    setIsOpen(false);
  };

  const handleSaveSingleOccurrence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleOccRoutine) return;
    await overrideRoutineOccurrence(singleOccRoutine.id, singleOccDate, {
      title: singleOccTitle.trim() || singleOccRoutine.title,
      durationMinutes: singleOccDuration,
    });
    setSingleOccRoutine(null);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Recurring Routine Planner
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Bounded horizon occurrence expansion with per-date skip and single-occurrence overrides.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Routine</span>
        </button>
      </div>

      {routines.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
          <Repeat className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            No recurring routines configured
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {routines.map((rt) => {
            let overridesObj: Record<string, any> = {};
            try {
              overridesObj = JSON.parse(rt.overridesJson || '{}');
            } catch {
              overridesObj = {};
            }
            const overrideKeys = Object.keys(overridesObj);

            return (
              <div
                key={rt.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {rt.title}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                        {rt.durationMinutes}m · Window {rt.preferredStartHHmm}–{rt.preferredEndHHmm}{' '}
                        · {rt.isFixed ? 'Fixed Time' : 'Flexible Window'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteRoutine(rt.id)}
                      aria-label={`Delete routine ${rt.title}`}
                      className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Frequency:{' '}
                    <span className="font-medium text-slate-700 dark:text-slate-200 capitalize">
                      {rt.frequency.replace('_', ' ')}
                    </span>{' '}
                    {rt.frequency === 'selected_days' && (
                      <span>
                        (
                        {rt.daysOfWeek
                          .map((d) => WEEKDAYS.find((w) => w.d === d)?.label)
                          .join(', ')}
                        )
                      </span>
                    )}
                  </div>

                  {(rt.skippedDates.length > 0 || overrideKeys.length > 0) && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-2.5 text-xs space-y-1">
                      {rt.skippedDates.length > 0 && (
                        <p className="text-amber-500">
                          Skipped Dates: {rt.skippedDates.join(', ')}
                        </p>
                      )}
                      {overrideKeys.length > 0 && (
                        <p className="text-cyan-400">
                          Single-Occurrence Overrides: {overrideKeys.join(', ')}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => skipRoutineOccurrence(rt.id, todayKey)}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Skip Today ({todayKey})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSingleOccRoutine(rt);
                      setSingleOccDate(todayKey);
                      setSingleOccTitle(`${rt.title} (Custom Session)`);
                      setSingleOccDuration(rt.durationMinutes);
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Edit One Occurrence
                  </button>
                  {(rt.skippedDates.length > 0 || overrideKeys.length > 0) && (
                    <button
                      type="button"
                      onClick={() => restoreRoutineOccurrences(rt.id)}
                      className="px-2.5 py-1.5 text-xs text-cyan-500 hover:underline cursor-pointer"
                    >
                      Restore All
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Routine Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleCreateRoutine}
            className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 text-slate-100 p-6 space-y-4"
          >
            <h3 className="text-base font-semibold">Create Recurring Routine</h3>
            <div>
              <label htmlFor="rf-title" className="block text-xs text-slate-400 mb-1">
                Routine Title *
              </label>
              <input
                id="rf-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g., Gym Strength Session"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="rf-cat" className="block text-xs text-slate-400 mb-1">
                  Category
                </label>
                <select
                  id="rf-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TaskCategory)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="rf-freq" className="block text-xs text-slate-400 mb-1">
                  Recurrence Pattern
                </label>
                <select
                  id="rf-freq"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as RoutineFrequency)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="selected_days">Selected Weekdays</option>
                  <option value="daily">Every Day</option>
                  <option value="weekdays">Weekdays (Mon–Fri)</option>
                  <option value="interval">Every N Days</option>
                </select>
              </div>
            </div>

            {frequency === 'selected_days' && (
              <div>
                <span className="block text-xs text-slate-400 mb-1.5">Active Days</span>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((w) => (
                    <button
                      key={w.d}
                      type="button"
                      onClick={() => toggleDay(w.d)}
                      className={`px-3 py-1 rounded text-xs font-medium border ${
                        daysOfWeek.includes(w.d)
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="rf-start" className="block text-xs text-slate-400 mb-1">
                  Window Start
                </label>
                <input
                  id="rf-start"
                  type="time"
                  value={preferredStartHHmm}
                  onChange={(e) => setPreferredStartHHmm(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs font-mono text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="rf-end" className="block text-xs text-slate-400 mb-1">
                  Window End
                </label>
                <input
                  id="rf-end"
                  type="time"
                  value={preferredEndHHmm}
                  onChange={(e) => setPreferredEndHHmm(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs font-mono text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="rf-dur" className="block text-xs text-slate-400 mb-1">
                  Duration (m)
                </label>
                <input
                  id="rf-dur"
                  type="number"
                  min={10}
                  max={360}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs font-mono text-slate-100"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isFixed}
                onChange={(e) => setIsFixed(e.target.checked)}
              />
              <span>Lock at exact window start time</span>
            </label>

            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-2 text-xs text-slate-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-500 text-slate-950"
              >
                Save Routine
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit One Occurrence Modal */}
      {singleOccRoutine && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveSingleOccurrence}
            className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 text-slate-100 p-6 space-y-4"
          >
            <h3 className="text-base font-semibold">
              Edit Single Occurrence — {singleOccRoutine.title}
            </h3>
            <p className="text-xs text-slate-400">
              Changes apply only to the selected date and will not alter future or past occurrences.
            </p>
            <div>
              <label htmlFor="so-date" className="block text-xs text-slate-400 mb-1">
                Occurrence Date
              </label>
              <input
                id="so-date"
                type="date"
                value={singleOccDate}
                onChange={(e) => setSingleOccDate(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="so-title" className="block text-xs text-slate-400 mb-1">
                Custom Title for This Date
              </label>
              <input
                id="so-title"
                type="text"
                value={singleOccTitle}
                onChange={(e) => setSingleOccTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="so-dur" className="block text-xs text-slate-400 mb-1">
                Custom Duration (minutes)
              </label>
              <input
                id="so-dur"
                type="number"
                min={10}
                max={360}
                value={singleOccDuration}
                onChange={(e) => setSingleOccDuration(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
              />
            </div>
            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSingleOccRoutine(null)}
                className="px-3 py-2 text-xs text-slate-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-500 text-slate-950"
              >
                Save Single Occurrence
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
