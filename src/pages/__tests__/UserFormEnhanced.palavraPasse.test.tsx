import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Ecra antigo /users (UserFormEnhanced): a palavra-passe ao EDITAR outra pessoa pede users.change_password (o que a
// edge update-user-password exige); ao criar e na propria ficha continua visivel.

const ORG_ID = "org-nike";

const LINHAS: Record<string, any[]> = {
  anew_hierarchy: [],
  anew_roles: [
    { id: "role-user", code: "user", name: "Utilizador", organization_id: ORG_ID },
    { id: "role-admin", code: "org_admin", name: "Administrador", organization_id: ORG_ID },
  ],
  anew_role_permissions: [],
  anew_organizations: [{ id: ORG_ID, name: "Nike", type: "company" }],
  anew_entity_addresses: [],
  user_templates: [],
  user_template_fields: [],
  user_template_attributes: [],
};

function construtorDeConsulta(tabela: string) {
  const resultado = { data: LINHAS[tabela] ?? [], error: null };
  const q: any = new Proxy(
    {
      then: (r: any) => Promise.resolve(resultado).then(r),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
    },
    {
      get(alvo: any, prop: string) {
        if (prop in alvo) return alvo[prop];
        return () => q;
      },
    },
  );
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => construtorDeConsulta(tabela),
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "auth-eu" } }, error: null }),
      getSession: () => Promise.resolve({ data: { session: { user: { id: "auth-eu" } } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "pt", setLanguage: () => {} }),
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({
    activeCompany: { id: ORG_ID, name: "Nike" },
    userType: "org_admin",
    companies: [{ id: ORG_ID, name: "Nike" }],
    isLoading: false,
  }),
}));

let permissoes = new Set<string>();
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (c: string) => permissoes.has(c), permissions: [...permissoes] }),
}));

vi.mock("@/hooks/useCountries", () => ({
  useCountries: () => ({ countries: [], loading: false }),
}));

vi.mock("@/hooks/useAdministrativeDivisions", () => ({
  useAdministrativeDivisions: () => ({
    districts: [],
    municipalities: [],
    loading: false,
    fetchMunicipalities: () => {},
    refetchDistricts: () => {},
  }),
}));

function renderizar(isSelfEdit: boolean, isEdit = true) {
  const props: any = {
    formData: {
      name: "Ana Ribeiro",
      email: "ana@exemplo.pt",
      phone: "",
      password: "",
      status: "active",
      description: "",
      position: "",
      location: "",
    },
    setFormData: () => {},
    phones: [],
    setPhones: () => {},
    socialLinks: { angellist: "", facebook: "", linkedin: "" },
    setSocialLinks: () => {},
    memberships: [
      { id: "mem-eu", organization_id: ORG_ID, relationship_type: "BELONGS_TO", role_id: "role-user" },
    ],
    setMemberships: () => {},
    addresses: [],
    setAddresses: () => {},
    fiscalData: { nif: "", commercial_name: "", country_code: "PT" },
    setFiscalData: () => {},
    customAttributes: {},
    setCustomAttributes: () => {},
    organizations: [{ id: ORG_ID, name: "Nike", type: "company" }],
    isEdit,
    saving: false,
    onSave: () => {},
    onCancel: () => {},
    editUserId: "user-eu",
    isSelfEdit,
  };
  return props;
}

async function montar(isSelfEdit: boolean, isEdit = true) {
  const { UserFormEnhanced } = await import("@/components/users/UserFormEnhanced");
  return render(<UserFormEnhanced {...renderizar(isSelfEdit, isEdit)} />);
}

describe("Formulario de utilizador: palavra-passe ao editar pede users.change_password", () => {
  const campo = (c: HTMLElement) => c.querySelector("input#password");

  it("a editar outra pessoa SEM users.change_password o campo nao aparece", async () => {
    permissoes = new Set(["users.edit", "users.manage_roles"]);
    const { container } = await montar(false);
    await waitFor(() => expect(screen.getByDisplayValue("Ana Ribeiro")).toBeInTheDocument());
    expect(campo(container)).toBeNull();
  }, 30000);

  it("a editar outra pessoa COM users.change_password o campo aparece", async () => {
    permissoes = new Set(["users.edit", "users.change_password"]);
    const { container } = await montar(false);
    await waitFor(() => expect(screen.getByDisplayValue("Ana Ribeiro")).toBeInTheDocument());
    expect(campo(container)).not.toBeNull();
  }, 30000);

  it("na propria ficha o campo aparece mesmo sem users.change_password", async () => {
    permissoes = new Set(["users.edit"]);
    const { container } = await montar(true);
    await waitFor(() => expect(screen.getByDisplayValue("Ana Ribeiro")).toBeInTheDocument());
    expect(campo(container)).not.toBeNull();
  }, 30000);

  it("ao criar o campo continua visivel sem users.change_password", async () => {
    permissoes = new Set(["users.create"]);
    const { container } = await montar(false, false);
    await waitFor(() => expect(screen.getByDisplayValue("Ana Ribeiro")).toBeInTheDocument());
    expect(campo(container)).not.toBeNull();
  }, 30000);
});
