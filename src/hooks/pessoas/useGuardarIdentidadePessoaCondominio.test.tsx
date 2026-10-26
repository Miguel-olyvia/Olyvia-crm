// Condomínio na identidade (neg_guardar_identidade_pessoa aceita p_tipo 'condominio'): resposta com organization_kind e tipo_cliente, e editar o
// nome de um condomínio nunca o despromove a empresa.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { ErroNeg } from "./chamarNeg";
import { PESSOA_ID } from "./fichaFabrica";
import { captureMock, montarHook, parametros, respostaOk, rpcMock } from "./fichaTestUtil";
import { useGuardarIdentidadePessoa } from "./useGuardarIdentidadePessoa";
import type { TipoCliente } from "@/components/pessoas/pessoasTipos";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

beforeEach(() => { rpcMock.mockReset(); captureMock.mockReset(); });
afterEach(() => vi.clearAllMocks());

const montar = (atual: TipoCliente | undefined = "condominio") => montarHook(({ id, tipo }: { id: string; tipo?: TipoCliente }) => useGuardarIdentidadePessoa(id, tipo), { id: PESSOA_ID, tipo: atual });
const CONDOMINIO = { tipo: "organization", nome: "Cond. Sol", empresa_nome: "Cond. Sol", organization_kind: "condominio", tipo_cliente: "condominio", mudou: true };

describe("useGuardarIdentidadePessoa: condomínio", () => {
  it("p_tipo condominio manda o nome do condomínio como nome de empresa, sem nome próprio nem apelido", async () => {
    rpcMock.mockReturnValue(respostaOk(CONDOMINIO));
    const { result } = montar();
    await act(async () => { await result.current.guardar({ tipo: "condominio", nomeEmpresa: " Cond. Sol " }); });
    expect(parametros(0)).toEqual({
      p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_tipo: "condominio", p_nome_empresa: "Cond. Sol", p_nome_proprio: null, p_apelido: null,
    });
  });

  it("sem o tipo atual (a ficha ainda não carregou) recusa gravar o nome, sem chamar a base: nunca despromove um condomínio", async () => {
    const { result } = montarHook(({ id, tipo }: { id: string; tipo: TipoCliente | undefined }) => useGuardarIdentidadePessoa(id, tipo), { id: PESSOA_ID, tipo: undefined });
    let erro: unknown;
    await act(async () => { erro = await result.current.guardar({ tipo: "organization", nomeEmpresa: "X" }).then(() => null, (e: unknown) => e); });
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("lê organization_kind e tipo_cliente da resposta", async () => {
    rpcMock.mockReturnValue(respostaOk(CONDOMINIO));
    const { result } = montar();
    let r;
    await act(async () => { r = await result.current.guardar({ tipo: "condominio", nomeEmpresa: "Cond. Sol" }); });
    expect(r).toEqual({ tipo: "organization", nome: "Cond. Sol", empresaNome: "Cond. Sol", organizationKind: "condominio", tipoCliente: "condominio", mudou: true });
  });

  it("editar o nome de um condomínio enviado como 'organization' nunca o despromove: vai como condominio", async () => {
    rpcMock.mockReturnValue(respostaOk(CONDOMINIO));
    const { result } = montar("condominio");
    await act(async () => { await result.current.guardar({ tipo: "organization", nomeEmpresa: "Cond. Novo" }); });
    expect(parametros(0)).toMatchObject({ p_tipo: "condominio", p_nome_empresa: "Cond. Novo" });
  });

  it("uma empresa continua a ir como organization; passar uma pessoa a empresa não é afetado", async () => {
    rpcMock.mockReturnValue(respostaOk({ tipo: "organization", nome: "A", empresa_nome: "A", organization_kind: "empresa", tipo_cliente: "empresa", mudou: true }));
    const { result } = montar("empresa");
    await act(async () => { await result.current.guardar({ tipo: "organization", nomeEmpresa: "A" }); });
    expect(parametros(0).p_tipo).toBe("organization");
  });

  it("o tipo de cliente em falta ou desconhecido na resposta fica a null; uma pessoa singular não tem tipo de organização", async () => {
    rpcMock.mockReturnValue(respostaOk({ tipo: "person", nome: "Ana", empresa_nome: null, organization_kind: null, tipo_cliente: "particular", mudou: false }));
    const { result } = montar("particular");
    let r;
    await act(async () => { r = await result.current.guardar({ tipo: "person" }); });
    expect(r).toMatchObject({ organizationKind: null, tipoCliente: "particular" });
    rpcMock.mockReturnValue(respostaOk({ tipo: "x", tipo_cliente: "marciano", organization_kind: 3 }));
    await act(async () => { r = await result.current.guardar({ tipo: "person" }); });
    expect(r).toMatchObject({ organizationKind: null, tipoCliente: null });
  });
});
