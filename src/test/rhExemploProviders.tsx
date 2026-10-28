/**
 * Só para testes: o ambiente LIGADO À BASE dos ecrãs de /rh-exemplo, sem base nenhuma.
 *
 * Os hooks e wrappers de RH leem a organização activa (`useCompany`), as permissões (`usePermissions`) e o Supabase.
 * Os fornecedores reais (`CompanyProvider`, `PermissionsProvider`) arrancam sessão e RPCs, por isso aqui trocam-se os
 * MÓDULOS dos contextos por versões em memória, e o cliente do Supabase por um simulado que responde vazio.
 * Os ecrãs correm o código real; só a fronteira com a rede é simulada.
 *
 * COMO SE USA (no topo do ficheiro de teste, antes dos imports do ecrã; o vi.mock é elevado pelo vitest):
 *
 *   vi.mock("@/contexts/CompanyContext", async () => (await import("@/test/rhExemploProviders")).moduloCompanyFalso());
 *   vi.mock("@/contexts/PermissionsContext", async () => (await import("@/test/rhExemploProviders")).moduloPermissoesFalso());
 *   vi.mock("@/integrations/supabase/client", async () => (await import("@/test/rhExemploProviders")).moduloSupabaseFalso());
 *   import { renderRh, reporRhTeste, rhTeste } from "@/test/rhExemploProviders";
 *
 *   beforeEach(() => reporRhTeste());                       // organização "org-teste", sem permissões, base vazia
 *   rhTeste.permissoes = new Set(["hr.pessoas.view"]);      // permissões de quem olha (antes de montar)
 *   rhTeste.respostas["pessoas"] = [{ id: "p1" }];          // linhas devolvidas por `from("pessoas")...`
 *   rhTeste.rpcs["rpc_x"] = { data: 3, error: null };       // resposta de uma RPC (omissão: data null, sem erro)
 *   renderRh(<MeuEcra />, { rota: "/rh-exemplo/organizacao" });  // LanguageProvider + QueryClient + MemoryRouter
 *
 * Dados em `rhTeste` mudam-se a meio do teste, mas só valem para o que montar/ler a seguir. Para um teste que precise de um
 * wrapper próprio (por exemplo `usePermissions` de rh-exemplo), os mocks de wrappers existentes continuam a funcionar.
 */
import type { ReactNode } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";

export interface EstadoRhTeste {
  empresa: { id: string; name: string } | null;
  isLoading: boolean;
  userType: string;
  permissoes: Set<string>;
  isSystemAdmin: boolean;
  /** Linhas devolvidas por `supabase.from(tabela)...` (qualquer cadeia de filtros); omissão: lista vazia. */
  respostas: Record<string, unknown>;
  /** Resposta de `supabase.rpc(nome)`; omissão: `{ data: null, error: null }`. */
  rpcs: Record<string, { data: unknown; error: unknown }>;
  /** Registo do que o ecrã pediu, para asserções. */
  chamadas: { tabela?: string; rpc?: string; args?: unknown }[];
  /** Escritas pedidas (`insert`/`update`/`upsert`/`delete`) com o conteúdo enviado, para asserções. */
  escritas: { tabela: string; metodo: string; payload: unknown }[];
}

export const rhTeste: EstadoRhTeste = {
  empresa: null,
  isLoading: false,
  userType: "",
  permissoes: new Set(),
  isSystemAdmin: false,
  respostas: {},
  rpcs: {},
  chamadas: [],
  escritas: [],
};

export const ORGANIZACAO_TESTE = { id: "org-teste", name: "Organização de teste" };

export function reporRhTeste(): void {
  rhTeste.empresa = { ...ORGANIZACAO_TESTE };
  rhTeste.isLoading = false;
  rhTeste.userType = "admin";
  rhTeste.permissoes = new Set();
  rhTeste.isSystemAdmin = false;
  rhTeste.respostas = {};
  rhTeste.rpcs = {};
  rhTeste.chamadas = [];
  rhTeste.escritas = [];
}
reporRhTeste();

/** Módulo de substituição para `@/contexts/CompanyContext`. */
export function moduloCompanyFalso() {
  return {
    CompanyProvider: ({ children }: { children: ReactNode }) => children,
    useCompany: () => ({
      companies: rhTeste.empresa ? [rhTeste.empresa] : [],
      activeCompany: rhTeste.empresa,
      setActiveCompany: () => undefined,
      refreshCompanies: async () => undefined,
      isLoading: rhTeste.isLoading,
      userType: rhTeste.userType,
      userRoleName: rhTeste.userType,
    }),
  };
}

/** Módulo de substituição para `@/contexts/PermissionsContext` (e, por arrasto, `@/hooks/usePermissions`). */
export function moduloPermissoesFalso() {
  return {
    PermissionsProvider: ({ children }: { children: ReactNode }) => children,
    usePermissions: () => ({
      permissions: [...rhTeste.permissoes],
      loading: false,
      isSystemAdmin: rhTeste.isSystemAdmin,
      hasPermission: (p: string) => rhTeste.isSystemAdmin || rhTeste.permissoes.has(p),
      hasAnyPermission: (ps: string[]) => rhTeste.isSystemAdmin || ps.some((p) => rhTeste.permissoes.has(p)),
      hasModuleAccess: (m: string) => rhTeste.isSystemAdmin || [...rhTeste.permissoes].some((p) => p.startsWith(`${m}.`)),
      refreshPermissions: () => undefined,
    }),
  };
}

/** Uma cadeia de consulta: qualquer método encadeia, e `await` devolve as linhas de `rhTeste.respostas[tabela]`. */
function consulta(tabela: string): unknown {
  rhTeste.chamadas.push({ tabela });
  const resultado = () => {
    const r = rhTeste.respostas[tabela];
    return { data: r === undefined ? [] : r, error: null, count: Array.isArray(r) ? r.length : 0 };
  };
  const cadeia: unknown = new Proxy(() => undefined, {
    get: (_alvo, nome) => {
      if (nome === "then") return (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, ko);
      if (nome === "single" || nome === "maybeSingle") {
        return () => {
          const r = resultado();
          return Promise.resolve({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data });
        };
      }
      if (nome === "insert" || nome === "update" || nome === "upsert" || nome === "delete") {
        return (payload?: unknown) => {
          rhTeste.escritas.push({ tabela, metodo: nome, payload });
          return cadeia;
        };
      }
      return () => cadeia;
    },
    apply: () => cadeia,
  });
  return cadeia;
}

/** Módulo de substituição para `@/integrations/supabase/client`: sem sessão, sem rede, respostas vazias por omissão. */
export function moduloSupabaseFalso() {
  const canal = { on: () => canal, subscribe: () => canal, unsubscribe: () => undefined };
  const supabase = {
    from: (tabela: string) => consulta(tabela),
    rpc: (nome: string, args?: unknown) => {
      rhTeste.chamadas.push({ rpc: nome, args });
      return Promise.resolve(rhTeste.rpcs[nome] ?? { data: null, error: null });
    },
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
    channel: () => canal,
    removeChannel: () => undefined,
    storage: { from: () => ({ upload: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
  };
  return { supabase };
}

/** Monta o ecrã dentro de LanguageProvider, QueryClient novo (sem repetições) e MemoryRouter. */
export function renderRh(ui: ReactNode, opcoes: { rota?: string } = {}): RenderResult {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <LanguageProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[opcoes.rota ?? "/"]}>{ui}</MemoryRouter>
      </QueryClientProvider>
    </LanguageProvider>,
  );
}
