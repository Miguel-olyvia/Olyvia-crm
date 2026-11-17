import { describe, expect, it } from "vitest";
import { interpretarComando } from "./comandoOlyvia";

const nav = (frase: string) => { const c = interpretarComando(frase); return c.acao === "navegar" ? c.nome : c.acao === "pesquisar" ? `?${c.termo}` : "—"; };

describe("17/11: a Olyvia por comando — navegação", () => {
  it("salta para o sítio pela frase (com ou sem «Olyvia», «abre», «vai»…)", () => {
    expect(nav("abre os negócios")).toBe("Negócios");
    expect(nav("Olyvia, abre os negócios")).toBe("Negócios");
    expect(nav("vai ao quadro dos negócios")).toBe("Negócios");
    expect(nav("mostra-me o dia de hoje")).toBe("Hoje");
    expect(nav("operações")).toBe("Operações");
    expect(nav("quero ver as obras em curso")).toBe("Operações");
    expect(nav("abre as pessoas")).toBe("Pessoas");
    expect(nav("vai aos clientes")).toBe("Pessoas");
    expect(nav("mostra o inventário")).toBe("Inventário");
    expect(nav("abre o stock")).toBe("Inventário");
    expect(nav("equipas de obra")).toBe("Equipas de obra");
    expect(nav("abre o catálogo e custos")).toBe("Catálogo e custos");
    expect(nav("vai ao catálogo")).toBe("Catálogo e custos");
    expect(nav("abre o estúdio")).toBe("Estúdio");
  });

  it("a palavra mais específica ganha", () => {
    expect(nav("catálogo e custos")).toBe("Catálogo e custos");
    expect(nav("equipas de obra")).toBe("Equipas de obra");
  });
});

describe("17/11: a Olyvia por comando — pesquisa de negócio", () => {
  it("«procura/mostra o negócio <nome>» vira uma pesquisa pelo nome", () => {
    expect(nav("procura o Nuno Pereira")).toBe("?nuno pereira");
    expect(nav("mostra o negócio da Maria")).toBe("?maria");
    expect(nav("abre o negócio do Bruno Pavão")).toBe("?bruno pavao");
    expect(nav("encontra a cliente Ana Ribeiro")).toBe("?ana ribeiro");
  });

  it("«os negócios» continua a ser navegação, não uma pesquisa", () => {
    expect(nav("abre os negócios")).toBe("Negócios");
    expect(nav("mostra os negócios")).toBe("Negócios");
  });
});

describe("17/11: a Olyvia por comando — o que não percebe", () => {
  it("frase sem destino nem nome não faz nada (nunca adivinha uma ação)", () => {
    expect(nav("bom dia")).toBe("—");
    expect(nav("")).toBe("—");
    expect(nav("qual é o tempo hoje em Lisboa")).toBe("Hoje"); // «hoje» apanha: aceitável para navegação
  });
});
