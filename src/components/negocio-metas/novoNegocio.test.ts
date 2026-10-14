import { describe, expect, it } from "vitest";
import {
  COMERCIAIS_EXEMPLO, COMERCIAL_POR_OMISSAO, CONTACTO_VAZIO, criarNegocioExemplo, preencherContactoDaPessoa,
  reporContacto, somarDias, validarNovoNegocio, abasComErros, primeiroErro, type ChaveContacto,
  type PessoaOpcao,
} from "./novoNegocio";
import { levantamentoVazio, novaLinha, type LevantamentoForm, type LinhaForm } from "./levantamento";
import { verificarCoerencia, faseDoNegocio, isNegocioGanho, valorDoNegocio, type LevantamentoNegocio } from "./negocioMetas";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "./negocioMetasExemplo";

const marta: PessoaOpcao = { id: "p-marta", nome: "Marta Silveira", contacto: { telefone: "912 345 601", email: "marta.silveira@exemplo.pt" } };

describe("validarNovoNegocio", () => {
  it("só a pessoa é obrigatória (sem serviço, o negócio é válido com pessoa)", () => {
    expect(validarNovoNegocio({ pessoaId: "" })).toEqual({ pessoaId: "obrigatorio" });
    expect(validarNovoNegocio({ pessoaId: "   " })).toEqual({ pessoaId: "obrigatorio" });
    expect(validarNovoNegocio({ pessoaId: "p-marta" })).toEqual({});
  });

  it("não rebenta com valores em falta", () => {
    const sem = { pessoaId: undefined } as unknown as { pessoaId: string };
    expect(validarNovoNegocio(sem)).toEqual({ pessoaId: "obrigatorio" });
  });
});

const completa: PessoaOpcao = {
  id: "p-ana", nome: "Ana", email: "ana@exemplo.pt", morada: "Rua A, 1000-001 Lisboa", distrito: "Lisboa",
  nif: "123456789", empresa: "Ana Lda", nifEmpresa: "987654321",
};

describe("preencherContactoDaPessoa", () => {
  it("leva os seis campos da pessoa", () => {
    expect(preencherContactoDaPessoa(completa)).toEqual({
      email: "ana@exemplo.pt", morada: "Rua A, 1000-001 Lisboa", distrito: "Lisboa", nif: "123456789",
      empresa: "Ana Lda", nifEmpresa: "987654321",
    });
  });
  it("sem pessoa ou sem dados fica tudo vazio, e o email cai para o contacto da pessoa", () => {
    expect(preencherContactoDaPessoa(undefined)).toEqual(CONTACTO_VAZIO);
    expect(preencherContactoDaPessoa(null)).toEqual(CONTACTO_VAZIO);
    expect(preencherContactoDaPessoa({ id: "x", nome: "X" })).toEqual(CONTACTO_VAZIO);
    expect(preencherContactoDaPessoa(marta).email).toBe("marta.silveira@exemplo.pt");
  });

  it("tira os espaços dos NIF da ficha (204 567 890), que de outro modo nunca validavam", () => {
    const c = preencherContactoDaPessoa({ id: "x", nome: "X", nif: "204 567 890", nifEmpresa: "514 567 890" });
    expect(c).toMatchObject({ nif: "204567890", nifEmpresa: "514567890" });
    expect(validarNovoNegocio({ pessoaId: "x", contacto: c })).toEqual({});
  });
});

describe("reporContacto", () => {
  it("repõe os campos não tocados e mantém os tocados", () => {
    const atual = { ...preencherContactoDaPessoa(completa), nif: "111111111" };
    const tocados = new Set<ChaveContacto>(["nif"]);
    const novo = reporContacto(atual, tocados, { id: "p-b", nome: "B", nif: "222222222", distrito: "Porto" });
    expect(novo).toEqual({ ...CONTACTO_VAZIO, nif: "111111111", distrito: "Porto" });
  });
});

describe("validarNovoNegocio: contacto", () => {
  const base = { pessoaId: "p" };
  it("tudo vazio ou válido passa", () => {
    expect(validarNovoNegocio({ ...base, contacto: CONTACTO_VAZIO })).toEqual({});
    expect(validarNovoNegocio({ ...base, contacto: preencherContactoDaPessoa(completa) })).toEqual({});
  });
  it("recusa email mal formado e NIF que não tenha 9 dígitos, cada um com o seu erro", () => {
    const erros = validarNovoNegocio({ ...base, contacto: { email: "ana@", nif: "12345678", nifEmpresa: "12345678a" } });
    expect(erros).toEqual({ email: "invalido", nif: "invalido", nifEmpresa: "invalido" });
    expect(validarNovoNegocio({ ...base, contacto: { nif: "1234567890" } })).toEqual({ nif: "invalido" });
    expect(validarNovoNegocio({ ...base, contacto: { email: "a b@c.pt" } })).toEqual({ email: "invalido" });
  });
  it("espaços à volta não contam", () => {
    expect(validarNovoNegocio({ ...base, contacto: { email: " a@b.pt ", nif: " 123456789 " } })).toEqual({});
  });
});

describe("criarNegocioExemplo: contacto", () => {
  it("guarda o contacto aparado, e sem ele não deixa a propriedade", () => {
    const c = criarNegocioExemplo({ pessoa: completa, comercial: "Ana Ribeiro", contacto: { ...preencherContactoDaPessoa(completa), distrito: " Porto " } }, HOJE_EXEMPLO, 1);
    expect(c.dadosContacto?.distrito).toBe("Porto");
    expect("dadosContacto" in criarNegocioExemplo({ pessoa: completa, comercial: "Ana Ribeiro" }, HOJE_EXEMPLO, 2)).toBe(false);
  });
});

const linha = (parcial: Partial<LinhaForm> = {}): LinhaForm => ({
  ...novaLinha("l1"), divisao: "cozinha", trabalho: "bancada", medida: "3", ...parcial,
});
const comLevantamento = (parcial: Partial<LevantamentoForm>) => ({
  pessoaId: "p", levantamento: { ...levantamentoVazio("2026-10-13", "Ana Ribeiro"), ...parcial },
});

describe("validarNovoNegocio: levantamento", () => {
  it("um levantamento por fazer e sem linhas é válido (a aba é opcional)", () => {
    expect(validarNovoNegocio(comLevantamento({}))).toEqual({});
  });

  it("Feito sem linhas pede pelo menos uma; com uma linha certa passa", () => {
    expect(validarNovoNegocio(comLevantamento({ estado: "feito" }))).toEqual({ levantamento: "obrigatorio" });
    expect(validarNovoNegocio(comLevantamento({ estado: "feito", linhas: [linha()] }))).toEqual({});
  });

  it("cada linha pede divisão, trabalho e uma medida maior que 0, com o erro no campo certo", () => {
    const vazia = novaLinha("l2");
    expect(validarNovoNegocio(comLevantamento({ linhas: [vazia] })).linhas).toEqual({
      l2: { divisao: "obrigatorio", trabalho: "obrigatorio", medida: "obrigatorio" },
    });
    for (const medida of ["0", "-2", "abc"]) {
      expect(validarNovoNegocio(comLevantamento({ linhas: [linha({ medida })] })).linhas).toEqual({ l1: { medida: "invalido" } });
    }
    expect(validarNovoNegocio(comLevantamento({ linhas: [linha({ medida: "2,5" })] }))).toEqual({});
  });

  it("o trabalho Outro pede o texto, com máximo", () => {
    expect(validarNovoNegocio(comLevantamento({ linhas: [linha({ trabalho: "outro" })] })).linhas).toEqual({ l1: { trabalhoOutro: "obrigatorio" } });
    const comprido = linha({ trabalho: "outro", trabalhoOutro: "a".repeat(61) });
    expect(validarNovoNegocio(comLevantamento({ linhas: [comprido] })).linhas).toEqual({ l1: { trabalhoOutro: "comprido" } });
  });
});

describe("abasComErros e primeiroErro", () => {
  it("diz que aba tem erros: Geral nos campos do negócio, Qualificação na morada, Visita no levantamento", () => {
    expect(abasComErros({})).toEqual({ geral: false, qualificacao: false, visita: false });
    expect(abasComErros({ pessoaId: "obrigatorio" })).toEqual({ geral: true, qualificacao: false, visita: false });
    expect(abasComErros({ codigoPostal: "invalido" })).toEqual({ geral: false, qualificacao: true, visita: false });
    expect(abasComErros({ levantamento: "obrigatorio" })).toEqual({ geral: false, qualificacao: false, visita: true });
    expect(abasComErros({ linhas: { l1: { medida: "invalido" } } })).toEqual({ geral: false, qualificacao: false, visita: true });
  });

  it("o foco vai primeiro para a aba Geral, depois para o código postal, depois para o levantamento (linha a linha)", () => {
    expect(primeiroErro({}, [])).toBeNull();
    expect(primeiroErro({ pessoaId: "obrigatorio", levantamento: "obrigatorio" }, [])).toEqual({ aba: "geral", campo: "pessoa" });
    expect(primeiroErro({ codigoPostal: "invalido", levantamento: "obrigatorio" }, [])).toEqual({ aba: "qualificacao", campo: "cp" });
    expect(primeiroErro({ levantamento: "obrigatorio" }, [])).toEqual({ aba: "visita", campo: "add" });
    const erros = { linhas: { l2: { medida: "invalido" as const }, l1: { trabalho: "obrigatorio" as const } } };
    expect(primeiroErro(erros, ["l1", "l2"])).toEqual({ aba: "visita", campo: "linha-l1-trabalho" });
    expect(primeiroErro(erros, ["l2", "l1"])).toEqual({ aba: "visita", campo: "linha-l2-medida" });
  });
});

describe("validarNovoNegocio: morada da obra", () => {
  it("o código postal é opcional, mas escrito tem de ser 0000-000; só ele dá erro na morada", () => {
    expect(validarNovoNegocio({ pessoaId: "p", moradaObra: { codigoPostal: "" } })).toEqual({});
    expect(validarNovoNegocio({ pessoaId: "p", moradaObra: { codigoPostal: "1000-001" } })).toEqual({});
    expect(validarNovoNegocio({ pessoaId: "p", moradaObra: { codigoPostal: "1000" } })).toEqual({ codigoPostal: "invalido" });
    expect(validarNovoNegocio({ pessoaId: "", moradaObra: { codigoPostal: "x" } })).toEqual({ pessoaId: "obrigatorio", codigoPostal: "invalido" });
  });
});

describe("criarNegocioExemplo: qualificação, morada da obra e visita", () => {
  const base = { pessoa: marta, comercial: "Ana Ribeiro" };
  const qualificacao = [{ pergunta: "Tipo de imóvel", resposta: "Apartamento" }];
  const visita = [{ titulo: "Exterior do edifício", respostas: [{ pergunta: "Acesso", resposta: "Fácil" }] }];
  const morada = { rua: " Rua A 1 ", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" };

  it("guarda o que foi respondido, com a morada aparada", () => {
    const criado = criarNegocioExemplo({ ...base, qualificacao, moradaObra: morada, visita }, HOJE_EXEMPLO, 1);
    expect(criado.qualificacao).toEqual(qualificacao);
    expect(criado.visita).toEqual(visita);
    expect(criado.moradaObra).toEqual({ rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" });
  });

  it("sem nada escrito não deixa as propriedades (listas vazias e morada vazia não se guardam)", () => {
    const criado = criarNegocioExemplo(
      { ...base, qualificacao: [], visita: [], moradaObra: { rua: " ", codigoPostal: "", localidade: "", andar: "" } }, HOJE_EXEMPLO, 2,
    );
    for (const campo of ["qualificacao", "moradaObra", "visita"]) expect(campo in criado, campo).toBe(false);
    expect("qualificacao" in criarNegocioExemplo(base, HOJE_EXEMPLO, 3)).toBe(false);
  });

  it("a morada e a qualificação ficam no negócio, nunca na pessoa", () => {
    const criado = criarNegocioExemplo({ ...base, qualificacao, moradaObra: morada }, HOJE_EXEMPLO, 4);
    expect(criado.pessoaId).toBe(marta.id);
    expect(marta).not.toHaveProperty("moradaObra");
    expect(marta).not.toHaveProperty("qualificacao");
  });
});

describe("criarNegocioExemplo: levantamento", () => {
  const lev: LevantamentoNegocio = {
    data: "2026-10-13", feitoPor: "Ana Ribeiro", estado: "feito", observacoes: "",
    linhas: [{ divisao: "Cozinha", trabalho: "Bancada nova", medida: 3, unidade: "m", observacoes: "" }],
  };
  const criar = (levantamento?: LevantamentoNegocio, n = 1) =>
    criarNegocioExemplo({ pessoa: marta, comercial: "Ana Ribeiro", levantamento }, HOJE_EXEMPLO, n);

  it("guarda o levantamento quando há linhas, e sem ele não deixa a propriedade", () => {
    expect(criar(lev).levantamento).toEqual(lev);
    expect("levantamento" in criar(undefined, 2)).toBe(false);
  });

  it("um levantamento por fazer, sem linhas e sem observações, não se guarda; só com observações guarda-se", () => {
    const vazio: LevantamentoNegocio = { ...lev, estado: "porFazer", linhas: [] };
    expect("levantamento" in criar(vazio, 3)).toBe(false);
    expect(criar({ ...vazio, observacoes: "ver telhado" }, 4).levantamento?.observacoes).toBe("ver telhado");
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
  const criado = criarNegocioExemplo({ pessoa: marta, comercial: "Bruno Costa" }, HOJE_EXEMPLO, 1);

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

  it("leva a pessoa, o comercial e o contacto, e fica sem serviço (vazio, nunca undefined)", () => {
    expect(criado).toMatchObject({
      pessoaId: "p-marta", pessoa: "Marta Silveira", servico: "", comercial: "Bruno Costa",
      contacto: marta.contacto,
    });
  });

  it("0 dias, não parado e o primeiro prazo daqui a 2 dias", () => {
    expect(criado.dias).toBe(0);
    expect(criado.parado).toBe(0);
    expect(criado.proximoPrazo).toBe("2026-10-15");
  });

  it("sem contacto na lista, fica sem telefone nem email; e a sequência dá ids próprios (a mesma pessoa pode ter vários)", () => {
    const sem = criarNegocioExemplo({ pessoa: { id: "p-x", nome: "X" }, comercial: COMERCIAL_POR_OMISSAO }, HOJE_EXEMPLO, 7);
    expect(sem.contacto).toEqual({ telefone: null, email: null });
    expect(sem.id).toBe("n-novo-7");
    const outro = criarNegocioExemplo({ pessoa: marta, comercial: "Ana Ribeiro" }, HOJE_EXEMPLO, 2);
    expect(outro.id).not.toBe(criado.id);
    expect(outro.pessoaId).toBe(criado.pessoaId);
  });

  it("os comerciais do exemplo são os quatro das metas, com a Ana Ribeiro por omissão, e juntar o novo não parte a coerência", () => {
    expect(COMERCIAIS_EXEMPLO).toEqual(["Ana Ribeiro", "Bruno Costa", "Carla Mendes", "Diogo Lopes"]);
    expect(COMERCIAL_POR_OMISSAO).toBe("Ana Ribeiro");
    expect(verificarCoerencia({ ...DADOS_EXEMPLO, negocios: [...DADOS_EXEMPLO.negocios, criado] })).toEqual([]);
  });
});
