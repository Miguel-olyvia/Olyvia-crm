/**
 * Fumo da página Capacidade: monta com dados realistas, escreve as frases do
 * que pede atenção, troca "Com o comercial" / "Só o certo", e o clique numa
 * célula mostra de onde vem o trabalho. As contas estão provadas em
 * tools/validar-capacidade.mjs; aqui a base é simulada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Capacidade as Dados } from "../../domain/capacidade";

const auth = { activeOrgId: "org", businessUserId: "u", funcao: "gestor" as string };
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../../lib/supabase", () => ({ supabase: { rpc: async () => ({ data: null, error: null }) } }));

const pedidos: { recalcular?: boolean }[] = [];
let resposta: Dados;
vi.mock("../../lib/capacidade", () => ({
  capacidadeDaEquipa: async (_org: string, o: { recalcular?: boolean } = {}) => {
    pedidos.push(o);
    return resposta;
  },
}));

import Capacidade from "../Capacidade";

const cel = (w: number, p: Partial<Dados["especialidades"][number]["celulas"][number]>) => ({
  w, oferta: 0, procura: 0, certa: 0, atrasado: 0, faltam: 0, ...p,
});

beforeEach(() => {
  pedidos.length = 0;
  auth.funcao = "gestor";
  resposta = {
    inicio: "2026-11-02",
    hoje: "2026-11-04",
    semanas: [
      { w: 0, inicio: "2026-11-02", dias: 3 },
      { w: 1, inicio: "2026-11-09", dias: 5 },
    ],
    especialidades: [
      { id: "can", nome: "Canalização", pessoas: 1, celulas: [
        cel(0, { oferta: 1440, procura: 600, certa: 600 }),
        cel(1, { oferta: 2400, procura: 6000, certa: 2000, faltam: 2 }),
      ] },
      { id: "pin", nome: "Pintura", pessoas: 1, celulas: [cel(0, { oferta: 1440 }), cel(1, { oferta: 2400, procura: 2200, certa: 2200 })] },
    ],
    fontes: [
      { tipo: "obra", id: "o1", codigo: "OB-2026-00001", titulo: "Remodelação WC", prob: 1, minutos: 2600,
        celulas: [{ s: "can", w: 0, m: 600 }, { s: "can", w: 1, m: 2000 }] },
      { tipo: "proposta", id: "q1", codigo: "ORC-0042", titulo: "Cozinha Cascais", prob: 0.4, minutos: 4000,
        celulas: [{ s: "can", w: 1, m: 4000 }] },
    ],
    resumo: { obras: 1, contratos: 0, aceites: 0, propostas: 1, propostas_total: 1, erros: 0, por_expandir: 0, pessoas_sem_especialidade: 0 },
    calculado_em: "2026-11-04T10:15:00Z",
    em_cache: true,
  };
});

const montar = () =>
  render(
    <MemoryRouter>
      <Capacidade />
    </MemoryRouter>
  );

describe("Capacidade", () => {
  it("mostra as frases, o mapa e a legenda", async () => {
    montar();
    expect(await screen.findByText("Faltam ~2 pessoas de Canalização na semana de 09/11")).toBeTruthy();
    expect(screen.getByText("250 %")).toBeTruthy(); // 6000 / 2400
    expect(screen.getByText("92 %")).toBeTruthy(); // Pintura 2200 / 2400 → apertado
    expect(screen.getByText(/Falta gente \(> 100 %\)/)).toBeTruthy();
  });

  it("só o certo: a Canalização da semana 2 deixa de faltar", async () => {
    montar();
    await screen.findByText("Faltam ~2 pessoas de Canalização na semana de 09/11");
    fireEvent.click(screen.getByRole("radio", { name: "Só o certo" }));
    await waitFor(() => expect(screen.queryByText(/Faltam ~2 pessoas/)).toBeNull());
    expect(screen.getByText("83 %")).toBeTruthy(); // 2000 / 2400
  });

  it("o clique numa célula diz de onde vem o trabalho, com a certeza", async () => {
    montar();
    await screen.findByText("250 %");
    fireEvent.click(screen.getByText("250 %"));
    expect(await screen.findByText("Canalização · semana de 09/11")).toBeTruthy();
    expect(screen.getByText("ORC-0042")).toBeTruthy();
    expect(screen.getByText("40 %")).toBeTruthy();
    expect(screen.getByRole("link", { name: "OB-2026-00001" }).getAttribute("href")).toBe("/obras/OB-2026-00001");
  });

  it("Recalcular pede à base para calcular de novo", async () => {
    montar();
    await screen.findByText("250 %");
    fireEvent.click(screen.getByRole("button", { name: "Recalcular" }));
    await waitFor(() => expect(pedidos.some((p) => p.recalcular)).toBe(true));
  });

  it("o técnico não vê", () => {
    auth.funcao = "tecnico";
    montar();
    expect(screen.getByText("A capacidade da equipa é para o gestor.")).toBeTruthy();
  });
});
