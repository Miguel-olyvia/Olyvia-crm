import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { negocioBase, pessoaBase, resumoBase } from "../fabricaTestes";
import type { EtapaPessoa, NegocioPessoa, PapelPessoa, Pessoa, ResumoPessoa } from "../pessoasTipos";
import { COLUNAS_QUADRO, cartoesDoQuadro, type ColunaQuadro } from "./cartoesQuadroPessoas";

const escolhido = (valor: number): NegocioMes["orcamentos"] => [{ id: "o", valor, escolhido: true }];

const pedido = (id: string, etapa: EtapaPessoa, extra: Partial<Pessoa> = {}): ResumoPessoa =>
  resumoBase(pessoaBase(id, { etapa, ...extra }), [], HOJE_EXEMPLO);
const comNegocios = (id: string, negocios: NegocioMes[], papel: PapelPessoa = "lead"): ResumoPessoa =>
  resumoBase(pessoaBase(id), negocios.map((n) => ({ ...n, pessoaId: id })), HOJE_EXEMPLO, papel);

const colunaDe = (r: ResumoPessoa): ColunaQuadro | undefined => cartoesDoQuadro([r], HOJE_EXEMPLO)[0]?.coluna;

describe("COLUNAS_QUADRO", () => {
  it("tem as 6 colunas, pela ordem do percurso", () => {
    expect(COLUNAS_QUADRO.map((c) => c.id)).toEqual(["porContactar", "contactado", "visita", "orcamento", "proposta", "contrato"]);
    expect(COLUNAS_QUADRO.filter((c) => c.negocio).map((c) => c.id)).toEqual(["orcamento", "proposta", "contrato"]);
  });
});

describe("cartoesDoQuadro: pedidos", () => {
  it("cada etapa de lead vai para a sua coluna", () => {
    expect(colunaDe(pedido("a", "nova"))).toBe("porContactar");
    expect(colunaDe(pedido("b", "emContacto"))).toBe("contactado");
    expect(colunaDe(pedido("c", "visitaMarcada"))).toBe("visita");
  });

  it("uma lead nova que já tem chamada registada passa a Contactado", () => {
    expect(colunaDe(pedido("a", "nova", { resultadoContacto: "naoAtendeu" }))).toBe("contactado");
  });

  it("uma lead perdida fica de fora", () => {
    const perdida = { motivo: "preco" as const, data: "2026-10-01" };
    expect(cartoesDoQuadro([pedido("a", "emContacto", { perdida })], HOJE_EXEMPLO)).toEqual([]);
  });

  it("um cliente sem negócio aberto fica de fora", () => {
    const r = resumoBase(pessoaBase("a"), [], HOJE_EXEMPLO, "cliente");
    expect(cartoesDoQuadro([r], HOJE_EXEMPLO)).toEqual([]);
  });

  it("o cartão traz o nome, o próximo passo e o prazo da etapa, sem valor", () => {
    const [c] = cartoesDoQuadro([pedido("a", "emContacto", { nome: "Ana", proximoContacto: "2026-10-20" })], HOJE_EXEMPLO);
    expect(c).toMatchObject({ pessoaId: "a", nome: "Ana", passo: "marcarVisita", prazo: "2026-10-20", valor: null, papel: "lead" });
  });

  it("o trabalho de um pedido vem do serviço da visita, quando existe", () => {
    const visita = {
      data: "2026-10-20", hora: "", comercial: "x", servico: "Casa de banho", igualALead: true,
      moradaVisita: { rua: "", codigoPostal: "", localidade: "", andar: "" },
    };
    expect(cartoesDoQuadro([pedido("a", "visitaMarcada", { visita })], HOJE_EXEMPLO)[0].trabalho).toBe("Casa de banho");
    expect(cartoesDoQuadro([pedido("b", "nova")], HOJE_EXEMPLO)[0].trabalho).toBeNull();
  });
});

describe("cartoesDoQuadro: negócios", () => {
  const orcamento = negocioBase("n1", { servico: "Cozinha", orcamentos: escolhido(9000) });
  const proposta = negocioBase("n2", { orcamentos: escolhido(5000), proposta: { estado: "enviada" } });
  const contrato = negocioBase("n3", { orcamentos: escolhido(7000), proposta: { estado: "aceite" }, contrato: { estado: "pendente" } });

  it("Orçamento, Proposta e Contrato pela fase do negócio", () => {
    expect(colunaDe(comNegocios("a", [orcamento]))).toBe("orcamento");
    expect(colunaDe(comNegocios("a", [proposta]))).toBe("proposta");
    expect(colunaDe(comNegocios("a", [contrato]))).toBe("contrato");
  });

  it("o cartão traz o serviço, o valor, o passo e o prazo do negócio", () => {
    const n = { ...orcamento, proximoPrazo: "2026-10-09" };
    expect(cartoesDoQuadro([comNegocios("a", [n])], HOJE_EXEMPLO)[0]).toMatchObject({
      id: "n1", trabalho: "Cozinha", valor: 9000, passo: "criarProposta", prazo: "2026-10-09", papel: "lead",
    });
  });

  it("o rótulo vem do papel já derivado: cliente com um negócio aberto é Cliente", () => {
    expect(cartoesDoQuadro([comNegocios("a", [orcamento], "cliente")], HOJE_EXEMPLO)[0].papel).toBe("cliente");
  });

  it("uma pessoa com 2 negócios abertos tem 2 cartões, e nenhum pedido ao lado", () => {
    const cartoes = cartoesDoQuadro([comNegocios("a", [orcamento, proposta])], HOJE_EXEMPLO);
    expect(cartoes.map((c) => [c.id, c.coluna])).toEqual([["n1", "orcamento"], ["n2", "proposta"]]);
  });

  it("um negócio ganho (contrato assinado) fica de fora", () => {
    const ganho = negocioBase("g", { orcamentos: escolhido(1000), proposta: { estado: "aceite" }, contrato: { estado: "assinado" } });
    expect(cartoesDoQuadro([comNegocios("a", [ganho], "cliente")], HOJE_EXEMPLO)).toEqual([]);
  });

  const perdido = { ...negocioBase("p"), pessoaId: "a", mes: "2026-08", resultado: "perdido" } as NegocioPessoa;

  it("um negócio perdido (só no histórico) não dá cartão de negócio: uma lead não perdida volta ao cartão de pedido", () => {
    const base = pedido("a", "emContacto");
    expect(base.pessoa.perdida).toBeUndefined();
    const cartoes = cartoesDoQuadro([{ ...base, negocios: [perdido], abertos: [] }], HOJE_EXEMPLO);
    expect(cartoes.map((c) => c.id)).toEqual(["pedido-a"]);
  });

  it("uma pessoa perdida não gera cartões, nem de pedido nem de negócio aberto", () => {
    const perdida = { motivo: "preco" as const, data: "2026-09-01" };
    const comAberto = comNegocios("a", [orcamento]);
    const r = { ...comAberto, pessoa: { ...comAberto.pessoa, perdida } };
    expect(cartoesDoQuadro([r], HOJE_EXEMPLO)).toEqual([]);
    expect(cartoesDoQuadro([{ ...r, abertos: [], negocios: [perdido] }], HOJE_EXEMPLO)).toEqual([]);
  });
});

describe("cartoesDoQuadro: atraso", () => {
  it("o prazo anterior a hoje marca o cartão como atrasado; hoje e depois não", () => {
    const com = (prazo: string) => cartoesDoQuadro([pedido("a", "emContacto", { proximoContacto: prazo })], HOJE_EXEMPLO)[0].atrasado;
    expect(com("2026-10-12")).toBe(true);
    expect(com(HOJE_EXEMPLO)).toBe(false);
    expect(com("2026-10-20")).toBe(false);
    const n = negocioBase("n", { orcamentos: escolhido(1), proximoPrazo: "2026-10-01" });
    expect(cartoesDoQuadro([comNegocios("a", [n])], HOJE_EXEMPLO)[0].atrasado).toBe(true);
  });
});

describe("cartoesDoQuadro: ordem e vazio", () => {
  it("mantém a ordem das pessoas recebidas", () => {
    const cartoes = cartoesDoQuadro([pedido("b", "nova"), pedido("a", "nova")], HOJE_EXEMPLO);
    expect(cartoes.map((c) => c.pessoaId)).toEqual(["b", "a"]);
  });

  it("sem pessoas, sem cartões", () => {
    expect(cartoesDoQuadro([], HOJE_EXEMPLO)).toEqual([]);
  });
});
