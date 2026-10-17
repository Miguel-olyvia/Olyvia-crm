import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { negocioBase, pedidoBase, pessoaBase, resumoBase, visitaBase } from "../fabricaTestes";
import type { NegocioPessoa, PapelPessoa, PedidoNegocio, Pessoa, ResumoPessoa } from "../pessoasTipos";
import { COLUNAS_QUADRO, cartoesDoQuadro, type ColunaQuadro } from "./cartoesQuadroPessoas";

const escolhido = (valor: number): NegocioMes["orcamentos"] => [{ id: "o", valor, escolhido: true }];

const porContactar = (id = "pd-1", extra: Partial<PedidoNegocio> = {}): PedidoNegocio => pedidoBase(id, { pessoaId: "a", ...extra });
const contactado = (id = "pd-2", extra: Partial<PedidoNegocio> = {}): PedidoNegocio => pedidoBase(id, { pessoaId: "a", contactado: true, ...extra });
const comVisita = (id = "pd-3", extra: Partial<PedidoNegocio> = {}): PedidoNegocio =>
  pedidoBase(id, { pessoaId: "a", contactado: true, visitas: [visitaBase(`${id}-v1`)], ...extra });

const comPedidos = (pedidos: PedidoNegocio[], extra: Partial<Pessoa> = {}, papel: PapelPessoa = "lead"): ResumoPessoa =>
  resumoBase(pessoaBase("a", extra), [], HOJE_EXEMPLO, papel, pedidos);
const comNegocios = (id: string, negocios: NegocioMes[], papel: PapelPessoa = "lead", pedidos: PedidoNegocio[] = []): ResumoPessoa =>
  resumoBase(pessoaBase(id), negocios.map((n) => ({ ...n, pessoaId: id })), HOJE_EXEMPLO, papel, pedidos);

const colunaDe = (r: ResumoPessoa): ColunaQuadro | undefined => cartoesDoQuadro([r], HOJE_EXEMPLO)[0]?.coluna;

describe("COLUNAS_QUADRO", () => {
  it("tem as 6 colunas, pela ordem do percurso", () => {
    expect(COLUNAS_QUADRO.map((c) => c.id)).toEqual(["porContactar", "contactado", "visita", "orcamento", "proposta", "contrato"]);
    expect(COLUNAS_QUADRO.filter((c) => c.negocio).map((c) => c.id)).toEqual(["orcamento", "proposta", "contrato"]);
  });
});

describe("cartoesDoQuadro: pedidos", () => {
  it("cada fase do pedido vai para a sua coluna", () => {
    expect(colunaDe(comPedidos([porContactar()]))).toBe("porContactar");
    expect(colunaDe(comPedidos([contactado()]))).toBe("contactado");
    expect(colunaDe(comPedidos([comVisita()]))).toBe("visita");
  });

  it("uma visita só cancelada deixa o pedido em Contactado", () => {
    const cancelada = contactado("pd-1", { visitas: [visitaBase("v", { estado: "cancelada" })] });
    expect(colunaDe(comPedidos([cancelada]))).toBe("contactado");
  });

  it("uma lead perdida fica de fora", () => {
    const perdida = { motivo: "preco" as const, data: "2026-10-01" };
    expect(cartoesDoQuadro([comPedidos([contactado()], { perdida })], HOJE_EXEMPLO)).toEqual([]);
  });

  it("um cliente sem negócio aberto e sem pedidos fica de fora; com um pedido, tem um cartão de pedido", () => {
    expect(cartoesDoQuadro([comPedidos([], {}, "cliente")], HOJE_EXEMPLO)).toEqual([]);
    const [c] = cartoesDoQuadro([comPedidos([contactado()], {}, "cliente")], HOJE_EXEMPLO);
    expect(c).toMatchObject({ id: "pedido-pd-2", coluna: "contactado", papel: "cliente", passo: "marcarVisita" });
  });

  it("o cartão traz o nome, o id do pedido, o próximo passo e o prazo (a chamada agendada), sem valor", () => {
    const [c] = cartoesDoQuadro([comPedidos([contactado()], { nome: "Ana", proximoContacto: "2026-10-20" })], HOJE_EXEMPLO);
    expect(c).toMatchObject({
      id: "pedido-pd-2", pedidoId: "pd-2", pessoaId: "a", nome: "Ana", passo: "marcarVisita", prazo: "2026-10-20", valor: null, papel: "lead",
    });
  });

  it("um pedido em Visita tem o prazo da sua próxima visita por fazer; feita, sem prazo; o passo diz «criar o negócio»", () => {
    const [por] = cartoesDoQuadro([comPedidos([comVisita("pd-3")])], HOJE_EXEMPLO);
    expect(por).toMatchObject({ coluna: "visita", prazo: "2026-10-20", passo: "fecharLevantamento" });
    const feita = comVisita("pd-4", { visitas: [visitaBase("v", { estado: "feita" })] });
    const [f] = cartoesDoQuadro([comPedidos([feita])], HOJE_EXEMPLO);
    expect(f).toMatchObject({ coluna: "visita", prazo: null, passo: "criarNegocio" });
  });

  it("o trabalho de um pedido é o seu serviço; sem serviço, null", () => {
    expect(cartoesDoQuadro([comPedidos([comVisita("pd-3", { servico: "Casa de banho" })])], HOJE_EXEMPLO)[0].trabalho).toBe("Casa de banho");
    expect(cartoesDoQuadro([comPedidos([porContactar("pd-1", { servico: "" })])], HOJE_EXEMPLO)[0].trabalho).toBeNull();
  });

  it("uma pessoa com 2 pedidos tem 2 cartões, um por pedido, cada um na sua coluna", () => {
    const cartoes = cartoesDoQuadro([comPedidos([porContactar("pd-1"), comVisita("pd-3")])], HOJE_EXEMPLO);
    expect(cartoes.map((c) => [c.id, c.coluna])).toEqual([["pedido-pd-1", "porContactar"], ["pedido-pd-3", "visita"]]);
  });

  it("o cartão de um negócio não leva pedidoId", () => {
    const n = negocioBase("n1", { orcamentos: escolhido(9000) });
    expect(cartoesDoQuadro([comNegocios("a", [n])], HOJE_EXEMPLO)[0].pedidoId).toBeNull();
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

  it("uma pessoa com 2 negócios abertos tem 2 cartões", () => {
    const cartoes = cartoesDoQuadro([comNegocios("a", [orcamento, proposta])], HOJE_EXEMPLO);
    expect(cartoes.map((c) => [c.id, c.coluna])).toEqual([["n1", "orcamento"], ["n2", "proposta"]]);
  });

  it("os pedidos ficam ao lado dos negócios abertos: primeiro os pedidos, depois os negócios", () => {
    const cartoes = cartoesDoQuadro([comNegocios("a", [orcamento, proposta], "lead", [porContactar("pd-1"), comVisita("pd-3")])], HOJE_EXEMPLO);
    expect(cartoes.map((c) => [c.id, c.coluna])).toEqual([
      ["pedido-pd-1", "porContactar"], ["pedido-pd-3", "visita"], ["n1", "orcamento"], ["n2", "proposta"],
    ]);
  });

  it("um negócio ganho (contrato assinado) fica de fora", () => {
    const ganho = negocioBase("g", { orcamentos: escolhido(1000), proposta: { estado: "aceite" }, contrato: { estado: "assinado" } });
    expect(cartoesDoQuadro([comNegocios("a", [ganho], "cliente")], HOJE_EXEMPLO)).toEqual([]);
  });

  const perdido = { ...negocioBase("p"), pessoaId: "a", mes: "2026-08", resultado: "perdido" } as NegocioPessoa;

  it("um negócio perdido (só no histórico) não dá cartão de negócio; o pedido da lead continua a dar o seu", () => {
    const base = comPedidos([contactado("pd-2")]);
    const cartoes = cartoesDoQuadro([{ ...base, negocios: [perdido], abertos: [] }], HOJE_EXEMPLO);
    expect(cartoes.map((c) => c.id)).toEqual(["pedido-pd-2"]);
  });

  it("uma pessoa perdida não gera cartões, nem de pedido nem de negócio aberto", () => {
    const perdida = { motivo: "preco" as const, data: "2026-09-01" };
    const comAberto = comNegocios("a", [orcamento], "lead", [contactado("pd-2")]);
    const r = { ...comAberto, pessoa: { ...comAberto.pessoa, perdida } };
    expect(cartoesDoQuadro([r], HOJE_EXEMPLO)).toEqual([]);
    expect(cartoesDoQuadro([{ ...r, abertos: [], negocios: [perdido] }], HOJE_EXEMPLO)).toEqual([]);
  });
});

describe("cartoesDoQuadro: atraso", () => {
  it("o prazo anterior a hoje marca o cartão como atrasado; hoje e depois não", () => {
    const com = (prazo: string) => cartoesDoQuadro([comPedidos([contactado()], { proximoContacto: prazo })], HOJE_EXEMPLO)[0].atrasado;
    expect(com("2026-10-12")).toBe(true);
    expect(com(HOJE_EXEMPLO)).toBe(false);
    expect(com("2026-10-20")).toBe(false);
    const n = negocioBase("n", { orcamentos: escolhido(1), proximoPrazo: "2026-10-01" });
    expect(cartoesDoQuadro([comNegocios("a", [n])], HOJE_EXEMPLO)[0].atrasado).toBe(true);
  });

  it("uma visita por fazer com o dia já passado atrasa o cartão do seu pedido", () => {
    const passada = comVisita("pd-3", { visitas: [visitaBase("v", { data: "2026-10-10" })] });
    expect(cartoesDoQuadro([comPedidos([passada])], HOJE_EXEMPLO)[0].atrasado).toBe(true);
  });
});

describe("cartoesDoQuadro: ordem e vazio", () => {
  it("mantém a ordem das pessoas recebidas", () => {
    const b = resumoBase(pessoaBase("b"), [], HOJE_EXEMPLO, "lead", [porContactar("pd-1", { pessoaId: "b" })]);
    const a = comPedidos([porContactar("pd-2")]);
    expect(cartoesDoQuadro([b, a], HOJE_EXEMPLO).map((c) => c.pessoaId)).toEqual(["b", "a"]);
  });

  it("sem pessoas, sem cartões", () => {
    expect(cartoesDoQuadro([], HOJE_EXEMPLO)).toEqual([]);
  });
});
