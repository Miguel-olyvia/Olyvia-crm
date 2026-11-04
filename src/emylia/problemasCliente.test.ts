// 3/11 (Rúben): o cliente mostra um problema na conversa (com fotografias); o gestor de obra cria as tarefas, com os técnicos, e gera ou não
// orçamento (adenda). O cliente vê a decisão na conversa e fica tudo no histórico do negócio.
import { beforeEach, describe, expect, it } from "vitest";
import { esquecerInventario } from "./inventario/loja";
import { TECS, acoes, minhas, seed, type Estado, type MensagemObra, type Negocio } from "./motor";
import { adendaAssinada } from "./testeAdenda";
import { fimDe } from "./ajustesPlano";
import {
  diaDeHoje, erroTarefas, inicioProblema, livresDoProblema, mensagensPorTratar, problemaDaAdenda, problemasAbertos, tarefaDoProblema, textoRespostaComOrcamento,
  textoRespostaNaoFazer, textoRespostaSemCusto,
} from "./problemasCliente";

const foto = "data:image/svg+xml;utf8,x";
/** 1022: a obra de exemplo em curso (contrato assinado). */
const obra1022 = () => {
  const S: Estado = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1022) as Negocio;
  return { S, A, d, p: d.obra.plano! };
};
const msg = (m: Partial<MensagemObra> = {}): MensagemObra => ({ id: "m-1", de: "cliente", quem: "Ana Costa", t: "A junta do duche está a deixar sair água", q: "hoje 10:00", fotos: ["f-1", "f-2"], ...m });
const origem = (m = msg()) => ({ msg: m.id!, texto: m.t, fotos: m.fotos ?? [] });

describe("problemas reportados pelo cliente (funções)", () => {
  it("as mensagens do cliente com fotografias são problemas por tratar, até o gestor as tratar", () => {
    const { d } = obra1022();
    const L = [msg(), msg({ id: "m-2", fotos: [] }), msg({ id: "m-3", de: "empresa", quem: "Equipa" }), msg({ id: undefined, fotos: undefined, foto })];
    expect(mensagensPorTratar(d, L).map((x) => x.chave)).toEqual(["local-3", "m-1"]);
    d.obra.problemas = [{ id: "PC-1022-1", msg: "m-1", texto: "x", fotos: [], q: "", estado: "descartado", cobrar: false, tarefas: [] }];
    expect(mensagensPorTratar(d, L).map((x) => x.chave)).toEqual(["local-3"]);
  });

  it("o que falta antes de decidir: trabalho, horas, técnico e, com orçamento, o preço", () => {
    expect(erroTarefas([], false)).toMatch(/pelo menos uma/);
    expect(erroTarefas([{ n: " ", h: 2, tec: "ma" }], false)).toMatch(/trabalho/);
    expect(erroTarefas([{ n: "Junta", h: 0, tec: "ma" }], false)).toMatch(/horas/);
    expect(erroTarefas([{ n: "Junta", h: 2, tec: null }], false)).toMatch(/técnico/);
    expect(erroTarefas([{ n: "Junta", h: 2, tec: "ma" }], true)).toMatch(/preço/);
    expect(erroTarefas([{ n: "Junta", h: 2, tec: "ma", preco: 80 }], true)).toBeNull();
  });

  it("a tarefa fica com o ofício e o técnico escolhidos; a linha livre da adenda com o ofício dele e o preço", () => {
    const { p } = obra1022();
    const t = tarefaDoProblema(p, { id: "PC-1022-1" }, { n: "Refazer a junta", h: 10, tec: "ma" }, TECS);
    expect(t).toMatchObject({ nome: "Refazer a junta (PC-1022-1)", tec: "ma", sk: "Canalizador", perfilId: "canalizador", h: 10, dur: 2, dia: p.dia, svcs: [], problema: "PC-1022-1" });
    expect(inicioProblema({ ...p, estado: "aprovado" })).toBeGreaterThan(0);
    expect(livresDoProblema([{ n: " Refazer a junta ", h: 2, tec: "ma", preco: 90 }], TECS)).toEqual([{ n: "Refazer a junta", h: 2, preco: 90, perfil: "Canalizador", mats: [] }]);
  });

  it("as respostas ao cliente, em linguagem simples", () => {
    const pr = { texto: "A junta do duche está a deixar sair água.", motivo: "Garantia", tarefas: [{ n: "Refazer a junta", h: 2, tec: "ma" }] };
    expect(textoRespostaSemCusto(pr, "qui 5/11", TECS)).toBe("Sobre o problema que nos mostrou («A junta do duche está a deixar sair água»): vamos resolvê-lo sem custo para si (garantia). Fica marcado: refazer a junta, a partir de qui 5/11, com Marco.");
    expect(textoRespostaComOrcamento(pr, "AD 2026/1022-1", true, "95,40")).toMatch(/a adenda AD 2026\/1022-1 \(95,40 € com IVA\)\. Pode vê-la e aceitá-la aqui no portal/);
    expect(textoRespostaComOrcamento(pr, "AD 2026/1022-1", false, "95,40")).toMatch(/Vamos enviar-lhe uma proposta/);
    expect(textoRespostaNaoFazer(pr)).toMatch(/não vamos fazer esse trabalho/);
  });
});

describe("problemas reportados pelo cliente (o gestor de obra)", () => {
  beforeEach(() => { esquecerInventario(); });

  it("sem orçamento: as tarefas entram já no plano com os técnicos, que são avisados; o cliente recebe a resposta; fica no histórico", () => {
    const { A, d, p } = obra1022();
    const antes = p.tasks.length;
    A.role("operacoes");
    const resp = A.tratarProblema(d.id, origem(), { tarefas: [{ n: "Refazer a junta do duche", h: 3, tec: "ma" }, { n: "Trocar o silicone", h: 1, tec: "hn" }], cobrar: false, motivo: "Garantia" });
    expect(resp).toMatch(/^Sobre o problema que nos mostrou .*: vamos resolvê-lo sem custo para si \(garantia\)\. Fica marcado: refazer a junta do duche, trocar o silicone/);
    expect(p.tasks).toHaveLength(antes + 2);
    const novas = p.tasks.filter((t) => t.problema === "PC-1022-1");
    expect(novas.map((t) => [t.tec, t.dia])).toEqual([["ma", p.dia], ["hn", p.dia]]);
    expect(p.avisos!.filter((a) => /sem custo para o cliente/.test(a.t)).map((a) => a.tec).sort()).toEqual(["hn", "ma"]);
    expect(d.obra.problemas![0]).toMatchObject({ id: "PC-1022-1", msg: "m-1", fotos: ["f-1", "f-2"], estado: "resolvido", cobrar: false, motivo: "Garantia", resposta: resp });
    expect(d.adendas ?? []).toHaveLength(0);
    expect(d.obra.alteracoes![0]).toMatchObject({ cliente: true, avisoCliente: resp, motivo: "Problema reportado pelo cliente" });
    expect(d.hist[0].t).toMatch(/^Problema do cliente PC-1022-1 .*sem orçamento \(garantia\) · Refazer a junta do duche \(PC-1022-1\), Marco Antunes/);
    // a resposta tem de seguir na conversa: até lá o gestor vê-a por enviar
    expect(problemasAbertos(d)).toHaveLength(1);
    A.problemaRespondido(d.id, "PC-1022-1");
    expect(d.obra.problemas![0].respondida).toBeTruthy();
    expect(problemasAbertos(d)).toHaveLength(0);
    // a mesma mensagem não se trata duas vezes
    expect(A.tratarProblema(d.id, origem(), { tarefas: [{ n: "x", h: 1, tec: "ma" }], cobrar: false })).toBeNull();
  });

  it("com orçamento: uma adenda com uma linha por tarefa vai ao portal; assinada, as tarefas entram com os técnicos escolhidos", () => {
    const { A, d, p } = obra1022();
    A.role("operacoes");
    const resp = A.tratarProblema(d.id, origem(), { tarefas: [{ n: "Trocar a base de duche", h: 6, tec: "hn", preco: 320 }], cobrar: true });
    const pr = d.obra.problemas![0];
    expect(pr).toMatchObject({ estado: "proposta", cobrar: true, adenda: expect.stringMatching(/^AD 2026\/1022-/) });
    const a = d.adendas!.find((x) => x.n === pr.adenda)!;
    expect(a).toMatchObject({ estado: "enviada", motivo: "Problema reportado pelo cliente", origem: { imprevisto: "PC-1022-1", texto: pr.texto } });
    expect(a.linhas).toEqual([expect.objectContaining({ livre: true, n: "Trocar a base de duche", pu: 320, h: 6 })]);
    expect(problemaDaAdenda(d, a)).toBe(pr);
    expect(resp).toContain(`a adenda ${a.n}`);
    expect(d.hist[0].t).toMatch(/com orçamento · adenda AD 2026\/1022-\d+ enviada ao cliente/);
    adendaAssinada(A, d.id, a.n);
    expect(pr.estado).toBe("aprovado");
    const nova = p.tasks.find((t) => t.problema === "PC-1022-1")!;
    // o técnico é o que o gestor escolheu (não o que o plano escolheria sozinho) e começa já
    expect(nova).toMatchObject({ tec: "hn", adenda: a.n });
    expect(nova.dia).toBe(p.dia);
    expect(p.avisos!.some((x) => x.tec === "hn" && x.t.startsWith("Tem uma tarefa nova"))).toBe(true);
    expect(d.hist.some((h) => /^Problema do cliente PC-1022-1 aprovado/.test(h.t))).toBe(true);
  });

  it("o cliente recusa a proposta: volta ao gestor (no Hoje), que pode fazer sem custo, outra proposta ou não fazer", () => {
    const { S, A, d, p } = obra1022();
    A.role("operacoes");
    A.tratarProblema(d.id, origem(), { tarefas: [{ n: "Trocar a base de duche", h: 6, tec: "hn", preco: 320 }], cobrar: true });
    const pr = d.obra.problemas![0];
    A.recusarAdenda(d.id, pr.adenda!, "O preço");
    expect(pr.estado).toBe("recusado");
    expect(minhas(S, "operacoes").some((x) => x.d === d && x.p.t.startsWith("Problema do cliente ·") && /não aceitou/.test(x.p.sub ?? ""))).toBe(true);
    // outra proposta: volta a aberto e trata-se de novo (outra adenda)
    expect(A.decidirProblema(d.id, pr.id, "refazer")).toBeNull();
    expect(pr.estado).toBe("aberto");
    A.tratarProblema(d.id, origem(), { tarefas: [{ n: "Trocar só o ralo", h: 2, tec: "ma", preco: 90 }], cobrar: true });
    expect(pr.estado).toBe("proposta");
    expect(d.adendas!.filter((x) => problemaDaAdenda(d, x) === pr)).toHaveLength(2);
    A.recusarAdenda(d.id, pr.adenda!, "Ainda caro");
    // fazer sem custo: as tarefas entram no plano, sem preço
    const resp = A.decidirProblema(d.id, pr.id, "sem_custo", "Oferta ao cliente");
    expect(resp).toMatch(/sem custo para si \(oferta ao cliente\)/);
    expect(pr).toMatchObject({ estado: "resolvido", cobrar: false, tarefas: [{ n: "Trocar só o ralo", h: 2, tec: "ma" }] });
    expect(p.tasks.some((t) => t.problema === pr.id && t.tec === "ma")).toBe(true);
  });

  it("não fazer: fica fechado e o cliente é avisado; «não é um problema» sai da lista sem mexer no plano", () => {
    const { A, d, p } = obra1022();
    const antes = p.tasks.length;
    A.role("operacoes");
    A.tratarProblema(d.id, origem(), { tarefas: [{ n: "Trocar a base", h: 6, tec: "hn", preco: 320 }], cobrar: true });
    const pr = d.obra.problemas![0];
    A.recusarAdenda(d.id, pr.adenda!, "O preço");
    expect(A.decidirProblema(d.id, pr.id, "nao_fazer")).toMatch(/não vamos fazer esse trabalho/);
    expect(pr.estado).toBe("fechado");
    A.descartarProblema(d.id, origem(msg({ id: "m-9", t: "Ficou lindo!" })), "é um elogio");
    expect(d.obra.problemas![1]).toMatchObject({ estado: "descartado", decisao: "é um elogio" });
    expect(p.tasks).toHaveLength(antes);
    expect(d.hist[0].t).toMatch(/não é um problema \(é um elogio\)/);
  });

  it("depois de a obra acabar (garantia): sem orçamento, a obra reabre para assistência e as tarefas começam a seguir ao fim", () => {
    const { A, d, p } = obra1022();
    p.estado = "concluída";
    const fim = fimDe(p.tasks);
    A.role("operacoes");
    expect(A.tratarProblema(d.id, origem(), { tarefas: [{ n: "Refazer a junta", h: 2, tec: "ma" }], cobrar: false, motivo: "Garantia" })).toMatch(/sem custo para si \(garantia\)/);
    expect(p.estado).toBe("em curso");
    expect(p.dia).toBe(fim);
    expect(p.tasks.find((t) => t.problema === "PC-1022-1")).toMatchObject({ dia: fim, tec: "ma" });
    expect(d.hist.some((h) => h.t === "Obra reaberta para assistência: problema do cliente PC-1022-1")).toBe(true);
  });

  it("depois de a obra acabar, com orçamento: a adenda faz-se na mesma e, assinada, reabre a obra", () => {
    const { A, d, p } = obra1022();
    p.estado = "concluída";
    A.role("operacoes");
    // as outras adendas continuam a não se poder fazer com a obra concluída
    expect(A.criarAdenda(d.id, [], "O cliente pediu", { livres: [{ n: "x", h: 1, preco: 10, perfil: "Canalizador", mats: [] }] })).toBeNull();
    A.tratarProblema(d.id, origem(), { tarefas: [{ n: "Trocar a base", h: 6, tec: "hn", preco: 320 }], cobrar: true });
    const pr = d.obra.problemas![0];
    expect(pr.estado).toBe("proposta");
    expect(p.estado).toBe("concluída");
    adendaAssinada(A, d.id, pr.adenda!);
    expect(p.estado).toBe("em curso");
    expect(pr.estado).toBe("aprovado");
    expect(p.tasks.find((t) => t.problema === pr.id)).toMatchObject({ tec: "hn", dia: p.dia });
  });

  it("o dia de hoje no plano: os dias úteis desde o início (pode passar do fim); sem datas, o dia a seguir ao fim", () => {
    const { p } = obra1022();
    expect(diaDeHoje({ ...p, origem: undefined })).toBe(fimDe(p.tasks));
    const q = { ...p, origem: "orcamento" as const, inicio: "2026-10-01" };
    expect(diaDeHoje(q, new Date(2026, 9, 1))).toBe(fimDe(p.tasks));
    expect(diaDeHoje(q, new Date(2027, 2, 1))).toBeGreaterThan(fimDe(p.tasks));
  });

  it("só o gestor da obra trata; sem contrato não há orçamento e o problema fica por tratar", () => {
    const { A, d } = obra1022();
    A.role("comercial");
    expect(A.tratarProblema(d.id, origem(), { tarefas: [{ n: "x", h: 1, tec: "ma" }], cobrar: false })).toBeNull();
    expect(d.obra.problemas ?? []).toHaveLength(0);
    A.role("operacoes");
    d.orc!.contrato = null;
    expect(A.tratarProblema(d.id, origem(), { tarefas: [{ n: "x", h: 1, tec: "ma", preco: 50 }], cobrar: true })).toBeNull();
    expect(d.obra.problemas ?? []).toHaveLength(0);
  });
});
