import React, { useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Unlock,
} from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import {
  addCalendarDays,
  formatDateKeyInTz,
  listHorizonDates,
  localDateHHmmToEpochMs,
} from '../lib/scheduler';
import { BlockCategory, ScheduleBlock } from '../types/lifeos';

const CATEGORY_STYLES: Record<
  BlockCategory,
  { border: string; tint: string; text: string; dot: string }
> = {
  academic: {
    border: 'border-l-[#22D3EE]',
    tint: 'bg-[#22D3EE]/[0.05] dark:bg-[#22D3EE]/[0.06]',
    text: 'text-cyan-700 dark:text-[#22D3EE]',
    dot: 'bg-[#22D3EE]',
  },
  coding: {
    border: 'border-l-[#14B8A6]',
    tint: 'bg-[#14B8A6]/[0.05] dark:bg-[#14B8A6]/[0.06]',
    text: 'text-teal-700 dark:text-[#14B8A6]',
    dot: 'bg-[#14B8A6]',
  },
  work: {
    border: 'border-l-sky-400',
    tint: 'bg-sky-500/[0.05] dark:bg-sky-400/[0.06]',
    text: 'text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-400',
  },
  fitness: {
    border: 'border-l-emerald-400',
    tint: 'bg-emerald-500/[0.05] dark:bg-emerald-400/[0.06]',
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-400',
  },
  hobby: {
    border: 'border-l-[#F59E0B]',
    tint: 'bg-[#F59E0B]/[0.05] dark:bg-[#F59E0B]/[0.06]',
    text: 'text-amber-700 dark:text-[#F59E0B]',
    dot: 'bg-[#F59E0B]',
  },
  personal: {
    border: 'border-l-[#A78BFA]',
    tint: 'bg-[#A78BFA]/[0.05] dark:bg-[#A78BFA]/[0.06]',
    text: 'text-violet-700 dark:text-[#A78BFA]',
    dot: 'bg-[#A78BFA]',
  },
  break: {
    border: 'border-l-slate-400 dark:border-l-slate-600',
    tint: 'bg-slate-100/50 dark:bg-[#080C14]/50',
    text: 'text-slate-500 dark:text-[#94A3B8]',
    dot: 'bg-slate-500',
  },
  external: {
    border: 'border-l-indigo-400',
    tint: 'bg-indigo-500/[0.05] dark:bg-indigo-400/[0.06]',
    text: 'text-indigo-700 dark:text-indigo-300',
    dot: 'bg-indigo-400',
  },
};

function DraggableScheduleCard({
  block,
  timezone,
  onEdit,
  onToggleLock,
  onResizeDelta,
}: {
  block: ScheduleBlock;
  timezone: string;
  onEdit: (b: ScheduleBlock) => void;
  onToggleLock: (b: ScheduleBlock) => void;
  onResizeDelta: (b: ScheduleBlock, deltaMins: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.id,
    disabled: block.locked,
    data: { block },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const formatHHmm = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: timezone,
      }).format(new Date(iso));
    } catch {
      return iso.slice(11, 16);
    }
  };

  const catStyle = CATEGORY_STYLES[block.category] || CATEGORY_STYLES.academic;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group rounded-lg border border-slate-200/80 dark:border-slate-800/90 border-l-4 ${catStyle.border} ${catStyle.tint} p-2.5 transition-all ${
        isDragging ? 'opacity-65 z-30 shadow-xl ring-1 ring-[#22D3EE]' : 'hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          {...(!block.locked ? { ...listeners, ...attributes } : {})}
          className={`min-w-0 flex-1 ${!block.locked ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-[#94A3B8]">
            <span>
              {formatHHmm(block.startAt)}–{formatHHmm(block.endAt)}
            </span>
            <span>·</span>
            <span>{block.durationMinutes}m</span>
          </div>
          <p
            className={`text-xs font-semibold mt-0.5 truncate ${
              block.status === 'completed'
                ? 'line-through text-slate-400'
                : 'text-slate-900 dark:text-[#F1F5F9]'
            }`}
          >
            {block.title}
          </p>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-[#94A3B8] capitalize mt-1">
            <span className={`w-1.5 h-1.5 rounded-full ${catStyle.dot}`} />
            <span>{block.category}</span>
            <span>·</span>
            <span>{block.priority}</span>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onToggleLock(block)}
            aria-label={block.locked ? `Unlock ${block.title}` : `Lock ${block.title}`}
            className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-[#161F2D] text-slate-400 hover:text-slate-200 cursor-pointer"
            title={block.locked ? 'Locked (Click to Unlock)' : 'Flexible (Click to Lock)'}
          >
            {block.locked ? (
              <Lock className="w-3 h-3 text-indigo-400" />
            ) : (
              <Unlock className="w-3 h-3" />
            )}
          </button>
          <button
            type="button"
            onClick={() => onEdit(block)}
            aria-label={`Edit ${block.title}`}
            className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-[#161F2D] text-slate-400 hover:text-[#22D3EE] cursor-pointer"
            title="Inspect & Edit Block"
          >
            <Edit3 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {!block.locked && (
        <div className="mt-2 pt-1.5 border-t border-slate-200/50 dark:border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500 dark:text-[#94A3B8]">
          <span>Duration</span>
          <div className="flex items-center gap-1 font-mono">
            <button
              type="button"
              onClick={() => onResizeDelta(block, -15)}
              disabled={block.durationMinutes <= 15}
              className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-[#161F2D] disabled:opacity-40 cursor-pointer"
            >
              -15m
            </button>
            <button
              type="button"
              onClick={() => onResizeDelta(block, 15)}
              className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-[#161F2D] cursor-pointer"
            >
              +15m
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DroppableDayColumn({
  dateKey,
  isToday,
  totalMinutes,
  children,
  onClickCreateOnDay,
}: {
  dateKey: string;
  isToday: boolean;
  totalMinutes: number;
  children: React.ReactNode;
  onClickCreateOnDay: (dateKey: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `day_${dateKey}`,
    data: { dateKey },
  });

  const dayMeta = useMemo(() => {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return {
      weekday: dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      monthDay: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    };
  }, [dateKey]);

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border p-3 flex flex-col justify-between min-h-[380px] transition-colors ${
        isOver
          ? 'border-[#22D3EE] bg-[#22D3EE]/[0.06]'
          : isToday
          ? 'border-[#22D3EE]/50 bg-white dark:bg-[#101722]'
          : 'border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722]/75'
      }`}
    >
      <div>
        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200/80 dark:border-slate-800/80">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-900 dark:text-[#F1F5F9]">
                {dayMeta.weekday}
              </span>
              {isToday && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE]" title="Today" />
              )}
            </div>
            <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-[#94A3B8]">
              {dayMeta.monthDay} · {(totalMinutes / 60).toFixed(1)}h
            </p>
          </div>
          <button
            type="button"
            onClick={() => onClickCreateOnDay(dateKey)}
            aria-label={`Add block on ${dateKey}`}
            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-[#161F2D] text-slate-400 hover:text-[#22D3EE] cursor-pointer"
            title="Schedule task on this date"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  );
}

export function TimeCanvasView({ onQuickAddTask }: { onQuickAddTask: () => void }) {
  const {
    profile,
    scheduleBlocks,
    updateScheduleBlock,
    deleteScheduleBlock,
    generateScheduleForHorizon,
    toggleTaskComplete,
    startFocusSession,
    setActiveTab,
    isBusy,
  } = useLifeOS();

  const tz = profile?.timezone || 'UTC';
  const todayKey = formatDateKeyInTz(Date.now(), tz);

  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayKey);
  const [editingBlock, setEditingBlock] = useState<ScheduleBlock | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDateKey, setEditDateKey] = useState('');
  const [editStartHHmm, setEditStartHHmm] = useState('09:00');
  const [editDuration, setEditDuration] = useState(60);
  const [editLocked, setEditLocked] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const weekDates = useMemo(
    () => listHorizonDates(selectedDateKey, addCalendarDays(selectedDateKey, 6)),
    [selectedDateKey]
  );

  const dailyBlocks = useMemo(
    () =>
      scheduleBlocks
        .filter((b) => b.dateKey === selectedDateKey)
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
    [scheduleBlocks, selectedDateKey]
  );

  const formatHHmmInTz = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: tz,
      }).format(new Date(iso));
    } catch {
      return '09:00';
    }
  };

  const openEditModal = (block: ScheduleBlock) => {
    setEditingBlock(block);
    setEditTitle(block.title);
    setEditDateKey(block.dateKey);
    setEditStartHHmm(formatHHmmInTz(block.startAt));
    setEditDuration(block.durationMinutes);
    setEditLocked(block.locked);
  };

  const handleSaveModalEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBlock) return;
    const newStartMs = localDateHHmmToEpochMs(editDateKey, editStartHHmm, tz);
    const newEndMs = newStartMs + Math.max(5, editDuration) * 60000;
    const ok = await updateScheduleBlock(editingBlock.id, {
      title: editTitle.trim() || editingBlock.title,
      dateKey: editDateKey,
      startAt: new Date(newStartMs).toISOString(),
      endAt: new Date(newEndMs).toISOString(),
      durationMinutes: Math.max(5, editDuration),
      locked: editLocked,
    });
    if (ok) {
      setEditingBlock(null);
    }
  };

  const handleToggleLock = async (block: ScheduleBlock) => {
    await updateScheduleBlock(block.id, { locked: !block.locked });
  };

  const handleResizeDelta = async (block: ScheduleBlock, deltaMinutes: number) => {
    const newDur = Math.max(15, Math.min(480, block.durationMinutes + deltaMinutes));
    const startMs = Date.parse(block.startAt);
    const newEndMs = startMs + newDur * 60000;
    await updateScheduleBlock(block.id, {
      endAt: new Date(newEndMs).toISOString(),
      durationMinutes: newDur,
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const block = active.data.current?.block as ScheduleBlock | undefined;
    const targetDateKey = over.data.current?.dateKey as string | undefined;
    if (!block || !targetDateKey || block.dateKey === targetDateKey) return;

    const currentHHmm = formatHHmmInTz(block.startAt);
    const newStartMs = localDateHHmmToEpochMs(targetDateKey, currentHHmm, tz);
    const newEndMs = newStartMs + block.durationMinutes * 60000;

    await updateScheduleBlock(block.id, {
      dateKey: targetDateKey,
      startAt: new Date(newStartMs).toISOString(),
      endAt: new Date(newEndMs).toISOString(),
    });
  };

  const nowMs = Date.now();
  const currentLocalTimeStr = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(new Date(nowMs));

  const isSelectedToday = selectedDateKey === todayKey;

  return (
    <div className="space-y-6">
      {/* Time Canvas Control Bar */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722] p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#080C14] border border-slate-200/80 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewMode === 'daily'
                  ? 'bg-white dark:bg-[#161F2D] text-slate-900 dark:text-[#F1F5F9] shadow-xs'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9]'
              }`}
            >
              Daily Timeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode('weekly')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewMode === 'weekly'
                  ? 'bg-white dark:bg-[#161F2D] text-slate-900 dark:text-[#F1F5F9] shadow-xs'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9]'
              }`}
            >
              7-Day Weekly Grid
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedDateKey(addCalendarDays(selectedDateKey, -1))}
              aria-label="Previous day"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#161F2D] hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-[#94A3B8] cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              aria-label="Selected timeline date"
              value={selectedDateKey}
              onChange={(e) => e.target.value && setSelectedDateKey(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C14] px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-[#F1F5F9]"
            />
            <button
              type="button"
              onClick={() => setSelectedDateKey(addCalendarDays(selectedDateKey, 1))}
              aria-label="Next day"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#161F2D] hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-[#94A3B8] cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setSelectedDateKey(todayKey)}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#161F2D] hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-[#F1F5F9] cursor-pointer"
            >
              Today
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-500 dark:text-[#94A3B8]">
            <span className="w-2 h-2 rounded-full bg-[#22D3EE]" />
            <span>
              Now {currentLocalTimeStr} ({tz})
            </span>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => generateScheduleForHorizon(7)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#22D3EE] hover:bg-[#22D3EE]/90 text-[#080C14] transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
            <span>Regenerate 7-Day Plan</span>
          </button>
        </div>
      </div>

      {/* Daily Vertical Timeline View */}
      {viewMode === 'daily' && (
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722] p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-[#F1F5F9]">
                  Daily Schedule Canvas
                </h2>
                <span className="text-xs font-mono text-cyan-600 dark:text-[#22D3EE]">
                  {selectedDateKey}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-[#94A3B8] mt-0.5">
                Protected sleep boundary: {profile?.sleepStartHHmm}–{profile?.sleepEndHHmm} · Peak focus window: {profile?.focusStartHHmm}–{profile?.focusEndHHmm}
              </p>
            </div>
            <button
              type="button"
              onClick={onQuickAddTask}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#161F2D] hover:border-[#22D3EE]/50 text-slate-800 dark:text-[#F1F5F9] cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5 text-[#22D3EE]" />
              <span>Add Task</span>
            </button>
          </div>

          {dailyBlocks.length === 0 ? (
            <div className="py-14 text-center space-y-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              <CalendarIcon className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-[#F1F5F9]">
                  No schedule blocks on {selectedDateKey}
                </p>
                <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                  Run the deterministic solver to populate this day from your tasks and routines.
                </p>
              </div>
              <button
                type="button"
                onClick={() => generateScheduleForHorizon(7)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#22D3EE] text-[#080C14] hover:bg-[#22D3EE]/90 cursor-pointer"
              >
                Generate Schedule
              </button>
            </div>
          ) : (
            <div className="relative space-y-2.5">
              {dailyBlocks.map((block, index) => {
                const startMs = Date.parse(block.startAt);
                const endMs = Date.parse(block.endAt);
                const startHHmm = formatHHmmInTz(block.startAt);
                const endHHmm = formatHHmmInTz(block.endAt);
                const isDone = block.status === 'completed';
                const isCurrentlyActive = isSelectedToday && nowMs >= startMs && nowMs < endMs;
                const prevBlock = index > 0 ? dailyBlocks[index - 1] : null;
                const prevEndMs = prevBlock ? Date.parse(prevBlock.endAt) : null;
                const gapMinutes =
                  prevEndMs && startMs > prevEndMs
                    ? Math.round((startMs - prevEndMs) / 60000)
                    : 0;
                const showNowMarkerBefore =
                  isSelectedToday &&
                  ((index === 0 && nowMs < startMs) ||
                    (prevEndMs !== null && nowMs >= prevEndMs && nowMs < startMs));

                const catStyle = CATEGORY_STYLES[block.category] || CATEGORY_STYLES.academic;

                return (
                  <React.Fragment key={block.id}>
                    {/* Clean Empty Interval Indicator */}
                    {gapMinutes >= 20 && prevBlock && (
                      <div className="py-1.5 px-4 flex items-center justify-between text-[11px] font-mono text-slate-400 dark:text-[#94A3B8]/70 border-l-2 border-dashed border-slate-300 dark:border-slate-800 ml-6">
                        <span>
                          Open interval · {gapMinutes}m unallocated ({formatHHmmInTz(prevBlock.endAt)} – {startHHmm})
                        </span>
                        <button
                          type="button"
                          onClick={onQuickAddTask}
                          className="text-cyan-600 dark:text-[#22D3EE] hover:underline cursor-pointer"
                        >
                          + Fill slot
                        </button>
                      </div>
                    )}

                    {/* Current Time Indicator Line */}
                    {showNowMarkerBefore && (
                      <div className="flex items-center gap-3 py-1" aria-label="Current time indicator">
                        <span className="px-2 py-0.5 rounded bg-[#22D3EE] text-[#080C14] font-mono text-[10px] font-bold tabular-nums">
                          NOW {currentLocalTimeStr}
                        </span>
                        <div className="flex-1 h-px bg-[#22D3EE]/60" />
                      </div>
                    )}

                    {/* Time-Block Card */}
                    <div
                      className={`rounded-xl border border-slate-200/80 dark:border-slate-800/90 border-l-4 ${catStyle.border} ${catStyle.tint} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                        isCurrentlyActive ? 'ring-1 ring-[#22D3EE]' : ''
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-4 min-w-0">
                        {/* Left Time Column */}
                        <div className="w-32 shrink-0 font-mono tabular-nums">
                          <div className="text-xs font-bold text-slate-900 dark:text-[#F1F5F9]">
                            {startHHmm} – {endHHmm}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-[#94A3B8] mt-0.5">
                            {block.durationMinutes} min
                          </div>
                        </div>

                        {/* Activity Details */}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3
                              className={`text-sm font-semibold truncate ${
                                isDone
                                  ? 'line-through text-slate-400'
                                  : 'text-slate-900 dark:text-[#F1F5F9]'
                              }`}
                            >
                              {block.title}
                            </h3>
                            {block.locked && (
                              <span className="text-[11px] font-mono text-indigo-500 dark:text-indigo-400 flex items-center gap-1">
                                <Lock className="w-3 h-3" /> Locked
                              </span>
                            )}
                            {isCurrentlyActive && (
                              <span className="text-[10px] font-mono uppercase tracking-wider text-[#22D3EE]">
                                Active Now
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-[#94A3B8] mt-1 flex flex-wrap items-center gap-2">
                            <span className={`font-medium capitalize ${catStyle.text}`}>
                              {block.category}
                            </span>
                            <span>·</span>
                            <span className="capitalize">{block.priority} priority</span>
                            <span>·</span>
                            <span className="font-mono text-[11px] opacity-80">
                              {block.reasonCode}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right Actions */}
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {block.taskId && !isDone && (
                          <button
                            type="button"
                            onClick={() => {
                              startFocusSession(block.taskId!, block.durationMinutes);
                              setActiveTab('my_day');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#22D3EE]/15 text-cyan-700 dark:text-[#22D3EE] hover:bg-[#22D3EE]/25 transition-colors cursor-pointer"
                            title="Start Focus Timer"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Focus</span>
                          </button>
                        )}

                        {!block.locked && block.blockType !== 'break' && (
                          <div className="flex items-center gap-1 font-mono text-xs">
                            <button
                              type="button"
                              onClick={() => handleResizeDelta(block, -15)}
                              disabled={block.durationMinutes <= 15}
                              className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161F2D] hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-[#F1F5F9] disabled:opacity-40 cursor-pointer"
                            >
                              -15m
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResizeDelta(block, 15)}
                              className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161F2D] hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-[#F1F5F9] cursor-pointer"
                            >
                              +15m
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleToggleLock(block)}
                          className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161F2D] hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9] cursor-pointer"
                        >
                          {block.locked ? 'Unlock' : 'Lock'}
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditModal(block)}
                          className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161F2D] hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-[#F1F5F9] cursor-pointer"
                        >
                          Edit
                        </button>

                        {block.taskId && (
                          <button
                            type="button"
                            onClick={() => toggleTaskComplete(block.taskId!)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              isDone
                                ? 'text-[#14B8A6] bg-[#14B8A6]/15'
                                : 'text-slate-400 hover:text-[#14B8A6]'
                            }`}
                            title="Toggle Complete"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 7-Day Weekly Drag-and-Drop Grid */}
      {viewMode === 'weekly' && (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
            {weekDates.map((dKey) => {
              const dayBlocks = scheduleBlocks
                .filter((b) => b.dateKey === dKey && b.blockType !== 'break')
                .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
              const totalMinutes = dayBlocks.reduce((acc, b) => acc + b.durationMinutes, 0);

              return (
                <DroppableDayColumn
                  key={dKey}
                  dateKey={dKey}
                  isToday={dKey === todayKey}
                  totalMinutes={totalMinutes}
                  onClickCreateOnDay={onQuickAddTask}
                >
                  {dayBlocks.length === 0 ? (
                    <div className="py-10 text-center space-y-2">
                      <p className="text-xs font-mono text-slate-400 dark:text-[#94A3B8]/60">
                        Open day
                      </p>
                    </div>
                  ) : (
                    dayBlocks.map((b) => (
                      <DraggableScheduleCard
                        key={b.id}
                        block={b}
                        timezone={tz}
                        onEdit={openEditModal}
                        onToggleLock={handleToggleLock}
                        onResizeDelta={handleResizeDelta}
                      />
                    ))
                  )}
                </DroppableDayColumn>
              );
            })}
          </div>
        </DndContext>
      )}

      {/* Accessible Task-Detail & Block Quick Edit Modal */}
      {editingBlock && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#080C14]/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-block-title"
        >
          <form
            onSubmit={handleSaveModalEdit}
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#101722] text-slate-900 dark:text-[#F1F5F9] p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-600 dark:text-[#22D3EE]">
                  Constraint-Validated Edit
                </span>
                <h3 id="edit-block-title" className="text-base font-bold mt-0.5">
                  Inspect & Edit Schedule Block
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingBlock(null)}
                className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>

            <div>
              <label htmlFor="eb-title" className="block text-xs font-medium text-slate-500 dark:text-[#94A3B8] mb-1">
                Activity Title
              </label>
              <input
                id="eb-title"
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C14] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="eb-date" className="block text-xs font-medium text-slate-500 dark:text-[#94A3B8] mb-1">
                  Date
                </label>
                <input
                  id="eb-date"
                  type="date"
                  value={editDateKey}
                  onChange={(e) => setEditDateKey(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C14] px-3 py-2 text-sm font-mono text-slate-900 dark:text-[#F1F5F9]"
                />
              </div>
              <div>
                <label htmlFor="eb-start" className="block text-xs font-medium text-slate-500 dark:text-[#94A3B8] mb-1">
                  Start Time ({tz})
                </label>
                <input
                  id="eb-start"
                  type="time"
                  value={editStartHHmm}
                  onChange={(e) => setEditStartHHmm(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C14] px-3 py-2 text-sm font-mono text-slate-900 dark:text-[#F1F5F9]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-center">
              <div>
                <label htmlFor="eb-dur" className="block text-xs font-medium text-slate-500 dark:text-[#94A3B8] mb-1">
                  Duration (minutes)
                </label>
                <input
                  id="eb-dur"
                  type="number"
                  min={5}
                  max={720}
                  value={editDuration}
                  onChange={(e) => setEditDuration(Number(e.target.value))}
                  required
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C14] px-3 py-2 text-sm font-mono text-slate-900 dark:text-[#F1F5F9]"
                />
              </div>
              <div className="pt-5">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-[#F1F5F9] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editLocked}
                    onChange={(e) => setEditLocked(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-700"
                  />
                  <span>Lock against replans</span>
                </label>
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 dark:bg-[#161F2D] p-3 text-xs text-slate-500 dark:text-[#94A3B8] font-mono">
              Category: {editingBlock.category} · Priority: {editingBlock.priority} · Reason: {editingBlock.reasonCode}
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={async () => {
                  await deleteScheduleBlock(editingBlock.id);
                  setEditingBlock(null);
                }}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-[#FB7185] hover:bg-[#FB7185]/10 rounded-lg cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove Block</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingBlock(null)}
                  className="px-3 py-2 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#22D3EE] text-[#080C14] hover:bg-[#22D3EE]/90 cursor-pointer"
                >
                  Validate & Save
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
