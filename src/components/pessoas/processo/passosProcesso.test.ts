import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { contactoBase, levantamentoBase, negocioBase, pessoaBase, registosBase, resumoBase, visitaPessoaBase } from "../fabricaTestes";
import { novaLinha } from "@/components/negocio-metas/levantamento";
import type { RegistosDaPessoa } from "@/components/negocio-metas/registosTipos";
import type { ResumoPessoa } from "../pessoasTipos";
import { passoDoNegocio as passoDoNegocioColuna, proximoPasso, type IdPasso } from "../etapaPessoa";
import { juntarPessoas } from "../juntarPessoas";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO } from "../pessoasExemplo";
import { REGISTOS_EXEMPLO } from "../registosExemplo";
import { itemEmFoco, itensDaPessoa } from "./itensProcesso";
import { novaLinhaDoCatalogo } from "./catalogoTrabalhos";
import { ehExecutavel, passoDoItem } from "./passosProcesso";
import type { ExtrasNegocio, OrcamentoDetalhado } from "./orcamentoDetalhado";
import { PASSOS_PROCESSO } from "./tiposProcesso";
import type { ItemProcesso, PassoProcesso } from "./tiposProcesso";

const item = (extra: Partial<ItemProcesso>): ItemProcesso => ({
  id: "pessoa-a", pessoaId: "a", tipo: "pessoa", fase: "porContactar", trabalho: null, valor: null, prazo: null, atrasado: false,
  orcamentos: 0, verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false, ...extra,
});

const orc = (escolhido: boolean): NegocioMes["orcamentos"] => [{ id: "o", valor: 1000, escolhido }];
/** Os registos de uma pessoa contactada com uma visita por fazer (ou feita) no dia dado. */
const comVisita = (data: string, estado: "porFazer" | "feita" = "porFazer"): RegistosDaPessoa =>
  registosBase({ contactos: [contactoBase()], visitas: [visitaPessoaBase("rv-1", { data, estado })] });
const comRegistos = (registos: RegistosDaPessoa, abertos: ReturnType<typeof negocioBase>[] = [], papel: "lead" | "cliente" = "lead") =>
  resumoBase(pessoaBase("a"), abertos, HOJE_EXEMPLO, papel, registos);
const itensDe = (r: ReturnType<typeof resumoBase>): ItemProcesso[] => itensDaPessoa(r, HOJE_EXEMPLO);

describe("PASSOS_PROCESSO", () => {
  // ALTERADO no P3 (a lista tinha 12 passos): acrescentam-se `criarContrato` e `ganharNegocio`, só usados nos negócios da base.
  it("tem os 14 passos, pela ordem do processo (marcar a visita como feita e fazer o levantamento da pessoa são um só passo; criar o contrato e ganhar vêm no fim)", () => {
    expect(PASSOS_PROCESSO).toEqual([
      "registarChamada", "marcarVisita", "marcarVisitaFeita", "criarNegocio", "fazerLevantamento", "criarOrcamento",
      "verificarOrcamento", "aguardarDirecao", "criarProposta", "enviarProposta", "registarRespostaCliente", "registarAssinatura",
      "criarContrato", "ganharNegocio",
    ]);
  });
});

describe("passoDoItem: pessoas em abordagem", () => {
  const casos: [string, Partial<ItemProcesso>, PassoProcesso][] = [
    ["etapa nova (Por contactar)", { fase: "porContactar" }, "registarChamada"],
    ["emContacto (Contactado)", { fase: "contactado" }, "marcarVisita"],
    // Uma pessoa na fase Visita por fazer pede SEMPRE "marcar a visita como feita": a data não decide nada.
    ["visitaMarcada (a data não decide o passo)", { fase: "visita" }, "marcarVisitaFeita"],
    // O levantamento é opcional: com a visita feita o passo é criar o negócio, com ou sem linhas de medidas.
    ["visita feita (o levantamento é opcional)", { fase: "visita", visitaFeita: true }, "criarNegocio"],
  ];
  it.each(casos)("%s", (_nome, extra, esperado) => {
    expect(passoDoItem(item(extra)).id).toBe(esperado);
  });

  it("'visitaFeita' só mexe na fase Visita: uma pessoa contactada continua a marcar a visita", () => {
    expect(passoDoItem(item({ fase: "contactado", visitaFeita: true })).id).toBe("marcarVisita");
  });
});

describe("ehExecutavel: nenhum passo do processo é um botão que só abre a ficha", () => {
  it("todos os passos do processo executam", () => {
    for (const passo of PASSOS_PROCESSO) expect(ehExecutavel(passo), passo).toBe(true);
  });

  it("o passo que o processo dá a qualquer item (pessoa ou negócio, em qualquer fase) executa", () => {
    const fases = ["porContactar", "contactado", "visita", "levantamento", "orcamento", "proposta", "contrato"] as const;
    const verificacoes = ["semDetalhe", "porVerificar", "aguardaDirecao", "verificado"] as const;
    let vistos = 0;
    for (const tipo of ["pessoa", "negocio"] as const) for (const fase of fases) for (const verificacao of verificacoes) {
      for (const extra of [{}, { orcamentos: 2 }, { propostaRascunho: true, orcamentos: 1 }, { visitaFeita: true }]) {
        const passo = passoDoItem(item({ tipo, fase, verificacao, ...extra })).id;
        expect(ehExecutavel(passo), `${tipo}/${fase}/${verificacao}/${passo}`).toBe(true);
        vistos++;
      }
    }
    expect(vistos).toBeGreaterThan(100);
  });
});

describe("passoDoItem: negócios", () => {
  const negocio = (extra: Partial<ItemProcesso>): ItemProcesso => item({ id: "n", tipo: "negocio", ...extra });
  const casos: [string, Partial<ItemProcesso>, PassoProcesso][] = [
    ["Levantamento (por decidir, ou por fazer)", { fase: "levantamento", orcamentos: 0 }, "fazerLevantamento"],
    ["Orçamento sem orçamentos (o levantamento já está ligado ou dispensado)", { fase: "orcamento", orcamentos: 0 }, "criarOrcamento"],
    ["Orçamento com 1 orçamento (sem escolher nenhum: usa-se o último)", { fase: "orcamento", orcamentos: 1 }, "criarProposta"],
    ["Orçamento com 3 orçamentos (sem escolher nenhum: usa-se o último)", { fase: "orcamento", orcamentos: 3 }, "criarProposta"],
    ["Orçamento com um escolhido e sem proposta", { fase: "orcamento", orcamentos: 3 }, "criarProposta"],
    ["Proposta em rascunho", { fase: "proposta", orcamentos: 1, propostaRascunho: true }, "enviarProposta"],
    ["Proposta enviada", { fase: "proposta", orcamentos: 1 }, "registarRespostaCliente"],
    ["Contrato", { fase: "contrato", orcamentos: 1 }, "registarAssinatura"],
    // Fase 4: o orçamento detalhado (guardado pelo editor) é verificado antes de se enviar a proposta.
    ["orçamento escolhido, por verificar", { fase: "orcamento", orcamentos: 1, verificacao: "porVerificar" }, "verificarOrcamento"],
    ["orçamento escolhido, à espera da Direção", { fase: "orcamento", orcamentos: 1, verificacao: "aguardaDirecao" }, "aguardarDirecao"],
    ["orçamento escolhido e verificado: enviar a proposta (criá-la e enviá-la é um só gesto)", { fase: "orcamento", orcamentos: 1, verificacao: "verificado" }, "enviarProposta"],
    ["vários orçamentos e nenhum escolhido: a verificação segue pelo último, sem passo de escolher", { fase: "orcamento", orcamentos: 2, verificacao: "porVerificar" }, "verificarOrcamento"],
    ["sem orçamentos, o estado da verificação não conta", { fase: "orcamento", orcamentos: 0, verificacao: "verificado" }, "criarOrcamento"],
    ["Proposta já enviada, a verificação já não conta", { fase: "proposta", orcamentos: 1, verificacao: "verificado" }, "registarRespostaCliente"],
    ["Proposta em rascunho (do exemplo, sem orçamento detalhado)", { fase: "proposta", orcamentos: 1, propostaRascunho: true, verificacao: "semDetalhe" }, "enviarProposta"],
  ];
  it.each(casos)("%s", (_nome, extra, esperado) => {
    expect(passoDoItem(negocio(extra)).id).toBe(esperado);
  });
});

describe("passoDoItem: o fim do percurso de um negócio da base", () => {
  const negocio = (extra: Partial<ItemProcesso>): ItemProcesso => item({ id: "n", tipo: "negocio", orcamentos: 1, ...extra });

  it("proposta aceite e sem contrato: criar o contrato", () => {
    expect(passoDoItem(negocio({ fase: "proposta", propostaAceite: true })).id).toBe("criarContrato");
  });

  it("contrato assinado e pronto a ganhar: dar o negócio como ganho", () => {
    expect(passoDoItem(negocio({ fase: "contrato", prontoAGanhar: true })).id).toBe("ganharNegocio");
  });

  it("contrato por assinar: continua a ser registar a assinatura, mesmo que o resto venha preenchido", () => {
    expect(passoDoItem(negocio({ fase: "contrato" })).id).toBe("registarAssinatura");
    expect(passoDoItem(negocio({ fase: "contrato", propostaAceite: true })).id).toBe("registarAssinatura");
  });

  it("proposta enviada ou em rascunho (sem aceite) não muda", () => {
    expect(passoDoItem(negocio({ fase: "proposta", propostaAceite: false })).id).toBe("registarRespostaCliente");
    expect(passoDoItem(negocio({ fase: "proposta", propostaRascunho: true })).id).toBe("enviarProposta");
  });

  it("os dois passos novos executam e têm o texto pessoasPagina.todo.step.<id>", () => {
    expect(ehExecutavel("criarContrato") && ehExecutavel("ganharNegocio")).toBe(true);
    expect(passoDoItem(negocio({ fase: "proposta", propostaAceite: true })).chave).toBe("pessoasPagina.todo.step.criarContrato");
    expect(passoDoItem(negocio({ fase: "contrato", prontoAGanhar: true })).chave).toBe("pessoasPagina.todo.step.ganharNegocio");
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

  it("uma pessoa nova dá 1 item 'registarChamada'; o trabalho é nulo", () => {
    const itens = itensDe(comRegistos(registosBase()));
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ tipo: "pessoa", fase: "porContactar", trabalho: null, valor: null, id: "pessoa-a" });
    expect(passoDoItem(itens[0]).id).toBe("registarChamada");
  });

  it("visita marcada: SEMPRE 'marcar a visita como feita', seja no passado, hoje, no futuro ou sem data", () => {
    const com = (data: string): ItemProcesso => itensDe(comRegistos(comVisita(data)))[0];
    for (const data of ["2026-10-12", HOJE_EXEMPLO, "2026-10-20", ""]) expect(passoDoItem(com(data)).id).toBe("marcarVisitaFeita");
  });

  it("uma pessoa contactada pede 'marcar a visita'", () => {
    expect(passoDoItem(itensDe(comRegistos(registosBase({ contactos: [contactoBase()] })))[0]).id).toBe("marcarVisita");
  });

  it("o item de uma visita leva a data da próxima visita por fazer como prazo; feita, sem prazo", () => {
    expect(itensDe(comRegistos(comVisita("2026-10-20")))[0].prazo).toBe("2026-10-20");
    const feita = resumoBase(pessoaBase("a", { proximoContacto: null }), [], HOJE_EXEMPLO, "lead", comVisita("2026-10-12", "feita"));
    expect(itensDe(feita)[0].prazo).toBeNull();
  });

  it("o negócio traz se a proposta é um rascunho (já não há 'orçamento escolhido' no item)", () => {
    const itemDe = (extra: Partial<NegocioMes>): ItemProcesso => itensDe(resumoBase(pessoaBase("a"), [negocioBase("n1", extra)], HOJE_EXEMPLO))[0];
    expect(itemDe({ orcamentos: orc(false) })).toMatchObject({ propostaRascunho: false });
    expect(itemDe({ orcamentos: orc(true) })).toMatchObject({ propostaRascunho: false });
    expect(itemDe({ orcamentos: orc(true), proposta: { estado: "rascunho" } })).toMatchObject({ propostaRascunho: true });
    expect(itemDe({ orcamentos: orc(true), proposta: { estado: "enviada" } })).toMatchObject({ propostaRascunho: false });
  });

  it("com um negócio aberto a pessoa já não está em abordagem: só o item do negócio", () => {
    const r = comRegistos(registosBase({ contactos: [contactoBase()] }), [negocioBase("n1")]);
    expect(itensDe(r).map((i) => i.tipo)).toEqual(["negocio"]);
  });

  it("perdida, ou quem não tem registos por ligar nem negócio aberto, não tem itens", () => {
    const perdida = { motivo: "preco" as const, data: "2026-10-01" };
    expect(itensDe(resumoBase(pessoaBase("a", { perdida }), [negocioBase("n1")], HOJE_EXEMPLO, "lead", registosBase()))).toEqual([]);
    const ganho = { ...negocioBase("g", { orcamentos: orc(true), proposta: { estado: "aceite" }, contrato: { estado: "assinado" }, dias: 60 }), pessoaId: "b" };
    const [cliente] = juntarPessoas([pessoaBase("b")], [ganho], HOJE_EXEMPLO, registosBase());
    expect(itensDe(cliente)).toEqual([]);
  });

  it("um cliente com um contacto novo por ligar tem um item de pessoa (volta à abordagem)", () => {
    const ganho = { ...negocioBase("g", { orcamentos: orc(true), proposta: { estado: "aceite" }, contrato: { estado: "assinado" }, dias: 60 }), pessoaId: "a" };
    const [r] = juntarPessoas([pessoaBase("a")], [ganho], HOJE_EXEMPLO, registosBase({ contactos: [contactoBase("rc-1", { data: "2026-10-12" })] }));
    expect(itensDe(r).map((i) => passoDoItem(i).id)).toEqual(["marcarVisita"]);
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

  it("sem nenhum orçamento escolhido vale o último: o detalhe dele conta e o passo é verificá-lo", () => {
    const doisSemEscolha = { orcamentos: [{ id: "x", valor: 500, escolhido: false }, { id: "o", valor: 1000, escolhido: false }] };
    const comUltimo = itemCom({ n1: orcamento({ orcamentoId: "o" }) }, doisSemEscolha);
    expect(comUltimo.verificacao).toBe("porVerificar");
    expect(passoDoItem(comUltimo).id).toBe("verificarOrcamento");
    expect(itemCom({ n1: orcamento({ orcamentoId: "x" }) }, doisSemEscolha).verificacao).toBe("semDetalhe");
  });

  it("um detalhe de outro orçamento (o escolhido mudou) ou de outro negócio não conta", () => {
    expect(itemCom({ n1: orcamento({ orcamentoId: "outro" }) }).verificacao).toBe("semDetalhe");
    expect(itemCom({ n2: orcamento() }).verificacao).toBe("semDetalhe");
  });

  it("uma pessoa em abordagem não tem verificação", () => {
    const r = comRegistos(registosBase());
    expect(itensDaPessoa(r, HOJE_EXEMPLO, { n1: orcamento() })[0].verificacao).toBe("semDetalhe");
  });
});

describe("pessoa com a visita feita", () => {
  const feita = (extra: Partial<RegistosDaPessoa> = {}): ResumoPessoa => comRegistos({ ...comVisita("2026-10-12", "feita"), ...extra });
  const linhas = (n: number) => ({
    ...levantamentoBase(),
    rascunho: { linhas: Array.from({ length: n }, (_, i) => novaLinha(`l${i + 1}`)), observacoes: "", respostas: {} },
  });

  it("o item traz se há uma visita feita", () => {
    expect(itensDe(comRegistos(comVisita("2026-10-12")))[0]).toMatchObject({ visitaFeita: false });
    expect(itensDe(feita())[0]).toMatchObject({ visitaFeita: true });
    expect(itensDe(feita({ levantamentos: [linhas(3)] }))[0]).toMatchObject({ visitaFeita: true });
  });

  it("com a visita feita → 'criarNegocio', com ou sem linhas guardadas (o levantamento é opcional)", () => {
    expect(passoDoItem(itensDe(feita({ levantamentos: [linhas(1)] }))[0]).id).toBe("criarNegocio");
    expect(passoDoItem(itensDe(feita())[0]).id).toBe("criarNegocio");
  });

  it("uma de duas visitas feita já basta para a pessoa poder criar o negócio", () => {
    const duas = registosBase({
      contactos: [contactoBase()], levantamentos: [linhas(1)],
      visitas: [visitaPessoaBase("rv-1", { estado: "feita" }), visitaPessoaBase("rv-2", { estado: "porFazer", data: "2026-10-30" })],
    });
    expect(itensDe(comRegistos(duas)).map((i) => passoDoItem(i).id)).toEqual(["criarNegocio"]);
  });

  it("a data da visita feita já não serve de prazo (a visita aconteceu)", () => {
    const r = resumoBase(pessoaBase("a", { proximoContacto: null }), [], HOJE_EXEMPLO, "lead", comVisita("2026-10-12", "feita"));
    expect(itensDe(r)[0].prazo).toBeNull();
    expect(itensDe(r)[0].atrasado).toBe(false);
  });

  it("a coluna 'Próximo passo' e o 'A fazer' dizem os dois 'Criar o negócio' (não há passo obrigatório de levantamento), com ou sem linhas", () => {
    for (const r of [feita(), feita({ levantamentos: [linhas(2)] })]) {
      expect(proximoPasso(r).id).toBe("criarNegocio");
      expect(passoDoItem(itensDe(r)[0]).id).toBe("criarNegocio");
    }
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

  it("uma pessoa em abordagem sem negócios: o único item", () => {
    const r = comRegistos(registosBase());
    expect(itemEmFoco(r, itensDe(r))?.id).toBe("pessoa-a");
  });

  it("com um negócio aberto, o negócio (a pessoa já não está em abordagem)", () => {
    const comNegocio = comRegistos(comVisita("2026-10-20"), [negocioBase("n1")]);
    expect(itemEmFoco(comNegocio, itensDe(comNegocio))?.id).toBe("n1");
  });
});

/**
 * O "A fazer" novo e a coluna "Próximo passo" (vocabulário de `etapaPessoa.ts`) têm de dizer a mesma coisa. Cada id da coluna
 * corresponde a um passo do processo; `null` = a coluna diz "—" e a pessoa não tem itens.
 * Um caso em que o vocabulário difere: `fazerLevantamento` da coluna é "criarOrcamento" num negócio sem orçamentos (o negócio já
 * existe). Os dados de exemplo não têm visitas feitas, por isso este mapa cobre o exemplo.
 */
const PASSO_DA_COLUNA: Record<IdPasso, PassoProcesso | null> = {
  registarChamada: "registarChamada", marcarVisita: "marcarVisita", fecharLevantamento: "marcarVisitaFeita",
  criarNegocio: "criarNegocio", fazerLevantamento: "criarOrcamento", criarProposta: "criarProposta",
  enviarProposta: "enviarProposta", esperarCliente: "registarRespostaCliente", recolherAssinatura: "registarAssinatura", nenhum: null,
  // Acrescentados no P3 (só os negócios da base os dão; os de exemplo nunca chegam aqui).
  criarContrato: "criarContrato", ganharNegocio: "ganharNegocio",
};

describe("coerência com a coluna 'Próximo passo' nos dados de exemplo", () => {
  const resumos = juntarPessoas(PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO, HOJE_EXEMPLO, REGISTOS_EXEMPLO);

  it("cada negócio aberto de exemplo: o passo do item é o mesmo da coluna para esse negócio", () => {
    let conferidos = 0;
    for (const r of resumos) {
      for (const item of itensDe(r).filter((i) => i.tipo === "negocio")) {
        const negocio = r.abertos.find((n) => n.id === item.id)!;
        // Em Levantamento a coluna e o "A fazer" dizem o mesmo (fazer o levantamento); em Orçamento sem orçamentos o "A fazer" diz criá-lo.
        const esperado = item.fase === "levantamento" ? "fazerLevantamento" : PASSO_DA_COLUNA[passoDoNegocioColuna(negocio)];
        expect(passoDoItem(item).id, `${r.pessoa.nome} / ${negocio.id}`).toBe(esperado);
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

  // O caso fica aqui explícito: o que a coluna diz e o que o "A fazer" diz para cada estado da pessoa na fase Visita.
  const pessoaNaVisita = (feita: boolean, extra: Partial<RegistosDaPessoa> = {}): ResumoPessoa =>
    comRegistos({ ...comVisita("2026-10-12", feita ? "feita" : "porFazer"), ...extra });
  const duasLinhas = { ...levantamentoBase(), rascunho: { linhas: [novaLinha("l1"), novaLinha("l2")], observacoes: "", respostas: {} } };
  const PESSOAS_NA_VISITA: [string, ResumoPessoa, IdPasso, PassoProcesso][] = [
    ["visita por fazer", pessoaNaVisita(false), "fecharLevantamento", "marcarVisitaFeita"],
    ["visita feita, com linhas guardadas", pessoaNaVisita(true, { levantamentos: [duasLinhas] }), "criarNegocio", "criarNegocio"],
    ["visita feita, sem levantamento", pessoaNaVisita(true), "criarNegocio", "criarNegocio"],
  ];
  it.each(PESSOAS_NA_VISITA)("pessoa na fase Visita, %s: a coluna diz %s e o 'A fazer' diz %s", (_nome, r, colunaEsperada, passoEsperado) => {
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

  it("os exemplos cobrem pessoas de várias fases e negócios de várias fases", () => {
    const itens = resumos.flatMap((r) => itensDe(r));
    expect(new Set(itens.map((i) => i.fase)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(itens.map((i) => passoDoItem(i).id)).size).toBeGreaterThanOrEqual(5);
  });
});
