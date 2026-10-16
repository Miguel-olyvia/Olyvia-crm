import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { negocioBase, pessoaBase, resumoBase } from "../fabricaTestes";
import type { Pessoa } from "../pessoasTipos";
import { passoDoNegocio as passoDoNegocioColuna, proximoPasso, type IdPasso } from "../etapaPessoa";
import { juntarPessoas } from "../juntarPessoas";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO } from "../pessoasExemplo";
import { itemEmFoco, itensDaPessoa } from "./itensProcesso";
import { PASSOS_PROCESSO, passoDoItem } from "./passosProcesso";
import type { ItemProcesso, PassoProcesso } from "./tiposProcesso";

const item = (extra: Partial<ItemProcesso>): ItemProcesso => ({
  id: "pedido-a", pessoaId: "a", tipo: "pedido", fase: "porContactar", trabalho: null, valor: null, prazo: null, atrasado: false,
  orcamentos: 0, orcamentoEscolhido: false, propostaRascunho: false, ...extra,
});

const orc = (escolhido: boolean): NegocioMes["orcamentos"] => [{ id: "o", valor: 1000, escolhido }];
const visita = (data: string): NonNullable<Pessoa["visita"]> => ({
  data, hora: "", comercial: "x", igualALead: true, moradaVisita: { rua: "", codigoPostal: "", localidade: "", andar: "" },
});
const itensDe = (r: ReturnType<typeof resumoBase>): ItemProcesso[] => itensDaPessoa(r, HOJE_EXEMPLO);

describe("PASSOS_PROCESSO", () => {
  it("tem os 14 passos, pela ordem do processo", () => {
    expect(PASSOS_PROCESSO).toEqual([
      "registarChamada", "marcarVisita", "marcarVisitaFeita", "fazerLevantamento", "criarNegocio", "criarOrcamento",
      "verificarOrcamento", "aguardarDirecao", "escolherOrcamento", "criarProposta", "enviarProposta", "registarRespostaCliente",
      "gerarContrato", "registarAssinatura",
    ]);
  });
});

describe("passoDoItem: pedidos", () => {
  const casos: [string, Partial<ItemProcesso>, PassoProcesso][] = [
    ["etapa nova (Por contactar)", { fase: "porContactar" }, "registarChamada"],
    ["emContacto (Contactado)", { fase: "contactado" }, "marcarVisita"],
    // Um pedido na fase Visita pede SEMPRE "marcar a visita como feita": a visita ainda não tem estado "feita" (Fase 3).
    ["visitaMarcada (a data não decide o passo)", { fase: "visita" }, "marcarVisitaFeita"],
  ];
  it.each(casos)("%s", (_nome, extra, esperado) => {
    expect(passoDoItem(item(extra)).id).toBe(esperado);
  });
});

describe("passoDoItem: negócios", () => {
  const negocio = (extra: Partial<ItemProcesso>): ItemProcesso => item({ id: "n", tipo: "negocio", ...extra });
  const casos: [string, Partial<ItemProcesso>, PassoProcesso][] = [
    ["Orçamento sem orçamentos", { fase: "orcamento", orcamentos: 0 }, "criarOrcamento"],
    ["Orçamento com 1 orçamento, nenhum escolhido", { fase: "orcamento", orcamentos: 1 }, "escolherOrcamento"],
    ["Orçamento com 3 orçamentos, nenhum escolhido", { fase: "orcamento", orcamentos: 3 }, "escolherOrcamento"],
    ["Orçamento com um escolhido e sem proposta", { fase: "orcamento", orcamentos: 3, orcamentoEscolhido: true }, "criarProposta"],
    ["Proposta em rascunho", { fase: "proposta", orcamentos: 1, orcamentoEscolhido: true, propostaRascunho: true }, "enviarProposta"],
    ["Proposta enviada", { fase: "proposta", orcamentos: 1, orcamentoEscolhido: true }, "registarRespostaCliente"],
    ["Contrato", { fase: "contrato", orcamentos: 1, orcamentoEscolhido: true }, "registarAssinatura"],
  ];
  it.each(casos)("%s", (_nome, extra, esperado) => {
    expect(passoDoItem(negocio(extra)).id).toBe(esperado);
  });
});

describe("passoDoItem: o texto", () => {
  it("a chave de tradução é pessoasPagina.todo.step.<id>", () => {
    expect(passoDoItem(item({ fase: "porContactar" })).chave).toBe("pessoasPagina.todo.step.registarChamada");
    expect(passoDoItem(item({ tipo: "negocio", fase: "contrato" })).chave).toBe("pessoasPagina.todo.step.registarAssinatura");
  });
});

describe("itensDaPessoa + passoDoItem", () => {
  it("uma pessoa com 2 negócios em fases diferentes dá 2 itens com 2 passos diferentes", () => {
    const r = resumoBase(pessoaBase("a"), [
      negocioBase("n1", { servico: "Cozinha", orcamentos: orc(true) }),
      negocioBase("n2", { servico: "Sala", orcamentos: orc(true), proposta: { estado: "enviada" } }),
    ], HOJE_EXEMPLO);
    const itens = itensDe(r);
    expect(itens.map((i) => i.id)).toEqual(["n1", "n2"]);
    expect(itens.map((i) => passoDoItem(i).id)).toEqual(["criarProposta", "registarRespostaCliente"]);
  });

  it("negócio em Orçamento sem orçamentos pede 'criarOrcamento'", () => {
    const r = resumoBase(pessoaBase("a"), [negocioBase("n1")], HOJE_EXEMPLO);
    expect(passoDoItem(itensDe(r)[0]).id).toBe("criarOrcamento");
  });

  it("um pedido novo dá 1 item 'registarChamada'; sem visita, o trabalho é nulo", () => {
    const itens = itensDe(resumoBase(pessoaBase("a", { etapa: "nova" }), [], HOJE_EXEMPLO));
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ tipo: "pedido", fase: "porContactar", trabalho: null, valor: null });
    expect(passoDoItem(itens[0]).id).toBe("registarChamada");
  });

  it("visita marcada: SEMPRE 'marcar a visita como feita', seja no passado, hoje, no futuro ou sem data", () => {
    const com = (data: string): ItemProcesso =>
      itensDe(resumoBase(pessoaBase("a", { etapa: "visitaMarcada", visita: visita(data) }), [], HOJE_EXEMPLO))[0];
    for (const data of ["2026-10-12", HOJE_EXEMPLO, "2026-10-20"]) expect(passoDoItem(com(data)).id).toBe("marcarVisitaFeita");
    const semVisita = itensDe(resumoBase(pessoaBase("a", { etapa: "visitaMarcada" }), [], HOJE_EXEMPLO))[0];
    expect(passoDoItem(semVisita).id).toBe("marcarVisitaFeita");
  });

  it("o item de uma visita leva a data da visita como prazo, mesmo sem próximo contacto (o texto do item mostra-a)", () => {
    const p = pessoaBase("a", { etapa: "visitaMarcada", visita: visita("2026-10-20") });
    expect(itensDe(resumoBase(p, [], HOJE_EXEMPLO))[0].prazo).toBe("2026-10-20");
    const comContacto = { ...p, proximoContacto: "2026-10-21" };
    expect(itensDe(resumoBase(comContacto, [], HOJE_EXEMPLO))[0].prazo).toBe("2026-10-21");
  });

  it("o negócio traz se há orçamento escolhido e se a proposta é um rascunho", () => {
    const itemDe = (extra: Partial<NegocioMes>): ItemProcesso => itensDe(resumoBase(pessoaBase("a"), [negocioBase("n1", extra)], HOJE_EXEMPLO))[0];
    expect(itemDe({ orcamentos: orc(false) })).toMatchObject({ orcamentoEscolhido: false, propostaRascunho: false });
    expect(itemDe({ orcamentos: orc(true) })).toMatchObject({ orcamentoEscolhido: true, propostaRascunho: false });
    expect(itemDe({ orcamentos: orc(true), proposta: { estado: "rascunho" } })).toMatchObject({ orcamentoEscolhido: true, propostaRascunho: true });
    expect(itemDe({ orcamentos: orc(true), proposta: { estado: "enviada" } })).toMatchObject({ propostaRascunho: false });
  });

  it("com negócio aberto não há pedido ao lado (decisão 1)", () => {
    const r = resumoBase(pessoaBase("a", { etapa: "nova" }), [negocioBase("n1")], HOJE_EXEMPLO);
    expect(itensDe(r).map((i) => i.tipo)).toEqual(["negocio"]);
  });

  it("perdida, ou cliente sem negócio aberto, não tem itens", () => {
    const perdida = { motivo: "preco" as const, data: "2026-10-01" };
    expect(itensDe(resumoBase(pessoaBase("a", { perdida }), [negocioBase("n1")], HOJE_EXEMPLO))).toEqual([]);
    expect(itensDe(resumoBase(pessoaBase("b"), [], HOJE_EXEMPLO, "cliente"))).toEqual([]);
  });

  it("o negócio traz trabalho, valor do orçamento escolhido, fase e prazo em atraso", () => {
    const n = negocioBase("n1", { servico: "Cozinha", orcamentos: orc(true), proximoPrazo: "2026-10-01" });
    const [i] = itensDe(resumoBase(pessoaBase("a"), [n], HOJE_EXEMPLO));
    expect(i).toMatchObject({ tipo: "negocio", fase: "orcamento", trabalho: "Cozinha", valor: 1000, orcamentos: 1, prazo: "2026-10-01", atrasado: true });
  });
});

describe("itemEmFoco (o critério do resumo é o da coluna 'Próximo passo': o negócio mais avançado)", () => {
  const dois = (a: Partial<NegocioMes>, b: Partial<NegocioMes>) =>
    resumoBase(pessoaBase("a"), [negocioBase("a", a), negocioBase("b", b)], HOJE_EXEMPLO);

  it("sem itens devolve null", () => {
    expect(itemEmFoco(resumoBase(pessoaBase("a", { perdida: { motivo: "preco", data: "2026-10-01" } })), [])).toBeNull();
  });

  it("o negócio mais avançado ganha, mesmo com o prazo mais distante", () => {
    const r = dois({ orcamentos: orc(true), proximoPrazo: "2026-10-05" }, { orcamentos: orc(true), proposta: { estado: "enviada" }, proximoPrazo: "2026-10-30" });
    expect(itemEmFoco(r, itensDe(r))?.id).toBe("b");
  });

  it("em empate de fase, o primeiro (como a coluna)", () => {
    const r = dois({ orcamentos: orc(true), proximoPrazo: "2026-10-30" }, { orcamentos: orc(true), proximoPrazo: "2026-10-05" });
    expect(itemEmFoco(r, itensDe(r))?.id).toBe("a");
  });

  it("um pedido sem negócios: o único item", () => {
    const r = resumoBase(pessoaBase("a", { etapa: "nova" }), [], HOJE_EXEMPLO);
    expect(itemEmFoco(r, itensDe(r))?.id).toBe("pedido-a");
  });
});

/**
 * O "A fazer" novo e a coluna "Próximo passo" (vocabulário de `etapaPessoa.ts`) têm de dizer a mesma coisa. Cada id da coluna
 * corresponde a um passo do processo; `null` = a coluna diz "—" e a pessoa não tem itens.
 */
const PASSO_DA_COLUNA: Record<IdPasso, PassoProcesso | null> = {
  registarChamada: "registarChamada", marcarVisita: "marcarVisita", fecharLevantamento: "marcarVisitaFeita",
  fazerLevantamento: "criarOrcamento", escolherOrcamento: "escolherOrcamento", criarProposta: "criarProposta",
  enviarProposta: "enviarProposta", esperarCliente: "registarRespostaCliente", recolherAssinatura: "registarAssinatura", nenhum: null,
};

describe("coerência com a coluna 'Próximo passo' nos dados de exemplo", () => {
  const resumos = juntarPessoas(PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO, HOJE_EXEMPLO);

  it("cada negócio aberto de exemplo: o passo do item é o mesmo da coluna para esse negócio", () => {
    let conferidos = 0;
    for (const r of resumos) {
      for (const item of itensDe(r).filter((i) => i.tipo === "negocio")) {
        const negocio = r.abertos.find((n) => n.id === item.id)!;
        expect(passoDoItem(item).id, `${r.pessoa.nome} / ${negocio.id}`).toBe(PASSO_DA_COLUNA[passoDoNegocioColuna(negocio)]);
        conferidos++;
      }
    }
    expect(conferidos).toBeGreaterThan(5);
  });

  it("cada pessoa de exemplo: o item em foco (o do resumo) diz o mesmo que a coluna; sem passo na coluna, sem itens", () => {
    let conferidas = 0;
    for (const r of resumos) {
      const coluna = PASSO_DA_COLUNA[proximoPasso(r).id];
      const itens = itensDe(r);
      const foco = itemEmFoco(r, itens);
      if (coluna === null) expect(foco, r.pessoa.nome).toBeNull();
      else expect(foco && passoDoItem(foco).id, r.pessoa.nome).toBe(coluna);
      conferidas++;
    }
    expect(conferidas).toBe(resumos.length);
  });

  it("os exemplos cobrem pedidos de várias fases e negócios de várias fases", () => {
    const itens = resumos.flatMap((r) => itensDe(r));
    expect(new Set(itens.map((i) => i.fase)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(itens.map((i) => passoDoItem(i).id)).size).toBeGreaterThanOrEqual(5);
  });
});
