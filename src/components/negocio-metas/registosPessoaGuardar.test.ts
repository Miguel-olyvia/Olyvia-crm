// Guardar as visitas e o levantamento de uma pessoa (o painel "Visita e levantamento") e escrever o resultado de uma visita: tudo
// sobre os registos da PESSOA, nunca de um pedido. Os registos ligados a um negócio não se mexem.
import { afterEach, describe, expect, it } from "vitest";
import { MORADA_VAZIA } from "./moradaObra";
import type { VisitaNegocio } from "./negocioMetas";
import {
  atualizarVisita, guardarVisitasELevantamento, ligarRegisto, registarLevantamento, registarVisita, registosAtuais, repor,
} from "./registosPessoa";
import type { RascunhoLevantamento } from "./novoNegocio";

afterEach(repor);

const visita = (id: string, extra: Partial<VisitaNegocio> = {}): VisitaNegocio => ({
  id, data: "2026-10-20", hora: "10:00", feitoPor: "Ana", estado: "porFazer", tipo: "levantamento", quemVaiEstar: "", duracao: "",
  morada: { ...MORADA_VAZIA }, igualALead: true, nota: "", ...extra,
});
const medidas: RascunhoLevantamento = {
  linhas: [{ id: "l1", divisao: "cozinha", trabalho: "pintura", trabalhoOutro: "", medida: "12", unidade: "m2" } as never],
  observacoes: "", respostas: {},
};
const VAZIO: RascunhoLevantamento = { linhas: [], observacoes: "", respostas: {} };
const dados = (visitas: VisitaNegocio[], levantamento?: RascunhoLevantamento) => ({
  visitas, levantamento, comercial: "Ana", hoje: "2026-10-13",
});

describe("guardarVisitasELevantamento", () => {
  it("regista as visitas novas da pessoa, por ligar, com ids do store (nunca os do formulário)", () => {
    const r = guardarVisitasELevantamento("p1", dados([visita("v1"), visita("v2", { data: "2026-10-25" })]));
    const vs = registosAtuais().visitas;
    expect(vs.map((v) => v.pessoaId)).toEqual(["p1", "p1"]);
    expect(vs.every((v) => v.negocioId === null)).toBe(true);
    expect(vs.map((v) => v.id)).toEqual(["rv-1", "rv-2"]);
    expect(r.passaramAFeita).toEqual([]);
  });

  it("atualiza uma visita que já existe, mantendo a ligação ao negócio e o resultado", () => {
    const criada = registarVisita({ pessoaId: "p1", ...visita("x"), resultado: "aPensar" });
    ligarRegisto({ tipo: "visita", id: criada.id }, "n1");
    guardarVisitasELevantamento("p1", dados([{ ...visita(criada.id), hora: "11:30" }]));
    const [v] = registosAtuais().visitas;
    expect(v).toMatchObject({ id: criada.id, hora: "11:30", negocioId: "n1", resultado: "aPensar", pessoaId: "p1" });
  });

  it("tira uma visita por ligar que saiu da lista, mas nunca uma ligada a um negócio", () => {
    const livre = registarVisita({ pessoaId: "p1", ...visita("a") });
    const ligada = registarVisita({ pessoaId: "p1", ...visita("b") });
    ligarRegisto({ tipo: "visita", id: ligada.id }, "n1");
    guardarVisitasELevantamento("p1", dados([]));
    expect(registosAtuais().visitas.map((v) => v.id)).toEqual([ligada.id]);
    expect(livre.id).not.toBe(ligada.id);
  });

  it("não mexe nas visitas de outra pessoa", () => {
    registarVisita({ pessoaId: "p2", ...visita("a") });
    guardarVisitasELevantamento("p1", dados([visita("v1")]));
    expect(registosAtuais().visitas.filter((v) => v.pessoaId === "p2")).toHaveLength(1);
  });

  it("diz que visitas passaram a feita e conta o contacto", () => {
    const criada = registarVisita({ pessoaId: "p1", ...visita("a") });
    const r = guardarVisitasELevantamento("p1", dados([{ ...visita(criada.id), estado: "feita" }]));
    expect(r.passaramAFeita.map((v) => v.id)).toEqual([criada.id]);
    const outra = guardarVisitasELevantamento("p1", dados([{ ...visita(criada.id), estado: "feita" }]));
    expect(outra.passaramAFeita).toEqual([]);
  });

  it("o levantamento fica na pessoa, na visita feita, e sem medidas nem notas não se cria", () => {
    guardarVisitasELevantamento("p1", dados([visita("v1", { estado: "feita" })], VAZIO));
    expect(registosAtuais().levantamentos).toEqual([]);
    const r = guardarVisitasELevantamento("p1", dados([visita("v1", { estado: "feita" })], medidas));
    const [l] = registosAtuais().levantamentos;
    expect(l).toMatchObject({ pessoaId: "p1", negocioId: null, feitoPor: "Ana", rascunho: medidas });
    expect(l.visitaId).toBe(registosAtuais().visitas[0].id);
    expect(r.levantamentoMudou).toBe(true);
  });

  it("guardar o mesmo levantamento outra vez atualiza-o em vez de o repetir, e diz que não mudou", () => {
    guardarVisitasELevantamento("p1", dados([], medidas));
    const r = guardarVisitasELevantamento("p1", dados(registosAtuais().visitas as never, medidas));
    expect(registosAtuais().levantamentos).toHaveLength(1);
    expect(r.levantamentoMudou).toBe(false);
    guardarVisitasELevantamento("p1", dados([], { ...medidas, observacoes: "mais uma nota" }));
    expect(registosAtuais().levantamentos).toHaveLength(1);
    expect(registosAtuais().levantamentos[0].rascunho.observacoes).toBe("mais uma nota");
  });

  it("um levantamento ligado a um negócio não se altera: o novo regista-se à parte", () => {
    const l = registarLevantamento({ pessoaId: "p1", visitaId: null, data: "2026-10-01", feitoPor: "Ana", rascunho: medidas });
    ligarRegisto({ tipo: "levantamento", id: l.id }, "n1");
    guardarVisitasELevantamento("p1", dados([], { ...medidas, observacoes: "novo" }));
    const ls = registosAtuais().levantamentos;
    expect(ls).toHaveLength(2);
    expect(ls.find((x) => x.id === l.id)?.rascunho.observacoes).toBe("");
  });
});

describe("atualizarVisita", () => {
  it("muda uma visita e devolve verdadeiro; um id que não existe devolve falso e não muda nada", () => {
    const v = registarVisita({ pessoaId: "p1", ...visita("a") });
    expect(atualizarVisita(v.id, (x) => ({ ...x, resultado: "interessado" }))).toBe(true);
    expect(registosAtuais().visitas[0].resultado).toBe("interessado");
    const antes = registosAtuais();
    expect(atualizarVisita("rv-99", (x) => x)).toBe(false);
    expect(registosAtuais()).toBe(antes);
  });
});
