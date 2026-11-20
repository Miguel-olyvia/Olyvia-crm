// 17/11: a leitura LEVE do Catálogo (cat_ler_catalogo_servicos, 20270121000001). Negócios, Serviços e Estúdio deixam de ler os 29 785 produtos
// da Mudelar (32 MB, 4 a 15 s, statement timeout). Sem a função na base, voltam a cat_ler_catalogo.
import { describe, expect, it } from "vitest";
import { lerCatalogo } from "./lerCatalogo";

const ORG = "11111111-1111-4111-a111-111111111111";
type Resp = { data?: unknown; error?: { code?: string; message?: string } | null };

function cliente(resp: Record<string, () => Resp>) {
  const rpcs: string[] = [];
  const sb = { rpc: async (fn: string) => { rpcs.push(fn); return (resp[fn] ?? (() => ({ data: null, error: { message: "sem função" } })))(); } } as never;
  return { sb, rpcs };
}
const comum = { cat_ler_modelos_gestao: () => ({ data: null, error: null }), cat_ler_atributos_definicoes: () => ({ data: null, error: null }) };
const LEVE = { produtos: [{ id: "p-leve", name: "Cola" }] };
const INTEIRO = { produtos: [{ id: "p-1", name: "A" }, { id: "p-2", name: "B" }] };

describe("lerCatalogo com a opção leve", () => {
  it("chama cat_ler_catalogo_servicos e não cat_ler_catalogo", async () => {
    const c = cliente({ ...comum, cat_ler_catalogo_servicos: () => ({ data: LEVE, error: null }), cat_ler_catalogo: () => ({ data: INTEIRO, error: null }) });
    const L = await lerCatalogo(c.sb, ORG, { leve: true });
    expect(c.rpcs).toContain("cat_ler_catalogo_servicos");
    expect(c.rpcs).not.toContain("cat_ler_catalogo");
    expect(L.produtos.map((p) => p.id)).toEqual(["p-leve"]);
  });
  it("sem a opção, o comportamento é o de sempre: cat_ler_catalogo", async () => {
    const c = cliente({ ...comum, cat_ler_catalogo_servicos: () => ({ data: LEVE, error: null }), cat_ler_catalogo: () => ({ data: INTEIRO, error: null }) });
    const L = await lerCatalogo(c.sb, ORG);
    expect(c.rpcs).toContain("cat_ler_catalogo");
    expect(c.rpcs).not.toContain("cat_ler_catalogo_servicos");
    expect(L.produtos).toHaveLength(2);
  });
  it("a função por criar na base (PGRST202 ou 42883): volta a cat_ler_catalogo", async () => {
    for (const erro of [{ code: "PGRST202", message: "Could not find the function public.cat_ler_catalogo_servicos" }, { code: "42883", message: "function public.cat_ler_catalogo_servicos(uuid) does not exist" }]) {
      const c = cliente({ ...comum, cat_ler_catalogo_servicos: () => ({ data: null, error: erro }), cat_ler_catalogo: () => ({ data: INTEIRO, error: null }) });
      const L = await lerCatalogo(c.sb, ORG, { leve: true });
      expect(c.rpcs.filter((f) => f.startsWith("cat_ler_catalogo"))).toEqual(["cat_ler_catalogo_servicos", "cat_ler_catalogo"]);
      expect(L.produtos).toHaveLength(2);
    }
  });
  it("outro erro (permissão, tempo) sobe tal como veio, SEM voltar à leitura pesada", async () => {
    const c = cliente({ ...comum, cat_ler_catalogo_servicos: () => ({ data: null, error: { code: "CT001", message: "x" } }), cat_ler_catalogo: () => ({ data: INTEIRO, error: null }) });
    await expect(lerCatalogo(c.sb, ORG, { leve: true })).rejects.toThrow("Não tem permissão");
    expect(c.rpcs).not.toContain("cat_ler_catalogo");
    const t = cliente({ ...comum, cat_ler_catalogo_servicos: () => ({ data: null, error: { code: "57014", message: "statement timeout" } }) });
    await expect(lerCatalogo(t.sb, ORG, { leve: true })).rejects.toThrow("statement timeout");
    expect(t.rpcs).not.toContain("cat_ler_catalogo");
  });
  it("um erro de DENTRO da função leve (outra função em falta) sobe como erro e não cai na leitura pesada", async () => {
    for (const erro of [{ code: "42883", message: "function public.fn_outra(uuid) does not exist" }, { code: "PGRST202", message: "Could not find the function public.fn_outra(uuid) in the schema cache" }]) {
      const c = cliente({ ...comum, cat_ler_catalogo_servicos: () => ({ data: null, error: erro }), cat_ler_catalogo: () => ({ data: INTEIRO, error: null }) });
      await expect(lerCatalogo(c.sb, ORG, { leve: true })).rejects.toThrow("fn_outra");
      expect(c.rpcs).not.toContain("cat_ler_catalogo");
    }
  });
});

describe("lerCatalogo leve: as tabelas dos produtos (cat_ler_produtos_tabelas_servicos)", () => {
  const TAB = { categoriasProduto: [], marcas: [], unidades: [], exige: [], produtos: [] };
  const base = { ...comum, cat_ler_catalogo_servicos: () => ({ data: LEVE, error: null }), cat_ler_catalogo: () => ({ data: INTEIRO, error: null }) };
  it("leve: chama a versão dos serviços e não a completa", async () => {
    const c = cliente({ ...base, cat_ler_produtos_tabelas_servicos: () => ({ data: TAB, error: null }), cat_ler_produtos_tabelas: () => ({ data: TAB, error: null }) });
    const L = await lerCatalogo(c.sb, ORG, { leve: true });
    expect(c.rpcs).toContain("cat_ler_produtos_tabelas_servicos");
    expect(c.rpcs).not.toContain("cat_ler_produtos_tabelas");
    expect(L.tabelas).toBeDefined();
  });
  it("sem a opção leve: a de sempre", async () => {
    const c = cliente({ ...base, cat_ler_produtos_tabelas_servicos: () => ({ data: TAB, error: null }), cat_ler_produtos_tabelas: () => ({ data: TAB, error: null }) });
    await lerCatalogo(c.sb, ORG);
    expect(c.rpcs).toContain("cat_ler_produtos_tabelas");
    expect(c.rpcs).not.toContain("cat_ler_produtos_tabelas_servicos");
  });
  it("a nova por criar na base (a função nomeada em falta): volta à antiga", async () => {
    const erro = { code: "PGRST202", message: "Could not find the function public.cat_ler_produtos_tabelas_servicos(p_org) in the schema cache" };
    const c = cliente({ ...base, cat_ler_produtos_tabelas_servicos: () => ({ data: null, error: erro }), cat_ler_produtos_tabelas: () => ({ data: TAB, error: null }) });
    const L = await lerCatalogo(c.sb, ORG, { leve: true });
    expect(c.rpcs.filter((f) => f.startsWith("cat_ler_produtos_tabelas"))).toEqual(["cat_ler_produtos_tabelas_servicos", "cat_ler_produtos_tabelas"]);
    expect(L.tabelas).toBeDefined();
  });
  it("outro erro (tempo): não cai na versão pesada e fica sem tabelas", async () => {
    const c = cliente({ ...base, cat_ler_produtos_tabelas_servicos: () => ({ data: null, error: { code: "57014", message: "statement timeout" } }), cat_ler_produtos_tabelas: () => ({ data: TAB, error: null }) });
    const L = await lerCatalogo(c.sb, ORG, { leve: true });
    expect(c.rpcs).not.toContain("cat_ler_produtos_tabelas");
    expect(L.tabelas).toBeUndefined();
  });
});

describe("lerCatalogo com soServicos: não lê o que é dos Produtos", () => {
  const TAB = { categoriasProduto: [], marcas: [], unidades: [], exige: [], produtos: [{ id: "p-leve", brand_id: "b1", marca: "Marca X", category_id: "c1" }] };
  const base = { ...comum, cat_ler_catalogo_servicos: () => ({ data: LEVE, error: null }), cat_ler_produtos_tabelas_servicos: () => ({ data: TAB, error: null }),
    cat_ler_atributos_definicoes: () => ({ data: { atributos: [], produtos: [] }, error: null }), cat_ler_modelos_gestao: () => ({ data: { modelos: [] }, error: null }) };
  it("não chama os atributos nem os modelos, mas mantém as tabelas dos serviços (a marca e a categoria dos consumos)", async () => {
    const c = cliente(base);
    const L = await lerCatalogo(c.sb, ORG, { leve: true, soServicos: true });
    expect(c.rpcs).not.toContain("cat_ler_atributos_definicoes");
    expect(c.rpcs).not.toContain("cat_ler_atributos");
    expect(c.rpcs).not.toContain("cat_ler_modelos_gestao");
    expect(c.rpcs).toContain("cat_ler_produtos_tabelas_servicos");
    expect(L.atributos).toBeUndefined();
    expect(L.modelos).toBeUndefined();
    expect(L.produtos[0].marca).toBe("Marca X");
  });
  it("sem a opção (Negócios, Estúdio, Produtos), continua a ler os atributos e os modelos", async () => {
    const c = cliente(base);
    const L = await lerCatalogo(c.sb, ORG, { leve: true });
    expect(c.rpcs).toContain("cat_ler_atributos_definicoes");
    expect(c.rpcs).toContain("cat_ler_modelos_gestao");
    expect(L.atributos).toBeDefined();
    expect(L.modelos).toBeDefined();
  });
});
