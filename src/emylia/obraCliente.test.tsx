// A obra contada ao cliente no portal (12/11/2026): o histórico (do mais recente para o mais antigo) e o progresso, sem nada interno.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { acoes, seed, type Estado, type Negocio, type Tarefa } from "./motor";
import type { Ctx } from "./pecas";
import { PortalCliente } from "./PortalCliente";
import { HistoricoObraPortal, ProgressoObraPortal } from "./ObraNoPortal";
import { dataDoTexto, diaDeHoje, historicoDaObra, historicoParaCliente, materiaisDaObra, porDia, progressoDaObra } from "./obraCliente";
import { negocioParaCliente } from "./real/vistaCliente";
import { rotuloDia } from "./preparacaoObra";
import type { ResumoEcNeg } from "./inventario/ponteNegocios";

afterEach(cleanup);

/** Quinta, 13 de novembro de 2026, às 18:00. */
const HOJE = new Date(2026, 10, 13, 18, 0);
const tarefa = (nome: string, dia: number, dur: number, fase: number, x: Partial<Tarefa> = {}): Tarefa =>
  ({ nome, svcs: [], dia, dur, sk: "Canalizador", h: 8 * dur, tec: null, fase, ...x });

/** Um negócio com a obra em curso desde terça, 10 de novembro: um trabalho verificado, um atrasado, um de hoje e um a seguir,
 *  com registos dos técnicos, um pedido de correção (interno), um aviso ao cliente, um ajuste interno e o histórico misturado. */
function emObra(): { S: Estado; d: Negocio } {
  const S = seed();
  const d = S.deals.find((x) => x.orc?.linhas.some((l) => l.t === "svc"))!;
  const o = d.orc!;
  o.enviada = "01/11/2026"; o.aceite = "02/11/2026"; o.contrato = "assinado"; o.vendaDireta = false;
  d.adendas = []; d.obra.auto = null;
  d.obra.plano = {
    origem: "orcamento", inicio: "2026-11-10", estado: "em curso", dia: 1,
    tasks: [
      tarefa("Demolição", 0, 1, 1, { exec: { estado: "validada", horas: 8, fotos: ["f-dem"], validada: "hoje 17:00", envios: [
        { q: "hoje 09:10", dia: 0, quem: "Hugo Neves", k: "registo", horas: 4, ch: 18, fotos: ["f-dem-1"], nota: "Protegemos o chão e começámos a picar." },
        { q: "hoje 16:30", dia: 0, quem: "Hugo Neves", k: "feita", horas: 4, fotos: ["f-dem-2"] },
        { q: "hoje 17:00", dia: 0, quem: "Filipe Rocha", k: "validada" },
      ] } }),
      tarefa("Canalização", 1, 1, 2, { exec: { estado: "em curso", horas: 3, fotos: [], envios: [
        { q: "hoje 12:00", dia: 1, quem: "Marco Antunes", k: "registo", horas: 3, fotos: ["f-can"], nota: "Tubos novos até à base de duche." },
        { q: "hoje 15:00", dia: 1, quem: "Filipe Rocha", k: "correcao", nota: "refazer o remate, está torto" },
      ] } }),
      tarefa("Correção · Canalização", 2, 1, 2, { corrige: 1 }),
      tarefa("Revestimento", 3, 2, 3),
      tarefa("Montagem de louças", 5, 1, 4),
    ],
  };
  d.obra.alteracoes = [
    { q: "hoje 10:00", dia: 2, quem: "Filipe Rocha", t: "Canalização: 1 → 2 dias", motivo: "Material atrasado", fimAntes: "seg, 16 nov", fimDepois: "ter, 17 nov", cliente: true,
      avisoCliente: "Ajustámos o plano em \"canalização\" (material atrasado). A obra passa a acabar a ter, 17 nov (antes: seg, 16 nov)." },
    { q: "hoje 11:00", dia: 2, quem: "Filipe Rocha", t: "Mais 2 h", motivo: "Erro nosso", fimAntes: "ter, 17 nov", fimDepois: "ter, 17 nov", cliente: false, paga: "empresa", custo: 120 },
  ];
  d.obra.diario = [{ q: "hoje 11:00", quem: "Filipe Rocha", t: "Mais 2 h · paga a empresa: 120 €", k: "marco" }, { q: "hoje 12:30", quem: "Marco Antunes", t: "Falta o técnico de amanhã", k: "ocorrencia" }];
  d.hist = [
    { t: "Plano em obra: Mais 2 h · paga a empresa: 120 € · acaba a ter, 17 nov", q: "12/11 11:00", k: "w", quem: "Filipe Rocha" },
    { t: "Pagamento da FT 2026/12 validado · RC 2026/7 emitido", q: "11/11 09:30", k: "a" },
    { t: "Obra arrancou", q: "10/11 08:05", k: "a" },
    { t: "Encomenda de cliente EC 2026/31 emitida no Inventário · 3 linhas já saíram para a obra", q: "06/11 10:00", k: "a" },
    { t: "Orçamento verificado · margem 31%", q: "03/11 10:00", k: "a" },
    { t: "Contrato assinado pelo cliente", q: "03/11 09:00", k: "a" },
  ];
  return { S, d };
}

describe("as datas do motor", () => {
  it("lê os formatos da base, do motor e do exemplo", () => {
    expect(dataDoTexto("12/11 11:00", HOJE)).toEqual(new Date(2026, 10, 12, 11, 0));
    expect(dataDoTexto("03/11/2025 09:00", HOJE)).toEqual(new Date(2025, 10, 3, 9, 0));
    expect(dataDoTexto("2026-11-10", HOJE)).toEqual(new Date(2026, 10, 10));
    expect(dataDoTexto("hoje 15:21", HOJE)).toEqual(new Date(2026, 10, 13, 15, 21));
    expect(dataDoTexto("seg 13/10 08:05", HOJE)).toEqual(new Date(2026, 9, 13, 8, 5));
    // sem ano e muito para a frente: é do ano passado
    expect(dataDoTexto("20/12", HOJE)?.getFullYear()).toBe(2026);
    expect(dataDoTexto("20/02", new Date(2026, 0, 5))?.getFullYear()).toBe(2026);
    expect(dataDoTexto("20/12", new Date(2026, 0, 5))?.getFullYear()).toBe(2025);
    expect(dataDoTexto("ontem", HOJE)).toBeNull();
  });
  it("o dia de hoje no plano vem do calendário, não do p.dia gravado", () => {
    const { d } = emObra();
    expect(d.obra.plano!.dia).toBe(1);
    expect(diaDeHoje(d.obra.plano!, HOJE)).toBe(3); // ter 10, qua 11, qui 12, sex 13
    expect(diaDeHoje(d.obra.plano!, new Date(2026, 10, 9))).toBe(-1);
  });
});

describe("o histórico que vai ao cliente", () => {
  it("só as linhas da lista, com o texto limpo e a data de hoje escrita", () => {
    const h = historicoParaCliente([
      { t: "Obra concluída · margem real 31%", q: "hoje 15:21", k: "a", quem: "Filipe Rocha" },
      { t: "Plano em obra: Mais 2 h · paga a empresa: 120 €", q: "hoje 11:00", k: "w" },
      { t: "Imprevisto IM-1026-1 registado por Marco: cano roto", q: "hoje 10:00", k: "w" },
      { t: "Encomenda de cliente EC 2026/31 emitida no Inventário · 1 encomenda a fornecedor no portal (PO-77, Fornecedor X)", q: "06/11 10:00", k: "a" },
      { t: "O cliente aceitou a adenda AD 2026/1026-1 no portal", q: "12/11 09:00", k: "a" },
      { t: "Fatura FT TESTE/1026 registada sem confirmar no Eticadata (sem ligação ao ERP)", q: "10/11 11:02", k: "a" },
    ], HOJE);
    expect(h).toEqual([
      { t: "Obra concluída", q: "13/11/2026 15:21", k: "a" },
      { t: "Encomenda de cliente EC 2026/31 emitida", q: "06/11 10:00", k: "a" },
      { t: "O cliente aceitou a adenda AD 2026/1026-1 no portal", q: "12/11 09:00", k: "a" },
      { t: "Fatura FT TESTE/1026 registada", q: "10/11 11:02", k: "a" },
    ]);
    // limpar outra vez não muda nada
    expect(historicoParaCliente(h, HOJE)).toEqual(h);
  });

  it("a vista do negócio sai sem o ajuste interno, o diário da equipa, o custo nem quem paga", () => {
    const { d } = emObra();
    const c = negocioParaCliente(d, HOJE);
    expect(c.obra.alteracoes).toHaveLength(1);
    expect(c.obra.alteracoes![0]).not.toHaveProperty("custo");
    expect(c.obra.alteracoes![0].quem).toBe("");
    expect(c.obra.diario).toEqual([]);
    expect(c.hist.map((e) => e.t)).toEqual(["Pagamento da FT 2026/12 validado · RC 2026/7 emitido", "Obra arrancou", "Encomenda de cliente EC 2026/31 emitida", "Contrato assinado pelo cliente"]);
    expect(JSON.stringify(c)).not.toMatch(/paga a empresa|120 €|Falta o técnico|margem|refazer o remate/);
  });
});

describe("a linha do tempo da obra", () => {
  it("do mais recente para o mais antigo, com os técnicos, os trabalhos, o aviso e os pagamentos; nada interno", () => {
    const { d } = emObra();
    const L = historicoDaObra(negocioParaCliente(d, HOJE), HOJE);
    expect(L.map((m) => m.t)).toEqual([
      "A data de fim da obra mudou", // qui 12, 10:00
      "Marco esteve na obra", // qua 11, 12:00
      "Recebemos o seu pagamento", // qua 11, 09:30
      "Demolição: concluído", // ter 10, 17:00
      "Hugo acabou demolição", // ter 10, 16:30
      "Hugo esteve na obra", // ter 10, 09:10
      "A obra começou", // ter 10, 08:05
      "Encomendámos os materiais da obra",
      "Assinou o contrato",
      "Aceitou a proposta", // aceite no portal real: sem linha no histórico, vem da data da proposta
    ]);
    const marco = L.find((m) => m.t === "Marco esteve na obra")!;
    expect(marco).toMatchObject({ sub: "Canalização", nota: "Tubos novos até à base de duche.", fotos: ["f-can"] });
    expect(marco.quando).toEqual(new Date(2026, 10, 11, 12, 0));
    expect(L.find((m) => m.k === "pagamento")!.sub).toBe("FT 2026/12 · recibo RC 2026/7");
    expect(JSON.stringify(L)).not.toMatch(/remate|Correção|120|Filipe|margem|Falta o técnico/);
  });

  it("agrupa por dia: hoje, ontem e a data", () => {
    const { d } = emObra();
    const g = porDia(historicoDaObra(negocioParaCliente(d, HOJE), HOJE), HOJE);
    expect(g.map((x) => x.dia)).toEqual(["Ontem", rotuloDia(d.obra.plano!, 1), rotuloDia(d.obra.plano!, 0), "sex, 6 nov", "ter, 3 nov", "seg, 2 nov"]);
  });

  it("uma obra antiga sem a linha «Obra arrancou» começa no 1.º dia do plano", () => {
    const { d } = emObra();
    d.hist = d.hist.filter((e) => e.t !== "Obra arrancou");
    const ini = historicoDaObra(d, HOJE).find((m) => m.k === "inicio")!;
    expect(ini.quando).toEqual(new Date(2026, 10, 10));
  });
});

describe("o progresso da obra", () => {
  it("conta os trabalhos, as datas previstas, o atraso e o que vem a seguir", () => {
    const { d } = emObra();
    const P = progressoDaObra(negocioParaCliente(d, HOJE), HOJE)!;
    expect(P.total).toBe(4); // a tarefa de correção não conta
    expect([P.concluidas, P.aDecorrer, P.porComecar]).toEqual([1, 2, 1]);
    expect(P.tarefas.map((t) => [t.nome, t.estado, t.atrasada ?? ""])).toEqual([
      ["Demolição", "concluída", ""],
      ["Canalização", "a decorrer", "qua, 11 nov"],
      ["Revestimento", "hoje", ""],
      ["Montagem de louças", "por começar", ""],
    ]);
    expect(P.atrasadas.map((t) => t.nome)).toEqual(["Canalização"]);
    expect(P.agora.map((t) => t.nome)).toEqual(["Canalização", "Revestimento"]);
    expect(P.aSeguir.map((t) => t.nome)).toEqual(["Montagem de louças"]);
    expect(P.inicio).toBe("ter, 10 nov");
    expect(P.fim).toBe(rotuloDia(d.obra.plano!, 5));
    expect(P.fimInicial).toBe("seg, 16 nov");
    expect(P.fimPassou).toBe(false);
    expect(P.pct).toBeGreaterThan(0);
  });

  it("depois da data de fim, avisa que já passou", () => {
    const { d } = emObra();
    const P = progressoDaObra(d, new Date(2026, 10, 30))!;
    expect(P.fimPassou).toBe(true);
    expect(P.atrasadas.map((t) => t.nome)).toEqual(["Canalização", "Revestimento", "Montagem de louças"]);
  });

  it("os materiais contam uma vez cada um", () => {
    const linha = (st: string, aChegar = 0) => ({ ec: "EC", id: st + aChegar, sku: "", n: "x", q: 1, un: "un", st, rotulo: "", aBordo: false, saida: 0, pronto: 0, aChegar, semForn: 0, pos: [] });
    const r = { id: "EC", eliminada: false, estado: "open", rotulo: "", ajustes: [], pronta: false,
      linhas: [linha("served"), linha("served"), linha("open"), linha("open", 2)],
      tot: { linhas: 4, servidas: 2, prontas: 1, aBordo: 0, aFornecedor: 1, semForn: 0 },
      pos: [{ id: "", forn: "", estado: "", fase: "no portal", prometida: null, prevista: "2026-11-18" }] } as unknown as ResumoEcNeg;
    expect(materiaisDaObra(r)).toEqual({ naObra: 2, prontos: 1, aChegar: 1, total: 4, chegam: "qua, 18 nov" });
    expect(materiaisDaObra(null)).toBeNull();
  });
});

describe("no portal", () => {
  it("o cartão do progresso e o histórico, com as fotografias e o «ver tudo»", () => {
    const { d } = emObra();
    const c = negocioParaCliente(d, HOJE);
    render(<><ProgressoObraPortal d={c} hoje={HOJE} /><HistoricoObraPortal d={c} hoje={HOJE} /></>);
    const prog = screen.getByRole("region", { name: "Como vai a obra" });
    expect(within(prog).getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(progressoDaObra(c, HOJE)!.pct));
    expect(within(prog).getByText("Um trabalho está atrasado")).toBeInTheDocument();
    expect(within(prog).getByText(/devia ter acabado a qua, 11 nov/)).toBeInTheDocument();
    expect(within(prog).getByText("Antes: seg, 16 nov")).toBeInTheDocument();
    const hist = screen.getByRole("region", { name: "O que aconteceu na obra" });
    expect(within(hist).getByText("Ontem")).toBeInTheDocument();
    expect(within(hist).getByText("«Tubos novos até à base de duche.»")).toBeInTheDocument();
    expect(within(hist).getAllByRole("button", { name: /Ampliar a fotografia/ }).length).toBeGreaterThan(0);
    // 10 marcos: 8 à vista e o resto num toque
    expect(within(hist).queryByText("Assinou o contrato")).toBeNull();
    fireEvent.click(within(hist).getByRole("button", { name: "Ver todo o histórico (10)" }));
    expect(within(hist).getByText("Assinou o contrato")).toBeInTheDocument();
    expect(hist.textContent).not.toMatch(/remate|120|Filipe|margem/);
  });

  it("«Ver como o cliente» mostra a obra como o cliente a recebe, sem o histórico interno", () => {
    const { S, d } = emObra();
    S.deals = [d];
    const A = acoes(S, () => {}, (fn) => fn());
    const ctx = { S, A, run: (fn: () => void) => fn() } as unknown as Ctx;
    render(<PortalCliente ctx={ctx} d={d} fechar={() => {}} previa />);
    expect(screen.getByRole("region", { name: /Como vai a obra|A obra está concluída/ })).toBeInTheDocument();
    const hist = screen.getByRole("region", { name: "O que aconteceu na obra" });
    expect(hist.textContent).not.toMatch(/paga a empresa|margem|remate/);
    expect(screen.getByRole("dialog").textContent).not.toMatch(/paga a empresa|Falta o técnico/);
  });
});
