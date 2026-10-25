// O Quadro de Pessoas em duas partes: a Parte 1 tem um cartão por PESSOA em abordagem (Por contactar, Contactado, Visita) e a Parte 2 um
// cartão por NEGÓCIO (Levantamento, Orçamento, Proposta, Contrato). A mesma pessoa nunca está nas duas partes.
import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import {
  alteracoesAtuais, anularPerda, negociosComPerdidos, perderNegocio, repor as reporPerdas,
} from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import type { RegistosDaPessoa } from "@/components/negocio-metas/registosTipos";
import {
  contactoBase, levantamentoBase, negocioBase, pessoaBase, registosBase, resumoBase, visitaPessoaBase,
} from "../fabricaTestes";
import { juntarPessoas } from "../juntarPessoas";
import type { NegocioPessoa, PapelPessoa, Pessoa, ResumoPessoa } from "../pessoasTipos";
import {
  COLUNAS_ABORDAGEM, COLUNAS_NEGOCIO, COLUNAS_QUADRO, FASES_DO_GRUPO_NEGOCIOS, cartoesDoQuadro, type ColunaQuadro,
} from "./cartoesQuadroPessoas";

const escolhido = (valor: number): NegocioMes["orcamentos"] => [{ id: "o", valor, escolhido: true }];

const abordagem = (registos: RegistosDaPessoa = registosBase(), extra: Partial<Pessoa> = {}, papel: PapelPessoa = "lead"): ResumoPessoa =>
  resumoBase(pessoaBase("a", extra), [], HOJE_EXEMPLO, papel, registos);
const comNegocios = (id: string, negocios: NegocioMes[], papel: PapelPessoa = "lead", registos: RegistosDaPessoa = registosBase()): ResumoPessoa =>
  resumoBase(pessoaBase(id), negocios.map((n) => ({ ...n, pessoaId: id })), HOJE_EXEMPLO, papel, registos);

const colunaDe = (r: ResumoPessoa): ColunaQuadro | undefined => cartoesDoQuadro([r], HOJE_EXEMPLO)[0]?.coluna;

describe("COLUNAS_QUADRO", () => {
  it("tem as 7 colunas, pela ordem do percurso, em duas partes", () => {
    expect(COLUNAS_QUADRO.map((c) => c.id)).toEqual(["porContactar", "contactado", "visita", "levantamento", "orcamento", "proposta", "contrato"]);
    expect(COLUNAS_QUADRO.filter((c) => c.parte === "abordagem").map((c) => c.id)).toEqual(["porContactar", "contactado", "visita"]);
    expect(COLUNAS_QUADRO.filter((c) => c.parte === "negocio").map((c) => c.id)).toEqual(["levantamento", "orcamento", "proposta", "contrato"]);
  });

  it("só as colunas de negócio somam valor", () => {
    expect(COLUNAS_QUADRO.filter((c) => c.negocio).map((c) => c.id)).toEqual(["levantamento", "orcamento", "proposta", "contrato"]);
  });
});

describe("o grupo Negócios do quadro", () => {
  it("a lista única de sub-fases é levantamento, orçamento, proposta e contrato, por esta ordem", () => {
    expect([...FASES_DO_GRUPO_NEGOCIOS]).toEqual(["levantamento", "orcamento", "proposta", "contrato"]);
  });

  it("COLUNAS_NEGOCIO deriva da lista única e COLUNAS_ABORDAGEM são as três colunas soltas", () => {
    expect(COLUNAS_NEGOCIO.map((c) => c.id)).toEqual([...FASES_DO_GRUPO_NEGOCIOS]);
    expect(COLUNAS_ABORDAGEM.map((c) => c.id)).toEqual(["porContactar", "contactado", "visita"]);
  });

  it("COLUNAS_QUADRO continua com as 7 colunas (o hook, o adaptador e o RPC dependem dele)", () => {
    expect(COLUNAS_QUADRO).toHaveLength(7);
  });
});

describe("Parte 1: um cartão por pessoa em abordagem", () => {
  it("cada registo mais avançado leva a pessoa para a sua coluna", () => {
    expect(colunaDe(abordagem())).toBe("porContactar");
    expect(colunaDe(abordagem(registosBase({ contactos: [contactoBase()] })))).toBe("contactado");
    expect(colunaDe(abordagem(registosBase({ contactos: [contactoBase()], visitas: [visitaPessoaBase()] })))).toBe("visita");
  });

  it("uma visita só cancelada deixa a pessoa em Contactado", () => {
    const r = registosBase({ contactos: [contactoBase()], visitas: [visitaPessoaBase("rv-1", { estado: "cancelada" })] });
    expect(colunaDe(abordagem(r))).toBe("contactado");
  });

  it("o cartão é da pessoa: id pessoa-<id>, tipo pessoa, sem valor nem trabalho, com o passo e o prazo dos registos", () => {
    const [c] = cartoesDoQuadro([abordagem(registosBase({ contactos: [contactoBase()] }), { nome: "Ana", proximoContacto: "2026-10-20" })], HOJE_EXEMPLO);
    expect(c).toMatchObject({
      id: "pessoa-a", tipo: "pessoa", pessoaId: "a", nome: "Ana", coluna: "contactado", passo: "marcarVisita", prazo: "2026-10-20", valor: null,
      trabalho: null, papel: "lead",
    });
  });

  it("uma visita por fazer dá prazo (o dia dela) e passo «fechar o levantamento»; feita, sem prazo e o passo é criar o negócio", () => {
    const [por] = cartoesDoQuadro([abordagem(registosBase({ visitas: [visitaPessoaBase()] }))], HOJE_EXEMPLO);
    expect(por).toMatchObject({ coluna: "visita", prazo: "2026-10-20", passo: "fecharLevantamento" });
    const [f] = cartoesDoQuadro([abordagem(registosBase({ visitas: [visitaPessoaBase("rv-1", { estado: "feita" })] }), { proximoContacto: null })], HOJE_EXEMPLO);
    expect(f).toMatchObject({ coluna: "visita", prazo: null, passo: "criarNegocio" });
  });

  it("uma pessoa tem um só cartão, mesmo com muitos registos", () => {
    const r = registosBase({
      contactos: [contactoBase("rc-1"), contactoBase("rc-2")], visitas: [visitaPessoaBase("rv-1"), visitaPessoaBase("rv-2")], levantamentos: [levantamentoBase()],
    });
    expect(cartoesDoQuadro([abordagem(r)], HOJE_EXEMPLO)).toHaveLength(1);
  });

  it("uma pessoa perdida ou com a abordagem encerrada fica de fora", () => {
    expect(cartoesDoQuadro([abordagem(registosBase(), { perdida: { motivo: "preco", data: "2026-10-01" } })], HOJE_EXEMPLO)).toEqual([]);
    const encerrada = { resultado: "semInteresse" as const, motivo: "preco" as const, data: "2026-10-01" };
    expect(cartoesDoQuadro([abordagem(registosBase(), { encerrada })], HOJE_EXEMPLO)).toEqual([]);
  });

  it("um cliente sem registos por ligar nem negócios abertos fica de fora; com um contacto novo posterior volta à Parte 1", () => {
    const ganho = { ...negocioBase("g", { orcamentos: escolhido(1), proposta: { estado: "aceite" }, contrato: { estado: "assinado" }, dias: 40 }), pessoaId: "a" };
    const vazios = { contactos: [], visitas: [], levantamentos: [] };
    expect(cartoesDoQuadro(juntarPessoas([pessoaBase("a")], [ganho as NegocioPessoa], HOJE_EXEMPLO, vazios), HOJE_EXEMPLO)).toEqual([]);
    const novo = { ...vazios, contactos: [contactoBase("rc-9", { data: "2026-10-12" })] };
    const juntado = juntarPessoas([pessoaBase("a")], [ganho as NegocioPessoa], HOJE_EXEMPLO, novo);
    expect(cartoesDoQuadro(juntado, HOJE_EXEMPLO).map((c) => [c.id, c.coluna])).toEqual([["pessoa-a", "contactado"]]);
  });
});

describe("Parte 2: um cartão por negócio", () => {
  const orcamento = negocioBase("n1", { servico: "Cozinha", orcamentos: escolhido(9000) });
  const proposta = negocioBase("n2", { orcamentos: escolhido(5000), proposta: { estado: "enviada" } });
  const contrato = negocioBase("n3", { orcamentos: escolhido(7000), proposta: { estado: "aceite" }, contrato: { estado: "pendente" } });

  it("Orçamento, Proposta e Contrato pela fase do negócio", () => {
    expect(colunaDe(comNegocios("a", [orcamento]))).toBe("orcamento");
    expect(colunaDe(comNegocios("a", [proposta]))).toBe("proposta");
    expect(colunaDe(comNegocios("a", [contrato]))).toBe("contrato");
  });

  it("o cartão traz o serviço, o valor, o passo e o prazo do negócio, e é do tipo negócio", () => {
    const n = { ...orcamento, proximoPrazo: "2026-10-09" };
    expect(cartoesDoQuadro([comNegocios("a", [n])], HOJE_EXEMPLO)[0]).toMatchObject({
      id: "n1", tipo: "negocio", trabalho: "Cozinha", valor: 9000, passo: "criarProposta", prazo: "2026-10-09", papel: "lead",
    });
  });

  it("o rótulo vem do papel já derivado: cliente com um negócio aberto é Cliente", () => {
    expect(cartoesDoQuadro([comNegocios("a", [orcamento], "cliente")], HOJE_EXEMPLO)[0].papel).toBe("cliente");
  });

  it("uma pessoa com 2 negócios abertos tem 2 cartões, e nenhum da Parte 1", () => {
    const registos = registosBase({ contactos: [contactoBase()], visitas: [visitaPessoaBase()] });
    const cartoes = cartoesDoQuadro([comNegocios("a", [orcamento, proposta], "lead", registos)], HOJE_EXEMPLO);
    expect(cartoes.map((c) => [c.id, c.coluna])).toEqual([["n1", "orcamento"], ["n2", "proposta"]]);
  });

  it("um negócio ganho (contrato assinado) fica de fora", () => {
    const ganho = negocioBase("g", { orcamentos: escolhido(1000), proposta: { estado: "aceite" }, contrato: { estado: "assinado" } });
    expect(cartoesDoQuadro([comNegocios("a", [ganho], "cliente")], HOJE_EXEMPLO)).toEqual([]);
  });

  describe("a coluna Levantamento", () => {
    const sem = (extra: Partial<NegocioMes>) => negocioBase("n1", { orcamentos: [], ...extra });
    const dela = (n: NegocioMes, registos?: RegistosDaPessoa) => colunaDe(comNegocios("a", [n], "lead", registos));

    it("um negócio com o levantamento por decidir, ou por fazer, está em Levantamento", () => {
      expect(dela(sem({ decisaoLevantamento: "porDecidir" }))).toBe("levantamento");
      expect(dela(sem({ decisaoLevantamento: "ligado" }), registosBase())).toBe("levantamento");
    });

    it("com um levantamento ligado, ou dispensado, o negócio passa a Orçamento", () => {
      const ligado = registosBase({ levantamentos: [levantamentoBase("rl-1", { negocioId: "n1" })] });
      expect(dela(sem({ decisaoLevantamento: "ligado" }), ligado)).toBe("orcamento");
      expect(dela(sem({ decisaoLevantamento: "dispensado" }))).toBe("orcamento");
    });

    it("um negócio antigo, sem decisão, conta como Orçamento (o que sempre foi)", () => {
      expect(dela(sem({}))).toBe("orcamento");
    });

    it("o cartão em Levantamento não leva valor (ainda não há orçamento) e o passo é fazer o levantamento", () => {
      const [c] = cartoesDoQuadro([comNegocios("a", [sem({ decisaoLevantamento: "porDecidir" })])], HOJE_EXEMPLO);
      expect(c).toMatchObject({ coluna: "levantamento", tipo: "negocio", passo: "fazerLevantamento" });
    });
  });

  describe("perder e anular", () => {
    const perdido = { ...negocioBase("p"), pessoaId: "a", mes: "2026-08", resultado: "perdido" } as NegocioPessoa;

    it("um negócio perdido (no histórico) não dá cartão; a pessoa que só tinha esse volta à Parte 1 se há registos novos", () => {
      const base = abordagem(registosBase({ contactos: [contactoBase("rc-1", { data: "2026-10-12" })] }));
      const juntado = juntarPessoas([base.pessoa], [perdido], HOJE_EXEMPLO, { contactos: base.registos.contactos, visitas: [], levantamentos: [] });
      expect(cartoesDoQuadro(juntado, HOJE_EXEMPLO).map((c) => c.id)).toEqual(["pessoa-a"]);
    });

    it("perder tira o cartão do negócio do quadro e anular a perda devolve-o, na mesma fase", () => {
      reporPerdas(); reporRegistos();
      const n = { ...negocioBase("n-perde", { orcamentos: escolhido(4000), proposta: { estado: "enviada" } }), pessoaId: "a" };
      const cartoes = () => cartoesDoQuadro(
        juntarPessoas([pessoaBase("a")], negociosComPerdidos([n], alteracoesAtuais()) as NegocioPessoa[], HOJE_EXEMPLO, { contactos: [], visitas: [], levantamentos: [] }),
        HOJE_EXEMPLO,
      ).map((c) => [c.id, c.coluna]);
      expect(cartoes()).toEqual([["n-perde", "proposta"]]);
      perderNegocio(n, "Preço", HOJE_EXEMPLO);
      expect(cartoes()).toEqual([]);
      anularPerda("n-perde");
      expect(cartoes()).toEqual([["n-perde", "proposta"]]);
      reporPerdas();
    });
  });
});

describe("cartoesDoQuadro: atraso", () => {
  it("o prazo anterior a hoje marca o cartão como atrasado; hoje e depois não", () => {
    const com = (prazo: string) =>
      cartoesDoQuadro([abordagem(registosBase({ contactos: [contactoBase()] }), { proximoContacto: prazo })], HOJE_EXEMPLO)[0].atrasado;
    expect(com("2026-10-12")).toBe(true);
    expect(com(HOJE_EXEMPLO)).toBe(false);
    expect(com("2026-10-20")).toBe(false);
    const n = negocioBase("n", { orcamentos: escolhido(1), proximoPrazo: "2026-10-01" });
    expect(cartoesDoQuadro([comNegocios("a", [n])], HOJE_EXEMPLO)[0].atrasado).toBe(true);
  });

  it("uma visita por fazer com o dia já passado atrasa o cartão da pessoa", () => {
    const passada = registosBase({ visitas: [visitaPessoaBase("rv-1", { data: "2026-10-10" })] });
    expect(cartoesDoQuadro([abordagem(passada, { proximoContacto: null })], HOJE_EXEMPLO)[0].atrasado).toBe(true);
  });
});

describe("cartoesDoQuadro: ordem e vazio", () => {
  it("mantém a ordem das pessoas recebidas", () => {
    const b = resumoBase(pessoaBase("b"), [], HOJE_EXEMPLO, "lead", registosBase());
    const a = abordagem();
    expect(cartoesDoQuadro([b, a], HOJE_EXEMPLO).map((c) => c.pessoaId)).toEqual(["b", "a"]);
  });

  it("sem pessoas, sem cartões", () => {
    expect(cartoesDoQuadro([], HOJE_EXEMPLO)).toEqual([]);
  });
});
