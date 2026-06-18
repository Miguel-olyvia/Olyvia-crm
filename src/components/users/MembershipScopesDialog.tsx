import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";

interface Permission {
  code: string;
  name: string;
  category: string;
  supports_scope: boolean;
}

export interface PendingScopeEntry {
  permission_code: string;
  scope_level: "NONE" | "OWNED" | "TEAM" | "ORG";
}

interface MembershipScopesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  membershipId: string | null;
  organizationName?: string;
  roleId?: string;
  /** Pending (unsaved) scope overrides for this membership */
  pendingScopes?: PendingScopeEntry[];
  /** Called when the user changes a scope locally (deferred save) */
  onScopeChange?: (membershipId: string, scopes: PendingScopeEntry[]) => void;
}

const SCOPE_LEVELS = [
  { value: "NONE", labelKey: "scopes.none" },
  { value: "OWNED", labelKey: "scopes.owned" },
  { value: "TEAM", labelKey: "scopes.team" },
  { value: "ORG", labelKey: "scopes.org" },
] as const;

const SCOPE_HIERARCHY: Record<string, number> = {
  NONE: 0,
  OWNED: 1,
  TEAM: 2,
  ORG: 3,
};

export function MembershipScopesDialog({
  open,
  onOpenChange,
  membershipId,
  organizationName,
  roleId,
  pendingScopes,
  onScopeChange,
}: MembershipScopesDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [dbScopes, setDbScopes] = useState<PendingScopeEntry[]>([]);
  const [membershipExists, setMembershipExists] = useState(true);
  // Local draft state – only pushed to parent on explicit confirm
  const [localScopes, setLocalScopes] = useState<PendingScopeEntry[]>([]);

  // Initialise local draft whenever the dialog opens
  useEffect(() => {
    if (open) {
      setLocalScopes(pendingScopes ?? dbScopes);
    }
  }, [open]);

  const effectiveScopes = localScopes;

  useEffect(() => {
    if (open && membershipId) {
      loadData();
    }
  }, [open, membershipId, roleId]);

  const loadData = async () => {
    if (!membershipId) return;
    setLoading(true);
    setMembershipExists(true);

    try {
      // Verify membership exists in DB
      const { data: membershipCheck, error: checkError } = await supabase
        .from("anew_memberships")
        .select("id")
        .eq("id", membershipId)
        .maybeSingle();

      if (checkError) throw checkError;
      if (!membershipCheck) {
        setMembershipExists(false);
        setLoading(false);
        return;
      }

      // Fetch role permissions codes
      let roleCodes: string[] = [];
      if (roleId) {
        const { data: rolePermsData } = await supabase
          .from("anew_role_permissions")
          .select("permission_code")
          .eq("role_id", roleId);
        roleCodes = (rolePermsData || []).map(rp => rp.permission_code);
      }

      // Fetch only permissions that this role has AND that support scope
      if (roleCodes.length > 0) {
        const { data: permsData, error: permsError } = await supabase
          .from("anew_permissions")
          .select("code, name, category, supports_scope")
          .in("code", roleCodes)
          .eq("supports_scope", true)
          .order("category")
          .order("name");

        if (permsError) throw permsError;
        setPermissions(permsData || []);
      } else {
        setPermissions([]);
      }

      // Fetch existing scope overrides from DB (baseline)
      const { data: scopesData, error: scopesError } = await supabase
        .from("anew_membership_permission_scopes")
        .select("permission_code, scope_level")
        .eq("membership_id", membershipId);

      if (scopesError) throw scopesError;
      const loaded = (scopesData || []).map(s => ({
        permission_code: s.permission_code,
        scope_level: s.scope_level as PendingScopeEntry["scope_level"],
      }));
      setDbScopes(loaded);

      // Initialize local draft from DB if no pending scopes exist
      if (!pendingScopes) {
        setLocalScopes(loaded);
      } else {
        setLocalScopes(pendingScopes);
      }
    } catch (error: any) {
      console.error("Error loading scopes:", error);
      toast({
        title: t("common.error"),
        description: t("permissions.scope") + ": " + (error.message || ""),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getScopeForPermission = (permCode: string): PendingScopeEntry["scope_level"] => {
    const scope = effectiveScopes.find(s => s.permission_code === permCode);
    return scope?.scope_level || "OWNED";
  };

  // Helper to upsert a scope in a list
  const upsertScope = (scopes: PendingScopeEntry[], code: string, level: PendingScopeEntry["scope_level"]): PendingScopeEntry[] => {
    if (level === "OWNED") {
      return scopes.filter(s => s.permission_code !== code);
    }
    const existing = scopes.find(s => s.permission_code === code);
    if (existing) {
      return scopes.map(s => s.permission_code === code ? { ...s, scope_level: level } : s);
    }
    return [...scopes, { permission_code: code, scope_level: level }];
  };

  const handleScopeChange = (permissionCode: string, newLevel: PendingScopeEntry["scope_level"]) => {
    if (!membershipId) return;

    let updatedScopes = upsertScope(effectiveScopes, permissionCode, newLevel);

    // Dependency logic: extract module prefix (e.g. "leads" from "leads.edit")
    const parts = permissionCode.split(".");
    if (parts.length === 2) {
      const module = parts[0];
      const viewCode = `${module}.view`;
      const newLevelNum = SCOPE_HIERARCHY[newLevel];

      // If elevating a non-view permission, auto-elevate the view permission
      if (permissionCode !== viewCode && newLevelNum > 0) {
        const currentViewEntry = updatedScopes.find(s => s.permission_code === viewCode);
        const currentViewLevel = currentViewEntry?.scope_level || "OWNED";
        const currentViewNum = SCOPE_HIERARCHY[currentViewLevel];
        if (newLevelNum > currentViewNum) {
          const viewExists = permissions.some(p => p.code === viewCode);
          if (viewExists) {
            updatedScopes = upsertScope(updatedScopes, viewCode, newLevel);
          }
        }
      }

      // If lowering the view permission, cap all dependent permissions in same module
      if (permissionCode === viewCode) {
        const modulePerms = permissions.filter(p => p.code.startsWith(`${module}.`) && p.code !== viewCode);
        for (const dep of modulePerms) {
          const depScope = updatedScopes.find(s => s.permission_code === dep.code);
          const depLevel = depScope?.scope_level || "OWNED";
          if (SCOPE_HIERARCHY[depLevel] > newLevelNum) {
            updatedScopes = upsertScope(updatedScopes, dep.code, newLevel);
          }
        }
      }
    }

    setLocalScopes(updatedScopes);
  };

  const handleConfirm = () => {
    if (membershipId && onScopeChange) {
      onScopeChange(membershipId, localScopes);
    }
    onOpenChange(false);
  };

  const categoryLabelsPt: Record<string, string> = {
    dashboard: 'Dashboard', organizations: 'Organizações', org_chart: 'Organograma',
    products: 'Produtos', bundles: 'Bundles', brands: 'Marcas',
    product_categories: 'Categorias de Produto', product_subcategories: 'Subcategorias de Produto',
    product_attributes: 'Atributos de Produto', units_of_measure: 'Unidades de Medida',
    services: 'Serviços', service_categories: 'Categorias de Serviço',
    service_subcategories: 'Subcategorias de Serviço', service_fees: 'Taxas de Serviço',
    leads: 'Leads', contacts: 'Contactos', clients: 'Clientes',
    deals: 'Pedidos de Proposta', proposals: 'Propostas', quotes: 'Orçamentos', contracts: 'Contratos',
    campaigns: 'Campanhas', forms: 'Formulários', lead_sources: 'Origens',
    suppliers: 'Fornecedores', warehouses: 'Armazéns', purchase_orders: 'Encomendas', stocks: 'Stocks',
    scheduling: 'Agendamentos', users: 'Utilizadores', roles: 'Funções',
  };

  const permNamePt: Record<string, string> = {
    'View scheduling boards': 'Ver quadros de agendamento',
    'Create scheduling boards': 'Criar quadros de agendamento',
    'Edit scheduling boards': 'Editar quadros de agendamento',
    'Delete scheduling boards': 'Eliminar quadros de agendamento',
    'View scheduling items': 'Ver itens de agendamento',
    'Create scheduling items': 'Criar itens de agendamento',
    'Edit scheduling items': 'Editar itens de agendamento',
    'Delete scheduling items': 'Eliminar itens de agendamento',
    'View scheduling resources': 'Ver recursos de agendamento',
    'Create scheduling resources': 'Criar recursos de agendamento',
    'Edit scheduling resources': 'Editar recursos de agendamento',
    'Delete scheduling resources': 'Eliminar recursos de agendamento',
    'View auto-scheduling rules': 'Ver regras de auto-agendamento',
    'Create auto-scheduling rules': 'Criar regras de auto-agendamento',
    'Edit auto-scheduling rules': 'Editar regras de auto-agendamento',
    'Delete auto-scheduling rules': 'Eliminar regras de auto-agendamento',
    'Export scheduling data': 'Exportar dados de agendamento',
  };

  // Group by category
  const sidebarOrder = [
    'dashboard',
    'organizations', 'org_chart',
    'products', 'bundles', 'brands', 'product_categories', 'product_subcategories', 'product_attributes', 'units_of_measure',
    'services', 'service_categories', 'service_subcategories', 'service_fees',
    'leads', 'contacts', 'clients',
    'deals', 'proposals', 'quotes', 'contracts',
    'campaigns', 'lead_sources', 'forms',
    'suppliers', 'warehouses', 'purchase_orders', 'stocks',
    'scheduling',
    'users', 'roles',
  ];

  const actionOrder = ['view', 'create', 'edit', 'update', 'delete', 'export', 'import', 'manage_roles', 'manage_permissions'];
  const getActionIndex = (code: string) => {
    const suffix = code.split('.').pop() || '';
    const idx = actionOrder.indexOf(suffix);
    return idx >= 0 ? idx : 99;
  };

  const unorderedGroups = permissions.reduce((acc, perm) => {
    if (!acc[perm.category]) acc[perm.category] = [];
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  // Sort permissions within each group by action order (view first)
  for (const perms of Object.values(unorderedGroups)) {
    perms.sort((a, b) => getActionIndex(a.code) - getActionIndex(b.code));
  }

  // Sort groups by sidebar order
  const groupedPermissions: Record<string, Permission[]> = {};
  for (const key of sidebarOrder) {
    if (unorderedGroups[key]) groupedPermissions[key] = unorderedGroups[key];
  }
  for (const key of Object.keys(unorderedGroups)) {
    if (!groupedPermissions[key]) groupedPermissions[key] = unorderedGroups[key];
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            {t("scopes.title")}
          </DialogTitle>
          <DialogDescription>
            {t("scopes.configureFor", { name: organizationName || t("common.organization") })}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !membershipId || !membershipExists ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <AlertCircle className="w-8 h-8 mb-2" />
            <p className="text-sm">{t("users.saveMembershipFirst") || "Guarde primeiro o utilizador para configurar os scopes"}</p>
          </div>
        ) : permissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Shield className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">{t("permissions.noScopePermissions") || "Nenhuma permissão com scope configurável nesta role"}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-5 pr-2">
            {Object.entries(groupedPermissions).map(([category, perms]) => (
              <div key={category} className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {categoryLabelsPt[category] || category}
                </h4>
                <div className="space-y-1.5">
                  {perms.map((perm) => {
                    const currentScope = getScopeForPermission(perm.code);
                    const isOverridden = effectiveScopes.some(s => s.permission_code === perm.code);

                    return (
                      <div
                        key={perm.code}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{permNamePt[perm.name] || perm.name}</span>
                          {isOverridden && (
                            <Badge variant="secondary" className="text-xs">
                              override
                            </Badge>
                          )}
                        </div>
                        <Select
                          value={currentScope}
                          onValueChange={(val) => handleScopeChange(perm.code, val as any)}
                        >
                          <SelectTrigger className="w-36 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SCOPE_LEVELS.map((level) => (
                              <SelectItem key={level.value} value={level.value}>
                                {t(level.labelKey)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleConfirm}>
            {t("common.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
