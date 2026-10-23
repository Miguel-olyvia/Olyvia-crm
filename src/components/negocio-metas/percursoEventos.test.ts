// Os acontecimentos do percurso de um negócio, por ordem cronológica: contactos, visitas (e o resultado), levantamento, orçamentos, proposta e
// contrato, e a perda. Tudo DERIVA do que o negócio tem ligado e dos seus detalhes: nada se guarda à parte.
import { describe, expect, it } from "vitest";
import { MORADA_VAZIA } from "./moradaObra";
import type { DetalheNegocio } from "./negocioDetalhes";
import type { NegocioMes } from "./negocioMetas";
import { eventosDoPercurso } from "./percursoEventos";
import type { ContactoPessoa, LevantamentoPessoa, RegistosDaPessoa, VisitaPessoa } from "./registosTipos";
import { REGISTOS_VAZIOS } from "./registosTipos";

const negocio = (extra: Partial<NegocioMes> = {}): NegocioMes => ({
  id: "n1", pessoaId: "p1", pessoa: "Ana", servico: "Cozinha", comercial: "Rui", dias: 20, parado: null, proximoPrazo: null,
  contacto: { telefone: null, email: null }, orcamentos: [], proposta: null, contrato: null, ...extra,
});
const contacto = (id: string, data: string, extra: Partial<ContactoPessoa> = {}): ContactoPessoa => ({
  id, pessoaId: "p1", data, resultado: "atendeuInteressado", nota: "", negocioId: "n1", ...extra,
});
const visita = (id: string, data: string, extra: Partial<VisitaPessoa> = {}): VisitaPessoa => ({
  id, pessoaId: "p1", negocioId: "n1", data, hora: "10:00", feitoPor: "Rui", estado: "feita", tipo: "levantamento", quemVaiEstar: "", duracao: "",
  morada: MORADA_VAZIA, igualALead: true, nota: "", ...extra,
});
const levantamento = (id: string, data: string): LevantamentoPessoa => ({
  id, pessoaId: "p1", visitaId: null, data, feitoPor: "Rui", negocioId: "n1",
  rascunho: { linhas: [{ id: "l1", divisao: "cozinha", trabalho: "outro", trabalhoOutro: "Bancada", medida: "3", unidade: "m2", observacoes: "" }], observacoes: "", respostas: {} },
});
const registos = (r: Partial<RegistosDaPessoa>): RegistosDaPessoa => ({ ...REGISTOS_VAZIOS, ...r });
const tipos = (e: ReturnType<typeof eventosDoPercurso>) => e.map((x) => x.tipo);

describe("eventosDoPercurso", () => {
  it("junta contactos, visitas, levantamento, orçamentos, proposta e contrato por ordem cronológica", () => {
    const n = negocio({ orcamentos: [{ id: "o1", valor: 1000, escolhido: true }], proposta: { estado: "enviada" }, contrato: { estado: "pendente" } });
    const detalhe: DetalheNegocio = {
      orcamentos: { o1: { data: "2026-10-05", estado: "aceite" } }, proposta: { enviadaEm: "2026-10-06", orcamentoIds: ["o1"] },
      contrato: { criadoEm: "2026-10-08" },
    };
    const e = eventosDoPercurso(n, registos({
      contactos: [contacto("c2", "2026-10-02"), contacto("c1", "2026-10-01")], visitas: [visita("v1", "2026-10-03")], levantamentos: [levantamento("l1", "2026-10-04")],
    }), detalhe, undefined);
    expect(tipos(e)).toEqual(["contacto", "contacto", "visita", "levantamento", "orcamento", "proposta", "contrato"]);
    expect(e.map((x) => x.data)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-08"]);
  });

  it("no mesmo dia ordena pela hora e, sem hora, pelo tipo (contacto, visita, levantamento, orçamento...)", () => {
    const e = eventosDoPercurso(negocio(), registos({
      contactos: [contacto("c1", "2026-10-01", { hora: "15:00" })], visitas: [visita("v1", "2026-10-01", { hora: "09:00" })],
      levantamentos: [levantamento("l1", "2026-10-01")],
    }), null, undefined);
    expect(tipos(e)).toEqual(["visita", "contacto", "levantamento"]);
  });

  it("a visita leva o estado e o resultado; o contacto leva o resultado e a nota", () => {
    const e = eventosDoPercurso(negocio(), registos({
      contactos: [contacto("c1", "2026-10-01", { resultado: "naoAtendeu", nota: "Ligar de tarde" })],
      visitas: [visita("v1", "2026-10-02", { estado: "feita", resultado: "interessado" })],
    }), null, undefined);
    expect(e[0]).toMatchObject({ tipo: "contacto", resultado: "naoAtendeu", nota: "Ligar de tarde" });
    expect(e[1]).toMatchObject({ tipo: "visita", estado: "feita", resultado: "interessado" });
  });

  it("um orçamento leva o valor, se está escolhido e o estado do detalhe; sem detalhe fica sem data e sem estado", () => {
    const n = negocio({ orcamentos: [{ id: "o1", valor: 500, escolhido: false }, { id: "o2", valor: 900, escolhido: true }] });
    const e = eventosDoPercurso(n, registos({}), { orcamentos: { o1: { data: "2026-10-03", estado: "recusado" } } }, undefined);
    expect(e.map((x) => x.tipo === "orcamento" && [x.valor, x.escolhido, x.estado])).toEqual([[500, false, "recusado"], [900, true, undefined]]);
  });

  it("um acontecimento sem data (proposta em rascunho) fica logo a seguir ao que já lá estava, e não no fim de tudo", () => {
    const n = negocio({ orcamentos: [{ id: "o1", valor: 1000, escolhido: true }], proposta: { estado: "rascunho" } });
    const e = eventosDoPercurso(n, registos({ contactos: [contacto("c1", "2026-10-09")] }), { orcamentos: { o1: { data: "2026-10-05", estado: "rascunho" } } }, undefined);
    expect(tipos(e)).toEqual(["orcamento", "proposta", "contacto"]);
    expect(e[1]).toMatchObject({ tipo: "proposta", data: "", estado: "rascunho" });
  });

  it("um negócio perdido acaba com a perda: o motivo, a fase em que se perdeu e o dia", () => {
    const e = eventosDoPercurso(negocio({ orcamentos: [{ id: "o1", valor: 1, escolhido: true }] }), registos({ contactos: [contacto("c1", "2026-10-01")] }), null,
      { motivo: "Preço", mes: "2026-10", data: "2026-10-12", fase: "proposta" });
    expect(e[e.length - 1]).toEqual({ tipo: "perda", chave: "perda", data: "2026-10-12", motivo: "Preço", fase: "proposta" });
  });

  it("um negócio de exemplo antigo, sem registos ligados, mostra as visitas e o levantamento que trazia", () => {
    const n = negocio({
      levantamento: { data: "2026-10-04", feitoPor: "Rui", estado: "feito", linhas: [], observacoes: "" },
      visitas: [{ ...visita("v1", "2026-10-03"), pessoaId: undefined, negocioId: undefined } as never],
    });
    expect(tipos(eventosDoPercurso(n, registos({}), null, undefined))).toEqual(["visita", "levantamento"]);
  });

  it("um orçamento sem dia e sem registos fica antes da proposta que tem dia, e a perda é sempre o último, mesmo com um dia anterior", () => {
    const n = negocio({ orcamentos: [{ id: "o1", valor: 50, escolhido: true }], proposta: { estado: "enviada" } });
    const detalhe: DetalheNegocio = { proposta: { enviadaEm: "2026-10-06", orcamentoIds: ["o1"] } };
    const eventos = eventosDoPercurso(n, registos({}), detalhe, { motivo: "Preço", data: "2026-10-02", fase: "proposta" });
    expect(tipos(eventos)).toEqual(["orcamento", "proposta", "perda"]);
  });

  it("sem nada, não há acontecimentos", () => {
    expect(eventosDoPercurso(negocio(), registos({}), null, undefined)).toEqual([]);
  });

  it("não altera o que recebe", () => {
    const r = Object.freeze(registos({ contactos: Object.freeze([contacto("c1", "2026-10-01")]) as never }));
    expect(() => eventosDoPercurso(negocio(), r, null, undefined)).not.toThrow();
  });
});
