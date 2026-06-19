import { Eye, UserCheck, UserX, UserPlus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface UsersDashboardProps {
  total: number;
  active: number;
  inactive: number;
  newLast30d: number;
  loading?: boolean;
  activeFilter?: string;
  onFilterChange?: (filter: string) => void;
}

const StatCard = ({
  title, value, icon: Icon, iconColor = "text-primary",
  loading = false, highlighted = false, suffix = "", onClick,
}: {
  title: string; value: string | number; icon: React.ElementType;
  iconColor?: string; loading?: boolean; highlighted?: boolean;
  suffix?: string; onClick?: () => void;
}) => {
  if (loading) {
    return (
      <div className="bg-card rounded-xl border p-4 min-w-[140px]">
        <div className="space-y-3">
          <Skeleton className="h-4 w-16" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-8 w-10" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`bg-card rounded-xl border p-4 min-w-[140px] transition-all ${
        onClick ? "cursor-pointer" : ""
      } ${highlighted ? "ring-2 ring-primary shadow-lg" : "hover:shadow-md"}`}
    >
      <p className="text-sm font-medium text-muted-foreground mb-2">{title}</p>
      <div className="flex items-center gap-2">
        <Icon className={`w-5 h-5 ${iconColor}`} />
        <span className="text-2xl font-bold">{value}{suffix}</span>
      </div>
    </div>
  );
};

export function UsersDashboard({ total, active, inactive, newLast30d, loading = false, activeFilter, onFilterChange }: UsersDashboardProps) {
  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <StatCard title="Total" value={total} icon={Eye} iconColor="text-primary" loading={loading}
        highlighted={activeFilter === "all"} onClick={() => onFilterChange?.("all")} />
      <StatCard title="Ativos" value={active} icon={UserCheck} iconColor="text-green-500" loading={loading}
        highlighted={activeFilter === "active"} onClick={() => onFilterChange?.("active")} />
      <StatCard title="Inativos" value={inactive} icon={UserX} iconColor="text-red-500" loading={loading}
        highlighted={activeFilter === "inactive"} onClick={() => onFilterChange?.("inactive")} />
      <StatCard title="Novos (30 dias)" value={newLast30d} icon={UserPlus} iconColor="text-blue-500" loading={loading} />
    </div>
  );
}
