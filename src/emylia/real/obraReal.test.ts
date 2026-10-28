// A obra do negócio ↔ a base (20261231999000): o que vai para obra_guardar_negocio, o que volta de obra_ler_negocios e quando se grava.
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seed, type Negocio, type Plano } from "../motor";
import { obraDaBase, obraVazia, paraObra } from "./obraReal";
import { paraLinhas } from "./negocioReal";
import { lerNegocios, negocioDoLido, type IdsServico } from "./negocioBase";
import { fotografarNegocios, gravarMudancas, obraMudou } from "./sincronizarNegocios";

const HOJE = new Date(2026, 9, 28, 10, 0);
const SF = "11111111-2222-3333-4444-555555555555";
const plano = (o: Partial<Plano> = {}): Plano => ({
  estado: "aprovado", dia: 0, origem: "orcamento", inicio: "2026-11-02",
  tasks: [
    { nome: "Demolição", svcs: [], dia: 0, dur: 1, sk: "Pedreiro", h: 8, tec: null, fase: 1 },
    { nome: "Revestimento de parede", svcs: [], dia: 1, dur: 2, sk: "Ladrilhador", perfilId: "ladrilhador", h: 32, tec: SF, fase: 3,
      exec: { estado: "feita", horas: 30, fotos: [] } },
    { nome: "Exemplo", svcs: [], dia: 3, dur: 1, sk: "Pintor", h: 4, tec: "t2", fase: 4 },
  ],
  ...o,
});
const negocio = (o: Partial<Negocio> = {}): Negocio => {
  const d = structuredClone(seed().deals[0]);
  return { ...d, servico: "WC Anabela", local: "Rua A 1, Sintra", ...o };
};

describe("paraObra", () => {
  it("sem plano: sem tarefas (a base não cria obra, ou cancela a que houver)", () => {
    const o = paraObra(negocio(), HOJE);
    expect(o.tarefas).toBeUndefined();
    expect(o.estado).toBe("planeada");
    expect(paraObra(negocio({ perdido: true }), HOJE).estado).toBe("cancelada");
  });

  it("com plano do orçamento: as datas reais, o ofício, o técnico do RH e a equipa", () => {
    const d = negocio();
    d.obra = { ...obraVazia(), plano: plano() };
    d.orc = { ...(d.orc ?? ({} as NonNullable<Negocio["orc"]>)), equipa: 2 };
    const o = paraObra(d, HOJE);
    expect(o.inicio).toBe("2026-11-02");
    expect(o.titulo).toBe("WC Anabela");
    expect(o.fases?.map((f) => f.ordem)).toEqual([1, 2, 3, 4]);
    expect(o.tarefas?.map((t) => t.chave)).toEqual(["t0", "t1", "t2"]);
    const t = o.tarefas![1];
    expect(t).toMatchObject({ nome: "Revestimento de parede", perfil: "ladrilhador", minutos: 1920, pessoas: 2, inicio: "2026-11-03", fim: "2026-11-04",
      estado: "feita", pessoa: SF, fase: 3 });
    // um técnico de exemplo (não é uma pessoa do RH) não vai como pessoa
    expect(o.tarefas![2].pessoa).toBeNull();
    expect(o.emylia).toBe(d.obra);
  });

  it("em curso e concluída", () => {
    const d = negocio();
    d.obra = { ...obraVazia(), plano: plano({ estado: "em curso" }) };
    expect(paraObra(d, HOJE).estado).toBe("em_curso");
    d.obra.plano!.estado = "concluída";
    expect(paraObra(d, HOJE).estado).toBe("concluida");
  });
});

describe("obraDaBase", () => {
  it("vazio dá a obra vazia; um estado antigo sem um campo fica com o vazio", () => {
    expect(obraDaBase(null)).toEqual(obraVazia());
    const o = obraDaBase({ plano: plano(), diario: [] });
    expect(o.plano?.tasks).toHaveLength(3);
    expect(o.mats).toBeNull();
    expect(o.aprendido).toBe(false);
  });
});

/** Um cliente falso: regista as chamadas e responde por função. */
function falso(resp: Record<string, { data?: unknown; error?: { code?: string; message?: string } | null }>) {
  const chamadas: { fn: string; args: Record<string, unknown> }[] = [];
  const sb = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => { chamadas.push({ fn, args }); return { data: null, error: null, ...resp[fn] }; }),
  } as unknown as SupabaseClient;
  return { sb, chamadas };
}
const IDS: IdsServico = { paraId: new Map(), paraChave: new Map() };

describe("gravar e ler a obra", () => {
  it("grava a obra só quando ela muda, depois do negócio, com os avisos da base", async () => {
    const S = seed();
    S.deals = [negocio({ id: 1001 })];
    const foto = fotografarNegocios(S.deals);
    const refs = new Map([[1001, { id: "neg-1", entityId: "ent-1" }]]);
    const { sb, chamadas } = falso({ obra_guardar_negocio: { data: { avisos: ["Revestimento: a pessoa atribuída não tem o ofício Ladrilhador no RH."] } } });

    let r = await gravarMudancas(sb, "org", S, refs, foto, IDS);
    expect(chamadas).toHaveLength(0);
    expect(r.gravados).toBe(0);

    S.deals[0].obra.plano = plano();
    expect(obraMudou(S.deals[0], foto)).toBe(true);
    r = await gravarMudancas(sb, "org", S, refs, foto, IDS);
    expect(chamadas.map((c) => c.fn)).toEqual(["obra_guardar_negocio"]);
    expect(chamadas[0].args.p_negocio_id).toBe("neg-1");
    expect((chamadas[0].args.p_obra as { tarefas: unknown[] }).tarefas).toHaveLength(3);
    expect(r.gravados).toBe(1);
    expect(r.avisos[0]).toContain("não tem o ofício Ladrilhador");

    r = await gravarMudancas(sb, "org", S, refs, foto, IDS);
    expect(chamadas).toHaveLength(1);
  });

  it("numa base sem a função (migration por aplicar) não dá erro", async () => {
    const S = seed();
    S.deals = [negocio({ id: 1001 })];
    const foto = fotografarNegocios(S.deals);
    S.deals[0].obra.plano = plano();
    const { sb } = falso({ obra_guardar_negocio: { error: { code: "PGRST202", message: "Could not find the function" } } });
    const r = await gravarMudancas(sb, "org", S, new Map([[1001, { id: "neg-1", entityId: "e" }]]), foto, IDS);
    expect(r.erros).toEqual([]);
  });

  it("um erro da base na obra aparece, com o nome do negócio", async () => {
    const S = seed();
    S.deals = [negocio({ id: 1001, nome: "Anabela" })];
    const foto = fotografarNegocios(S.deals);
    S.deals[0].obra.plano = plano();
    const { sb } = falso({ obra_guardar_negocio: { error: { code: "CT001", message: "Sem permissão (pessoas.edit)." } } });
    const r = await gravarMudancas(sb, "org", S, new Map([[1001, { id: "neg-1", entityId: "e" }]]), foto, IDS);
    expect(r.erros).toEqual(["Anabela (obra): Sem permissão (pessoas.edit)."]);
  });

  it("lerNegocios junta a obra; sem a função, lê os negócios na mesma", async () => {
    const linhas = { negocio: { id: "neg-1", entity_id: "e", estado_crm: "aberto", fluxo_emylia: true, numero: 1001 }, servicos: [], orcamentos: [], historico: [] };
    const com = falso({ neg_ler_negocios: { data: [linhas] }, obra_ler_negocios: { data: [{ negocio_id: "neg-1", emylia: { plano: plano() } }] } });
    const lidos = await lerNegocios(com.sb, "org", IDS);
    expect(lidos[0].obra?.plano?.tasks).toHaveLength(3);
    const sem = falso({ neg_ler_negocios: { data: [linhas] }, obra_ler_negocios: { error: { code: "PGRST202" } } });
    const lidos2 = await lerNegocios(sem.sb, "org", IDS);
    expect(lidos2[0].obra).toBeUndefined();
    const falha = falso({ neg_ler_negocios: { data: [linhas] }, obra_ler_negocios: { error: { code: "CT001", message: "Sem permissão (pessoas.view)." } } });
    await expect(lerNegocios(falha.sb, "org", IDS)).rejects.toThrow("Sem permissão");
  });

  it("negocioDoLido põe a obra lida no negócio; sem obra, fica a vazia", () => {
    const linhas = paraLinhas(negocio({ id: 1001 }), HOJE);
    const obra = obraDaBase({ plano: plano() });
    const lido = { id: "neg-1", entityId: "e", estadoCrm: "aberto", fluxoEmylia: true, docsCrm: false, linhas };
    expect(negocioDoLido({ ...lido, obra }).obra.plano?.tasks).toHaveLength(3);
    expect(negocioDoLido(lido).obra.plano).toBeNull();
  });
});
