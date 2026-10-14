import { describe, expect, it } from "vitest";
import {
  COMERCIAIS_EXEMPLO, COMERCIAL_POR_OMISSAO, MAX_SERVICO, criarNegocioExemplo, somarDias, validarNovoNegocio,
  type PessoaOpcao,
} from "./novoNegocio";
import { verificarCoerencia, faseDoNegocio, isNegocioGanho, valorDoNegocio } from "./negocioMetas";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "./negocioMetasExemplo";

const marta: PessoaOpcao = { id: "p-marta", nome: "Marta Silveira", contacto: { telefone: "912 345 601", email: "marta.silveira@exemplo.pt" } };

describe("validarNovoNegocio", () => {
  it("pede a pessoa e o serviço, cada um com o seu erro", () => {
    expect(validarNovoNegocio({ pessoaId: "", servico: "" })).toEqual({ pessoaId: "obrigatorio", servico: "obrigatorio" });
    expect(validarNovoNegocio({ pessoaId: "p-marta", servico: "" })).toEqual({ servico: "obrigatorio" });
    expect(validarNovoNegocio({ pessoaId: "", servico: "Cozinha" })).toEqual({ pessoaId: "obrigatorio" });
  });

  it("um serviço só com espaços é vazio", () => {
    expect(validarNovoNegocio({ pessoaId: "p-marta", servico: "   " })).toEqual({ servico: "obrigatorio" });
  });

  it("aceita um serviço do tamanho máximo e recusa um a mais (contado sem os espaços à volta)", () => {
    expect(validarNovoNegocio({ pessoaId: "p", servico: ` ${"a".repeat(MAX_SERVICO)} ` })).toEqual({});
    expect(validarNovoNegocio({ pessoaId: "p", servico: "a".repeat(MAX_SERVICO + 1) })).toEqual({ servico: "comprido" });
  });

  it("não rebenta com valores em falta", () => {
    const sem = { pessoaId: undefined, servico: undefined } as unknown as { pessoaId: string; servico: string };
    expect(validarNovoNegocio(sem)).toEqual({ pessoaId: "obrigatorio", servico: "obrigatorio" });
  });
});

describe("somarDias", () => {
  it("soma dias, passa de mês e de ano e não sofre com mudanças de hora", () => {
    expect(somarDias("2026-10-13", 2)).toBe("2026-10-15");
    expect(somarDias("2026-10-31", 2)).toBe("2026-11-02");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-28", 2)).toBe("2026-03-30");
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("criarNegocioExemplo", () => {
  const criado = criarNegocioExemplo({ pessoa: marta, servico: "  Casa de banho ", comercial: "Bruno Costa" }, HOJE_EXEMPLO, 1);

  it("começa em Orçamento, sem orçamentos, sem valor e que não conta como ganho", () => {
    expect(criado.id).toBe("n-novo-1");
    expect(faseDoNegocio(criado)).toBe("orcamento");
    expect(criado.orcamentos).toEqual([]);
    expect(criado.proposta).toBeNull();
    expect(criado.contrato).toBeNull();
    expect(valorDoNegocio(criado)).toBe(0);
    expect(isNegocioGanho(criado)).toBe(false);
    expect(criado.novo).toBe(true);
  });

  it("leva a pessoa, o serviço (sem espaços à volta), o comercial e o contacto", () => {
    expect(criado).toMatchObject({
      pessoaId: "p-marta", pessoa: "Marta Silveira", servico: "Casa de banho", comercial: "Bruno Costa",
      contacto: marta.contacto,
    });
  });

  it("0 dias, não parado e o primeiro prazo daqui a 2 dias", () => {
    expect(criado.dias).toBe(0);
    expect(criado.parado).toBe(0);
    expect(criado.proximoPrazo).toBe("2026-10-15");
  });

  it("sem contacto na lista, fica sem telefone nem email; e a sequência dá ids próprios (a mesma pessoa pode ter vários)", () => {
    const sem = criarNegocioExemplo({ pessoa: { id: "p-x", nome: "X" }, servico: "Janelas", comercial: COMERCIAL_POR_OMISSAO }, HOJE_EXEMPLO, 7);
    expect(sem.contacto).toEqual({ telefone: null, email: null });
    expect(sem.id).toBe("n-novo-7");
    const outro = criarNegocioExemplo({ pessoa: marta, servico: "Cozinha", comercial: "Ana Ribeiro" }, HOJE_EXEMPLO, 2);
    expect(outro.id).not.toBe(criado.id);
    expect(outro.pessoaId).toBe(criado.pessoaId);
  });

  it("os comerciais do exemplo são os quatro das metas, com a Ana Ribeiro por omissão, e juntar o novo não parte a coerência", () => {
    expect(COMERCIAIS_EXEMPLO).toEqual(["Ana Ribeiro", "Bruno Costa", "Carla Mendes", "Diogo Lopes"]);
    expect(COMERCIAL_POR_OMISSAO).toBe("Ana Ribeiro");
    expect(verificarCoerencia({ ...DADOS_EXEMPLO, negocios: [...DADOS_EXEMPLO.negocios, criado] })).toEqual([]);
  });
});
