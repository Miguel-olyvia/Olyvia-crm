// O regresso à ficha da pessoa: o endereço `?voltar=` que os ecrãs partilhados (orçamentos, propostas, contratos) recebem. É um sítio clássico
// de redirecionamento aberto, por isso só se aceitam caminhos DESTA aplicação que começam por /pessoas: tudo o resto é recusado.
import { describe, expect, it } from "vitest";
import { caminhoVoltarSeguro, comParametro, enderecoDeRegresso, ligacaoComVoltar } from "./voltarParaPessoas";

describe("caminhoVoltarSeguro: o que se aceita", () => {
  it.each([
    "/pessoas",
    "/pessoas?open=11111111-1111-4111-8111-111111111111",
    "/pessoas?open=a&negocio=n1",
    "/pessoas?open=a&negocio=n1&novoContrato=k1",
    "/pessoas?redirect=https://evil.com",
  ])("%s", (valor) => {
    expect(caminhoVoltarSeguro(valor)).toBe(valor);
  });
});

describe("caminhoVoltarSeguro: o que se recusa (redirecionamento aberto)", () => {
  it.each([
    ["ausente", null],
    ["indefinido", undefined],
    ["vazio", ""],
    ["um sítio externo", "https://evil.com"],
    ["sem protocolo mas com dois traços", "//evil.com"],
    ["com a barra do Windows", "/\\evil.com"],
    ["a barra do Windows a seguir ao caminho", "/pessoas\\evil.com"],
    ["um domínio que começa por pessoas", "/pessoas.evil.com"],
    ["um caminho que só começa por pessoas", "/pessoasX"],
    ["um subcaminho", "/pessoas/outra"],
    ["outra página da aplicação", "/leads"],
    ["o caminho de RH", "/rh-exemplo/pessoas"],
    ["relativo", "pessoas"],
    ["javascript", "javascript:alert(1)"],
    ["javascript com o prefixo", "/pessoas?x=1\njavascript:alert(1)"],
    ["maiúsculas", "/PESSOAS"],
    ["espaço à frente", " /pessoas"],
    ["tabulação", "/pessoas\t?open=a"],
    ["caractere de controlo", "/pessoas?open=a\u0000"],
    ["um arroba a fingir de utilizador", "/pessoas@evil.com"],
    ["demasiado comprido", `/pessoas?x=${"a".repeat(1100)}`],
  ] as const)("%s", (_nome, valor) => {
    expect(caminhoVoltarSeguro(valor as string | null | undefined)).toBeNull();
  });
});

describe("comParametro", () => {
  it("acrescenta um parâmetro, com ou sem query", () => {
    expect(comParametro("/pessoas?open=a&negocio=n", "novoContrato", "k1")).toBe("/pessoas?open=a&negocio=n&novoContrato=k1");
    expect(comParametro("/pessoas", "novoContrato", "k1")).toBe("/pessoas?novoContrato=k1");
  });

  it("substitui um parâmetro que já lá está (nunca repete)", () => {
    expect(comParametro("/pessoas?novoContrato=velho&open=a", "novoContrato", "k2")).toBe("/pessoas?novoContrato=k2&open=a");
  });

  it("codifica o valor", () => {
    expect(comParametro("/pessoas", "x", "a&b=c")).toBe("/pessoas?x=a%26b%3Dc");
  });
});

describe("enderecoDeRegresso e ligacaoComVoltar", () => {
  it("o endereço da ficha leva a pessoa e o negócio", () => {
    expect(enderecoDeRegresso("p1", "n1")).toBe("/pessoas?open=p1&negocio=n1");
  });

  it("a ligação a um ecrã leva o regresso codificado em ?voltar=", () => {
    const ligacao = ligacaoComVoltar("/proposals?open=pr1", enderecoDeRegresso("p1", "n1"));
    expect(ligacao).toBe("/proposals?open=pr1&voltar=%2Fpessoas%3Fopen%3Dp1%26negocio%3Dn1");
    expect(caminhoVoltarSeguro(new URL(ligacao, "http://x").searchParams.get("voltar"))).toBe("/pessoas?open=p1&negocio=n1");
  });

  it("sem query no destino usa «?» em vez de «&»", () => {
    expect(ligacaoComVoltar("/quotes", "/pessoas")).toBe("/quotes?voltar=%2Fpessoas");
  });
});
