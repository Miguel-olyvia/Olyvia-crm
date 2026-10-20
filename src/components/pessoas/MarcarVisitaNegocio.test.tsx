// Marcar uma visita a partir de um NEGÓCIO (naBase): a abertura leva o negócio e `useAcoesVisita.marcar` recebe-o (vai em `p_negocio_id`, e a base
// recusa um negócio fechado ou de outra pessoa). Sem negócio a visita nasce por ligar, como sempre. O provider da ficha real pode completar a
// abertura (a morada da lead e o responsável, que o botão do negócio não conhece). Os hooks da base estão simulados.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos = pessoasPaginaTranslations.pt;
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

const R1 = "11111111-1111-4111-8111-111111111111";
const estado = vi.hoisted(() => ({
  agenda: null as unknown,
  agendaArgs: [] as unknown[][],
  marcar: vi.fn(),
}));
vi.mock("@/hooks/pessoas/useAgendaVisita", () => ({ useAgendaVisita: (...a: unknown[]) => { estado.agendaArgs.push(a); return estado.agenda; } }));
vi.mock("@/hooks/pessoas/useAcoesVisita", () => ({
  useAcoesVisita: () => ({ marcar: estado.marcar, alterar: vi.fn(), cancelar: vi.fn(), resultado: vi.fn() }),
}));
vi.mock("@/hooks/pessoas/useConflitoVisita", () => ({ useConflitoVisita: () => ({ emConflito: [], aVerificar: false, falharam: [] }) }));

import { MarcarVisitaProvider } from "./MarcarVisita";
import { useMarcarVisita, type AberturaVisita } from "./marcarVisitaContexto";

beforeAll(prepararRadixNoJsdom);

const LEAD = { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" };

beforeEach(() => {
  estado.marcar.mockReset();
  estado.marcar.mockResolvedValue({ visitaId: "v-nova", mudou: true });
  estado.agendaArgs.length = 0;
  estado.agenda = {
    quadros: [{ id: "q1", name: "Visitas", board_type: "visits", settings: null }],
    recursos: [{ id: R1, name: "Rita Gomes", resource_type: "user", user_id: "u1" }],
    isLoading: false, isError: false, refetch: vi.fn(), omissao: { boardId: "q1", recursoId: R1 },
  };
});

function Abrir({ abertura }: { abertura: AberturaVisita }) {
  const marcar = useMarcarVisita();
  return <button type="button" onClick={() => marcar?.pedir(abertura)}>Abrir</button>;
}

async function abrir(abertura: AberturaVisita, completar?: (a: AberturaVisita) => AberturaVisita) {
  render(
    <MarcarVisitaProvider hoje="2026-10-20" aoMarcar={vi.fn()} naBase completar={completar}>
      <Abrir abertura={abertura} />
    </MarcarVisitaProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
  // O formulário ligado à base carrega-se à parte (import dinâmico): a primeira vez custa, sobretudo com a máquina ocupada.
  await screen.findByLabelText("Duração", {}, { timeout: 8000 });
}
async function marcar() {
  fireEvent.change(screen.getByLabelText("Dia"), { target: { value: "2026-10-24" } });
  fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "10:00" } });
  fireEvent.click(within(screen.getByRole("dialog", { name: "Marcar visita" })).getByRole("button", { name: /^Marcar visita$/ }));
  await waitFor(() => expect(estado.marcar).toHaveBeenCalledTimes(1));
  return estado.marcar.mock.calls[0][0] as Record<string, unknown>;
}

describe("Marcar visita a partir de um negócio", () => {
  it("com negócio na abertura, a visita é marcada já ligada a esse negócio", async () => {
    await abrir({ pessoaId: "p1", nome: "Ana Lopes", moradaLead: LEAD, negocioId: "n1" });
    expect(await marcar()).toMatchObject({ negocioId: "n1", boardId: "q1", recursos: [R1] });
  });

  it("sem negócio, a visita nasce por ligar (nenhum negócio na entrada)", async () => {
    await abrir({ pessoaId: "p1", nome: "Ana Lopes", moradaLead: LEAD });
    expect(await marcar()).not.toHaveProperty("negocioId");
  });

  it("o provider da ficha real completa a abertura: a morada da lead e o responsável (o recurso por omissão) chegam ao formulário", async () => {
    await abrir(
      { pessoaId: "p1", nome: "Ana Lopes", moradaLead: null, negocioId: "n1" },
      (a) => ({ ...a, moradaLead: LEAD, responsavelUserId: "u9" }),
    );
    expect(estado.agendaArgs.at(-1)).toEqual(["u9"]);
    expect(screen.getByRole("radio", { name: /Na morada da lead/ })).toBeChecked();
    expect(await marcar()).toMatchObject({ negocioId: "n1", igualALead: true });
  });
});
