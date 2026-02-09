"use client";

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  FolderKanban,
  TestTube2,
  Play,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeTab: 'projects' | 'tests' | 'execution' | 'history' | 'settings';
  onTabChange: (tab: 'projects' | 'tests' | 'execution' | 'history' | 'settings') => void;
  projectName?: string;
}

const navItems = [
  { id: 'projects' as const, icon: FolderKanban, label: 'Projects' },
  { id: 'tests' as const, icon: TestTube2, label: 'Test Cases' },
  { id: 'execution' as const, icon: Play, label: 'Execution' },
  { id: 'history' as const, icon: History, label: 'History' },
  { id: 'settings' as const, icon: Settings, label: 'Settings' },
];

export function DashboardLayout({
  children,
  activeTab,
  onTabChange,
  projectName,
}: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r border-border/60 bg-sidebar transition-all duration-200 ease-out',
          collapsed ? 'w-[52px]' : 'w-[220px]'
        )}
      >
        {/* Logo */}
        <div className="flex h-12 items-center border-b border-border/60 px-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10">
              <Zap className="h-3.5 w-3.5 text-primary" />
            </div>
            {!collapsed && (
              <span className="text-[13px] font-semibold tracking-tight text-foreground">
                AI QA
              </span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors duration-100 mb-0.5',
                  collapsed && 'justify-center px-0',
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
                onClick={() => onTabChange(item.id)}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Collapse button */}
        <div className="px-2 py-2 border-t border-border/60">
          <button
            className="flex w-full items-center justify-center rounded-md py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors duration-100"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-12 items-center justify-between border-b border-border/60 px-6">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-medium text-foreground">
              {navItems.find((i) => i.id === activeTab)?.label}
            </span>
            {projectName && (
              <>
                <span className="text-border">/</span>
                <span className="text-muted-foreground">{projectName}</span>
              </>
            )}
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
