import React, { useState, useRef, useEffect, memo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MenuSection, MenuItem } from "./menuConfig";
import { SidebarMenuItemLink, PopoverMenuItem } from "./SidebarMenuItem";

interface SidebarMenuSectionProps {
  section: MenuSection;
  isExpanded: boolean;
  t: (key: string) => string;
  canViewItem: (item: MenuItem) => boolean;
}

// ─────────────────────────────────────────────────────────────
// Expanded state (sidebar open)
// ─────────────────────────────────────────────────────────────

const ExpandedSection = memo(function ExpandedSection({
  section,
  t,
  canViewItem,
}: {
  section: MenuSection;
  t: (key: string) => string;
  canViewItem: (item: MenuItem) => boolean;
}) {
  const location = useLocation();
  const isGroupActive = section.paths.some((p) => location.pathname.startsWith(p));
  
  const [isOpen, setIsOpen] = useState(() => isGroupActive);
  const [expandedSubs, setExpandedSubs] = useState<Record<string, boolean>>({});

  // Auto-expand when route matches
  useEffect(() => {
    if (isGroupActive && !isOpen) {
      setIsOpen(true);
    }
  }, [isGroupActive]);

  const toggleSub = useCallback((key: string) => {
    setExpandedSubs((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const Icon = section.icon;
  const visibleItems = section.items.filter(canViewItem);
  const visibleSubSections = section.subSections?.map((sub) => ({
    ...sub,
    items: sub.items.filter(canViewItem),
  })).filter((sub) => sub.items.length > 0);

  if (visibleItems.length === 0 && (!visibleSubSections || visibleSubSections.length === 0)) {
    return null;
  }

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "flex items-center justify-between w-full gap-3 px-3 py-2 rounded-md text-sm transition-colors",
          "text-sidebar-foreground/90",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isGroupActive && "bg-sidebar-accent/50 text-sidebar-accent-foreground"
        )}
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 flex-shrink-0" />
          <span>{t(section.labelKey)}</span>
        </div>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-sidebar-foreground/60" />
        ) : (
          <ChevronRight className="w-4 h-4 text-sidebar-foreground/60" />
        )}
      </button>

      {isOpen && (
        <div className="ml-4 pl-3 border-l border-sidebar-border space-y-0.5">
          {visibleItems.map((item) => (
            <SidebarMenuItemLink
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={t(item.labelKey)}
              isExpanded
            />
          ))}

          {visibleSubSections?.map((sub) => (
            <div key={sub.key} className="space-y-0.5">
              <button
                type="button"
                onClick={() => toggleSub(sub.key)}
                className="flex items-center justify-between w-full px-2 py-1.5 rounded-md text-xs uppercase tracking-wide text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-colors"
              >
                <span className="font-medium">{t(sub.labelKey)}</span>
                {expandedSubs[sub.key] ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </button>
              {expandedSubs[sub.key] && (
                <div className="pl-2 space-y-0.5">
                  {sub.items.map((item) => (
                    <SidebarMenuItemLink
                      key={item.to}
                      to={item.to}
                      icon={item.icon}
                      label={t(item.labelKey)}
                      isExpanded
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// Collapsed state (sidebar closed) - Inline popover (no portal)
// ─────────────────────────────────────────────────────────────

const CollapsedSection = memo(function CollapsedSection({
  section,
  t,
  canViewItem,
}: {
  section: MenuSection;
  t: (key: string) => string;
  canViewItem: (item: MenuItem) => boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const isGroupActive = section.paths.some((p) => location.pathname.startsWith(p));
  
  const [isOpen, setIsOpen] = useState(false);
  const [expandedSubs, setExpandedSubs] = useState<Record<string, boolean>>({});
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number>();

  const updatePopoverPos = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const top = Math.min(Math.max(8, rect.top), window.innerHeight - 8);
    const left = rect.right + 8;
    const maxHeight = Math.max(120, window.innerHeight - top - 16);

    setPopoverPos({ top, left, maxHeight });
  }, []);

  const Icon = section.icon;
  const visibleItems = section.items.filter(canViewItem);
  const visibleSubSections = section.subSections
    ?.map((sub) => ({
      ...sub,
      items: sub.items.filter(canViewItem),
    }))
    .filter((sub) => sub.items.length > 0);

  if (visibleItems.length === 0 && (!visibleSubSections || visibleSubSections.length === 0)) {
    return null;
  }

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = window.setTimeout(() => setIsOpen(false), 150);
  };

  const handleItemClick = (to: string) => {
    setIsOpen(false);
    navigate(to);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setPopoverPos(null);
      return;
    }

    updatePopoverPos();

    const handle = () => updatePopoverPos();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);

    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [isOpen, updatePopoverPos]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "flex items-center justify-center w-full p-2 rounded-md transition-colors",
          "text-sidebar-foreground/90",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isGroupActive && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <Icon className="w-5 h-5" />
      </button>

      {isOpen && popoverPos
        ? createPortal(
            <div
              className="fixed w-56 bg-popover text-popover-foreground border border-border rounded-lg shadow-lg z-[650] p-2 max-h-[80vh] overflow-y-auto"
              style={{
                top: popoverPos.top,
                left: popoverPos.left,
                maxHeight: popoverPos.maxHeight,
              }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <div className="font-semibold text-sm mb-2 px-2 text-foreground">
                {t(section.labelKey)}
              </div>

              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <PopoverMenuItem
                    key={item.to}
                    to={item.to}
                    icon={item.icon}
                    label={t(item.labelKey)}
                    onClick={() => handleItemClick(item.to)}
                  />
                ))}
              </div>

              {visibleSubSections?.map((sub) => (
                <div key={sub.key} className="mt-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setExpandedSubs((prev) => ({ ...prev, [sub.key]: !prev[sub.key] }))}
                    className="flex items-center justify-between w-full px-2 py-1.5 rounded-md text-xs uppercase tracking-wide text-foreground/70 hover:bg-accent/50 transition-colors"
                  >
                    <span className="font-medium">{t(sub.labelKey)}</span>
                    {expandedSubs[sub.key] ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                  </button>
                  {expandedSubs[sub.key] && (
                    <div className="pl-2 space-y-0.5 mt-1">
                      {sub.items.map((item) => (
                        <PopoverMenuItem
                          key={item.to}
                          to={item.to}
                          icon={item.icon}
                          label={t(item.labelKey)}
                          onClick={() => handleItemClick(item.to)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

export const SidebarMenuSection = memo(function SidebarMenuSection({
  section,
  isExpanded,
  t,
  canViewItem,
}: SidebarMenuSectionProps) {
  if (isExpanded) {
    return <ExpandedSection section={section} t={t} canViewItem={canViewItem} />;
  }
  return <CollapsedSection section={section} t={t} canViewItem={canViewItem} />;
});
