/**
 * Mapa de combinações válidas entre User Type e Roles BASE (admin).
 * 
 * Hierarquia de administração:
 * - system_admin → SystemAdmin (acesso total à plataforma)
 * - tenant_admin → TenantAdmin (gere empresas do seu tenant)
 * - company_admin → CompanyAdmin (gere uma empresa)
 * - business_unit_admin → BusinessUnitAdmin (gere uma business unit)
 * - business_area_admin → BusinessAreaAdmin (gere uma business area)
 * - worker_user → roles customizados criados pelos admins (sem roles base)
 * 
 * Os roles customizados são associados a user types através da coluna
 * `allowed_user_types` na tabela `roles`.

/**
 * Roles que nunca devem aparecer em dropdowns de atribuição interna.
 * Clientes e utilizadores do portal não podem ser selecionados como
 * comerciais nem como responsáveis de entidades internas.
 */
export const INTERNAL_ASSIGNMENT_EXCLUDED_ROLES = new Set<string>([
  "client",
  "contact",
  "lead",
  "portal_user",
]);


// Nomes dos roles BASE (admin) tal como aparecem na tabela 'roles.nome'
// worker_user não tem roles base - todos os roles para worker_user são customizados
export const USER_TYPE_BASE_ROLES: Record<string, string[]> = {
  system_admin: ["SystemAdmin"],
  tenant_admin: ["TenantAdmin"],
  company_admin: ["CompanyAdmin"],
  business_unit_admin: ["BusinessUnitAdmin"],
  department_admin: ["DepartmentAdmin"],
  worker_user: [], // Sem roles base - usar roles customizados com allowed_user_types
  client: [], // Role para utilizadores do portal de cliente
};

// Labels amigáveis para os User Types
export const USER_TYPE_LABELS: Record<string, string> = {
  system_admin: "System Admin",
  tenant_admin: "Tenant Admin",
  company_admin: "Company Admin",
  business_unit_admin: "Business Unit Admin",
  department_admin: "Department Admin",
  worker_user: "Worker User",
  client: "Client",
};

/**
 * Retorna os tipos de utilizador que um admin pode ver/criar.
 * Baseado na hierarquia: cada admin só pode ver/criar tipos no seu nível ou abaixo.
 */
export function getVisibleUserTypes(adminType: string): string[] {
  const adminIndex = USER_TYPE_HIERARCHY.indexOf(adminType);
  if (adminIndex === -1) return [];
  
  // Retorna o próprio tipo do admin e todos os tipos abaixo na hierarquia
  return USER_TYPE_HIERARCHY.slice(adminIndex);
}

// Ordem hierárquica dos tipos de utilizador (do mais alto para o mais baixo)
export const USER_TYPE_HIERARCHY: string[] = [
  "system_admin",
  "tenant_admin", 
  "company_admin",
  "business_unit_admin",
  "department_admin",
  "worker_user",
];

/**
 * Verifica se um role é um role base (admin).
 * Roles base são identificados pelo nome e são atribuídos automaticamente.
 */
export function isAdminBaseRole(roleName: string): boolean {
  const adminRoleNames = ['SystemAdmin', 'TenantAdmin', 'CompanyAdmin', 'BusinessUnitAdmin', 'DepartmentAdmin'];
  return adminRoleNames.some(name => name.toLowerCase() === roleName.toLowerCase());
}

/**
 * Retorna o user type correspondente a um role base (admin).
 */
export function getAdminUserTypeFromRole(roleName: string): string | null {
  const mapping: Record<string, string> = {
    'systemadmin': 'system_admin',
    'tenantadmin': 'tenant_admin',
    'companyadmin': 'company_admin',
    'businessunitadmin': 'business_unit_admin',
    'departmentadmin': 'department_admin',
  };
  return mapping[roleName.toLowerCase()] || null;
}

/**
 * Retorna os nomes de roles BASE permitidos para um dado User Type.
 * Para roles customizados, usar a coluna `allowed_user_types` da tabela roles.
 */
export function getBaseRolesForUserType(userType: string): string[] {
  return USER_TYPE_BASE_ROLES[userType] || [];
}

/**
 * Retorna os tipos de utilizador que um admin pode criar/atribuir.
 * Baseado na hierarquia definida no backend.
 * NOTA: A versão definitiva é a função RPC `get_assignable_user_types` no backend.
 * Esta função local serve como fallback e para UI imediata.
 */
export function getAssignableUserTypes(adminType: string): string[] {
  switch (adminType) {
    case 'system_admin':
      // SystemAdmin pode atribuir qualquer tipo
      return ['system_admin', 'tenant_admin', 'company_admin', 'business_unit_admin', 'department_admin', 'worker_user'];
    case 'tenant_admin':
      // TenantAdmin pode atribuir até tenant_admin (não system_admin)
      return ['tenant_admin', 'company_admin', 'business_unit_admin', 'department_admin', 'worker_user'];
    case 'company_admin':
      // CompanyAdmin pode atribuir até company_admin (não system_admin nem tenant_admin)
      return ['company_admin', 'business_unit_admin', 'department_admin', 'worker_user'];
    case 'business_unit_admin':
      // BU Admin pode gerir roles para BU Admin, Dept Admin e Worker
      return ['business_unit_admin', 'department_admin', 'worker_user'];
    case 'department_admin':
      // Dept Admin pode gerir roles apenas para Dept Admin e Worker
      return ['department_admin', 'worker_user'];
    case 'worker_user':
    default:
      // Não podem alterar tipos
      return [];
  }
}
