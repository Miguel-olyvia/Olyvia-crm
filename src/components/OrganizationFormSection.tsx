import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, ChevronsUpDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";

interface Organization {
  id: string;
  name: string;
  type: string;
}

export interface LevelSelection {
  depth: number;
  type: string;
  selectedIds: string[];
}

export interface OrganizationSelection {
  tenantId: string;
  companyId: string;
  businessUnitId: string;
  departmentId: string;
  secondaryCompanyIds: string[];
  selectedCompanyIds?: string[];
  selectedBusinessUnitIds?: string[];
  selectedDepartmentIds?: string[];
  levelSelections?: LevelSelection[];
}

interface OrganizationFormSectionProps {
  value: OrganizationSelection;
  onChange: (value: OrganizationSelection) => void;
  showSecondaryCompanies?: boolean;
  showBusinessUnit?: boolean;
  showDepartment?: boolean;
  required?: boolean;
  multiSelectCompanies?: boolean;
  activeOrganizationOnly?: boolean;
}

// Type display order – lower = higher in tree
const TYPE_PRIORITY: Record<string, number> = {
  holding: 0, empresa: 1, filial: 2, departamento: 3,
  "divisão": 4, equipa: 5, projeto: 6,
};

function getTypePriority(type: string): number {
  return TYPE_PRIORITY[type.toLowerCase()] ?? 50;
}

function getTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

interface DynamicLevel {
  depth: number;
  type: string;
  orgs: Organization[];
}

export function OrganizationFormSection({
  value,
  onChange,
  showSecondaryCompanies = true,
  required = false,
  multiSelectCompanies = false,
  activeOrganizationOnly = false,
}: OrganizationFormSectionProps) {
  const { t } = useTranslation();
  const { activeCompany, userType } = useCompany();
  const { isSystemAdmin } = usePermissions();

  const [rootOrgs, setRootOrgs] = useState<Organization[]>([]);
  const [dynamicLevels, setDynamicLevels] = useState<DynamicLevel[]>([]);
  const [loadingRootOrgs, setLoadingRootOrgs] = useState(false);
  const [loadingLevels, setLoadingLevels] = useState(false);
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [companyAdminRootOrg, setCompanyAdminRootOrg] = useState<Organization | null>(null);
  const [visibleOrgIds, setVisibleOrgIds] = useState<Set<string> | null>(null);
  const [resolvedRootId, setResolvedRootId] = useState("");

  const isCompanyAdmin = userType === 'company_admin';
  const canSelectOrganization = isSystemAdmin && !activeOrganizationOnly;
  const levelSelections = value.levelSelections || [];
  const effectiveTenantId = value.tenantId || resolvedRootId;

  useEffect(() => {
    if (!value.tenantId && defaultsApplied) {
      setDefaultsApplied(false);
    }
  }, [value.tenantId, defaultsApplied]);

  // ─── Load user's visible org IDs (permission-based) ───
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.rpc("get_user_visible_org_ids", { _auth_uid: user.id });
      if (data) {
        // RPC returns SETOF uuid - each element is a uuid string directly
        setVisibleOrgIds(new Set(data as unknown as string[]));
      }
    };
    load();
  }, []);

  // ─── Resolve root org for a given org id ───
  const resolveRootOrg = async (orgId: string): Promise<string> => {
    let currentId = orgId;
    for (let i = 0; i < 10; i++) {
      const { data } = await supabase
        .from("anew_hierarchy")
        .select("parent_org_id")
        .eq("child_org_id", currentId)
        .maybeSingle();
      if (!data?.parent_org_id) return currentId;
      currentId = data.parent_org_id;
    }
    return currentId;
  };

  // Keep a resolved root locally so dynamic levels don't flicker while parent state hydrates
  useEffect(() => {
    if (!activeCompany?.id) {
      setResolvedRootId("");
      return;
    }

    let cancelled = false;

    const loadResolvedRoot = async () => {
      const rootId = await resolveRootOrg(activeCompany.id);
      if (!cancelled) setResolvedRootId(rootId);
    };

    loadResolvedRoot();

    return () => {
      cancelled = true;
    };
  }, [activeCompany?.id]);

  // ─── Find depth of an org relative to a root ───
  const findOrgDepthAndType = async (rootId: string, targetId: string): Promise<{ depth: number; type: string } | null> => {
    if (rootId === targetId) return null; // target IS the root
    let parentIds = [rootId];
    for (let depth = 0; depth < 10; depth++) {
      const { data: links } = await supabase
        .from("anew_hierarchy")
        .select("child_org_id")
        .in("parent_org_id", parentIds);
      const childIds = (links || []).map(l => l.child_org_id);
      if (childIds.length === 0) return null;
      if (childIds.includes(targetId)) {
        const { data: org } = await supabase
          .from("anew_organizations")
          .select("type")
          .eq("id", targetId)
          .single();
        return { depth, type: org?.type || 'empresa' };
      }
      parentIds = childIds;
    }
    return null;
  };

  // ─── Apply defaults: resolve tenant + pre-select active company ───
  useEffect(() => {
    if (defaultsApplied || !activeCompany?.id || !resolvedRootId) return;

    const applyDefaults = async () => {
      const depthInfo = await findOrgDepthAndType(resolvedRootId, activeCompany.id);

      const newLevelSelections: LevelSelection[] = depthInfo
        ? [{ depth: depthInfo.depth, type: depthInfo.type, selectedIds: [activeCompany.id] }]
        : [];

      onChange({
        ...value,
        tenantId: resolvedRootId,
        companyId: activeCompany.id,
        selectedCompanyIds: [activeCompany.id],
        levelSelections: newLevelSelections,
      });
      setDefaultsApplied(true);
    };

    applyDefaults();
  }, [activeCompany?.id, defaultsApplied, onChange, resolvedRootId]);

  // Active-org-only forms must not drift to another organization through stale edit state.
  useEffect(() => {
    if (!activeOrganizationOnly || !activeCompany?.id) return;

    const isAlreadyActiveOnly =
      value.companyId === activeCompany.id &&
      value.selectedCompanyIds?.length === 1 &&
      value.selectedCompanyIds[0] === activeCompany.id &&
      (value.secondaryCompanyIds || []).length === 0 &&
      (value.levelSelections || []).length === 0;

    if (isAlreadyActiveOnly) return;

    onChange({
      ...value,
      tenantId: resolvedRootId || value.tenantId,
      companyId: activeCompany.id,
      businessUnitId: "",
      departmentId: "",
      secondaryCompanyIds: [],
      selectedCompanyIds: [activeCompany.id],
      selectedBusinessUnitIds: [],
      selectedDepartmentIds: [],
      levelSelections: [],
    });
  }, [
    activeOrganizationOnly,
    activeCompany?.id,
    onChange,
    resolvedRootId,
    value,
  ]);

  // ─── Load company admin root org (read-only display) ───
  useEffect(() => {
    if (!isCompanyAdmin || !activeCompany?.id) return;
    const load = async () => {
      const rootId = await resolveRootOrg(activeCompany.id);
      if (rootId !== activeCompany.id) {
        const { data } = await supabase
          .from("anew_organizations")
          .select("id, name, type")
          .eq("id", rootId)
          .single();
        if (data) setCompanyAdminRootOrg(data);
      } else {
        // Active company IS the root (no holding parent) — show itself
        setCompanyAdminRootOrg({ id: activeCompany.id, name: activeCompany.name, type: activeCompany.type || 'empresa' });
      }
    };
    load();
  }, [isCompanyAdmin, activeCompany?.id]);

  // ─── Load root organizations (dynamic root types, for system admin) ───
  useEffect(() => {
    if (!canSelectOrganization) return;
    const load = async () => {
      setLoadingRootOrgs(true);
      try {
        // Root orgs = orgs that ARE parents in hierarchy but NOT children
        // Plus include the active company when it is a standalone root without holding
        const { data: childLinks } = await supabase
          .from("anew_hierarchy")
          .select("child_org_id");
        const childIds = new Set((childLinks || []).map(l => l.child_org_id));

        const { data: parentLinks } = await supabase
          .from("anew_hierarchy")
          .select("parent_org_id");
        const parentIds = new Set((parentLinks || []).map(l => l.parent_org_id));

        const rootCandidateIds = Array.from(parentIds).filter(id => !childIds.has(id));

        let query = supabase
          .from("anew_organizations")
          .select("id, name, type")
          .eq("status", "active")
          .order("name");

        if (rootCandidateIds.length > 0) {
          query = query.or(`id.in.(${rootCandidateIds.join(",")}),type.eq.holding`);
        } else {
          query = query.eq("type", "holding");
        }

        const { data } = await query;
        const rootOrgMap = new Map<string, Organization>();

        (data || []).forEach((org) => rootOrgMap.set(org.id, org));

        if (activeCompany?.id) {
          const activeRootId = await resolveRootOrg(activeCompany.id);
          if (activeRootId === activeCompany.id) {
            rootOrgMap.set(activeCompany.id, {
              id: activeCompany.id,
              name: activeCompany.name,
              type: activeCompany.type || "empresa",
            });
          }
        }

        setRootOrgs(
          Array.from(rootOrgMap.values()).sort((a, b) => a.name.localeCompare(b.name))
        );
      } finally {
        setLoadingRootOrgs(false);
      }
    };
    load();
  }, [canSelectOrganization, activeCompany?.id, activeCompany?.name, activeCompany?.type]);

  // ─── Load dynamic levels (cascading from root/active company) ───
  useEffect(() => {
    if (activeOrganizationOnly) {
      setDynamicLevels([]);
      return;
    }

    if (visibleOrgIds === null && !isSystemAdmin) return; // wait for visible orgs to load
    const loadLevels = async () => {
      let startParentIds: string[] = [];

      if (effectiveTenantId) {
        startParentIds = [effectiveTenantId];
      }

      if (startParentIds.length === 0) { setDynamicLevels([]); return; }

      setLoadingLevels(true);
      try {
        const levels: DynamicLevel[] = [];
        let parentIds = startParentIds;

        for (let depth = 0; depth < 10; depth++) {
          const { data: links } = await supabase
            .from("anew_hierarchy")
            .select("child_org_id")
            .in("parent_org_id", parentIds);

          const childIds = (links || []).map(l => l.child_org_id);
          if (childIds.length === 0) break;

          const { data: orgs } = await supabase
            .from("anew_organizations")
            .select("id, name, type")
            .in("id", childIds)
            .eq("status", "active")
            .order("name");

          if (!orgs || orgs.length === 0) break;

          const filteredOrgs = visibleOrgIds && !isSystemAdmin
            ? orgs.filter(org => visibleOrgIds.has(org.id))
            : orgs;

          if (filteredOrgs.length === 0) break;

          const byType = new Map<string, Organization[]>();
          filteredOrgs.forEach(org => {
            if (!byType.has(org.type)) byType.set(org.type, []);
            byType.get(org.type)!.push(org);
          });

          const sortedTypes = Array.from(byType.entries()).sort(
            (a, b) => getTypePriority(a[0]) - getTypePriority(b[0])
          );

          for (const [type, typeOrgs] of sortedTypes) {
            levels.push({ depth, type, orgs: typeOrgs });
          }

          const selectionsAtDepth = levelSelections.filter(s =>
            s.depth === depth && s.selectedIds.length > 0
          );
          const nextParentIds = selectionsAtDepth.flatMap(s => s.selectedIds);
          if (nextParentIds.length === 0) break;

          parentIds = nextParentIds;
        }

        setDynamicLevels(levels);
      } finally {
        setLoadingLevels(false);
      }
    };

    loadLevels();
  }, [activeOrganizationOnly, effectiveTenantId, visibleOrgIds, isSystemAdmin, JSON.stringify(levelSelections)]);

  // ─── Handlers ───
  const handleTenantChange = (tenantId: string) => {
    onChange({
      tenantId,
      companyId: "",
      businessUnitId: "",
      departmentId: "",
      secondaryCompanyIds: [],
      selectedCompanyIds: [],
      levelSelections: [],
    });
  };

  // Toggle selection in a dynamic level
  const handleLevelToggle = (depth: number, type: string, orgId: string) => {
    const current = [...levelSelections];
    const idx = current.findIndex(s => s.depth === depth && s.type === type);
    let selectedIds: string[];

    if (idx >= 0) {
      selectedIds = current[idx].selectedIds.includes(orgId)
        ? current[idx].selectedIds.filter(id => id !== orgId)
        : [...current[idx].selectedIds, orgId];
      if (selectedIds.length === 0) current.splice(idx, 1);
      else current[idx] = { depth, type, selectedIds };
    } else {
      selectedIds = [orgId];
      current.push({ depth, type, selectedIds });
    }

    // Clear deeper levels
    const filtered = current.filter(s => s.depth <= depth);

    // Derive legacy fields from selections
    const allSelected = filtered.flatMap(s => s.selectedIds);

    onChange({
      ...value,
      levelSelections: filtered,
      companyId: allSelected[0] || "",
      selectedCompanyIds: allSelected,
      secondaryCompanyIds: allSelected.slice(1),
      businessUnitId: "",
      departmentId: "",
      selectedBusinessUnitIds: [],
      selectedDepartmentIds: [],
    });
  };

  // Single-select in a dynamic level
  const handleLevelSingleSelect = (depth: number, type: string, orgId: string) => {
    const current = levelSelections.filter(s => !(s.depth === depth && s.type === type));
    if (orgId) current.push({ depth, type, selectedIds: [orgId] });
    const filtered = current.filter(s => s.depth <= depth);

    const allSelected = filtered.flatMap(s => s.selectedIds);

    onChange({
      ...value,
      levelSelections: filtered,
      companyId: allSelected[0] || "",
      selectedCompanyIds: allSelected,
      secondaryCompanyIds: allSelected.slice(1),
      businessUnitId: "",
      departmentId: "",
    });
  };

  // Helper to get selected IDs for a level
  const getSelectedForLevel = (depth: number, type: string): string[] => {
    return levelSelections.find(s => s.depth === depth && s.type === type)?.selectedIds || [];
  };

  // Section title is always the generic "Organização" label
  const sectionTitle = t('clients.form.organization');

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg border-b pb-2">{sectionTitle}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Root org selector – system admin only */}
        {canSelectOrganization && (() => {
          const selectedRootOrg =
            rootOrgs.find((org) => org.id === effectiveTenantId) ||
            (activeCompany && effectiveTenantId === activeCompany.id
              ? {
                  id: activeCompany.id,
                  name: activeCompany.name,
                  type: activeCompany.type || "empresa",
                }
              : null);

          const rootLabel = selectedRootOrg
            ? getTypeLabel(selectedRootOrg.type)
            : rootOrgs.length > 0
              ? getTypeLabel(rootOrgs[0].type)
              : t('clients.form.selectOrganization');

          return (
            <div className="space-y-2">
              <Label>{rootLabel}</Label>
              <Select value={effectiveTenantId} onValueChange={handleTenantChange} disabled={loadingRootOrgs}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingRootOrgs ? t('common.loading') : rootLabel} />
                </SelectTrigger>
                <SelectContent>
                  {rootOrgs.map((org) => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })()}

        {/* Root org read-only for company admin */}
        {!activeOrganizationOnly && isCompanyAdmin && companyAdminRootOrg && (
          <div className="space-y-2">
            <Label>{getTypeLabel(companyAdminRootOrg.type)}</Label>
            <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm">
              {companyAdminRootOrg.name}
            </div>
          </div>
        )}
      </div>

      {(activeOrganizationOnly || (!canSelectOrganization && !isCompanyAdmin && !companyAdminRootOrg)) && activeCompany && (
        <div className="space-y-2">
          <Label>{getTypeLabel(activeCompany.type || 'empresa')}</Label>
          <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm">
            {activeCompany.name}
          </div>
        </div>
      )}

      {/* Dynamic hierarchy levels – one field per org type */}
      {!activeOrganizationOnly && dynamicLevels.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {dynamicLevels.map((level) => {
            const selected = getSelectedForLevel(level.depth, level.type);

            if (multiSelectCompanies) {
              return (
                <div key={`${level.depth}-${level.type}`} className="space-y-2">
                  <Label>
                    {getTypeLabel(level.type)}
                    {required && level.depth === 0 && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <MultiSelectPopover
                    items={level.orgs}
                    selectedIds={selected}
                    onToggle={(id) => handleLevelToggle(level.depth, level.type, id)}
                    onRemove={(id) => handleLevelToggle(level.depth, level.type, id)}
                    loading={loadingLevels}
                    placeholder={
                      selected.length === 0
                        ? `Selecionar ${getTypeLabel(level.type)}`
                        : `${selected.length} selecionado(s)`
                    }
                    emptyMessage={`Nenhum(a) ${level.type} disponível`}
                    t={t}
                  />
                </div>
              );
            } else {
              const singleSelected = selected[0] || "";
              return (
                <div key={`${level.depth}-${level.type}`} className="space-y-2">
                  <Label>
                    {getTypeLabel(level.type)}
                    {required && level.depth === 0 && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Select
                    value={singleSelected}
                    onValueChange={(v) => handleLevelSingleSelect(level.depth, level.type, v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Selecionar ${getTypeLabel(level.type)}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {level.orgs.map((org) => (
                        <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            }
          })}
        </div>
      )}

      {/* Secondary Companies (legacy single-select mode) */}
      {!activeOrganizationOnly && !multiSelectCompanies && showSecondaryCompanies && value.companyId && (
        <SecondaryCompaniesSection
          value={value}
          onChange={onChange}
          dynamicLevels={dynamicLevels}
          t={t}
        />
      )}
    </div>
  );
}

// ─── Secondary Companies (legacy) ───
function SecondaryCompaniesSection({
  value,
  onChange,
  dynamicLevels,
  t,
}: {
  value: OrganizationSelection;
  onChange: (v: OrganizationSelection) => void;
  dynamicLevels: DynamicLevel[];
  t: (key: string) => string;
}) {
  // Get all orgs from the first depth level (company-level siblings)
  const companyOrgs = dynamicLevels.filter(l => l.depth === 0).flatMap(l => l.orgs);
  const available = companyOrgs.filter(
    c => c.id !== value.companyId && !(value.secondaryCompanyIds || []).includes(c.id)
  );

  const handleAdd = (id: string) => {
    if (id && !(value.secondaryCompanyIds || []).includes(id)) {
      onChange({ ...value, secondaryCompanyIds: [...(value.secondaryCompanyIds || []), id] });
    }
  };
  const handleRemove = (id: string) => {
    onChange({ ...value, secondaryCompanyIds: (value.secondaryCompanyIds || []).filter(i => i !== id) });
  };

  return (
    <div className="space-y-2">
      <Label>{t('clients.form.secondaryCompanies')}</Label>
      <p className="text-xs text-muted-foreground">{t('clients.form.secondaryCompaniesHint')}</p>
      <div className="flex flex-wrap gap-2 min-h-[32px] p-2 border rounded-md bg-muted/50">
        {(value.secondaryCompanyIds || []).length === 0 ? (
          <span className="text-sm text-muted-foreground">{t('clients.form.noSecondaryCompanies')}</span>
        ) : (
          (value.secondaryCompanyIds || []).map(cid => {
            const org = companyOrgs.find(c => c.id === cid);
            return (
              <Badge key={cid} variant="secondary" className="flex items-center gap-1">
                {org?.name || cid}
                <button type="button" onClick={() => handleRemove(cid)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })
        )}
      </div>
      <Select value="" onValueChange={handleAdd}>
        <SelectTrigger>
          <SelectValue placeholder={t('clients.form.addCompany')} />
        </SelectTrigger>
        <SelectContent>
          {available.map((org) => (
            <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Reusable Multi-Select Popover ───
function MultiSelectPopover({
  items,
  selectedIds,
  onToggle,
  onRemove,
  loading,
  placeholder,
  emptyMessage,
  t,
}: {
  items: Organization[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  loading: boolean;
  placeholder: string;
  emptyMessage: string;
  t: (key: string) => string;
}) {
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
            {placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] max-w-[calc(100vw-2rem)] p-0 z-[9999] bg-popover border shadow-md"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="max-h-60 overflow-y-auto overscroll-contain p-2 space-y-1">
            {loading ? (
              <div className="text-sm text-muted-foreground p-2">{t('common.loading')}</div>
            ) : items.length === 0 ? (
              <div className="text-sm text-muted-foreground p-2">{emptyMessage}</div>
            ) : (
              items.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent",
                      isSelected && "bg-accent",
                    )}
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(item.id); }}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggle(item.id)}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="text-sm">{item.name}</span>
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedIds.map(id => {
            const item = items.find(i => i.id === id);
            return (
              <Badge key={id} variant="secondary" className="flex items-center gap-1">
                {item?.name || id}
                <button type="button" onClick={() => onRemove(id)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </>
  );
}
