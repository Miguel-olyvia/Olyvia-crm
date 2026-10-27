// O chip de admissão da lista de Pessoas, ligado à lista real (`rpc_hr_admissao_listar`): um só pedido para a lista toda,
// o processo mais recente por pessoa, nada inventado sem permissão, a carregar ou com erro. Os hooks reais são simulados.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";

let permissoes: Set<string>;
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (p: string) => permissoes.has(p), loading: false }),
}));

let estadoHook: Record<string, unknown>;
const carregarMais = vi.fn();
const chamadas: Array<{ estados: string[] | null }> = [];
vi.mock("@/hooks/useAdmissoesPipeline", () => ({
  LIMITE_PIPELINE: 50,
  useAdmissoesPipeline: (opcoes: { estados: string[] | null }) => {
    chamadas.push(opcoes);
    return estadoHook;
  },
}));

import { EstadoAdmissaoDaPessoa } from "@/components/rh-exemplo/admissao/EstadoAdmissaoDaPessoa";
import { MAX_PAGINAS, useEstadoAdmissaoPorPessoa } from "@/components/rh-exemplo/hooks/useEstadoAdmissaoPorPessoa";

const item = (pessoaId: string, estado: string, n = 1) => ({
  conviteId: `c${pessoaId}${n}`, pessoaId, nome: pessoaId, cargo: null, estado, estadoPortal: "ativo",
  validUntil: null, submetidoEm: null, devolvidaEm: null, atualizadoEm: null,
});
const muitos = (n: number) => Array.from({ length: n }, (_, i) => item(`x${i}`, "convidada"));

beforeAll(() => {
  window.localStorage.setItem("language", "pt");
});

beforeEach(() => {
  permissoes = new Set(["hr.pessoas.convite.enviar"]);
  chamadas.length = 0;
  carregarMais.mockReset();
  estadoHook = {
    itens: [item("p1", "submetida"), item("p1", "convidada", 2), item("p2", "concluida")],
    contadores: { submetida: 1, convidada: 1, concluida: 1 },
    carregando: false, aCarregarMais: false, temMais: false, erro: null, carregarMais, recarregar: vi.fn(),
  };
});

describe("useEstadoAdmissaoPorPessoa", () => {
  it("faz um só pedido, de todos os estados, e fica com o processo mais recente de cada pessoa", () => {
    const { result } = renderHook(() => useEstadoAdmissaoPorPessoa());
    expect(chamadas.every((c) => c.estados === null)).toBe(true);
    expect(result.current.estadoPorPessoa.get("p1")).toBe("submetida");
    expect(result.current.estadoPorPessoa.get("p2")).toBe("concluida");
    expect(result.current.estadoPorPessoa.has("p3")).toBe(false);
    expect(result.current.porAprovar).toBe(1);
    expect(result.current.erro).toBe(false);
    expect(result.current.incompleto).toBe(false);
  });

  it("sem permissão não devolve mapa, contagem nem erro (a base recusaria)", () => {
    permissoes = new Set();
    estadoHook = { ...estadoHook, erro: { codigo: null } };
    const { result } = renderHook(() => useEstadoAdmissaoPorPessoa());
    expect(result.current.estadoPorPessoa.size).toBe(0);
    expect(result.current.porAprovar).toBe(0);
    expect(result.current.erro).toBe(false);
  });

  it("a hr.onboarding.approve também chega", () => {
    permissoes = new Set(["hr.onboarding.approve"]);
    expect(renderHook(() => useEstadoAdmissaoPorPessoa()).result.current.estadoPorPessoa.size).toBe(2);
  });

  it("a carregar não inventa contagem; com erro diz que falhou e não mostra contagem", () => {
    estadoHook = { ...estadoHook, carregando: true };
    const a = renderHook(() => useEstadoAdmissaoPorPessoa()).result.current;
    expect(a.carregando).toBe(true);
    expect(a.porAprovar).toBe(0);
    estadoHook = { ...estadoHook, carregando: false, erro: { codigo: "sem_permissao" } };
    const b = renderHook(() => useEstadoAdmissaoPorPessoa()).result.current;
    expect(b.erro).toBe(true);
    expect(b.porAprovar).toBe(0);
    expect(carregarMais).not.toHaveBeenCalled();
  });

  it("pede as páginas seguintes enquanto as houver", () => {
    estadoHook = { ...estadoHook, itens: muitos(50), temMais: true };
    renderHook(() => useEstadoAdmissaoPorPessoa());
    expect(carregarMais).toHaveBeenCalledTimes(1);
  });

  it("não pede mais enquanto uma página vem a caminho", () => {
    estadoHook = { ...estadoHook, itens: muitos(50), temMais: true, aCarregarMais: true };
    renderHook(() => useEstadoAdmissaoPorPessoa());
    expect(carregarMais).not.toHaveBeenCalled();
  });

  it("no limite de páginas pára e avisa que a leitura ficou incompleta", () => {
    estadoHook = { ...estadoHook, itens: muitos(50 * MAX_PAGINAS), temMais: true };
    const { result } = renderHook(() => useEstadoAdmissaoPorPessoa());
    expect(carregarMais).not.toHaveBeenCalled();
    expect(result.current.incompleto).toBe(true);
  });
});

describe("EstadoAdmissaoDaPessoa", () => {
  const montar = (estado: Parameters<typeof EstadoAdmissaoDaPessoa>[0]["estado"]) =>
    render(<LanguageProvider><EstadoAdmissaoDaPessoa estado={estado} /></LanguageProvider>);

  it("mostra o texto real do estado de uma admissão em curso", () => {
    montar("submetida");
    expect(screen.getByText("Submetida")).toBeInTheDocument();
  });

  it("não mostra nada sem processo, concluída ou desconhecida", () => {
    for (const estado of [undefined, "concluida", "desconhecido"] as const) {
      const { container, unmount } = montar(estado);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});
