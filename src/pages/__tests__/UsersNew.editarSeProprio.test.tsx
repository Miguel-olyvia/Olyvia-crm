import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Duas regras que andam juntas:
//   1. Qualquer pessoa edita a SUA propria ficha, mesmo que so tenha users.view.
//   2. Ninguem -- nem administradores -- mexe no seu proprio cargo, nas suas
//      permissoes, nos seus ambitos ou nas suas ligacoes a organizacoes.
// Aqui prova-se o lado do ecra. O lado do servidor esta em
// autoPromocaoMigration.test.ts.

const AUTH_ID = "auth-eu";
const ANEW_ID = "user-eu";
const ORG_ID = "org-nike";

const EU = {
  id: ANEW_ID,
  email: "eu@exemplo.pt",
  name: "Ana Ribeiro",
  phone: null,
  avatar_url: null,
  auth_user_id: AUTH_ID,
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  created_by: "outra-pessoa",
  entity_id: null,
};

const OUTRA = {
  id: "user-outra",
  email: "bruno@exemplo.pt",
  name: "Bruno Costa",
  phone: null,
  avatar_url: null,
  auth_user_id: "auth-bruno",
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  created_by: "outra-pessoa",
  entity_id: null,
};

const MEMBERSHIP_EU = {
  id: "mem-eu",
  user_id: ANEW_ID,
  organization_id: ORG_ID,
  relationship_type: "BELONGS_TO",
  role_id: "role-user",
  status: "active",
  join_method: null,
};

const MEMBERSHIP_OUTRA = {
  ...MEMBERSHIP_EU,
  id: "mem-outra",
  user_id: OUTRA.id,
};

const LINHAS: Record<string, any[]> = {
  anew_hierarchy: [],
  anew_organizations: [{ id: ORG_ID, name: "Nike", type: "company", created_by: ANEW_ID }],
  anew_users: [EU, OUTRA],
  anew_memberships: [MEMBERSHIP_EU, MEMBERSHIP_OUTRA],
  anew_roles: [{ id: "role-user", code: "user", name: "Utilizador", organization_id: ORG_ID }],
  anew_entity_phones: [],
  anew_role_permissions: [],
  user_templates: [],
  user_template_fields: [],
  user_template_attributes: [],
  anew_entity_addresses: [],
};

function construtorDeConsulta(tabela: string) {
  const linhas = LINHAS[tabela] ?? [];
  const resultado = { data: linhas, error: null };
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
      getUser: () => Promise.resolve({ data: { user: { id: AUTH_ID } }, error: null }),
      getSession: () => Promise.resolve({ data: { session: { user: { id: AUTH_ID } } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  },
}));

vi.mock("@/components/Layout", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({
    activeCompany: { id: ORG_ID, name: "Nike" },
    userType: "user",
    companies: [{ id: ORG_ID, name: "Nike" }],
    isLoading: false,
  }),
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "pt" }),
}));

// O ponto do teste: SO users.view. Nem users.edit, nem create, nem delete.
const hasPermission = vi.fn((codigo: string) => codigo === "users.view");
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission }),
}));

vi.mock("@/hooks/usePermissionScope", async () => {
  const real = await vi.importActual<any>("@/hooks/usePermissionScope");
  return {
    ...real,
    usePermissionScope: () => ({
      loading: false,
      // Ambito OWNED: a regra "canActOnEntity" compara created_by, e a ficha
      // propria foi criada por outra pessoa -- ou seja, sem a alteracao nao
      // havia forma nenhuma de a abrir.
      getPermissionScope: () => "OWNED",
      hasMinimumScope: () => false,
      anewUserId: ANEW_ID,
      authUserId: AUTH_ID,
      anewRoleCode: "user",
      teamMemberIds: [],
      refresh: () => {},
    }),
  };
});

// Dialogos laterais que nao interessam a esta regra (e que trazem
// react-query / dados proprios atras).
vi.mock("@/components/users/UsersFAQDialog", () => ({
  UsersFAQDialog: () => null,
}));
vi.mock("@/components/users/UserHistoryDialog", () => ({
  default: () => null,
}));

// Substituto do formulario: interessa so o que a pagina lhe passa.
const propsDoFormulario: any[] = [];
vi.mock("@/components/users/UserFormEnhanced", () => ({
  UserFormEnhanced: (props: any) => {
    propsDoFormulario.push(props);
    return <div data-testid="formulario-utilizador" />;
  },
}));

describe("Ecra de Utilizadores: editar-se a si proprio com apenas users.view", () => {
  beforeEach(() => {
    propsDoFormulario.length = 0;
  });

  it("mostra a accao de editar na propria ficha e nao na dos outros", async () => {
    const { default: UsersNew } = await import("../UsersNew");
    const { container } = render(<UsersNew />);

    await waitFor(() => {
      expect(screen.getByText("Ana Ribeiro")).toBeInTheDocument();
    });
    expect(screen.getByText("Bruno Costa")).toBeInTheDocument();

    const linhas = Array.from(container.querySelectorAll("tbody tr"));
    const linhaPropria = linhas.find((l) => l.textContent?.includes("Ana Ribeiro"))!;
    const linhaDeOutro = linhas.find((l) => l.textContent?.includes("Bruno Costa"))!;

    // canEditUser() decide as duas coisas: o cursor/clique da linha e o item
    // "Editar" do menu. A propria ficha e editavel; a de outra pessoa nao.
    expect(linhaPropria.className).toContain("cursor-pointer");
    expect(linhaDeOutro.className).not.toContain("cursor-pointer");
  }, 30000);

  it("abre a propria ficha e marca-a como auto-edicao para o formulario", async () => {
    const { default: UsersNew } = await import("../UsersNew");
    const { container } = render(<UsersNew />);

    await waitFor(() => {
      expect(screen.getByText("Ana Ribeiro")).toBeInTheDocument();
    });

    const linhas = Array.from(container.querySelectorAll("tbody tr"));
    const linhaPropria = linhas.find((l) => l.textContent?.includes("Ana Ribeiro"))!;
    fireEvent.click(linhaPropria);

    await waitFor(() => {
      expect(screen.getByTestId("formulario-utilizador")).toBeInTheDocument();
    });

    const ultimas = propsDoFormulario[propsDoFormulario.length - 1];
    expect(ultimas.isEdit).toBe(true);
    expect(ultimas.editUserId).toBe(ANEW_ID);
    // A trava de auto-promocao vai ligada, mesmo sem users.edit.
    expect(ultimas.isSelfEdit).toBe(true);
  }, 30000);
});
