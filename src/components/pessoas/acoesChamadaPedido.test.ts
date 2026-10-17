// A chamada e os pedidos: uma chamada fala de tudo o que a pessoa pediu (marca contactados os pedidos por contactar) e a visita marcada
// na chamada vai para o pedido certo, ou para o único ainda sem visita, ou cria um pedido novo. O resto da chamada está em `acoesPessoa.test.ts`.
import { describe, expect, it } from "vitest";
import { registarChamada, type EstadoAcoes } from "./acoesPessoa";
import { pedidoBase, visitaBase } from "./fabricaTestes";
import type { PedidoNegocio, Pessoa } from "./pessoasTipos";

const pessoa = (id: string, extra: Partial<Pessoa> = {}): Pessoa => ({
  id, nome: id, contacto: { telefone: null, email: null }, comercial: "Ana", origem: "site", viaEntrada: "formulario", saude: 50,
  ultimoContactoDias: 9, ...extra,
});
const estado = (pessoas: Pessoa[] = [pessoa("a"), pessoa("c")], pedidos: PedidoNegocio[] = []): EstadoAcoes => ({
  pessoas, atividade: [], contactadas: [], pedidos,
});
const chamada = { resultado: "atendeuInteressado", nota: "Quer visita", passo: "ligarAmanha", hoje: "2026-10-13" } as const;

describe("registarChamada com pedidos", () => {
  describe("a chamada fala de tudo o que a pessoa pediu", () => {
    const deA = (id: string, extra: Partial<PedidoNegocio> = {}) => pedidoBase(id, { pessoaId: "a", ...extra });

    it("os pedidos por contactar da pessoa passam a contactados (os outros ficam como estão), seja qual for o resultado", () => {
      const pedidos = [
        deA("pd-1"), deA("pd-2"), deA("pd-3", { visitas: [visitaBase("v")] }), pedidoBase("pd-4", { pessoaId: "c" }),
      ];
      const novo = registarChamada(estado(undefined, pedidos), "a", { ...chamada, resultado: "naoAtendeu", passo: "ligarAmanha" });
      expect(novo.pedidos.map((p) => [p.id, p.contactado])).toEqual([["pd-1", true], ["pd-2", true], ["pd-3", false], ["pd-4", false]]);
    });

    it("um pedido já contactado, ou outra pessoa sem pedidos, não mudam o estado dos pedidos", () => {
      const pedidos = [deA("pd-1", { contactado: true })];
      expect(registarChamada(estado(undefined, pedidos), "a", chamada).pedidos).toBe(pedidos);
      expect(registarChamada(estado(), "a", chamada).pedidos).toEqual([]);
    });
  });

  describe("passos com dia e hora", () => {
    const morada = { linha: "Rua A 1", cp: "1000-001", localidade: "Lisboa" };
    const comMorada = (extra: Partial<Pessoa> = {}): Pessoa => pessoa("a", { morada, ...extra });
    const visita = { ...chamada, passo: "marcarVisita", data: "2026-10-16", hora: "09:30" } as const;
    const deA = (id: string, extra: Partial<PedidoNegocio> = {}) => pedidoBase(id, { pessoaId: "a", ...extra });

    it("marcar visita: a visita fica no pedido indicado, que passa a Visita; a pessoa não ganha próximo contacto; duas linhas na atividade", () => {
      const pedidos = [deA("pd-1"), deA("pd-2", { servico: "Janelas" })];
      const novo = registarChamada(estado([comMorada()], pedidos), "a", { ...visita, pedidoId: "pd-2" });
      expect(novo.pedidos[0].visitas).toEqual([]);
      expect(novo.pedidos[1].visitas).toHaveLength(1);
      expect(novo.pedidos[1].visitas[0]).toMatchObject({
        id: "pd-2-v1", data: "2026-10-16", hora: "09:30", estado: "porFazer", tipo: "levantamento", igualALead: true,
        morada: { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" },
      });
      expect(novo.pedidos.map((p) => p.contactado)).toEqual([true, true]);
      expect(novo.pessoas[0]).toMatchObject({ proximoContacto: null, resultadoContacto: "atendeuInteressado", ultimoContactoDias: 0 });
      expect(novo.atividade).toHaveLength(2);
      expect(novo.atividade[0]).toMatchObject({ chaveTitulo: "pessoasPagina.activity.visitBooked", detalhe: "16/10 · 09:30 · Rua A 1, 1000-001 Lisboa" });
      expect(novo.atividade[1]).toMatchObject({ tipo: "chamada", detalhe: "Quer visita" });
      expect(novo.contactadas).toEqual(["a"]);
    });

    it("sem pedido indicado, a visita vai para o único pedido ainda sem visita (o que já a tem fica como está)", () => {
      const comVisita = deA("pd-1", { contactado: true, visitas: [visitaBase("pd-1-v1")] });
      const novo = registarChamada(estado([comMorada()], [comVisita, deA("pd-2")]), "a", visita);
      expect(novo.pedidos[0]).toBe(comVisita);
      expect(novo.pedidos[1].visitas.map((v) => v.id)).toEqual(["pd-2-v1"]);
    });

    it("sem pedido indicado e com vários candidatos, vai para o primeiro (o ecrã obriga a escolher, isto só garante que nada se perde)", () => {
      const novo = registarChamada(estado([comMorada()], [deA("pd-1"), deA("pd-2")]), "a", visita);
      expect(novo.pedidos.map((p) => p.visitas.length)).toEqual([1, 0]);
    });

    it("sem candidato (a pessoa não tem pedidos, ou todos já têm visita) cria um pedido novo já com a visita", () => {
      const sem = registarChamada(estado([comMorada()]), "a", visita);
      expect(sem.pedidos).toHaveLength(1);
      expect(sem.pedidos[0]).toMatchObject({ id: "pd-1", pessoaId: "a", servico: "", contactado: true });
      expect(sem.pedidos[0].visitas).toHaveLength(1);
      const todosComVisita = [deA("pd-1", { contactado: true, visitas: [visitaBase("pd-1-v1")] })];
      const novo = registarChamada(estado([comMorada()], todosComVisita), "a", visita);
      expect(novo.pedidos.map((p) => [p.id, p.visitas.length])).toEqual([["pd-1", 1], ["pd-2", 1]]);
    });

    it("a visita vale também para um cliente: ganha um pedido e continua cliente (o papel não se guarda)", () => {
      const novo = registarChamada(estado([pessoa("c", { morada })]), "c", visita);
      expect(novo.pedidos).toHaveLength(1);
      expect(novo.pedidos[0]).toMatchObject({ pessoaId: "c", contactado: true });
      expect(novo.pessoas[0]).not.toHaveProperty("etapa");
    });

    it("marcar visita sem dia, com dia passado, sem hora, sem morada ou numa perdida não grava nada (nem cria o pedido)", () => {
      const antes = estado([comMorada()], [deA("pd-1")]);
      expect(registarChamada(antes, "a", { ...visita, data: "" })).toBe(antes);
      expect(registarChamada(antes, "a", { ...visita, data: "2026-10-12" })).toBe(antes);
      expect(registarChamada(antes, "a", { ...visita, hora: "" })).toBe(antes);
      const semMorada = estado([pessoa("a")], [deA("pd-1")]);
      expect(registarChamada(semMorada, "a", visita)).toBe(semMorada);
      const semPedidos = estado([pessoa("a")]);
      expect(registarChamada(semPedidos, "a", visita)).toBe(semPedidos);
      const perdida = estado([comMorada({ perdida: { motivo: "preco", data: "2026-10-01", passo: 1 } })], [deA("pd-1")]);
      expect(registarChamada(perdida, "a", visita)).toBe(perdida);
    });

    it("a morada escolhida na chamada fica na visita e na linha da atividade; uma outra morada inválida não grava nada", () => {
      const outra = { igualALead: false, outra: { rua: "Rua B 2", codigoPostal: "4700-010", localidade: "Braga", andar: "" }, notaAcesso: "Portão azul" };
      const novo = registarChamada(estado([comMorada()], [deA("pd-1")]), "a", { ...visita, destinoVisita: outra });
      expect(novo.pedidos[0].visitas[0]).toMatchObject({ igualALead: false, morada: { rua: "Rua B 2", localidade: "Braga" }, nota: "Portão azul" });
      expect(novo.atividade[0]).toMatchObject({ detalhe: "16/10 · 09:30 · Rua B 2, 4700-010 Braga" });
      const antes = estado([comMorada()], [deA("pd-1")]);
      const semRua = { ...outra, outra: { ...outra.outra, rua: "" } };
      expect(registarChamada(antes, "a", { ...visita, destinoVisita: semRua })).toBe(antes);
    });

    it("um pedido de outra pessoa, ou que não existe, não recebe a visita", () => {
      const antes = estado([comMorada(), pessoa("c")], [pedidoBase("pd-9", { pessoaId: "c" })]);
      expect(registarChamada(antes, "a", { ...visita, pedidoId: "pd-9" })).toBe(antes);
      expect(registarChamada(antes, "a", { ...visita, pedidoId: "pd-x" })).toBe(antes);
    });

    it("ligar numa data e hora: guarda dia e hora e acrescenta a chamada agendada à atividade", () => {
      const novo = registarChamada(estado(), "a", { ...chamada, resultado: "atendeuMaisTarde", passo: "ligarData", data: "2026-10-14", hora: "15:00" });
      expect(novo.pessoas[0]).toMatchObject({ proximoContacto: "2026-10-14", proximoHora: "15:00" });
      expect(novo.atividade[0]).toMatchObject({ chaveTitulo: "pessoasPagina.activity.callScheduled", detalhe: "14/10 · 15:00" });
      expect(novo.atividade).toHaveLength(2);
    });

    it("sem interesse + perder: regista a chamada e perde a lead com o motivo; sem motivo não grava", () => {
      const dados = { ...chamada, resultado: "semInteresse", passo: "perder", motivo: "preco", contexto: { passo: 0, papel: "lead" } } as const;
      const novo = registarChamada(estado(), "a", dados);
      expect(novo.pessoas[0].perdida).toMatchObject({ motivo: "preco", data: "2026-10-13", passo: 0 });
      expect(novo.pessoas[0].proximoContacto).toBeNull();
      expect(novo.atividade.map((i) => i.chaveTitulo)).toEqual(["pessoasPagina.activity.lost", "pessoasPagina.result.semInteresse"]);
      const antes = estado();
      expect(registarChamada(antes, "a", { ...dados, motivo: undefined })).toBe(antes);
    });

    it("perder sem o passo do percurso (o contexto) não grava nada", () => {
      const dados = { ...chamada, resultado: "semInteresse", passo: "perder", motivo: "preco" } as const;
      const antes = estado();
      expect(registarChamada(antes, "a", dados)).toBe(antes);
    });
  });
});
