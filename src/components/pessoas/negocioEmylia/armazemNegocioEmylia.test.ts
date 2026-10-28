import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seed, type Negocio } from "@/emylia/motor";

const m = vi.hoisted(() => ({
  carregarCatalogo: vi.fn(),
  lerNegocios: vi.fn(),
  gravarMudancas: vi.fn(),
  deLinhas: vi.fn(),
}));
vi.mock("@/emylia/real/carregarCatalogo", () => ({ carregarCatalogo: m.carregarCatalogo }));
// 20261231999000: o negócio monta-se com negocioDoLido (as linhas e a obra); aqui, só as linhas, como antes
vi.mock("@/emylia/real/negocioBase", () => ({ idsServico: () => ({ paraId: new Map(), paraChave: new Map() }), lerNegocios: m.lerNegocios,
  negocioDoLido: (n: { linhas: unknown }) => m.deLinhas(n.linhas) }));
vi.mock("@/emylia/real/negocioReal", () => ({ deLinhas: m.deLinhas, garantirServicosDosNegocios: vi.fn() }));
// a marca é só o que o teste muda (id, fase, nome); negociosMudados faz o mesmo que o verdadeiro: o que difere da fotografia
const { marca } = vi.hoisted(() => ({ marca: (d: { id: number; fase: number; nome: string }): string => JSON.stringify([d.id, d.fase, d.nome]) }));
vi.mock("@/emylia/real/sincronizarNegocios", () => ({
  fotografarNegocios: (deals: Negocio[]) => new Map(deals.map((d) => [d.id, marca(d)])),
  marcaNegocio: marca,
  negociosMudados: (deals: Negocio[], foto: Map<number, string>) => deals.filter((d) => foto.get(d.id) !== marca(d)),
  gravarMudancas: m.gravarMudancas,
}));

import { obterArmazem, reporArmazens } from "./armazemNegocioEmylia";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const sb = {} as SupabaseClient;
const dealFase4 = (): Negocio => ({ ...structuredClone(seed().deals[0]), id: 1001, fase: 4 });
const esperar = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  reporArmazens();
  m.carregarCatalogo.mockResolvedValue({ M: { ids: { servico: new Map() } } });
  m.lerNegocios.mockResolvedValue([{ id: "uuid-1", entityId: "e1", linhas: { negocio: { numero: 1001 } } }]);
  m.deLinhas.mockImplementation(dealFase4);
  m.gravarMudancas.mockResolvedValue({ gravados: 1, erros: [], avisos: [] });
});
afterEach(() => { vi.clearAllMocks(); });

describe("armazemNegocioEmylia", () => {
  it("lê o catálogo e os negócios uma vez e encontra o negócio pelo id da base", async () => {
    const a = obterArmazem(sb, ORG);
    expect(a.leitura().k).toBe("a-ler");
    await esperar();
    expect(a.leitura().k).toBe("pronto");
    expect(a.negocioDaBase("uuid-1")?.id).toBe(1001);
    expect(a.negocioDaBase("outro")).toBeUndefined();
    expect(obterArmazem(sb, ORG)).toBe(a);
    expect(m.lerNegocios).toHaveBeenCalledTimes(1);
    expect(m.lerNegocios.mock.calls[0][1]).toBe(ORG);
  });

  it("o estado é de uma organização real: sem stock nem técnicos de exemplo", () => {
    const a = obterArmazem(sb, ORG);
    expect(a.S.semExemplos).toBe(true);
    expect(a.S.tecnicos).toEqual([]);
    expect(Object.values(a.S.stock).every((v) => v === 0)).toBe(true);
  });

  it("um erro de leitura fica à vista e reler tenta outra vez", async () => {
    m.lerNegocios.mockRejectedValueOnce(new Error("sem rede"));
    const a = obterArmazem(sb, ORG);
    await esperar();
    expect(a.leitura()).toEqual({ k: "erro", t: "sem rede" });
    a.reler();
    await esperar();
    expect(a.leitura().k).toBe("pronto");
  });

  it("uma ação grava por gravarMudancas e avisa o Pipeline no fim", async () => {
    const a = obterArmazem(sb, ORG);
    await esperar();
    const gravado = vi.fn();
    a.aoGravar(gravado);
    a.run(() => undefined);
    await esperar();
    expect(m.gravarMudancas).toHaveBeenCalledTimes(1);
    expect(m.gravarMudancas.mock.calls[0][1]).toBe(ORG);
    expect(a.gravacao()).toEqual({ k: "gravado", n: 1 });
    expect(gravado).toHaveBeenCalledTimes(1);
  });

  it("um erro de gravação nunca é engolido: estado e aviso", async () => {
    m.gravarMudancas.mockResolvedValueOnce({ gravados: 0, erros: ["João: RLS"], avisos: [] });
    const a = obterArmazem(sb, ORG);
    await esperar();
    const gravado = vi.fn();
    a.aoGravar(gravado);
    a.run(() => undefined);
    await esperar();
    expect(a.gravacao()).toEqual({ k: "erro", t: "João: RLS" });
    expect(a.avisos().some((x) => x.kind === "bad")).toBe(true);
    expect(gravado).not.toHaveBeenCalled();
  });

  it("uma exceção inesperada da gravação também fica à vista", async () => {
    m.gravarMudancas.mockRejectedValueOnce(new Error("explodiu"));
    const a = obterArmazem(sb, ORG);
    await esperar();
    a.run(() => undefined);
    await esperar();
    expect(a.gravacao()).toEqual({ k: "erro", t: "explodiu" });
    expect(a.aGravar()).toBe(false);
  });

  it("uma mudança durante a gravação volta a gravar no fim, sem corridas", async () => {
    let solta: (v: unknown) => void = () => undefined;
    m.gravarMudancas.mockImplementationOnce(() => new Promise((r) => { solta = r; }));
    const a = obterArmazem(sb, ORG);
    await esperar();
    a.run(() => undefined);
    a.run(() => undefined);
    await esperar(); // a verificação antes de gravar (relê se há algo por gravar) é assíncrona
    expect(m.gravarMudancas).toHaveBeenCalledTimes(1);
    expect(a.aGravar()).toBe(true);
    solta({ gravados: 1, erros: [], avisos: [] });
    await esperar(); await esperar();
    expect(m.gravarMudancas).toHaveBeenCalledTimes(2);
  });

  it("a gravação continua com o armazém, mesmo sem ninguém a ouvir (a ficha fechou)", async () => {
    const a = obterArmazem(sb, ORG);
    await esperar();
    const sair = a.subscrever(() => undefined);
    a.run(() => undefined);
    sair();
    await esperar();
    expect(a.gravacao()).toEqual({ k: "gravado", n: 1 });
  });

  it("organizações diferentes têm armazéns diferentes", () => {
    expect(obterArmazem(sb, ORG)).not.toBe(obterArmazem(sb, "outra-org"));
  });

  it("um negócio com documentos do CRM é só de leitura: diz-se e nunca vai a gravarMudancas (a base recusa-o, NE005)", async () => {
    m.lerNegocios.mockResolvedValue([
      { id: "uuid-1", entityId: "e1", docsCrm: false, linhas: { negocio: { numero: 1001 } } },
      { id: "uuid-2", entityId: "e2", docsCrm: true, linhas: { negocio: { numero: 1002 } } },
    ]);
    const a = obterArmazem(sb, ORG);
    await esperar();
    expect(a.docsCrm("uuid-1")).toBe(false);
    expect(a.docsCrm("uuid-2")).toBe(true);
    expect(a.docsCrm("desconhecido")).toBe(false);
    a.run(() => undefined);
    await esperar();
    const soLeitura = m.gravarMudancas.mock.calls[0][6] as ReadonlySet<number>;
    expect([...soLeitura]).toEqual([1002]);
  });

  it("um só de leitura que mudou em memória volta à cópia lida e diz-se (não fica o ecrã a mentir)", async () => {
    m.lerNegocios.mockResolvedValue([{ id: "uuid-1", entityId: "e1", docsCrm: true, linhas: { negocio: { numero: 1001 } } }]);
    const a = obterArmazem(sb, ORG);
    await esperar();
    const nomeLido = a.S.deals[0].nome;
    a.run(() => { a.S.deals[0].nome = "Alterado à mão"; });
    await esperar();
    expect(a.S.deals[0].nome).toBe(nomeLido);
    expect(a.avisos().some((x) => x.kind === "bad" && /CRM/.test(x.msg))).toBe(true);
  });

  it("não grava por cima de um negócio que mudou na base: relê, diz-se e não chama gravarMudancas", async () => {
    const a = obterArmazem(sb, ORG);
    await esperar();
    m.deLinhas.mockImplementation(() => ({ ...dealFase4(), fase: 5 })); // a base já tem a fase 5
    a.run(() => { a.S.deals[0].nome = "Alterado aqui"; });
    await esperar(); await esperar();
    expect(m.gravarMudancas).not.toHaveBeenCalled();
    expect(a.gravacao().k).toBe("erro");
    expect((a.gravacao() as { t: string }).t).toMatch(/mudou noutro sítio/);
    expect(a.S.deals[0].fase).toBe(5);
    expect(a.avisos().some((x) => x.kind === "bad")).toBe(true);
  });

  it("não relê com alterações por gravar, e diz porquê", async () => {
    const a = obterArmazem(sb, ORG);
    await esperar();
    a.S.deals[0].nome = "Por gravar";
    expect(a.porGravar()).toBe(true);
    expect(a.reler()).toBe(false);
    expect(m.lerNegocios).toHaveBeenCalledTimes(1);
    expect(a.avisos().some((x) => /por gravar/i.test(x.msg))).toBe(true);
  });

  it("atualizar: não repete a leitura acabada de fazer; mais tarde relê sem esconder o que está à vista; um erro diz-se", async () => {
    const a = obterArmazem(sb, ORG);
    await esperar();
    a.atualizar();
    expect(m.lerNegocios).toHaveBeenCalledTimes(1);
    const agora = Date.now();
    const relogio = vi.spyOn(Date, "now").mockReturnValue(agora + 60_000);
    a.atualizar();
    expect(a.leitura().k).toBe("pronto");
    await esperar();
    expect(m.lerNegocios).toHaveBeenCalledTimes(2);
    m.lerNegocios.mockRejectedValueOnce(new Error("sem rede"));
    relogio.mockReturnValue(agora + 120_000);
    a.atualizar();
    await esperar();
    expect(a.leitura().k).toBe("pronto");
    expect(a.avisos().some((x) => x.kind === "bad" && /atualizar/.test(x.msg))).toBe(true);
    relogio.mockRestore();
  });

  it("negociosLidos dá os negócios da MESMA leitura (id da base, pessoa e negócio), os mais recentes primeiro", async () => {
    m.lerNegocios.mockResolvedValue([
      { id: "uuid-1", entityId: "e1", docsCrm: false, linhas: { negocio: { numero: 1001 } } },
      { id: "uuid-2", entityId: "e2", docsCrm: false, linhas: { negocio: { numero: 1002 } } },
    ]);
    m.deLinhas.mockImplementation((l: { negocio: { numero: number } }) => ({ ...dealFase4(), id: l.negocio.numero }));
    const a = obterArmazem(sb, ORG);
    await esperar();
    expect(a.negociosLidos().map((n) => [n.id, n.entityId, n.d.id])).toEqual([["uuid-2", "e2", 1002], ["uuid-1", "e1", 1001]]);
    expect(m.lerNegocios).toHaveBeenCalledTimes(1);
  });

  it("outro utilizador não herda o armazém do anterior", () => {
    const u1 = obterArmazem(sb, ORG, "u1");
    expect(obterArmazem(sb, ORG, "u1")).toBe(u1);
    const u2 = obterArmazem(sb, ORG, "u2");
    expect(u2).not.toBe(u1);
    expect(obterArmazem(sb, ORG, "u2")).toBe(u2);
  });

  it("o negócio que a organização não devolveu não tem fluxo nem documentos do CRM", async () => {
    const a = obterArmazem(sb, ORG);
    await esperar();
    expect(a.docsCrm("uuid-1")).toBe(false);
    expect(a.negocioDaBase("nao-existe")).toBeUndefined();
  });
});
