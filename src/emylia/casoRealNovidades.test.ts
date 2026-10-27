// 26/10: o que entrou para o caso real P-2026-0109 (casos/casoAnabela.test.ts), testado peça a peça: as linhas livres, o IVA por linha,
// as subempreitadas de materiais a 23%, a linha "Remodelação geral", o produto sem a instalação, as prestações à medida e as tarefas
// dos «MO Modelo» partidas por ofício.
import { beforeEach, describe, expect, it } from "vitest";
import { LINHAS, acoes, linhaDasDivisoes, nomeLinha, ivaDaLinha, ivaDoServico, seed, servicoDoCatalogo, totaisIva, type Aviso, type Estado } from "./motor";
import { estadoVazio } from "./estadoOrganizacao";
import { PAGAMENTO_MEDIDA, erroPrestacoes, prestacoes, type Prestacao } from "./planoObra";
import { tranchesDoPlano } from "./v2/financeiro";
import { ligarCatalogo, marcarSemServico, servicosTrazidos, type ProdVisita } from "./produtosVisita";
import { catalogo0 } from "./v2/catalogoModelo";
import { partesPorOficio } from "./preparacaoObra";
import { BRUTO_SERVICOS } from "./dados/mudelarServicos";

const SID = (sku: string) => BRUTO_SERVICOS.servicos.find((x) => x[1] === sku)![0];

/** Um orçamento por enviar (o 1031 da demonstração, reaberto). */
function preparar() {
  const S = seed();
  const avisos: Aviso[] = [];
  const A = acoes(S, (a) => avisos.push(a), (fn) => fn());
  const d = S.deals.find((x) => x.id === 1031)!;
  d.orc!.enviada = null;
  return { S, A, d, avisos };
}

beforeEach(() => { localStorage.clear(); ligarCatalogo(() => catalogo0()); });

describe("linhas livres no orçamento", () => {
  it("junta a linha com a quantidade, a unidade, o preço e a taxa de IVA, e entra na base certa", () => {
    const { S, A, d } = preparar();
    const antes = totaisIva(d, S);
    const i = A.linhaLivre(d.id, { d: "Taxa de Serviço de Consultoria", q: 1, pu: 1216.87, iva: 6 });
    expect(i).toBe(d.orc!.linhas.length - 1);
    expect(d.orc!.linhas[i]).toMatchObject({ t: "mat", d: "Taxa de Serviço de Consultoria", preco: 1216.87, iva: 6, livre: { q: 1, un: "un", pu: 1216.87 } });
    const depois = totaisIva(d, S);
    expect(depois.mo - antes.mo).toBeCloseTo(1216.87, 2);
    expect(depois.mat).toBeCloseTo(antes.mat, 2);
    A.linhaLivre(d.id, { d: "Material Elétrico", q: 2, un: "cx", pu: 275, iva: 23 });
    expect(totaisIva(d, S).mat - antes.mat).toBeCloseTo(550, 2);
  });
  it("recusa sem descrição, com quantidade 0 ou com a descrição repetida", () => {
    const { A, d, avisos } = preparar();
    const n = d.orc!.linhas.length;
    expect(A.linhaLivre(d.id, { d: "  ", q: 1, pu: 10, iva: 23 })).toBe(-1);
    expect(A.linhaLivre(d.id, { d: "X", q: 0, pu: 10, iva: 23 })).toBe(-1);
    expect(A.linhaLivre(d.id, { d: "X", q: 1, pu: 10, iva: 23 })).toBeGreaterThanOrEqual(0);
    expect(A.linhaLivre(d.id, { d: "X", q: 1, pu: 20, iva: 23 })).toBe(-1);
    expect(d.orc!.linhas.length).toBe(n + 1);
    expect(avisos.at(-1)?.msg).toBe("Já há uma linha com essa descrição");
  });
  it("o preço mudado à mão acerta o preço por unidade; tira-se; não se mexe depois de enviada", () => {
    const { A, d } = preparar();
    const i = A.linhaLivre(d.id, { d: "Pladur", q: 4, un: "m2", pu: 10, iva: 23 });
    A.precoLinha(d.id, i, 50);
    expect(d.orc!.linhas[i]).toMatchObject({ preco: 50, livre: { q: 4, pu: 12.5 } });
    A.tirarLinha(d.id, i);
    expect(d.orc!.linhas.some((l) => l.t === "mat" && l.d === "Pladur")).toBe(false);
    d.orc!.enviada = { q: "hoje" } as never;
    expect(A.linhaLivre(d.id, { d: "Depois", q: 1, pu: 1, iva: 23 })).toBe(-1);
  });
  it("tirarLinha não tira as linhas que não são livres", () => {
    const { A, d } = preparar();
    const i = d.orc!.linhas.findIndex((l) => l.t === "svc");
    const n = d.orc!.linhas.length;
    A.tirarLinha(d.id, i);
    expect(d.orc!.linhas.length).toBe(n);
  });
});

describe("IVA por linha", () => {
  it("por omissão: serviço 6%, materiais 23%; a taxa escrita na linha manda; null volta à de omissão", () => {
    const { S, A, d } = preparar();
    const iS = d.orc!.linhas.findIndex((l) => l.t === "svc"), iM = d.orc!.linhas.findIndex((l) => l.t === "mat");
    expect(ivaDaLinha(d.orc!.linhas[iS], S)).toBe(6);
    expect(ivaDaLinha(d.orc!.linhas[iM], S)).toBe(23);
    A.ivaLinha(d.id, iS, 23);
    expect(ivaDaLinha(d.orc!.linhas[iS], S)).toBe(23);
    A.ivaLinha(d.id, iS, null);
    expect(ivaDaLinha(d.orc!.linhas[iS], S)).toBe(6);
  });
  it("as subempreitadas de materiais («Materiais Instalação…») entram do Catálogo a 23%", () => {
    expect(ivaDoServico("Materiais Instalação de Ar Condicionado")).toBe(23);
    expect(ivaDoServico("  materiais instalação de janelas em PVC")).toBe(23);
    expect(ivaDoServico("Mão de Obra - Pintura")).toBeUndefined();
    expect(ivaDoServico("Materiaisxyz")).toBeUndefined();
    const S: Estado = estadoVazio("org-teste");
    expect(servicoDoCatalogo(SID("MATISAC"), S)?.iva).toBe(23);
    expect(servicoDoCatalogo(SID("MATISJPVC"), S)?.iva).toBe(23);
    expect(servicoDoCatalogo(SID("MOEPP"), S)?.iva).toBeUndefined();
  });
});

describe("linha «Remodelação geral»", () => {
  it("existe, sem modelo, sem medidas nem materiais estimados", () => {
    expect(LINHAS.geral).toMatchObject({ n: "Remodelação geral", nec: [], map: [], med: {}, mats: [] });
    expect(LINHAS.geral.mat.preco).toBe(0);
  });
  it("cria-se um negócio com ela", () => {
    const S = estadoVazio("org-teste");
    const A = acoes(S, () => {}, (fn) => fn());
    S.novo = { nome: "", tel: "", err: "" };
    A.novoCriar("Cliente Teste", "+351910000000", "geral");
    expect(S.deals[0].linha).toBe("geral");
  });
});

describe("a lead sem a linha (27/10)", () => {
  const nova = () => {
    const S = estadoVazio("org-teste");
    const A = acoes(S, () => {}, (fn) => fn());
    S.novo = { nome: "", tel: "", err: "" };
    A.novoCriar("Cliente Teste", "+351910000000");
    return { S, A, d: S.deals[0] };
  };
  it("nasce com a linha por definir", () => {
    const { d } = nova();
    expect(d.linhaPorDefinir).toBe(true);
    expect(nomeLinha(d)).toBe("Por definir");
    expect(d.servico).toBe("Por definir");
  });
  it("as divisões da visita dão a linha", () => {
    expect(linhaDasDivisoes([])).toBeNull();
    expect(linhaDasDivisoes(["Casa de banho"])).toBe("wc");
    expect(linhaDasDivisoes(["Cozinha"])).toBe("coz");
    expect(linhaDasDivisoes(["Casa de banho", "Cozinha"])).toBe("geral");
    expect(linhaDasDivisoes(["Sala"])).toBe("geral");
  });
  it("a divisão escolhida põe a linha e muda-a até a visita fechar", () => {
    const { A, d } = nova();
    A.campo(d.id, "diag_tipo_area", "Cozinha");
    expect(d.linha).toBe("coz");
    expect(d.linhaPorDefinir).toBeUndefined();
    expect(d.servico).toBe("Cozinha");
    A.campo(d.id, "diag_tipo_area", "Casa de banho");
    expect(d.linha).toBe("wc");
    expect(d.servico).toBe("Casa de banho");
  });
  it("um nome escrito à mão não se perde quando a linha muda", () => {
    const { A, d } = nova();
    d.servico = "WC da suite";
    A.campo(d.id, "diag_tipo_area", "Casa de banho");
    expect(d.linha).toBe("wc");
    expect(d.servico).toBe("WC da suite");
  });
});

describe("produto sem a instalação", () => {
  const P = (x: Partial<ProdVisita>): ProdVisita => ({ id: "p1", n: "Rodapé", un: "ml", custo: 1, q: 10, no: null, svc: "c40", fator: 1, ...x });
  it("o produto marcado sem a instalação deixa de trazer o serviço; desmarcado volta", () => {
    const L = [P({}), P({ id: "p2", n: "Tinta", svc: "s-mopt", q: 3 })];
    expect(Object.keys(servicosTrazidos(L)).sort()).toEqual(["c40", "s-mopt"]);
    const sem = marcarSemServico(L, "p1", true);
    expect(sem[0].semSvc).toBe(true);
    expect(L[0].semSvc, "não muda a lista de origem").toBeUndefined();
    expect(Object.keys(servicosTrazidos(sem))).toEqual(["s-mopt"]);
    expect(marcarSemServico(sem, "p1", false)[0].semSvc).toBeUndefined();
  });
  it("a ação muda o produto da visita", () => {
    const { A, d } = preparar();
    d.visita.prod = [P({})];
    A.produtoSemServico(d.id, "p1", true);
    expect(d.visita.prod[0].semSvc).toBe(true);
  });
});

describe("prestações à medida", () => {
  const CONTRATO: Prestacao[] = [
    { l: "Adjudicação", p: 0.3, fase: 0 }, { l: "1 mês antes do início da obra", p: 0.2, fase: 0 }, { l: "Início de obra", p: 0.15, fase: 0 },
    { l: "Na retificação das medidas da cozinha", p: 0.1, fase: 1 }, { l: "Fim de obra", p: 0.25, fase: "fim" },
  ];
  it("erroPrestacoes: vazia, sem texto, 0% e a soma diferente de 100%", () => {
    expect(erroPrestacoes(CONTRATO)).toBeNull();
    expect(erroPrestacoes([])).toMatch(/pelo menos uma/);
    expect(erroPrestacoes([{ l: " ", p: 1, fase: 0 }])).toMatch(/Escreva/);
    expect(erroPrestacoes([{ l: "a", p: 0, fase: 0 }, { l: "b", p: 1, fase: "fim" }])).toMatch(/mais de 0%/);
    expect(erroPrestacoes([{ l: "a", p: 0.5, fase: 0 }, { l: "b", p: 0.45, fase: "fim" }])).toBe("As prestações somam 95%: têm de somar 100%.");
  });
  it("guardam-se no orçamento e dão as tranches com o texto do contrato", () => {
    const { A, d } = preparar();
    expect(A.pagamentoPlano(d.id, PAGAMENTO_MEDIDA, CONTRATO)).toBe(true);
    expect(d.f.pagamento).toBe(PAGAMENTO_MEDIDA);
    expect(prestacoes(d.f.pagamento, d.orc!.pagFases)).toEqual(CONTRATO);
    expect(tranchesDoPlano(d.f.pagamento, d.orc!.pagFases).map((t) => t.nome)).toEqual([
      "Adjudicação 30%", "1 mês antes do início da obra 20%", "Início de obra 15%", "Na retificação das medidas da cozinha 10%", "Fim de obra 25%",
    ]);
  });
  it("com a soma errada não se guardam e avisa", () => {
    const { A, d, avisos } = preparar();
    const antes = JSON.stringify(d.orc!.pagFases ?? null);
    expect(A.pagamentoPlano(d.id, PAGAMENTO_MEDIDA, CONTRATO.slice(1))).toBe(false);
    expect(JSON.stringify(d.orc!.pagFases ?? null)).toBe(antes);
    expect(avisos.at(-1)?.msg).toBe("As prestações não ficaram");
  });
});

describe("tarefas dos «MO Modelo» partidas por ofício", () => {
  it("as horas partem-se pelos ofícios da receita e somam o total", () => {
    const S = seed();
    const partes = partesPorOficio(S, SID("MOMRCCBC"), 100);
    expect(partes.length).toBeGreaterThan(2);
    expect(new Set(partes.map((x) => x.perfilId)).size).toBe(partes.length);
    expect(partes.reduce((a, x) => a + x.h, 0)).toBeCloseTo(100, 6);
    expect(partes.every((x) => x.h > 0 && x.passos.length > 0)).toBe(true);
  });
  it("os outros serviços ficam inteiros", () => {
    expect(partesPorOficio(seed(), SID("MOEPP"), 10)).toEqual([]);
  });
});

describe("o levantamento com um «MO Modelo» no orçamento", () => {
  it("as proteções e o transporte não entram (o modelo já os inclui); o estacionamento pago entra", () => {
    const { S, A, d } = preparar();
    const lev = () => d.orc!.linhas.filter((l) => l.t === "mat" && l.d.startsWith("Levantamento · ")).map((l) => (l.t === "mat" ? l.d.slice(15) : ""));
    A.campo(d.id, "tem_elevador", "Sim");
    A.campo(d.id, "estacionamento", "Pago");
    expect(lev().some((x) => x === "Proteção do elevador")).toBe(true);
    const sid = SID("MOMRCC");
    const sv = servicoDoCatalogo(sid, S)!;
    S.svc[sid] = sv;
    d.orc!.linhas.push({ t: "svc", sid, q: 1, cu: 0, pu: sv.preco });
    A.campo(d.id, "tem_elevador", "Sim");
    expect(lev().some((x) => /Proteção|Plástico|Cobrir|Transporte/.test(x))).toBe(false);
    expect(lev().some((x) => x.startsWith("Estacionamento pago"))).toBe(true);
  });
});

describe("o valor das prestações", () => {
  it("cada uma ao cêntimo e a última com o resto: a soma é sempre o total (o caso real: 64 971,81 €)", async () => {
    const { valoresPrestacoes } = await import("./planoObra");
    const v = valoresPrestacoes(64971.81, [{ p: 0.3 }, { p: 0.2 }, { p: 0.15 }, { p: 0.1 }, { p: 0.25 }]);
    expect(v).toEqual([19491.54, 12994.36, 9745.77, 6497.18, 16242.96]);
    expect(Math.round(v.reduce((a, x) => a + x, 0) * 100) / 100).toBe(64971.81);
  });
});

describe("o plano de uma obra grande (o caso real até à obra)", () => {
  it("as partes dos «MO Modelo» vão para a fase do ofício, sem recuar; o nome curto e as iniciais", async () => {
    const { montarAnabela, avancarAteObra } = await import("./casos/montarAnabela");
    const { iniciais } = await import("./obraOps");
    const { nomeCurtoTarefa } = await import("./ObraOperacoes");
    const S = estadoVazio("org-teste");
    const { usarTecnicos } = await import("./equipa/tecnicos");
    usarTecnicos(S.tecnicos!);
    const A = acoes(S, () => {}, (fn) => fn());
    const M = montarAnabela(S, A);
    avancarAteObra(S, A, M.id);
    const p = S.deals.find((x) => x.id === M.id)!.obra.plano!;
    expect(p.tasks.length).toBeGreaterThan(40);
    const wc = p.tasks.filter((t) => t.nome.startsWith("MO Modelo Remodelação Completa - Casa de Banho Comum · "));
    expect(wc.map((t) => t.fase)).toEqual([...wc.map((t) => t.fase)].sort());
    expect(new Set(wc.map((t) => t.fase)).size).toBeGreaterThan(2);
    expect(wc[0].fase).toBe(1);
    expect(wc.at(-1)!.fase).toBe(4);
    expect(nomeCurtoTarefa("MO Modelo Remodelação Completa - Cozinha · demolição e remoção")).toBe("Cozinha · Demolição e remoção");
    expect(nomeCurtoTarefa("MO Modelo Remodelação Completa - Cozinha")).toBe("Remodelação · Cozinha");
    expect(nomeCurtoTarefa("Mão de Obra - Pintura e Estuque Paredes m2")).toBe("Pintura e Estuque Paredes m2");
    expect(iniciais("Servente (teste)")).toBe("S");
    expect(iniciais("Técnico de gás (teste)")).toBe("TD");
  });
});
