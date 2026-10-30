import React, { useState } from 'react';
import { ArrowRight, Check, FlaskConical, Play, RotateCcw } from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import { RealityShiftChangeSpec, ReplanPreviewResult } from '../types/lifeos';

export function SimulatorView() {
  const {
    profile,
    tasks,
    simulations,
    runWhatIfSimulation,
    applyRealityShiftPreview,
    showToast,
    isBusy,
  } = useLifeOS();

  const [simResult, setSimResult] = useState<ReplanPreviewResult | null>(null);
  const [activeTitle, setActiveTitle] = useState<string>('');
  const [confirmApply, setConfirmApply] = useState(false);

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

  const scenarios: Array<{
    id: string;
    tag: string;
    title: string;
    description: string;
    buildSpec: () => RealityShiftChangeSpec;
  }> = [
    {
      id: 'wake_9am',
      tag: 'MORNING CUTOFF SHIFT',
      title: 'What if I wake up 90 minutes later today?',
      description: 'Tests shifting morning start later while keeping fixed lectures locked.',
      buildSpec: () => ({
        scenarioType: 'late_start',
        summary: 'Hypothetical: Wake up 90 minutes later than planned',
        shiftStartMinutes: 90,
      }),
    },
    {
      id: 'study_extra_2h',
      tag: 'WORKLOAD EXPANSION',
      title: 'What if I add 2 extra hours of exam preparation?',
      description: 'Tests whether 120 additional minutes of high-priority study fits before deadlines.',
      buildSpec: () => ({
        scenarioType: 'task_overrun',
        summary: 'Hypothetical: Add 120 minutes of intensive exam preparation',
        overrunTaskId: tasks.find((t) => t.category === 'academic' && !t.isFixed)?.id,
        extraMinutes: 120,
      }),
    },
    {
      id: 'friday_project',
      tag: 'DEADLINE INSERTION',
      title: 'What if I add a new 90-minute coding project due tonight?',
      description: 'Tests inserting a high-urgency software deliverable into the current horizon.',
      buildSpec: () => ({
        scenarioType: 'urgent_deadline',
        summary: 'Hypothetical: Add 90-minute coding deliverable due tonight',
        urgentTask: {
          title: 'Hypothetical Full-Stack Feature Sprint',
          estimatedMinutes: 90,
          dueAt: new Date(Date.now() + 8 * 3600000).toISOString(),
          priority: 'critical',
          category: 'coding',
        },
      }),
    },
    {
      id: 'free_evening',
      tag: 'RECOVERY PROTECTION',
      title: 'What if I reserve tonight from 7:00 PM for personal downtime?',
      description: 'Protects the entire evening to see which flexible tasks shift to tomorrow.',
      buildSpec: () => ({
        scenarioType: 'reserve_evening_free',
        summary: 'Hypothetical: Reserve evening free from 19:00 onward',
        freeFromHHmm: '19:00',
      }),
    },
  ];

  const handleRunScenario = async (sc: (typeof scenarios)[0]) => {
    setConfirmApply(false);
    setActiveTitle(sc.title);
    const res = await runWhatIfSimulation(sc.title, sc.buildSpec());
    setSimResult(res);
  };

  const beforeFocusMinutes = simResult
    ? simResult.beforeBlocks
        .filter((b) => b.blockType === 'task')
        .reduce((acc, b) => acc + b.durationMinutes, 0)
    : 0;
  const afterFocusMinutes = simResult
    ? simResult.afterBlocks
        .filter((b) => b.blockType === 'task')
        .reduce((acc, b) => acc + b.durationMinutes, 0)
    : 0;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722] p-6">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-cyan-600 dark:text-[#22D3EE]">
          <FlaskConical className="w-3.5 h-3.5" />
          <span>Isolated Sandbox · Live Schedule Never Mutates Automatically</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-[#F1F5F9] mt-1">
          What-If Schedule Simulator
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-[#94A3B8] mt-1 max-w-2xl leading-relaxed">
          Experiment with distinct schedule configurations and compare trade-offs in focus capacity,
          displaced activities, and deadline feasibility before deciding.
        </p>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {scenarios.map((sc) => {
            const isSelected = activeTitle === sc.title && Boolean(simResult);
            return (
              <div
                key={sc.id}
                className={`rounded-xl border p-5 flex flex-col justify-between gap-4 transition-colors ${
                  isSelected
                    ? 'border-[#22D3EE] bg-[#22D3EE]/[0.05] dark:bg-[#161F2D]'
                    : 'border-slate-200/80 dark:border-slate-800/90 bg-slate-50/60 dark:bg-[#080C14]/70 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-600 dark:text-[#22D3EE]">
                    {sc.tag}
                  </span>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-[#F1F5F9]">
                    {sc.title}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-[#94A3B8] leading-relaxed">
                    {sc.description}
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleRunScenario(sc)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#22D3EE] hover:bg-[#22D3EE]/90 text-[#080C14] transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Simulate Configuration</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {simResult && (
        <section className="rounded-xl border border-[#22D3EE]/50 bg-white dark:bg-[#101722] p-6 space-y-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-cyan-600 dark:text-[#22D3EE]">
                Comparative Simulation Result
              </p>
              <h2 className="text-lg font-bold text-slate-900 dark:text-[#F1F5F9] mt-0.5">
                {activeTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#94A3B8] mt-0.5">
                {simResult.summaryText}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSimResult(null);
                  setConfirmApply(false);
                  showToast('Discarded simulation scenario. Live schedule untouched.', 'info');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#161F2D] text-slate-700 dark:text-[#F1F5F9] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Discard Scenario</span>
              </button>

              {!confirmApply ? (
                <button
                  type="button"
                  onClick={() => setConfirmApply(true)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#14B8A6] hover:bg-[#14B8A6]/90 text-[#080C14] cursor-pointer"
                >
                  Apply to Live Schedule...
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    await applyRealityShiftPreview(simResult);
                    setSimResult(null);
                    setConfirmApply(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#14B8A6] text-[#080C14] cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirm Apply</span>
                </button>
              )}
            </div>
          </div>

          {/* Quantitative Comparison Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#080C14] p-3.5">
              <p className="text-[11px] font-mono uppercase text-slate-500 dark:text-[#94A3B8]">
                Scheduled Focus Time
              </p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-[#F1F5F9] mt-0.5">
                {beforeFocusMinutes}m → {afterFocusMinutes}m
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#080C14] p-3.5">
              <p className="text-[11px] font-mono uppercase text-slate-500 dark:text-[#94A3B8]">
                Relocated Blocks
              </p>
              <p className="text-lg font-bold font-mono tabular-nums text-[#F59E0B] mt-0.5">
                {simResult.diffs.filter((d) => d.changeType === 'moved').length} moved
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#080C14] p-3.5">
              <p className="text-[11px] font-mono uppercase text-slate-500 dark:text-[#94A3B8]">
                Unscheduled Tasks
              </p>
              <p className="text-lg font-bold font-mono tabular-nums text-[#FB7185] mt-0.5">
                {simResult.unscheduledTasks.length} tasks
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#080C14] p-3.5">
              <p className="text-[11px] font-mono uppercase text-slate-500 dark:text-[#94A3B8]">
                Capacity Delta
              </p>
              <p className="text-lg font-bold font-mono tabular-nums text-[#22D3EE] mt-0.5">
                {simResult.capacityDeltaMinutes >= 0
                  ? `+${simResult.capacityDeltaMinutes}m`
                  : `${simResult.capacityDeltaMinutes}m`}
              </p>
            </div>
          </div>

          {/* Visual Time Difference List */}
          <div>
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-[#94A3B8] mb-2.5">
              Highlighted Time & Slot Differences
            </h3>
            <div className="divide-y divide-slate-200/80 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden">
              {simResult.diffs
                .filter((d) => d.changeType !== 'unchanged')
                .slice(0, 8)
                .map((d) => (
                  <div
                    key={`${d.blockId}_${d.changeType}`}
                    className="p-3 bg-slate-50/40 dark:bg-[#080C14]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-mono uppercase text-[10px] text-[#F59E0B] mr-2">
                        [{d.changeType}]
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-[#F1F5F9]">
                        {d.title}
                      </span>
                    </div>
                    <div className="font-mono tabular-nums text-slate-500 dark:text-[#94A3B8] flex items-center gap-2">
                      <span>{formatTimeShort(d.beforeStartAt)}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span className="text-cyan-600 dark:text-[#22D3EE] font-semibold">
                        {formatTimeShort(d.afterStartAt)}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </section>
      )}

      {/* Recent Simulation History */}
      {simulations.length > 0 && (
        <section className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722] p-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-[#F1F5F9] mb-3">
            Recent Sandbox Runs
          </h2>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            {simulations.slice(0, 6).map((s) => (
              <div key={s.id} className="py-2.5 flex items-center justify-between gap-4">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-[#F1F5F9]">{s.title}</span>
                  <p className="text-slate-500 dark:text-[#94A3B8]">{s.summaryText}</p>
                </div>
                <span className="font-mono tabular-nums text-slate-400 dark:text-[#94A3B8] shrink-0">
                  {s.scheduledCount} scheduled · {s.unscheduledCount} unscheduled
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
