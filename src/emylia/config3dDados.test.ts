// 25/11: a configuração 3D por produto/categoria (cat_ler_config_3d e cat_definir_config_3d, migration B por aplicar: a base é simulada). O leitor valida tudo e larga o inválido;
// as ligações expandem-se (`tudo`, a zona explícita vence, `aplicar: não` exclui); as recusas CT00x chegam em português; função em falta = «ainda não disponível».
import { beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }) },
}));

import { definirConfig3d, lerConfig3d, ligacoesDaConfig, mesmasLigacoes, type Ligacao } from "./config3dDados";
import { chaveDeExclusao } from "./planta3d/aspetoZonas";
import type { Eixos } from "./planta3d/eixosMedida";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const PROD = "11111111-2222-4333-8444-555555555555";
const A1 = "aaaaaaaa-0000-4000-a000-000000000001", A2 = "aaaaaaaa-0000-4000-a000-000000000002";
const EIXOS: Eixos = { largura: "largura", altura: "comprimento", profundidade: "espessura" };

beforeEach(() => { base.chamadas = []; base.responder = () => ({ data: null, error: null }); });

describe("lerConfig3d", () => {
  it("chama cat_ler_config_3d(p_org, p_alvo, p_id) e lê o próprio, a subcategoria, a categoria e a efectiva com as origens", async () => {
    base.responder = () => ({
      data: {
        proprio: { eixos: EIXOS, ligacoes: [{ atributo: A1, zona: "frente", aplicar: true }], orfas: 1 },
        subcategoria: { id: A2, nome: "Móveis de casa de banho", eixos: null, ligacoes: null },
        categoria: { id: A1, nome: "Casa de banho", eixos: EIXOS, ligacoes: [] },
        efectiva: { eixos: EIXOS, eixos_origem: "produto", ligacoes: [{ atributo: A1, zona: "frente", aplicar: true }], ligacoes_origem: "produto" },
      }, error: null,
    });
    const r = await lerConfig3d(ORG, "produto", PROD);
    expect(base.chamadas).toEqual([{ f: "cat_ler_config_3d", a: { p_org: ORG, p_alvo: "produto", p_id: PROD } }]);
    expect(r.ok && r.v).toMatchObject({
      proprio: { eixos: EIXOS, ligacoes: [{ atributo: A1, zona: "frente", aplicar: true }], orfas: 1 },
      subcategoria: { id: A2, nome: "Móveis de casa de banho", eixos: null, ligacoes: null },
      categoria: { nome: "Casa de banho", ligacoes: [] },
      efectiva: { eixos: EIXOS, eixosOrigem: "produto", ligacoesOrigem: "produto" },
    });
  });
  it("sem configuração nenhuma (tudo null, origem automático) devolve uma efectiva vazia", async () => {
    base.responder = () => ({ data: { proprio: null, subcategoria: null, categoria: null, efectiva: { eixos: null, eixos_origem: "automatico", ligacoes: null, ligacoes_origem: "automatico" } }, error: null });
    const r = await lerConfig3d(ORG, "produto", PROD);
    expect(r).toMatchObject({ ok: true, v: { proprio: null, efectiva: { eixos: null, eixosOrigem: "automatico", ligacoes: null, ligacoesOrigem: "automatico" } } });
  });
  it("larga o inválido: eixos que não são uma permutação → null; zona desconhecida, uuid inválido e aplicar que não é booleano saem (e contam-se como ignoradas)", async () => {
    base.responder = () => ({
      data: {
        proprio: {
          eixos: { largura: "largura", altura: "largura", profundidade: "espessura" },
          ligacoes: [
            { atributo: A1, zona: "frente", aplicar: true }, { atributo: A1, zona: "portinhola", aplicar: true }, { atributo: "não-é-uuid", zona: "corpo", aplicar: true },
            { atributo: A2, zona: "corpo", aplicar: "sim" }, { atributo: A2, zona: "tudo", aplicar: false }, null, 7,
          ], orfas: 0,
        },
        efectiva: { eixos: null, eixos_origem: "inventada", ligacoes: null, ligacoes_origem: "produto" },
      }, error: null,
    });
    const r = await lerConfig3d(ORG, "produto", PROD);
    expect(r.ok && r.v.proprio).toMatchObject({ eixos: null, ligacoes: [{ atributo: A1, zona: "frente", aplicar: true }, { atributo: A2, zona: "tudo", aplicar: false }], ignoradas: 5 });
    expect(r.ok && r.v.efectiva.eixosOrigem).toBe("automatico");
  });
  it("uma resposta que não é um objecto é uma falha com frase em português (nunca rebenta)", async () => {
    base.responder = () => ({ data: "lixo", error: null });
    const r = await lerConfig3d(ORG, "produto", PROD);
    expect(r.ok).toBe(false);
  });
  it("função em falta (PGRST202): «ainda não disponível», sem o erro em bruto", async () => {
    base.responder = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_ler_config_3d(p_alvo, p_id, p_org) in the schema cache" } });
    const r = await lerConfig3d(ORG, "produto", PROD);
    expect(r).toMatchObject({ ok: false, indisponivel: true });
    expect(r.ok === false && r.erro).not.toMatch(/schema cache|PGRST/);
  });
  it("sem permissão (CT001): a mensagem da base, tal como vem", async () => {
    base.responder = () => ({ data: null, error: { code: "CT001", message: "Sem permissão para ver a configuração 3D." } });
    expect(await lerConfig3d(ORG, "produto", PROD)).toMatchObject({ ok: false, erro: "Sem permissão para ver a configuração 3D.", codigo: "CT001" });
  });
  it("uma excepção (rede) também volta como falha, sem inglês em bruto", async () => {
    base.responder = () => { throw new Error("Failed to fetch"); };
    const r = await lerConfig3d(ORG, "produto", PROD);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).not.toMatch(/Failed/);
  });
});

describe("ligações com zona que o ecrã não conhece", () => {
  const DADOS = { proprio: { eixos: null, ligacoes: [{ atributo: A1, zona: "frente", aplicar: true }, { atributo: A2, zona: "portinhola", aplicar: false }, { atributo: "não-é-uuid", zona: "corpo", aplicar: true }], orfas: 0 }, efectiva: { eixos: null, eixos_origem: "automatico", ligacoes: null, ligacoes_origem: "automatico" } };
  it("o leitor mostra só as conhecidas, mas guarda em ligacoesBase as que a base aceita (a desconhecida fica, a malformada sai)", async () => {
    base.responder = () => ({ data: DADOS, error: null });
    const r = await lerConfig3d(ORG, "produto", PROD);
    expect(r.ok && r.v.proprio?.ligacoes).toEqual([{ atributo: A1, zona: "frente", aplicar: true }]);
    expect(r.ok && r.v.proprio?.ligacoesBase).toEqual([{ atributo: A1, zona: "frente", aplicar: true }, { atributo: A2, zona: "portinhola", aplicar: false }]);
  });
  it("definirConfig3d com `reenviar` e sem `ligacoes` manda as ligações da base tal e qual; com `ligacoes` valem estas", async () => {
    const guardadas = [{ atributo: A2, zona: "portinhola", aplicar: false }];
    await definirConfig3d(ORG, "produto", PROD, { eixos: EIXOS, reenviar: guardadas });
    await definirConfig3d(ORG, "produto", PROD, { eixos: EIXOS, ligacoes: [{ atributo: A1, zona: "frente", aplicar: true }], reenviar: guardadas });
    await definirConfig3d(ORG, "produto", PROD, { eixos: null });
    expect(base.chamadas.map((c) => c.a.p_ligacoes)).toEqual([guardadas, [{ atributo: A1, zona: "frente", aplicar: true }], null]);
  });
});

describe("definirConfig3d", () => {
  it("chama cat_definir_config_3d com os nomes exactos dos argumentos", async () => {
    const lig: Ligacao[] = [{ atributo: A1, zona: "frente", aplicar: true }];
    base.responder = () => ({ data: { alvo: "produto", id: PROD, eixos: EIXOS, ligacoes: lig, anterior: { eixos: null, ligacoes: null } }, error: null });
    const r = await definirConfig3d(ORG, "produto", PROD, { eixos: EIXOS as never, ligacoes: lig });
    expect(base.chamadas).toEqual([{ f: "cat_definir_config_3d", a: { p_org: ORG, p_alvo: "produto", p_id: PROD, p_eixos: EIXOS, p_ligacoes: lig } }]);
    expect(r).toMatchObject({ ok: true, v: { eixos: EIXOS, ligacoes: lig } });
  });
  it("null e null (voltar a herdar tudo) vão como null à base", async () => {
    base.responder = () => ({ data: { alvo: "produto", id: PROD, eixos: null, ligacoes: null, anterior: { eixos: EIXOS, ligacoes: null } }, error: null });
    await definirConfig3d(ORG, "produto", PROD, { eixos: null, ligacoes: null });
    expect(base.chamadas[0].a).toMatchObject({ p_eixos: null, p_ligacoes: null });
  });
  it("a subcategoria é uma categoria: o alvo é 'categoria'", async () => {
    base.responder = () => ({ data: { alvo: "categoria", id: PROD }, error: null });
    await definirConfig3d(ORG, "categoria", PROD, { eixos: null, ligacoes: [] });
    expect(base.chamadas[0].a).toMatchObject({ p_alvo: "categoria", p_ligacoes: [] });
  });
  it("recusa sem ir à base: eixos que não são uma permutação, ligação repetida, zona desconhecida, mais de 60 ligações", async () => {
    const repetida: Ligacao[] = [{ atributo: A1, zona: "frente", aplicar: true }, { atributo: A1, zona: "frente", aplicar: false }];
    const muitas: Ligacao[] = Array.from({ length: 61 }, (_, i) => ({ atributo: `aaaaaaaa-0000-4000-a000-${String(i).padStart(12, "0")}`, zona: "corpo", aplicar: true }));
    expect((await definirConfig3d(ORG, "produto", PROD, { eixos: { largura: "largura", altura: "largura", profundidade: "espessura" } as never, ligacoes: null })).ok).toBe(false);
    expect((await definirConfig3d(ORG, "produto", PROD, { eixos: null, ligacoes: repetida })).ok).toBe(false);
    expect((await definirConfig3d(ORG, "produto", PROD, { eixos: null, ligacoes: [{ atributo: A1, zona: "portinhola" as never, aplicar: true }] })).ok).toBe(false);
    expect((await definirConfig3d(ORG, "produto", PROD, { eixos: null, ligacoes: muitas })).ok).toBe(false);
    expect(base.chamadas).toHaveLength(0);
  });
  it("as recusas da base (CT001, CT002, CT003) chegam em português; o resto vira uma frase de reserva", async () => {
    for (const code of ["CT001", "CT002", "CT003"]) {
      base.responder = () => ({ data: null, error: { code, message: `Mensagem ${code}.` } });
      expect(await definirConfig3d(ORG, "produto", PROD, { eixos: null, ligacoes: null })).toMatchObject({ ok: false, erro: `Mensagem ${code}.`, codigo: code });
    }
    base.responder = () => ({ data: null, error: { code: "XX000", message: "internal error" } });
    const r = await definirConfig3d(ORG, "produto", PROD, { eixos: null, ligacoes: null });
    expect(r.ok === false && r.erro).toMatch(/Não foi possível/);
  });
  it("função em falta: «ainda não disponível»", async () => {
    base.responder = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await definirConfig3d(ORG, "produto", PROD, { eixos: null, ligacoes: null })).toMatchObject({ ok: false, indisponivel: true });
  });
});

describe("ligacoesDaConfig: de uma lista a «que atributo pinta que zonas» e aos pares excluídos", () => {
  it("uma ligação com «aplicar» pinta essa zona", () => {
    const r = ligacoesDaConfig([{ atributo: A1, zona: "frente", aplicar: true }, { atributo: A1, zona: "tampo", aplicar: true }]);
    expect(r.ligacoes).toEqual({ [A1]: ["frente", "tampo"] });
    expect(r.excluidos.size).toBe(0);
  });
  it("`tudo` expande a todas as zonas", () => {
    const r = ligacoesDaConfig([{ atributo: A1, zona: "tudo", aplicar: true }]);
    expect(r.ligacoes[A1]).toEqual(["frente", "corpo", "tampo", "puxadores", "pes", "estofo"]);
  });
  it("a zona explícita vence `tudo`: tudo menos a frente, ou só a frente quando o resto está desligado", () => {
    const menos = ligacoesDaConfig([{ atributo: A1, zona: "tudo", aplicar: true }, { atributo: A1, zona: "frente", aplicar: false }]);
    expect(menos.ligacoes[A1]).not.toContain("frente");
    expect(menos.ligacoes[A1]).toContain("corpo");
    expect(menos.excluidos.has(chaveDeExclusao(A1, "frente"))).toBe(true);
    const so = ligacoesDaConfig([{ atributo: A1, zona: "tudo", aplicar: false }, { atributo: A1, zona: "frente", aplicar: true }]);
    expect(so.ligacoes[A1]).toEqual(["frente"]);
    expect(so.excluidos.has(chaveDeExclusao(A1, "corpo"))).toBe(true);
    expect(so.excluidos.has(chaveDeExclusao(A1, "frente"))).toBe(false);
  });
  it("«aplicar: não» sem nenhum «sim» não liga o atributo (os nomes continuam a valer nas outras zonas), só o exclui dessa zona", () => {
    const r = ligacoesDaConfig([{ atributo: A2, zona: "corpo", aplicar: false }]);
    expect(r.ligacoes[A2]).toBeUndefined();
    expect([...r.excluidos]).toEqual([chaveDeExclusao(A2, "corpo")]);
  });
  it("sem lista (null): nada", () => {
    expect(ligacoesDaConfig(null)).toEqual({ ligacoes: {}, excluidos: new Set() });
  });
});

describe("mesmasLigacoes: as mesmas regras noutra ordem não são uma alteração", () => {
  const X: Ligacao = { atributo: A1, zona: "frente", aplicar: true }, Y: Ligacao = { atributo: A2, zona: "tudo", aplicar: false };
  it("a ordem não conta", () => {
    expect(mesmasLigacoes([X, Y], [Y, X])).toBe(true);
    expect(mesmasLigacoes([], [])).toBe(true);
  });
  it("um «aplicar» diferente, uma regra a mais ou uma zona diferente contam", () => {
    expect(mesmasLigacoes([X], [{ ...X, aplicar: false }])).toBe(false);
    expect(mesmasLigacoes([X], [X, Y])).toBe(false);
    expect(mesmasLigacoes([X], [{ ...X, zona: "corpo" }])).toBe(false);
  });
  it("uma regra repetida não se confunde com uma só (a lista inválida continua diferente)", () => {
    expect(mesmasLigacoes([X, X], [X])).toBe(false);
  });
});
