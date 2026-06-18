import { memo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import olyviaMascot from "@/assets/olyvia-mascot.png";

export const SidebarSkeleton = memo(function SidebarSkeleton() {
  return (
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

      {/* Skeleton items */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-1">
          {/* Simulate 6 menu items */}
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-center w-full p-3"
            >
              <Skeleton className="w-5 h-5 rounded-lg bg-sidebar-accent/50" />
            </div>
          ))}
        </div>
      </div>

      {/* Footer skeleton */}
      <div className="shrink-0 p-2 border-t border-sidebar-border">
        <div className="flex items-center justify-center w-full p-3">
          <Skeleton className="w-5 h-5 rounded-lg bg-sidebar-accent/50" />
        </div>
      </div>
    </aside>
  );
});

export default SidebarSkeleton;
