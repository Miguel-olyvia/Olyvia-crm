import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye, UserCheck, UserX, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissionScope } from "@/hooks/usePermissionScope";

interface ContactsDashboardProps {
  companyId?: string;
  activeFilter?: string;
  onFilterChange?: (filter: string) => void;
  isParentOrg?: boolean;
  onDealsEntityIds?: (ids: string[]) => void;
  scopeOrgIds?: string[];
}

interface DashboardStats {
  totalContacts: number;
  activeContacts: number;
  inactiveContacts: number;
  conversionRate: number;
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
        onClick ? 'cursor-pointer' : ''
      } ${highlighted ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md'}`}
    >
      <p className="text-sm font-medium text-muted-foreground mb-2">{title}</p>
      <div className="flex items-center gap-2">
        <Icon className={`w-5 h-5 ${iconColor}`} />
        <span className="text-2xl font-bold">{value}{suffix}</span>
      </div>
    </div>
  );
};

export function ContactsDashboard({ companyId, activeFilter, onFilterChange, isParentOrg = false, onDealsEntityIds, scopeOrgIds = [] }: ContactsDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalContacts: 0, activeContacts: 0, inactiveContacts: 0, conversionRate: 0,
  });
  const { userType, activeCompany } = useCompany();
  const { getPermissionScope, anewUserId, loading: scopeLoading } = usePermissionScope();

  useEffect(() => {
    if (!scopeLoading) loadDashboardData();
  }, [companyId, userType, activeCompany?.id, isParentOrg, scopeLoading, anewUserId, scopeOrgIds]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const viewScope = getPermissionScope("contacts.view");
      if (viewScope === "NONE") {
        setStats({ totalContacts: 0, activeContacts: 0, inactiveContacts: 0, conversionRate: 0 });
        setLoading(false); return;
      }

      let internalUserId: string | null = anewUserId || null;
      let authUserId: string | null = null;
      if (viewScope === "OWNED") {
        const { data: authUser } = await supabase.auth.getUser();
        authUserId = authUser?.user?.id || null;
        if (!internalUserId && authUserId) {
          const { data: anewUser } = await supabase.from("anew_users").select("id").eq("auth_user_id", authUserId).maybeSingle();
          internalUserId = anewUser?.id || null;
        }
      }

      let query = supabase.from("anew_contacts").select("id, status, root_organization_id, created_by, assigned_to, entity_id");
      if (companyId) query = query.eq("organization_id", companyId);
      else if (scopeOrgIds.length > 0) query = query.in("organization_id", scopeOrgIds);
      else if (activeCompany?.id) query = query.eq("organization_id", activeCompany.id);
      if (viewScope === "OWNED" && internalUserId) {
        query = query.or(`assigned_to.eq.${internalUserId},created_by.eq.${internalUserId}`);
      }

      const { data: contactsList, error } = await query;
      if (error) throw error;
      const list = contactsList || [];

      // Identify converted entities
      const entityIds = list.map(c => c.entity_id).filter(Boolean);
      const convertedEntityIds = new Set<string>();
      if (entityIds.length > 0) {
        const [inactiveRes, clientRes] = await Promise.all([
          supabase.from("anew_entity_roles").select("entity_id").in("entity_id", entityIds).eq("role","contact").eq("status","inactive"),
          supabase.from("anew_entity_roles").select("entity_id").in("entity_id", entityIds).eq("role","client").eq("status","active"),
        ]);
        (inactiveRes.data || []).forEach(r => convertedEntityIds.add(r.entity_id));
        (clientRes.data || []).forEach(r => convertedEntityIds.add(r.entity_id));
      }
      const convertedCount = convertedEntityIds.size;

      const nonClientContacts = list.filter(c => !convertedEntityIds.has(c.entity_id));
      const totalContacts = nonClientContacts.length;
      const activeContacts = nonClientContacts.filter(c => c.status === "active").length;
      const inactiveContacts = nonClientContacts.filter(c => c.status === "inactive").length;
      const rate = list.length > 0 ? Math.round((convertedCount / list.length) * 100) : 0;

      setStats({ totalContacts, activeContacts, inactiveContacts, conversionRate: rate });
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <StatCard title="Total" value={stats.totalContacts} icon={Eye} iconColor="text-primary" loading={loading}
        highlighted={activeFilter === "all"} onClick={() => onFilterChange?.("all")} />
      <StatCard title="Ativos" value={stats.activeContacts} icon={UserCheck} iconColor="text-green-500" loading={loading}
        highlighted={activeFilter === "active"} onClick={() => onFilterChange?.("active")} />
      <StatCard title="Inativos" value={stats.inactiveContacts} icon={UserX} iconColor="text-red-500" loading={loading}
        highlighted={activeFilter === "inactive"} onClick={() => onFilterChange?.("inactive")} />
      <StatCard title="Conversão para clientes" value={stats.conversionRate} icon={TrendingUp} iconColor="text-green-500"
        loading={loading} suffix="%" />
    </div>
  );
}
