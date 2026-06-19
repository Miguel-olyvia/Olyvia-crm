import { useState, useEffect } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { resolveBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface Organization {
  id: string;
  name: string;
  type: string;
}

interface OrganizationFiltersProps {
  companyFilter: string;
  onCompanyFilterChange: (value: string) => void;
  statusFilter?: string;
  onStatusFilterChange?: (value: string) => void;
  showStatusFilter?: boolean;
  statusOptions?: { value: string; label: string }[];
  extraFilters?: React.ReactNode;
  tenantFilter?: string;
  onTenantFilterChange?: (value: string) => void;
}

export function OrganizationFilters({
  companyFilter,
  onCompanyFilterChange,
  statusFilter = "all",
  onStatusFilterChange,
  showStatusFilter = true,
  statusOptions,
  extraFilters,
  tenantFilter: externalTenantFilter,
  onTenantFilterChange,
}: OrganizationFiltersProps) {
  const { t } = useTranslation();
  const { activeCompany, userType } = useCompany();
  const { isSystemAdmin } = usePermissions();
  const [rootOrgs, setRootOrgs] = useState<Organization[]>([]);
  const [childOrgs, setChildOrgs] = useState<Organization[]>([]);
  const [internalTenantFilter, setInternalTenantFilter] = useState("all");
  
  const tenantFilter = externalTenantFilter !== undefined ? externalTenantFilter : internalTenantFilter;
  const setTenantFilter = onTenantFilterChange || setInternalTenantFilter;
  const [showFilters, setShowFilters] = useState(false);

  const isAdmin = isSystemAdmin;

  // Load root organizations that actually have children (real holdings)
  // or load child orgs directly for non-admins
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        if (isAdmin) {
          // Get all org IDs that are children (have a parent)
          const { data: childLinks } = await supabase
            .from("anew_hierarchy")
            .select("child_org_id, parent_org_id");
          
          const childIds = new Set((childLinks || []).map(l => l.child_org_id));
          const parentIds = new Set((childLinks || []).map(l => l.parent_org_id));

          // Only show orgs that ARE parents (have children) and are NOT children themselves = true holdings
          const holdingIds = Array.from(parentIds).filter(id => !childIds.has(id));

          if (holdingIds.length > 0) {
            const { data } = await supabase
              .from("anew_organizations")
              .select("id, name, type")
              .in("id", holdingIds)
              .eq("status", "active")
              .order("name");
            setRootOrgs(data || []);
          } else {
            setRootOrgs([]);
          }
          
          // When no holdings exist and active company is a standalone root, pre-populate childOrgs with it
          if (holdingIds.length === 0 && activeCompany) {
            const isChild = childIds.has(activeCompany.id);
            if (!isChild) {
              setChildOrgs([{ id: activeCompany.id, name: activeCompany.name, type: activeCompany.type || 'empresa' }]);
            } else {
              setChildOrgs([]);
            }
          } else {
            setChildOrgs([]);
          }
        } else {
          // Non-admin: load orgs the user has memberships on
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const businessUserId = await resolveBusinessUserId(user.id);
          if (!businessUserId) {
            setChildOrgs([]);
            return;
          }

          const { data: memberships } = await supabase
            .from("anew_memberships")
            .select("organization_id")
            .eq("user_id", businessUserId)
            .eq("status", "active");

          const orgIds = (memberships || []).map(m => m.organization_id);
          if (orgIds.length === 0) {
            setChildOrgs([]);
            return;
          }

          const { data: orgs } = await supabase
            .from("anew_organizations")
            .select("id, name, type")
            .in("id", orgIds)
            .eq("status", "active")
            .order("name");

          setChildOrgs(orgs || []);
        }
      } catch (error) {
        console.error("Error loading filter data:", error);
      }
    };

    loadInitialData();
  }, [isAdmin, activeCompany?.id]);

  // Load child organizations when root org (tenant) is selected
  useEffect(() => {
    const loadChildOrgs = async () => {
      if (!isAdmin) return;

      if (tenantFilter === "all") {
        setChildOrgs([]);
        return;
      }

      try {
        // Get direct children of the selected root org
        const { data: links } = await supabase
          .from("anew_hierarchy")
          .select("child_org_id")
          .eq("parent_org_id", tenantFilter);

        const childIds = (links || []).map(l => l.child_org_id);
        if (childIds.length === 0) {
          setChildOrgs([]);
          return;
        }

        const { data } = await supabase
          .from("anew_organizations")
          .select("id, name, type")
          .in("id", childIds)
          .eq("status", "active")
          .order("name");

        setChildOrgs(data || []);
      } catch (error) {
        console.error("Error loading child organizations:", error);
      }
    };

    loadChildOrgs();
  }, [isAdmin, tenantFilter]);

  const handleTenantChange = (value: string) => {
    setTenantFilter(value);
    onCompanyFilterChange("all");
  };

  const clearFilters = () => {
    setTenantFilter("all");
    onCompanyFilterChange("all");
    onStatusFilterChange?.("all");
  };

  const defaultStatusOptions = [
    { value: "all", label: t('common.all') },
    { value: "active", label: t('common.active') },
    { value: "inactive", label: t('common.inactive') },
  ];

  const activeStatusOptions = statusOptions || defaultStatusOptions;

  const hasActiveFilters = companyFilter !== "all" || tenantFilter !== "all" || (statusFilter !== "all" && showStatusFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="h-4 w-4 mr-2" />
          {t('common.filters')}
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-2">
              {[tenantFilter !== "all", companyFilter !== "all", statusFilter !== "all" && showStatusFilter].filter(Boolean).length}
            </Badge>
          )}
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-2" />
            {t('common.clearFilters')}
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-4 p-4 border rounded-lg bg-muted/30">
          {isAdmin && rootOrgs.length > 0 && (
            <div className="min-w-[200px]">
              <label className="text-sm font-medium mb-1 block">
                Holding
              </label>
              <Select value={tenantFilter} onValueChange={handleTenantChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  {rootOrgs.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(childOrgs.length > 0 || (isAdmin && activeCompany)) && (
            <div className="min-w-[200px]">
              <label className="text-sm font-medium mb-1 block">
                {t('common.company')}
              </label>
              <Select value={companyFilter} onValueChange={onCompanyFilterChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  {childOrgs.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showStatusFilter && onStatusFilterChange && (
            <div className="min-w-[200px]">
              <label className="text-sm font-medium mb-1 block">
                {t('common.status')}
              </label>
              <Select value={statusFilter} onValueChange={onStatusFilterChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.all')} />
                </SelectTrigger>
                <SelectContent>
                  {activeStatusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {extraFilters}
        </div>
      )}
    </div>
  );
}
