import { describe, expect, it } from "vitest";
import { adaptarLinhaQuadro, valorOuZero } from "./adaptarCartaoQuadro";
import { linhaNegocio, linhaQuadro } from "./quadroPessoasTestUtil";

const HOJE = "2026-10-21";
const cartao = (l: Parameters<typeof adaptarLinhaQuadro>[0], hoje = HOJE) => adaptarLinhaQuadro(l, hoje)?.cartao ?? null;

describe("adaptarLinhaQuadro: pessoas em abordagem", () => {
  it("visitas feitas por ligar dão criarNegocio, mesmo com outras coisas por ligar", () => {
    const c = cartao(linhaQuadro("a", { coluna: "visita", por_ligar_visitas: 2, por_ligar_visitas_feitas: 1, por_ligar_contactos: 3 }));
    expect(c?.passo).toBe("criarNegocio");
  });

  it("visitas por fazer dão fecharLevantamento", () => {
    expect(cartao(linhaQuadro("a", { coluna: "visita", por_ligar_visitas: 1 }))?.passo).toBe("fecharLevantamento");
  });

  it("só contactos por ligar dão marcarVisita", () => {
    expect(cartao(linhaQuadro("a", { coluna: "contactado", por_ligar_contactos: 1 }))?.passo).toBe("marcarVisita");
  });

  it("nada por ligar dá registarChamada", () => {
    expect(cartao(linhaQuadro("a"))?.passo).toBe("registarChamada");
  });

  it("o cartão da pessoa leva o prefixo no id, o entity_id em pessoaId e nenhum valor nem trabalho", () => {
    const c = cartao(linhaQuadro("a", { valor: 500, titulo: "x", papel: "cliente" }));
    expect(c).toMatchObject({
      id: "pessoa-a", tipo: "pessoa", pessoaId: "a", nome: "Pessoa a", papel: "cliente", coluna: "porContactar", trabalho: null, valor: null,
    });
  });

  it("o prazo é o dia de Lisboa e atrasa quando é anterior a hoje", () => {
    const c = cartao(linhaQuadro("a", { proximo_prazo_em: "2026-10-20T10:00:00Z" }));
    expect(c).toMatchObject({ prazo: "2026-10-20", atrasado: true });
    expect(cartao(linhaQuadro("b", { proximo_prazo_em: "2026-10-21T10:00:00Z" }))).toMatchObject({ prazo: "2026-10-21", atrasado: false });
  });

  it("sem prazo não atrasa", () => {
    expect(cartao(linhaQuadro("a"))).toMatchObject({ prazo: null, atrasado: false });
  });

  it("fronteira da meia-noite de Lisboa nas mudanças de hora de 2026 (29/03 e 25/10)", () => {
    // 24/10: ainda hora de verão (UTC+1): 23:30Z já é 00:30 do dia 25.
    expect(cartao(linhaQuadro("a", { proximo_prazo_em: "2026-10-24T23:30:00Z" }), "2026-10-25")).toMatchObject({ prazo: "2026-10-25", atrasado: false });
    // 25/10: a hora de verão acabou de madrugada (UTC+0): 23:30Z ainda é dia 25, e atrasa em relação ao dia 26.
    expect(cartao(linhaQuadro("b", { proximo_prazo_em: "2026-10-25T23:30:00Z" }), "2026-10-26")).toMatchObject({ prazo: "2026-10-25", atrasado: true });
    // 28/03: ainda inverno (UTC+0): 23:30Z é dia 28.
    expect(cartao(linhaQuadro("c", { proximo_prazo_em: "2026-03-28T23:30:00Z" }), "2026-03-29")).toMatchObject({ prazo: "2026-03-28", atrasado: true });
    // 29/03: a hora de verão começou de madrugada (UTC+1): 23:30Z já é 00:30 do dia 30.
    expect(cartao(linhaQuadro("d", { proximo_prazo_em: "2026-03-29T23:30:00Z" }), "2026-03-30")).toMatchObject({ prazo: "2026-03-30", atrasado: false });
  });

  it("um prazo ilegível conta como sem prazo", () => {
    expect(cartao(linhaQuadro("a", { proximo_prazo_em: "lixo" }))).toMatchObject({ prazo: null, atrasado: false });
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
  it("o cursor é a chave tal como veio e o cartao_id CRU (sem prefixo, também na pessoa)", () => {
    const r = adaptarLinhaQuadro(linhaQuadro("a", { chave_ordem: "2026-10-20T10:00:00.123456Z" }), HOJE);
    expect(r?.cartao.id).toBe("pessoa-a");
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
