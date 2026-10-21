// 21/10: imprevistos a meio da obra → adenda (proposta extra no mesmo negócio) → o cliente aprova ou recusa → plano, encomenda de ajuste,
// fatura própria da adenda e pagamento no portal (com a escolha do método), validado pelo Financeiro.
import { beforeEach, describe, expect, it } from "vitest";
import { esquecerInventario, lerInventario } from "./inventario/loja";
import { acoes, minhas, seed, type Estado, type Negocio } from "./motor";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "./campos";
import { paradasPor, tarefasAfetaveis } from "./imprevistos";
import { receberTudo } from "./testeObra";
import { fimDe } from "./ajustesPlano";

const foto = "data:image/svg+xml;utf8,x";
const obra1022 = () => {
  const S: Estado = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1022) as Negocio;
  return { S, A, d, p: d.obra.plano! };
};
/** 1027 até à obra em curso: pago, plano aprovado, materiais recebidos, arrancada (a EC inicial existe: as de ajuste podem nascer). */
const obra1027 = () => {
  const S: Estado = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1027) as Negocio;
  const encher = (gs: Grupo[]) => { for (let i = 0; i < 5; i++) for (const c of emFalta(gs, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x"; };
  encher(FINANCEIRO); encher([OBRA[0]]);
  A.role("financeiro"); A.emitir(d.id); A.validar(d.id);
  A.role("operacoes"); A.aprovarPlano(d.id);
  expect(receberTudo("CT 2026/1027")).toBe("");
  A.arrancar(d.id);
  expect(d.obra.plano!.estado).toBe("em curso");
  return { S, A, d, p: d.obra.plano! };
};

describe("imprevistos a meio da obra", () => {
  beforeEach(() => { esquecerInventario(); });

  it("«impede»: o técnico regista com fotografia; as tarefas afetadas param e o cliente é avisado; o gestor vê no Hoje", () => {
    const { S, A, d, p } = obra1022();
    const ti = tarefasAfetaveis(p).find((i) => p.tasks[i].dia >= p.dia)!;
    A.role("tecnico");
    const id = A.registarImprevisto(d.id, { texto: "Cano de esgoto podre por baixo da base", onde: "Casa de banho, parede do fundo", foto, grav: "impede", tarefas: [ti] })!;
    expect(id).toBe("IM-1022-1");
    expect(p.tasks[ti].bloqueio).toBe(id);
    expect(d.obra.imprevistos![0]).toMatchObject({ estado: "aberto", grav: "impede", foto, tarefas: [p.tasks[ti].nome] });
    expect(d.obra.alteracoes![0].avisoCliente).toMatch(/^Encontrámos um problema na obra \(casa de banho, parede do fundo\): Cano de esgoto podre/);
    expect(d.obra.diario!.at(-1)).toMatchObject({ k: "ocorrencia", fotos: [foto] });
    expect(minhas(S, "operacoes").some((x) => x.d === d && x.p.t.startsWith("Imprevisto · Cano"))).toBe(true);
  });

  it("«atrasa»: o plano anda os dias indicados e a data de fim muda", () => {
    const { A, d, p } = obra1022();
    const fim = fimDe(p.tasks), ti = tarefasAfetaveis(p).find((i) => p.tasks[i].dia > p.dia)!;
    A.role("operacoes");
    A.registarImprevisto(d.id, { texto: "Parede com humidade, tem de secar", onde: "", grav: "atrasa", tarefas: [ti], dias: 2 });
    expect(fimDe(p.tasks)).toBe(fim + 2);
    expect(p.tasks[ti].bloqueio).toBeUndefined();
    expect(d.obra.imprevistos![0].atraso).toBe(2);
    expect(d.obra.alteracoes![0].avisoCliente).toMatch(/Atrasa alguns trabalhos\. A obra passa a acabar/);
  });

  it("o gestor faz a proposta (serviço + linha livre): adenda com origem, no portal; o cliente recusa e o gestor decide seguir", () => {
    const { S, A, d, p } = obra1022();
    const ti = tarefasAfetaveis(p).find((i) => p.tasks[i].dia >= p.dia)!;
    A.role("tecnico");
    const id = A.registarImprevisto(d.id, { texto: "Cano podre", onde: "", foto, grav: "impede", tarefas: [ti] })!;
    A.role("operacoes");
    const n = A.proporImprevisto(d.id, id, [{ sid: "canal", q: 1 }], [{ n: "Trocar o troço de esgoto", h: 6, preco: 180, perfil: "Canalização", mats: [{ n: "Tubo PVC 110", q: 2, un: "tubo", preco: 9 }] }])!;
    const a = d.adendas!.find((x) => x.n === n)!;
    expect(a).toMatchObject({ estado: "enviada", motivo: "Imprevisto na obra", origem: { imprevisto: id, texto: "Cano podre", foto } });
    expect(a.linhas.at(-1)).toMatchObject({ livre: true, n: "Trocar o troço de esgoto", q: 1, pu: 180, h: 6 });
    expect(S.svc[a.linhas.at(-1)!.sid]).toMatchObject({ n: "Trocar o troço de esgoto", h: 6, preco: 180 });
    expect(d.obra.imprevistos![0]).toMatchObject({ estado: "proposta", adenda: n });
    A.recusarAdenda(d.id, n, "O preço");
    expect(d.obra.imprevistos![0].estado).toBe("recusado");
    expect(minhas(S, "operacoes").some((x) => x.d === d && x.p.t === "Imprevisto · o cliente não aceitou")).toBe(true);
    expect(minhas(S, "comercial").some((x) => x.d === d && x.p.t.startsWith("O cliente não aceitou a proposta do imprevisto"))).toBe(true);
    A.decidirImprevisto(d.id, id, "seguir", "o cliente trata com o condomínio");
    expect(d.obra.imprevistos![0]).toMatchObject({ estado: "fechado", decisao: "Seguir sem esse trabalho · o cliente trata com o condomínio" });
    expect(paradasPor(p, id)).toEqual([]);
  });

  it("o cliente aprova: as tarefas novas entram já, as paradas seguem depois delas, a EC de ajuste nasce, a fatura da adenda e o pagamento", () => {
    const { S, A, d, p } = obra1027();
    const ti = tarefasAfetaveis(p).find((i) => p.tasks[i].dia > p.dia)!;
    const parada = p.tasks[ti];
    A.role("tecnico");
    const id = A.registarImprevisto(d.id, { texto: "Cano podre", onde: "Cozinha", grav: "impede", tarefas: [ti] })!;
    A.role("operacoes");
    const n = A.proporImprevisto(d.id, id, [], [{ n: "Trocar o cano", h: 8, preco: 240, perfil: "Canalização", mats: [{ n: "Tubo PVC 110", q: 2, un: "tubo", preco: 9 }] }])!;
    A.simularAdenda(d.id, n);
    const a = d.adendas!.find((x) => x.n === n)!;
    expect(a.estado).toBe("assinada");
    expect(d.obra.imprevistos![0].estado).toBe("aprovado");
    const nova = p.tasks.find((t) => t.nome.includes(`(adenda ${n})`))!;
    expect(nova.dia).toBeGreaterThanOrEqual(p.dia);
    expect(parada.bloqueio).toBeUndefined();
    expect(parada.dia).toBeGreaterThanOrEqual(nova.dia + nova.dur);
    // os materiais da linha livre vão numa encomenda de ajuste, mas só com o pagamento da adenda validado (decisão B)
    expect(nova.mats).toEqual([{ n: "Tubo PVC 110", q: 2, un: "tubo", preco: 9 }]);
    expect(lerInventario().ecs.some((e) => e.origin.ref === "CT 2026/1027 · A1" && !e.deleted)).toBe(false);
    // o Financeiro: a fatura própria da adenda, no Hoje dele
    expect(minhas(S, "financeiro").some((x) => x.d === d && x.p.act === "faturarAdendas")).toBe(true);
    A.role("financeiro"); A.faturarAdendas(d.id);
    expect(a.fatura?.n).toMatch(/^FT 2026\/\d+$/);
    // o cliente paga no portal por débito direto; o Financeiro valida e sai o recibo
    A.escolherMetodo(d.id, "Débito direto", n);
    A.autorizarDebito(d.id, "PT50 ···· 0154", "Tiago Almeida", n);
    expect(a.pag).toMatchObject({ metodo: "Débito direto", debito_iban: "PT50 ···· 0154" });
    expect(d.f.metodo).not.toBe("Débito direto"); // a fatura do contrato fica como estava
    expect(minhas(S, "financeiro").some((x) => x.d === d && x.p.act === "validarPagamentosAdenda")).toBe(true);
    A.validarPagamentosAdenda(d.id);
    expect(a.recibo?.n).toMatch(/^RC 2026\/\d+$/);
    // com o pagamento da adenda validado, a encomenda dela nasce no Inventário, ligada à adenda
    expect(lerInventario().ecs.some((e) => e.origin.ref === "CT 2026/1027 · A1" && !e.deleted)).toBe(true);
    expect(d.obra.ecsAjuste!.find((x) => x.adenda === n)?.n).toBe("EC-1027-A1");
  });

  it("só a equipa da obra regista, com a obra em curso", () => {
    const { A, d, p } = obra1022();
    A.role("comercial");
    expect(A.registarImprevisto(d.id, { texto: "x", onde: "", grav: "impede", tarefas: [tarefasAfetaveis(p)[0]] })).toBeNull();
    A.role("operacoes");
    expect(A.registarImprevisto(d.id, { texto: "", onde: "", grav: "impede", tarefas: [0] })).toBeNull();
  });
});
