// Os valores que a ficha (neg_ficha_pessoa) já traz e os adaptadores deitavam fora: quem fez a chamada e a próxima ação, o nome do quadro da visita e a
// morada da obra gravada no levantamento.
import { describe, expect, it } from "vitest";
import { adaptarRegistos } from "./adaptarRegistos";
import { PESSOA_ID, contactoDb, fichaDb, levantamentoDb, seccaoDb, visitaDb } from "./fichaFabrica";

describe("adaptarRegistos: a chamada guarda quem a fez e a próxima ação", () => {
  const contacto = (sobre: Parameters<typeof contactoDb>[0]) => adaptarRegistos(fichaDb({ contactos: seccaoDb([contactoDb(sobre)]) })).contactos[0];

  it("guarda o nome de quem registou e o dia e a hora da próxima ação (hora de Lisboa)", () => {
    const c = contacto({ criado_por_nome: "  Rita Gomes ", proxima_acao_em: "2026-10-15T14:30:00Z" });
    expect(c.criadoPor).toBe("Rita Gomes");
    expect(c.proximaAcao).toEqual({ data: "2026-10-15", hora: "15:30" });
    expect(c.pessoaId).toBe(PESSOA_ID);
  });
  it("sem nome nem próxima ação, os campos não existem", () => {
    const c = contacto({ criado_por_nome: "   ", proxima_acao_em: null });
    expect(c).not.toHaveProperty("criadoPor");
    expect(c).not.toHaveProperty("proximaAcao");
  });
  it("uma data da próxima ação que não se lê não inventa nada", () => {
    expect(contacto({ proxima_acao_em: "lixo" })).not.toHaveProperty("proximaAcao");
  });
});

describe("adaptarRegistos: o quadro da visita", () => {
  const agenda = (sobre: Parameters<typeof visitaDb>[0]) => adaptarRegistos(fichaDb({ visitas: seccaoDb([visitaDb(sobre)]) })).visitas[0].agenda;

  it("guarda o nome do quadro", () => {
    expect(agenda({ board_id: "q1", board_nome: " Agenda Porto " })?.boardNome).toBe("Agenda Porto");
  });
  it("sem nome do quadro, não há boardNome", () => {
    expect(agenda({ board_nome: null })).not.toHaveProperty("boardNome");
    expect(agenda({ board_nome: "  " })).not.toHaveProperty("boardNome");
  });
});

describe("adaptarRegistos: a morada gravada no levantamento", () => {
  const levantamento = (morada: Parameters<typeof levantamentoDb>[0]) => adaptarRegistos(fichaDb({ levantamentos: seccaoDb([levantamentoDb(morada)]) })).levantamentos[0];

  it("guarda rua, código postal, localidade e andar, e a origem continua a guardar-se", () => {
    const l = levantamento({ morada: { rua: " Rua da Obra 5 ", codigo_postal: "4000-010", localidade: "Porto", andar: "2.º Dto", origem: "manual" } });
    expect(l.morada).toEqual({ rua: "Rua da Obra 5", codigoPostal: "4000-010", localidade: "Porto", andar: "2.º Dto" });
    expect(l.moradaOrigem).toBe("manual");
  });
  it("campos em falta ficam vazios, sem rebentar", () => {
    const l = levantamento({ morada: { rua: "Rua A", codigo_postal: null, localidade: null, andar: null } });
    expect(l.morada).toEqual({ rua: "Rua A", codigoPostal: "", localidade: "", andar: "" });
  });
  it("sem morada, ou com todos os campos vazios, não há morada", () => {
    expect(levantamento({ morada: null })).not.toHaveProperty("morada");
    expect(levantamento({ morada: { rua: " ", codigo_postal: null, localidade: "", andar: null, origem: "entidade" } })).not.toHaveProperty("morada");
  });
});
