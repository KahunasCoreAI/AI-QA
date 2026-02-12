"use client";

import { useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  TestTube2,
  Play,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  HatGlasses,
  Users,
  ChevronsUpDown,
  Plus,
  Globe,
  Pencil,
  Trash2,
  LogOut,
} from 'lucide-react';
import type { Project } from '@/types';

export type TabType = 'tests' | 'accounts' | 'execution' | 'history' | 'settings';
// 'settings' is navigated via the header cog, not the sidebar nav

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  projects: Project[];
  currentProject: Project | null;
  onSelectProject: (project: Project) => void;
  onCreateProject: () => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  hasUnseenDrafts?: boolean;
}

const navItems = [
  { id: 'tests' as const, icon: TestTube2, label: 'Test Cases' },
  { id: 'accounts' as const, icon: Users, label: 'Accounts' },
  { id: 'execution' as const, icon: Play, label: 'Execution' },
  { id: 'history' as const, icon: History, label: 'History' },
];

// All nav items including settings (for breadcrumb label lookup)
const allNavItems = [
  ...navItems,
  { id: 'settings' as const, icon: Settings, label: 'Settings' },
];

export function DashboardLayout({
  children,
  activeTab,
  onTabChange,
  projects,
  currentProject,
  onSelectProject,
  onCreateProject,
  onEditProject,
  onDeleteProject,
  hasUnseenDrafts = false,
}: DashboardLayoutProps) {
  const { signOut } = useClerk();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r border-border/60 bg-sidebar transition-all duration-200 ease-out',
          collapsed ? 'w-[52px]' : 'w-[240px]'
        )}
      >
        {/* Project Switcher */}
        <div className="border-b border-border/60 p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors duration-100',
                  'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  'data-[state=open]:bg-accent',
                  collapsed && 'justify-center px-0'
                )}
              >
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <HatGlasses className="h-3.5 w-3.5 text-primary" />
                </div>
                {!collapsed && (
                  <>
                    <div className="flex-1 min-w-0">
                      {currentProject ? (
                        <>
                          <div className="text-[13px] font-semibold truncate text-foreground">
                            {currentProject.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {currentProject.websiteUrl.replace(/^https?:\/\//, '')}
                          </div>
                        </>
                      ) : (
                        <div className="text-[13px] font-medium text-muted-foreground">
                          Select project
                        </div>
                      )}
                    </div>
                    <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/60" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-[220px]"
              align="start"
              sideOffset={4}
              side="right"
            >
              <DropdownMenuLabel className="text-[11px] text-muted-foreground font-medium">
                Projects
              </DropdownMenuLabel>
              {projects.length === 0 ? (
                <div className="px-2 py-3 text-center">
                  <p className="text-[11px] text-muted-foreground">No projects yet</p>
                </div>
              ) : (
                projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    className={cn(
                      'flex items-center gap-2.5 px-2 py-2 cursor-pointer group',
                      currentProject?.id === project.id && 'bg-accent'
                    )}
                    onSelect={() => onSelectProject(project)}
                  >
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border border-border/60 bg-background">
                      <Globe className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{project.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {project.websiteUrl.replace(/^https?:\/\//, '')}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="p-1 rounded hover:bg-accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditProject(project);
                        }}
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button
                        className="p-1 rounded hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteProject(project.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive/70" />
                      </button>
                    </div>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="flex items-center gap-2.5 px-2 py-2 cursor-pointer"
                onSelect={onCreateProject}
              >
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border border-border/60 bg-background">
                  <Plus className="h-3 w-3 text-muted-foreground" />
                </div>
                <span className="text-[13px] font-medium text-muted-foreground">Add project</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
                  'relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors duration-100 mb-0.5',
                  collapsed && 'justify-center px-0',
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
                onClick={() => onTabChange(item.id)}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && (
                  <span className="relative flex items-center">
                    {item.label}
                    {item.id === 'tests' && hasUnseenDrafts && (
                      <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-red-500" />
                    )}
                  </span>
                )}
                {collapsed && item.id === 'tests' && hasUnseenDrafts && (
                  <span className="absolute ml-4 -mt-4 inline-block h-2 w-2 rounded-full bg-red-500" />
                )}
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
            {currentProject && (
              <>
                <span className="text-muted-foreground">{currentProject.name}</span>
                <span className="text-border">/</span>
              </>
            )}
            <span className="font-medium text-foreground">
              {allNavItems.find((i) => i.id === activeTab)?.label}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-8 w-8',
                    activeTab === 'settings' && 'bg-accent text-foreground'
                  )}
                  onClick={() => onTabChange('settings')}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Settings
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <LogOut
                  className="h-3.5 w-3.5 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => signOut({ redirectUrl: '/sign-in' })}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Sign out
              </TooltipContent>
            </Tooltip>
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
