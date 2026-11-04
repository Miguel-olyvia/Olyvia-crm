// 4/11 (Rúben: «as horas podem ser o dia todo, não somente até às 17h»): as horas da visita do negócio sem o horário da organização
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FontePessoasContext } from "./useFontePessoas";
import { HORARIO_POR_OMISSAO, SEM_FERIADOS } from "./horasLivresVisita";
import { useHorasLivresVisita } from "./useHorasLivresVisita";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
afterEach(() => { rpc.mockReset(); vi.useRealTimers(); });

const DIA = "2030-03-12"; // uma terça, no futuro
const SABADO = "2030-03-16";
const slot = (hora: string) => ({ slot_start: `${DIA}T${hora}:00+00:00`, slot_end: `${DIA}T${hora}:00+00:00` });
const envolver = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <FontePessoasContext.Provider value={{ modo: "real", organizationId: "org", momentoGanho: null } as never}>{children}</FontePessoasContext.Provider>
  </QueryClientProvider>
);
const usar = (dia = DIA, excluirId: string | null = null) => renderHook(() => useHorasLivresVisita({
  recursos: ["r1"], dia, duracaoMin: 60, horario: HORARIO_POR_OMISSAO, feriados: SEM_FERIADOS, horarioPronto: true, excluirId,
}), { wrapper: envolver });

describe("as horas livres da visita do negócio", () => {
  it("com a função nova: o dia todo, também depois das 17h, e a visita que se remarca não se conta", async () => {
    rpc.mockResolvedValue({ data: [slot("08:00"), slot("19:30"), slot("21:00")], error: null });
    const { result } = usar(DIA, "visita-1");
    await waitFor(() => expect(result.current.estado.k).toBe("pronto"));
    expect(result.current.diaTodo).toBe(true);
    expect(result.current.horas).toEqual(["08:00", "19:30", "21:00"]);
    expect(rpc).toHaveBeenCalledWith("neg_horas_livres_visita", expect.objectContaining({ p_resource_id: "r1", p_date: DIA, p_exclude_item_id: "visita-1" }));
  });

  it("com a função nova, um sábado também dá horas (sem os dias de trabalho da organização)", async () => {
    rpc.mockResolvedValue({ data: [{ slot_start: `${SABADO}T10:00:00+00:00`, slot_end: `${SABADO}T11:00:00+00:00` }], error: null });
    const { result } = usar(SABADO);
    await waitFor(() => expect(result.current.estado.k).toBe("pronto"));
    expect(result.current.horas).toEqual(["10:00"]);
  });

  it("sem a função na base (SQL por colar): como antes, só no horário da organização", async () => {
    rpc.mockImplementation(async (nome: string) => (nome === "neg_horas_livres_visita"
      ? { data: null, error: { code: "PGRST202", message: "Could not find the function" } }
      : { data: [slot("08:00"), slot("10:00"), slot("17:00"), slot("19:30")], error: null }));
    const { result } = usar();
    await waitFor(() => expect(result.current.estado.k).toBe("pronto"));
    expect(result.current.diaTodo).toBe(false);
    expect(result.current.horas).toEqual(["10:00", "17:00"]);
  });

  it("sem a função, um sábado fica fechado como antes", async () => {
    rpc.mockImplementation(async (nome: string) => (nome === "neg_horas_livres_visita"
      ? { data: null, error: { code: "PGRST202", message: "Could not find the function" } } : { data: [], error: null }));
    const { result } = usar(SABADO);
    await waitFor(() => expect(result.current.estado).toEqual({ k: "dia-fechado", motivo: "naoTrabalha" }));
  });

  it("outro erro da função nova diz-se (não se mostram horas que podiam estar ocupadas)", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "CT001", message: "Sem permissão" } });
    const { result } = usar();
    await waitFor(() => expect(result.current.estado.k).toBe("erro"));
    expect(result.current.horas).toEqual([]);
  });
});
