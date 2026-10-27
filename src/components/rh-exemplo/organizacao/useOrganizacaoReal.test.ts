// A pagina «Organizacao» ligada aos hooks reais (simulados): estrutura, ligacoes e gravacao.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useOrganizacaoReal } from "@/components/rh-exemplo/organizacao/useOrganizacaoReal";

const guardarMock = vi.fn();
const desligarMock = vi.fn();
const recarregarMock = vi.fn();
const estadoSimulado = {
  loading: false,
  recusado: false,
  erro: false,
  vigentes: new Map<string, unknown>(),
};

vi.mock("@/components/rh-exemplo/hooks/useCompany", () => ({
  useCompany: () => ({ activeCompany: { id: "org-1", name: "Nike Teste" }, companies: [], isLoading: false }),
}));
vi.mock("@/components/rh-exemplo/hooks/useFiliaisDaArvore", () => ({
  useFiliaisDaArvore: () => ({ filiais: [{ id: "org-1", name: "Nike Teste" }, { id: "org-2", name: "Filial Porto" }], loading: false }),
}));
vi.mock("@/components/rh-exemplo/hooks/useLocaisTrabalho", () => ({
  useLocaisTrabalho: () => ({
    locais: [{ id: "loc-a", nome: "Loja Porto", organograma_node_id: "org-2", morada: null, cidade: "Porto" }],
    loading: false,
  }),
}));
vi.mock("@/components/rh-exemplo/hooks/usePessoas", () => ({
  usePessoas: () => ({
    loading: false,
    pessoas: [
      { id: "p1", nome_completo: "Ana", cargo: "Gerente", reporta_a_pessoa_id: null, estado_registo: "activo", local_id: "loc-a" },
      { id: "p2", nome_completo: "Bruno", cargo: null, reporta_a_pessoa_id: "p1", estado_registo: "activo", local_id: null },
    ],
  }),
}));
vi.mock("@/components/rh-exemplo/hooks/useColocacoesDaOrganizacao", () => ({
  useColocacoesDaOrganizacao: () => ({
    ...estadoSimulado,
    guardar: guardarMock,
    desligar: desligarMock,
    recarregar: recarregarMock,
  }),
}));

const emp = "empresa:org-1";
const pedido = { pessoaId: "p2", empresaId: emp, filialId: "org-2", centroId: null, desde: "2026-10-26", motivo: " mudou " };

beforeEach(() => {
  guardarMock.mockReset();
  desligarMock.mockReset();
  estadoSimulado.vigentes = new Map([
    ["p1", { id: "c1", pessoa_id: "p1", organization_id: "org-1", organograma_node_id: "org-2", valido_de: "2026-01-01", valido_ate: null, motivo: null }],
  ]);
  estadoSimulado.recusado = false;
  estadoSimulado.erro = false;
  recarregarMock.mockReset();
});

describe("useOrganizacaoReal", () => {
  it("monta a estrutura da base e liga so quem tem colocacao em vigor", () => {
    const { result } = renderHook(() => useOrganizacaoReal());
    expect(result.current.est.grupo.nome).toBe("Nike Teste");
    expect(result.current.est.filiais.map((f) => f.id)).toEqual(["org-1", "org-2"]);
    expect(result.current.est.centros.map((c) => c.id)).toEqual(["loc-a"]);
    expect(result.current.estado.ligacoes).toEqual([
      { pessoaId: "p1", empresaId: emp, filialId: "org-2", centroId: "loc-a", desde: "2026-01-01" },
    ]);
    expect(result.current.estado.historico).toEqual([]);
    expect(result.current.pessoas.map((p) => p.nome)).toEqual(["Ana", "Bruno"]);
    expect(result.current.loading).toBe(false);
  });

  it("diz quando a colocacao foi recusada por permissao", () => {
    estadoSimulado.recusado = true;
    const { result } = renderHook(() => useOrganizacaoReal());
    expect(result.current.semPermissao).toBe(true);
  });

  it("diz quando a leitura da colocacao falhou (sem ser por permissao) e deixa tentar de novo", () => {
    estadoSimulado.erro = true;
    const { result } = renderHook(() => useOrganizacaoReal());
    expect(result.current.falhaLeitura).toBe(true);
    expect(result.current.semPermissao).toBe(false);
    result.current.recarregar();
    expect(recarregarMock).toHaveBeenCalledTimes(1);
  });

  it("guardar valida antes de ir a base e nao chama o hook se o pedido for invalido", async () => {
    const { result } = renderHook(() => useOrganizacaoReal());
    expect(await result.current.guardar({ ...pedido, pessoaId: "" })).toEqual({ ok: false, erro: "pessoaEmFalta" });
    expect(await result.current.guardar({ ...pedido, filialId: "org-99" })).toEqual({ ok: false, erro: "filialInvalida" });
    expect(guardarMock).not.toHaveBeenCalled();
  });

  it("guardar grava a colocacao na filial escolhida, com o motivo aparado", async () => {
    guardarMock.mockResolvedValue({ tipo: "ok", operacao: "ligar" });
    const { result } = renderHook(() => useOrganizacaoReal());
    expect(await result.current.guardar(pedido)).toEqual({ ok: true, tipo: "ligar" });
    expect(guardarMock).toHaveBeenCalledWith({ pessoaId: "p2", nodeId: "org-2", desde: "2026-10-26", motivo: "mudou" });
  });

  it("guardar sem motivo grava null", async () => {
    guardarMock.mockResolvedValue({ tipo: "ok", operacao: "alterar" });
    const { result } = renderHook(() => useOrganizacaoReal());
    await result.current.guardar({ ...pedido, motivo: "  " });
    expect(guardarMock.mock.calls[0]![0].motivo).toBeNull();
  });

  it("devolve a recusa da base com a mensagem, sem a esconder", async () => {
    guardarMock.mockResolvedValue({ tipo: "erro", mensagem: "Sem permissao", codigo: "base" });
    const { result } = renderHook(() => useOrganizacaoReal());
    expect(await result.current.guardar(pedido)).toEqual({ ok: false, erro: "falhaBase", mensagem: "Sem permissao" });
  });

  it("um inicio nao posterior ao da ligacao actual vira o erro proprio", async () => {
    guardarMock.mockResolvedValue({ tipo: "erro", mensagem: null, codigo: "inicioNaoPosterior" });
    const { result } = renderHook(() => useOrganizacaoReal());
    expect(await result.current.guardar(pedido)).toEqual({ ok: false, erro: "inicioNaoPosterior", mensagem: null });
  });

  it("desligar exige um motivo de pelo menos 3 caracteres", async () => {
    const { result } = renderHook(() => useOrganizacaoReal());
    expect(await result.current.desligar("p1", " ab ")).toEqual({ ok: false, erro: "motivoCurto" });
    expect(desligarMock).not.toHaveBeenCalled();
  });

  it("desligar termina a colocacao com o motivo aparado", async () => {
    desligarMock.mockResolvedValue({ tipo: "ok", operacao: "desligar" });
    const { result } = renderHook(() => useOrganizacaoReal());
    expect(await result.current.desligar("p1", " Fim de contrato ")).toEqual({ ok: true, tipo: "desligar" });
    expect(desligarMock).toHaveBeenCalledWith("p1", "Fim de contrato");
  });

  it("desligar devolve a falha da base", async () => {
    desligarMock.mockResolvedValue({ tipo: "erro", mensagem: "Recusado", codigo: "base" });
    const { result } = renderHook(() => useOrganizacaoReal());
    expect(await result.current.desligar("p1", "Fim de contrato")).toEqual({ ok: false, erro: "falhaBase", mensagem: "Recusado" });
  });
});
