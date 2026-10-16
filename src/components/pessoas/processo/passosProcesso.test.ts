import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { negocioBase, pessoaBase, resumoBase } from "../fabricaTestes";
import { novaLinha } from "@/components/negocio-metas/levantamento";
import type { Pessoa, ResumoPessoa } from "../pessoasTipos";
import { passoDoNegocio as passoDoNegocioColuna, proximoPasso, type IdPasso } from "../etapaPessoa";
import { juntarPessoas } from "../juntarPessoas";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO } from "../pessoasExemplo";
import { itemEmFoco, itensDaPessoa } from "./itensProcesso";
import { novaLinhaDoCatalogo } from "./catalogoTrabalhos";
import { ehExecutavel, passoDoItem } from "./passosProcesso";
import type { ExtrasNegocio, OrcamentoDetalhado } from "./orcamentoDetalhado";
import { PASSOS_PROCESSO } from "./tiposProcesso";
import type { ItemProcesso, PassoProcesso } from "./tiposProcesso";

const item = (extra: Partial<ItemProcesso>): ItemProcesso => ({
  id: "pedido-a", pessoaId: "a", tipo: "pedido", fase: "porContactar", trabalho: null, valor: null, prazo: null, atrasado: false,
  orcamentos: 0, orcamentoEscolhido: false, verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false, levantamentoLinhas: 0, ...extra,
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
    // Um pedido na fase Visita por fazer pede SEMPRE "marcar a visita como feita": a data não decide nada.
    ["visitaMarcada (a data não decide o passo)", { fase: "visita" }, "marcarVisitaFeita"],
    ["visita feita, sem levantamento", { fase: "visita", visitaFeita: true }, "fazerLevantamento"],
    ["visita feita, com 1 linha de levantamento", { fase: "visita", visitaFeita: true, levantamentoLinhas: 1 }, "criarNegocio"],
    ["visita feita, com 5 linhas de levantamento", { fase: "visita", visitaFeita: true, levantamentoLinhas: 5 }, "criarNegocio"],
    // Linhas de uma visita que ainda não está feita não adiantam: primeiro marca-se a visita.
    ["visita por fazer, com linhas (não deve acontecer)", { fase: "visita", levantamentoLinhas: 2 }, "marcarVisitaFeita"],
  ];
  it.each(casos)("%s", (_nome, extra, esperado) => {
    expect(passoDoItem(item(extra)).id).toBe(esperado);
  });

  it("'visitaFeita' e as linhas só mexem na fase Visita: um pedido contactado continua a marcar a visita", () => {
    expect(passoDoItem(item({ fase: "contactado", visitaFeita: true, levantamentoLinhas: 3 })).id).toBe("marcarVisita");
  });
});

describe("ehExecutavel: os passos que o botão já executa (Fases 3 e 4)", () => {
  it("só estes executam; os da Fase 5 (e escolher o orçamento) continuam a abrir a ficha", () => {
    const executaveis = PASSOS_PROCESSO.filter(ehExecutavel);
    expect(executaveis).toEqual([
      "registarChamada", "marcarVisita", "marcarVisitaFeita", "fazerLevantamento", "criarNegocio", "criarOrcamento",
      "verificarOrcamento", "aguardarDirecao", "enviarProposta",
    ]);
    for (const passo of ["escolherOrcamento", "criarProposta", "registarRespostaCliente", "gerarContrato", "registarAssinatura"] as const) {
      expect(ehExecutavel(passo), passo).toBe(false);
    }
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
    // Fase 4: o orçamento detalhado (guardado pelo editor) é verificado antes de se enviar a proposta.
    ["orçamento escolhido, por verificar", { fase: "orcamento", orcamentos: 1, orcamentoEscolhido: true, verificacao: "porVerificar" }, "verificarOrcamento"],
    ["orçamento escolhido, à espera da Direção", { fase: "orcamento", orcamentos: 1, orcamentoEscolhido: true, verificacao: "aguardaDirecao" }, "aguardarDirecao"],
    ["orçamento escolhido e verificado: enviar a proposta (criá-la e enviá-la é um só gesto)", { fase: "orcamento", orcamentos: 1, orcamentoEscolhido: true, verificacao: "verificado" }, "enviarProposta"],
    ["orçamentos sem nenhum escolhido continuam a pedir para escolher, mesmo com a verificação por fazer", { fase: "orcamento", orcamentos: 2, verificacao: "porVerificar" }, "escolherOrcamento"],
    ["sem orçamentos, o estado da verificação não conta", { fase: "orcamento", orcamentos: 0, verificacao: "verificado" }, "criarOrcamento"],
    ["Proposta já enviada, a verificação já não conta", { fase: "proposta", orcamentos: 1, orcamentoEscolhido: true, verificacao: "verificado" }, "registarRespostaCliente"],
    ["Proposta em rascunho (do exemplo, sem orçamento detalhado)", { fase: "proposta", orcamentos: 1, orcamentoEscolhido: true, propostaRascunho: true, verificacao: "semDetalhe" }, "enviarProposta"],
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

describe("itensDaPessoa com o orçamento detalhado (Fase 4)", () => {
  const orcamento = (extra: Partial<OrcamentoDetalhado> = {}): ExtrasNegocio => ({
    orcamento: {
      orcamentoId: "o", linhas: [novaLinhaDoCatalogo("pavimento", "l1")], desconto: 0, vendaDireta: false, verificado: false, direcao: null, versao: 1, ...extra,
    },
  });
  const itemCom = (extras: Record<string, ExtrasNegocio>, negocio: Partial<NegocioMes> = { orcamentos: orc(true) }): ItemProcesso =>
    itensDaPessoa(resumoBase(pessoaBase("a"), [negocioBase("n1", negocio)], HOJE_EXEMPLO), HOJE_EXEMPLO, extras)[0];

  it("sem extras (o exemplo) a verificação é 'semDetalhe' e o passo é o da coluna: criar a proposta", () => {
    expect(itemCom({})).toMatchObject({ verificacao: "semDetalhe" });
    expect(passoDoItem(itemCom({})).id).toBe("criarProposta");
  });

  it("com o orçamento escolhido detalhado: por verificar, à espera da Direção, ou verificado", () => {
    expect(itemCom({ n1: orcamento() }).verificacao).toBe("porVerificar");
    expect(itemCom({ n1: orcamento({ direcao: "pedida" }) }).verificacao).toBe("aguardaDirecao");
    expect(itemCom({ n1: orcamento({ verificado: true }) }).verificacao).toBe("verificado");
    expect(itemCom({ n1: orcamento({ verificado: true, direcao: "aprovada" }) }).verificacao).toBe("verificado");
  });

  it("um detalhe de outro orçamento (o escolhido mudou) ou de outro negócio não conta", () => {
    expect(itemCom({ n1: orcamento({ orcamentoId: "outro" }) }).verificacao).toBe("semDetalhe");
    expect(itemCom({ n2: orcamento() }).verificacao).toBe("semDetalhe");
  });

  it("um pedido não tem verificação", () => {
    const r = resumoBase(pessoaBase("a", { etapa: "nova" }), [], HOJE_EXEMPLO);
    expect(itensDaPessoa(r, HOJE_EXEMPLO, { n1: orcamento() })[0].verificacao).toBe("semDetalhe");
  });
});

describe("pedido com a visita feita (Fase 3)", () => {
  const feita = (extra: Partial<NonNullable<Pessoa["visita"]>> = {}): ResumoPessoa =>
    resumoBase(pessoaBase("a", { etapa: "visitaMarcada", visita: { ...visita("2026-10-12"), feita: true, ...extra } }), [], HOJE_EXEMPLO);
  const linhas = (n: number) => ({ linhas: Array.from({ length: n }, (_, i) => novaLinha(`l${i + 1}`)), observacoes: "", respostas: {} });

  it("o item traz se a visita está feita e quantas linhas tem o levantamento guardado", () => {
    expect(itensDe(resumoBase(pessoaBase("a", { etapa: "visitaMarcada", visita: visita("2026-10-12") }), [], HOJE_EXEMPLO))[0])
      .toMatchObject({ visitaFeita: false, levantamentoLinhas: 0 });
    expect(itensDe(feita())[0]).toMatchObject({ visitaFeita: true, levantamentoLinhas: 0 });
    expect(itensDe(feita({ levantamento: linhas(3) }))[0]).toMatchObject({ visitaFeita: true, levantamentoLinhas: 3 });
  });

  it("visita feita → 'fazerLevantamento'; com linhas guardadas → 'criarNegocio'", () => {
    expect(passoDoItem(itensDe(feita())[0]).id).toBe("fazerLevantamento");
    expect(passoDoItem(itensDe(feita({ levantamento: linhas(1) }))[0]).id).toBe("criarNegocio");
  });

  it("a data da visita feita já não serve de prazo (a visita aconteceu)", () => {
    expect(itensDe(feita())[0].prazo).toBeNull();
    expect(itensDe(feita())[0].atrasado).toBe(false);
  });

  it("a coluna 'Próximo passo' não tem 'Criar o negócio': diz 'Fazer o levantamento' nos dois casos, e o 'A fazer' distingue-os", () => {
    const comLinhas = feita({ levantamento: linhas(2) });
    expect(proximoPasso(feita()).id).toBe("fazerLevantamento");
    expect(passoDoItem(itensDe(feita())[0]).id).toBe("fazerLevantamento");
    expect(proximoPasso(comLinhas).id).toBe("fazerLevantamento");
    expect(passoDoItem(itensDe(comLinhas)[0]).id).toBe("criarNegocio");
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
 * Dois casos em que o vocabulário difere: `fazerLevantamento` da coluna é "criarOrcamento" num negócio sem orçamentos (o negócio já
 * existe) e, num pedido com a visita feita, é "fazerLevantamento" ou "criarNegocio" (a coluna não tem "Criar o negócio"; ver
 * "pedido com a visita feita"). Os dados de exemplo não têm visitas feitas, por isso este mapa cobre o exemplo.
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

  // A divergência que se mantém de propósito: o mesmo IdPasso da coluna ("fazerLevantamento") quer dizer duas coisas, e os dados de
  // exemplo não têm visitas feitas, por isso o caso fica aqui explícito (coluna, e o que o "A fazer" diz para cada estado do pedido).
  const pedidoNaVisita = (extra: Partial<NonNullable<Pessoa["visita"]>>): ResumoPessoa =>
    resumoBase(pessoaBase("a", { etapa: "visitaMarcada", visita: { ...visita("2026-10-12"), ...extra } }), [], HOJE_EXEMPLO);
  const duasLinhas = { linhas: [novaLinha("l1"), novaLinha("l2")], observacoes: "", respostas: {} };
  const PEDIDOS_NA_VISITA: [string, ResumoPessoa, IdPasso, PassoProcesso][] = [
    ["visita por fazer", pedidoNaVisita({}), "fecharLevantamento", "marcarVisitaFeita"],
    ["visita feita, sem linhas", pedidoNaVisita({ feita: true }), "fazerLevantamento", "fazerLevantamento"],
    ["visita feita, com linhas guardadas", pedidoNaVisita({ feita: true, levantamento: duasLinhas }), "fazerLevantamento", "criarNegocio"],
  ];
  it.each(PEDIDOS_NA_VISITA)("pedido na fase Visita, %s: a coluna diz %s e o 'A fazer' diz %s", (_nome, r, colunaEsperada, passoEsperado) => {
    expect(proximoPasso(r).id).toBe(colunaEsperada);
    expect(passoDoItem(itensDe(r)[0]).id).toBe(passoEsperado);
  });

  // Fase 4: um negócio com orçamento detalhado. A coluna diz "Criar a proposta" (a página real só tem proposta depois de a enviar) e o
  // "A fazer" diz o que falta antes (verificar, esperar a Direção) e, com tudo pronto, "Enviar a proposta" (criar e enviar num só gesto).
  const detalhadoEm = (extra: Partial<OrcamentoDetalhado>): ExtrasNegocio => ({
    orcamento: {
      orcamentoId: "o", linhas: [novaLinhaDoCatalogo("pavimento", "l1")], desconto: 0, vendaDireta: false, verificado: false, direcao: null, versao: 1, ...extra,
    },
  });
  const COM_DETALHE: [string, Partial<OrcamentoDetalhado>, PassoProcesso][] = [
    ["por verificar", {}, "verificarOrcamento"],
    ["à espera da Direção", { direcao: "pedida" }, "aguardarDirecao"],
    ["verificado", { verificado: true }, "enviarProposta"],
  ];
  it.each(COM_DETALHE)("orçamento detalhado %s: a coluna diz 'criar a proposta' e o 'A fazer' diz %s", (_nome, extra, passoEsperado) => {
    const r = resumoBase(pessoaBase("a"), [negocioBase("n1", { orcamentos: orc(true) })], HOJE_EXEMPLO);
    expect(proximoPasso(r).id).toBe("criarProposta");
    expect(passoDoItem(itensDaPessoa(r, HOJE_EXEMPLO, { n1: detalhadoEm(extra) })[0]).id).toBe(passoEsperado);
  });

  it("os exemplos cobrem pedidos de várias fases e negócios de várias fases", () => {
    const itens = resumos.flatMap((r) => itensDe(r));
    expect(new Set(itens.map((i) => i.fase)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(itens.map((i) => passoDoItem(i).id)).size).toBeGreaterThanOrEqual(5);
  });
});
