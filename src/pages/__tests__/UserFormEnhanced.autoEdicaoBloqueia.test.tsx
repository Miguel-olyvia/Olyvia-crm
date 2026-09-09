import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// A outra metade da regra, no ecra: quando alguem se edita a si proprio, tudo
// o que da poder fica trancado -- o estado (activo/inactivo), a organizacao, o
// cargo, o botao de adicionar organizacao e o botao dos ambitos por permissao.
// O que e pessoal (nome, email, telefone, ...) continua aberto.

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

// De proposito um administrador com TODAS as permissoes: a trava vale mesmo
// para quem pode tudo.
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: () => true, permissions: [] }),
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

function renderizar(isSelfEdit: boolean) {
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
    isEdit: true,
    saving: false,
    onSave: () => {},
    onCancel: () => {},
    editUserId: "user-eu",
    isSelfEdit,
  };
  return props;
}

async function montar(isSelfEdit: boolean) {
  const { UserFormEnhanced } = await import("@/components/users/UserFormEnhanced");
  return render(<UserFormEnhanced {...renderizar(isSelfEdit)} />);
}

// Os Select do Radix sao <button role="combobox">; o disabled aparece no DOM.
function combobox(nome: RegExp) {
  return screen.queryAllByRole("combobox").find((el) => el.textContent?.match(nome));
}

describe("Formulario de utilizador: a auto-edicao tranca o que da poder", () => {
  it("com isSelfEdit tranca estado, organizacao, cargo, adicionar organizacao e ambitos", async () => {
    const { container } = await montar(true);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Ana Ribeiro")).toBeInTheDocument();
    });

    // Estado (activo/inactivo/pendente) desactivado, mas visivel.
    const estado = combobox(/Ativo|Ativa|Active|Inativo/i);
    expect(estado).toBeDefined();
    expect(estado).toBeDisabled();

    // Cargo desactivado.
    const cargo = combobox(/Utilizador/);
    expect(cargo).toBeDefined();
    expect(cargo).toBeDisabled();

    // A organizacao fica sem cliques.
    expect(container.querySelector(".pointer-events-none.opacity-70")).not.toBeNull();

    // Nada de adicionar nem de remover associacoes.
    expect(screen.queryByRole("button", { name: /adicionar organiza/i })).toBeNull();

    // O botao dos ambitos por permissao (Shield) desaparece -- era o unico
    // ponto de entrada do MembershipScopesDialog.
    expect(container.querySelector(".lucide-shield")).toBeNull();

    // O que e pessoal continua editavel.
    expect(screen.getByDisplayValue("Ana Ribeiro")).not.toBeDisabled();
    expect(screen.getByDisplayValue("ana@exemplo.pt")).not.toBeDisabled();
  }, 30000);

  it("sem isSelfEdit (a editar OUTRA pessoa) o cargo e o estado continuam abertos", async () => {
    const { container } = await montar(false);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Ana Ribeiro")).toBeInTheDocument();
    });

    const estado = combobox(/Ativo|Ativa|Active|Inativo/i);
    expect(estado).toBeDefined();
    expect(estado).not.toBeDisabled();

    const cargo = combobox(/Utilizador/);
    expect(cargo).toBeDefined();
    expect(cargo).not.toBeDisabled();

    expect(container.querySelector(".pointer-events-none.opacity-70")).toBeNull();
    expect(container.querySelector(".lucide-shield")).not.toBeNull();
  }, 30000);
});
