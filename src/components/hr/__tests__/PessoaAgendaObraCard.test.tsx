/**
 * "Agenda de obra" na ficha de RH (migration 20261231999000): as tarefas de obra da pessoa (obra, negócio, morada, dias, horas por dia)
 * e os dias indisponíveis; sem tarefas, diz que não há; quem não é técnico nem tem tarefas não vê o cartão; numa base sem a função também não.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (k: string, p?: Record<string, string>) => (p ? `${k} ${Object.values(p).join(" ")}` : k),
  }),
}));
const hrRpc = vi.fn();
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: (...a: unknown[]) => hrRpc(...a) }));

import { PessoaAgendaObraCard } from "@/components/hr/PessoaAgendaObraCard";

const HOJE = new Date(2026, 9, 28);
const SERGIO = {
  pessoa_id: "p1",
  nome: "Sérgio Faria",
  oficios: ["Ladrilhador"],
  tarefas: [
    {
      tarefa_id: "t1", nome: "Revestimento de parede", oficio: "Ladrilhador", inicio: "2026-11-03", fim: "2026-11-04", estado: "por_fazer",
      horas_dia: 8, obra_codigo: "OB-1001", obra_titulo: "WC Anabela", morada: "Rua A 1, Sintra", negocio_numero: 1001,
    },
  ],
  indisponivel: [{ data: "2026-11-10", fraccao: 1 }],
};
const responde = (r: { data?: unknown; error?: unknown }) => hrRpc.mockResolvedValue({ data: null, error: null, ...r });

describe("PessoaAgendaObraCard", () => {
  beforeEach(() => hrRpc.mockReset());

  it("mostra a tarefa com a obra, o negócio, a morada e as horas; e os dias indisponíveis", async () => {
    responde({ data: [SERGIO] });
    render(<PessoaAgendaObraCard pessoaId="p1" organizationId="o1" hoje={HOJE} />);
    expect(await screen.findByText(/Revestimento de parede/)).toBeInTheDocument();
    expect(screen.getByText(/#1001 · WC Anabela · Rua A 1, Sintra/)).toBeInTheDocument();
    expect(screen.getByText(/hr.agendaObra.horasDia 8/)).toBeInTheDocument();
    expect(screen.getByText(/hr.agendaObra.indisponivel/)).toBeInTheDocument();
    expect(hrRpc).toHaveBeenCalledWith("rh_agenda_tecnicos", { p_org: "o1", p_de: "2026-10-28", p_ate: "2026-12-27" });
  });

  it("técnico sem tarefas: diz que não há", async () => {
    responde({ data: [{ ...SERGIO, tarefas: [], indisponivel: [] }] });
    render(<PessoaAgendaObraCard pessoaId="p1" organizationId="o1" hoje={HOJE} />);
    expect(await screen.findByText(/hr.agendaObra.semTarefas 60/)).toBeInTheDocument();
  });

  it("quem não está na agenda (não é técnico, sem tarefas) não vê o cartão", async () => {
    responde({ data: [SERGIO] });
    const { container } = render(<PessoaAgendaObraCard pessoaId="outra" organizationId="o1" hoje={HOJE} />);
    await waitFor(() => expect(hrRpc).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("base sem a função: sem cartão; outro erro: mostra-o", async () => {
    responde({ error: { code: "PGRST202", message: "x" } });
    const a = render(<PessoaAgendaObraCard pessoaId="p1" organizationId="o1" hoje={HOJE} />);
    await waitFor(() => expect(a.container).toBeEmptyDOMElement());
    a.unmount();
    responde({ error: { code: "CT001", message: "Sem permissão (pessoas.view ou hr.pessoas.laborais.view)." } });
    render(<PessoaAgendaObraCard pessoaId="p1" organizationId="o1" hoje={HOJE} />);
    expect(await screen.findByText(/Sem permissão/)).toBeInTheDocument();
  });
});
