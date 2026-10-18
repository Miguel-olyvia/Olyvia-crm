// A chamada de uma pessoa: o que muda na pessoa e na atividade (`registarChamada`) e os registos que a chamada deixa (o contacto e,
// no passo «marcar visita», a visita). O contacto e a visita são da PESSOA, nunca de um pedido. O resto está em `acoesPessoa.test.ts`.
import { describe, expect, it } from "vitest";
import { chamadaAplicavel, registarChamada, type EstadoAcoes } from "./acoesPessoa";
import { contactoDaChamada, visitaDaChamada } from "./chamadaPassos";
import type { Pessoa } from "./pessoasTipos";

const pessoa = (id: string, extra: Partial<Pessoa> = {}): Pessoa => ({
  id, nome: id, contacto: { telefone: null, email: null }, comercial: "Ana", origem: "site", viaEntrada: "formulario", saude: 50,
  ultimoContactoDias: 9, ...extra,
});
const morada = { linha: "Rua A 1", cp: "1000-001", localidade: "Lisboa" };
const estado = (pessoas: Pessoa[] = [pessoa("a", { morada }), pessoa("c")]): EstadoAcoes => ({ pessoas, atividade: [], contactadas: [] });
const chamada = { resultado: "atendeuInteressado", nota: "Quer visita", passo: "ligarAmanha", hoje: "2026-10-13" } as const;
const visita = { ...chamada, passo: "marcarVisita", data: "2026-10-16", hora: "09:30" } as const;

describe("registarChamada", () => {
  it("marcar visita: a pessoa não ganha próximo contacto e a atividade fica com a visita e a chamada", () => {
    const novo = registarChamada(estado(), "a", visita);
    expect(novo.pessoas[0]).toMatchObject({ proximoContacto: null, resultadoContacto: "atendeuInteressado", ultimoContactoDias: 0 });
    expect(novo.atividade).toHaveLength(2);
    expect(novo.atividade[0]).toMatchObject({ chaveTitulo: "pessoasPagina.activity.visitBooked", detalhe: "16/10 · 09:30 · Rua A 1, 1000-001 Lisboa" });
    expect(novo.atividade[1]).toMatchObject({ tipo: "chamada", detalhe: "Quer visita" });
    expect(novo.contactadas).toEqual(["a"]);
  });

  it("marcar visita vale também para um cliente (continua cliente: o papel não se guarda)", () => {
    const novo = registarChamada(estado([pessoa("c", { morada })]), "c", visita);
    expect(novo.atividade).toHaveLength(2);
    expect(novo.pessoas[0]).not.toHaveProperty("etapa");
  });

  it("sem dia, com dia passado, sem hora, sem morada ou numa perdida, a visita não se marca e nada muda", () => {
    const antes = estado();
    expect(registarChamada(antes, "a", { ...visita, data: "" })).toBe(antes);
    expect(registarChamada(antes, "a", { ...visita, data: "2026-10-12" })).toBe(antes);
    expect(registarChamada(antes, "a", { ...visita, hora: "" })).toBe(antes);
    const semMorada = estado([pessoa("a")]);
    expect(registarChamada(semMorada, "a", visita)).toBe(semMorada);
    const perdida = estado([pessoa("a", { morada, perdida: { motivo: "preco", data: "2026-10-01", passo: 1 } })]);
    expect(registarChamada(perdida, "a", visita)).toBe(perdida);
  });

  it("a morada escolhida na chamada vai para a linha da atividade; uma outra morada sem rua não grava nada", () => {
    const outra = { igualALead: false, outra: { rua: "Rua B 2", codigoPostal: "4700-010", localidade: "Braga", andar: "" }, notaAcesso: "Portão azul" };
    const novo = registarChamada(estado(), "a", { ...visita, destinoVisita: outra });
    expect(novo.atividade[0]).toMatchObject({ detalhe: "16/10 · 09:30 · Rua B 2, 4700-010 Braga" });
    const antes = estado();
    expect(registarChamada(antes, "a", { ...visita, destinoVisita: { ...outra, outra: { ...outra.outra, rua: "" } } })).toBe(antes);
  });

  it("ligar numa data e hora: guarda dia e hora e acrescenta a chamada agendada à atividade", () => {
    const novo = registarChamada(estado(), "a", { ...chamada, resultado: "atendeuMaisTarde", passo: "ligarData", data: "2026-10-14", hora: "15:00" });
    expect(novo.pessoas[0]).toMatchObject({ proximoContacto: "2026-10-14", proximoHora: "15:00" });
    expect(novo.atividade[0]).toMatchObject({ chaveTitulo: "pessoasPagina.activity.callScheduled", detalhe: "14/10 · 15:00" });
  });

  describe("sem interesse: encerra a abordagem (não perde a pessoa)", () => {
    const dados = { ...chamada, resultado: "semInteresse", passo: "perder", motivo: "preco" } as const;

    it("regista a chamada e encerra com o resultado «sem interesse» e o motivo; não há negócio nem perda", () => {
      const novo = registarChamada(estado(), "a", dados);
      expect(novo.pessoas[0].encerrada).toEqual({ resultado: "semInteresse", motivo: "preco", data: "2026-10-13" });
      expect(novo.pessoas[0].perdida).toBeUndefined();
      expect(novo.pessoas[0].proximoContacto).toBeNull();
      expect(novo.atividade.map((i) => i.chaveTitulo)).toEqual(["pessoasPagina.close.activity.closed", "pessoasPagina.result.semInteresse"]);
    });

    it("sem motivo, ou com um negócio aberto, não grava nada", () => {
      const antes = estado();
      expect(registarChamada(antes, "a", { ...dados, motivo: undefined })).toBe(antes);
      expect(registarChamada(antes, "a", { ...dados, temNegocioAberto: true })).toBe(antes);
    });

    it("o motivo «outro» pede o texto", () => {
      const antes = estado();
      expect(registarChamada(antes, "a", { ...dados, motivo: "outro" })).toBe(antes);
      const novo = registarChamada(antes, "a", { ...dados, motivo: "outro", motivoOutro: " Mudou de casa " });
      expect(novo.pessoas[0].encerrada).toMatchObject({ motivo: "outro", motivoOutro: "Mudou de casa" });
    });
  });
});

describe("chamadaAplicavel", () => {
  it("diz o mesmo que registarChamada: se a chamada se aplica, muda o estado", () => {
    const e = estado();
    expect(chamadaAplicavel(e, "a", visita)).toBe(true);
    expect(chamadaAplicavel(e, "a", { ...visita, data: "" })).toBe(false);
    expect(chamadaAplicavel(e, "x", chamada)).toBe(false);
  });
});

describe("os registos que a chamada deixa", () => {
  it("o contacto: o dia de hoje, o resultado e a nota aparada", () => {
    expect(contactoDaChamada("a", { ...chamada, nota: "  Quer visita  " })).toEqual({
      pessoaId: "a", data: "2026-10-13", resultado: "atendeuInteressado", nota: "Quer visita",
    });
  });

  it("a visita só existe no passo «marcar visita», por fazer, com o texto da atividade da chamada", () => {
    expect(visitaDaChamada(pessoa("a", { morada }), chamada, [])).toBeNull();
    const r = visitaDaChamada(pessoa("a", { morada }), visita, []);
    expect(r?.visita).toMatchObject({ pessoaId: "a", data: "2026-10-16", hora: "09:30", estado: "porFazer", tipo: "levantamento", feitoPor: "Ana" });
    expect(r?.detalhe).toBe("16/10 · 09:30 · Rua A 1, 1000-001 Lisboa");
  });

  it("uma visita que já existia faz da nova uma revisita; com dados inválidos devolve null", () => {
    expect(visitaDaChamada(pessoa("a", { morada }), visita, [{ estado: "feita" }])?.visita.tipo).toBe("revisita");
    expect(visitaDaChamada(pessoa("a", { morada }), { ...visita, data: "" }, [])).toBeNull();
  });
});
