/**
 * O acompanhamento do cliente: a página pública monta com o que a base
 * devolve, mostra o essencial, e explica quando o link não serve. As regras
 * (quem gera, o que sai, validade) estão provadas em
 * tools/validar-acompanhamento.mjs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Acompanhamento } from "../../lib/acompanhamento";

const rpc = vi.fn();
vi.mock("../../lib/supabase", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    storage: {
      from: () => ({
        createSignedUrls: async (caminhos: string[]) => ({
          data: caminhos.map((p) => ({ path: p, signedUrl: `https://x.supabase.co/${p}` })),
          error: null,
        }),
      }),
    },
  },
}));

import Acompanhar from "../../pages/Acompanhar";
import PartilharCliente from "../PartilharCliente";
import { linkDeAcompanhamento } from "../../lib/acompanhamento";

const DADOS: Acompanhamento = {
  empresa: { nome: "Mudelar", telefone: "210000000" },
  obra: {
    codigo: "OB-2026-00007",
    titulo: "Remodelação da cozinha",
    morada: "Rua das Flores, 7, Cascais",
    estado: "em_curso",
    inicio: "2026-10-05",
    fim: "2026-10-23",
    fim_original: "2026-10-21",
    iniciada_em: null,
    concluida_em: null,
  },
  progresso: { percentagem: 42, tarefas: 12, feitas: 5 },
  fases: [
    { ordem: 1, nome: "Demolições", inicio: "2026-10-05", fim: "2026-10-07", n: 3, feitas: 3, estado: "concluida" },
    { ordem: 2, nome: "Canalização", inicio: "2026-10-08", fim: "2026-10-12", n: 4, feitas: 2, estado: "em_curso" },
    { ordem: 3, nome: "Revestimentos", inicio: "2026-10-13", fim: "2026-10-23", n: 5, feitas: 0, estado: "por_fazer" },
  ],
  fase_atual: { ordem: 2, nome: "Canalização", inicio: "2026-10-08", fim: "2026-10-12", n: 4, feitas: 2, estado: "em_curso" },
  proxima_fase: { ordem: 3, nome: "Revestimentos", inicio: "2026-10-13", fim: "2026-10-23", n: 5, feitas: 0, estado: "por_fazer" },
  fotos: [{ id: "f1", caminho: "org/obra/t/a.jpg", legenda: "Chão protegido", data: "2026-10-05T10:00:00Z", tarefa: "Proteger", fase: "Demolições" }],
  atrasos: [
    {
      motivo: "Material em falta",
      nota: "O material chega na quinta-feira.",
      novo_fim: "2026-10-23",
      fim_anterior: "2026-10-21",
      fase: "Canalização",
      data: "2026-10-09T09:00:00Z",
    },
  ],
  supervisor: { nome: "Rui Moreira", telefone: "912345678", email: "rui@mudelar.pt" },
  gerado_em: "2026-10-09T10:00:00Z",
  link_expira_em: "2027-01-07T10:00:00Z",
};

const abrir = (token = "a".repeat(64)) =>
  render(
    <MemoryRouter initialEntries={[`/acompanhar/${token}`]}>
      <Routes>
        <Route path="/acompanhar/:token" element={<Acompanhar />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => rpc.mockReset());

describe("página do cliente", () => {
  it("mostra a obra, o progresso, a fase atual, as etapas, a atualização, a foto e o contacto", async () => {
    rpc.mockResolvedValue({ data: DADOS, error: null });
    abrir();
    expect(await screen.findByText("Remodelação da cozinha")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("rpc_ops_acompanhar", { p_token: "a".repeat(64) });
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("Agora")).toBeInTheDocument();
    expect(screen.getAllByText("Canalização").length).toBeGreaterThan(0);
    expect(screen.getByText("As etapas da obra")).toBeInTheDocument();
    expect(screen.getByText("O material chega na quinta-feira.")).toBeInTheDocument();
    expect(screen.getByText("Rui Moreira")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ligar" })).toHaveAttribute("href", "tel:912345678");
    await waitFor(() => expect(screen.getByAltText("Chão protegido")).toHaveAttribute("src", "https://x.supabase.co/org/obra/t/a.jpg"));
  });

  it("um link expirado diz o que fazer", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Este link expirou. Peça um novo à equipa da obra." } });
    abrir();
    expect(await screen.findByText("Acompanhamento indisponível")).toBeInTheDocument();
    expect(screen.getByText(/expirou/)).toBeInTheDocument();
  });

  it("um link inválido não diz mais do que isso", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Link inválido ou desativado." } });
    abrir("b".repeat(64));
    expect(await screen.findByText("Este link não é válido ou foi desativado.")).toBeInTheDocument();
  });
});

describe("partilhar com o cliente", () => {
  it("sem o SQL aplicado, o botão não aparece", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const { container } = render(<PartilharCliente obraId="o1" codigo="OB-1" />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("gera o link e mostra-o uma vez, com WhatsApp", async () => {
    const estado = { ativa: false, criada_em: null, expira_em: null, acessos: 0, ultimo_acesso_em: null, criada_por: null, fotos_visiveis: 2, pode_gerir: true };
    rpc.mockImplementation(async (nome: string) => {
      if (nome === "rpc_ops_obra_partilha_estado") return { data: estado, error: null };
      if (nome === "rpc_ops_obra_partilha_criar") return { data: { token: "c".repeat(64), expira_em: "2027-01-01" }, error: null };
      return { data: null, error: null };
    });
    render(<PartilharCliente obraId="o1" codigo="OB-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Partilhar com o cliente/ }));
    fireEvent.click(screen.getByRole("button", { name: "Gerar link" }));
    const campo = await screen.findByDisplayValue(new RegExp(`/acompanhar/${"c".repeat(64)}$`));
    expect(campo).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enviar por WhatsApp" }).getAttribute("href")).toContain("wa.me");
    expect(rpc).toHaveBeenCalledWith("rpc_ops_obra_partilha_criar", { p_obra_id: "o1", p_dias: 90 });
  });

  it("quem não gere só vê o estado e a pré-visualização", async () => {
    rpc.mockResolvedValue({
      data: { ativa: true, criada_em: "2026-10-01", expira_em: "2027-01-01", acessos: 3, ultimo_acesso_em: "2026-10-05T10:00:00Z", criada_por: "Rui", fotos_visiveis: 1, pode_gerir: false },
      error: null,
    });
    render(<PartilharCliente obraId="o1" codigo="OB-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Partilhado com o cliente/ }));
    expect(screen.getByText("Link ativo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gerar/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Ver o que o cliente vê/ })).toBeInTheDocument();
  });
});

describe("o endereço do link", () => {
  it("fica debaixo da app, em /acompanhar/<token>", () => {
    expect(linkDeAcompanhamento("abc", "https://www.olyvia-ai.com")).toMatch(/^https:\/\/www\.olyvia-ai\.com\/?.*\/acompanhar\/abc$/);
  });
});
