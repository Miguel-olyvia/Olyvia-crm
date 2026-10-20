import { describe, expect, it } from "vitest";
import { passoDaLista, type EntradaPasso } from "./passoDaLista";

const base: EntradaPasso = {
  encerrada: null, abertos: 0, ganhos: 0, perdidos: 0, faseEtapa: null, prontoAGanhar: false,
  ultimaVisitaFeitaEm: null, ultimoNegocioEm: null, porLigarContactos: 0, porLigarVisitas: 0, porLigarLevantamentos: 0,
};
const com = (sobre: Partial<EntradaPasso>): EntradaPasso => ({ ...base, ...sobre });

describe("passoDaLista: encerrada", () => {
  it("uma abordagem encerrada não tem passo, mesmo com registos por ligar", () => {
    expect(passoDaLista(com({ encerrada: "semInteresse", porLigarContactos: 2 }))).toBe("nenhum");
  });
});

describe("passoDaLista: com negócio aberto", () => {
  it("pronto a ganhar manda: ganhar o negócio", () => {
    expect(passoDaLista(com({ abertos: 1, prontoAGanhar: true, faseEtapa: "contrato" }))).toBe("ganharNegocio");
  });
  it("fase contrato: recolher a assinatura", () => {
    expect(passoDaLista(com({ abertos: 1, faseEtapa: "contrato" }))).toBe("recolherAssinatura");
  });
  it("fase orçamento: criar a proposta", () => {
    expect(passoDaLista(com({ abertos: 2, faseEtapa: "orcamento" }))).toBe("criarProposta");
  });
  it("sem nenhum documento: fazer o levantamento", () => {
    expect(passoDaLista(com({ abertos: 1, faseEtapa: null }))).toBe("fazerLevantamento");
  });
  it("proposta sem estar pronto: não se sabe (null), nunca um passo inventado", () => {
    expect(passoDaLista(com({ abertos: 1, faseEtapa: "proposta" }))).toBeNull();
  });
});

describe("passoDaLista: sem negócios abertos", () => {
  // ALTERADO: antes dizia «nenhum» (definitivo). Mas a ficha pode dar um passo a quem só tem negócios terminados (voltouAAbordagem: uma
  // submissão resolvida depois do último negócio) e a lista não tem essa fonte (coluna voltou_a_contactar): não se sabe, e não se afirma.
  it("só com negócios terminados e nada por ligar: não se sabe (a ficha pode dar um passo), nunca «nenhum»", () => {
    expect(passoDaLista(com({ ganhos: 2 }))).toBeNull();
    expect(passoDaLista(com({ perdidos: 1 }))).toBeNull();
  });
  it("sem negócios de todo e sem registos: registar a chamada", () => {
    expect(passoDaLista(base)).toBe("registarChamada");
  });
  it("contacto por ligar: marcar a visita", () => {
    expect(passoDaLista(com({ porLigarContactos: 1 }))).toBe("marcarVisita");
  });
  it("visita por fazer: fechar o levantamento (ganha ao contacto)", () => {
    expect(passoDaLista(com({ porLigarContactos: 1, porLigarVisitas: 1 }))).toBe("fecharLevantamento");
  });
  it("visita feita sem negócio: criar o negócio (ganha a tudo o resto)", () => {
    expect(passoDaLista(com({ ultimaVisitaFeitaEm: "2026-10-01T09:00:00Z", porLigarVisitas: 1, porLigarContactos: 1 }))).toBe("criarNegocio");
  });
  it("com negócios terminados, um registo por ligar volta a pôr a pessoa em abordagem", () => {
    expect(passoDaLista(com({ perdidos: 1, porLigarContactos: 1 }))).toBe("marcarVisita");
    expect(passoDaLista(com({ ganhos: 1, porLigarLevantamentos: 1 }))).toBe("registarChamada");
  });
  it("aproximação: com negócios terminados, a visita feita só conta se for posterior ao último negócio", () => {
    const terminado = { perdidos: 1, ultimoNegocioEm: "2026-09-01T09:00:00Z" };
    expect(passoDaLista(com({ ...terminado, ultimaVisitaFeitaEm: "2026-10-01T09:00:00Z" }))).toBe("criarNegocio");
    // ALTERADO: «nenhum» passa a null pela mesma razão do primeiro teste deste bloco.
    expect(passoDaLista(com({ ...terminado, ultimaVisitaFeitaEm: "2026-08-01T09:00:00Z" }))).toBeNull();
  });
  // Como o protótipo (`registosParaAbordagem`): conta o DIA de Lisboa, estritamente depois do dia do último negócio; não o instante.
  it("aproximação: uma visita feita no mesmo dia do último negócio, mesmo mais tarde, não conta (compara o dia, não o instante)", () => {
    const terminado = { perdidos: 1, ultimoNegocioEm: "2026-10-01T08:00:00Z" };
    expect(passoDaLista(com({ ...terminado, ultimaVisitaFeitaEm: "2026-10-01T18:00:00Z" }))).toBeNull();
    expect(passoDaLista(com({ ...terminado, ultimaVisitaFeitaEm: "2026-10-02T08:00:00Z" }))).toBe("criarNegocio");
  });
  it("aproximação: o dia é o de Lisboa (23h30 UTC já é o dia seguinte em Lisboa no verão)", () => {
    // Negócio criado às 00h30 de 2 de outubro em Lisboa; a visita, às 11h de 2 de outubro em Lisboa: mesmo dia, não conta.
    expect(passoDaLista(com({ perdidos: 1, ultimoNegocioEm: "2026-10-01T23:30:00Z", ultimaVisitaFeitaEm: "2026-10-02T10:00:00Z" }))).toBeNull();
    // Negócio ao fim do dia 1 em Lisboa (22h), visita 00h30 do dia 2 em Lisboa: dia seguinte, conta.
    expect(passoDaLista(com({ perdidos: 1, ultimoNegocioEm: "2026-10-01T21:00:00Z", ultimaVisitaFeitaEm: "2026-10-01T23:30:00Z" }))).toBe("criarNegocio");
  });
  it("aproximação: com negócios terminados e sem data do último negócio, uma visita feita conta", () => {
    expect(passoDaLista(com({ ganhos: 1, ultimaVisitaFeitaEm: "2026-08-01T09:00:00Z" }))).toBe("criarNegocio");
  });
  it("datas que não são datas não rebentam e não contam como visita feita posterior", () => {
    // ALTERADO: «nenhum» passa a null (sem visita feita válida, só negócios terminados: não se sabe).
    expect(passoDaLista(com({ perdidos: 1, ultimoNegocioEm: "lixo", ultimaVisitaFeitaEm: "lixo" }))).toBeNull();
  });
});
