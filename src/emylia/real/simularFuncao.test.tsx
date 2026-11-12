// «Simular função» nos Negócios (só no ecrã): a lista de funções da organização, os códigos de cada uma (cortados aos que o ecrã
// consulta) e o override das permissões no motor (usePermissoesReaisNegocio com `simulados`).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const ORG = "11111111-1111-4111-a111-111111111111";
const OUTRA = "99999999-9999-4999-a999-999999999999";
const rpc = vi.fn();
const base = vi.hoisted(() => ({
  roles: { data: [] as unknown, error: null as unknown },
  perms: { data: [] as unknown, error: null as unknown },
  pedidos: [] as { tabela: string; filtros: Record<string, unknown> }[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (tabela: string) => {
      const filtros: Record<string, unknown> = {};
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "limit"]) q[m] = () => q;
      q.eq = (c: string, v: unknown) => { filtros[c] = v; return q; };
      q.is = (c: string, v: unknown) => { filtros[c + " is"] = v; return q; };
      q.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
        base.pedidos.push({ tabela, filtros });
        return Promise.resolve(tabela === "anew_roles" ? base.roles : base.perms).then(ok, ko);
      };
      return q;
    },
  },
}));

import { CODIGOS_DO_ECRA, codigosSimulados, lerCodigosDaFuncao, lerFuncoes, useSimularFuncao } from "./simularFuncao";
import { usePermissoesReaisNegocio } from "./usePermissoesReais";
import { comPermissoesReais, definirPermissoesReais, permEmFaltaDoPasso, podeNeg, soAteAoContacto } from "../permissoes";

const ASSISTENTE = ["negocios.contacto.registar", "pessoas.view", "pessoas.edit"];
const COMERCIAL = [...ASSISTENTE, "negocios.visita.gerir", "negocios.visita.preencher", "negocios.orcamento.editar", "negocios.proposta.enviar"];

beforeEach(() => {
  rpc.mockReset(); base.pedidos.length = 0;
  rpc.mockImplementation(async () => ({ data: true, error: null }));
  base.roles = { data: [{ id: "r1", code: "assistente", name: "Assistente comercial" }, { id: "r2", code: "comercial", name: "Comercial" }], error: null };
  base.perms = { data: ASSISTENTE.map((c) => ({ permission_code: c })), error: null };
});
afterEach(() => definirPermissoesReais(null));

describe("códigos simulados", () => {
  it("ficam só os que o ecrã consulta (os de CODIGOS_NEGOCIOS e os das páginas e da configuração dos campos)", () => {
    const s = codigosSimulados(["negocios.contacto.registar", "pessoas.view", "pessoas.config", "client_orders.view", "negocios.obra.tecnico", "inventado.xpto"]);
    expect([...s].sort()).toEqual(["client_orders.view", "negocios.contacto.registar", "negocios.obra.tecnico", "pessoas.config", "pessoas.view"]);
    expect(CODIGOS_DO_ECRA.has("purchase_orders.approve")).toBe(true);
    expect(CODIGOS_DO_ECRA.has("hr.pessoas.retribuicao.view")).toBe(true);
  });
  it("sem códigos (ou só estranhos) o conjunto fica vazio, e não nulo", () => {
    expect(codigosSimulados([]).size).toBe(0);
    expect(codigosSimulados(["so.estranho"]).size).toBe(0);
  });
});

describe("leitura das funções", () => {
  it("lê as funções da organização, sem as eliminadas, com id, código e nome", async () => {
    const f = await lerFuncoes(ORG);
    expect(f).toEqual([{ id: "r1", code: "assistente", name: "Assistente comercial" }, { id: "r2", code: "comercial", name: "Comercial" }]);
    expect(base.pedidos[0]).toEqual({ tabela: "anew_roles", filtros: { organization_id: ORG, "deleted_at is": null } });
  });
  it("uma falha da base sobe como erro com a mensagem (nunca uma lista vazia)", async () => {
    base.roles = { data: null, error: { message: "sem rede" } };
    await expect(lerFuncoes(ORG)).rejects.toThrow("sem rede");
  });
  it("lê os códigos de uma função; uma falha sobe como erro", async () => {
    expect(await lerCodigosDaFuncao("r1")).toEqual(ASSISTENTE);
    expect(base.pedidos[0]).toEqual({ tabela: "anew_role_permissions", filtros: { role_id: "r1" } });
    base.perms = { data: null, error: { message: "recusado" } };
    await expect(lerCodigosDaFuncao("r1")).rejects.toThrow("recusado");
  });
});

describe("as permissões no motor com `simulados`", () => {
  it("com os códigos até ao Contacto: soAteAoContacto e os passos seguintes desligados; sem eles volta ao real", async () => {
    const { result, rerender } = renderHook(({ s }: { s: ReadonlySet<string> | null }) => usePermissoesReaisNegocio(ORG, s), { initialProps: { s: null as ReadonlySet<string> | null } });
    await waitFor(() => expect(result.current.leitura.k).toBe("lidas"));
    // real: fn_cat_pode diz sim a tudo
    expect(soAteAoContacto()).toBe(false);
    expect(permEmFaltaDoPasso({ role: "comercial" }, "marcarVisita")).toBeNull();

    rerender({ s: codigosSimulados(ASSISTENTE) });
    expect(soAteAoContacto()).toBe(true);
    expect(permEmFaltaDoPasso({ role: "comercial" }, "marcarVisita")).toBe("visita.gerir");
    expect(permEmFaltaDoPasso({ role: "comercial" }, "contactar")).toBeNull();
    // a leitura real não se mexe: o ecrã continua a saber o que é seu
    expect(result.current.leitura.k).toBe("lidas");

    // outra função: os passos mudam
    rerender({ s: codigosSimulados(COMERCIAL) });
    expect(soAteAoContacto()).toBe(false);
    expect(permEmFaltaDoPasso({ role: "comercial" }, "marcarVisita")).toBeNull();
    expect(permEmFaltaDoPasso({ role: "comercial" }, "enviarContrato")).toBe("contrato.editar");

    rerender({ s: null });
    expect(soAteAoContacto()).toBe(false);
    expect(permEmFaltaDoPasso({ role: "comercial" }, "enviarContrato")).toBeNull();
    expect(podeNeg("comercial", "visita.gerir")).toBe(true);
  });
  it("sem `simulados` (a ficha da pessoa) não muda nada: lê e põe as reais", async () => {
    const { result } = renderHook(() => usePermissoesReaisNegocio(ORG));
    await waitFor(() => expect(result.current.leitura.k).toBe("lidas"));
    expect(comPermissoesReais()).toBe(true);
    expect(podeNeg("comercial", "contacto.registar")).toBe(true);
  });
});

describe("useSimularFuncao", () => {
  it("lê as funções da org; escolher põe os códigos simulados; voltar repõe", async () => {
    const { result } = renderHook(() => useSimularFuncao(ORG));
    await waitFor(() => expect(result.current.funcoes?.length).toBe(2));
    expect(result.current.simulacao).toBeNull();
    await act(async () => { await result.current.escolher("r1"); });
    expect(result.current.simulacao?.nome).toBe("Assistente comercial");
    expect([...result.current.simulacao!.codigos].sort()).toEqual([...ASSISTENTE].sort());
    act(() => result.current.voltar());
    expect(result.current.simulacao).toBeNull();
  });
  it("a função sem permissões simula-se com um conjunto vazio (não vale por «a minha»)", async () => {
    base.perms = { data: [], error: null };
    const { result } = renderHook(() => useSimularFuncao(ORG));
    await waitFor(() => expect(result.current.funcoes?.length).toBe(2));
    await act(async () => { await result.current.escolher("r2"); });
    expect(result.current.simulacao?.codigos.size).toBe(0);
  });
  it("se os códigos da função não se leem, diz-se e não se simula (fica a anterior)", async () => {
    const { result } = renderHook(() => useSimularFuncao(ORG));
    await waitFor(() => expect(result.current.funcoes?.length).toBe(2));
    await act(async () => { await result.current.escolher("r1"); });
    base.perms = { data: null, error: { message: "recusado" } };
    await act(async () => { await result.current.escolher("r2"); });
    expect(result.current.erro).toContain("recusado");
    expect(result.current.simulacao?.nome).toBe("Assistente comercial");
    expect(result.current.aLer).toBe(false);
  });
  it("se a lista falhar, mostra o erro e fica sem funções", async () => {
    base.roles = { data: null, error: { message: "sem rede" } };
    const { result } = renderHook(() => useSimularFuncao(ORG));
    await waitFor(() => expect(result.current.erro).toContain("sem rede"));
    expect(result.current.funcoes).toBeNull();
  });
  it("quando a organização muda, repõe e volta a ler a lista", async () => {
    const { result, rerender } = renderHook(({ org }: { org: string }) => useSimularFuncao(org), { initialProps: { org: ORG } });
    await waitFor(() => expect(result.current.funcoes?.length).toBe(2));
    await act(async () => { await result.current.escolher("r1"); });
    expect(result.current.simulacao).not.toBeNull();
    rerender({ org: OUTRA });
    await waitFor(() => expect(result.current.simulacao).toBeNull());
    await waitFor(() => expect(base.pedidos.some((p) => p.tabela === "anew_roles" && p.filtros.organization_id === OUTRA)).toBe(true));
  });
  it("uma escolha lenta que chega depois de voltar à real não volta a simular", async () => {
    const { result } = renderHook(() => useSimularFuncao(ORG));
    await waitFor(() => expect(result.current.funcoes?.length).toBe(2));
    let acabou!: Promise<void>;
    act(() => { acabou = result.current.escolher("r1"); });
    act(() => result.current.voltar());
    await act(async () => { await acabou; });
    expect(result.current.simulacao).toBeNull();
  });
});
