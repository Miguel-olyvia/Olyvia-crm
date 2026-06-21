import React, { memo } from "react";
import { Link, useLocation } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarMenuItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  isExpanded: boolean;
  onClick?: () => void;
}

export const SidebarMenuItemLink = memo(function SidebarMenuItemLink({
  to,
  icon: Icon,
  label,
  isExpanded,
  onClick,
}: SidebarMenuItemProps) {
  const location = useLocation();
  const isActive = location.pathname === to || location.pathname.startsWith(to + "/");

  const link = (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
        "text-sidebar-foreground/90",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
        !isExpanded && "justify-center px-2"
      )}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      {isExpanded && <span className="truncate">{label}</span>}
    </Link>
  );

  if (isExpanded) return link;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" align="center" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

// Simple version for popover content (always shows label)
interface PopoverMenuItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}

export const PopoverMenuItem = memo(function PopoverMenuItem({
  to,
  icon: Icon,
  label,
  onClick,
}: PopoverMenuItemProps) {
  const location = useLocation();
  const isActive = location.pathname === to || location.pathname.startsWith(to + "/");

  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
        "text-popover-foreground",
        "hover:bg-accent hover:text-accent-foreground",
        isActive && "bg-accent text-accent-foreground font-medium"
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
});
