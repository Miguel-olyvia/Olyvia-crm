// A agenda numa organização real (28/10): as ausências aprovadas no RH (rh_agenda_tecnicos) entram no plano (diaDeFerias) e na agenda,
// a equipa da agenda são os técnicos do RH e quem entrou, e o técnico da conta fica fixo no Hoje do técnico.
import { afterEach, describe, expect, it, vi } from "vitest";
import { diaDeFerias, seed, type Plano } from "../motor";
import { ausenteNoRh, definirAusenciasRh, type FichaTecnico } from "../equipa/tecnicos";
import { definirRhDaAgenda, lerRhDaAgenda } from "../equipa/rhDaAgenda";
import { agendaVista } from "../equipa/pontes";
import { lerFrota } from "../frota/loja";
import { carregarAgendaReal, equipaReal, janelaAgenda, pessoasDaAgenda, tecnicoDaConta } from "./agendaReal";

const ORG = "11111111-1111-4111-a111-111111111111";
const ANA = "33333333-3333-4333-a333-333333333333";
const RUI = "44444444-4444-4444-a444-444444444444";
const tec = (id: string, n: string): FichaTecnico => ({ id, pessoaRhId: id, n, sk: "Canalizador", perfilId: "canalizador", ferias: [], custoHora: 20, tel: "", desde: "" });
const TECS = [tec(ANA, "Ana Sousa"), tec(RUI, "Rui Lopes")];

afterEach(() => { definirAusenciasRh({}); definirRhDaAgenda(null); });

describe("agenda real: as ausências do RH", () => {
  it("a janela cabe nos 400 dias da função", () => {
    const { de, ate } = janelaAgenda(new Date("2026-10-28T12:00:00"));
    expect(de).toBe("2026-09-28");
    expect(ate).toBe("2027-10-28");
  });

  it("lê a rh_agenda_tecnicos da organização e põe as ausências no plano e na agenda", async () => {
    const rpc = vi.fn(async () => ({ data: [
      { pessoa_id: ANA, nome: "Ana Sousa", tarefas: [], indisponivel: [{ data: "2026-11-03", fraccao: 1 }, { data: "2026-11-03", fraccao: 1 }, { data: "2026-11-02", fraccao: 0.5 }] },
      { pessoa_id: RUI, nome: "Rui Lopes", tarefas: [], indisponivel: [] },
    ], error: null }));
    const r = await carregarAgendaReal({ rpc } as never, ORG, new Date("2026-10-28T12:00:00"));
    expect(rpc).toHaveBeenCalledWith("rh_agenda_tecnicos", { p_org: ORG, p_de: "2026-09-28", p_ate: "2027-10-28" });
    expect(r.erro).toBeNull();
    expect(r.pessoas.find((p) => p.id === ANA)!.ausencias).toEqual(["2026-11-02", "2026-11-03"]);
    expect(ausenteNoRh(ANA, "2026-11-03")).toBe(true);
    expect(ausenteNoRh(ANA, "2026-11-04")).toBe(false);
    expect(ausenteNoRh(RUI, "2026-11-03")).toBe(false);
    expect(lerRhDaAgenda()!.fichas[ANA]).toBeTruthy();
  });

  it("com erro (sem permissão), fica sem ausências e nunca com as de exemplo", async () => {
    definirAusenciasRh({ [ANA]: { "2026-11-03": "Férias" } });
    const rpc = async () => ({ data: null, error: { message: "Sem permissão (pessoas.view ou hr.pessoas.laborais.view)." } });
    const r = await carregarAgendaReal({ rpc } as never, ORG);
    expect(r.erro).toMatch(/Sem permissão/);
    expect(ausenteNoRh(ANA, "2026-11-03")).toBe(false);
    expect(lerRhDaAgenda()!.ordem).toEqual([]);
  });

  it("um técnico ausente no RH dá conflito no plano do orçamento (diaDeFerias)", () => {
    definirAusenciasRh({ [ANA]: { "2026-11-03": "Ausência aprovada no RH" } });
    // plano do orçamento a começar segunda, 2 de novembro: o dia 1 é terça, 3
    const p = { origem: "orcamento", inicio: "2026-11-02", tasks: [], estado: "por aprovar", dia: 0 } as unknown as Plano;
    expect(diaDeFerias(TECS[0], p, 0, 1)).toBeNull();
    expect(diaDeFerias(TECS[0], p, 0, 3)).toBe(1);
    expect(diaDeFerias(TECS[1], p, 0, 3)).toBeNull();
  });
});

describe("agenda real: a equipa", () => {
  it("quem entrou sem ser técnico entra com o papel do A ver como; os técnicos ligam-se a si próprios", () => {
    const R = equipaReal(TECS, { pessoaId: null, nome: "Rúben Carvalho" }, "comercial");
    expect(R.eu).toBe("conta");
    expect(R.membros.map((m) => [m.nome, m.papel, m.ref])).toEqual([["Rúben Carvalho", "comercial", null], ["Ana Sousa", "tecnico", ANA], ["Rui Lopes", "tecnico", RUI]]);
    expect(equipaReal(TECS, { pessoaId: null, nome: "Rúben Carvalho" }, "direcao").membros[0]).toMatchObject({ papel: "direcao", papelNome: "Direção" });
  });

  it("quem entrou e é técnico é o membro desse técnico (não se duplica) e fica fixo no Hoje do técnico", () => {
    const R = equipaReal(TECS, { pessoaId: RUI, nome: "Rui Lopes" }, "tecnico");
    expect(R.eu).toBe(RUI);
    expect(R.membros).toHaveLength(2);
    expect(tecnicoDaConta(TECS, { pessoaId: RUI, nome: "Rui Lopes" })).toBe(RUI);
    expect(tecnicoDaConta(TECS, { pessoaId: "outra", nome: "X" })).toBeNull();
    expect(tecnicoDaConta(TECS, null)).toBeNull();
  });

  it("a agenda do técnico mostra a ausência do RH no dia certo e a pessoa real (não as de exemplo)", () => {
    definirRhDaAgenda(pessoasDaAgenda([{ pessoa_id: ANA, nome: "Ana Sousa", indisponivel: [{ data: "2026-11-03" }] }, { pessoa_id: RUI, nome: "Rui Lopes", indisponivel: [] }]));
    const S = seed();
    S.deals = []; S.tecnicos = TECS;
    const R = equipaReal(TECS, { pessoaId: null, nome: "Rúben Carvalho" }, "operacoes");
    const dias = ["2026-11-02", "2026-11-03", "2026-11-04"];
    const v = agendaVista({ deals: [], tecnicos: TECS, frota: lerFrota(), rh: lerRhDaAgenda()! }, S, R, "minha", dias, ANA);
    expect(v.real).toBe(true);
    expect(v.linhas).toHaveLength(1);
    expect(v.linhas[0].nome).toBe("Ana Sousa");
    const dia = (d: string) => v.linhas[0].celulas.find((c) => c.data === d)!;
    expect(dia("2026-11-03").itens.map((x) => x.tipo)).toContain("ausencia");
    expect(dia("2026-11-02").itens.some((x) => x.tipo === "ausencia" || x.tipo === "ferias")).toBe(false);
  });

  it("a agenda da equipa (Operações) tem os técnicos do RH e quem entrou, e nenhuma pessoa de exemplo", () => {
    definirRhDaAgenda(pessoasDaAgenda([{ pessoa_id: ANA, nome: "Ana Sousa" }, { pessoa_id: RUI, nome: "Rui Lopes" }]));
    const S = seed();
    S.deals = []; S.tecnicos = TECS; S.role = "operacoes";
    const R = equipaReal(TECS, { pessoaId: null, nome: "Rúben Carvalho" }, "operacoes");
    const v = agendaVista({ deals: [], tecnicos: TECS, frota: lerFrota(), rh: lerRhDaAgenda()! }, S, R, "equipa", ["2026-11-02"]);
    expect(v.linhas.map((l) => l.nome)).toEqual(["Rúben Carvalho", "Ana Sousa", "Rui Lopes"]);
  });
});
