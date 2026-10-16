import { describe, expect, it } from "vitest";
import { novaLinhaDoCatalogo } from "./catalogoTrabalhos";
import { MAX_NOTAS_PROPOSTA, condicoesIniciais, paraCondicoes, validarCondicoes, type CondicoesForm } from "./condicoesProposta";

const HOJE = "2026-10-13";
const completa = (extra: Partial<CondicoesForm> = {}): CondicoesForm => ({
  validade: "30", prazo: "20", inicio: "2026-11-16", pagamento: "metade", garantia: "2", notas: "", ...extra,
});

describe("validarCondicoes", () => {
  it("condições completas não têm erros", () => {
    expect(validarCondicoes(completa(), HOJE)).toEqual({});
  });

  it("as notas são as únicas opcionais: tudo o resto vazio é 'obrigatorio'", () => {
    const vazias = validarCondicoes({ validade: "", prazo: "", inicio: "", pagamento: "", garantia: "", notas: "" }, HOJE);
    expect(vazias).toEqual({
      validade: "obrigatorio", prazo: "obrigatorio", inicio: "obrigatorio", pagamento: "obrigatorio", garantia: "obrigatorio",
    });
  });

  it.each([["0"], ["61"], ["1.5"], ["abc"], ["-3"]])("o prazo %s não é um número inteiro de dias úteis entre 1 e 60", (prazo) => {
    expect(validarCondicoes(completa({ prazo }), HOJE).prazo).toBe("invalido");
  });

  it.each([["1"], ["60"], [" 25 "]])("o prazo %s serve (1 e 60 são os limites)", (prazo) => {
    expect(validarCondicoes(completa({ prazo }), HOJE).prazo).toBeUndefined();
  });

  it("o início não pode ser anterior a hoje; hoje serve", () => {
    expect(validarCondicoes(completa({ inicio: "2026-10-12" }), HOJE).inicio).toBe("passado");
    expect(validarCondicoes(completa({ inicio: HOJE }), HOJE).inicio).toBeUndefined();
  });

  it("uma data que não existe é inválida", () => {
    expect(validarCondicoes(completa({ inicio: "2026-13-45" }), HOJE).inicio).toBe("invalido");
    expect(validarCondicoes(completa({ inicio: "amanhã" }), HOJE).inicio).toBe("invalido");
  });

  it.each([["20"], ["0"], ["90"]])("a validade %s não é uma das de 15, 30 ou 60 dias", (validade) => {
    expect(validarCondicoes(completa({ validade }), HOJE).validade).toBe("invalido");
  });

  it("o pagamento e a garantia só aceitam as opções da lista", () => {
    expect(validarCondicoes(completa({ pagamento: "tudoNoFim" }), HOJE).pagamento).toBe("invalido");
    expect(validarCondicoes(completa({ garantia: "3" }), HOJE).garantia).toBe("invalido");
    for (const pagamento of ["adjudicacao", "metade", "tres", "fases"]) {
      expect(validarCondicoes(completa({ pagamento }), HOJE).pagamento).toBeUndefined();
    }
    for (const garantia of ["1", "2", "5"]) expect(validarCondicoes(completa({ garantia }), HOJE).garantia).toBeUndefined();
  });

  it(`as notas aceitam ${MAX_NOTAS_PROPOSTA} caracteres e não ${MAX_NOTAS_PROPOSTA + 1}; os espaços das pontas não contam`, () => {
    expect(MAX_NOTAS_PROPOSTA).toBe(140);
    expect(validarCondicoes(completa({ notas: "a".repeat(140) }), HOJE).notas).toBeUndefined();
    expect(validarCondicoes(completa({ notas: "a".repeat(141) }), HOJE).notas).toBe("comprido");
    expect(validarCondicoes(completa({ notas: `  ${"a".repeat(140)}  ` }), HOJE).notas).toBeUndefined();
  });
});

describe("paraCondicoes", () => {
  it("converte o formulário em números e aparou as notas", () => {
    expect(paraCondicoes(completa({ prazo: " 20 ", notas: "  Ligar antes.  " }))).toEqual({
      validade: 30, prazo: 20, inicio: "2026-11-16", pagamento: "metade", garantia: 2, notas: "Ligar antes.",
    });
  });
});

describe("condicoesIniciais (e o prazo que sugere)", () => {
  const mo = (trabalho: "pavimento" | "pintura", quantidade: number) => ({ ...novaLinhaDoCatalogo(trabalho, trabalho), quantidade });
  const prazoDe = (linhas: ReturnType<typeof mo>[]) => condicoesIniciais(linhas).prazo;

  it("o prazo sugerido é 0,4 dias úteis por unidade de mão de obra, arredondado, com mínimo de 5 e máximo de 60", () => {
    expect(prazoDe([mo("pavimento", 10), mo("pintura", 40)])).toBe("20");
    expect(prazoDe([mo("pavimento", 2)])).toBe("5");
    expect(prazoDe([mo("pavimento", 1000)])).toBe("60");
  });

  it("os materiais não contam para o prazo", () => {
    expect(condicoesIniciais([{ ...novaLinhaDoCatalogo("azulejos", "a"), quantidade: 500 }]).prazo).toBe("5");
  });

  it("o formulário abre com os valores habituais (30 dias, 50 % + 50 %, 2 anos), o prazo sugerido e o início por escolher", () => {
    expect(condicoesIniciais([mo("pavimento", 10), mo("pintura", 40)])).toEqual({
      validade: "30", prazo: "20", inicio: "", pagamento: "metade", garantia: "2", notas: "",
    });
  });
});
