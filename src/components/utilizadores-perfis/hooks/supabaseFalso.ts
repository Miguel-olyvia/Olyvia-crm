// SÓ PARA TESTES: um cliente da base simulado, em memória. Cada tabela é uma lista de linhas; `select`, `eq`, `in`, `is`, `not`,
// `order`, `limit`, `maybeSingle` e `single` encadeiam-se como no Supabase e `eq`/`in`/`is` filtram de verdade, para os testes
// verem o que a leitura pediu. Regista as chamadas para se poder afirmar o que se enviou. Não importa a base real.
import { vi } from "vitest";

type Linha = Record<string, unknown>;
export interface ChamadaFalsa { tabela: string; operacao: string; filtros: Array<[string, unknown]>; valores?: unknown }
export interface OpcoesFalso {
  tabelas?: Record<string, Linha[]>;
  /** Erro a devolver numa tabela (todas as operações). */
  erros?: Record<string, string>;
  rpc?: (nome: string, args?: Record<string, unknown>) => { data?: unknown; error?: { message: string } | null };
  invocar?: (nome: string, corpo: unknown) => { data?: unknown; error?: unknown };
  utilizadorAuth?: string | null;
}

export function criarSupabaseFalso(opcoes: OpcoesFalso = {}) {
  const chamadas: ChamadaFalsa[] = [];
  const rpcs: Array<{ nome: string; args?: Record<string, unknown> }> = [];
  const invocacoes: Array<{ nome: string; corpo: unknown }> = [];

  const from = (tabela: string) => {
    const filtros: Array<[string, unknown]> = [];
    let linhas = [...(opcoes.tabelas?.[tabela] ?? [])];
    let operacao = "select";
    const construtor: Record<string, unknown> = {};
    const encadear = (nome: string, aplicar?: (...a: unknown[]) => void) => {
      construtor[nome] = (...a: unknown[]) => { aplicar?.(...a); return construtor; };
    };
    ["select", "order", "limit", "neq", "gte", "lte", "or", "ilike"].forEach((n) => encadear(n));
    encadear("eq", (c, v) => { filtros.push([`eq:${String(c)}`, v]); linhas = linhas.filter((l) => l[String(c)] === v); });
    encadear("in", (c, v) => { filtros.push([`in:${String(c)}`, v]); linhas = linhas.filter((l) => (v as unknown[]).includes(l[String(c)])); });
    encadear("is", (c, v) => { filtros.push([`is:${String(c)}`, v]); linhas = linhas.filter((l) => (l[String(c)] ?? null) === v); });
    encadear("not", (c, _o, v) => { filtros.push([`not:${String(c)}`, v]); linhas = linhas.filter((l) => (l[String(c)] ?? null) !== v); });
    const resultado = () => {
      chamadas.push({ tabela, operacao, filtros: [...filtros] });
      const erro = opcoes.erros?.[tabela];
      return erro ? { data: null, error: { message: erro } } : { data: linhas, error: null };
    };
    construtor.maybeSingle = () => { const r = resultado(); return Promise.resolve({ ...r, data: r.error ? null : (linhas[0] ?? null) }); };
    construtor.single = construtor.maybeSingle;
    construtor.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, ko);
    ["update", "insert", "delete", "upsert"].forEach((n) => { construtor[n] = () => { operacao = n; return construtor; }; });
    return construtor;
  };

  const cliente = {
    from: vi.fn(from),
    rpc: vi.fn(async (nome: string, args?: Record<string, unknown>) => {
      rpcs.push({ nome, args });
      const r = opcoes.rpc?.(nome, args) ?? {};
      return { data: r.data ?? null, error: r.error ?? null };
    }),
    auth: { getUser: vi.fn(async () => ({ data: { user: opcoes.utilizadorAuth === null ? null : { id: opcoes.utilizadorAuth ?? "auth-eu" } } })) },
    functions: {
      invoke: vi.fn(async (nome: string, o?: { body?: unknown }) => {
        invocacoes.push({ nome, corpo: o?.body });
        const r = opcoes.invocar?.(nome, o?.body) ?? {};
        return { data: r.data ?? null, error: r.error ?? null };
      }),
    },
  };
  return { cliente, chamadas, rpcs, invocacoes };
}
