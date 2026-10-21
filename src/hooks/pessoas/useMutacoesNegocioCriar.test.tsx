// Criar um negócio (neg_criar_negocio) pela ficha real: os parâmetros, o que cada permissão deixa mandar, a bandeira de M6 (orçamento,
// proposta e contrato em p_registos), as respostas (mudou, recusados) e os erros pelo código.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import type { PedidoCriarNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { fichaDb, LEAD_ID, pessoaDb, PESSOA_ID } from "./fichaFabrica";
import { erroDe, invalidadas, limparAcoes, prepararAcoes, semear } from "./acoesFichaTestUtil";
import { captureMock, criarCliente, fonteReal, montarHook, nomeChamado, parametros, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import type { FichaDb } from "./fichaTipos";
import { useMutacoesNegocio } from "./useMutacoesNegocio";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

beforeEach(prepararAcoes);
afterEach(limparAcoes);

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const pedido = (extra: Partial<PedidoCriarNegocio> = {}): PedidoCriarNegocio => ({
  id: ID, titulo: "Casa de banho", notas: "", comercialId: null, leadId: null, reabrirAbordagem: false, registos: [], levantamentoId: null, ...extra,
});
const ok = (extra: Record<string, unknown> = {}) => respostaOk({ negocio_id: ID, mudou: true, ligados: [], recusados: [], lead_escolhida: null, ...extra });

function montar(ficha: FichaDb | null = fichaDb(), comDocumentos?: boolean) {
  const client = criarCliente();
  const r = montarHook(() => useMutacoesNegocio(PESSOA_ID, ficha, { comDocumentos }), undefined, { client, fonte: fonteReal() });
  return { ...r, client };
}

describe("criar: os parâmetros", () => {
  it("manda o id do pedido, a organização, a pessoa, o título e as notas limpos, e o comercial e a lead", async () => {
    rpcMock.mockReturnValue(ok());
    const { result } = montar();
    await act(async () => {
      await result.current.criar(pedido({ titulo: "  Cozinha  ", notas: "  Tudo novo  ", comercialId: "u9", leadId: LEAD_ID }));
    });
    expect(nomeChamado(0)).toBe("neg_criar_negocio");
    expect(parametros(0)).toEqual({
      p_id: ID, p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_titulo: "Cozinha", p_notas: "Tudo novo", p_assigned_to: "u9",
      p_registos: [], p_levantamento_id: null, p_lead_id: LEAD_ID, p_reabrir_abordagem: false, p_fecho: "contrato",
    });
  });

  it("sem escolha manda p_fecho «contrato» (a omissão); «proposta» (venda directa) vai tal e qual", async () => {
    rpcMock.mockReturnValue(ok());
    const { result } = montar();
    await act(async () => { await result.current.criar(pedido()); });
    expect(parametros(0).p_fecho).toBe("contrato");
    await act(async () => { await result.current.criar(pedido({ id: "outro-id", fecho: "proposta" })); });
    expect(parametros(1).p_fecho).toBe("proposta");
  });

  it("um tipo de fecho desconhecido recusa com NG009 sem chamar a base", async () => {
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.criar(pedido({ fecho: "outro" as never })); }));
    expect(erro.codigo).toBe("NG009");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("notas vazias vão como nulo e sem comercial vai nulo (a base usa quem cria)", async () => {
    rpcMock.mockReturnValue(ok());
    const { result } = montar();
    await act(async () => { await result.current.criar(pedido({ notas: "   " })); });
    expect(parametros(0)).toMatchObject({ p_notas: null, p_assigned_to: null, p_lead_id: null });
  });

  it("contactos e visitas vão em p_registos, e o levantamento em p_levantamento_id", async () => {
    rpcMock.mockReturnValue(ok());
    const { result } = montar();
    await act(async () => {
      await result.current.criar(pedido({ registos: [{ tipo: "contacto", id: "c1" }, { tipo: "visita", id: "v1" }], levantamentoId: "l1" }));
    });
    expect(parametros(0)).toMatchObject({ p_registos: [{ tipo: "contacto", id: "c1" }, { tipo: "visita", id: "v1" }], p_levantamento_id: "l1" });
  });

  it("«Reabrir a abordagem» vai como p_reabrir_abordagem", async () => {
    rpcMock.mockReturnValue(ok());
    const { result } = montar();
    await act(async () => { await result.current.criar(pedido({ reabrirAbordagem: true })); });
    expect(parametros(0).p_reabrir_abordagem).toBe(true);
  });
});

describe("criar: o que cada permissão deixa mandar", () => {
  it("quem só pode criar (não editar) manda p_registos vazio e sem levantamento: ligar exige editar", async () => {
    rpcMock.mockReturnValue(ok());
    const { result } = montar(fichaDb({ permissoes: { editar: false, criar: true } }));
    await act(async () => {
      await result.current.criar(pedido({ registos: [{ tipo: "contacto", id: "c1" }], levantamentoId: "l1" }));
    });
    expect(parametros(0)).toMatchObject({ p_registos: [], p_levantamento_id: null });
  });

  it("quem não pode criar recusa sem chamar a base (42501)", async () => {
    const { result } = montar(fichaDb({ permissoes: { editar: true, criar: false } }));
    const erro = await erroDe(act(async () => { await result.current.criar(pedido()); }));
    expect(erro.codigo).toBe("42501");
    expect(erro.chave).toBe("pessoasPagina.erroNeg.permissao");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("a ficha de OUTRA pessoa nunca serve de base: recusa sem chamar a base", async () => {
    const { result } = montar(fichaDb({ pessoa: pessoaDb({ id: "outra-pessoa" }) }));
    const erro = await erroDe(act(async () => { await result.current.criar(pedido()); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("sem ficha carregada recusa sem chamar a base", async () => {
    const { result } = montar(null);
    const erro = await erroDe(act(async () => { await result.current.criar(pedido()); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("criar: orçamento, proposta e contrato (a bandeira de M6)", () => {
  const docs = [{ tipo: "orcamento", id: "o1" }, { tipo: "proposta", id: "p1" }, { tipo: "contrato", id: "k1" }] as const;

  it("com a bandeira desligada um documento recusa sem chamar a base (a bandeira só se desliga à mão: por omissão a M6 está aplicada)", async () => {
    const { result } = montar(fichaDb(), false);
    const erro = await erroDe(act(async () => { await result.current.criar(pedido({ registos: [...docs] })); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("com a bandeira ligada os documentos vão em p_registos, ao lado dos contactos e visitas", async () => {
    rpcMock.mockReturnValue(ok());
    const { result } = montar(fichaDb(), true);
    await act(async () => { await result.current.criar(pedido({ registos: [{ tipo: "contacto", id: "c1" }, ...docs] })); });
    expect(parametros(0).p_registos).toEqual([{ tipo: "contacto", id: "c1" }, ...docs]);
  });

  it("quem só pode criar não manda documentos mesmo com a bandeira ligada", async () => {
    rpcMock.mockReturnValue(ok());
    const { result } = montar(fichaDb({ permissoes: { editar: false, criar: true } }), true);
    await act(async () => { await result.current.criar(pedido({ registos: [...docs] })); });
    expect(parametros(0).p_registos).toEqual([]);
  });

  it("expõe a bandeira, para o formulário saber se oferece documentos", () => {
    expect(montar().result.current.criarComDocumentos).toBe(true);
    expect(montar(fichaDb(), false).result.current.criarComDocumentos).toBe(false);
    expect(montar(fichaDb(), true).result.current.criarComDocumentos).toBe(true);
  });

  it("por omissão (M6 aplicada) os documentos vão em p_registos sem ser preciso ligar a bandeira", async () => {
    rpcMock.mockReturnValue(ok());
    const { result } = montar();
    await act(async () => { await result.current.criar(pedido({ registos: [...docs] })); });
    expect(nomeChamado(0)).toBe("neg_criar_negocio");
    expect(parametros(0).p_registos).toEqual([...docs]);
  });

  it("um erro da base ao criar com documentos sai traduzido (chave), não em bruto", async () => {
    rpcMock.mockReturnValue(respostaErro("NG001"));
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.criar(pedido({ registos: [...docs] })); }));
    expect(erro.codigo).toBe("NG001");
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng001");
  });
});

describe("criar: título e notas (NG009 sem chamar a base)", () => {
  it.each([["vazio", ""], ["só espaços", "   "], ["com 201 caracteres", "x".repeat(201)]])("um título %s recusa", async (_nome, titulo) => {
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.criar(pedido({ titulo })); }));
    expect(erro.codigo).toBe("NG009");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("notas com mais de 5000 caracteres recusam; 5000 e um título de 200 passam", async () => {
    rpcMock.mockReturnValue(ok());
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.criar(pedido({ notas: "x".repeat(5001) })); }));
    expect(erro.codigo).toBe("NG009");
    await act(async () => { await result.current.criar(pedido({ titulo: "x".repeat(200), notas: "y".repeat(5000) })); });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});

describe("criar: as respostas", () => {
  it("mudou: true devolve o negócio e os registos recusados", async () => {
    rpcMock.mockReturnValue(ok({ recusados: [{ tipo: "contacto", id: "c2" }, { tipo: "visita", id: "v2" }] }));
    const { result } = montar();
    let r: unknown;
    await act(async () => { r = await result.current.criar(pedido()); });
    expect(r).toEqual({ negocioId: ID, mudou: true, recusados: [{ tipo: "contacto", id: "c2" }, { tipo: "visita", id: "v2" }] });
  });

  it("mudou: false (reenvio do mesmo id) devolve sucesso sem recusados", async () => {
    rpcMock.mockReturnValue(ok({ mudou: false }));
    const { result } = montar();
    let r: unknown;
    await act(async () => { r = await result.current.criar(pedido()); });
    expect(r).toEqual({ negocioId: ID, mudou: false, recusados: [] });
  });

  it("recusados malformados são ignorados (nunca rebenta)", async () => {
    rpcMock.mockReturnValue(ok({ recusados: [{ tipo: "contacto" }, null, { tipo: "visita", id: "v2" }] }));
    const { result } = montar();
    let r: { recusados: unknown[] } | undefined;
    await act(async () => { r = await result.current.criar(pedido()); });
    expect(r?.recusados).toEqual([{ tipo: "visita", id: "v2" }]);
  });

  it("depois de criar invalida a ficha e a lista", async () => {
    rpcMock.mockReturnValue(ok());
    const { result, client } = montar();
    semear(client);
    await act(async () => { await result.current.criar(pedido()); });
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("duas chamadas iguais ao mesmo tempo (duplo clique) fazem UMA chamada à base", async () => {
    let acabar: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValue(new Promise((resolve) => { acabar = resolve; }));
    const { result } = montar();
    let a: Promise<unknown> | undefined;
    let b: Promise<unknown> | undefined;
    act(() => { a = result.current.criar(pedido()); b = result.current.criar(pedido()); });
    await act(async () => { acabar({ data: { negocio_id: ID, mudou: true, recusados: [] }, error: null }); await Promise.all([a, b]); });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});

describe("criar: os erros, pelo código", () => {
  it("NG002 (abordagem encerrada) traduz-se e refaz a ficha: ao criar leva a «Reabrir a abordagem»", async () => {
    rpcMock.mockReturnValue(respostaErro("NG002"));
    const { result, client } = montar();
    semear(client);
    const erro = await erroDe(act(async () => { await result.current.criar(pedido()); }));
    expect(erro.codigo).toBe("NG002");
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng002");
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it.each([["NG003", "ng003"], ["NG008", "ng008"], ["NG009", "ng009"], ["42501", "permissao"]])("%s traduz-se (%s) e não refaz nada", async (codigo, chave) => {
    rpcMock.mockReturnValue(respostaErro(codigo));
    const { result, client } = montar();
    semear(client);
    const erro = await erroDe(act(async () => { await result.current.criar(pedido()); }));
    expect(erro.chave).toBe(`pessoasPagina.erroNeg.${chave}`);
    expect(invalidadas(client)).toEqual([false, false]);
  });

  it("um erro sem código conhecido é genérico e vai para a observabilidade", async () => {
    rpcMock.mockReturnValue(Promise.resolve({ data: null, error: { code: "XX000", message: "boom" } }));
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.criar(pedido()); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(captureMock).toHaveBeenCalledTimes(1);
  });
});
