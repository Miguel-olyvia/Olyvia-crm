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
  it("só com negócios terminados e nada por ligar: nenhum", () => {
    expect(passoDaLista(com({ ganhos: 2 }))).toBe("nenhum");
    expect(passoDaLista(com({ perdidos: 1 }))).toBe("nenhum");
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
    expect(passoDaLista(com({ ...terminado, ultimaVisitaFeitaEm: "2026-08-01T09:00:00Z" }))).toBe("nenhum");
  });
  it("aproximação: com negócios terminados e sem data do último negócio, uma visita feita conta", () => {
    expect(passoDaLista(com({ ganhos: 1, ultimaVisitaFeitaEm: "2026-08-01T09:00:00Z" }))).toBe("criarNegocio");
  });
  it("datas que não são datas não rebentam e não contam como visita feita posterior", () => {
    expect(passoDaLista(com({ perdidos: 1, ultimoNegocioEm: "lixo", ultimaVisitaFeitaEm: "lixo" }))).toBe("nenhum");
  });
});
