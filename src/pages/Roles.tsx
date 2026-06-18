import { useState } from "react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Shield, ShieldCheck, Pencil, Trash2, Lock, AlertTriangle, Users, Copy } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { usePermissions } from "@/hooks/usePermissions";
import { usePermissionScope, canActOnEntity } from "@/hooks/usePermissionScope";

interface RoleTemplate {
  id: string;
  code: string;
  name: string;
  description: string | null;
}


interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  organization_id: string | null;
  is_system: boolean;
  is_default: boolean;
  can_sign_contracts: boolean;
  created_at: string;
  created_by?: string | null;
}

interface Permission {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  parent_code: string | null;
  is_dangerous: boolean;
  display_order: number;
}

interface RolePermission {
  role_id: string;
  permission_code: string;
}

export default function Roles() {
  const queryClient = useQueryClient();
  const { activeCompany, userType, isLoading: companyLoading } = useCompany();
  const { hasPermission, permissions: userPermissions, isSystemAdmin } = usePermissions();
  const { getPermissionScope, anewUserId, authUserId, anewRoleCode } = usePermissionScope();
  const canCreate = hasPermission("roles.create");
  const canEdit = hasPermission("roles.edit");
  const canDelete = hasPermission("roles.delete");
  const canManagePermissions = hasPermission("roles.manage_permissions") || canEdit;
  const editScope = getPermissionScope("roles.edit");
  const deleteScope = getPermissionScope("roles.delete");

  const canEditRole = (role: Role) => canEdit && canActOnEntity(editScope, role, anewUserId, authUserId);
  const canDeleteRole = (role: Role) => canDelete && !role.is_system && canActOnEntity(deleteScope, role, anewUserId, authUserId);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [formData, setFormData] = useState({ code: "", name: "", description: "", can_sign_contracts: false });
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [roleToDelete, setRoleToDelete] = useState<string | null>(null);
  // Fetch roles - system roles + active organization roles + ancestor org roles (inherited)
  // Roles are organizational resources - having a membership = view access
  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["anew_roles", activeCompany?.id, anewRoleCode],
    queryFn: async () => {
      if (!activeCompany?.id) return [];

      // Collect ancestor org IDs (traverse up the hierarchy)
      const ancestorOrgIds = new Set<string>([activeCompany.id]);
      let currentId = activeCompany.id;
      for (let i = 0; i < 10; i++) {
        const { data: parentLink } = await (supabase as any)
          .from("anew_hierarchy")
          .select("parent_org_id")
          .eq("child_org_id", currentId)
          .maybeSingle();
        if (!parentLink?.parent_org_id) break;
        ancestorOrgIds.add(parentLink.parent_org_id);
        currentId = parentLink.parent_org_id;
      }

      const { data, error } = await supabase
        .from("anew_roles")
        .select("*, created_by")
        .order("name");

      if (error) throw error;

      // Filter roles based on the user's actual anew role code
      const effectiveRole = anewRoleCode || "org_viewer";
      const isSystemAdmin = effectiveRole === "system_admin";
      const isSuperAdmin = effectiveRole === "super_admin";

      let filtered = (data as Role[]).filter((role) => {
        // system_admin role: only visible to system_admin users
        if (role.code === "system_admin") return isSystemAdmin;
        // super_admin role: visible to super_admin and system_admin
        if (role.code === "super_admin") return isSuperAdmin || isSystemAdmin;
        // org_admin system-level (no org): visible to super_admin+ 
        if (role.code === "org_admin" && role.organization_id === null) return isSuperAdmin || isSystemAdmin;
        if (role.organization_id === null) return true; // Other system roles
        // Show roles from active org AND all ancestor orgs (inherited from holding)
        return ancestorOrgIds.has(role.organization_id);
      });

      // Deduplicate by code ONLY for system roles (organization_id === null)
      // Org-specific roles are unique per organization, so no dedup needed
      const seenSystemCodes = new Set<string>();
      filtered = filtered.filter((role) => {
        if (role.organization_id !== null) return true; // org-specific: always keep
        if (seenSystemCodes.has(role.code)) return false;
        seenSystemCodes.add(role.code);
        return true;
      });

      return filtered;
    },
    enabled: !!activeCompany?.id,
  });

  // Fetch permissions
  const { data: permissions = [] } = useQuery({
    queryKey: ["anew_permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("anew_permissions")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return data as Permission[];
    },
  });

  // Fetch role templates
  const { data: roleTemplates = [] } = useQuery({
    queryKey: ["role_templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("role_templates")
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data || []) as RoleTemplate[];
    },
  });

  // Fetch role template permissions
  const { data: templatePermissions = [] } = useQuery({
    queryKey: ["role_template_permissions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("role_template_permissions")
        .select("template_id, permission_code");
      if (error) throw error;
      return (data || []) as { template_id: string; permission_code: string }[];
    },
  });

  // Fetch role permissions - scoped to visible roles to avoid 1000-row limit
  const roleIds = roles.map(r => r.id);
  const { data: rolePermissions = [] } = useQuery({
    queryKey: ["anew_role_permissions", roleIds],
    queryFn: async () => {
      if (roleIds.length === 0) return [];
      // Fetch all permissions across all roles — may exceed default 1000 row limit
      // so we fetch per-role and merge
      const allPerms: RolePermission[] = [];
      for (let i = 0; i < roleIds.length; i += 10) {
        const batch = roleIds.slice(i, i + 10);
        const { data, error } = await supabase
          .from("anew_role_permissions")
          .select("role_id, permission_code")
          .in("role_id", batch)
          .limit(5000);
        if (error) throw error;
        if (data) allPerms.push(...(data as RolePermission[]));
      }
      return allPerms;
    },
    enabled: roleIds.length > 0,
  });

  // Filter permissions to only those the current user has (unless super_admin)
  const userPermissionSet = new Set(userPermissions);
  const visiblePermissions = isSystemAdmin
    ? permissions
    : permissions.filter(p => userPermissionSet.has(p.code));

  // Only show permission categories that correspond to active sidebar modules
  const sidebarCategories = new Set([
    'dashboard',
    'organizations', 'org_chart', 'flow_builder',
    'products', 'bundles', 'brands', 'product_categories', 'product_subcategories', 'product_attributes', 'units_of_measure',
    'services', 'service_categories', 'service_subcategories', 'service_fees',
    'leads', 'contacts', 'clients',
    'deals', 'proposals', 'quotes', 'quote_templates', 'contracts', 'client_contracts',
    'marketing', 'forms',
    'suppliers', 'warehouses', 'purchase_orders', 'stocks',
    'scheduling',
    'users', 'roles',
    'settings', 'smtp', 'email_templates',
  ]);

  // Category label map for human-readable module names
  const categoryLabels: Record<string, string> = {
    dashboard: 'Dashboard',
    organizations: 'Organizações',
    org_chart: 'Organograma',
    flow_builder: 'Flow Builder',
    products: 'Produtos',
    bundles: 'Bundles',
    brands: 'Marcas',
    product_categories: 'Categorias de Produto',
    product_subcategories: 'Subcategorias de Produto',
    product_attributes: 'Atributos de Produto',
    units_of_measure: 'Unidades de Medida',
    services: 'Serviços',
    service_categories: 'Categorias de Serviço',
    service_subcategories: 'Subcategorias de Serviço',
    service_fees: 'Taxas de Serviço',
    leads: 'Leads',
    contacts: 'Contactos',
    clients: 'Clientes',
    deals: 'Pedidos de Proposta',
    proposals: 'Propostas',
    quotes: 'Orçamentos',
    quote_templates: 'Templates de Orçamento',
    contracts: 'Contratos',
    client_contracts: 'Contratos de Cliente',
    campaigns: 'Campanhas',
    forms: 'Formulários',
    lead_sources: 'Origens',
    suppliers: 'Fornecedores',
    warehouses: 'Armazéns',
    purchase_orders: 'Encomendas',
    stocks: 'Stocks',
    scheduling: 'Agendamentos',
    users: 'Utilizadores',
    roles: 'Funções',
    settings: 'Definições',
    smtp: 'SMTP',
    email_templates: 'Templates de Email',
  };

  // Permission name translations (for DB names in English)
  const permissionNamePt: Record<string, string> = {
    // Scheduling
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
    // Flow Builder
    'View Flow Builder': 'Ver Flow Builder',
    'Create Flow Builder': 'Criar Flow Builder',
    'Edit Flow Builder': 'Editar Flow Builder',
    'Delete Flow Builder': 'Eliminar Flow Builder',
  };

  // ── Sidebar-structured permission grouping ──
  // Mirrors the menu hierarchy from menuConfig.ts
  interface PermGroup {
    label: string;
    categories: string[]; // flat permission categories that belong here
    subGroups?: { label: string; categories: string[] }[];
  }

  const sidebarMenuGroups: PermGroup[] = [
    { label: 'Dashboard', categories: ['dashboard'] },
    {
      label: 'Organizações',
      categories: ['organizations', 'org_chart', 'flow_builder'],
      subGroups: [
        { label: 'Produtos', categories: ['products', 'bundles', 'brands', 'product_categories', 'product_subcategories', 'product_attributes', 'units_of_measure'] },
        { label: 'Serviços', categories: ['services', 'service_categories', 'service_subcategories', 'service_fees'] },
      ],
    },
    { label: 'CRM', categories: ['leads', 'contacts', 'clients'] },
    {
      label: 'Aquisição',
      categories: ['deals'],
      subGroups: [
        { label: 'Propostas', categories: ['proposals', 'quotes', 'quote_templates'] },
        { label: 'Contratos', categories: ['contracts', 'client_contracts'] },
      ],
    },
    {
      label: 'Marketing',
      categories: ['forms'],
      subGroups: [
        { label: 'Campanhas', categories: ['marketing_campaigns'] },
        { label: 'Origens', categories: ['marketing_channels'] },
        { label: 'Listas', categories: ['marketing_lists'] },
        { label: 'Formulários', categories: ['forms'] },
      ],
    },
    { label: 'Inventário', categories: ['suppliers', 'warehouses', 'purchase_orders', 'stocks'] },
    {
      label: 'Agendamentos',
      categories: [],
      subGroups: [
        { label: 'Quadros', categories: ['scheduling_boards'] },
        { label: 'Itens', categories: ['scheduling_items'] },
        { label: 'Recursos', categories: ['scheduling_resources'] },
        { label: 'Regras de Auto-agendamento', categories: ['scheduling_rules'] },
        { label: 'Outros', categories: ['scheduling_other'] },
      ],
    },
    { label: 'Utilizadores', categories: ['users', 'roles'] },
    { label: 'Definições', categories: ['settings', 'smtp', 'email_templates'] },
  ];

  // Build flat lookup: category → permissions
  // For 'scheduling', split into virtual sub-categories by code prefix for cleaner UI grouping
  const permsByCategory: Record<string, Permission[]> = {};
  visiblePermissions
    .filter(p => sidebarCategories.has(p.category || ''))
    .forEach(p => {
      let cat = p.category || 'other';
      if (cat === 'scheduling') {
        if (p.code.startsWith('scheduling.boards')) cat = 'scheduling_boards';
        else if (p.code.startsWith('scheduling.items')) cat = 'scheduling_items';
        else if (p.code.startsWith('scheduling.resources')) cat = 'scheduling_resources';
        else if (p.code.startsWith('scheduling.rules')) cat = 'scheduling_rules';
        else cat = 'scheduling_other';
      } else if (cat === 'marketing') {
        if (p.code.startsWith('campaigns.')) cat = 'marketing_campaigns';
        else if (p.code.startsWith('channels.')) cat = 'marketing_channels';
        else if (p.code.startsWith('lists.')) cat = 'marketing_lists';
      }
      if (!permsByCategory[cat]) permsByCategory[cat] = [];
      permsByCategory[cat].push(p);
    });

  // Helper: collect all permissions for an array of categories
  const permsForCategories = (cats: string[]): Permission[] =>
    cats.flatMap(c => permsByCategory[c] || []);

  // Build a set of all visible permission codes (only sidebar categories)
  const visiblePermissionCodes = new Set(
    visiblePermissions
      .filter(p => sidebarCategories.has(p.category || ''))
      .map(p => p.code)
  );

  // Derive a human-readable action badge from the permission code suffix
  const getActionBadge = (code: string): { label: string; className: string } => {
    const suffix = code.split('.').pop() || '';
    const badgeMap: Record<string, { label: string; className: string }> = {
      view: { label: 'Ver', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
      create: { label: 'Criar', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
      edit: { label: 'Editar', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
      update: { label: 'Editar', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
      delete: { label: 'Eliminar', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
      manage_roles: { label: 'Gerir Roles', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
      manage_permissions: { label: 'Gerir Permissões', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
      export: { label: 'Exportar', className: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300' },
      import: { label: 'Importar', className: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300' },
    };
    return badgeMap[suffix] || { label: suffix.charAt(0).toUpperCase() + suffix.slice(1).replace(/_/g, ' '), className: '' };
  };

  // Create role mutation
  const createMutation = useMutation({
    mutationFn: async (data: { code: string; name: string; description: string; can_sign_contracts: boolean; permissions: string[] }) => {
      // Canonical business user id for created_by (never auth_user_id).
      const { resolveCurrentBusinessUserId } = await import("@/lib/identity/resolveBusinessUserId");
      const createdBy = await resolveCurrentBusinessUserId();

      const { data: role, error: roleError } = await supabase
        .from("anew_roles")
        .insert({ 
          code: data.code, 
          name: data.name, 
          description: data.description || null,
          can_sign_contracts: data.can_sign_contracts,
          organization_id: activeCompany?.id || null, // Associate with active company
          created_by: createdBy,
        } as any)
        .select()
        .single();
      if (roleError) throw roleError;

      if (data.permissions.length > 0) {
        const { error: permError } = await supabase
          .from("anew_role_permissions")
          .insert(data.permissions.map(p => ({ role_id: role.id, permission_code: p, created_by: createdBy })));
        if (permError) throw permError;
      }
      return role;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["anew_roles"] });
      queryClient.invalidateQueries({ queryKey: ["anew_role_permissions"] });
      toast.success("Role criada com sucesso");
      closeDialog();
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar role: " + error.message);
    },
  });

  // Update role mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; code: string; name: string; description: string; can_sign_contracts: boolean; permissions: string[]; isSystem?: boolean }) => {
      // Defensive guard: UI já desativa o botão Guardar para roles de sistema (is_system=true).
      // Esta verificação cobre fluxos fora da UI normal (ex: chamadas programáticas,
      // devtools, replay de requests). A defesa final está no trigger DB
      // `protect_system_roles` que bloqueia mesmo bypass directo via PostgREST.
      if (data.isSystem) {
        toast.error("Roles de sistema não são editáveis");
        throw new Error("Roles de sistema não são editáveis");
      }

      const { error: roleError } = await supabase
        .from("anew_roles")
        .update({ code: data.code, name: data.name, description: data.description || null, can_sign_contracts: data.can_sign_contracts } as any)
        .eq("id", data.id);
      if (roleError) throw roleError;

      const { resolveCurrentBusinessUserId } = await import("@/lib/identity/resolveBusinessUserId");
      const createdBy = await resolveCurrentBusinessUserId();
      if (!createdBy) throw new Error("Perfil de utilizador não encontrado");

      // Delete existing permissions and re-add
      await supabase.from("anew_role_permissions").delete().eq("role_id", data.id);

      if (data.permissions.length > 0) {
        const { error: permError } = await supabase
          .from("anew_role_permissions")
          .insert(data.permissions.map(p => ({ role_id: data.id, permission_code: p, created_by: createdBy })));
        if (permError) throw permError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["anew_roles"] });
      queryClient.invalidateQueries({ queryKey: ["anew_role_permissions"] });
      toast.success("Role atualizada com sucesso");
      closeDialog();
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar role: " + error.message);
    },
  });

  // Delete role mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("anew_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["anew_roles"] });
      queryClient.invalidateQueries({ queryKey: ["anew_role_permissions"] });
      toast.success("Role eliminada com sucesso");
    },
    onError: (error: Error) => {
      toast.error("Erro ao eliminar role: " + error.message);
    },
  });

  // Generate slug from name (e.g., "Gestor de Vendas" → "gestor_de_vendas")
  const generateCodeFromName = (name: string): string => {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-z0-9\s]/g, "") // Remove special chars
      .trim()
      .replace(/\s+/g, "_"); // Replace spaces with underscores
  };

  const applyTemplate = (template: RoleTemplate) => {
    const perms = templatePermissions
      .filter(tp => tp.template_id === template.id)
      .map(tp => tp.permission_code)
      // Only include permissions the current user has
      .filter(code => isSystemAdmin || userPermissionSet.has(code));
    setFormData({
      name: template.name,
      code: generateCodeFromName(template.name),
      description: template.description || "",
      can_sign_contracts: false,
    });
    setSelectedPermissions(new Set(perms));
    toast.success(`Template "${template.name}" aplicado`);
  };

  const openCreateDialog = () => {
    setEditingRole(null);
    setFormData({ code: "", name: "", description: "", can_sign_contracts: false });
    setSelectedPermissions(new Set());
    setIsDialogOpen(true);
  };

  const openEditDialog = (role: Role) => {
    setEditingRole(role);
    setFormData({ code: role.code, name: role.name, description: role.description || "", can_sign_contracts: role.can_sign_contracts ?? false });
    const perms = rolePermissions.filter(rp => rp.role_id === role.id).map(rp => rp.permission_code);
    setSelectedPermissions(new Set(perms));
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingRole(null);
    setFormData({ code: "", name: "", description: "", can_sign_contracts: false });
    setSelectedPermissions(new Set());
  };

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      // Auto-generate code only when creating new role
      code: editingRole ? prev.code : generateCodeFromName(name)
    }));
  };

  const handleSubmit = () => {
    if (!formData.name) {
      toast.error("Preencha o nome da role");
      return;
    }

    const code = formData.code || generateCodeFromName(formData.name);
    
    const data = {
      code,
      name: formData.name,
      description: formData.description,
      can_sign_contracts: formData.can_sign_contracts,
      permissions: Array.from(selectedPermissions),
    };

    if (editingRole) {
      updateMutation.mutate({ id: editingRole.id, isSystem: editingRole.is_system, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const togglePermission = (code: string, isView: boolean = false, categoryPerms?: Permission[]) => {
    const newSet = new Set(selectedPermissions);
    if (newSet.has(code)) {
      newSet.delete(code);
      if (isView && categoryPerms) {
        categoryPerms.forEach(p => {
          if (!p.code.endsWith('.view')) newSet.delete(p.code);
        });
      }
    } else {
      newSet.add(code);
    }
    setSelectedPermissions(newSet);
  };

  const togglePermissionList = (perms: Permission[], checked: boolean) => {
    const newSet = new Set(selectedPermissions);
    perms.forEach(p => {
      if (checked) newSet.add(p.code); else newSet.delete(p.code);
    });
    setSelectedPermissions(newSet);
  };


  const filteredRoles = roles.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.code.toLowerCase().includes(search.toLowerCase())
  );

  

  if (companyLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      </>
    );
  }

  if (!activeCompany) {
    return (
      <>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Roles</h1>
            <p className="text-muted-foreground">Gerir roles e permissões do sistema</p>
          </div>
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  if (rolesLoading) {
    return (
      <>
        <div className="py-8 text-center text-muted-foreground">A carregar...</div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Roles</h1>
            <p className="text-muted-foreground">
              Gerir roles e permissões do sistema
            </p>
          </div>
          {canCreate && (
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Role
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar roles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Roles Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Roles
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rolesLoading ? (
              <div className="py-8 text-center text-muted-foreground">A carregar...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Permissões</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRoles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {role.is_system ? (
                            <ShieldCheck className="h-4 w-4 text-primary" />
                          ) : (
                            <Shield className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div>
                            <div className="font-medium">{role.name}</div>
                            {role.description && (
                              <div className="text-xs text-muted-foreground">{role.description}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{role.code}</code>
                      </TableCell>
                      <TableCell>
                        {role.code === 'super_admin' ? (
                          <Badge variant="default">Acesso total (org)</Badge>
                        ) : role.code === 'system_admin' ? (
                          <Badge variant="default" className="bg-red-600 hover:bg-red-600">Acesso total (sistema)</Badge>
                        ) : (
                          <Badge variant="secondary">
                            {rolePermissions.filter(rp => rp.role_id === role.id && visiblePermissionCodes.has(rp.permission_code)).length} permissões
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {role.is_system ? (
                          <Badge variant="outline" className="gap-1">
                            <Lock className="h-3 w-3" />
                            Sistema
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Custom</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {canEditRole(role) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(role)}
                              title="Editar permissões"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDeleteRole(role) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setRoleToDelete(role.id)}
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRoles.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Nenhuma role encontrada
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {editingRole ? "Editar Role" : "Nova Role"}
              </DialogTitle>
              <DialogDescription>
                {editingRole
                  ? "Atualize os detalhes e permissões da role"
                  : "Crie uma nova role com as permissões desejadas"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
              {/* Template Picker - only when creating */}
              {!editingRole && roleTemplates.length > 0 && (
                <div className="space-y-2">
                  <Label>Começar a partir de um template</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {roleTemplates.map((tpl) => (
                      <Button
                        key={tpl.id}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2 h-auto py-2 px-3 text-left"
                        onClick={() => applyTemplate(tpl)}
                      >
                        <Copy className="h-3.5 w-3.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium text-sm">{tpl.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{tpl.description?.slice(0, 40)}...</div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {/* Basic Info */}
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  placeholder="ex: Gestor de Vendas"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  disabled={editingRole?.is_system}
                />
                {formData.code && (
                  <p className="text-xs text-muted-foreground">
                    Código: <code className="bg-muted px-1 py-0.5 rounded">{formData.code}</code>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  placeholder="Descrição da role..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  disabled={editingRole?.is_system}
                />
              </div>

              {/* Can sign contracts toggle */}
              {(() => {
                const isBypassRole = editingRole?.code === "system_admin" || editingRole?.code === "super_admin";
                const bypassHint = editingRole?.code === "system_admin"
                  ? "Acesso técnico cross-tenant — pode assinar contratos por defeito."
                  : "Acesso total às suas organizações — pode assinar contratos por defeito.";
                return (
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="can_sign_contracts" className="text-sm font-medium">Pode assinar contratos pela empresa</Label>
                      <p className="text-xs text-muted-foreground">
                        {isBypassRole ? bypassHint : "Utilizadores com esta role aparecerão como signatários nos templates de minuta"}
                      </p>
                    </div>
                    <Switch
                      id="can_sign_contracts"
                      checked={isBypassRole ? true : formData.can_sign_contracts}
                      onCheckedChange={(checked) => setFormData({ ...formData, can_sign_contracts: checked })}
                      disabled={!!editingRole?.is_system}
                    />
                  </div>
                );
              })()}

              {editingRole?.is_system && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                  <Lock className="h-4 w-4" />
                  <span>Role de sistema — não pode ser editada</span>
                </div>
              )}

              {/* Permissions */}
              {editingRole?.is_system ? (
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
                  <p className="font-medium text-sm">Role de sistema.</p>
                  <p className="text-xs text-muted-foreground">
                    As permissões e definições desta role são geridas pelo sistema e não podem ser alteradas pela interface.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Permissões</Label>
                  {!canManagePermissions && editingRole && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                      <Lock className="h-4 w-4" />
                      <span>Sem permissão para gerir permissões de roles</span>
                    </div>
                  )}
                  <div className={`rounded-md border p-4 ${!canManagePermissions && editingRole ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Accordion type="multiple" className="w-full">
                      {sidebarMenuGroups.map((group) => {
                        // All permissions for this menu group (direct + sub-groups)
                        const allCats = [
                          ...group.categories,
                          ...(group.subGroups?.flatMap(sg => sg.categories) || []),
                        ];
                        const allPerms = permsForCategories(allCats);
                        if (allPerms.length === 0) return null;

                        const directPerms = permsForCategories(group.categories);
                        const allSelected = allPerms.every(p => selectedPermissions.has(p.code));
                        const someSelected = allPerms.some(p => selectedPermissions.has(p.code));
                        const selectedCount = allPerms.filter(p => selectedPermissions.has(p.code)).length;

                        const renderPermList = (perms: Permission[]) => perms.map((perm) => {
                          const isView = perm.code.endsWith('.view');
                          const viewChild = perms.find(c => c.code.endsWith('.view') && c.code.split('.')[0] === perm.code.split('.')[0]);
                          const viewDisabled = !isView && (
                            viewChild ? !selectedPermissions.has(viewChild.code) : false
                          );
                          const permDisabled = viewDisabled || (!canManagePermissions && !!editingRole);
                          const badge = getActionBadge(perm.code);

                          return (
                            <label
                              key={perm.id}
                              className={`flex items-center gap-3 cursor-pointer group ${permDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <Checkbox
                                checked={selectedPermissions.has(perm.code)}
                                onCheckedChange={() => togglePermission(perm.code, isView, perms)}
                                disabled={permDisabled}
                              />
                              <span className="text-sm group-hover:text-foreground">{permissionNamePt[perm.name] || perm.name}</span>
                              <Badge
                                variant="secondary"
                                className={`text-xs px-1.5 ${badge.className}`}
                              >
                                {badge.label}
                              </Badge>
                              {perm.is_dangerous && (
                                <AlertTriangle className="h-3 w-3 text-destructive" />
                              )}
                            </label>
                          );
                        });

                        return (
                          <AccordionItem key={group.label} value={group.label}>
                            <AccordionTrigger className="hover:no-underline">
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={allSelected}
                                  className={someSelected && !allSelected ? "data-[state=checked]:bg-primary/50" : ""}
                                  disabled={!canManagePermissions && !!editingRole}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (canManagePermissions || !editingRole) {
                                      togglePermissionList(allPerms, !allSelected);
                                    }
                                  }}
                                />
                                <span className="font-medium">{group.label}</span>
                                <Badge variant="outline" className="ml-2">
                                  {selectedCount}/{allPerms.length}
                                </Badge>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-3 pl-7">
                                {/* Direct permissions (not in a sub-group) */}
                                {directPerms.length > 0 && (
                                  <div className="space-y-2">
                                    {group.categories.map(cat => {
                                      const catPerms = permsByCategory[cat];
                                      if (!catPerms || catPerms.length === 0) return null;
                                      return (
                                        <div key={cat}>
                                          {group.categories.length > 1 && (
                                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                              {categoryLabels[cat] || cat}
                                            </p>
                                          )}
                                          <div className="space-y-2">
                                            {renderPermList(catPerms)}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Sub-groups */}
                                {group.subGroups?.map(sg => {
                                  const sgPerms = permsForCategories(sg.categories);
                                  if (sgPerms.length === 0) return null;
                                  const sgAllSelected = sgPerms.every(p => selectedPermissions.has(p.code));
                                  const sgSomeSelected = sgPerms.some(p => selectedPermissions.has(p.code));
                                  const sgSelectedCount = sgPerms.filter(p => selectedPermissions.has(p.code)).length;

                                  return (
                                    <div key={sg.label} className="border-l-2 border-border pl-3 space-y-2">
                                      <div className="flex items-center gap-3">
                                        <Checkbox
                                          checked={sgAllSelected}
                                          className={sgSomeSelected && !sgAllSelected ? "data-[state=checked]:bg-primary/50" : ""}
                                          disabled={!canManagePermissions && !!editingRole}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (canManagePermissions || !editingRole) {
                                              togglePermissionList(sgPerms, !sgAllSelected);
                                            }
                                          }}
                                        />
                                        <span className="text-sm font-medium">{sg.label}</span>
                                        <Badge variant="outline" className="text-xs">
                                          {sgSelectedCount}/{sgPerms.length}
                                        </Badge>
                                      </div>
                                      {sg.categories.map(cat => {
                                        const catPerms = permsByCategory[cat];
                                        if (!catPerms || catPerms.length === 0) return null;
                                        return (
                                          <div key={cat} className="pl-6 space-y-2">
                                            {sg.categories.length > 1 && (
                                              <p className="text-xs text-muted-foreground font-medium">
                                                {categoryLabels[cat] || cat}
                                              </p>
                                            )}
                                            {renderPermList(catPerms)}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {Array.from(selectedPermissions).filter(code => visiblePermissionCodes.has(code)).length} permissões selecionadas
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending || !!editingRole?.is_system}
              >
                {editingRole ? "Guardar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <AlertDialog open={!!roleToDelete} onOpenChange={(open) => { if (!open) setRoleToDelete(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar Role</AlertDialogTitle>
              <AlertDialogDescription>
                Tem a certeza que pretende eliminar esta role? Esta acção não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground"
                onClick={() => {
                  if (roleToDelete) {
                    deleteMutation.mutate(roleToDelete);
                    setRoleToDelete(null);
                  }
                }}
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
