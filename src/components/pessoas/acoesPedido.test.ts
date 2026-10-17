// As ações dos pedidos, em memória: marcar e alterar a visita, guardar visitas e levantamento, criar, remover e marcar contactados.
import { describe, expect, it } from "vitest";
import type { RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import {
  alterarVisitaDoPedido, criarPedido, criarPedidoGuardado, guardarPedido, marcarContactados, marcarVisitaDaPessoa, marcarVisitaDoPedido,
  removerPedido, type EstadoPedidos,
} from "./acoesPedido";
import { pedidoBase, pessoaBase, visitaBase } from "./fabricaTestes";
import { faseDoPedido } from "./pedidoNegocio";
import type { PedidoNegocio, Pessoa } from "./pessoasTipos";

const HOJE = "2026-10-13";
const LEAD = { linha: "Rua do Mar 9", cp: "2900-100", localidade: "Setúbal" };
const OUTRA = { igualALead: false, outra: { rua: "Zona Industrial 7", codigoPostal: "4700-500", localidade: "Braga", andar: "Armazém" }, notaAcesso: " Tocar à portaria " };

const estado = (pedidos: PedidoNegocio[] = [pedidoBase("pd-1")], pessoas: Pessoa[] = [pessoaBase("a", { morada: LEAD })]): EstadoPedidos => ({
  pessoas, pedidos, atividade: [], contactadas: [],
});
const dados = { data: "2026-10-20", hora: "10:30", nota: " Levar o catálogo " };
const rascunho = (n = 1): RascunhoLevantamento => ({
  linhas: Array.from({ length: n }, (_, i) => ({ id: `l${i + 1}`, divisao: "cozinha", trabalho: "outro", trabalhoOutro: "Bancada", medida: "3", unidade: "m2", observacoes: "" })),
  observacoes: "", respostas: {},
});

describe("marcarVisitaDoPedido", () => {
  it("a primeira visita é um levantamento por fazer, na morada da lead, do comercial do pedido, e regista-se na atividade", () => {
    const antes = estado();
    const depois = marcarVisitaDoPedido(antes, "pd-1", dados, HOJE);
    expect(depois.pedidos[0].visitas).toEqual([{
      id: "pd-1-v1", data: "2026-10-20", hora: "10:30", feitoPor: "Ana Ribeiro", estado: "porFazer", tipo: "levantamento", quemVaiEstar: "",
      duracao: "", morada: { rua: "Rua do Mar 9", codigoPostal: "2900-100", localidade: "Setúbal", andar: "" }, igualALead: true,
      nota: "",
    }]);
    expect(depois.pedidos[0].contactado).toBe(true);
    expect(faseDoPedido(depois.pedidos[0])).toBe("visita");
    expect(depois.atividade[0]).toMatchObject({
      pessoaId: "a", chaveTitulo: "pessoasPagina.activity.visitBooked", exemplo: false,
      detalhe: "2026-10-20 10:30 · Cozinha · Levar o catálogo · Rua do Mar 9, 2900-100 Setúbal",
    });
    expect(depois.contactadas).toEqual(["a"]);
    expect(depois.pessoas[0].ultimoContactoDias).toBe(0);
  });

  it("não escreve a data da visita no próximo contacto da pessoa (a chamada agendada fica como estava)", () => {
    const pessoa = pessoaBase("a", { morada: LEAD, proximoContacto: "2026-10-18", proximoHora: "09:00" });
    const depois = marcarVisitaDoPedido(estado([pedidoBase("pd-1")], [pessoa]), "pd-1", dados, HOJE);
    expect(depois.pessoas[0]).toMatchObject({ proximoContacto: "2026-10-18", proximoHora: "09:00" });
  });

  it("as visitas seguintes são revisitas, com ids seguidos, e a lista fica por ordem cronológica", () => {
    const um = marcarVisitaDoPedido(estado(), "pd-1", dados, HOJE);
    const dois = marcarVisitaDoPedido(um, "pd-1", { ...dados, data: "2026-10-16" }, HOJE);
    expect(dois.pedidos[0].visitas.map((v) => [v.id, v.tipo, v.data])).toEqual([
      ["pd-1-v2", "revisita", "2026-10-16"], ["pd-1-v1", "levantamento", "2026-10-20"],
    ]);
    expect(marcarVisitaDoPedido(dois, "pd-1", { ...dados, data: "2026-10-30" }, HOJE).pedidos[0].visitas[2].id).toBe("pd-1-v3");
  });

  it("uma visita cancelada não conta como primeira: a nova volta a ser o levantamento", () => {
    const pedido = pedidoBase("pd-1", { visitas: [visitaBase("pd-1-v1", { estado: "cancelada" })] });
    const depois = marcarVisitaDoPedido(estado([pedido]), "pd-1", dados, HOJE);
    expect(depois.pedidos[0].visitas.find((v) => v.estado === "porFazer")).toMatchObject({ id: "pd-1-v2", tipo: "levantamento" });
  });

  it("noutra morada, guarda a morada aparada e a nota de acesso como nota da visita", () => {
    const depois = marcarVisitaDoPedido(estado(), "pd-1", { ...dados, destino: OUTRA }, HOJE);
    expect(depois.pedidos[0].visitas[0]).toMatchObject({
      igualALead: false, nota: "Tocar à portaria", morada: { rua: "Zona Industrial 7", codigoPostal: "4700-500", localidade: "Braga", andar: "Armazém" },
    });
  });

  it("só toca no pedido pedido: os outros ficam como estavam", () => {
    const outro = pedidoBase("pd-2");
    const depois = marcarVisitaDoPedido(estado([pedidoBase("pd-1"), outro]), "pd-1", dados, HOJE);
    expect(depois.pedidos[1]).toBe(outro);
  });

  it("pedido que não existe, pessoa perdida ou sem morada escolhida, e dados inválidos deixam o estado como está", () => {
    const base = estado();
    expect(marcarVisitaDoPedido(base, "pd-9", dados, HOJE)).toBe(base);
    expect(marcarVisitaDoPedido(base, "pd-1", { ...dados, data: "" }, HOJE)).toBe(base);
    expect(marcarVisitaDoPedido(base, "pd-1", { ...dados, data: "2026-10-12" }, HOJE)).toBe(base);
    expect(marcarVisitaDoPedido(base, "pd-1", { ...dados, hora: "25:00" }, HOJE)).toBe(base);
    const perdida = estado([pedidoBase("pd-1")], [pessoaBase("a", { morada: LEAD, perdida: { motivo: "preco", data: HOJE } })]);
    expect(marcarVisitaDoPedido(perdida, "pd-1", dados, HOJE)).toBe(perdida);
    const semMorada = estado([pedidoBase("pd-1")], [pessoaBase("a")]);
    expect(marcarVisitaDoPedido(semMorada, "pd-1", dados, HOJE)).toBe(semMorada);
    const semPessoa = estado([pedidoBase("pd-1", { pessoaId: "x" })]);
    expect(marcarVisitaDoPedido(semPessoa, "pd-1", dados, HOJE)).toBe(semPessoa);
  });

  it("não muda o estado de partida", () => {
    const antes = estado();
    const copia = JSON.stringify(antes);
    marcarVisitaDoPedido(antes, "pd-1", dados, HOJE);
    expect(JSON.stringify(antes)).toBe(copia);
  });
});

describe("alterarVisitaDoPedido", () => {
  const com = (extra = {}) => estado([pedidoBase("pd-1", { visitas: [visitaBase("pd-1-v1", extra)] })]);
  const novos = { data: "2026-10-25", hora: "", destino: OUTRA };

  it("muda o dia, a hora e a morada da visita certa e regista-o; a nota de acesso passa a ser a nota", () => {
    const depois = alterarVisitaDoPedido(com(), "pd-1", "pd-1-v1", novos, HOJE);
    expect(depois.pedidos[0].visitas[0]).toMatchObject({
      id: "pd-1-v1", data: "2026-10-25", hora: "", igualALead: false, nota: "Tocar à portaria", morada: { rua: "Zona Industrial 7", localidade: "Braga" },
    });
    expect(depois.atividade[0]).toMatchObject({ chaveTitulo: "pessoasPagina.activity.visitChanged", detalhe: "2026-10-25 · Zona Industrial 7, Armazém, 4700-500 Braga" });
  });

  it("não mexe no próximo contacto da pessoa, e deixa as outras visitas como estavam", () => {
    const outra = visitaBase("pd-1-v2", { data: "2026-10-30" });
    const base = estado([pedidoBase("pd-1", { visitas: [visitaBase("pd-1-v1"), outra] })], [pessoaBase("a", { morada: LEAD, proximoContacto: "2026-10-18" })]);
    const depois = alterarVisitaDoPedido(base, "pd-1", "pd-1-v1", novos, HOJE);
    expect(depois.pessoas[0].proximoContacto).toBe("2026-10-18");
    expect(depois.pedidos[0].visitas[1]).toBe(outra);
  });

  it("também altera uma visita já feita", () => {
    const depois = alterarVisitaDoPedido(com({ estado: "feita" }), "pd-1", "pd-1-v1", novos, HOJE);
    expect(depois.pedidos[0].visitas[0]).toMatchObject({ estado: "feita", data: "2026-10-25" });
  });

  it("visita ou pedido que não existe, pessoa perdida e dados inválidos deixam o estado como está", () => {
    const base = com();
    expect(alterarVisitaDoPedido(base, "pd-1", "pd-1-v9", novos, HOJE)).toBe(base);
    expect(alterarVisitaDoPedido(base, "pd-9", "pd-1-v1", novos, HOJE)).toBe(base);
    expect(alterarVisitaDoPedido(base, "pd-1", "pd-1-v1", { ...novos, data: "2026-10-01" }, HOJE)).toBe(base);
    expect(alterarVisitaDoPedido(base, "pd-1", "pd-1-v1", { ...novos, destino: { ...OUTRA, outra: { ...OUTRA.outra, rua: "" } } }, HOJE)).toBe(base);
    const perdida = { ...base, pessoas: [pessoaBase("a", { perdida: { motivo: "preco" as const, data: HOJE } })] };
    expect(alterarVisitaDoPedido(perdida, "pd-1", "pd-1-v1", novos, HOJE)).toBe(perdida);
  });
});

describe("guardarPedido", () => {
  const feita = (id = "pd-1-v1") => visitaBase(id, { estado: "feita" });

  it("guarda as visitas e o levantamento, e a visita que passa a feita fica registada na atividade e conta como contacto", () => {
    const depois = guardarPedido(estado(), "pd-1", { visitas: [feita()], levantamento: rascunho() }, HOJE);
    expect(depois.pedidos[0]).toMatchObject({ contactado: true, levantamento: rascunho() });
    expect(depois.pedidos[0].visitas.map((v) => v.estado)).toEqual(["feita"]);
    expect(depois.atividade.map((a) => a.chaveTitulo)).toEqual([
      "pessoasPagina.process.activity.surveySaved", "pessoasPagina.process.activity.visitMarkedDone",
    ]);
    expect(depois.atividade.find((a) => a.chaveTitulo?.endsWith("visitMarkedDone"))?.detalhe).toBe("2026-10-20 10:00");
    expect(new Set(depois.atividade.map((a) => a.id)).size).toBe(2);
    expect(depois.contactadas).toEqual(["a"]);
    expect(depois.pessoas[0].ultimoContactoDias).toBe(0);
  });

  it("guarda uma visita feita sem nenhuma linha de medidas (o levantamento é opcional): fica feita, regista-se e a pessoa conta como contactada", () => {
    const depois = guardarPedido(estado(), "pd-1", { visitas: [feita()] }, HOJE);
    expect(depois.pedidos[0].visitas.map((v) => v.estado)).toEqual(["feita"]);
    expect(depois.pedidos[0].levantamento).toBeUndefined();
    expect(depois.atividade.map((a) => a.chaveTitulo)).toEqual(["pessoasPagina.process.activity.visitMarkedDone"]);
    expect(depois.contactadas).toEqual(["a"]);
    const vazio = guardarPedido(estado(), "pd-1", { visitas: [feita()], levantamento: rascunho(0) }, HOJE);
    expect(vazio.pedidos[0].visitas.map((v) => v.estado)).toEqual(["feita"]);
    expect(vazio.atividade.map((a) => a.chaveTitulo)).toEqual(["pessoasPagina.process.activity.visitMarkedDone"]);
  });

  it("o comercial escolhido no painel grava-se no pedido; sem comercial, fica o que o pedido tinha", () => {
    const base = estado([pedidoBase("pd-1", { comercial: "Ana Ribeiro" })]);
    expect(guardarPedido(base, "pd-1", { visitas: [visitaBase("pd-1-v1")], comercial: "Carla Mendes" }, HOJE).pedidos[0].comercial).toBe("Carla Mendes");
    expect(guardarPedido(base, "pd-1", { visitas: [visitaBase("pd-1-v1")] }, HOJE).pedidos[0].comercial).toBe("Ana Ribeiro");
  });

  it("criar o pedido com visitas leva o comercial dos dados do pedido, e o do painel manda se for diferente", () => {
    const novo = { pessoaId: "a", servico: "", comercial: "Ana Ribeiro" };
    const depois = criarPedidoGuardado(estado([]), novo, { visitas: [visitaBase("v1")], comercial: "Diogo Lopes" }, HOJE);
    expect(depois.pedidos[0].comercial).toBe("Diogo Lopes");
  });

  it("só visitas por fazer guardam-se sem levantamento e sem registo de visita feita", () => {
    const depois = guardarPedido(estado(), "pd-1", { visitas: [visitaBase("pd-1-v1")] }, HOJE);
    expect(depois.pedidos[0].visitas).toHaveLength(1);
    expect(depois.pedidos[0].levantamento).toBeUndefined();
    expect(depois.atividade).toEqual([]);
    expect(depois.contactadas).toEqual([]);
  });

  it("uma visita que já estava feita não volta a registar «Visita feita», nem um levantamento igual a registar-se de novo", () => {
    const antes = estado([pedidoBase("pd-1", { visitas: [feita()], levantamento: rascunho() })]);
    const depois = guardarPedido(antes, "pd-1", { visitas: [feita()], levantamento: rascunho() }, HOJE);
    expect(depois.atividade).toEqual([]);
    const maisLinhas = guardarPedido(antes, "pd-1", { visitas: [feita()], levantamento: rascunho(2) }, HOJE);
    expect(maisLinhas.atividade.map((a) => a.chaveTitulo)).toEqual(["pessoasPagina.process.activity.surveySaved"]);
  });

  it("sem levantamento novo, mantém o que o pedido já tinha", () => {
    const antes = estado([pedidoBase("pd-1", { visitas: [feita()], levantamento: rascunho() })]);
    expect(guardarPedido(antes, "pd-1", { visitas: [feita()] }, HOJE).pedidos[0].levantamento).toEqual(rascunho());
  });

  it("guarda as visitas por ordem cronológica e com as notas aparadas; cancelar uma volta a fase atrás", () => {
    const cancelada = visitaBase("pd-1-v2", { estado: "cancelada", data: "2026-10-18", nota: "  adiada " });
    const depois = guardarPedido(estado(), "pd-1", { visitas: [visitaBase("pd-1-v1", { data: "2026-10-25" }), cancelada] }, HOJE);
    expect(depois.pedidos[0].visitas.map((v) => v.id)).toEqual(["pd-1-v2", "pd-1-v1"]);
    expect(depois.pedidos[0].visitas[0].nota).toBe("adiada");
    const soCancelada = guardarPedido(estado(), "pd-1", { visitas: [cancelada] }, HOJE);
    expect(faseDoPedido(soCancelada.pedidos[0])).toBe("contactado");
  });

  it("duas visitas que passam a feitas ao mesmo tempo dão duas linhas, com ids diferentes", () => {
    const depois = guardarPedido(estado(), "pd-1", { visitas: [feita("pd-1-v1"), feita("pd-1-v2")], levantamento: rascunho() }, HOJE);
    expect(depois.atividade.filter((a) => a.chaveTitulo?.endsWith("visitMarkedDone"))).toHaveLength(2);
    expect(new Set(depois.atividade.map((a) => a.id)).size).toBe(depois.atividade.length);
  });

  it("pedido que não existe, ou pessoa perdida, deixa o estado como está", () => {
    const base = estado();
    expect(guardarPedido(base, "pd-9", { visitas: [] }, HOJE)).toBe(base);
    const perdida = { ...base, pessoas: [pessoaBase("a", { perdida: { motivo: "preco" as const, data: HOJE } })] };
    expect(guardarPedido(perdida, "pd-1", { visitas: [visitaBase()] }, HOJE)).toBe(perdida);
  });
});

describe("criarPedido, removerPedido e marcarContactados", () => {
  const novo = { pessoaId: "a", servico: "  Casa de banho ", comercial: "Bruno Costa" };

  it("criarPedido acrescenta um pedido por contactar, com o id seguinte e o serviço aparado", () => {
    const depois = criarPedido(estado([pedidoBase("pd-2")]), novo, HOJE);
    expect(depois.pedidos).toHaveLength(2);
    expect(depois.pedidos[1]).toEqual({
      id: "pd-3", pessoaId: "a", servico: "Casa de banho", comercial: "Bruno Costa", criadoEm: HOJE, contactado: false, visitas: [],
    });
    expect(criarPedido(estado([]), novo, HOJE).pedidos[0].id).toBe("pd-1");
  });

  it("criarPedido não cria para uma pessoa que não existe nem para uma perdida", () => {
    const base = estado();
    expect(criarPedido(base, { ...novo, pessoaId: "x" }, HOJE)).toBe(base);
    const perdida = { ...base, pessoas: [pessoaBase("a", { perdida: { motivo: "preco" as const, data: HOJE } })] };
    expect(criarPedido(perdida, novo, HOJE)).toBe(perdida);
  });

  it("removerPedido tira só esse pedido; um id que não existe deixa tudo como está", () => {
    const base = estado([pedidoBase("pd-1"), pedidoBase("pd-2")]);
    expect(removerPedido(base, "pd-1").pedidos.map((p) => p.id)).toEqual(["pd-2"]);
    expect(removerPedido(base, "pd-9")).toBe(base);
  });

  it("marcarContactados passa a contactados todos os pedidos por contactar da pessoa, e só esses", () => {
    const visita = pedidoBase("pd-3", { visitas: [visitaBase("pd-3-v1")] });
    const base = estado([pedidoBase("pd-1"), pedidoBase("pd-2"), pedidoBase("pd-4", { pessoaId: "b" }), visita]);
    const depois = marcarContactados(base, "a");
    expect(depois.pedidos.map((p) => [p.id, p.contactado])).toEqual([["pd-1", true], ["pd-2", true], ["pd-4", false], ["pd-3", false]]);
    // Um pedido já na fase da visita, e o de outra pessoa, ficam exactamente como estavam.
    expect(depois.pedidos[3]).toBe(visita);
    expect(depois.pedidos[2]).toBe(base.pedidos[2]);
  });

  it("marcarContactados sem nada por contactar devolve o mesmo estado", () => {
    const base = estado([pedidoBase("pd-1", { contactado: true })]);
    expect(marcarContactados(base, "a")).toBe(base);
    expect(marcarContactados(base, "x")).toBe(base);
  });
});

describe("marcarVisitaDaPessoa", () => {
  const deA = (id: string, extra: Partial<PedidoNegocio> = {}) => pedidoBase(id, { pessoaId: "a", ...extra });

  it("com o pedido indicado marca nesse; um pedido de outra pessoa, ou que não existe, não vale", () => {
    const base = estado([deA("pd-1"), deA("pd-2"), pedidoBase("pd-9", { pessoaId: "b" })]);
    expect(marcarVisitaDaPessoa(base, "a", { pedidoId: "pd-2" }, dados, HOJE).pedidos.map((p) => p.visitas.length)).toEqual([0, 1, 0]);
    expect(marcarVisitaDaPessoa(base, "a", { pedidoId: "pd-9" }, dados, HOJE)).toBe(base);
    expect(marcarVisitaDaPessoa(base, "a", { pedidoId: "pd-x" }, dados, HOJE)).toBe(base);
  });

  it("sem pedido indicado marca no primeiro que ainda não está em Visita", () => {
    const comVisita = deA("pd-1", { contactado: true, visitas: [visitaBase("pd-1-v1")] });
    const depois = marcarVisitaDaPessoa(estado([comVisita, deA("pd-2")]), "a", {}, dados, HOJE);
    expect(depois.pedidos[0]).toBe(comVisita);
    expect(depois.pedidos[1].visitas).toHaveLength(1);
  });

  it("sem candidato cria o pedido (com o serviço indicado e o comercial da pessoa) e marca nele", () => {
    const todosComVisita = estado([deA("pd-1", { contactado: true, visitas: [visitaBase("pd-1-v1")] })]);
    const depois = marcarVisitaDaPessoa(todosComVisita, "a", { servico: "Janelas" }, dados, HOJE);
    expect(depois.pedidos).toHaveLength(2);
    expect(depois.pedidos[1]).toMatchObject({ id: "pd-2", servico: "Janelas", comercial: "Ana Ribeiro", contactado: true });
    expect(depois.pedidos[1].visitas).toHaveLength(1);
  });

  it("se a visita não se pode marcar, nem o pedido se cria; pessoa perdida ou desconhecida também não", () => {
    const base = estado([]);
    expect(marcarVisitaDaPessoa(base, "a", {}, { ...dados, data: "" }, HOJE)).toBe(base);
    expect(marcarVisitaDaPessoa(base, "x", {}, dados, HOJE)).toBe(base);
    const perdida = { ...base, pessoas: [pessoaBase("a", { morada: LEAD, perdida: { motivo: "preco" as const, data: HOJE } })] };
    expect(marcarVisitaDaPessoa(perdida, "a", {}, dados, HOJE)).toBe(perdida);
  });
});

describe("criarPedidoGuardado", () => {
  const novo = { pessoaId: "a", servico: "Cozinha", comercial: "Ana Ribeiro" };
  const feita = visitaBase("v1", { estado: "feita" });

  it("cria o pedido já com as visitas e o levantamento, em Visita", () => {
    const depois = criarPedidoGuardado(estado([]), novo, { visitas: [feita], levantamento: rascunho() }, HOJE);
    expect(depois.pedidos).toHaveLength(1);
    expect(depois.pedidos[0]).toMatchObject({ id: "pd-1", servico: "Cozinha", contactado: true });
    expect(depois.pedidos[0].visitas.map((v) => v.estado)).toEqual(["feita"]);
    expect(depois.pedidos[0].levantamento?.linhas).toHaveLength(1);
    expect(faseDoPedido(depois.pedidos[0])).toBe("visita");
  });

  it("uma visita feita sem linhas cria o pedido na mesma (o levantamento é opcional)", () => {
    const depois = criarPedidoGuardado(estado([]), novo, { visitas: [feita] }, HOJE);
    expect(depois.pedidos).toHaveLength(1);
    expect(depois.pedidos[0].visitas.map((v) => v.estado)).toEqual(["feita"]);
    expect(depois.pedidos[0].levantamento).toBeUndefined();
  });

  it("pessoa que não existe ou perdida: nada se cria", () => {
    const base = estado([]);
    expect(criarPedidoGuardado(base, { ...novo, pessoaId: "x" }, { visitas: [visitaBase()] }, HOJE)).toBe(base);
  });
});
