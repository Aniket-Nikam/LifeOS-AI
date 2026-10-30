import React, { useState } from 'react';
import { Check, Clock, Compass, Sparkles, Target, ArrowRight } from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
  'UTC',
];

const WEEKDAY_LABELS = [
  { day: 0, short: 'Sun' },
  { day: 1, short: 'Mon' },
  { day: 2, short: 'Tue' },
  { day: 3, short: 'Wed' },
  { day: 4, short: 'Thu' },
  { day: 5, short: 'Fri' },
  { day: 6, short: 'Sat' },
];

export function OnboardingModal({ onClose }: { onClose: () => void }) {
  const { profile, saveProfile, saveGoal, saveRoutine, loadStudentScenarioIntoAccount } = useLifeOS();

  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [timezone, setTimezone] = useState(
    profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
  );
  const [sleepStartHHmm, setSleepStartHHmm] = useState(profile?.sleepStartHHmm || '23:30');
  const [sleepEndHHmm, setSleepEndHHmm] = useState(profile?.sleepEndHHmm || '07:30');
  const [focusStartHHmm, setFocusStartHHmm] = useState(profile?.focusStartHHmm || '09:00');
  const [focusEndHHmm, setFocusEndHHmm] = useState(profile?.focusEndHHmm || '13:00');
  const [workDays, setWorkDays] = useState<number[]>(profile?.workDays || [1, 2, 3, 4, 5]);
  const [breakDurationMinutes, setBreakDurationMinutes] = useState(
    profile?.breakDurationMinutes ?? 10
  );
  const [maxContinuousWorkMinutes, setMaxContinuousWorkMinutes] = useState(
    profile?.maxContinuousWorkMinutes ?? 90
  );

  // Optional starter goal & routine
  const [starterGoalTitle, setStarterGoalTitle] = useState('');
  const [starterRoutineTitle, setStarterRoutineTitle] = useState('');
  const [starterRoutineDuration, setStarterRoutineDuration] = useState(60);

  const toggleWorkDay = (d: number) => {
    setWorkDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };

  const handleCompleteOnboarding = async (seedDemo = false) => {
    await saveProfile({
      displayName: displayName.trim() || 'LifeOS User',
      timezone,
      sleepStartHHmm,
      sleepEndHHmm,
      focusStartHHmm,
      focusEndHHmm,
      workDays: workDays.length > 0 ? workDays : [1, 2, 3, 4, 5],
      breakDurationMinutes,
      maxContinuousWorkMinutes,
      onboardingComplete: true,
    });

    if (starterGoalTitle.trim()) {
      await saveGoal({
        title: starterGoalTitle.trim(),
        description: 'Added during initial LifeOS setup.',
        category: 'academic',
        targetDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        milestones: [
          {
            id: `m_${Date.now()}`,
            title: 'Complete first milestone session',
            completed: false,
            targetMinutes: 60,
          },
        ],
        status: 'active',
      });
    }

    if (starterRoutineTitle.trim()) {
      await saveRoutine({
        title: starterRoutineTitle.trim(),
        category: 'fitness',
        frequency: 'selected_days',
        daysOfWeek: [1, 3, 5],
        intervalDays: 1,
        startDate: new Date().toISOString().slice(0, 10),
        preferredStartHHmm: '17:30',
        preferredEndHHmm: '19:00',
        durationMinutes: starterRoutineDuration || 60,
        isFixed: false,
        priority: 'medium',
        skippedDates: [],
        overridesJson: '{}',
      });
    }

    if (seedDemo) {
      await loadStudentScenarioIntoAccount();
    }

    onClose();
  };

  const timezonesList = Array.from(new Set([timezone, ...COMMON_TIMEZONES]));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden">
        <div className="border-b border-slate-800 px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-cyan-400">Step {step} of 3 · Guided Setup</p>
            <h2 id="onboarding-title" className="text-xl font-semibold tracking-tight mt-0.5">
              Welcome to LifeOS
            </h2>
          </div>
          <button
            type="button"
            onClick={() => handleCompleteOnboarding(false)}
            className="text-xs font-medium text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors"
          >
            Skip Setup
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-4 text-sm text-slate-300">
            LifeOS helps you turn your priorities into a realistic schedule — and adapt that plan
            when life changes.
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-400">
              <span>1. Add what matters</span>
              <span>2. Generate your plan</span>
              <span>3. Replan when life changes</span>
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <Compass className="w-4 h-4 text-cyan-400" />
                <span>Identity & Timezone</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="onb-name" className="block text-xs font-medium text-slate-400 mb-1.5">
                    Preferred Display Name
                  </label>
                  <input
                    id="onb-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g., Maya Lin"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="onb-tz" className="block text-xs font-medium text-slate-400 mb-1.5">
                    Timezone (DST & Overnight Aware)
                  </label>
                  <select
                    id="onb-tz"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                  >
                    {timezonesList.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-400 mb-2">
                  Typical Work / Study Days
                </span>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_LABELS.map((item) => {
                    const active = workDays.includes(item.day);
                    return (
                      <button
                        key={item.day}
                        type="button"
                        onClick={() => toggleWorkDay(item.day)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          active
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {item.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>Protected Sleep & Preferred Focus Rhythm</span>
              </div>
              <p className="text-xs text-slate-400">
                Overnight schedules (e.g., 23:30 to 07:30 or late-night work windows) are supported
                natively across midnight.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="onb-sleep-start" className="block text-xs text-slate-400 mb-1">
                    Sleep Start (HH:mm)
                  </label>
                  <input
                    id="onb-sleep-start"
                    type="time"
                    value={sleepStartHHmm}
                    onChange={(e) => setSleepStartHHmm(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="onb-sleep-end" className="block text-xs text-slate-400 mb-1">
                    Wake / Sleep End
                  </label>
                  <input
                    id="onb-sleep-end"
                    type="time"
                    value={sleepEndHHmm}
                    onChange={(e) => setSleepEndHHmm(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="onb-focus-start" className="block text-xs text-slate-400 mb-1">
                    Peak Focus Start
                  </label>
                  <input
                    id="onb-focus-start"
                    type="time"
                    value={focusStartHHmm}
                    onChange={(e) => setFocusStartHHmm(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="onb-focus-end" className="block text-xs text-slate-400 mb-1">
                    Peak Focus End
                  </label>
                  <input
                    id="onb-focus-end"
                    type="time"
                    value={focusEndHHmm}
                    onChange={(e) => setFocusEndHHmm(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label htmlFor="onb-break" className="block text-xs text-slate-400 mb-1">
                    Recovery Break Buffer (minutes)
                  </label>
                  <input
                    id="onb-break"
                    type="number"
                    min={0}
                    max={60}
                    value={breakDurationMinutes}
                    onChange={(e) => setBreakDurationMinutes(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="onb-max-work" className="block text-xs text-slate-400 mb-1">
                    Max Continuous Session (minutes)
                  </label>
                  <input
                    id="onb-max-work"
                    type="number"
                    min={25}
                    max={240}
                    value={maxContinuousWorkMinutes}
                    onChange={(e) => setMaxContinuousWorkMinutes(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-slate-100"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <Target className="w-4 h-4 text-cyan-400" />
                <span>Optional Initial Goal or Routine</span>
              </div>
              <p className="text-xs text-slate-400">
                Your real account starts clean with zero fictional tasks unless you explicitly
                choose to import the sample student scenario below.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="onb-goal" className="block text-xs text-slate-400 mb-1">
                    First Goal (Optional)
                  </label>
                  <input
                    id="onb-goal"
                    type="text"
                    value={starterGoalTitle}
                    onChange={(e) => setStarterGoalTitle(e.target.value)}
                    placeholder="e.g., Prepare for Systems Midterm"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="onb-routine" className="block text-xs text-slate-400 mb-1">
                    Recurring Routine (Optional, Mon/Wed/Fri)
                  </label>
                  <input
                    id="onb-routine"
                    type="text"
                    value={starterRoutineTitle}
                    onChange={(e) => setStarterRoutineTitle(e.target.value)}
                    placeholder="e.g., Evening Gym Session"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-800 bg-slate-950/50 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg border border-slate-800"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors"
              >
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleCompleteOnboarding(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-violet-300 border border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20 rounded-lg transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Finish & Import Student Sample Data</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCompleteOnboarding(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Start Clean Workspace</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
