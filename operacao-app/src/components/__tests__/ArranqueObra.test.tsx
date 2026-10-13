/**
 * O separador "Arranque": os 3 cartões (Encomenda Cliente e Encomenda a
 * fornecedor reais, simulados aqui; os seus testes estão em
 * ArranqueEncomendas.test.tsx), o estado do plano e o botão "Aprovar plano".
 * A base é simulada; as regras estão em tools/validar-obra-arranque.mjs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Arranque } from "../../domain/arranque";

vi.mock("../../lib/supabase", () => ({ supabase: { rpc: async () => ({ data: null, error: null }) } }));

const lib = vi.hoisted(() => ({
  obterArranque: vi.fn(),
  aprovarPlano: vi.fn(),
  sincronizarMaterial: vi.fn(),
}));
vi.mock("../../lib/arranque", () => lib);

const { cartao } = vi.hoisted(() => ({ cartao: (nome: string) => ({
  contratoId,
  obraId,
  aoMudar,
}: {
  contratoId: string;
  obraId?: string | null;
  aoMudar?: () => void;
}) => (
  <div data-testid={nome}>
    {nome} {contratoId} {obraId}
    <button type="button" onClick={() => aoMudar?.()}>
      mudar {nome}
    </button>
  </div>
) }));
vi.mock("../arranque/EncomendaClienteCartao", () => ({ EncomendaClienteCartao: cartao("cartao-ec") }));
vi.mock("../arranque/NotaEncomendaCartao", () => ({ NotaEncomendaCartao: cartao("cartao-nota") }));

import ArranqueObra from "../arranque/ArranqueObra";

const arranque = (p: Partial<Arranque> = {}): Arranque => ({
  obra_id: "o1",
  estado_obra: "planeada",
  arrancou: false,
  frente_a_instalada: true,
  encomenda_cliente: {
    estado: "validada",
    ok: true,
    id: "e1",
    contrato_id: "c1",
    validada_por: "u1",
    validada_por_nome: "Gestora",
    validada_em: "2026-10-13T10:00:00Z",
  },
  fornecedor: {
    estado: "por_aprovar",
    ok: false,
    notas: { total: 2, propostas: 1, aprovadas: 1, rejeitadas: 0, sem_fornecedor: 0, prazo_previsto: "2026-11-20" },
  },
  plano: {
    estado: "por_aprovar",
    ok: false,
    motivo: null,
    aprovado_por: null,
    aprovado_por_nome: null,
    aprovado_em: null,
    tarefas: 7,
    sem_datas: 0,
    sem_pessoas: 1,
    material_antes: [
      { tarefa_id: "t1", nome: "Assentar sanita", inicio: "2026-11-10", material_chega_em: "2026-11-20", nota: null },
    ],
    avisos: ["1 tarefa(s) começam antes de o material chegar"],
  },
  pode_arrancar: false,
  falta: ["aprovar a encomenda a fornecedor", "aprovar o plano da obra"],
  ...p,
});

beforeEach(() => {
  lib.obterArranque.mockReset();
  lib.aprovarPlano.mockReset();
  lib.sincronizarMaterial.mockReset();
});

describe("ArranqueObra", () => {
  it("sem o SQL instalado, diz que está por instalar", async () => {
    lib.obterArranque.mockResolvedValue(null);
    render(<ArranqueObra obraId="o1" contratoId="c1" podePlanear />);
    expect(await screen.findByTestId("arranque-por-instalar")).toHaveTextContent(/obra-arranque\.sql/);
  });

  it("mostra os 3 cartões, o que falta e os avisos do material", async () => {
    lib.obterArranque.mockResolvedValue(arranque());
    render(<ArranqueObra obraId="o1" contratoId="c1" podePlanear />);
    expect(await screen.findByText(/Falta: aprovar a encomenda a fornecedor; aprovar o plano da obra\./)).toBeInTheDocument();
    expect(screen.getByText("1 de 3 validações")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Encomenda Cliente" })).toHaveTextContent("cartao-ec c1 o1");
    expect(screen.getByRole("region", { name: "Encomenda a fornecedor" })).toHaveTextContent("cartao-nota c1 o1");
    const plano = screen.getByRole("region", { name: "Plano da obra" });
    expect(plano).toHaveTextContent(/por aprovar/);
    expect(plano).toHaveTextContent(/começam antes de o material chegar/);
    expect(plano).toHaveTextContent(/Assentar sanita/);
  });

  it("Aprovar plano chama a base e volta a ler", async () => {
    lib.obterArranque.mockResolvedValueOnce(arranque()).mockResolvedValueOnce(
      arranque({
        plano: { ...arranque().plano, estado: "aprovado", ok: true, aprovado_por_nome: "Gestora", aprovado_em: "2026-10-13T11:00:00Z" },
      })
    );
    lib.aprovarPlano.mockResolvedValue({ ok: true, avisos: [], aprovado_em: "", aprovado_por: "u1", pode_arrancar: false, falta: [] });
    const aoMudar = vi.fn();
    render(<ArranqueObra obraId="o1" contratoId="c1" podePlanear aoMudar={aoMudar} />);
    fireEvent.click(await screen.findByRole("button", { name: "Aprovar plano" }));
    await waitFor(() => expect(lib.aprovarPlano).toHaveBeenCalledWith("o1"));
    expect(await screen.findByText("Plano aprovado.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("region", { name: "Plano da obra" })).toHaveTextContent(/aprovado por Gestora/));
    expect(aoMudar).toHaveBeenCalled();
  });

  it("quem não planeia não vê os botões; pronta a arrancar quando as 3 estão feitas", async () => {
    lib.obterArranque.mockResolvedValue(
      arranque({
        fornecedor: { estado: "nao_necessaria", ok: true, notas: null },
        plano: { ...arranque().plano, estado: "aprovado", ok: true, avisos: [], material_antes: [] },
        pode_arrancar: true,
        falta: [],
      })
    );
    render(<ArranqueObra obraId="o1" contratoId="c1" podePlanear={false} />);
    expect(await screen.findByText(/Pronta a arrancar/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar plano" })).toBeNull();
  });

  it("uma ação num cartão de encomenda volta a ler o checklist e avisa a obra", async () => {
    lib.obterArranque.mockResolvedValue(arranque());
    const aoMudar = vi.fn();
    render(<ArranqueObra obraId="o1" contratoId="c1" podePlanear aoMudar={aoMudar} />);
    fireEvent.click(await screen.findByRole("button", { name: "mudar cartao-ec" }));
    await waitFor(() => expect(lib.obterArranque).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "mudar cartao-nota" }));
    await waitFor(() => expect(lib.obterArranque).toHaveBeenCalledTimes(3));
    expect(aoMudar).toHaveBeenCalledTimes(2);
  });

  it("obra sem contrato: só o estado, sem cartões de encomenda", async () => {
    lib.obterArranque.mockResolvedValue(
      arranque({
        encomenda_cliente: { ...arranque().encomenda_cliente, estado: "nao_aplicavel", ok: true },
        fornecedor: { estado: "nao_necessaria", ok: true, notas: null },
      })
    );
    render(<ArranqueObra obraId="o1" contratoId={null} podePlanear />);
    expect(await screen.findByRole("region", { name: "Encomenda Cliente" })).toHaveTextContent(/Obra sem contrato/);
    expect(screen.getByRole("region", { name: "Encomenda a fornecedor" })).toHaveTextContent(/não necessária/);
    expect(screen.queryByTestId("cartao-ec")).toBeNull();
  });
});
