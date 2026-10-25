// O guia do passo seguinte (funcao pura): dado o item do processo e o que o ecra sabe, devolve o passo, os textos, a lista de verificacao da
// fase, o que o botao primario faz (ou porque nao pode) e a fase anterior (so para ler). Nada se grava aqui.
import { describe, expect, it } from "vitest";
import { passoDoItem } from "./passosProcesso";
import {
  calcularPassoGuiado, fasesDaPessoa, fasesDaPessoaSemPasso, fasesDoNegocioParaGuia, type ContextoDoGuia, type DadosDoGuia,
} from "./passoGuiado";
import { PASSOS_PROCESSO, type ItemProcesso, type PassoProcesso } from "./tiposProcesso";

const item = (extra: Partial<ItemProcesso> = {}): ItemProcesso => ({
  id: "pessoa-a", pessoaId: "a", tipo: "pessoa", fase: "porContactar", trabalho: null, valor: null, prazo: null, atrasado: false, orcamentos: 0,
  verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false, ...extra,
});
const negocio = (extra: Partial<ItemProcesso> = {}): ItemProcesso => item({ id: "n1", tipo: "negocio", fase: "orcamento", trabalho: "Cozinha", ...extra });

const dados = (extra: Partial<DadosDoGuia> = {}): DadosDoGuia => ({
  nome: "Pedro Lopes", temContacto: true, temOrigem: true, chamadas: 0, visitasAtivas: 0, levantamentos: 0, ...extra,
});

const TODOS: ReadonlySet<PassoProcesso> = new Set(PASSOS_PROCESSO);
const PERMS_DOCUMENTOS = ["proposals.edit", "client_contracts.create", "client_contracts.edit"];
const contexto = (extra: Partial<ContextoDoGuia> = {}, i: ItemProcesso = item()): ContextoDoGuia => ({
  dados: dados(), fases: i.tipo === "pessoa" ? fasesDaPessoa(i.fase) : fasesDoNegocioParaGuia([{ id: "orcamento", estado: "atual" }]),
  podeEditar: true, podeCriar: true, pessoaFechada: false, ligados: TODOS, ...extra,
});

describe("calcularPassoGuiado: o passo e os textos", () => {
  it("devolve sempre o mesmo passo que o motor (nao duplica a regra)", () => {
    const itens: ItemProcesso[] = [
      item({ fase: "porContactar" }), item({ fase: "contactado" }), item({ fase: "visita" }), item({ fase: "visita", visitaFeita: true }),
      negocio({ fase: "levantamento" }), negocio({ fase: "orcamento" }), negocio({ fase: "orcamento", orcamentos: 1 }),
      negocio({ fase: "proposta", propostaRascunho: true }), negocio({ fase: "proposta" }), negocio({ fase: "proposta", propostaAceite: true }),
      negocio({ fase: "contrato" }), negocio({ fase: "contrato", prontoAGanhar: true }),
    ];
    for (const i of itens) expect(calcularPassoGuiado(i, contexto({}, i)).passo).toBe(passoDoItem(i).id);
  });

  it("por contactar com tudo preenchido diz «Esta tudo. Registar a chamada.»", () => {
    const p = calcularPassoGuiado(item(), contexto());
    expect(p.tituloChave).toBe("pessoasPagina.guia.titulo.registarChamada.pronto");
    expect(p.subtituloChave).toBe("pessoasPagina.guia.subtitulo.registarChamada");
    expect(p.acao).toMatchObject({ passo: "registarChamada", estado: "pronta", rotuloChave: "pessoasPagina.todo.step.registarChamada" });
  });

  it("por contactar a que falta contacto usa o titulo simples e deixa o item por fazer", () => {
    const p = calcularPassoGuiado(item(), contexto({ dados: dados({ temContacto: false }) }));
    expect(p.tituloChave).toBe("pessoasPagina.guia.titulo.registarChamada");
    expect(p.itens.find((c) => c.id === "contacto")?.feito).toBe(false);
  });

  it("cada passo de pessoa e de negocio ate ao orcamento tem titulo e subtitulo proprios", () => {
    const casos: [ItemProcesso, PassoProcesso][] = [
      [item({ fase: "contactado" }), "marcarVisita"], [item({ fase: "visita" }), "marcarVisitaFeita"],
      [item({ fase: "visita", visitaFeita: true }), "criarNegocio"], [negocio({ fase: "levantamento" }), "fazerLevantamento"],
      [negocio({ fase: "orcamento" }), "criarOrcamento"],
    ];
    for (const [i, passo] of casos) {
      const p = calcularPassoGuiado(i, contexto({}, i));
      expect(p.passo).toBe(passo);
      expect(p.tituloChave).toBe(`pessoasPagina.guia.titulo.${passo}`);
      expect(p.subtituloChave).toBe(`pessoasPagina.guia.subtitulo.${passo}`);
    }
  });

  it("nunca mostra verificar o orcamento nem a Direcao num negocio real (verificacao sem detalhe)", () => {
    for (const i of [negocio({ orcamentos: 0 }), negocio({ orcamentos: 2 })]) {
      expect(["verificarOrcamento", "aguardarDirecao"]).not.toContain(calcularPassoGuiado(i, contexto({}, i)).passo);
    }
  });
});

describe("calcularPassoGuiado: a lista de verificacao da fase", () => {
  it("por contactar: quem pede, contacto e origem so ficam feitos com dado real", () => {
    const completo = calcularPassoGuiado(item(), contexto());
    expect(completo.itens.map((c) => [c.id, c.feito])).toEqual([["quemPede", true], ["contacto", true], ["origem", true]]);
    const vazio = calcularPassoGuiado(item(), contexto({ dados: dados({ nome: "  ", temContacto: false, temOrigem: false }) }));
    expect(vazio.itens.map((c) => c.feito)).toEqual([false, false, false]);
  });

  it("nao inclui o item «Pedido» nem fases do prototipo (Financeiro, Obra)", () => {
    const p = calcularPassoGuiado(item(), contexto());
    expect(p.itens.map((c) => c.id)).not.toContain("pedido");
    const chaves = [...p.itens.map((c) => c.rotuloChave), ...fasesDaPessoa("porContactar").map((f) => f.rotuloChave)].join(" ");
    expect(chaves).not.toMatch(/financeiro|obra/i);
  });

  it("visita: marcada e feita seguem as visitas e o item", () => {
    const i = item({ fase: "visita" });
    const antes = calcularPassoGuiado(i, contexto({ dados: dados({ visitasAtivas: 1 }) }, i));
    expect(antes.itens.map((c) => [c.id, c.feito])).toEqual([["visitaMarcada", true], ["visitaFeita", false]]);
    const feita = item({ fase: "visita", visitaFeita: true });
    expect(calcularPassoGuiado(feita, contexto({ dados: dados({ visitasAtivas: 1 }) }, feita)).itens.map((c) => c.feito)).toEqual([true, true]);
  });

  it("orcamento: so fica feito com orcamentos", () => {
    const sem = negocio({ fase: "orcamento", orcamentos: 0 });
    expect(calcularPassoGuiado(sem, contexto({}, sem)).itens.map((c) => c.feito)).toEqual([false]);
    const com = negocio({ fase: "orcamento", orcamentos: 1 });
    expect(calcularPassoGuiado(com, contexto({}, com)).itens.map((c) => c.feito)).toEqual([true]);
  });

  it("proposta so tem passos de proposta; o fecho «proposta» nunca ganha passo de contrato", () => {
    const i = negocio({ fase: "proposta", propostaRascunho: true });
    const p = calcularPassoGuiado(i, contexto({}, i));
    expect(p.itens.map((c) => c.id)).toEqual(["propostaCriada", "propostaEnviada", "respostaCliente"]);
    expect(p.itens.map((c) => c.feito)).toEqual([true, false, false]);
  });
});

describe("calcularPassoGuiado: o botao primario", () => {
  it("sem permissao de editar, os passos de escrita ficam desativados com a razao (nao desaparecem)", () => {
    const casos: ItemProcesso[] = [
      item({ fase: "contactado" }), item({ fase: "visita" }), negocio({ fase: "levantamento" }), negocio({ fase: "orcamento" }),
    ];
    for (const i of casos) {
      const p = calcularPassoGuiado(i, contexto({ podeEditar: false }, i));
      expect(p.acao.estado).toBe("desativada");
      expect(p.acao.razaoChave).toBe("pessoasPagina.guia.razao.semPermissao");
    }
  });

  it("sem permissao de criar, criar o negocio fica desativado; com ela fica pronto", () => {
    const i = item({ fase: "visita", visitaFeita: true });
    expect(calcularPassoGuiado(i, contexto({ podeCriar: false }, i)).acao).toMatchObject({ estado: "desativada", razaoChave: "pessoasPagina.guia.razao.semPermissaoCriar" });
    expect(calcularPassoGuiado(i, contexto({}, i)).acao.estado).toBe("pronta");
  });

  it("criar o orcamento exige quotes.create quando a lista de permissoes existe", () => {
    const i = negocio({ fase: "orcamento" });
    expect(calcularPassoGuiado(i, contexto({ permissoesFecho: ["proposals.create"] }, i)).acao.estado).toBe("desativada");
    expect(calcularPassoGuiado(i, contexto({ permissoesFecho: ["quotes.create"] }, i)).acao.estado).toBe("pronta");
    expect(calcularPassoGuiado(i, contexto({ permissoesFecho: undefined }, i)).acao.estado).toBe("pronta");
  });

  it("pessoa perdida ou encerrada desativa tudo o que escreve, com a razao do portao", () => {
    for (const i of [item({ fase: "contactado" }), negocio({ fase: "levantamento" }), negocio({ fase: "orcamento" })]) {
      const p = calcularPassoGuiado(i, contexto({ pessoaFechada: true }, i));
      expect(p.acao).toMatchObject({ estado: "desativada", razaoChave: "pessoasPagina.gate.pessoaPerdida" });
    }
  });

  it("um passo que o ecra nao liga fica desativado com «indisponivel» (nao e um botao morto)", () => {
    const i = negocio({ fase: "levantamento" });
    const p = calcularPassoGuiado(i, contexto({ ligados: new Set<PassoProcesso>() }, i));
    expect(p.acao).toMatchObject({ estado: "desativada", razaoChave: "pessoasPagina.guia.razao.indisponivel" });
  });

  it("os passos que nao existem em modo real (verificar o orcamento, a Direcao) ficam so com texto (semAcao)", () => {
    for (const verificacao of ["porVerificar", "aguardaDirecao"] as const) {
      const i = negocio({ fase: "orcamento", orcamentos: 1, verificacao });
      expect(calcularPassoGuiado(i, contexto({ ligados: new Set<PassoProcesso>() }, i)).acao.estado).toBe("semAcao");
    }
  });

  it("os passos de documento (enviar, resposta, contrato, assinatura) ficam prontos quando ligados e desativados, com a razao, quando falta o documento", () => {
    const casos: [ItemProcesso, PassoProcesso][] = [
      [negocio({ fase: "proposta", propostaRascunho: true }), "enviarProposta"], [negocio({ fase: "proposta" }), "registarRespostaCliente"],
      [negocio({ fase: "proposta", propostaAceite: true }), "criarContrato"], [negocio({ fase: "contrato" }), "registarAssinatura"],
    ];
    for (const [i, passo] of casos) {
      expect(calcularPassoGuiado(i, contexto({ ligados: new Set<PassoProcesso>([passo]), permissoesFecho: PERMS_DOCUMENTOS }, i)).acao).toMatchObject({ passo, estado: "pronta" });
      expect(calcularPassoGuiado(i, contexto({ ligados: new Set<PassoProcesso>(), permissoesFecho: PERMS_DOCUMENTOS }, i)).acao)
        .toMatchObject({ passo, estado: "desativada", razaoChave: "pessoasPagina.guia.razao.semDocumento" });
    }
  });

  it("os passos de documento sem permissao de editar, ou com a pessoa fechada, ficam desativados com a razao", () => {
    const i = negocio({ fase: "proposta", propostaRascunho: true });
    expect(calcularPassoGuiado(i, contexto({ podeEditar: false }, i)).acao).toMatchObject({ estado: "desativada", razaoChave: "pessoasPagina.guia.razao.semPermissao" });
    expect(calcularPassoGuiado(i, contexto({ pessoaFechada: true }, i)).acao).toMatchObject({ estado: "desativada", razaoChave: "pessoasPagina.gate.pessoaPerdida" });
  });

  it("criar o contrato exige client_contracts.create; sem lista conhecida fica desativado «a carregar» (falha fechada)", () => {
    const i = negocio({ fase: "proposta", propostaAceite: true });
    expect(calcularPassoGuiado(i, contexto({ permissoesFecho: ["quotes.create"] }, i)).acao).toMatchObject({ estado: "desativada", razaoChave: "pessoasPagina.guia.razao.semPermissao" });
    expect(calcularPassoGuiado(i, contexto({ permissoesFecho: ["client_contracts.create"] }, i)).acao.estado).toBe("pronta");
    expect(calcularPassoGuiado(i, contexto({ permissoesFecho: undefined }, i)).acao)
      .toMatchObject({ estado: "desativada", razaoChave: "pessoasPagina.guia.razao.aCarregarPermissoes" });
  });

  it("os quatro passos de documento ficam desativados «a carregar» sem lista de permissoes; se o passo nem esta ligado vale «sem documento»", () => {
    const casos: [ItemProcesso, PassoProcesso][] = [
      [negocio({ fase: "proposta", propostaRascunho: true }), "enviarProposta"], [negocio({ fase: "proposta" }), "registarRespostaCliente"],
      [negocio({ fase: "proposta", propostaAceite: true }), "criarContrato"], [negocio({ fase: "contrato" }), "registarAssinatura"],
    ];
    for (const [i, passo] of casos) {
      expect(calcularPassoGuiado(i, contexto({ permissoesFecho: undefined }, i)).acao)
        .toMatchObject({ passo, estado: "desativada", razaoChave: "pessoasPagina.guia.razao.aCarregarPermissoes" });
      expect(calcularPassoGuiado(i, contexto({ permissoesFecho: undefined, ligados: new Set<PassoProcesso>() }, i)).acao)
        .toMatchObject({ passo, estado: "desativada", razaoChave: "pessoasPagina.guia.razao.semDocumento" });
    }
  });

  it("enviar e responder a proposta exigem proposals.edit, e assinar exige client_contracts.edit, com a razao", () => {
    const razao = { estado: "desativada", razaoChave: "pessoasPagina.guia.razao.semPermissao" };
    const enviar = negocio({ fase: "proposta", propostaRascunho: true });
    const responder = negocio({ fase: "proposta", propostaRascunho: false, propostaAceite: false });
    const assinar = negocio({ fase: "contrato", prontoAGanhar: false });
    for (const i of [enviar, responder]) {
      expect(calcularPassoGuiado(i, contexto({ permissoesFecho: ["client_contracts.edit"] }, i)).acao).toMatchObject(razao);
      expect(calcularPassoGuiado(i, contexto({ permissoesFecho: ["proposals.edit"] }, i)).acao.estado).toBe("pronta");
    }
    expect(calcularPassoGuiado(assinar, contexto({ permissoesFecho: ["proposals.edit"] }, assinar)).acao).toMatchObject(razao);
    expect(calcularPassoGuiado(assinar, contexto({ permissoesFecho: ["client_contracts.edit"] }, assinar)).acao.estado).toBe("pronta");
  });

  it("ganhar o negocio leva ao bloco de fecho: botao «Ganhar o negocio» quando ligado, sem botao morto quando nao", () => {
    const i = negocio({ fase: "contrato", prontoAGanhar: true });
    expect(calcularPassoGuiado(i, contexto({}, i)).acao).toMatchObject({ passo: "ganharNegocio", estado: "pronta", rotuloChave: "pessoasPagina.guia.acao.ganharNegocio" });
    expect(calcularPassoGuiado(i, contexto({ ligados: new Set<PassoProcesso>() }, i)).acao.estado).toBe("semAcao");
  });
});

describe("calcularPassoGuiado: a fase anterior (so leitura)", () => {
  it("na primeira fase nao ha anterior", () => {
    expect(calcularPassoGuiado(item(), contexto()).anterior).toBeNull();
  });

  it("contactado tem como anterior «Por contactar» com a sua lista", () => {
    const i = item({ fase: "contactado" });
    const p = calcularPassoGuiado(i, contexto({}, i));
    expect(p.anterior).toMatchObject({ id: "porContactar", rotuloChave: "pessoasPagina.board.col.porContactar" });
    expect(p.anterior?.itens.map((c) => c.id)).toEqual(["quemPede", "contacto", "origem"]);
  });

  it("num negocio, o anterior do orcamento e a fase feita antes dele", () => {
    const i = negocio({ fase: "orcamento" });
    const fases = fasesDoNegocioParaGuia([{ id: "levantamento", estado: "feita" }, { id: "orcamento", estado: "atual" }, { id: "proposta", estado: "porFazer" }]);
    const p = calcularPassoGuiado(i, contexto({ fases }, i));
    expect(p.anterior?.id).toBe("levantamento");
    expect(p.anterior?.itens.every((c) => c.feito)).toBe(true);
  });
});

describe("calcularPassoGuiado: as fases feitas e o que ficou registado em cada passo", () => {
  it("sem fases feitas a lista e vazia", () => {
    expect(calcularPassoGuiado(item(), contexto()).feitas).toEqual([]);
  });

  it("devolve TODAS as fases feitas, pela ordem, cada uma com a sua lista", () => {
    const i = item({ fase: "visita" });
    const p = calcularPassoGuiado(i, contexto({}, i));
    expect(p.feitas.map((f) => f.id)).toEqual(["porContactar", "contactado"]);
    expect(p.feitas[0]).toMatchObject({ rotuloChave: "pessoasPagina.board.col.porContactar" });
    expect(p.feitas[0].itens.map((c) => c.id)).toEqual(["quemPede", "contacto", "origem"]);
    expect(p.feitas[1].itens.map((c) => c.id)).toEqual(["chamada", "visitaMarcada"]);
    expect(p.feitas[1].itens.every((c) => c.feito)).toBe(true);
    expect(p.anterior?.id).toBe("contactado");
  });

  it("o detalhe de cada item vem so dos factos que o ecra deu (nada se inventa)", () => {
    const i = item({ fase: "contactado" });
    const detalhes = { quemPede: "Paulo Nogueira", contacto: "912 000 000 · p@x.pt" };
    const p = calcularPassoGuiado(i, contexto({ dados: dados({ detalhes }) }, i));
    const porId = Object.fromEntries(p.feitas[0].itens.map((c) => [c.id, c.detalhe]));
    expect(porId).toEqual({ quemPede: "Paulo Nogueira", contacto: "912 000 000 · p@x.pt", origem: undefined });
  });

  it("sem detalhes nos dados nenhum item tem detalhe", () => {
    const i = item({ fase: "contactado" });
    const p = calcularPassoGuiado(i, contexto({}, i));
    expect(p.feitas[0].itens.every((c) => c.detalhe === undefined)).toBe(true);
    expect(p.itens.every((c) => c.detalhe === undefined)).toBe(true);
  });

  it("os itens da fase atual tambem levam o detalhe (para ler o que ja ha)", () => {
    const p = calcularPassoGuiado(item(), contexto({ dados: dados({ detalhes: { origem: "Campanha Verao" } }) }));
    expect(p.itens.find((c) => c.id === "origem")?.detalhe).toBe("Campanha Verao");
  });
});

describe("as fases da barra", () => {
  it("a pessoa em abordagem ve as colunas do quadro e «Negocio», sem Financeiro nem Obra", () => {
    const fases = fasesDaPessoa("contactado");
    expect(fases.map((f) => f.id)).toEqual(["porContactar", "contactado", "visita", "negocio"]);
    expect(fases.map((f) => f.estado)).toEqual(["feita", "atual", "porFazer", "porFazer"]);
  });

  it("as fases do negocio vem das fases reais e mantem o estado", () => {
    const fases = fasesDoNegocioParaGuia([{ id: "orcamento", estado: "feita" }, { id: "proposta", estado: "atual" }, { id: "contrato", estado: "porFazer" }]);
    expect(fases).toEqual([
      { id: "orcamento", rotuloChave: "pessoasPagina.phases.orcamento", estado: "feita" },
      { id: "proposta", rotuloChave: "pessoasPagina.phases.proposta", estado: "atual" },
      { id: "contrato", rotuloChave: "pessoasPagina.phases.contrato", estado: "porFazer" },
    ]);
  });
});

describe("fasesDaPessoaSemPasso: a barra de quem não tem passo de abordagem a fazer", () => {
  const estados = (fs: { estado: string }[]) => fs.map((f) => f.estado);

  it("um cliente (concluida) tem todas as fases feitas", () => {
    expect(estados(fasesDaPessoaSemPasso(3, "concluida"))).toEqual(["feita", "feita", "feita", "feita"]);
  });

  it("quem já tem negócio está na fase Negócio, com as anteriores feitas", () => {
    expect(estados(fasesDaPessoaSemPasso(3, "atual"))).toEqual(["feita", "feita", "feita", "atual"]);
  });

  it("uma perdida marca a fase onde ficou a vermelho, as anteriores feitas e as seguintes por fazer", () => {
    expect(estados(fasesDaPessoaSemPasso(1, "perdida"))).toEqual(["feita", "perdida", "porFazer", "porFazer"]);
  });

  it("um índice fora do intervalo fica dentro das quatro fases", () => {
    expect(estados(fasesDaPessoaSemPasso(9, "atual"))).toEqual(["feita", "feita", "feita", "atual"]);
    expect(estados(fasesDaPessoaSemPasso(-2, "atual"))).toEqual(["atual", "porFazer", "porFazer", "porFazer"]);
  });

  it("usa as mesmas fases e rótulos que a barra do guia da pessoa", () => {
    expect(fasesDaPessoaSemPasso(0, "atual").map((f) => f.id)).toEqual(fasesDaPessoa("porContactar").map((f) => f.id));
  });
});
