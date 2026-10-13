import { afterEach, describe, expect, it } from "vitest";
import { seed } from "../motor";
import { ehGanho } from "../negociosApp";
import {
  CAMPOS_DISPONIVEIS, ORDEM_INICIAL, campanhasExemplo, camposDoModelo, camposPorJuntar, codigoPartilha, investimentoDe, leadsDaCampanha,
  listaCampanhas, metricas, moverCampo, negociosComToque, pertence, proximaOrdem, semCampanha, valorDeal, type Campanha,
} from "./campanhas";
import { aceitarSubmissao, criarCampanha, esquecerCampanhas, lerCampanhas, rejeitarSubmissao } from "./campanhasStore";

afterEach(esquecerCampanhas);

const contexto = () => {
  const S = seed();
  return { S, negocios: negociosComToque(S), campanhas: campanhasExemplo() };
};
const achar = (cs: Campanha[], nome: string): Campanha => cs.find((c) => c.nome === nome)!;

describe("campanhas · a quem pertence cada lead", () => {
  it("pela campanha do primeiro toque; sem campanha, pela origem; uma UTM por mapear não entra em nenhuma", () => {
    expect(pertence({ regra: { campanha: "Cozinhas outubro" } }, { origem: "Meta Ads", campanha: "Cozinhas outubro", porMapear: false })).toBe(true);
    expect(pertence({ regra: { origem: "Site" } }, { origem: "Site", campanha: "Cozinhas outubro", porMapear: false })).toBe(false);
    expect(pertence({ regra: { origem: "TikTok Ads" } }, { origem: "TikTok Ads", campanha: null, porMapear: true })).toBe(false);
    expect(pertence({ regra: { origem: "Site" } }, undefined)).toBe(false);
  });
  it("cada negócio de exemplo conta numa campanha no máximo; só a Ana Martins (UTM por mapear) fica sem campanha", () => {
    const { negocios, campanhas } = contexto();
    for (const n of negocios) expect(campanhas.filter((c) => pertence(c, n.toque)).length).toBeLessThanOrEqual(1);
    expect(semCampanha(campanhas, negocios)).toEqual(["Ana Martins"]);
    const total = campanhas.reduce((a, c) => a + metricas(c, negocios, contexto().S).leads, 0);
    expect(total).toBe(negocios.length - 1);
  });
});

describe("campanhas · as contas", () => {
  it("Cozinhas outubro: 3 leads, 0 ganhos, 1.130 € investidos em dois anúncios, custo por lead = investimento / leads, sem custo por ganho", () => {
    const { S, negocios, campanhas } = contexto();
    const c = achar(campanhas, "Cozinhas outubro");
    const m = metricas(c, negocios, S);
    expect(m).toMatchObject({ leads: 3, ganhos: 0, receita: 0, investimento: 1130, custoGanho: null });
    expect(m.custoLead).toBeCloseTo(1130 / 3);
    expect(investimentoDe(c)).toBe(1130);
  });
  it("a receita é a soma do valor dos negócios GANHOS da campanha (nunca escrita); os abertos com orçamento não contam", () => {
    const { S, negocios, campanhas } = contexto();
    for (const c of campanhas) {
      const seus = negocios.filter((n) => pertence(c, n.toque)).map((n) => n.deal);
      const esperado = seus.filter(ehGanho).reduce((a, d) => a + valorDeal(d, S), 0);
      expect(metricas(c, negocios, S).receita).toBeCloseTo(esperado);
    }
    const outdoor = metricas(achar(campanhas, "Outdoor A1"), negocios, S);
    expect(outdoor.ganhos).toBe(0);
    expect(outdoor.receita).toBe(0); // a Carla Nunes tem orçamento, mas não ganhou
  });
  it("sem investimento não há custo por lead nem por ganho (não se divide por zero)", () => {
    const { S, negocios, campanhas } = contexto();
    const m = metricas(achar(campanhas, "Site · pedido de orçamento"), negocios, S);
    expect(m.investimento).toBe(0);
    expect(m.custoLead).toBeNull();
    expect(m.custoGanho).toBeNull();
    expect(m.ganhos).toBe(2);
  });
  it("o funil desce: cada passo tem no máximo o anterior; o último é o número de ganhos", () => {
    const { S, negocios, campanhas } = contexto();
    for (const c of campanhas) {
      const m = metricas(c, negocios, S);
      expect(m.funil[0]).toBe(m.leads);
      expect(m.funil[4]).toBe(m.ganhos);
      for (let i = 1; i < m.funil.length; i++) expect(m.funil[i]).toBeLessThanOrEqual(m.funil[i - 1]);
    }
  });
  it("as leads da campanha: nome, fase e valor; os ganhos e perdidos dizem-no", () => {
    const { S, negocios, campanhas } = contexto();
    const r = leadsDaCampanha(achar(campanhas, "Recomendações"), negocios, S);
    expect(r.map((l) => l.nome)).toEqual(["Hugo Matos", "Joana Ribeiro", "Duarte Gouveia"]);
    expect(r[1]).toMatchObject({ ganho: true, fase: "Ganho · Obra" });
    expect(r[1].valor).toBeGreaterThan(0);
    expect(r[2]).toMatchObject({ perdido: true, fase: "Perdido em Visita", valor: null });
  });
});

describe("campanhas · a lista", () => {
  it("começa por ganhos (do maior para o menor), com o nome a desempatar", () => {
    const { S, negocios, campanhas } = contexto();
    const l = listaCampanhas(campanhas.map((c) => ({ c, m: metricas(c, negocios, S) })), "", ORDEM_INICIAL);
    const g = l.map((x) => x.m.ganhos);
    expect(g).toEqual([...g].sort((a, b) => b - a));
    expect(l[0].c.nome).toBe("Site · pedido de orçamento");
  });
  it("os custos vazios ficam no fim, nos dois sentidos", () => {
    const { S, negocios, campanhas } = contexto();
    const linhas = campanhas.map((c) => ({ c, m: metricas(c, negocios, S) }));
    for (const dir of ["asc", "desc"] as const) {
      const v = listaCampanhas(linhas, "", { col: "custoLead", dir }).map((x) => x.m.custoLead);
      const primeiroVazio = v.indexOf(null);
      expect(v.slice(primeiroVazio).every((x) => x === null)).toBe(true);
    }
  });
  it("a pesquisa procura no nome, no canal e em onde anuncia, sem acentos", () => {
    const { S, negocios, campanhas } = contexto();
    const linhas = campanhas.map((c) => ({ c, m: metricas(c, negocios, S) }));
    expect(listaCampanhas(linhas, "google", ORDEM_INICIAL).map((x) => x.c.nome)).toEqual(["Cozinhas outubro"]);
    expect(listaCampanhas(linhas, "recomendacoes", ORDEM_INICIAL).map((x) => x.c.nome)).toEqual(["Recomendações"]);
    expect(listaCampanhas(linhas, "offline", ORDEM_INICIAL)).toHaveLength(2);
  });
  it("clicar no mesmo cabeçalho troca o sentido; noutro começa pelo maior (ou A→Z no nome)", () => {
    expect(proximaOrdem(ORDEM_INICIAL, "ganhos")).toEqual({ col: "ganhos", dir: "asc" });
    expect(proximaOrdem(ORDEM_INICIAL, "receita")).toEqual({ col: "receita", dir: "desc" });
    expect(proximaOrdem(ORDEM_INICIAL, "nome")).toEqual({ col: "nome", dir: "asc" });
  });
});

describe("campanhas · formulário e partilha", () => {
  it("cada modelo traz os seus campos, com Nome e Telefone obrigatórios", () => {
    const f = camposDoModelo("visita", "x");
    expect(f.map((c) => c.rotulo)).toEqual(["Nome", "Telefone", "Morada", "Dia preferido", "Período"]);
    expect(f.filter((c) => c.obrigatorio).map((c) => c.rotulo)).toEqual(["Nome", "Telefone"]);
    expect(new Set(f.map((c) => c.id)).size).toBe(f.length);
    expect(camposPorJuntar(f)).toHaveLength(CAMPOS_DISPONIVEIS.length - f.length);
  });
  it("mover um campo troca-o com o vizinho; fora dos limites fica igual", () => {
    const f = camposDoModelo("contacto", "x");
    expect(moverCampo(f, 2, -1).map((c) => c.rotulo)).toEqual(["Nome", "Mensagem", "Telefone"]);
    expect(moverCampo(f, 0, -1)).toEqual(f);
    expect(moverCampo(f, 2, 1)).toEqual(f);
  });
  it("o código a partilhar: link, iframe com o link e pixel com o id da campanha", () => {
    const c = { id: "cmp-x", nome: "Cozinhas Novembro" };
    expect(codigoPartilha(c, "link")).toBe("https://formularios.olyvia.pt/f/cozinhas-novembro");
    expect(codigoPartilha(c, "iframe")).toContain('src="https://formularios.olyvia.pt/f/cozinhas-novembro?embed=1"');
    expect(codigoPartilha(c, "pixel")).toContain('data-campanha="cmp-x"');
  });
});

describe("campanhas · a store em memória", () => {
  it("criar junta a campanha, com o formulário do modelo e sem anúncios", () => {
    const antes = lerCampanhas().length;
    const c = criarCampanha("  Cozinhas novembro ", "Pesquisa", "contacto");
    expect(lerCampanhas()).toHaveLength(antes + 1);
    expect(c).toMatchObject({ nome: "Cozinhas novembro", canal: "Pesquisa", anuncios: [], nova: true });
    expect(c.campos.map((f) => f.rotulo)).toEqual(["Nome", "Telefone", "Mensagem"]);
  });
  it("aceitar passa a submissão a lead (conta nas leads); rejeitar só a tira", () => {
    const { S, negocios } = contexto();
    const id = "cmp-coz-out";
    const leads0 = metricas(lerCampanhas().find((c) => c.id === id)!, negocios, S).leads;
    aceitarSubmissao(id, "sub-coz-1");
    rejeitarSubmissao(id, "sub-coz-2");
    const c = lerCampanhas().find((x) => x.id === id)!;
    expect(c.pendentes).toHaveLength(0);
    expect(c.aceites.map((s) => s.nome)).toEqual(["Sofia Barata"]);
    expect(metricas(c, negocios, S).leads).toBe(leads0 + 1);
    expect(leadsDaCampanha(c, negocios, S)[0]).toMatchObject({ nome: "Sofia Barata", fase: "Lead (aceite agora)" });
  });
});
