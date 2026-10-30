import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  History,
  Lock,
  RotateCcw,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import { RealityShiftChangeSpec } from '../types/lifeos';

export function RealityShiftView() {
  const {
    profile,
    tasks,
    plan,
    planVersions,
    activePreview,
    setActivePreview,
    runRealityShiftPreview,
    applyRealityShiftPreview,
    undoLastPlanVersion,
    authenticatedFetch,
    showToast,
    isBusy,
  } = useLifeOS();

  const [nlPrompt, setNlPrompt] = useState('');
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [pendingSpec, setPendingSpec] = useState<RealityShiftChangeSpec | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const tz = profile?.timezone || 'UTC';

  const formatTimeShort = (iso?: string) => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: tz,
      }).format(new Date(iso));
    } catch {
      return iso.slice(11, 16);
    }
  };

  const triggerPresetScenario = async (presetKey: string) => {
    setActivePresetId(presetKey);
    const flexibleIncomplete = tasks.filter((t) => !t.isFixed && t.status !== 'complete');
    const codingTask =
      flexibleIncomplete.find((t) => t.category === 'coding') || flexibleIncomplete[0];
    const readingTask =
      flexibleIncomplete.find((t) => t.title.toLowerCase().includes('read')) ||
      flexibleIncomplete[flexibleIncomplete.length - 1];

    const nowMs = Date.now();
    let spec: RealityShiftChangeSpec;

    switch (presetKey) {
      case 'late_2h':
        spec = {
          scenarioType: 'late_start',
          summary: 'I woke up two hours late (+120m planning cutoff shift)',
          shiftStartMinutes: 120,
        };
        break;
      case 'overrun_90m':
        spec = {
          scenarioType: 'task_overrun',
          summary: `My assignment ("${flexibleIncomplete[0]?.title || 'Current Task'}") took an extra 90 minutes`,
          overrunTaskId: flexibleIncomplete[0]?.id,
          extraMinutes: 90,
        };
        break;
      case 'unexpected_meeting': {
        const startMs = nowMs + 2 * 3600000;
        const endMs = startMs + 3600000;
        spec = {
          scenarioType: 'unexpected_event',
          summary: 'Unexpected fixed meeting for 60 minutes today',
          unexpectedEvent: {
            title: 'Unexpected Advisor / Team Sync',
            startAt: new Date(startMs).toISOString(),
            endAt: new Date(endMs).toISOString(),
            category: 'work',
          },
        };
        break;
      }
      case 'move_coding_tomorrow':
        spec = {
          scenarioType: 'defer_task_tomorrow',
          summary: `Move coding task ("${codingTask?.title || 'Coding Project'}") to tomorrow`,
          deferTaskId: codingTask?.id,
        };
        break;
      case 'keep_tonight_free':
        spec = {
          scenarioType: 'reserve_evening_free',
          summary: 'Keep tonight free from 19:00 onward for personal recovery',
          freeFromHHmm: '19:00',
        };
        break;
      case 'urgent_deadline':
        spec = {
          scenarioType: 'urgent_deadline',
          summary: 'A new urgent 60-minute deliverable due tonight appeared',
          urgentTask: {
            title: 'Urgent Systems Lab Patch Submission',
            estimatedMinutes: 60,
            dueAt: new Date(nowMs + 7 * 3600000).toISOString(),
            priority: 'critical',
            category: 'academic',
          },
        };
        break;
      case 'completed_reading':
      default:
        spec = {
          scenarioType: 'complete_task',
          summary: `Already finished "${readingTask?.title || 'task'}" — reclaim scheduled slot`,
          completeTaskId: readingTask?.id,
        };
        break;
    }

    setPendingSpec(spec);
    await runRealityShiftPreview(spec);
  };

  const handleInterpretNaturalLanguage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlPrompt.trim()) return;
    setActivePresetId(null);
    setIsInterpreting(true);
    try {
      const resp = await authenticatedFetch('/api/ai/interpret-change', {
        method: 'POST',
        body: JSON.stringify({
          prompt: nlPrompt.trim(),
          cutoffIso: new Date().toISOString(),
          timezone: tz,
          tasks,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to interpret disruption');
      }
      const spec = data.changeSpec as RealityShiftChangeSpec;
      setPendingSpec(spec);
      await runRealityShiftPreview(spec);
    } catch (err: any) {
      showToast(err.message || 'Could not interpret change.', 'error');
    } finally {
      setIsInterpreting(false);
    }
  };

  const movedCount = activePreview
    ? activePreview.diffs.filter(
        (d) => d.changeType === 'moved' || d.changeType === 'duration_changed'
      ).length
    : 0;
  const addedCount = activePreview
    ? activePreview.diffs.filter((d) => d.changeType === 'added').length
    : 0;
  const unchangedCount = activePreview
    ? activePreview.diffs.filter((d) => d.changeType === 'unchanged').length
    : 0;

  return (
    <div className="space-y-6">
      {/* Reality Shift Command Header & Disruption Input */}
      <section className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722] p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-mono uppercase tracking-wider text-violet-600 dark:text-[#A78BFA] flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>Signature Adaptive Replanning · Active Plan v{plan?.currentVersion || 1}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-[#F1F5F9]">
              Reality Shift — Replan My Day
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-[#94A3B8] max-w-2xl leading-relaxed">
              Describe what changed or trigger a disruption chip below. LifeOS locks your fixed
              commitments, computes a deterministic before-and-after diff, and waits for your
              approval before modifying your live schedule.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isBusy || !plan || plan.currentVersion <= 1}
              onClick={undoLastPlanVersion}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#161F2D] hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-[#F1F5F9] disabled:opacity-40 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Undo Last Replan</span>
            </button>
          </div>
        </div>

        {/* Prominent Disruption Input Field */}
        <form onSubmit={handleInterpretNaturalLanguage} className="mt-6 flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Sparkles className="w-4 h-4 text-[#A78BFA] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={nlPrompt}
              onChange={(e) => setNlPrompt(e.target.value)}
              placeholder='Tell LifeOS what changed: e.g., "I woke up two hours late" or "My assignment took an extra 90 minutes"'
              aria-label="Describe schedule disruption"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C14] pl-10 pr-4 py-3 text-xs sm:text-sm text-slate-900 dark:text-[#F1F5F9] placeholder:text-slate-400 dark:placeholder:text-[#94A3B8]/60 focus:border-[#A78BFA] focus:outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={isInterpreting || isBusy || !nlPrompt.trim()}
            className="px-5 py-3 text-xs font-semibold rounded-lg bg-[#A78BFA] hover:bg-[#A78BFA]/90 text-[#080C14] disabled:opacity-50 transition-colors cursor-pointer shrink-0"
          >
            {isInterpreting ? 'Computing Diff...' : 'Generate Replan Preview'}
          </button>
        </form>

        {/* Suggested Scenario Chips */}
        <div className="mt-4 pt-4 border-t border-slate-200/70 dark:border-slate-800/70">
          <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#94A3B8] mb-2.5">
            Or test a one-click disruption scenario:
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'late_2h', label: 'I woke up two hours late' },
              { id: 'overrun_90m', label: 'Assignment took +90m extra' },
              { id: 'unexpected_meeting', label: 'Unexpected 60m meeting' },
              { id: 'move_coding_tomorrow', label: 'Move coding task to tomorrow' },
              { id: 'keep_tonight_free', label: 'Keep tonight free (from 7 PM)' },
              { id: 'urgent_deadline', label: 'New urgent deadline tonight' },
              { id: 'completed_reading', label: 'Already finished reading task' },
            ].map((sc) => {
              const isSelected = activePresetId === sc.id && Boolean(activePreview);
              return (
                <button
                  key={sc.id}
                  type="button"
                  disabled={isBusy}
                  onClick={() => triggerPresetScenario(sc.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-[#A78BFA] bg-[#A78BFA]/15 text-violet-700 dark:text-[#A78BFA]'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C14] hover:border-[#A78BFA]/50 text-slate-700 dark:text-[#F1F5F9]'
                  }`}
                >
                  {sc.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Animated Before-and-After Preview & Approval Curtain */}
      {activePreview && (
        <section
          key={`preview_${activePreview.baseVersion}_${activePreview.changeSpec.summary}`}
          aria-label="Reality Shift Replan Preview"
          className="lifeos-fade-up rounded-xl border border-[#A78BFA]/60 bg-white dark:bg-[#101722] p-6 space-y-6 shadow-xl"
        >
            {/* Preview Header & Primary Approval Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-violet-600 dark:text-[#A78BFA]">
                  <span className="font-semibold">
                    PROPOSED REPLAN PREVIEW (v{activePreview.baseVersion} → v{activePreview.proposedVersion})
                  </span>
                  <span>·</span>
                  <span className="text-slate-500 dark:text-[#94A3B8]">
                    Isolated preview · Live schedule not modified yet
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-[#F1F5F9]">
                  {activePreview.changeSpec.summary}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-[#94A3B8]">
                  {activePreview.summaryText}
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActivePreview(null);
                    setPendingSpec(null);
                    setActivePresetId(null);
                    showToast('Discarded replan preview. Original schedule unchanged.', 'info');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#161F2D] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-[#F1F5F9] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reject Preview</span>
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => applyRealityShiftPreview(activePreview)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg bg-[#14B8A6] hover:bg-[#14B8A6]/90 text-[#080C14] transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Approve & Apply Plan v{activePreview.proposedVersion}</span>
                </button>
              </div>
            </div>

            {/* Timeline Difference Indicator Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#080C14] p-3">
                <div className="text-[11px] font-mono uppercase text-slate-500 dark:text-[#94A3B8]">
                  Relocated / Resized
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#F59E0B] mt-0.5">
                  {movedCount} blocks
                </div>
              </div>
              <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#080C14] p-3">
                <div className="text-[11px] font-mono uppercase text-slate-500 dark:text-[#94A3B8]">
                  Newly Inserted
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#14B8A6] mt-0.5">
                  {addedCount} blocks
                </div>
              </div>
              <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#080C14] p-3">
                <div className="text-[11px] font-mono uppercase text-slate-500 dark:text-[#94A3B8]">
                  Protected Commitments
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#22D3EE] mt-0.5">
                  {unchangedCount} locked
                </div>
              </div>
              <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#080C14] p-3">
                <div className="text-[11px] font-mono uppercase text-slate-500 dark:text-[#94A3B8]">
                  Unscheduled Overflow
                </div>
                <div
                  className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
                    activePreview.unscheduledTasks.length > 0
                      ? 'text-[#FB7185]'
                      : 'text-slate-900 dark:text-[#F1F5F9]'
                  }`}
                >
                  {activePreview.unscheduledTasks.length} tasks
                </div>
              </div>
            </div>

            {/* Ambiguities Warning if present */}
            {pendingSpec?.ambiguities && pendingSpec.ambiguities.length > 0 && (
              <div className="rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/10 p-3.5 text-xs text-amber-800 dark:text-[#F59E0B]">
                <p className="font-semibold mb-1">Assumptions to review before approving:</p>
                {pendingSpec.ambiguities.map((a, idx) => (
                  <p key={idx}>• {a}</p>
                ))}
              </div>
            )}

            {/* Conflict & Unscheduled Warnings in Preview */}
            {(activePreview.conflicts.length > 0 || activePreview.unscheduledTasks.length > 0) && (
              <div className="rounded-lg border border-[#FB7185]/40 bg-[#FB7185]/10 p-4 space-y-2 text-xs">
                <div className="font-semibold text-[#FB7185] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Constraint & Deadline Warnings in Proposed Plan</span>
                </div>
                {activePreview.unscheduledTasks.map((u) => (
                  <p key={u.taskId} className="text-slate-700 dark:text-[#F1F5F9]">
                    • <strong>{u.title}</strong> ({u.unscheduledMinutes}m unscheduled): {u.explanation}
                  </p>
                ))}
              </div>
            )}

            {/* Side-by-Side Before & After Visual Schedule Snapshot (First 6 blocks) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-[#080C14]/70 p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-[#94A3B8] pb-2 border-b border-slate-200/70 dark:border-slate-800">
                  <span>BEFORE (CURRENT PLAN v{activePreview.baseVersion})</span>
                  <span>{activePreview.beforeBlocks.length} blocks</span>
                </div>
                <div className="space-y-1.5">
                  {activePreview.beforeBlocks
                    .filter((b) => b.blockType !== 'break')
                    .slice(0, 6)
                    .map((b) => (
                      <div
                        key={b.id}
                        className="px-3 py-2 rounded-lg border border-slate-200/70 dark:border-slate-800/80 bg-white dark:bg-[#101722] flex items-center justify-between text-xs"
                      >
                        <span className="font-medium text-slate-800 dark:text-[#F1F5F9] truncate pr-2">
                          {b.title}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 dark:text-[#94A3B8] shrink-0">
                          {formatTimeShort(b.startAt)} ({b.durationMinutes}m)
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              <div className="rounded-xl border border-[#A78BFA]/40 bg-[#A78BFA]/[0.03] dark:bg-[#161F2D]/60 p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-mono text-violet-700 dark:text-[#A78BFA] pb-2 border-b border-slate-200/70 dark:border-slate-800">
                  <span>AFTER (PROPOSED PLAN v{activePreview.proposedVersion})</span>
                  <span>{activePreview.afterBlocks.length} blocks</span>
                </div>
                <div className="space-y-1.5">
                  {activePreview.afterBlocks
                    .filter((b) => b.blockType !== 'break')
                    .slice(0, 6)
                    .map((b) => (
                      <div
                        key={b.id}
                        className="px-3 py-2 rounded-lg border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-[#101722] flex items-center justify-between text-xs"
                      >
                        <span className="font-medium text-slate-900 dark:text-[#F1F5F9] truncate pr-2">
                          {b.title}
                        </span>
                        <span className="font-mono text-[11px] text-cyan-600 dark:text-[#22D3EE] shrink-0">
                          {formatTimeShort(b.startAt)} ({b.durationMinutes}m)
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Detailed Block-Level Diff & Scheduling Decisions Table */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-[#F1F5F9] mb-3">
                Before vs. After Activity Comparison ({activePreview.diffs.length} items)
              </h3>
              <div className="divide-y divide-slate-200/80 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden">
                {activePreview.diffs.map((d) => {
                  const isMoved =
                    d.changeType === 'moved' || d.changeType === 'duration_changed';
                  const isAdded = d.changeType === 'added';
                  const isRemoved = d.changeType === 'removed';

                  return (
                    <div
                      key={`${d.blockId}_${d.changeType}`}
                      className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border-l-4 ${
                        isMoved
                          ? 'border-l-[#F59E0B] bg-[#F59E0B]/[0.04]'
                          : isAdded
                          ? 'border-l-[#14B8A6] bg-[#14B8A6]/[0.04]'
                          : isRemoved
                          ? 'border-l-[#FB7185] bg-[#FB7185]/[0.04]'
                          : 'border-l-slate-400 dark:border-l-slate-700 bg-slate-50/40 dark:bg-[#080C14]/40'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono font-semibold uppercase text-[10px] tracking-wider ${
                              isMoved
                                ? 'text-[#F59E0B]'
                                : isAdded
                                ? 'text-[#14B8A6]'
                                : isRemoved
                                ? 'text-[#FB7185]'
                                : 'text-slate-400 dark:text-[#94A3B8]'
                            }`}
                          >
                            [{d.changeType}]
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-[#F1F5F9]">
                            {d.title}
                          </span>
                        </div>
                        <p className="text-slate-500 dark:text-[#94A3B8]">{d.reason}</p>
                      </div>

                      <div className="flex items-center gap-2 font-mono tabular-nums text-slate-600 dark:text-[#94A3B8] shrink-0">
                        <span>{formatTimeShort(d.beforeStartAt)}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-cyan-600 dark:text-[#22D3EE] font-semibold">
                          {formatTimeShort(d.afterStartAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
      )}

      {/* Version History Audit Trail */}
      <section className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722] p-6">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-[#22D3EE]" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-[#F1F5F9]">
            Approved Schedule Version History
          </h2>
        </div>

        {planVersions.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
            No version snapshots recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
            {[...planVersions]
              .sort((a, b) => b.version - a.version)
              .map((pv) => (
                <div key={pv.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-cyan-600 dark:text-[#22D3EE]">
                        v{pv.version}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-[#F1F5F9]">
                        {pv.reason}
                      </span>
                      {pv.serverValidated && (
                        <span className="text-[11px] font-mono text-[#14B8A6] flex items-center gap-0.5">
                          <Lock className="w-3 h-3" /> Server-Verified
                        </span>
                      )}
                    </div>
                    <p className="text-slate-500 dark:text-[#94A3B8]">{pv.summaryText}</p>
                  </div>
                  <div className="text-right font-mono tabular-nums text-slate-500 dark:text-[#94A3B8] shrink-0">
                    <div>{pv.blockCount} blocks</div>
                    <div>
                      {new Date(pv.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
