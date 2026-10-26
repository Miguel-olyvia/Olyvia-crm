// «Marcar a visita» ligado à base: além do dia, da hora, da duração prevista e da nota, diz-se QUEM VAI ESTAR (o cliente, o casal, a família ou outra
// pessoa). É opcional, escolhe-se e desfaz-se, e segue na entrada da visita (a base guarda-o em `presentes`). Os hooks da base estão simulados.
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
  marcar: vi.fn(),
  conflito: { emConflito: [] as string[], aVerificar: false, falharam: [] },
}));
vi.mock("@/hooks/pessoas/useAgendaVisita", () => ({ useAgendaVisita: () => estado.agenda }));
vi.mock("@/hooks/pessoas/useAcoesVisita", () => ({
  useAcoesVisita: () => ({ marcar: estado.marcar, alterar: vi.fn(), cancelar: vi.fn(), resultado: vi.fn() }),
}));
vi.mock("@/hooks/pessoas/useConflitoVisita", () => ({ useConflitoVisita: () => estado.conflito }));

import { MarcarVisitaProvider } from "./MarcarVisita";
import { useMarcarVisita } from "./marcarVisitaContexto";

beforeAll(prepararRadixNoJsdom);

const LEAD = { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" };

beforeEach(() => {
  estado.marcar.mockReset();
  estado.marcar.mockResolvedValue({ visitaId: "v-novo", mudou: true });
  estado.agenda = {
    quadros: [{ id: "q1", name: "Visitas", board_type: "visits", settings: null }],
    recursos: [{ id: R1, name: "Rita Gomes", resource_type: "user", user_id: "u1" }],
    isLoading: false, isError: false, refetch: vi.fn(), omissao: { boardId: "q1", recursoId: R1 },
  };
});

function Abrir() {
  const marcar = useMarcarVisita();
  return <button type="button" onClick={() => marcar?.pedir({ pessoaId: "p1", nome: "Ana Lopes", moradaLead: LEAD })}>Abrir</button>;
}

async function montar() {
  render(<MarcarVisitaProvider hoje="2026-10-20" aoMarcar={vi.fn()} naBase><Abrir /></MarcarVisitaProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
  await screen.findByLabelText("Duração");
  fireEvent.change(screen.getByLabelText("Dia"), { target: { value: "2026-10-24" } });
  fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "10:00" } });
}
const dialogo = () => screen.getByRole("dialog", { name: "Marcar visita" });
const submeter = () => within(dialogo()).getByRole("button", { name: /^Marcar visita$/ });

describe("Marcar a visita: quem vai estar", () => {
  it("oferece o cliente, o casal, a família e outra pessoa, e nenhum vem escolhido", async () => {
    await montar();
    const grupo = within(dialogo()).getByRole("group", { name: "Quem vai estar" });
    const nomes = within(grupo).getAllByRole("button").map((b) => b.textContent);
    expect(nomes).toEqual(["O cliente", "O casal", "A família", "Outra pessoa"]);
    for (const b of within(grupo).getAllByRole("button")) expect(b).toHaveAttribute("aria-pressed", "false");
  });

  it("sem escolher ninguém a visita segue sem presentes (é opcional)", async () => {
    await montar();
    fireEvent.click(submeter());
    await waitFor(() => expect(estado.marcar).toHaveBeenCalledTimes(1));
    expect(estado.marcar).toHaveBeenCalledWith(expect.objectContaining({ quemVaiEstar: "" }));
  });

  it("escolher o casal segue na entrada da visita, com a duração prevista e a nota", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Duração"), { target: { value: "h1m30" } });
    fireEvent.change(screen.getByLabelText("Nota (opcional)"), { target: { value: "Querem ver amostras" } });
    fireEvent.click(within(dialogo()).getByRole("button", { name: "O casal" }));
    expect(within(dialogo()).getByRole("button", { name: "O casal" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(submeter());
    await waitFor(() => expect(estado.marcar).toHaveBeenCalledTimes(1));
    expect(estado.marcar).toHaveBeenCalledWith(expect.objectContaining({ quemVaiEstar: "casal", duracao: "h1m30", nota: "Querem ver amostras" }));
  });

  it("clicar outra vez na mesma opção desfaz a escolha, e só uma fica escolhida", async () => {
    await montar();
    fireEvent.click(within(dialogo()).getByRole("button", { name: "A família" }));
    fireEvent.click(within(dialogo()).getByRole("button", { name: "Outra pessoa" }));
    expect(within(dialogo()).getByRole("button", { name: "A família" })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialogo()).getByRole("button", { name: "Outra pessoa" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(dialogo()).getByRole("button", { name: "Outra pessoa" }));
    fireEvent.click(submeter());
    await waitFor(() => expect(estado.marcar).toHaveBeenCalledTimes(1));
    expect(estado.marcar).toHaveBeenCalledWith(expect.objectContaining({ quemVaiEstar: "" }));
  });
});
