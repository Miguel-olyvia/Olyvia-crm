// 16/11: o plano de chamadas do arranque do Catálogo. Com 14 328 produtos (Mudelar) o arranque estourava o tempo: cat_ler_atributos trazia 8 MB
// (os valores de todos os produtos) e products.model_id lia-se em páginas de 1000 com OFFSET. Agora nenhum dos dois: os produtos lêem-se por páginas
// (produtosPaginados.ts) e o modelo e os atributos de cada produto vêm da lista e da ficha.
import { describe, expect, it } from "vitest";
import { lerCatalogo } from "./lerCatalogo";

const ORG = "11111111-1111-4111-a111-111111111111";
const DEFS = { atributos: [{ id: "a1", codigo: "cor", nome: "Cor", tipo: "lista", tem_hex: false, ordem: 1, opcoes: [{ id: "o1", valor: "Preto", hex: null, ordem: 1 }] }] };
const MODELOS = { modelos: [{ id: "m1", nome: "SORTY", numero: 1, ativo: true, subcategoria: { id: "s1" } }] };
const ANTIGO = { atributos: DEFS.atributos, produtos: [{ id: "p1", valores: [{ atributo: "a1", opcao: "o1", valor: "Preto", medida: null }] }] };

type Resp = { data?: unknown; error?: { code?: string; message?: string } | null };
function cliente(resp: Record<string, () => Resp>) {
  const rpcs: string[] = [], tabelas: string[] = [];
  const sb = {
    rpc: async (fn: string) => { rpcs.push(fn); return (resp[fn] ?? (() => ({ data: null, error: { message: "sem função" } })))(); },
    from: (t: string) => { tabelas.push(t); throw new Error("o arranque não lê tabelas: " + t); },
  } as never;
  return { sb, rpcs, tabelas };
}
const base = { cat_ler_catalogo: () => ({ data: { produtos: [] }, error: null }), cat_ler_modelos_gestao: () => ({ data: MODELOS, error: null }) };

describe("lerCatalogo: o plano do arranque", () => {
  it("lê as definições dos atributos (sem produtos) e nunca cat_ler_atributos nem a tabela products", async () => {
    const c = cliente({ ...base, cat_ler_atributos_definicoes: () => ({ data: DEFS, error: null }) });
    const L = await lerCatalogo(c.sb, ORG);
    expect([...c.rpcs].sort()).toEqual(["cat_ler_atributos_definicoes", "cat_ler_catalogo", "cat_ler_modelos_gestao", "cat_ler_produtos_tabelas"]);
    expect(c.tabelas).toEqual([]);
    expect(L.atributos?.defs).toHaveLength(1);
    expect(L.atributos?.produtos).toEqual([]);
  });
  it("os modelos vêm sem as ligações dos produtos (a lista e a ficha trazem o modelo de cada um)", async () => {
    const L = await lerCatalogo(cliente({ ...base, cat_ler_atributos_definicoes: () => ({ data: DEFS, error: null }) }).sb, ORG);
    expect(L.modelos?.lista).toHaveLength(1);
    expect(L.modelos?.produtos).toBeNull();
  });
  it("as chamadas levam a organização", async () => {
    const vistos: Record<string, unknown>[] = [];
    const sb = { rpc: async (fn: string, a: Record<string, unknown>) => { vistos.push({ fn, ...a }); return { data: null, error: { message: "x" } }; } } as never;
    await lerCatalogo(sb, ORG).catch(() => undefined);
    expect(vistos.every((v) => v.p_org === ORG)).toBe(true);
  });
  it("definições por criar na base (PGRST202): cai no cat_ler_atributos antigo, como antes", async () => {
    const c = cliente({ ...base,
      cat_ler_atributos_definicoes: () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_ler_atributos_definicoes" } }),
      cat_ler_atributos: () => ({ data: ANTIGO, error: null }) });
    const L = await lerCatalogo(c.sb, ORG);
    expect(c.rpcs).toContain("cat_ler_atributos");
    expect(L.atributos?.produtos).toHaveLength(1);
  });
  it("outro erro nas definições (tempo, rede, permissão): fica sem atributos e NÃO cai nos 8 MB do antigo; o Catálogo lê-se na mesma", async () => {
    for (const erro of [{ code: "57014", message: "statement timeout" }, { code: "CT001", message: "sem permissão" }]) {
      const c = cliente({ ...base, cat_ler_atributos_definicoes: () => ({ data: null, error: erro }), cat_ler_atributos: () => ({ data: ANTIGO, error: null }) });
      const L = await lerCatalogo(c.sb, ORG);
      expect(c.rpcs).not.toContain("cat_ler_atributos");
      expect(L.atributos).toBeUndefined();
    }
  });
  it("exceção nas definições: sem atributos, sem erro", async () => {
    const c = cliente({ ...base, cat_ler_atributos_definicoes: () => { throw new Error("rede"); } });
    const L = await lerCatalogo(c.sb, ORG);
    expect(L.atributos).toBeUndefined();
  });
});
