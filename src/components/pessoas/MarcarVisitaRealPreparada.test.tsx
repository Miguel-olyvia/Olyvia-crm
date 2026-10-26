// «Marcar a visita» recebe o que se preparou no passo «Preparar a visita» do assistente: a duração, quem vai estar e a nota já vão escolhidos
// (e podem mudar-se). Sem preparação o diálogo abre como sempre. Os hooks da base estão simulados.
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
import { useMarcarVisita, type AberturaVisita } from "./marcarVisitaContexto";

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

function Abrir({ extra }: { extra: Partial<AberturaVisita> }) {
  const marcar = useMarcarVisita();
  return <button type="button" onClick={() => marcar?.pedir({ pessoaId: "p1", nome: "Ana Lopes", moradaLead: LEAD, ...extra })}>Abrir</button>;
}

async function abrir(extra: Partial<AberturaVisita>) {
  render(<MarcarVisitaProvider hoje="2026-10-20" aoMarcar={vi.fn()} naBase><Abrir extra={extra} /></MarcarVisitaProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
  await screen.findByLabelText("Duração");
}
const dialogo = () => screen.getByRole("dialog", { name: "Marcar visita" });

describe("Marcar a visita com o que se preparou", () => {
  it("a duração, quem vai estar e a nota já vão escolhidos", async () => {
    await abrir({ preparar: { duracao: "h1m30", quemVaiEstar: "casal", nota: "Levar escada" } });
    expect(screen.getByLabelText("Duração")).toHaveValue("h1m30");
    expect(within(dialogo()).getByRole("button", { name: "O casal" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Nota (opcional)")).toHaveValue("Levar escada");
  });

  it("segue na entrada da visita, e o que se mudar no diálogo manda", async () => {
    await abrir({ preparar: { duracao: "h2", quemVaiEstar: "familia", nota: "Levar escada" } });
    fireEvent.change(screen.getByLabelText("Dia"), { target: { value: "2026-10-24" } });
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "10:00" } });
    fireEvent.click(within(dialogo()).getByRole("button", { name: /^Marcar visita$/ }));
    await waitFor(() => expect(estado.marcar).toHaveBeenCalledTimes(1));
    expect(estado.marcar).toHaveBeenCalledWith(expect.objectContaining({ quemVaiEstar: "familia", duracao: "h2", nota: "Levar escada" }));
  });

  it("sem preparar nada fica como sempre: 1 h, ninguém escolhido, nota vazia", async () => {
    await abrir({});
    expect(screen.getByLabelText("Duração")).toHaveValue("h1");
    for (const b of within(within(dialogo()).getByRole("group", { name: "Quem vai estar" })).getAllByRole("button")) expect(b).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Nota (opcional)")).toHaveValue("");
  });

  it("uma duração fora da lista ou vazia é ignorada (a agenda usa a sua)", async () => {
    await abrir({ preparar: { duracao: "", quemVaiEstar: "", nota: "" } });
    expect(screen.getByLabelText("Duração")).toHaveValue("h1");
  });
});
