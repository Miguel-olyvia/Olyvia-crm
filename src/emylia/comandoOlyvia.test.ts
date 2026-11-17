import { describe, expect, it } from "vitest";
import { extrairAposGatilho, indicePasso, interpretarComando, negocioPorNome } from "./comandoOlyvia";

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
  it("sem «Olyvia», não devolve nada (não dispara); a última menção conta", () => {
    expect(extrairAposGatilho("abre os negócios")).toBeNull();
    expect(extrairAposGatilho("olyvia espera, olyvia abre as pessoas")).toBe("abre as pessoas");
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
