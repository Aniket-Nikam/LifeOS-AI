/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { LifeOSProvider, useLifeOS, NavTab } from './context/LifeOSContext';
import { MissionControlView } from './components/MissionControlView';
import { TimeCanvasView } from './components/TimeCanvasView';
import {
  TasksView,
  GoalsView,
  RoutinesView
} from './components/TasksGoalsRoutinesView';
import { RealityShiftView } from './components/RealityShiftView';
import { SimulatorView } from './components/SimulatorView';
import {
  MyDayFocusView,
  InsightsView,
  SettingsView
} from './components/FocusAndInsightsView';
import { OnboardingModal } from './components/OnboardingModal';
import {
  CopilotDrawer,
  MissionGuideModal
} from './components/CopilotAndGuideDrawer';
import {
  LayoutDashboard,
  Clock,
  Calendar,
  CheckSquare,
  Target,
  Repeat,
  Zap,
  FlaskConical,
  BarChart3,
  Settings,
  Sparkles,
  BookOpen,
  Plus,
  LogOut,
  LogIn,
  Menu,
  X,
  Sun,
  Moon,
  AlertTriangle,
  Play,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error?.message || 'Unexpected application error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#080C14] text-[#F1F5F9] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#101722] border border-[#FB7185]/40 rounded-xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-[#FB7185] font-bold">
              <AlertTriangle className="w-5 h-5" />
              <span>LifeOS Runtime Recovery</span>
            </div>
            <p className="text-xs font-mono text-[#94A3B8] break-words">
              {this.state.errorMessage}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-[#22D3EE] text-[#080C14] font-semibold text-xs cursor-pointer"
            >
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function WelcomeAuthGate() {
  const { loginWithGoogle, enterStudentDemoMode } = useLifeOS();

  return (
    <div className="min-h-screen bg-[#080C14] text-[#F1F5F9] flex flex-col justify-between p-6 md:p-12 selection:bg-[#22D3EE]/20 selection:text-[#22D3EE]">
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between border-b border-slate-800/70 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#22D3EE] flex items-center justify-center text-[#080C14] font-bold font-display text-base shadow-sm">
            L
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className="font-display font-bold text-lg tracking-tight text-[#F1F5F9]">
              LifeOS
            </span>
            <span className="hidden sm:inline-block text-[11px] font-mono uppercase tracking-widest text-[#94A3B8]">
              Temporal Operating System
            </span>
          </div>
        </div>
        <button
          onClick={loginWithGoogle}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-800 bg-[#101722] hover:bg-[#161F2D] hover:border-slate-700 text-xs font-medium text-[#F1F5F9] transition-colors cursor-pointer"
        >
          <LogIn className="w-3.5 h-3.5 text-[#22D3EE]" />
          <span>Sign In with Google</span>
        </button>
      </header>

      <main className="max-w-6xl w-full mx-auto my-auto py-12 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#22D3EE]">
            <Zap className="w-3.5 h-3.5" />
            <span>Your time. Intelligently arranged.</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-bold font-display tracking-tight text-[#F1F5F9] leading-[1.08]">
            Deterministic scheduling built for real-world disruptions.
          </h1>
          <p className="text-base text-[#94A3B8] max-w-xl leading-relaxed">
            LifeOS unifies your goals, deadlines, routines, and focus windows into a constraint-verified timeline—and adapts effortlessly via{' '}
            <strong className="text-[#F1F5F9] font-medium">Reality Shift</strong> before-and-after diff previews when plans change.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={enterStudentDemoMode}
              data-testid="enter-demo-btn"
              className="inline-flex items-center gap-2.5 px-5 py-3 rounded-lg bg-[#22D3EE] hover:bg-[#22D3EE]/90 text-[#080C14] font-semibold text-sm transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Launch Interactive Student Demo Workspace</span>
            </button>

            <button
              onClick={loginWithGoogle}
              className="inline-flex items-center gap-2.5 px-5 py-3 rounded-lg bg-[#101722] hover:bg-[#161F2D] border border-slate-800 text-[#F1F5F9] font-medium text-sm transition-colors cursor-pointer"
            >
              <LogIn className="w-4 h-4 text-[#22D3EE]" />
              <span>Sign in with Google</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-800/80 max-w-xl">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#94A3B8]">Solver Engine</div>
              <div className="text-sm font-semibold text-[#F1F5F9] mt-1">Deadline & Sleep Aware</div>
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#94A3B8]">Reality Shift</div>
              <div className="text-sm font-semibold text-[#F1F5F9] mt-1">Diff Preview & Undo</div>
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#94A3B8]">Effort Tracking</div>
              <div className="text-sm font-semibold text-[#F1F5F9] mt-1">Est · Actual · Remaining</div>
            </div>
          </div>
        </div>

        {/* Right Architectural Preview Card */}
        <div className="lg:col-span-5 bg-[#101722] border border-slate-800/90 rounded-xl p-6 space-y-5 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <div className="text-[11px] font-mono text-[#A78BFA] uppercase tracking-wider">
                Reality Shift Diff Preview
              </div>
              <div className="text-sm font-semibold text-[#F1F5F9] mt-1">
                &ldquo;I woke up 2 hours late and need to protect tonight&rdquo;
              </div>
            </div>
            <span className="text-xs font-mono text-[#14B8A6] bg-[#14B8A6]/10 px-2 py-0.5 rounded">
              v1 → v2
            </span>
          </div>

          <div className="space-y-2.5 text-xs font-mono">
            <div className="p-3 rounded-lg bg-[#080C14] border border-slate-800/90 flex items-center justify-between">
              <span className="text-[#F1F5F9]">CS 401 Lecture (Locked)</span>
              <span className="text-[#94A3B8]">10:00–11:30 UNCHANGED</span>
            </div>
            <div className="p-3 rounded-lg bg-[#161F2D] border-l-2 border-l-[#A78BFA] border border-slate-800 flex items-center justify-between">
              <span className="text-[#F1F5F9]">TCP Congestion Problem Set</span>
              <span className="text-[#A78BFA]">08:30 → 11:45 MOVED</span>
            </div>
            <div className="p-3 rounded-lg bg-[#161F2D] border-l-2 border-l-[#22D3EE] border border-slate-800 flex items-center justify-between">
              <span className="text-[#F1F5F9]">Webhook Retry Review</span>
              <span className="text-[#22D3EE]">15:15–16:15 REBALANCED</span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between text-xs text-[#94A3B8]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#14B8A6]" />
              <span>Explicit approval required before commit</span>
            </span>
            <button
              onClick={enterStudentDemoMode}
              className="text-[#22D3EE] hover:underline font-medium cursor-pointer"
            >
              Inspect live →
            </button>
          </div>
        </div>
      </main>

      <footer className="max-w-6xl w-full mx-auto text-xs text-[#94A3B8] flex flex-wrap items-center justify-between gap-4 border-t border-slate-900 pt-6">
        <span>LifeOS — The Adaptive Personal Operating System</span>
        <span className="font-mono">Deterministic Constraint Solver · Gemini AI · Cloud Firestore</span>
      </footer>
    </div>
  );
}

function LifeOSShell() {
  const {
    user,
    profile,
    authReady,
    isDemoMode,
    activeTab,
    setActiveTab,
    toastMessage,
    generateScheduleForHorizon,
    toggleTheme,
    logout,
    loginWithGoogle,
    activeFocusSession,
    tasks,
    unscheduledTasks
  } = useLifeOS();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [openCreateTaskSignal, setOpenCreateTaskSignal] = useState(false);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#080C14] text-[#F1F5F9] flex items-center justify-center font-mono text-xs tracking-wider uppercase">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#22D3EE] animate-ping" />
          <span>Initializing LifeOS Temporal Engine...</span>
        </div>
      </div>
    );
  }

  if (!user && !isDemoMode) {
    return <WelcomeAuthGate />;
  }

  const showOnboarding =
    profile && !profile.onboardingComplete && !isDemoMode && !onboardingDismissed;

  const activeTaskCount = tasks.filter(
    (t) => t.status !== 'complete' && t.status !== 'archived' && t.status !== 'skipped'
  ).length;

  const navGroups: Array<{
    groupLabel: string;
    items: Array<{
      id: NavTab;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      aiAccent?: boolean;
      badgeCount?: number;
      pulseDot?: boolean;
    }>;
  }> = [
    {
      groupLabel: 'Command',
      items: [
        { id: 'mission_control', label: 'Mission Control', icon: LayoutDashboard },
        {
          id: 'my_day',
          label: 'My Day & Focus',
          icon: Clock,
          pulseDot: Boolean(activeFocusSession)
        },
        { id: 'timeline', label: 'Time Canvas', icon: Calendar }
      ]
    },
    {
      groupLabel: 'Planning',
      items: [
        { id: 'tasks', label: 'Tasks', icon: CheckSquare, badgeCount: activeTaskCount },
        { id: 'goals', label: 'Goals', icon: Target },
        { id: 'routines', label: 'Routines', icon: Repeat }
      ]
    },
    {
      groupLabel: 'Adaptive Intelligence',
      items: [
        {
          id: 'reality_shift',
          label: 'Reality Shift',
          icon: Zap,
          aiAccent: true,
          badgeCount: unscheduledTasks.length > 0 ? unscheduledTasks.length : undefined
        },
        { id: 'simulator', label: 'What-If Simulator', icon: FlaskConical },
        { id: 'insights', label: 'Insights & Export', icon: BarChart3 }
      ]
    },
    {
      groupLabel: 'System',
      items: [{ id: 'settings', label: 'Settings', icon: Settings }]
    }
  ];

  const handleNavigate = (tab: NavTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const handleQuickAddTask = () => {
    setActiveTab('tasks');
    setOpenCreateTaskSignal(true);
    setMobileMenuOpen(false);
  };

  const userInitials = (profile?.displayName || 'Maya Lin')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#080C14] text-[#0F172A] dark:text-[#F1F5F9] flex selection:bg-[#22D3EE]/20 selection:text-[#22D3EE]">
      {/* Desktop Collapsible Left Sidebar */}
      <aside
        className={`hidden lg:flex lg:flex-col border-r border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#101722] shrink-0 select-none transition-[width] duration-200 ease-out sticky top-0 h-screen ${
          sidebarCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        {/* Brand Header */}
        <div className="h-14 px-3.5 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#22D3EE] flex items-center justify-center text-[#080C14] font-bold font-display text-sm shrink-0 shadow-xs">
              L
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="font-display font-bold text-sm tracking-tight text-slate-900 dark:text-[#F1F5F9] truncate leading-none">
                  LifeOS
                </div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-600 dark:text-[#22D3EE] mt-0.5 truncate">
                  {isDemoMode ? 'Demo Workspace' : 'Cloud Synced'}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-[#F1F5F9] hover:bg-slate-100 dark:hover:bg-[#161F2D] transition-colors cursor-pointer"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Grouped Navigation Items */}
        <nav
          className="flex-1 px-2.5 py-3 space-y-4 overflow-y-auto"
          aria-label="Main Navigation"
        >
          {navGroups.map((group) => (
            <div key={group.groupLabel} className="space-y-0.5">
              {!sidebarCollapsed && (
                <div className="px-2.5 pb-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-[#94A3B8]/70">
                  {group.groupLabel}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    data-testid={`nav-${item.id}`}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={`group relative w-full flex items-center ${
                      sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'justify-between px-2.5 py-2'
                    } rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? item.aiAccent
                          ? 'bg-[#A78BFA]/15 text-violet-700 dark:text-[#A78BFA] font-semibold'
                          : 'bg-[#22D3EE]/12 text-cyan-700 dark:text-[#22D3EE] font-semibold'
                        : item.aiAccent
                        ? 'text-violet-600 dark:text-[#A78BFA]/90 hover:bg-[#A78BFA]/10'
                        : 'text-slate-600 dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#161F2D] hover:text-slate-900 dark:hover:text-[#F1F5F9]'
                    }`}
                  >
                    {/* Left Active Bar */}
                    {isActive && (
                      <span
                        className={`absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r ${
                          item.aiAccent ? 'bg-[#A78BFA]' : 'bg-[#22D3EE]'
                        }`}
                      />
                    )}

                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-transform duration-150 group-hover:scale-105 ${
                          isActive
                            ? item.aiAccent
                              ? 'text-violet-600 dark:text-[#A78BFA]'
                              : 'text-cyan-600 dark:text-[#22D3EE]'
                            : ''
                        }`}
                      />
                      {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </span>

                    {!sidebarCollapsed && (
                      <span className="flex items-center gap-1.5">
                        {item.pulseDot && (
                          <span className="w-2 h-2 rounded-full bg-[#14B8A6] animate-pulse" />
                        )}
                        {typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
                          <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-[#94A3B8]">
                            {item.badgeCount}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Contextual Copilot & Guide Triggers */}
        <div className="px-2.5 py-2.5 border-t border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
          <button
            onClick={() => setCopilotOpen(true)}
            data-testid="open-copilot-btn"
            title="Ask AI Planning Copilot"
            className={`w-full flex items-center ${
              sidebarCollapsed ? 'justify-center p-2' : 'justify-between px-2.5 py-2'
            } rounded-lg bg-slate-900 dark:bg-[#161F2D] hover:bg-slate-800 dark:hover:bg-slate-800 border border-transparent dark:border-slate-700/70 text-white dark:text-[#F1F5F9] text-xs font-medium transition-colors cursor-pointer`}
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[#A78BFA] shrink-0" />
              {!sidebarCollapsed && <span>AI Planning Copilot</span>}
            </span>
            {!sidebarCollapsed && (
              <span className="text-[10px] font-mono text-[#A78BFA]">AI</span>
            )}
          </button>

          <button
            onClick={() => setGuideOpen(true)}
            data-testid="open-guide-btn"
            title="System Guide & Specs"
            className={`w-full flex items-center ${
              sidebarCollapsed ? 'justify-center p-2' : 'gap-2 px-2.5 py-1.5'
            } rounded-lg text-slate-500 dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#161F2D] hover:text-slate-900 dark:hover:text-[#F1F5F9] text-xs font-medium transition-colors cursor-pointer`}
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            {!sidebarCollapsed && <span>System Guide & Specs</span>}
          </button>
        </div>

        {/* Compact User Profile & Theme Footer */}
        <div className="p-2.5 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-[#080C14]/40 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-[#161F2D] border border-slate-700 text-[#22D3EE] font-mono text-xs font-semibold flex items-center justify-center shrink-0">
              {userInitials}
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-[#F1F5F9] truncate">
                  {profile?.displayName || 'Maya Lin'}
                </div>
                <div className="text-[10px] font-mono text-slate-500 dark:text-[#94A3B8] truncate">
                  {profile?.timezone || 'UTC'}
                </div>
              </div>
            )}
          </div>

          {!sidebarCollapsed && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => toggleTheme()}
                title="Toggle Dark/Light Theme"
                aria-label="Toggle Dark/Light Theme"
                className="p-1.5 rounded-md text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9] hover:bg-slate-200/60 dark:hover:bg-[#161F2D] transition-colors cursor-pointer"
              >
                {profile?.theme === 'dark' ? (
                  <Sun className="w-3.5 h-3.5" />
                ) : (
                  <Moon className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={logout}
                title={isDemoMode ? 'Exit Demo Workspace' : 'Sign Out'}
                aria-label={isDemoMode ? 'Exit Demo Workspace' : 'Sign Out'}
                className="p-1.5 rounded-md text-slate-500 dark:text-[#94A3B8] hover:text-[#FB7185] hover:bg-slate-200/60 dark:hover:bg-[#161F2D] transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Command Header Bar */}
        <header className="h-14 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/85 dark:bg-[#101722]/85 backdrop-blur-md px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-[#94A3B8] shrink-0 cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0 flex items-center gap-2.5">
              <span className="text-xs font-semibold text-slate-900 dark:text-[#F1F5F9] truncate">
                {navGroups
                  .flatMap((g) => g.items)
                  .find((i) => i.id === activeTab)?.label || 'Mission Control'}
              </span>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-700">·</span>
              <span className="hidden sm:inline text-xs font-mono text-slate-500 dark:text-[#94A3B8] tabular-nums truncate">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                })}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={handleQuickAddTask}
              title="Quick Add Task"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161F2D] hover:border-cyan-500/50 text-xs font-medium text-slate-700 dark:text-[#F1F5F9] transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#22D3EE]" />
              <span className="hidden sm:inline">New Task</span>
            </button>

            <button
              onClick={() => generateScheduleForHorizon(7)}
              title="Plan My Day (7-Day Constraint Solver)"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#22D3EE] hover:bg-[#22D3EE]/90 text-[#080C14] text-xs font-semibold transition-colors cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Plan My Day</span>
            </button>

            <button
              onClick={() => handleNavigate('reality_shift')}
              title="Reality Shift Adaptive Replanning"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#A78BFA]/15 hover:bg-[#A78BFA]/25 border border-[#A78BFA]/40 text-violet-700 dark:text-[#A78BFA] text-xs font-semibold transition-colors cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Reality Shift</span>
            </button>

            <button
              onClick={() => setCopilotOpen(true)}
              title="Open AI Planning Copilot"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161F2D] text-slate-600 dark:text-[#A78BFA] hover:border-[#A78BFA]/50 transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
            </button>

            <button
              onClick={() => toggleTheme()}
              title="Toggle Dark/Light Theme"
              className="lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-[#94A3B8] cursor-pointer"
            >
              {profile?.theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            {isDemoMode && !user ? (
              <button
                onClick={loginWithGoogle}
                title="Sign In with Google"
                className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9] text-xs font-medium transition-colors cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-[#22D3EE]" />
                <span>Sign In</span>
              </button>
            ) : null}
          </div>
        </header>

        {/* Notification Toast Banner */}
        {toastMessage && (
          <div
            role="status"
            className={`border-b px-4 lg:px-8 py-2 flex items-center justify-between text-xs font-medium ${
              toastMessage.type === 'error'
                ? 'bg-[#FB7185]/15 border-[#FB7185]/30 text-rose-800 dark:text-[#FB7185]'
                : 'bg-[#22D3EE]/12 border-[#22D3EE]/30 text-cyan-900 dark:text-[#22D3EE]'
            }`}
          >
            <span>{toastMessage.text}</span>
          </div>
        )}

        {/* Active View Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'mission_control' && (
            <MissionControlView onQuickAddTask={handleQuickAddTask} />
          )}
          {activeTab === 'my_day' && <MyDayFocusView />}
          {activeTab === 'timeline' && <TimeCanvasView onQuickAddTask={handleQuickAddTask} />}
          {activeTab === 'tasks' && (
            <TasksView
              openCreateModalSignal={openCreateTaskSignal}
              onClearCreateSignal={() => setOpenCreateTaskSignal(false)}
            />
          )}
          {activeTab === 'goals' && <GoalsView />}
          {activeTab === 'routines' && <RoutinesView />}
          {activeTab === 'reality_shift' && <RealityShiftView />}
          {activeTab === 'simulator' && <SimulatorView />}
          {activeTab === 'insights' && <InsightsView />}
          {activeTab === 'settings' && (
            <SettingsView onOpenOnboarding={() => setOnboardingDismissed(false)} />
          )}
        </main>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex bg-[#080C14]/75 backdrop-blur-xs">
          <div className="w-72 bg-white dark:bg-[#101722] border-r border-slate-200 dark:border-slate-800 h-full p-4 flex flex-col justify-between">
            <div className="space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#22D3EE] flex items-center justify-center text-[#080C14] font-bold font-display text-xs">
                    L
                  </div>
                  <span className="font-display font-bold text-base text-slate-900 dark:text-[#F1F5F9]">
                    LifeOS
                  </span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                  className="p-1.5 rounded-lg text-slate-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {navGroups.map((group) => (
                  <div key={group.groupLabel} className="space-y-1">
                    <div className="px-2 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-[#94A3B8]">
                      {group.groupLabel}
                    </div>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleNavigate(item.id)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer ${
                            isActive
                              ? item.aiAccent
                                ? 'bg-[#A78BFA]/15 text-[#A78BFA]'
                                : 'bg-[#22D3EE]/15 text-[#22D3EE]'
                              : 'text-slate-600 dark:text-[#94A3B8]'
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <Icon className="w-4 h-4" />
                            <span>{item.label}</span>
                          </span>
                          {typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
                            <span className="text-[11px] font-mono">{item.badgeCount}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setCopilotOpen(true);
                }}
                className="w-full py-2 rounded-lg bg-[#161F2D] text-[#F1F5F9] text-xs font-semibold cursor-pointer"
              >
                AI Planning Copilot
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setGuideOpen(true);
                }}
                className="w-full py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                System Guide & Specs
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="w-full py-2 rounded-lg text-xs font-medium text-[#FB7185] cursor-pointer"
              >
                {isDemoMode ? 'Exit Demo Workspace' : 'Sign Out'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Modal */}
      {showOnboarding && (
        <OnboardingModal onClose={() => setOnboardingDismissed(true)} />
      )}

      {/* Copilot & Documentation Modals */}
      <CopilotDrawer isOpen={copilotOpen} onClose={() => setCopilotOpen(false)} />
      <MissionGuideModal isOpen={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <LifeOSProvider>
        <LifeOSShell />
      </LifeOSProvider>
    </ErrorBoundary>
  );
}
