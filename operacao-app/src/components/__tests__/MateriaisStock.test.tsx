import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import type { MaterialLigado, MaterialSugerido, ProdutoStock } from "../../lib/stock";

const pesquisarStock = vi.fn();
const sugerirMateriais = vi.fn();
const disponibilidadeStock = vi.fn();

vi.mock("../../lib/supabase", () => ({ supabase: { rpc: async () => ({ data: [], error: null }) } }));
vi.mock("../../lib/stock", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/stock")>();
  return {
    ...real,
    pesquisarStock: (...a: unknown[]) => pesquisarStock(...a),
    sugerirMateriais: (...a: unknown[]) => sugerirMateriais(...a),
    disponibilidadeStock: (...a: unknown[]) => disponibilidadeStock(...a),
  };
});

import { MateriaisStock, ResumoMateriais } from "../MateriaisStock";

const prod = (p: Partial<ProdutoStock> & { produto_id: string; nome: string }): ProdutoStock => ({
  sku: null,
  unidade: "un",
  gere_stock: true,
  fisico: 0,
  reservado: 0,
  a_chegar: 0,
  disponivel: 0,
  ...p,
});
const sug = (p: Partial<MaterialSugerido> & { produto_id: string; nome: string; quantidade: number }) =>
  ({ ...prod(p), quantidade: p.quantidade }) as MaterialSugerido;

/** O componente controlado, como o Obras.tsx o vai usar. */
function Anfitriao({
  inicial = [],
  servicoId = "s1",
  espiao,
}: {
  inicial?: MaterialLigado[];
  servicoId?: string | null;
  espiao?: (m: MaterialLigado[]) => void;
}) {
  const [v, setV] = useState<MaterialLigado[]>(inicial);
  return (
    <MateriaisStock
      orgId="org"
      servicoId={servicoId}
      quantidadeServico={25}
      valor={v}
      onChange={(m) => {
        espiao?.(m);
        setV(m);
      }}
    />
  );
}

beforeEach(() => {
  pesquisarStock.mockReset();
  sugerirMateriais.mockReset();
  disponibilidadeStock.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("MateriaisStock", () => {
  it("pré-preenche com a ficha técnica × quantidade e avisa o que falta", async () => {
    sugerirMateriais.mockResolvedValue([
      sug({ produto_id: "p1", nome: "Cimento cola", quantidade: 50, disponivel: 38, a_chegar: 0, unidade: "kg" }),
      sug({ produto_id: "p2", nome: "Tinta branca", quantidade: 8, disponivel: 5, a_chegar: 12 }),
      sug({ produto_id: "p3", nome: "Fita", quantidade: 2, disponivel: 10, a_chegar: 6 }),
    ]);
    const espiao = vi.fn();
    render(<Anfitriao espiao={espiao} />);

    expect(sugerirMateriais).toHaveBeenCalledWith("org", "s1", 25);
    expect(await screen.findByText("Cimento cola")).toBeInTheDocument();
    expect(espiao).toHaveBeenCalledWith([
      { produto_id: "p1", nome: "Cimento cola", quantidade: 50, unidade: "kg", disponivel: 38 },
      { produto_id: "p2", nome: "Tinta branca", quantidade: 8, unidade: "un", disponivel: 5 },
      { produto_id: "p3", nome: "Fita", quantidade: 2, unidade: "un", disponivel: 10 },
    ]);
    // 50 pedidos, 38 disponíveis, nada a chegar → vermelho, encomendar
    const cimento = screen.getByText("faltam 12 kg — encomendar");
    expect(cimento.className).toContain("text-red-700");
    // faltam 3, mas chegam 12 → âmbar
    const tinta = screen.getByText("faltam 3 un — a chegar 12");
    expect(tinta.className).toContain("text-amber-700");
    // chega, e ainda há a caminho
    expect(screen.getByText("disponível 10 un · a chegar 6")).toBeInTheDocument();
  });

  it("não sugere quando já há materiais, refresca o disponível", async () => {
    disponibilidadeStock.mockResolvedValue([prod({ produto_id: "p1", nome: "Cimento cola", disponivel: 100, a_chegar: 4 })]);
    const espiao = vi.fn();
    render(
      <Anfitriao
        espiao={espiao}
        inicial={[{ produto_id: "p1", nome: "Cimento cola", quantidade: 5, unidade: "un", disponivel: 1 }]}
      />
    );
    expect(sugerirMateriais).not.toHaveBeenCalled();
    expect(disponibilidadeStock).toHaveBeenCalledWith("org", ["p1"]);
    expect(await screen.findByText("disponível 100 un · a chegar 4")).toBeInTheDocument();
    expect(espiao).toHaveBeenCalledWith([
      { produto_id: "p1", nome: "Cimento cola", quantidade: 5, unidade: "un", disponivel: 100 },
    ]);
  });

  it("sem serviço não sugere nada", () => {
    render(<Anfitriao servicoId={null} />);
    expect(sugerirMateriais).not.toHaveBeenCalled();
    expect(screen.getByText("Sem materiais.")).toBeInTheDocument();
  });

  it("muda a quantidade e remove", async () => {
    const espiao = vi.fn();
    disponibilidadeStock.mockResolvedValue([]);
    render(
      <Anfitriao
        espiao={espiao}
        inicial={[
          { produto_id: "p1", nome: "Cimento", quantidade: 5, unidade: "un", disponivel: 10 },
          { produto_id: "p2", nome: "Areia", quantidade: 1, unidade: "un", disponivel: null },
        ]}
      />
    );
    fireEvent.change(screen.getByLabelText("Quantidade de Cimento"), { target: { value: "12,5" } });
    expect(espiao).toHaveBeenLastCalledWith([
      { produto_id: "p1", nome: "Cimento", quantidade: 12.5, unidade: "un", disponivel: 10 },
      { produto_id: "p2", nome: "Areia", quantidade: 1, unidade: "un", disponivel: null },
    ]);
    expect(screen.getByText("faltam 2,5 un — encomendar")).toBeInTheDocument();
    expect(screen.getByText("sem stock gerido")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Remover Areia"));
    expect(espiao).toHaveBeenLastCalledWith([
      { produto_id: "p1", nome: "Cimento", quantidade: 12.5, unidade: "un", disponivel: 10 },
    ]);
    await waitFor(() => expect(screen.queryByText("Areia")).not.toBeInTheDocument());
  });

  it("pesquisa com debounce e acrescenta do stock", async () => {
    vi.useFakeTimers();
    pesquisarStock.mockResolvedValue([
      prod({ produto_id: "p9", nome: "Silicone", sku: "SIL-01", disponivel: 7 }),
    ]);
    const espiao = vi.fn();
    render(<Anfitriao servicoId={null} espiao={espiao} />);

    const caixa = screen.getByPlaceholderText(/Acrescentar material do stock/);
    fireEvent.change(caixa, { target: { value: "s" } });
    fireEvent.change(caixa, { target: { value: "si" } });
    fireEvent.change(caixa, { target: { value: "sil" } });
    expect(pesquisarStock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(pesquisarStock).toHaveBeenCalledTimes(1);
    expect(pesquisarStock).toHaveBeenCalledWith("org", "sil", 8);
    vi.useRealTimers();

    fireEvent.click(await screen.findByRole("option", { name: /Silicone/ }));
    expect(espiao).toHaveBeenLastCalledWith([
      { produto_id: "p9", nome: "Silicone", quantidade: 1, unidade: "un", disponivel: 7 },
    ]);
    expect(screen.getByText("disponível 7 un")).toBeInTheDocument();
  });

  it("mostra o erro de acesso sem rebentar", async () => {
    sugerirMateriais.mockRejectedValue(new Error("Sem acesso ao stock desta organização."));
    render(<Anfitriao />);
    expect(await screen.findByText("Sem acesso ao stock desta organização.")).toBeInTheDocument();
  });
});

describe("ResumoMateriais", () => {
  it("soma por produto todas as tarefas e mostra as faltas", () => {
    render(
      <ResumoMateriais
        materiais={[
          { produto_id: "p1", nome: "Cimento", quantidade: 30, unidade: "kg", disponivel: 50 },
          { produto_id: "p1", nome: "Cimento", quantidade: 30, unidade: "kg", disponivel: 50 },
          { produto_id: "p2", nome: "Tinta", quantidade: 2, unidade: "un", disponivel: 5 },
          { produto_id: "p3", nome: "Fita", quantidade: 4, unidade: null, disponivel: null },
        ]}
      />
    );
    expect(screen.getByText("Materiais: 1 produto em falta")).toBeInTheDocument();
    expect(screen.getByText("precisa 60 kg")).toBeInTheDocument();
    expect(screen.getByText("faltam 10 kg — encomendar")).toBeInTheDocument();
    expect(screen.getByText("sem stock gerido")).toBeInTheDocument();
  });

  it("tudo disponível", () => {
    render(
      <ResumoMateriais materiais={[{ produto_id: "p2", nome: "Tinta", quantidade: 2, unidade: "un", disponivel: 5 }]} />
    );
    expect(screen.getByText("Materiais: há stock para tudo")).toBeInTheDocument();
  });

  it("sem materiais não mostra nada", () => {
    const { container } = render(<ResumoMateriais materiais={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
