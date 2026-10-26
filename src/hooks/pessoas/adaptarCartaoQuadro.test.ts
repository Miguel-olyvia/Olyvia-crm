import { describe, expect, it } from "vitest";
import { adaptarLinhaQuadro, valorOuZero } from "./adaptarCartaoQuadro";
import { linhaNegocio, linhaQuadro } from "./quadroPessoasTestUtil";

const HOJE = "2026-10-21";
const cartao = (l: Parameters<typeof adaptarLinhaQuadro>[0], hoje = HOJE) => adaptarLinhaQuadro(l, hoje)?.cartao ?? null;

describe("adaptarLinhaQuadro: negócios nas três primeiras colunas (o quadro só tem negócios)", () => {
  it("porContactar dá registarChamada, contactado dá marcarVisita e visita dá fazerLevantamento", () => {
    expect(cartao(linhaNegocio("a", "porContactar"))?.passo).toBe("registarChamada");
    expect(cartao(linhaNegocio("a", "contactado"))?.passo).toBe("marcarVisita");
    expect(cartao(linhaNegocio("a", "visita"))?.passo).toBe("fazerLevantamento");
  });

  it("os contadores por ligar já não decidem o passo", () => {
    const c = cartao(linhaNegocio("a", "contactado", { por_ligar_visitas: 2, por_ligar_visitas_feitas: 1, por_ligar_contactos: 3 }));
    expect(c?.passo).toBe("marcarVisita");
  });

  it("o cartão é de negócio: id do negócio, entity_id em pessoaId, título como trabalho e sem valor nestas colunas", () => {
    const c = cartao(linhaNegocio("a", "porContactar", { valor: 500, papel: "cliente" }));
    expect(c).toMatchObject({
      id: "a", tipo: "negocio", pessoaId: "pessoa-de-a", nome: "Pessoa a", papel: "cliente", coluna: "porContactar", trabalho: "Trabalho a", valor: null,
    });
  });

  it("nas três primeiras colunas o prazo é o dia de Lisboa e atrasa quando é anterior a hoje", () => {
    const c = cartao(linhaNegocio("a", "porContactar", { proximo_prazo_em: "2026-10-20T10:00:00Z" }));
    expect(c).toMatchObject({ prazo: "2026-10-20", atrasado: true });
    expect(cartao(linhaNegocio("b", "visita", { proximo_prazo_em: "2026-10-21T10:00:00Z" }))).toMatchObject({ prazo: "2026-10-21", atrasado: false });
  });

  it("sem prazo, ou com prazo ilegível, não atrasa", () => {
    expect(cartao(linhaNegocio("a", "contactado"))).toMatchObject({ prazo: null, atrasado: false });
    expect(cartao(linhaNegocio("a", "contactado", { proximo_prazo_em: "lixo" }))).toMatchObject({ prazo: null, atrasado: false });
  });

  it("fronteira da meia-noite de Lisboa nas mudanças de hora de 2026 (29/03 e 25/10)", () => {
    const prazo = (em: string, hoje: string) => cartao(linhaNegocio("a", "porContactar", { proximo_prazo_em: em }), hoje);
    expect(prazo("2026-10-24T23:30:00Z", "2026-10-25")).toMatchObject({ prazo: "2026-10-25", atrasado: false });
    expect(prazo("2026-10-25T23:30:00Z", "2026-10-26")).toMatchObject({ prazo: "2026-10-25", atrasado: true });
    expect(prazo("2026-03-28T23:30:00Z", "2026-03-29")).toMatchObject({ prazo: "2026-03-28", atrasado: true });
    expect(prazo("2026-03-29T23:30:00Z", "2026-03-30")).toMatchObject({ prazo: "2026-03-30", atrasado: false });
  });

  it("uma linha de pessoa (tipo antigo) é descartada: já não há cartões de pessoa", () => {
    expect(adaptarLinhaQuadro(linhaQuadro("a", { tipo: "pessoa" }), HOJE)).toBeNull();
  });
});

describe("adaptarLinhaQuadro: negócios", () => {
  it("levantamento dá fazerLevantamento e nunca leva valor", () => {
    const c = cartao(linhaNegocio("n", "levantamento", { valor: 900 }));
    expect(c).toMatchObject({ id: "n", tipo: "negocio", pessoaId: "pessoa-de-n", trabalho: "Trabalho n", passo: "fazerLevantamento", valor: null });
  });

  it("orçamento com orçamentos dá criarProposta", () => {
    expect(cartao(linhaNegocio("n", "orcamento", { n_orcamentos: 2, valor: 100 }))).toMatchObject({ passo: "criarProposta", valor: 100 });
  });

  it("orçamento sem orçamentos (levantamento já feito) NÃO diz fazerLevantamento: não há passo", () => {
    expect(cartao(linhaNegocio("n", "orcamento", { n_orcamentos: 0 }))?.passo).toBe("nenhum");
  });

  it("orçamento sem orçamentos leva a marca «semOrcamentos» (só o texto muda; o passo continua nenhum); só nessa coluna e só sem orçamentos", () => {
    expect(cartao(linhaNegocio("n", "orcamento", { n_orcamentos: 0 }))).toMatchObject({ passo: "nenhum", semOrcamentos: true });
    expect(cartao(linhaNegocio("n", "orcamento", { n_orcamentos: null }))?.semOrcamentos).toBe(true);
    expect(cartao(linhaNegocio("n", "orcamento", { n_orcamentos: 1 }))?.semOrcamentos).toBeUndefined();
    expect(cartao(linhaNegocio("n", "proposta", { n_orcamentos: 0, proposta_status: "draft" }))?.semOrcamentos).toBeUndefined();
    expect(cartao(linhaNegocio("n", "levantamento", { n_orcamentos: 0 }))?.semOrcamentos).toBeUndefined();
  });

  it("proposta: rascunho, aceite sem contrato, outro estado e estado desconhecido", () => {
    expect(cartao(linhaNegocio("n", "proposta", { proposta_status: "draft" }))?.passo).toBe("enviarProposta");
    expect(cartao(linhaNegocio("n", "proposta", { proposta_status: "accepted" }))?.passo).toBe("criarContrato");
    expect(cartao(linhaNegocio("n", "proposta", { proposta_status: "sent" }))?.passo).toBe("esperarCliente");
    expect(cartao(linhaNegocio("n", "proposta", { proposta_status: "estado-novo" }))?.passo).toBe("esperarCliente");
    expect(cartao(linhaNegocio("n", "proposta", { proposta_status: null }))?.passo).toBe("esperarCliente");
  });

  it("contrato dá recolherAssinatura", () => {
    expect(cartao(linhaNegocio("n", "contrato"))?.passo).toBe("recolherAssinatura");
  });

  it("pronto a ganhar tem prioridade sobre a coluna e põe o selo", () => {
    const c = cartao(linhaNegocio("n", "contrato", { pronto_a_ganhar: true, valor: 10 }));
    expect(c).toMatchObject({ passo: "ganharNegocio", prontoAGanhar: true });
    expect(cartao(linhaNegocio("m", "proposta", { pronto_a_ganhar: true }))?.passo).toBe("ganharNegocio");
  });

  it("o valor numeric pode vir como texto; texto ilegível dá null", () => {
    expect(cartao(linhaNegocio("n", "proposta", { valor: "1234.50" }))?.valor).toBe(1234.5);
    expect(cartao(linhaNegocio("n", "proposta", { valor: "abc" }))?.valor).toBeNull();
    expect(cartao(linhaNegocio("n", "proposta", { valor: null }))?.valor).toBeNull();
  });

  it("negócio não tem prazo nem atraso", () => {
    expect(cartao(linhaNegocio("n", "proposta", { proximo_prazo_em: "2026-01-01T00:00:00Z" }))).toMatchObject({ prazo: null, atrasado: false });
  });

  it("parado: só em orçamento e proposta, e só acima de 7 dias", () => {
    const parado = (coluna: string, desde: string) => cartao(linhaNegocio("n", coluna, { n_orcamentos: 1, parado_desde: desde }))?.paradoDias;
    expect(parado("orcamento", "2026-10-13T12:00:00Z")).toBe(8);
    expect(parado("proposta", "2026-10-01T12:00:00Z")).toBe(20);
    expect(parado("orcamento", "2026-10-14T12:00:00Z")).toBeUndefined();
    expect(parado("contrato", "2026-09-01T12:00:00Z")).toBeUndefined();
    expect(parado("levantamento", "2026-09-01T12:00:00Z")).toBeUndefined();
  });

  it("parado_desde ilegível ou nulo não põe a linha", () => {
    expect(cartao(linhaNegocio("n", "orcamento", { parado_desde: "lixo" }))?.paradoDias).toBeUndefined();
    expect(cartao(linhaNegocio("n", "orcamento", { parado_desde: null }))?.paradoDias).toBeUndefined();
  });
});

describe("adaptarLinhaQuadro: o cursor e os casos de borda", () => {
  it("o cursor é a chave tal como veio e o cartao_id CRU", () => {
    const r = adaptarLinhaQuadro(linhaQuadro("a", { chave_ordem: "2026-10-20T10:00:00.123456Z" }), HOJE);
    expect(r?.cartao.id).toBe("a");
    expect(r?.cursor).toEqual({ chave: "2026-10-20T10:00:00.123456Z", id: "a" });
    expect(adaptarLinhaQuadro(linhaNegocio("n", "contrato", { chave_ordem: "k" }), HOJE)?.cursor).toEqual({ chave: "k", id: "n" });
  });

  it("sem chave não há cursor", () => {
    expect(adaptarLinhaQuadro(linhaQuadro("a", { chave_ordem: null }), HOJE)?.cursor).toBeNull();
  });

  it("coluna desconhecida: o cartão é descartado", () => {
    expect(adaptarLinhaQuadro(linhaQuadro("a", { coluna: "arquivo" }), HOJE)).toBeNull();
  });

  it("tipo desconhecido: descartado, sem rebentar", () => {
    expect(adaptarLinhaQuadro(linhaQuadro("a", { tipo: "outro" }), HOJE)).toBeNull();
  });

  it("nome nulo dá texto vazio (a UI mostra «Sem nome»); papel desconhecido conta como lead", () => {
    expect(cartao(linhaQuadro("a", { nome: null }))?.nome).toBe("");
    expect(cartao(linhaQuadro("a", { papel: "?" }))?.papel).toBe("lead");
  });

  it("contadores nulos não rebentam", () => {
    const c = cartao(linhaQuadro("a", { por_ligar_contactos: null, por_ligar_visitas: null, por_ligar_visitas_feitas: null }));
    expect(c?.passo).toBe("registarChamada");
  });
});

describe("valorOuZero", () => {
  it("NULL, texto ilegível e infinitos contam como 0; texto numérico converte", () => {
    expect(valorOuZero(null)).toBe(0);
    expect(valorOuZero("abc")).toBe(0);
    expect(valorOuZero(Infinity)).toBe(0);
    expect(valorOuZero("12.5")).toBe(12.5);
    expect(valorOuZero(7)).toBe(7);
  });
});
