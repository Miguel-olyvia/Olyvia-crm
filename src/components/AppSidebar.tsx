import React, { useMemo, memo, useCallback, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { usePermissions } from "@/hooks/usePermissions";
import { useSidebarExpand } from "@/contexts/SidebarContext";
import { useSidebarAlertCounts } from "@/hooks/useSidebarAlertCounts";
import { useCompany } from "@/contexts/CompanyContext";
import olyviaMascot from "@/assets/olyvia-mascot.png";
import { cn } from "@/lib/utils";
import {
  topLevelItems,
  menuSections,
  bottomItem,
  MenuItem,
  TopLevelItem,
  MenuSection,
} from "./sidebar/menuConfig";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SidebarSkeleton } from "./sidebar/SidebarSkeleton";

interface AppSidebarProps {
  userName: string;
  userRole: string;
}

export const AppSidebar = memo(function AppSidebar({ userName, userRole }: AppSidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission, hasAnyPermission, loading: permissionsLoading } = usePermissions();
  const { openSectionId, setOpenSectionId, closeSubmenu, isManuallyClosedRef } = useSidebarExpand();
  const { activeCompany } = useCompany();
  const { sectionCounts } = useSidebarAlertCounts(activeCompany?.id);
  
  // Show skeleton while loading permissions (first load only)
  const [showSkeleton, setShowSkeleton] = useState(true);

  // ─────────────────────────────────────────────────────────────
  // Permission helpers (memoized) - MUST be before any conditional returns
  // ─────────────────────────────────────────────────────────────

  const canViewItem = useCallback(
    (item: MenuItem): boolean => {
      if (permissionsLoading || !activeCompany) return true;
      if (item.permissions && item.permissions.length > 0) {
        return hasAnyPermission(item.permissions);
      }
      if (item.permission) {
        return hasPermission(item.permission);
      }
      return true;
    },
    [permissionsLoading, activeCompany, hasPermission, hasAnyPermission]
  );

  const canViewTopLevel = useCallback(
    (item: TopLevelItem): boolean => {
      if (permissionsLoading || !activeCompany) return true;
      if (item.permissions.length === 0) return true;
      return hasAnyPermission(item.permissions);
    },
    [permissionsLoading, activeCompany, hasAnyPermission]
  );

  const canViewSection = useCallback(
    (section: MenuSection): boolean => {
      if (permissionsLoading || !activeCompany) return true;
      // A section is visible if at least ONE child item or subsection item is visible
      const hasVisibleItem = section.items.some(item => canViewItem(item));
      if (hasVisibleItem) return true;
      if (section.subSections) {
        return section.subSections.some(sub => sub.items.some(item => canViewItem(item)));
      }
      // Fallback: check section-level permissions
      if (section.permissions.length === 0) return true;
      return hasAnyPermission(section.permissions);
    },
    [permissionsLoading, hasAnyPermission, canViewItem]
  );

  // ─────────────────────────────────────────────────────────────
  // Filter visible sections
  // ─────────────────────────────────────────────────────────────

  const visibleTopLevel = useMemo(
    () => topLevelItems.filter(canViewTopLevel),
    [canViewTopLevel]
  );

  const visibleSections = useMemo(
    () => menuSections.filter((s) => canViewSection(s)),
    [canViewSection]
  );

  // Find which section the current route belongs to
  const activeSectionId = useMemo(() => {
    for (const section of visibleSections) {
      if (section.paths.some((p) => location.pathname.startsWith(p))) {
        return section.id;
      }
    }
    return null;
  }, [location.pathname, visibleSections]);

  // Auto-open section based on route (only if not manually closed)
  useEffect(() => {
    if (activeSectionId && !isManuallyClosedRef.current) {
      setOpenSectionId(activeSectionId);
    } else if (!activeSectionId) {
      // Reset manual close flag when leaving all sections
      isManuallyClosedRef.current = false;
      setOpenSectionId(null);
    }
  }, [activeSectionId]);

  const openSection = visibleSections.find((s) => s.id === openSectionId);

  // ─────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────

  const handleTopLevelClick = (item: TopLevelItem) => {
    isManuallyClosedRef.current = false;
    setOpenSectionId(null);
    navigate(item.to);
  };

  const handleSectionClick = (section: MenuSection) => {
    if (openSectionId === section.id) {
      closeSubmenu();
    } else {
      isManuallyClosedRef.current = false;
      setOpenSectionId(section.id);
    }
  };

  const handleItemClick = (to: string) => {
    navigate(to);
    // Keep submenu open - don't close on navigation
  };

  const handleBottomClick = () => {
    isManuallyClosedRef.current = false;
    setOpenSectionId(null);
    navigate(bottomItem.to);
  };

  // Check if item is active
  const isItemActive = (to: string) => {
    return location.pathname === to || location.pathname.startsWith(to + "/");
  };

  // Check if section is active
  const isSectionActive = (section: MenuSection) => {
    return section.paths.some((p) => location.pathname.startsWith(p));
  };

  // Handle skeleton visibility - AFTER all hooks
  useEffect(() => {
    if (!permissionsLoading) {
      const timer = setTimeout(() => setShowSkeleton(false), 50);
      return () => clearTimeout(timer);
    }
  }, [permissionsLoading]);

  // Show skeleton on first load - AFTER all hooks
  if (showSkeleton && permissionsLoading) {
    return <SidebarSkeleton />;
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Icon Rail - Always visible */}
      <aside
        data-app-sidebar="true"
        className="fixed left-0 top-0 h-screen w-16 border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-lg z-[400] flex flex-col"
      >
        {/* Header - Logo */}
        <div className="py-4 px-2 border-b border-sidebar-border flex items-center justify-center shrink-0">
          <img
            src={olyviaMascot}
            alt="Olyvia"
            className="w-10 h-10 object-contain"
          />
        </div>

        {/* Scrollable icon list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-sidebar-accent scrollbar-track-transparent p-2">
          <TooltipProvider delayDuration={100}>
            <div className="flex flex-col gap-1">
              {/* Top level items (Dashboard, Scheduling) */}
              {visibleTopLevel.map((item) => {
                const Icon = item.icon;
                const isActive = isItemActive(item.to);
                return (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => handleTopLevelClick(item)}
                        className={cn(
                          "flex items-center justify-center w-full p-3 rounded-xl transition-all duration-200",
                          "text-sidebar-foreground/80 hover:text-sidebar-foreground",
                          "hover:bg-sidebar-accent",
                          isActive && "bg-primary text-primary-foreground shadow-md"
                        )}
                      >
                        <Icon className="w-5 h-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent 
                      side="right" 
                      sideOffset={12}
                      className="bg-primary text-primary-foreground font-medium px-3 py-2 text-sm shadow-lg border-0"
                    >
                      {t(item.labelKey)}
                    </TooltipContent>
                  </Tooltip>
                );
              })}

              {/* Grouped sections */}
              {visibleSections.map((section) => {
                const Icon = section.icon;
                const isActive = isSectionActive(section);
                const isOpen = openSectionId === section.id;
                return (
                  <Tooltip key={section.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => handleSectionClick(section)}
                        className={cn(
                          "flex items-center justify-center w-full p-3 rounded-xl transition-all duration-200 relative",
                          "text-sidebar-foreground/80 hover:text-sidebar-foreground",
                          "hover:bg-sidebar-accent",
                          (isActive || isOpen) && "bg-primary text-primary-foreground shadow-md"
                        )}
                      >
                        <Icon className="w-5 h-5" />
                        {sectionCounts[section.id as keyof typeof sectionCounts] > 0 && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[9px] text-destructive-foreground flex items-center justify-center font-bold">
                            {sectionCounts[section.id as keyof typeof sectionCounts]}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent 
                      side="right" 
                      sideOffset={12}
                      className="bg-primary text-primary-foreground font-medium px-3 py-2 text-sm shadow-lg border-0"
                    >
                      {t(section.labelKey)}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        </div>

        {/* Footer */}
        <div className="shrink-0 p-2 border-t border-sidebar-border">
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleBottomClick}
                  className={cn(
                    "flex items-center justify-center w-full p-3 rounded-xl transition-all duration-200",
                    "text-sidebar-foreground/80 hover:text-sidebar-foreground",
                    "hover:bg-sidebar-accent",
                    isItemActive(bottomItem.to) && "bg-primary text-primary-foreground shadow-md"
                  )}
                >
                  <bottomItem.icon className="w-5 h-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent 
                side="right" 
                sideOffset={12}
                className="bg-primary text-primary-foreground font-medium px-3 py-2 text-sm shadow-lg border-0"
              >
                {t(bottomItem.labelKey)}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </aside>

      {/* Flyout Panel - Shows when a section is open (no backdrop, content shifts) */}
      {openSection && (
        <FlyoutPanel
          section={openSection}
          t={t}
          canViewItem={canViewItem}
          onItemClick={handleItemClick}
          onClose={closeSubmenu}
          isItemActive={isItemActive}
        />
      )}
    </>
  );
});

// ─────────────────────────────────────────────────────────────
// Flyout Panel Component
// ─────────────────────────────────────────────────────────────

interface FlyoutPanelProps {
  section: MenuSection;
  t: (key: string) => string;
  canViewItem: (item: MenuItem) => boolean;
  onItemClick: (to: string) => void;
  onClose: () => void;
  isItemActive: (to: string) => boolean;
}

const FlyoutPanel = memo(function FlyoutPanel({
  section,
  t,
  canViewItem,
  onItemClick,
  onClose,
  isItemActive,
}: FlyoutPanelProps) {
  const location = useLocation();
  const [expandedSubs, setExpandedSubs] = useState<Record<string, boolean>>({});

  // Auto-expand subsection that contains active item
  useEffect(() => {
    if (section.subSections) {
      const newExpanded: Record<string, boolean> = {};
      for (const sub of section.subSections) {
        if (sub.items.some((item) => isItemActive(item.to))) {
          newExpanded[sub.key] = true;
        }
      }
      if (Object.keys(newExpanded).length > 0) {
        setExpandedSubs((prev) => ({ ...prev, ...newExpanded }));
      }
    }
  }, [location.pathname, section.subSections]);

  const toggleSub = useCallback((key: string) => {
    setExpandedSubs((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const visibleItems = section.items.filter(canViewItem);
  const visibleSubSections = section.subSections
    ?.map((sub) => ({
      ...sub,
      items: sub.items.filter(canViewItem),
    }))
    .filter((sub) => sub.items.length > 0);

  return (
    <>
      {/* Rounded corner effect at top of submenu */}
      <div
        className="fixed z-[40] bg-sidebar pointer-events-none"
        style={{
          left: "64px",
          top: "56px",
          width: "24px",
          height: "24px",
        }}
      />
      <div
        className="fixed z-[40] bg-background rounded-tl-2xl pointer-events-none"
        style={{
          left: "64px",
          top: "56px",
          width: "24px",
          height: "24px",
        }}
      />
      <div
        className="fixed left-16 top-14 bottom-0 w-64 bg-card border-r border-border shadow-xl z-[39] flex flex-col"
      >
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <h2 className="text-lg font-semibold text-foreground">
          {t(section.labelKey)}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* Main items */}
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = isItemActive(item.to);
          return (
            <button
              key={item.to}
              type="button"
              onClick={() => onItemClick(item.to)}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-all duration-150",
                "text-foreground/80 hover:text-foreground",
                "hover:bg-accent",
                isActive && "bg-primary/10 text-primary font-medium border-l-2 border-primary"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{t(item.labelKey)}</span>
            </button>
          );
        })}

        {/* Subsections */}
        {visibleSubSections?.map((sub) => (
          <div key={sub.key} className="pt-3">
            <button
              type="button"
              onClick={() => toggleSub(sub.key)}
              className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              <span>{t(sub.labelKey)}</span>
              {expandedSubs[sub.key] ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
            
            {expandedSubs[sub.key] && (
              <div className="mt-1 ml-2 space-y-0.5">
                {sub.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = isItemActive(item.to);
                  return (
                    <button
                      key={item.to}
                      type="button"
                      onClick={() => onItemClick(item.to)}
                      className={cn(
                        "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-all duration-150",
                        "text-foreground/70 hover:text-foreground",
                        "hover:bg-accent",
                        isActive && "bg-primary/10 text-primary font-medium"
                      )}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{t(item.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
    </>
  );
});

export default AppSidebar;
