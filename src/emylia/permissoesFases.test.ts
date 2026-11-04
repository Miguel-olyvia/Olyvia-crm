// 3/11/2026 (20270105200000): as seis permissões por fase, exigidas no servidor, também no motor: cada ação recusada sem a permissão e
// permitida com ela; o quadro por papel igual ao neg_papeis_permissoes da migração; o espelho do portal (aplicarResposta) passa sem
// negocios.proposta.decidir; e a perda em /negocios grava-se pela neg_perder_negocio / neg_anular_perda.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { CODIGO_BASE, PERMS_PAPEL, SEM_PERM, definirPermissoesReais, podeNeg, type PermNeg } from "./permissoes";
import { CODIGOS_NEGOCIOS } from "./permissoesReais";
import { acoes, definirPerdaReal, faseDaPerda, permDoCampo, seed, type Aviso, type Estado, type Negocio, type Papel } from "./motor";
import { aplicarResposta, type RespostaCliente } from "./real/vistaCliente";
import { anularPerdaReal, mensagemDaPerda, perderNegocioReal } from "./real/perdaReal";

const NOVAS: PermNeg[] = ["contacto.registar", "visita.gerir", "proposta.decidir", "obra.imprevistos", "obra.fechar", "negocio.perder"];
const TODOS = Object.values(CODIGO_BASE);

afterEach(() => { definirPermissoesReais(null); definirPerdaReal(null); rpc.mockReset(); });

/** Um Estado do exemplo com as ações e os avisos à vista. `negadas`: as permissões que a conta real NÃO tem (as outras tem). */
function montar(negadas: PermNeg[] = []) {
  const S = seed();
  const avisos: Aviso[] = [];
  const A = acoes(S, (a) => avisos.push(a), (fn) => fn());
  definirPermissoesReais({ codigos: new Set(TODOS.filter((c) => !negadas.some((p) => CODIGO_BASE[p] === c))), simular: false });
  return { S, A, avisos };
}
const recusou = (avisos: Aviso[], p: PermNeg) => avisos.some((a) => a.msg === SEM_PERM[p].msg);
const algum = (S: Estado, f: (d: Negocio) => boolean = () => true): Negocio => S.deals.find(f) ?? S.deals[0];

describe("o quadro por papel bate com neg_papeis_permissoes (20270105200000)", () => {
  const ESPERADO: Record<Papel, PermNeg[]> = {
    comercial: ["contacto.registar", "visita.gerir", "proposta.decidir", "negocio.perder"],
    armazem: ["contacto.registar", "visita.gerir", "proposta.decidir", "negocio.perder"],
    financeiro: ["contacto.registar", "visita.gerir", "proposta.decidir", "negocio.perder"],
    juridico: ["contacto.registar", "visita.gerir", "proposta.decidir", "negocio.perder"],
    operacoes: NOVAS, direcao: NOVAS, tecnico: [],
  };
  it.each(Object.keys(ESPERADO) as Papel[])("%s", (papel) => {
    expect(NOVAS.filter((p) => podeNeg(papel, p))).toEqual(NOVAS.filter((p) => ESPERADO[papel].includes(p)));
  });
  it("os códigos são os da base, e a leitura das permissões pergunta-os", () => {
    expect(NOVAS.map((p) => CODIGO_BASE[p])).toEqual([
      "negocios.contacto.registar", "negocios.visita.gerir", "negocios.proposta.decidir", "negocios.obra.imprevistos", "negocios.obra.fechar", "negocios.perder",
    ]);
    NOVAS.forEach((p) => expect(CODIGOS_NEGOCIOS).toContain(CODIGO_BASE[p]));
    NOVAS.forEach((p) => expect(SEM_PERM[p].sub).toContain(CODIGO_BASE[p]));
  });
  it("o técnico do protótipo (sem conta) não regista o contacto nem fecha a obra; o comercial não encerra a obra", () => {
    expect(PERMS_PAPEL.tecnico).toEqual(["obra.executar", "obra.materiais"]); // 4/11: o técnico regista a execução e vê os materiais da obra (neg_papeis_permissoes)
    expect(podeNeg("comercial", "obra.fechar")).toBe(false);
    expect(podeNeg("operacoes", "obra.fechar")).toBe(true);
  });
});

describe("permDoCampo: a permissão de cada resposta, como fn_neg_marcas_permissoes", () => {
  it("contacto, visita e as outras", () => {
    ["resultado", "tentativas", "religar"].forEach((k) => expect(permDoCampo(k)).toBe("contacto.registar"));
    ["v1_estado", "v12_quem", "diag_humidade", "div_cozinha_diag_bancada"].forEach((k) => expect(permDoCampo(k)).toBe("visita.gerir"));
    ["notas", "morada", "pagamento", "nif_fat", "div_cozinha_medida", "visita", "diagnostico"].forEach((k) => expect(permDoCampo(k)).toBeNull());
  });
});

/** Cada ação: a permissão que pede e como chamá-la (num Estado já normalizado). */
type Caso = [string, PermNeg, (A: ReturnType<typeof acoes>, S: Estado) => unknown];
const CASOS: Caso[] = [
  ["contactar", "contacto.registar", (A, S) => A.contactar(algum(S, (d) => d.fase === 0).id)],
  ["campo resultado", "contacto.registar", (A, S) => A.campo(algum(S).id, "resultado", "Não atendeu")],
  ["campo tentativas", "contacto.registar", (A, S) => A.campo(algum(S).id, "tentativas", "3")],
  ["campo religar", "contacto.registar", (A, S) => A.campo(algum(S).id, "religar", "2026-11-10")],
  ["confirmar resultado", "contacto.registar", (A, S) => A.confirmar(algum(S).id, ["resultado"])],
  ["marcarVisita", "visita.gerir", (A, S) => A.marcarVisita(algum(S, (d) => d.fase === 1).id)],
  ["fecharVisita", "visita.gerir", (A, S) => A.fecharVisita(algum(S, (d) => d.fase === 2).id)],
  ["reabrirVisita", "visita.gerir", (A, S) => A.reabrirVisita(algum(S, (d) => d.fase === 3 && !!d.orc && !d.orc.enviada).id)],
  ["desistirVisita", "visita.gerir", (A, S) => A.desistirVisita(algum(S).id)],
  ["novaVisita", "visita.gerir", (A, S) => A.novaVisita(algum(S).id)],
  ["cancelarVisita", "visita.gerir", (A, S) => A.cancelarVisita(algum(S).id, 1)],
  ["apagarVisita", "visita.gerir", (A, S) => A.apagarVisita(algum(S).id, 1)],
  ["campo v1_", "visita.gerir", (A, S) => A.campo(algum(S).id, "v1_estado", "Feita")],
  ["campo diag_", "visita.gerir", (A, S) => A.campo(algum(S).id, "diag_humidade", "Sim")],
  ["campo div_*_diag_", "visita.gerir", (A, S) => A.campo(algum(S).id, "div_cozinha_diag_humidade", "Sim")],
  ["confirmar diag_", "visita.gerir", (A, S) => A.confirmar(algum(S).id, ["diag_humidade"])],
  ["foto", "visita.gerir", (A, S) => A.foto(algum(S).id)],
  ["proporImprevisto", "obra.imprevistos", (A, S) => A.proporImprevisto(comImprevisto(S).id, "IMP-T", [], [])],
  ["decidirImprevisto", "obra.imprevistos", (A, S) => A.decidirImprevisto(comImprevisto(S).id, "IMP-T", "seguir")],
  ["fimObra", "obra.fechar", (A, S) => A.fimObra(algum(S, (d) => d.obra.plano?.estado === "em curso").id)],
  ["enviarAuto", "obra.fechar", (A, S) => A.enviarAuto(algum(S).id)],
  ["simularAuto", "obra.fechar", (A, S) => A.simularAuto(algum(S).id)],
  ["simularAceitarAdenda", "proposta.decidir", (A, S) => A.simularAceitarAdenda(comAdenda(S, "enviada").id, "A1")],
  ["simularAlteracoesAdenda", "proposta.decidir", (A, S) => A.simularAlteracoesAdenda(comAdenda(S, "enviada").id, "A1")],
  ["simularAdenda", "proposta.decidir", (A, S) => A.simularAdenda(comAdenda(S, "aceite", "enviado").id, "A1")],
  ["perderSim", "negocio.perder", (A, S) => A.perderSim(algum(S, (d) => d.fase < 4 && !d.perdido).id, "Preço")],
];

function comImprevisto(S: Estado): Negocio {
  const d = algum(S, (x) => !!x.obra.plano) ;
  d.obra.plano ??= { tasks: [{ nome: "Canalização", svcs: ["canal"], dia: 0, dur: 1, sk: "Canalizador", h: 8, tec: null }], estado: "em curso", dia: 0 };
  if (!d.obra.imprevistos?.some((i) => i.id === "IMP-T")) {
    (d.obra.imprevistos ??= []).push({ id: "IMP-T", q: "hoje", dia: 0, quem: "Hugo", texto: "Cano roto", onde: "", grav: "impede", tarefas: [], estado: "aberto" } as never);
  }
  return d;
}
function comAdenda(S: Estado, estado: string, contrato?: string): Negocio {
  const d = algum(S, (x) => !!x.orc);
  if (!d.adendas?.some((a) => a.n === "A1")) {
    d.adendas = [{ n: "A1", estado, criada: "01/11", enviada: "02/11", contrato: contrato ?? null, linhas: [] } as unknown as NonNullable<Negocio["adendas"]>[number]];
  }
  return d;
}

describe("o motor pede as permissões novas nos pontos de entrada", () => {
  it.each(CASOS)("%s: sem a permissão, avisa e não muda nada", (_nome, p, fazer) => {
    const { S, A, avisos } = montar([p]);
    fazer(A, S); // a primeira chamada prepara o negócio do caso (imprevisto, adenda) e o motor normaliza a visita
    avisos.length = 0;
    const antes = JSON.stringify(S.deals);
    const r = fazer(A, S);
    expect(recusou(avisos, p)).toBe(true);
    expect(JSON.stringify(S.deals)).toBe(antes);
    if (_nome === "novaVisita") expect(r).toBeNull();
  });
  it.each(CASOS)("%s: com a permissão, não é recusada por ela", (_nome, p, fazer) => {
    const { S, A, avisos } = montar();
    fazer(A, S);
    expect(recusou(avisos, p)).toBe(false);
  });

  it("com a permissão, o campo do contacto e da visita grava-se e a visita nova nasce", () => {
    const { S, A } = montar();
    const d = algum(S);
    A.campo(d.id, "resultado", "Não atendeu");
    A.campo(d.id, "diag_humidade", "Sim");
    expect(d.f.resultado).toBe("Não atendeu");
    expect(d.f.diag_humidade).toBe("Sim");
    expect(typeof A.novaVisita(d.id)).toBe("number");
  });
  it("as outras respostas não pedem nenhuma das seis", () => {
    const { S, A, avisos } = montar(NOVAS);
    const d = algum(S);
    A.campo(d.id, "notas_cliente", "ligar de manhã");
    expect(d.f.notas_cliente).toBe("ligar de manhã");
    expect(avisos.filter((a) => NOVAS.some((p) => a.msg === SEM_PERM[p].msg))).toEqual([]);
  });
  it("proporImprevisto deixou de ser por papel: o comercial sem negocios.obra.imprevistos é recusado; um técnico com ela passa", () => {
    definirPermissoesReais(null);
    const S = seed(); const avisos: Aviso[] = []; const A = acoes(S, (a) => avisos.push(a), (fn) => fn());
    const d = comImprevisto(S);
    S.role = "comercial";
    A.proporImprevisto(d.id, "IMP-T", [], []);
    expect(recusou(avisos, "obra.imprevistos")).toBe(true);
    avisos.length = 0;
    S.role = "tecnico";
    definirPermissoesReais({ codigos: new Set(["negocios.obra.imprevistos"]), simular: false });
    A.proporImprevisto(d.id, "IMP-T", [], []);
    expect(recusou(avisos, "obra.imprevistos")).toBe(false);
    expect(avisos.map((a) => a.msg)).not.toContain("Quem propõe é o gestor da obra");
  });
  it("registar um imprevisto não pede negocios.obra.imprevistos (o servidor também não)", () => {
    const { S, A, avisos } = montar(["obra.imprevistos"]);
    const d = algum(S);
    d.obra.plano = { tasks: [{ nome: "Canalização", svcs: ["canal"], dia: 0, dur: 1, sk: "Canalizador", h: 8, tec: null }], estado: "em curso", dia: 0 };
    S.role = "operacoes";
    expect(A.registarImprevisto(d.id, { texto: "Cano roto", onde: "", grav: "atrasa", tarefas: [0], dias: 1 })).toBeTruthy();
    expect(recusou(avisos, "obra.imprevistos")).toBe(false);
  });
  it("o «Anular» da perda pede negocios.perder", () => {
    const { S, A, avisos } = montar();
    const d = algum(S, (x) => x.fase < 4 && !x.perdido);
    A.perderSim(d.id, "Preço");
    const anular = avisos.find((a) => a.act?.label === "Anular")!;
    definirPermissoesReais({ codigos: new Set(), simular: false });
    anular.act!.fn();
    expect(d.perdido).toBe(true);
    expect(recusou(avisos, "negocio.perder")).toBe(true);
    definirPermissoesReais({ codigos: new Set(["negocios.perder"]), simular: false });
    anular.act!.fn();
    expect(d.perdido).toBe(false);
  });
});

describe("o espelho do portal (aplicarResposta) não pede negocios.proposta.decidir", () => {
  const resp = (o: Partial<RespostaCliente>): RespostaCliente => ({ id: "r1", negocio: "u", tipo: "pagamento", ref: "", nome: "Ana", telemovel: null, em: "2026-11-21T10:30:00Z", assinatura: null, dados: {}, ...o });
  const semNada = (estado: string, contrato?: string) => {
    const S = seed(); const avisos: Aviso[] = [];
    const A = acoes(S, (a) => avisos.push(a), (fn) => fn());
    definirPermissoesReais({ codigos: new Set(), simular: false });
    return { d: comAdenda(S, estado, contrato), A, avisos };
  };
  it("aceitar, pedir alterações, recusar e assinar a adenda, sem nenhuma permissão", () => {
    let x = semNada("enviada");
    expect(aplicarResposta(x.d, x.A, resp({ tipo: "adenda_aceitar", ref: "A1" }))).toBe(true);
    expect(x.d.adendas![0].estado).toBe("aceite");
    x = semNada("enviada");
    aplicarResposta(x.d, x.A, resp({ tipo: "adenda_alterar", ref: "A1", dados: { nota: "mais barato", motivos: ["Baixar o preço"] } }));
    expect(x.d.adendas![0].pedidoCliente?.motivos).toEqual(["Baixar o preço"]);
    x = semNada("enviada");
    aplicarResposta(x.d, x.A, resp({ tipo: "adenda_recusar", ref: "A1", dados: { motivo: "caro" } }));
    expect(x.d.adendas![0].estado).toBe("recusada");
    x = semNada("aceite", "enviado");
    aplicarResposta(x.d, x.A, resp({ tipo: "adenda_assinar", ref: "A1", assinatura: "SMS-123", telemovel: "+351 ••• 676" }));
    expect(x.d.adendas![0].assinatura?.tipo).toBe("sms");
    expect(recusou(x.avisos, "proposta.decidir")).toBe(false);
  });
});

describe("a perda em /negocios grava-se na base (neg_perder_negocio / neg_anular_perda)", () => {
  beforeEach(() => { rpc.mockResolvedValue({ data: { mudou: true, estado: "perdido" }, error: null }); });

  it("perderNegocioReal e anularPerdaReal chamam as funções com os parâmetros da migração", async () => {
    await expect(perderNegocioReal("uuid-1", "orcamento", "  Preço  ")).resolves.toEqual({ mudou: true });
    expect(rpc).toHaveBeenCalledWith("neg_perder_negocio", { p_negocio_id: "uuid-1", p_fase: "orcamento", p_motivo: "Preço" });
    await anularPerdaReal("uuid-1", "Perda anulada");
    expect(rpc).toHaveBeenCalledWith("neg_anular_perda", { p_negocio_id: "uuid-1", p_motivo_reabertura: "Perda anulada" });
  });
  it("a recusa da base (sem negocios.perder) chega como erro", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Sem permissão (negocios.perder): não pode dar o negócio como perdido." } });
    const erro = await perderNegocioReal("uuid-1", "lead", "x").then(() => null, (e: unknown) => e);
    expect(erro).toBeTruthy();
    expect(mensagemDaPerda(erro)).toMatch(/negocios\.perder/);
  });
  it("perderSim passa à ligação real a fase da base e o motivo; o «Anular» também", async () => {
    const { S, A, avisos } = montar();
    const chamadas: string[] = [];
    definirPerdaReal({
      perder: (d, fase, motivo) => { chamadas.push("perder"); void perderNegocioReal(`uuid-${d.id}`, fase, motivo); },
      anular: (d, razao) => { chamadas.push("anular"); void anularPerdaReal(`uuid-${d.id}`, razao); },
    });
    const d = algum(S, (x) => x.fase < 4 && !x.perdido);
    const fase = faseDaPerda(d);
    A.perderSim(d.id, "Escolheu outra empresa");
    expect(d.perdido).toBe(true);
    expect(d.motivoPerda).toBe("Escolheu outra empresa");
    expect(rpc).toHaveBeenCalledWith("neg_perder_negocio", { p_negocio_id: `uuid-${d.id}`, p_fase: fase, p_motivo: "Escolheu outra empresa" });
    avisos.find((a) => a.act?.label === "Anular")!.act!.fn();
    expect(d.perdido).toBe(false);
    expect(rpc).toHaveBeenCalledWith("neg_anular_perda", { p_negocio_id: `uuid-${d.id}`, p_motivo_reabertura: "Perda anulada" });
    expect(chamadas).toEqual(["perder", "anular"]);
  });
  it("sem a permissão, perderSim não chama a base", () => {
    const { S, A } = montar(["negocio.perder"]);
    const perder = vi.fn();
    definirPerdaReal({ perder, anular: vi.fn() });
    A.perderSim(algum(S, (x) => x.fase < 4 && !x.perdido).id, "Preço");
    expect(perder).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("faseDaPerda: a linguagem da base", () => {
    const S = seed(); const d = structuredClone(algum(S));
    d.fase = 0; expect(faseDaPerda(d)).toBe("lead");
    d.fase = 1; expect(faseDaPerda(d)).toBe("contacto");
    d.fase = 2; d.visita.fotos = 0; d.f = {}; expect(faseDaPerda(d)).toBe("visita");
    d.visita.fotos = 2; expect(faseDaPerda(d)).toBe("levantamento");
    d.fase = 3; d.orc = { ...(d.orc ?? {}), enviada: null } as Negocio["orc"]; expect(faseDaPerda(d)).toBe("orcamento");
    d.orc!.enviada = "hoje"; expect(faseDaPerda(d)).toBe("proposta");
  });
});
