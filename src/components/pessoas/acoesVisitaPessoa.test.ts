// O que as ações da visita e do levantamento mudam na pessoa e na atividade (as visitas em si vivem no store dos registos): contar como
// contacto, deixar a linha na atividade. Funções puras: o dia de hoje chega por parâmetro.
import { describe, expect, it } from "vitest";
import { MORADA_VAZIA } from "@/components/negocio-metas/moradaObra";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import type { EstadoAcoes } from "./acoesPessoa";
import { levantamentoGuardado, resultadoDaVisitaRegistado, visitaAlterada, visitaMarcada, visitasFeitas } from "./acoesVisitaPessoa";
import type { Pessoa } from "./pessoasTipos";

const pessoa = (id: string): Pessoa => ({
  id, nome: id, contacto: { telefone: null, email: null }, comercial: "Ana", origem: "site", viaEntrada: "formulario", saude: 50, ultimoContactoDias: 9,
});
const estado = (): EstadoAcoes => ({ pessoas: [pessoa("a"), pessoa("b")], atividade: [], contactadas: [] });
const HOJE = "2026-10-13";
const visita = (id: string, extra: Partial<VisitaPessoa> = {}): VisitaPessoa => ({
  id, pessoaId: "a", negocioId: null, data: "2026-10-20", hora: "10:00", feitoPor: "Ana", estado: "feita", tipo: "levantamento", quemVaiEstar: "",
  duracao: "", morada: MORADA_VAZIA, igualALead: true, nota: "", ...extra,
});

describe("visitaMarcada", () => {
  it("conta como contacto (último contacto hoje, contactada) e deixa a visita marcada na atividade", () => {
    const novo = visitaMarcada(estado(), "a", "2026-10-20 10:00 · Rua A", HOJE);
    expect(novo.pessoas[0].ultimoContactoDias).toBe(0);
    expect(novo.pessoas[1].ultimoContactoDias).toBe(9);
    expect(novo.contactadas).toEqual(["a"]);
    expect(novo.atividade[0]).toMatchObject({ pessoaId: "a", chaveTitulo: "pessoasPagina.activity.visitBooked", detalhe: "2026-10-20 10:00 · Rua A", exemplo: false });
  });

  it("não repete a pessoa em contactadas e ignora uma pessoa que não existe", () => {
    const uma = visitaMarcada(estado(), "a", "x", HOJE);
    expect(visitaMarcada(uma, "a", "y", HOJE).contactadas).toEqual(["a"]);
    const e = estado();
    expect(visitaMarcada(e, "x", "x", HOJE)).toBe(e);
  });
});

describe("visitaAlterada", () => {
  it("só deixa a linha na atividade: não conta como contacto", () => {
    const novo = visitaAlterada(estado(), "a", "2026-10-22 · Rua B", HOJE);
    expect(novo.atividade[0]).toMatchObject({ chaveTitulo: "pessoasPagina.activity.visitChanged", detalhe: "2026-10-22 · Rua B" });
    expect(novo.contactadas).toEqual([]);
    expect(novo.pessoas[0].ultimoContactoDias).toBe(9);
  });
});

describe("visitasFeitas e levantamentoGuardado", () => {
  it("cada visita que passa a feita deixa «Visita feita» na atividade e conta como contacto", () => {
    const novo = visitasFeitas(estado(), "a", [visita("rv-1", { hora: "" }), visita("rv-2", { data: "2026-10-22", hora: "09:00" })], HOJE);
    expect(novo.atividade.map((i) => [i.chaveTitulo, i.detalhe])).toEqual([
      ["pessoasPagina.process.activity.visitMarkedDone", "2026-10-20"],
      ["pessoasPagina.process.activity.visitMarkedDone", "2026-10-22 09:00"],
    ]);
    expect(new Set(novo.atividade.map((i) => i.id)).size).toBe(2);
    expect(novo.pessoas[0].ultimoContactoDias).toBe(0);
    expect(novo.contactadas).toEqual(["a"]);
  });

  it("sem visitas que passaram a feita nada muda", () => {
    const e = estado();
    expect(visitasFeitas(e, "a", [], HOJE)).toBe(e);
  });

  it("um levantamento novo ou alterado deixa «Levantamento guardado»; sem mudança, nada", () => {
    const e = estado();
    expect(levantamentoGuardado(e, "a", false, HOJE)).toBe(e);
    expect(levantamentoGuardado(e, "a", true, HOJE).atividade[0]).toMatchObject({ chaveTitulo: "pessoasPagina.process.activity.surveySaved" });
  });
});

describe("resultadoDaVisitaRegistado", () => {
  it("deixa o resultado na atividade, com a chave do resultado, e conta como contacto", () => {
    const novo = resultadoDaVisitaRegistado(estado(), "a", "aPensar", HOJE);
    expect(novo.atividade[0]).toMatchObject({
      chaveTitulo: "pessoasPagina.visitResult.activity", chaveDetalhe: "pessoasPagina.visitResult.result.aPensar", pessoaId: "a",
    });
    expect(novo.contactadas).toEqual(["a"]);
  });
});
