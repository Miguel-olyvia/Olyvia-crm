/**
 * O QR da porta → "Registar chegada": regista a hora e começa o relógio da
 * primeira tarefa do dia. A base é simulada; as regras estão em
 * tools/validar-chegadas.mjs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { TarefaObra } from "../../lib/obras";

const auth = { activeOrgId: "org", businessUserId: "u-tec", funcao: "tecnico" as string, orgs: [{ id: "org", name: "Org" }] };
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../../lib/supabase", () => ({ supabase: {} }));

const agora = new Date();
const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;

const t = (p: Partial<TarefaObra>) =>
  ({
    id: "t1", organization_id: "org", obra_id: "o1", fase_id: "f1", ordem: 1, nome: "Demolição",
    minutos_previstos: 60, inicio_planeado: hoje, fim_planeado: hoje, depende_de: null, estado: "por_fazer",
    fase_ordem: 1, fase_nome: "F", obra_codigo: "OB-1", obra_titulo: "WC Cascais", obra_estado: "em_curso",
    obra_morada: "Rua das Flores, 7", tolerancia_percent: 10, minutos_reais: 0, a_correr: 0, pessoas: ["u-tec"],
    ...p,
  }) as TarefaObra;

const m = vi.hoisted(() => ({
  minhasTarefas: vi.fn(),
  meuRegistoAberto: vi.fn(),
  iniciarTarefa: vi.fn(),
  registarChegada: vi.fn(),
  obterPosicao: vi.fn(),
}));

vi.mock("../../lib/obras", () => ({
  minhasTarefas: m.minhasTarefas,
  meuRegistoAberto: m.meuRegistoAberto,
  iniciarTarefa: m.iniciarTarefa,
}));
vi.mock("../../lib/chegadas", () => ({ registarChegada: m.registarChegada, obterPosicao: m.obterPosicao }));
vi.mock("../../lib/dados", () => ({ ErroDeDados: class extends Error {}, ErroDeEscrita: class extends Error {} }));

import ChegadaObra from "../ChegadaObra";

beforeEach(() => {
  vi.clearAllMocks();
  m.meuRegistoAberto.mockResolvedValue(null);
  m.iniciarTarefa.mockResolvedValue({ ok: true });
  m.registarChegada.mockResolvedValue({ id: "c1", chegou_em: agora.toISOString() });
  m.obterPosicao.mockResolvedValue({ latitude: 38.7, longitude: -9.1, precisao: 10 });
});

const montar = () =>
  render(
    <MemoryRouter>
      <ChegadaObra codigo="OB-1" />
    </MemoryRouter>
  );

describe("ChegadaObra", () => {
  it("regista a chegada SEM localização e começa a primeira tarefa do dia", async () => {
    m.minhasTarefas.mockResolvedValue([
      t({ id: "t2", nome: "Pintura", ordem: 2 }),
      t({ id: "t1", nome: "Demolição", ordem: 1 }),
      t({ id: "x", obra_codigo: "OB-OUTRA" }),
    ]);
    montar();
    expect(await screen.findByText("WC Cascais")).toBeTruthy();
    expect(screen.getByText(/O relógio começa em "Demolição"/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Registar chegada" }));
    await waitFor(() => expect(screen.getByText(/Chegada registada às/)).toBeTruthy());
    expect(m.obterPosicao).not.toHaveBeenCalled();
    expect(m.registarChegada).toHaveBeenCalledWith({ obraId: "o1", tarefaId: "t1", posicao: null });
    expect(m.iniciarTarefa).toHaveBeenCalledWith("t1");
  });

  it("com a localização ligada, pede-a e envia-a", async () => {
    m.minhasTarefas.mockResolvedValue([t({})]);
    montar();
    await screen.findByText("WC Cascais");
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Registar chegada" }));
    await waitFor(() => expect(m.registarChegada).toHaveBeenCalled());
    expect(m.registarChegada.mock.calls[0][0].posicao).toEqual({ latitude: 38.7, longitude: -9.1, precisao: 10 });
  });

  it("com outra tarefa a correr, não começa nenhuma e diz porquê", async () => {
    m.minhasTarefas.mockResolvedValue([t({})]);
    m.meuRegistoAberto.mockResolvedValue({ id: "r", tarefa_id: "outra", utilizador_id: "u-tec", inicio: agora.toISOString(), fim: null });
    montar();
    await screen.findByText("WC Cascais");
    fireEvent.click(screen.getByRole("button", { name: "Registar chegada" }));
    await waitFor(() => expect(screen.getByText(/relógio a correr noutra tarefa/)).toBeTruthy());
    expect(m.iniciarTarefa).not.toHaveBeenCalled();
  });

  it("sem tarefas nesta obra: diz o que fazer", async () => {
    m.minhasTarefas.mockResolvedValue([t({ obra_codigo: "OB-OUTRA" })]);
    montar();
    expect(await screen.findByText("Não tens tarefas nesta obra")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Registar chegada" })).toBeNull();
  });
});
