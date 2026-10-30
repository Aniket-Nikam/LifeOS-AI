import React, { useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { PriorityLevel, TaskCategory } from '../types/lifeos';
import {
  Sparkles,
  X,
  Send,
  BookOpen,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  Cpu,
  Layers,
  Plus,
  Check,
  RefreshCw,
} from 'lucide-react';

interface CopilotTurn {
  prompt: string;
  answer: string;
  bottlenecks: string[];
  recommendations: string[];
  modelUsed?: string;
  isErrorFallback?: boolean;
}

interface PendingTaskDraft {
  title: string;
  category: TaskCategory;
  priority: PriorityLevel;
  estimatedMinutes: number;
}

export function CopilotDrawer({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { profile, tasks, scheduleBlocks, routines, saveTask, showToast } = useLifeOS();
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<CopilotTurn[]>([]);
  const [draftTask, setDraftTask] = useState<PendingTaskDraft | null>(null);

  const askCopilot = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          profile,
          tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            status: t.status,
            estimatedMinutes: t.estimatedMinutes,
            remainingMinutes: t.remainingMinutes,
            dueAt: t.dueAt,
          })),
          scheduleBlocks: scheduleBlocks.map((b) => ({
            id: b.id,
            title: b.title,
            startAt: b.startAt,
            endAt: b.endAt,
            blockType: b.blockType,
            locked: b.locked,
          })),
          routines: routines.map((r) => ({
            id: r.id,
            title: r.title,
            startTime: r.preferredStartHHmm,
            durationMinutes: r.durationMinutes,
          })),
        }),
      });
      const data = await res.json();
      setHistory((prev) => [
        {
          prompt: trimmed,
          answer:
            data.answer ||
            'Your schedule has been analyzed against your active tasks and sleep/focus constraints.',
          bottlenecks: Array.isArray(data.bottlenecks) ? data.bottlenecks : [],
          recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
          modelUsed: data.modelUsed,
        },
        ...prev,
      ]);
      setQuestion('');
    } catch {
      setHistory((prev) => [
        {
          prompt: trimmed,
          answer:
            'Deterministic fallback diagnosis: High-priority tasks are prioritized before earliest deadlines while preserving locked commitments and overnight sleep boundaries.',
          bottlenecks: ['Check tasks with tight deadlines or long unsplit durations.'],
          recommendations: ['Use Reality Shift to preview moving flexible blocks.'],
          isErrorFallback: true,
        },
        ...prev,
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCreateTask = async () => {
    if (!draftTask || !draftTask.title.trim()) return;
    await saveTask({
      title: draftTask.title.trim(),
      description: 'Created from AI Planning Copilot recommendation with explicit confirmation.',
      category: draftTask.category,
      priority: draftTask.priority,
      estimatedMinutes: draftTask.estimatedMinutes,
      actualMinutes: 0,
      remainingMinutes: draftTask.estimatedMinutes,
      isFixed: false,
      isSplittable: true,
      minSessionMinutes: 30,
      preferredTimeOfDay: 'morning',
      energyLevel: 'high',
      status: 'inbox',
    });
    showToast(`Added "${draftTask.title.trim()}" to Tasks.`, 'success');
    setDraftTask(null);
  };

  const presetQuestions = [
    'Why were my high-priority tasks placed in their current slots?',
    'Help me fit three study sessions around my classes and shift.',
    'Identify any deadline or capacity bottlenecks in my current plan.',
    'How should I rebalance my day if I have low energy this afternoon?',
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#080C14]/70 backdrop-blur-xs">
      <aside
        aria-label="LifeOS Planning Copilot"
        className="lifeos-slide-right w-full max-w-md bg-white dark:bg-[#101722] border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-2xl"
      >
            {/* Header */}
            <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#A78BFA]/15 border border-[#A78BFA]/40 flex items-center justify-center text-[#A78BFA]">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-[#F1F5F9] font-display leading-none">
                    Planning Copilot
                  </h2>
                  <p className="text-[10px] font-mono text-slate-500 dark:text-[#94A3B8] mt-1">
                    Contextual Schedule Intelligence · Read-Safe
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close Copilot sidebar"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-[#F1F5F9] hover:bg-slate-100 dark:hover:bg-[#161F2D] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Suggested Prompts */}
            <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080C14]/60 space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#94A3B8]">
                Suggested Prompts
              </div>
              <div className="flex flex-wrap gap-1.5">
                {presetQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => askCopilot(q)}
                    disabled={loading}
                    className="text-left text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#101722] hover:border-[#A78BFA]/50 text-slate-700 dark:text-[#F1F5F9] transition-colors cursor-pointer"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Explicit Task Creation Confirmation Card */}
            {draftTask && (
              <div className="p-4 border-b border-[#A78BFA]/40 bg-[#A78BFA]/10 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono uppercase text-[10px] font-semibold text-violet-700 dark:text-[#A78BFA]">
                    Confirm Before Modifying Workspace
                  </span>
                  <button
                    type="button"
                    onClick={() => setDraftTask(null)}
                    className="text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
                <input
                  type="text"
                  value={draftTask.title}
                  onChange={(e) => setDraftTask({ ...draftTask, title: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#080C14] text-slate-900 dark:text-[#F1F5F9]"
                />
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={draftTask.category}
                    onChange={(e) =>
                      setDraftTask({ ...draftTask, category: e.target.value as TaskCategory })
                    }
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#080C14] text-slate-900 dark:text-[#F1F5F9]"
                  >
                    <option value="academic">academic</option>
                    <option value="coding">coding</option>
                    <option value="work">work</option>
                    <option value="fitness">fitness</option>
                    <option value="personal">personal</option>
                  </select>
                  <select
                    value={draftTask.priority}
                    onChange={(e) =>
                      setDraftTask({ ...draftTask, priority: e.target.value as PriorityLevel })
                    }
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#080C14] text-slate-900 dark:text-[#F1F5F9]"
                  >
                    <option value="high">high</option>
                    <option value="critical">critical</option>
                    <option value="medium">medium</option>
                    <option value="low">low</option>
                  </select>
                  <input
                    type="number"
                    min={15}
                    max={240}
                    value={draftTask.estimatedMinutes}
                    onChange={(e) =>
                      setDraftTask({ ...draftTask, estimatedMinutes: Number(e.target.value) })
                    }
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#080C14] font-mono text-slate-900 dark:text-[#F1F5F9]"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleConfirmCreateTask}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#14B8A6] text-[#080C14] font-semibold cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirm & Add Task to Workspace</span>
                </button>
              </div>
            )}

            {/* Conversation Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loading && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#161F2D] space-y-2 animate-pulse">
                  <div className="h-3 w-36 rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-3 w-4/5 rounded bg-slate-200 dark:bg-slate-700" />
                </div>
              )}

              {history.length === 0 && !loading ? (
                <div className="text-center py-12 space-y-2 text-slate-500 dark:text-[#94A3B8] text-sm">
                  <p className="font-semibold text-slate-800 dark:text-[#F1F5F9]">
                    Grounded Schedule Intelligence
                  </p>
                  <p className="text-xs max-w-xs mx-auto leading-relaxed">
                    Ask why a task was scheduled at a specific hour, how to resolve a conflict, or
                    how to optimize your week. Copilot never modifies your tasks without explicit
                    confirmation.
                  </p>
                </div>
              ) : (
                history.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-[#161F2D]/80 space-y-3 text-xs"
                  >
                    <div className="font-semibold text-violet-700 dark:text-[#A78BFA]">
                      {item.prompt}
                    </div>
                    <p className="text-slate-800 dark:text-[#F1F5F9] leading-relaxed text-xs sm:text-sm">
                      {item.answer}
                    </p>

                    {item.bottlenecks.length > 0 && (
                      <div className="space-y-1.5 pt-2.5 border-t border-slate-200 dark:border-slate-800">
                        <div className="font-mono uppercase text-[10px] text-[#F59E0B]">
                          Detected Bottlenecks
                        </div>
                        <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-[#94A3B8]">
                          {item.bottlenecks.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {item.recommendations.length > 0 && (
                      <div className="space-y-2 pt-2.5 border-t border-slate-200 dark:border-slate-800">
                        <div className="font-mono uppercase text-[10px] text-[#14B8A6]">
                          Structured Recommendations
                        </div>
                        <div className="space-y-1.5">
                          {item.recommendations.map((r, i) => (
                            <div
                              key={i}
                              className="p-2 rounded-lg bg-white dark:bg-[#101722] border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2"
                            >
                              <span className="text-slate-700 dark:text-[#F1F5F9]">{r}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftTask({
                                    title: r.slice(0, 70),
                                    category: 'academic',
                                    priority: 'high',
                                    estimatedMinutes: 45,
                                  })
                                }
                                title="Stage task for confirmation"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#22D3EE]/15 text-cyan-700 dark:text-[#22D3EE] text-[10px] font-mono shrink-0 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Stage Task</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-slate-400 dark:text-[#94A3B8]">
                      <span>Model: {item.modelUsed || 'deterministic-fallback'}</span>
                      {item.isErrorFallback && (
                        <button
                          type="button"
                          onClick={() => askCopilot(item.prompt)}
                          className="inline-flex items-center gap-1 text-[#22D3EE] hover:underline cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" /> Retry
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                askCopilot(question);
              }}
              className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-white dark:bg-[#101722]"
            >
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about your schedule or constraints..."
                className="flex-1 px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C14] text-slate-900 dark:text-[#F1F5F9] focus:border-[#A78BFA] focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                aria-label="Send question to Copilot"
                className="p-2.5 rounded-lg bg-[#A78BFA] hover:bg-[#A78BFA]/90 disabled:opacity-50 text-[#080C14] font-semibold transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
      </aside>
    </div>
  );
}

export function MissionGuideModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'guide' | 'architecture' | 'acceptance'>('guide');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080C14]/75 backdrop-blur-xs">
      <div className="w-full max-w-4xl max-h-[88vh] bg-white dark:bg-[#101722] border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-cyan-600 dark:text-[#22D3EE]">
              <BookOpen className="w-3.5 h-3.5" />
              <span>System Documentation & Verification Matrix</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-[#F1F5F9] font-display mt-0.5">
              LifeOS User Guide & Engineering Specification
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close system guide"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 dark:border-slate-800 px-5 gap-4 bg-slate-50 dark:bg-[#080C14]/60">
          <button
            onClick={() => setTab('guide')}
            className={`py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              tab === 'guide'
                ? 'border-[#22D3EE] text-cyan-600 dark:text-[#22D3EE]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            First-Time User Guide
          </button>
          <button
            onClick={() => setTab('architecture')}
            className={`py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              tab === 'architecture'
                ? 'border-[#22D3EE] text-cyan-600 dark:text-[#22D3EE]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Architecture & Engineering Guarantees
          </button>
          <button
            onClick={() => setTab('acceptance')}
            className={`py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              tab === 'acceptance'
                ? 'border-[#22D3EE] text-cyan-600 dark:text-[#22D3EE]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Verification & Changelog
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-slate-700 dark:text-[#94A3B8]">
          {tab === 'guide' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#22D3EE]/10 border border-[#22D3EE]/30">
                <h3 className="font-bold text-slate-900 dark:text-[#F1F5F9]">
                  Welcome to LifeOS — Your Adaptive Personal Operating System
                </h3>
                <p className="text-xs mt-1 text-slate-600 dark:text-[#94A3B8]">
                  Unlike passive calendars or to-do lists, LifeOS treats your tasks, routines,
                  energy windows, and deadlines as a living constraint system.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#161F2D]/40">
                  <div className="font-bold text-slate-900 dark:text-[#F1F5F9] mb-1">
                    1. Mission Control & Time Canvas
                  </div>
                  <p className="text-xs">
                    Review your daily capacity bar, chronological timeline, and upcoming deadlines.
                    Drag blocks across days or use the accessible Quick Edit modal to resize or lock
                    blocks.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#161F2D]/40">
                  <div className="font-bold text-slate-900 dark:text-[#F1F5F9] mb-1">
                    2. Reality Shift (Adaptive Replanning)
                  </div>
                  <p className="text-xs">
                    When you wake up late, lose energy, or get an unexpected meeting, open{' '}
                    <strong>Reality Shift</strong>. Preview the exact Before vs. After diff, see
                    which locked commitments stay untouched, and click{' '}
                    <strong>Approve & Apply</strong> or <strong>Undo</strong>.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#161F2D]/40">
                  <div className="font-bold text-slate-900 dark:text-[#F1F5F9] mb-1">
                    3. Tasks, Goals & Routines
                  </div>
                  <p className="text-xs">
                    Use AI Natural-Language Quick Parse to turn messy sentences into structured
                    tasks with ambiguity review. Track Estimated, Actual, and Remaining effort
                    separately. Skip or override single routine occurrences without breaking the
                    recurring rule.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#161F2D]/40">
                  <div className="font-bold text-slate-900 dark:text-[#F1F5F9] mb-1">
                    4. What-If Simulator & Focus Timer
                  </div>
                  <p className="text-xs">
                    Test hypothetical changes in an isolated sandbox before committing. Run live
                    focus timers in <strong>My Day</strong> that accurately track elapsed seconds
                    across tab switches without prematurely marking tasks complete.
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === 'architecture' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-[#F1F5F9] text-sm">
                    <Cpu className="w-4 h-4 text-[#22D3EE]" />
                    <span>Deterministic Constraint Scheduler</span>
                  </div>
                  <p>
                    Clips candidate intervals against <code>[earliestStartAt, dueAt]</code> before
                    checking fit, respects overnight sleep windows via IANA timezone-aware
                    calculations, inserts break buffers, and never silently drops unscheduled tasks.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-[#F1F5F9] text-sm">
                    <ShieldCheck className="w-4 h-4 text-[#14B8A6]" />
                    <span>Server-Verified Plan Transitions & Security</span>
                  </div>
                  <p>
                    Schedule generation, Reality Shift approval, Undo, and plan version chunks (
                    <code>&lt;= 40</code> blocks/chunk) are validated server-side with Firebase ID
                    token verification and optimistic concurrency checks (
                    <code>baseVersion === currentVersion</code>).
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-[#F1F5F9] text-sm">
                  <Layers className="w-4 h-4 text-[#A78BFA]" />
                  <span>Configurable Server-Side Gemini AI with Automatic Fallback</span>
                </div>
                <p>
                  All natural-language task parsing, change interpretation, diff explanations, and
                  Copilot diagnostics execute through Express server endpoints using{' '}
                  <code>process.env.GEMINI_API_KEY</code> and a configurable model selector with
                  automatic fallback across verified Gemini Flash models.
                </p>
              </div>
            </div>
          )}

          {tab === 'acceptance' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="font-bold text-slate-900 dark:text-[#F1F5F9] text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#14B8A6]" />
                  <span>Verified Core Capabilities</span>
                </div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    Real Firebase Authentication (Google Sign-In) + Firestore security rules
                    deployed and verified with ESLint.
                  </li>
                  <li>
                    Interactive College Student Demo Sandbox for immediate evaluation without login
                    friction.
                  </li>
                  <li>
                    Deadline-aware interval clipping (never schedules beyond hard deadlines; fits
                    valid partial intervals).
                  </li>
                  <li>
                    Separate tracking of Estimated, Actual, and Remaining minutes (never
                    auto-completes tasks on timer expiry).
                  </li>
                  <li>
                    Bounded Firestore plan version chunks (<code>&lt;= 40</code> blocks per chunk
                    document) and server-side atomic transitions.
                  </li>
                  <li>
                    Formula-safe CSV export, full workspace JSON export, RFC 5545 <code>.ics</code>{' '}
                    export, and validated CSV import.
                  </li>
                </ul>
              </div>

              <div className="p-4 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/5 space-y-1">
                <div className="font-bold text-[#F59E0B] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Known Scope & Environment Notes</span>
                </div>
                <p>
                  External Google Calendar OAuth sync is kept outside the critical path in favor of
                  universal RFC 5545 <code>.ics</code> export and CSV interoperability. Sub-100ms
                  scheduling compute time is tracked as a live benchmark metric on every run.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
