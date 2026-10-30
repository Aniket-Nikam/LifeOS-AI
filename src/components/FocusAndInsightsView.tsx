import React, { useState, useEffect } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { computeFocusElapsedSeconds } from '../lib/scheduler';
import {
  exportWorkspaceToJson,
  exportScheduleBlocksToCsv,
  exportScheduleBlocksToIcs,
  parseAndValidateTasksCsv,
  CsvTaskImportPreviewItem
} from '../lib/exporters';
import { TaskCategory } from '../types/lifeos';
import {
  Play,
  Pause,
  CheckCircle2,
  Clock,
  BarChart3,
  Download,
  Upload,
  Settings,
  Sun,
  Moon,
  Cpu,
  RefreshCw,
  FileSpreadsheet,
  Calendar,
  FileJson,
  AlertCircle,
  Sparkles,
  Check
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from 'recharts';

export function MyDayFocusView() {
  const {
    tasks,
    scheduleBlocks,
    focusSessions,
    activeFocusSession,
    startFocusSession,
    pauseFocusSession,
    resumeFocusSession,
    finishFocusSession,
    toggleTaskComplete
  } = useLifeOS();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [notes, setNotes] = useState('');
  const [manualMinutes, setManualMinutes] = useState<string>('');

  useEffect(() => {
    if (!activeFocusSession || activeFocusSession.status !== 'running') return;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [activeFocusSession]);

  useEffect(() => {
    if (activeFocusSession) {
      setNotes(activeFocusSession.notes || '');
    }
  }, [activeFocusSession?.id]);

  const elapsedSeconds = activeFocusSession
    ? computeFocusElapsedSeconds(activeFocusSession, nowMs)
    : 0;

  const formatTimer = (secs: number) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const remSecs = secs % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(remSecs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(remSecs).padStart(2, '0')}`;
  };

  const activeTask = activeFocusSession?.taskId
    ? tasks.find((t) => t.id === activeFocusSession.taskId)
    : undefined;

  const todayBlocks = [...scheduleBlocks]
    .filter((b) => b.status !== 'skipped' && b.blockType !== 'break')
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const handleFinishSession = async (markTaskCompleted: boolean) => {
    const parsedOverride =
      manualMinutes.trim() !== '' && !Number.isNaN(Number(manualMinutes))
        ? Math.max(1, Math.round(Number(manualMinutes)))
        : undefined;
    await finishFocusSession(markTaskCompleted, notes, parsedOverride);
    setManualMinutes('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-cyan-600 dark:text-[#22D3EE]">
            <Clock className="w-3.5 h-3.5" />
            <span>Deep Execution & Effort Tracking</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-[#F1F5F9] font-display mt-1">
            My Day & Focus Timer
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#94A3B8] mt-1">
            Focus time logs actual effort against estimated and remaining effort without prematurely closing unfinished work.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Active Focus Console */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white dark:bg-[#101722] border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-6">
            {activeFocusSession ? (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-4">
                  <div>
                    <span className="text-xs font-mono uppercase tracking-wider text-cyan-600 dark:text-[#22D3EE]">
                      {activeFocusSession.status === 'running' ? 'Session In Progress' : 'Session Paused'}
                    </span>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-[#F1F5F9] mt-1">
                      {activeTask?.title || activeFocusSession.taskTitle || 'Active Focus Session'}
                    </h2>
                    {activeTask && (
                      <div className="flex flex-wrap items-center gap-4 mt-2 text-xs font-mono tabular-nums text-slate-500 dark:text-[#94A3B8]">
                        <span>Estimated: {activeTask.estimatedMinutes}m</span>
                        <span>Logged So Far: {activeTask.actualMinutes}m</span>
                        <span>Remaining Est: {activeTask.remainingMinutes}m</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-xs text-slate-500 dark:text-[#94A3B8] block">Planned Session</span>
                    <span className="text-base font-bold text-slate-900 dark:text-[#F1F5F9] tabular-nums">
                      {activeFocusSession.plannedMinutes}m
                    </span>
                  </div>
                </div>

                {/* Big Timer Readout */}
                <div className="py-8 text-center bg-slate-50 dark:bg-[#080C14] border border-slate-200/80 dark:border-slate-800 rounded-xl">
                  <div className="text-5xl md:text-6xl font-bold font-mono tabular-nums tracking-tight text-slate-900 dark:text-[#F1F5F9]">
                    {formatTimer(elapsedSeconds)}
                  </div>
                  <div className="mt-2 text-xs font-mono text-slate-500 dark:text-[#94A3B8]">
                    Elapsed Time · Target {activeFocusSession.plannedMinutes} min
                  </div>
                  {elapsedSeconds >= activeFocusSession.plannedMinutes * 60 && (
                    <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#F59E0B]">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Planned session length reached. Task remains open until you explicitly complete it.</span>
                    </div>
                  )}
                </div>

                {/* Primary Controls */}
                <div className="flex flex-wrap items-center gap-3">
                  {activeFocusSession.status === 'running' ? (
                    <button
                      onClick={() => pauseFocusSession()}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#F59E0B] hover:bg-[#F59E0B]/90 text-[#080C14] font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
                    >
                      <Pause className="w-4 h-4" />
                      <span>Pause Timer</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => resumeFocusSession()}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#22D3EE] hover:bg-[#22D3EE]/90 text-[#080C14] font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
                    >
                      <Play className="w-4 h-4" />
                      <span>Resume Timer</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleFinishSession(false)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-200 dark:bg-[#161F2D] hover:bg-slate-300 dark:hover:bg-slate-800 text-slate-900 dark:text-[#F1F5F9] font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
                  >
                    <Clock className="w-4 h-4" />
                    <span>Log Effort & Keep Task Open</span>
                  </button>

                  <button
                    onClick={() => handleFinishSession(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#14B8A6] hover:bg-[#14B8A6]/90 text-[#080C14] font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Log Effort & Mark Task Complete</span>
                  </button>
                </div>

                {/* Session Notes & Manual Override */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-[#94A3B8] mb-1">
                      Session Execution Notes
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="What progress did you make or what remains?"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#080C14] text-slate-900 dark:text-[#F1F5F9]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-[#94A3B8] mb-1">
                      Override Minutes (Optional)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={480}
                      value={manualMinutes}
                      onChange={(e) => setManualMinutes(e.target.value)}
                      placeholder="Use timer default"
                      className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#080C14] text-slate-900 dark:text-[#F1F5F9]"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center space-y-4">
                <div className="w-12 h-12 rounded-xl bg-[#22D3EE]/10 border border-[#22D3EE]/30 flex items-center justify-center mx-auto text-[#22D3EE]">
                  <Play className="w-6 h-6" />
                </div>
                <div className="max-w-md mx-auto">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-[#F1F5F9]">
                    No Active Focus Timer
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-[#94A3B8] mt-1">
                    Select any scheduled block or task from your queue to start a live focus timer. Elapsed time persists accurately even if you switch tabs or reload.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Recent Focus Sessions Log */}
          <div className="bg-white dark:bg-[#101722] border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-[#94A3B8] mb-4">
              Logged Focus Sessions ({focusSessions.length})
            </h3>
            {focusSessions.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-[#94A3B8]">
                No focus sessions logged yet. Start a session above to record actual vs. planned effort.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {focusSessions.slice(0, 8).map((sess) => {
                  const actualMins = Math.max(1, Math.round(sess.accumulatedSeconds / 60));
                  return (
                    <div key={sess.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-[#F1F5F9]">
                          {sess.taskTitle || 'Focus Session'}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-[#94A3B8]">
                          Status: {sess.status} {sess.notes ? `· "${sess.notes}"` : ''}
                        </div>
                      </div>
                      <div className="text-right font-mono text-xs tabular-nums">
                        <div className="font-semibold text-slate-900 dark:text-[#F1F5F9]">
                          Logged: {actualMins}m / Planned: {sess.plannedMinutes}m
                        </div>
                        <div className="text-slate-500 dark:text-[#94A3B8]">
                          {new Date(sess.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Today's Execution Queue */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-[#101722] border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-[#94A3B8] mb-4">
              Execution Queue ({todayBlocks.length} blocks)
            </h3>
            <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
              {todayBlocks.map((block) => {
                const linkedTask = block.taskId
                  ? tasks.find((t) => t.id === block.taskId)
                  : tasks.find((t) => t.title === block.title);
                const durMin = block.durationMinutes || 45;

                return (
                  <div
                    key={block.id}
                    className="p-3.5 rounded-lg border border-slate-200/80 dark:border-slate-800/90 bg-slate-50/60 dark:bg-[#080C14]/70 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-[#94A3B8] tabular-nums">
                        <span>
                          {new Date(block.startAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        <span>·</span>
                        <span>{durMin}m</span>
                        <span>·</span>
                        <span className="uppercase">{block.blockType}</span>
                      </div>
                      <div className="font-semibold text-sm text-slate-900 dark:text-[#F1F5F9] truncate mt-0.5">
                        {block.title}
                      </div>
                      {linkedTask && (
                        <div className="text-xs font-mono text-slate-500 dark:text-[#94A3B8] mt-1 tabular-nums">
                          Est {linkedTask.estimatedMinutes}m · Actual {linkedTask.actualMinutes}m · Rem {linkedTask.remainingMinutes}m
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {linkedTask && (
                        <button
                          onClick={() => startFocusSession(linkedTask.id, durMin)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22D3EE] hover:bg-[#22D3EE]/90 text-[#080C14] font-semibold text-xs transition-colors cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Focus</span>
                        </button>
                      )}
                      {linkedTask && linkedTask.status !== 'complete' && (
                        <button
                          onClick={() => toggleTaskComplete(linkedTask.id)}
                          title="Mark task complete"
                          className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-[#14B8A6] text-slate-600 dark:text-[#94A3B8] hover:text-[#14B8A6] transition-colors cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InsightsView() {
  const {
    profile,
    tasks,
    scheduleBlocks,
    planVersions,
    focusSessions,
    activities,
    saveTask
  } = useLifeOS();

  const [csvText, setCsvText] = useState('');
  const [csvPreview, setCsvPreview] = useState<CsvTaskImportPreviewItem[] | null>(null);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  const categories: TaskCategory[] = ['academic', 'coding', 'work', 'fitness', 'hobby', 'personal'];
  const chartData = categories
    .map((cat) => {
      const catTasks = tasks.filter((t) => t.category === cat);
      const estimated = catTasks.reduce((acc, t) => acc + (t.estimatedMinutes || 0), 0);
      const actual = catTasks.reduce((acc, t) => acc + (t.actualMinutes || 0), 0);
      const scheduled = scheduleBlocks
        .filter((b) => b.category === cat && b.status !== 'skipped')
        .reduce((acc, b) => acc + (b.durationMinutes || 0), 0);
      return {
        category: cat,
        Estimated: estimated,
        Actual: actual,
        Scheduled: scheduled
      };
    })
    .filter((row) => row.Estimated > 0 || row.Actual > 0 || row.Scheduled > 0);

  const completedTasks = tasks.filter((t) => t.status === 'complete').length;
  const totalEstimatedMin = tasks.reduce((s, t) => s + t.estimatedMinutes, 0);
  const totalActualMin = tasks.reduce((s, t) => s + t.actualMinutes, 0);
  const overdueTasks = tasks.filter(
    (t) => t.status !== 'complete' && t.dueAt && new Date(t.dueAt).getTime() < Date.now()
  );

  // Grounded Insights with explicit basis
  const insightsList: Array<{ title: string; observation: string; basis: string }> = [];
  if (tasks.length > 0) {
    const highPrioBlocks = scheduleBlocks.filter(
      (b) => b.priority === 'critical' || b.priority === 'high'
    );
    const morningHighPrio = highPrioBlocks.filter((b) => {
      const hr = new Date(b.startAt).getHours();
      return hr >= 7 && hr < 14;
    });
    insightsList.push({
      title: 'Peak Cognitive Window Alignment',
      observation:
        highPrioBlocks.length > 0
          ? `${Math.round((morningHighPrio.length / highPrioBlocks.length) * 100)}% of high/critical priority blocks are scheduled inside your peak morning focus window.`
          : 'No high-priority blocks are currently on the active timeline.',
      basis: `Computed across ${highPrioBlocks.length} high/critical priority schedule blocks and focus window (${profile?.focusStartHHmm || '09:00'}–${profile?.focusEndHHmm || '13:00'}).`
    });

    const academicCodingTasks = tasks.filter(
      (t) => t.category === 'academic' || t.category === 'coding'
    );
    const estSum = academicCodingTasks.reduce((s, t) => s + t.estimatedMinutes, 0);
    const actSum = academicCodingTasks.reduce((s, t) => s + t.actualMinutes, 0);
    insightsList.push({
      title: 'Estimation Accuracy & Remaining Effort',
      observation:
        actSum > 0
          ? `Logged ${actSum}m of actual effort against ${estSum}m estimated across ${academicCodingTasks.length} academic & coding tasks.`
          : `You have ${estSum}m of estimated academic & coding effort ready for focus tracking.`,
      basis: `Derived from ${academicCodingTasks.length} tasks in 'academic' and 'coding' categories and ${focusSessions.length} logged focus sessions.`
    });

    insightsList.push({
      title: 'Adaptive Replanning Velocity',
      observation:
        planVersions.length > 1
          ? `Your schedule has evolved across ${planVersions.length} verified plan versions without breaking locked commitments.`
          : 'You are on your initial baseline schedule version (v1).',
      basis: `Based on ${planVersions.length} persisted plan version snapshots in your workspace history.`
    });
  }

  const triggerDownload = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const content = exportWorkspaceToJson({
      exportedAt: new Date().toISOString(),
      timezone: profile?.timezone || 'America/New_York',
      tasks,
      scheduleBlocks,
      activities
    });
    triggerDownload(
      `lifeos-workspace-${new Date().toISOString().slice(0, 10)}.json`,
      content,
      'application/json'
    );
  };

  const handleDownloadCsv = () => {
    const content = exportScheduleBlocksToCsv(scheduleBlocks);
    triggerDownload(
      `lifeos-schedule-${new Date().toISOString().slice(0, 10)}.csv`,
      content,
      'text/csv;charset=utf-8;'
    );
  };

  const handleDownloadIcs = () => {
    const content = exportScheduleBlocksToIcs(
      scheduleBlocks,
      profile?.timezone || 'America/New_York'
    );
    triggerDownload(
      `lifeos-calendar-${new Date().toISOString().slice(0, 10)}.ics`,
      content,
      'text/calendar;charset=utf-8;'
    );
  };

  const handlePreviewCsv = () => {
    const existingSet = new Set(tasks.map((t) => t.title.toLowerCase()));
    const result = parseAndValidateTasksCsv(csvText, existingSet);
    setCsvPreview(result);
    setImportFeedback(null);
  };

  const validPreviewItems = (csvPreview || []).filter((item) => item.valid && item.candidate);
  const invalidPreviewItems = (csvPreview || []).filter((item) => !item.valid);

  const handleConfirmCsvImport = async () => {
    if (validPreviewItems.length === 0) return;
    for (const item of validPreviewItems) {
      if (item.candidate) {
        await saveTask(item.candidate);
      }
    }
    setImportFeedback(`Imported ${validPreviewItems.length} valid task(s) into your workspace.`);
    setCsvPreview(null);
    setCsvText('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-cyan-600 dark:text-[#22D3EE]">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Analytics, Verification & Data Portability</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-[#F1F5F9] font-display mt-1">
            Insights & Interoperability
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#94A3B8] mt-1">
            Every metric and insight is calculated directly from your tasks, schedule blocks, and focus logs.
          </p>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#101722] border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4">
          <div className="text-[11px] font-mono uppercase text-slate-500 dark:text-[#94A3B8]">
            Task Completion
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#F1F5F9] mt-1">
            {completedTasks} / {tasks.length}
          </div>
          <div className="text-xs text-slate-500 dark:text-[#94A3B8] mt-1">
            {overdueTasks.length} overdue tasks
          </div>
        </div>
        <div className="bg-white dark:bg-[#101722] border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4">
          <div className="text-[11px] font-mono uppercase text-slate-500 dark:text-[#94A3B8]">
            Est vs. Logged Effort
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#F1F5F9] mt-1">
            {totalActualMin}m / {totalEstimatedMin}m
          </div>
          <div className="text-xs text-slate-500 dark:text-[#94A3B8] mt-1">
            Across {focusSessions.length} focus sessions
          </div>
        </div>
        <div className="bg-white dark:bg-[#101722] border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4">
          <div className="text-[11px] font-mono uppercase text-slate-500 dark:text-[#94A3B8]">
            Scheduled Blocks
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#F1F5F9] mt-1">
            {scheduleBlocks.length}
          </div>
          <div className="text-xs text-slate-500 dark:text-[#94A3B8] mt-1">
            Active timeline allocations
          </div>
        </div>
        <div className="bg-white dark:bg-[#101722] border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4">
          <div className="text-[11px] font-mono uppercase text-slate-500 dark:text-[#94A3B8]">
            Plan Revisions
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#F1F5F9] mt-1">
            v{planVersions.length || 1}
          </div>
          <div className="text-xs text-slate-500 dark:text-[#94A3B8] mt-1">
            Audited schedule snapshots
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Category Effort Chart */}
        <div className="lg:col-span-7 bg-white dark:bg-[#101722] border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5">
          <h2 className="text-base font-bold text-slate-900 dark:text-[#F1F5F9] mb-1">
            Planned, Scheduled & Actual Minutes by Category
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#94A3B8] mb-4">
            Compares task estimates against scheduled block time and logged focus session minutes.
          </p>

          {chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-500 dark:text-[#94A3B8]">
              Not enough task or schedule data yet to render category distribution.
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
                  <XAxis dataKey="category" stroke="#94A3B8" fontSize={12} />
                  <YAxis stroke="#94A3B8" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#101722',
                      borderColor: '#1E293B',
                      color: '#F1F5F9',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="Estimated" fill="#22D3EE" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Scheduled" fill="#A78BFA" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Actual" fill="#14B8A6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Grounded Insights */}
        <div className="lg:col-span-5 bg-white dark:bg-[#101722] border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#22D3EE]" />
            <h2 className="text-base font-bold text-slate-900 dark:text-[#F1F5F9]">
              Data-Backed Schedule Diagnostics
            </h2>
          </div>

          {insightsList.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-[#94A3B8]">
              Add tasks and generate a plan to see grounded diagnostics with explicit data basis.
            </p>
          ) : (
            <div className="space-y-3">
              {insightsList.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-[#080C14]/70"
                >
                  <div className="font-semibold text-sm text-slate-900 dark:text-[#F1F5F9]">
                    {item.title}
                  </div>
                  <p className="text-xs text-slate-700 dark:text-[#94A3B8] mt-1">
                    {item.observation}
                  </p>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-[#94A3B8]/80 mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-800/70">
                    Basis: {item.basis}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Export & CSV Import Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white dark:bg-[#101722] border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-[#F1F5F9] flex items-center gap-2">
            <Download className="w-4 h-4 text-[#22D3EE]" />
            <span>Export Workspace & Calendar</span>
          </h2>
          <p className="text-xs text-slate-600 dark:text-[#94A3B8]">
            Export your entire LifeOS state as structured JSON, formula-safe CSV, or RFC 5545 `.ics` for external calendar clients.
          </p>
          <div className="space-y-2.5">
            <button
              onClick={handleDownloadJson}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-[#22D3EE]/50 bg-slate-50 dark:bg-[#080C14] text-sm font-medium text-slate-900 dark:text-[#F1F5F9] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <FileJson className="w-4 h-4 text-[#22D3EE]" />
                <span>Download Full Workspace (.json)</span>
              </span>
              <span className="text-xs font-mono text-slate-500">JSON</span>
            </button>

            <button
              onClick={handleDownloadCsv}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-[#22D3EE]/50 bg-slate-50 dark:bg-[#080C14] text-sm font-medium text-slate-900 dark:text-[#F1F5F9] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[#14B8A6]" />
                <span>Download Formula-Safe Schedule (.csv)</span>
              </span>
              <span className="text-xs font-mono text-slate-500">CSV</span>
            </button>

            <button
              onClick={handleDownloadIcs}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-[#22D3EE]/50 bg-slate-50 dark:bg-[#080C14] text-sm font-medium text-slate-900 dark:text-[#F1F5F9] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#A78BFA]" />
                <span>Export Standard Calendar (.ics)</span>
              </span>
              <span className="text-xs font-mono text-slate-500">RFC 5545</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white dark:bg-[#101722] border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-[#F1F5F9] flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#22D3EE]" />
              <span>CSV Task Import with Validation Preview</span>
            </h2>
            <button
              onClick={() =>
                setCsvText(
                  `Title,Category,Priority,EstimatedMinutes,DueISO,Splittable,Description\nPrepare Operating Systems Lab,coding,high,90,,true,Kernel thread synchronization\nEvening Mobility Session,fitness,medium,30,,false,Post-study recovery`
                )
              }
              className="text-xs font-mono text-cyan-600 dark:text-[#22D3EE] hover:underline cursor-pointer"
            >
              Load Sample CSV
            </button>
          </div>

          <textarea
            rows={4}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Title,Category,Priority,EstimatedMinutes,DueISO,Splittable,Description&#10;Write Literature Review,academic,high,60,,true,Draft section 2"
            className="w-full p-3 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C14] text-slate-900 dark:text-[#F1F5F9]"
          />

          <div className="flex items-center gap-3">
            <button
              onClick={handlePreviewCsv}
              disabled={!csvText.trim()}
              className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-[#161F2D] hover:bg-slate-800 dark:hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Validate & Preview CSV
            </button>

            {validPreviewItems.length > 0 && (
              <button
                onClick={handleConfirmCsvImport}
                className="px-4 py-2 rounded-lg bg-[#22D3EE] hover:bg-[#22D3EE]/90 text-[#080C14] text-xs font-semibold transition-colors cursor-pointer"
              >
                Import {validPreviewItems.length} Valid Row(s)
              </button>
            )}
          </div>

          {importFeedback && (
            <div className="p-3 rounded-lg bg-[#14B8A6]/10 border border-[#14B8A6]/30 text-xs text-teal-700 dark:text-[#14B8A6]">
              {importFeedback}
            </div>
          )}

          {csvPreview && (
            <div className="space-y-2 text-xs">
              <div className="font-mono text-slate-600 dark:text-[#94A3B8]">
                Valid Rows: {validPreviewItems.length} · Invalid Rows: {invalidPreviewItems.length}
              </div>
              {invalidPreviewItems.length > 0 && (
                <div className="p-2.5 rounded bg-[#FB7185]/10 border border-[#FB7185]/30 text-[#FB7185] space-y-1">
                  {invalidPreviewItems.map((item) => (
                    <div key={item.rowNumber}>
                      Row {item.rowNumber}: {item.errors.join(' ')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SettingsView({ onOpenOnboarding }: { onOpenOnboarding: () => void }) {
  const {
    profile,
    isDemoMode,
    saveProfile,
    toggleTheme,
    loadStudentScenarioIntoAccount,
    resetStudentDemoData
  } = useLifeOS();

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [timezone, setTimezone] = useState(profile?.timezone || 'America/New_York');
  const [sleepStartHHmm, setSleepStartHHmm] = useState(profile?.sleepStartHHmm || '23:30');
  const [sleepEndHHmm, setSleepEndHHmm] = useState(profile?.sleepEndHHmm || '07:30');
  const [focusStartHHmm, setFocusStartHHmm] = useState(profile?.focusStartHHmm || '09:00');
  const [focusEndHHmm, setFocusEndHHmm] = useState(profile?.focusEndHHmm || '13:00');
  const [breakDuration, setBreakDuration] = useState(profile?.breakDurationMinutes ?? 15);
  const [maxSession, setMaxSession] = useState(profile?.maxContinuousWorkMinutes ?? 90);
  const [savedBanner, setSavedBanner] = useState(false);

  // Server-Side Gemini Model Configuration
  const [aiConfig, setAiConfig] = useState<{
    configuredModel: string;
    supportedModels: string[];
  } | null>(null);
  const [selectedModel, setSelectedModel] = useState('');
  const [aiStatusMsg, setAiStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setTimezone(profile.timezone);
      setSleepStartHHmm(profile.sleepStartHHmm);
      setSleepEndHHmm(profile.sleepEndHHmm);
      setFocusStartHHmm(profile.focusStartHHmm);
      setFocusEndHHmm(profile.focusEndHHmm);
      setBreakDuration(profile.breakDurationMinutes);
      setMaxSession(profile.maxContinuousWorkMinutes);
    }
  }, [profile]);

  useEffect(() => {
    fetch('/api/ai/config')
      .then((r) => r.json())
      .then((data) => {
        setAiConfig(data);
        setSelectedModel(data.configuredModel || 'gemini-2.5-flash');
      })
      .catch(() => {});
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveProfile({
      displayName,
      timezone,
      sleepStartHHmm,
      sleepEndHHmm,
      focusStartHHmm,
      focusEndHHmm,
      breakDurationMinutes: Number(breakDuration),
      maxContinuousWorkMinutes: Number(maxSession)
    });
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 3000);
  };

  const handleSaveAiModel = async () => {
    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel })
      });
      const data = await res.json();
      if (res.ok) {
        setAiConfig((prev) => (prev ? { ...prev, configuredModel: data.configuredModel } : prev));
        setAiStatusMsg(`Active server-side Gemini model updated to ${data.configuredModel}`);
      } else {
        setAiStatusMsg(data.error || 'Could not update model');
      }
    } catch {
      setAiStatusMsg('Network error updating AI model config');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="border-b border-slate-200/80 dark:border-slate-800/80 pb-5">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-cyan-600 dark:text-[#22D3EE]">
          <Settings className="w-3.5 h-3.5" />
          <span>Constraints, Preferences & AI Runtime</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-[#F1F5F9] font-display mt-1">
          Operating System Settings
        </h1>
      </div>

      <form
        onSubmit={handleSaveProfile}
        className="bg-white dark:bg-[#101722] border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-6 space-y-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-[#F1F5F9]">
            Personal Scheduling Boundaries
          </h2>
          <button
            type="button"
            onClick={() => toggleTheme()}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#161F2D] text-xs font-semibold text-slate-700 dark:text-[#F1F5F9] cursor-pointer"
          >
            {profile?.theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            <span>Theme: {profile?.theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-[#94A3B8] mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C14] text-slate-900 dark:text-[#F1F5F9]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-[#94A3B8] mb-1">
              IANA Timezone
            </label>
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C14] text-slate-900 dark:text-[#F1F5F9]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-[#94A3B8] mb-1">
              Sleep Start (24h HH:mm, supports overnight)
            </label>
            <input
              type="time"
              value={sleepStartHHmm}
              onChange={(e) => setSleepStartHHmm(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C14] text-slate-900 dark:text-[#F1F5F9]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-[#94A3B8] mb-1">
              Wake Time / Sleep End (24h HH:mm)
            </label>
            <input
              type="time"
              value={sleepEndHHmm}
              onChange={(e) => setSleepEndHHmm(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C14] text-slate-900 dark:text-[#F1F5F9]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-[#94A3B8] mb-1">
              Peak Focus Window Start
            </label>
            <input
              type="time"
              value={focusStartHHmm}
              onChange={(e) => setFocusStartHHmm(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C14] text-slate-900 dark:text-[#F1F5F9]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-[#94A3B8] mb-1">
              Peak Focus Window End
            </label>
            <input
              type="time"
              value={focusEndHHmm}
              onChange={(e) => setFocusEndHHmm(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C14] text-slate-900 dark:text-[#F1F5F9]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-[#94A3B8] mb-1">
              Break Buffer Between Sessions (Minutes)
            </label>
            <input
              type="number"
              min={0}
              max={60}
              value={breakDuration}
              onChange={(e) => setBreakDuration(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C14] text-slate-900 dark:text-[#F1F5F9]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-[#94A3B8] mb-1">
              Max Continuous Deep Work Session (Minutes)
            </label>
            <input
              type="number"
              min={25}
              max={240}
              value={maxSession}
              onChange={(e) => setMaxSession(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C14] text-slate-900 dark:text-[#F1F5F9]"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[#22D3EE] hover:bg-[#22D3EE]/90 text-[#080C14] font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
          >
            Save Scheduling Profile
          </button>
          {savedBanner && (
            <span className="text-xs font-medium text-[#14B8A6]">
              Preferences saved and applied to future scheduling runs.
            </span>
          )}
        </div>
      </form>

      {/* Server-Side Gemini Model Configuration */}
      <div className="bg-white dark:bg-[#101722] border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#22D3EE]" />
          <h2 className="text-base font-bold text-slate-900 dark:text-[#F1F5F9]">
            Server-Side Gemini Model Configuration
          </h2>
        </div>
        <p className="text-xs text-slate-600 dark:text-[#94A3B8]">
          All AI requests execute server-side with automatic fallback across verified Gemini models. You can configure the primary model below.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C14] text-slate-900 dark:text-[#F1F5F9]"
          >
            {(aiConfig?.supportedModels || [
              'gemini-2.5-flash',
              'gemini-flash-latest',
              'gemini-3-flash-preview',
              'gemini-3.8-flash',
              'gemini-3.1-flash-lite'
            ]).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleSaveAiModel}
            className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-[#161F2D] hover:bg-slate-800 dark:hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Apply Server Model
          </button>
        </div>
        {aiStatusMsg && (
          <div className="text-xs font-mono text-cyan-600 dark:text-[#22D3EE]">{aiStatusMsg}</div>
        )}
      </div>

      {/* Workspace & Scenario Controls */}
      <div className="bg-white dark:bg-[#101722] border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-[#F1F5F9]">
          Workspace Setup & Demonstration Dataset
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onOpenOnboarding}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#161F2D] text-xs font-semibold text-slate-800 dark:text-[#F1F5F9] hover:border-[#22D3EE] transition-colors cursor-pointer"
          >
            Launch Guided Onboarding Wizard
          </button>

          <button
            type="button"
            onClick={() => loadStudentScenarioIntoAccount()}
            className="px-4 py-2 rounded-lg bg-[#A78BFA] hover:bg-[#A78BFA]/90 text-[#080C14] text-xs font-semibold transition-colors cursor-pointer"
          >
            Load College Student Demo Scenario
          </button>

          {isDemoMode && (
            <button
              type="button"
              onClick={() => resetStudentDemoData()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#FB7185]/40 text-[#FB7185] text-xs font-semibold hover:bg-[#FB7185]/10 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset Demo Sandbox to Clean Baseline</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
