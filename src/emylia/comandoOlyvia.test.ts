import { describe, expect, it } from "vitest";
import { extrairAposGatilho, indicePasso, interpretarComando, juntarLetras, limparFrase, negocioPorNome, pedeParaParar, pareceComando, temGatilho } from "./comandoOlyvia";

/** O comando em texto curto, para os testes: «Negócios», «?termo», «>nome@fase», «fase:3», «passo:fim», «—». */
const cmd = (frase: string): string => {
  const c = interpretarComando(frase);
  switch (c.acao) {
    case "navegar": return c.nome;
    case "pesquisar": return `?${c.termo}`;
    case "abrir-negocio": return `>${c.nome}${c.fase != null ? `@${c.fase}` : ""}`;
    case "ir-fase": return `fase:${c.fase}`;
    case "ir-passo": return `passo:${c.passo}`;
    default: return "—";
  }
};

describe("17/11: os exemplos do Rúben", () => {
  it("«olyvia vai aos negócios» → «abre o ruben branco na fase de negócio» → «vai para o fim»", () => {
    expect(cmd("olyvia vai aos negocios")).toBe("Negócios");
    expect(cmd("abre o ruben branco na fase de negocio")).toBe(">ruben branco@3");
    expect(cmd("vai para o fim")).toBe("passo:fim");
  });
});

describe("navegação entre páginas", () => {
  it("salta para o sítio pela frase (com ou sem «Olyvia», «abre», «vai»…)", () => {
    expect(cmd("abre os negócios")).toBe("Negócios");
    expect(cmd("Olyvia, abre os negócios")).toBe("Negócios");
    expect(cmd("vai ao quadro dos negócios")).toBe("Negócios");
    expect(cmd("mostra-me o dia de hoje")).toBe("Hoje");
    expect(cmd("operações")).toBe("Operações");
    expect(cmd("quero ver as obras em curso")).toBe("Operações");
    expect(cmd("abre as pessoas")).toBe("Pessoas");
    expect(cmd("vai aos clientes")).toBe("Pessoas");
    expect(cmd("mostra o inventário")).toBe("Inventário");
    expect(cmd("abre o stock")).toBe("Inventário");
    expect(cmd("equipas de obra")).toBe("Equipas de obra");
    expect(cmd("vai ao catálogo")).toBe("Catálogo e custos");
    expect(cmd("abre o estúdio")).toBe("Estúdio");
    expect(cmd("abre a planta")).toBe("Estúdio");
  });
});

describe("abrir um negócio pelo nome (e numa fase)", () => {
  it("«abre/mostra <nome>» abre o negócio; a fase vem junta", () => {
    expect(cmd("abre o Ruben Branco")).toBe(">ruben branco");
    expect(cmd("mostra o negócio da Maria")).toBe(">maria");
    expect(cmd("abre o negócio do Bruno Pavão")).toBe(">bruno pavao");
    expect(cmd("abre o Nuno Pereira na fase de visita")).toBe(">nuno pereira@2");
    expect(cmd("abre a Verónica Negara no financeiro")).toBe(">veronica negara@4");
    expect(cmd("Olyvia abre o teste sistema 2910 na obra")).toBe(">teste sistema 2910@5");
  });

  it("«procura <nome>» continua a ser uma pesquisa", () => {
    expect(cmd("procura o Nuno Pereira")).toBe("?nuno pereira");
    expect(cmd("encontra a cliente Ana Ribeiro")).toBe("?ana ribeiro");
  });
});

describe("andar dentro do negócio aberto", () => {
  it("passos: fim, próximo, anterior, início, e pelo nome", () => {
    expect(cmd("vai para o fim")).toBe("passo:fim");
    expect(cmd("fim")).toBe("passo:fim");
    expect(cmd("próximo passo")).toBe("passo:proximo");
    expect(cmd("avança")).toBe("passo:proximo");
    expect(cmd("volta ao passo anterior")).toBe("passo:anterior");
    expect(cmd("volta atrás")).toBe("passo:anterior");
    expect(cmd("vai para a proposta")).toBe("passo:proposta");
    expect(cmd("vai para o passo morada da obra")).toBe("passo:morada da obra");
  });

  it("fases: «vai para a fase de visita», «fase de financeiro»", () => {
    expect(cmd("vai para a fase de visita")).toBe("fase:2");
    expect(cmd("fase de financeiro")).toBe("fase:4");
  });
});

describe("a palavra de ativação «Olyvia» (modo sempre à escuta)", () => {
  it("devolve o comando depois de «Olyvia» (apanha Olyvia/Olívia/Olivia)", () => {
    expect(extrairAposGatilho("Olyvia, abre os negócios")).toBe("abre os negocios");
    expect(extrairAposGatilho("ó Olívia vai ao catálogo")).toBe("vai ao catalogo");
    expect(extrairAposGatilho("estava eu a falar e disse olivia mostra o inventário")).toBe("mostra o inventario");
  });
  it("modo conversa: reconhece o nome, o «obrigado / chega» e as frases curtas", () => {
    expect(temGatilho("Olívia")).toBe(true);
    expect(temGatilho("abre os negócios")).toBe(false);
    expect(pedeParaParar("obrigado")).toBe(true);
    expect(pedeParaParar("Olyvia, chega")).toBe(true);
    expect(pedeParaParar("obrigado por abrires o negócio")).toBe(false);
    expect(pareceComando("abre o teste cp")).toBe(true);
    expect(pareceComando("ontem fui ao catálogo da loja e depois passei pela obra do senhor joão")).toBe(false);
  });
  it("sem «Olyvia», não devolve nada (não dispara); a última menção conta", () => {
    expect(extrairAposGatilho("abre os negócios")).toBeNull();
    expect(extrairAposGatilho("olyvia espera, olyvia abre as pessoas")).toBe("abre as pessoas");
  });
});

describe("17/11: as frases da gravação do Rúben", () => {
  const ac = (frase: string) => { const c = interpretarComando(frase); return c.acao === "scroll" ? `scroll:${c.para}` : c.acao === "limpar-pesquisa" ? "limpar" : cmd(frase); };
  it("«procura por Ruben Carvalho» procura «ruben carvalho» (sem o «por»)", () => {
    expect(cmd("procura por Ruben Carvalho")).toBe("?ruben carvalho");
    expect(cmd("pesquisa pelo Nuno")).toBe("?nuno");
  });
  it("«não, limpa o campo de pesquisa» limpa a pesquisa", () => {
    expect(ac("não, limpa o campo de pesquisa")).toBe("limpar");
    expect(ac("apaga a pesquisa")).toBe("limpar");
    expect(ac("tira o filtro")).toBe("limpar");
  });
  it("andar na página: «faz-te lá para baixo», «desce», «sobe», «vai ao topo», «fundo da página»", () => {
    expect(ac("faz-te lá para baixo")).toBe("scroll:baixo");
    expect(ac("desce")).toBe("scroll:baixo");
    expect(ac("mais para cima")).toBe("scroll:cima");
    expect(ac("vai ao topo")).toBe("scroll:topo");
    expect(ac("vai até ao fundo da página")).toBe("scroll:fundo");
    expect(ac("vai para o fim")).toBe("passo:fim"); // o fim do negócio continua a ser o passo
  });
  it("«ok abre o Ruben Carvalho novamente»: o «ok» e o «novamente» ficam de fora", () => {
    expect(cmd("ok abre o Ruben Carvalho novamente")).toBe(">ruben carvalho");
    expect(cmd("pronto, vai aos negócios outra vez")).toBe("Negócios");
    expect(limparFrase("nao tem elevador")).toBe("nao tem elevador"); // «não» de resposta fica
  });
  it("ordens de preencher compridas contam como ordem; conversa comprida não", () => {
    expect(pareceComando("põe acesso fácil estacionamento pago contentor de entulho na via pública e sem elevador")).toBe(true);
    expect(pareceComando("ontem fui ao catálogo da loja e depois passei pela obra do senhor joão")).toBe(false);
  });
  it("um passo mal ouvido ainda se encontra («exterior de edifício»)", () => {
    const passos = [{ id: "v", titulo: "Visitas" }, { id: "Local + exterior", titulo: "Exterior do edifício" }, { id: "n", titulo: "Necessidades do cliente" }];
    expect(indicePasso(passos, "exterior do edificio", 0)).toBe(1);
    expect(indicePasso(passos, "exterior de edificio", 0)).toBe(1);
    expect(indicePasso(passos, "necessidades", 0)).toBe(2);
    expect(indicePasso(passos, "ruben carvalho", 0)).toBeNull();
  });
});

describe("o que não percebe (nunca adivinha uma ação)", () => {
  it("frase sem destino, nome nem passo não faz nada", () => {
    expect(cmd("bom dia")).toBe("—");
    expect(cmd("")).toBe("—");
  });
});

describe("cumprir o comando: achar o negócio e o passo", () => {
  const deals = [{ id: 1, nome: "Ruben Branco" }, { id: 2, nome: "Rúben Carvalho" }, { id: 3, nome: "Nuno Pereira" }, { id: 4, nome: "Teste Sistema 2910" }];
  it("o negócio pelo nome (acentos e maiúsculas não contam; o mais parecido ganha)", () => {
    expect(negocioPorNome(deals, "ruben branco")?.id).toBe(1);
    expect(negocioPorNome(deals, "rúben carvalho")?.id).toBe(2);
    expect(negocioPorNome(deals, "nuno")?.id).toBe(3);
    expect(negocioPorNome(deals, "teste sistema 2910")?.id).toBe(4);
    expect(negocioPorNome(deals, "maria")).toBeNull();
  });
  it("17/11 («abre o teste cp» não registava): letras soletradas juntam-se e o nome mal ouvido ainda acerta", () => {
    expect(juntarLetras("teste c p")).toBe("teste cp");
    expect(juntarLetras("abre o teste c p")).toBe("abre o teste cp");
    expect(cmd("abre o teste c p")).toBe(">teste cp");
    expect(cmd("abre o teste cp")).toBe(">teste cp");
    const lista = [...deals, { id: 5, nome: "Teste CP 16/11" }];
    expect(negocioPorNome(lista, "teste c p")?.id).toBe(5);
    expect(negocioPorNome(lista, "teste cp")?.id).toBe(5);
    expect(negocioPorNome(lista, "nuno pereyra")?.id).toBe(3); // mal ouvido
    expect(negocioPorNome(lista, "ruben brancos")?.id).toBe(1);
    expect(negocioPorNome(lista, "maria")).toBeNull();
  });
  it("o passo pelo nome, ou fim / próximo / anterior a partir do aberto", () => {
    const passos = [{ id: "orc", titulo: "Orçamento" }, { id: "Proposta", titulo: "Proposta" }];
    expect(indicePasso(passos, "fim", 0)).toBe(2);
    expect(indicePasso(passos, "proximo", 0)).toBe(1);
    expect(indicePasso(passos, "anterior", 1)).toBe(0);
    expect(indicePasso(passos, "proposta", 0)).toBe(1);
    expect(indicePasso(passos, "orcamento", 1)).toBe(0);
    expect(indicePasso(passos, "fotografias", 0)).toBeNull();
  });
});
