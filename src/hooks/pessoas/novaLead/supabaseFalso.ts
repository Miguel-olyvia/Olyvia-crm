// Só para testes: um cliente Supabase simulado que regista cada chamada (tabela, operação, filtros, dados). Nada vai à rede nem à base.
// Uso: vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("./supabaseFalso")).supabaseFalso }));
// Depois, em cada teste: supabaseFalso.reiniciar() e supabaseFalso.estado.tabelas["anew_leads"] = [...].
import { vi } from "vitest";

export type Operacao = "select" | "insert" | "update" | "delete" | "upsert";

export interface ChamadaTabela {
  tabela: string;
  operacao: Operacao;
  filtros: Array<[string, unknown[]]>;
  dados: unknown;
  colunas: string | null;
}

type Resposta = { data: unknown; error: unknown };
/** Para cada tabela: as linhas a devolver num select, ou uma função que decide a resposta pela chamada. */
type FonteTabela = unknown[] | ((c: ChamadaTabela) => Resposta);

const FILTROS = new Set(["eq", "neq", "in", "is", "not", "or", "ilike", "like", "gte", "lte", "gt", "lt", "order", "limit", "match", "contains", "range"]);

class Construtor implements PromiseLike<Resposta> {
  private readonly chamada: ChamadaTabela;
  constructor(tabela: string, operacao: Operacao, dados: unknown, colunas: string | null) {
    this.chamada = { tabela, operacao, filtros: [], dados, colunas };
    supabaseFalso.estado.chamadas.push(this.chamada);
  }

  private resolver(): Resposta {
    const erro = supabaseFalso.estado.erros[`${this.chamada.tabela}.${this.chamada.operacao}`];
    if (erro) return { data: null, error: erro };
    const fonte = supabaseFalso.estado.tabelas[this.chamada.tabela];
    if (typeof fonte === "function") return fonte(this.chamada);
    if (this.chamada.operacao !== "select") return { data: null, error: null };
    return { data: fonte ?? [], error: null };
  }

  select(colunas?: string): this {
    // Um select a seguir a insert/update (para devolver a linha) não muda a operação registada.
    if (this.chamada.operacao === "select") this.chamada.colunas = colunas ?? "*";
    return this;
  }
  single(): PromiseLike<Resposta> {
    return this.then((r) => (Array.isArray(r.data) ? { data: r.data[0] ?? null, error: r.error } : r)) as PromiseLike<Resposta>;
  }
  maybeSingle(): PromiseLike<Resposta> {
    return this.single();
  }
  throwOnError(): this {
    return this;
  }
  then<A = Resposta, B = never>(
    ok?: ((v: Resposta) => A | PromiseLike<A>) | null, falha?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.resolver()).then(ok, falha);
  }
  registar(metodo: string, args: unknown[]): this {
    this.chamada.filtros.push([metodo, args]);
    return this;
  }
}
for (const nome of FILTROS) {
  (Construtor.prototype as unknown as Record<string, unknown>)[nome] = function (this: Construtor, ...args: unknown[]) {
    return this.registar(nome, args);
  };
}

const novoEstado = () => ({
  tabelas: {} as Record<string, FonteTabela>,
  erros: {} as Record<string, unknown>,
  chamadas: [] as ChamadaTabela[],
});

export const supabaseFalso = {
  estado: novoEstado(),
  rpc: vi.fn(),
  functions: { invoke: vi.fn() },
  from(tabela: string) {
    return {
      select: (colunas?: string) => new Construtor(tabela, "select", null, colunas ?? "*"),
      insert: (dados: unknown) => new Construtor(tabela, "insert", dados, null),
      update: (dados: unknown) => new Construtor(tabela, "update", dados, null),
      upsert: (dados: unknown) => new Construtor(tabela, "upsert", dados, null),
      delete: () => new Construtor(tabela, "delete", null, null),
    };
  },
  reiniciar() {
    supabaseFalso.estado = novoEstado();
    supabaseFalso.rpc.mockReset();
    supabaseFalso.functions.invoke.mockReset();
  },
  /** As chamadas feitas a uma tabela (opcionalmente só de uma operação). */
  chamadasA(tabela: string, operacao?: Operacao): ChamadaTabela[] {
    return supabaseFalso.estado.chamadas.filter((c) => c.tabela === tabela && (!operacao || c.operacao === operacao));
  },
};

/** O valor com que um filtro foi chamado (por exemplo ["eq", "organization_id"] devolve o id), ou undefined. */
export function valorDoFiltro(chamada: ChamadaTabela, metodo: string, coluna: string): unknown {
  return chamada.filtros.find(([m, a]) => m === metodo && a[0] === coluna)?.[1][1];
}
