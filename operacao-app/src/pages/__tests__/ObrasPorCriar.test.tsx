/**
 * "Obras por criar": os contratos já pagos (Financeiro, no CRM) aparecem no
 * topo das Obras; "Criar obra" e o link do sino (?criar=<id>) abrem a Nova
 * obra já no contrato. As regras da base estão em tools/validar-financeiro.mjs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const auth = { activeOrgId: "org", businessUserId: "u-g", funcao: "gestor" as string };
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../../lib/supabase", () => ({
  supabase: { from: () => ({}), rpc: async () => ({ data: null, error: null }), auth: {}, functions: {}, storage: { from: () => ({}) } },
}));

const CTR = "88880000-0000-0000-0000-000000000001";
const CTR_OUTRO = "88880000-0000-0000-0000-000000000009";

vi.mock("../../lib/dados", () => ({
  ErroDeDados: class extends Error {},
  ErroDeEscrita: class extends Error {},
  listarClientes: vi.fn(async () => [{ id: "c1", nome: "Maria Silva" }]),
  listarEquipa: vi.fn(async () => []),
  listarOrcamentos: vi.fn(async () => []),
}));

vi.mock("../../lib/obras", () => ({
  listarObras: vi.fn(async () => []),
  alertasDaOrganizacao: vi.fn(async () => []),
  listarContratos: vi.fn(async () => ({
    contratos: [
      {
        id: CTR,
        cliente_id: "c1",
        numero: "CT-001",
        estado: "signed",
        orcamento_id: "q1",
        titulo: "Remodelação WC",
        obra_endereco: null,
        assinado_em: "2026-10-01",
        valor: 10000,
        tem_obra: false,
        n_servicos: 2,
        n_produtos: 0,
      },
    ],
    indisponivel: false,
  })),
  listarModelos: vi.fn(async () => []),
  orcamentosComObra: vi.fn(async () => new Set<string>()),
  moradaSugerida: vi.fn(async () => null),
  previsaoDoOrcamento: vi.fn(async () => ({ orcamento_id: "q1", minutos: 60, sem_ficha: 0, tarefas: [] })),
  previsaoDoContrato: vi.fn(),
  stockDosProdutos: vi.fn(),
  criarObra: vi.fn(),
}));

vi.mock("../../lib/financeiroObra", async (original) => ({
  ...(await original<typeof import("../../lib/financeiroObra")>()),
  listarObrasPorCriar: vi.fn(async () => [
    { contrato_id: CTR, numero: "CT-001", cliente_id: "c1", cliente_nome: "Maria Silva", pago_em: new Date().toISOString() },
  ]),
}));

import Obras from "../Obras";
import { contratoDoLink, haQuantoTempo, listarObrasPorCriar } from "../../lib/financeiroObra";

function Endereco() {
  const l = useLocation();
  return <span data-testid="endereco">{l.pathname + l.search}</span>;
}

function em(rota: string) {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route
          path="/obras"
          element={
            <>
              <Obras />
              <Endereco />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  auth.funcao = "gestor";
});

describe("financeiroObra (funções puras)", () => {
  it("contratoDoLink só aceita um uuid em ?criar=", () => {
    expect(contratoDoLink(`?criar=${CTR.toUpperCase()}`)).toBe(CTR);
    expect(contratoDoLink("?criar=abc")).toBeNull();
    expect(contratoDoLink("")).toBeNull();
    expect(contratoDoLink(new URLSearchParams({ criar: ` ${CTR} ` }))).toBe(CTR);
  });

  it("haQuantoTempo: hoje, ontem, há N dias", () => {
    const agora = new Date(2026, 9, 13, 10, 0);
    expect(haQuantoTempo(new Date(2026, 9, 13, 8, 0).toISOString(), agora)).toBe("hoje");
    expect(haQuantoTempo(new Date(2026, 9, 12, 23, 0).toISOString(), agora)).toBe("ontem");
    expect(haQuantoTempo(new Date(2026, 9, 9, 12, 0).toISOString(), agora)).toBe("há 4 dias");
    expect(haQuantoTempo("lixo", agora)).toBe("");
  });
});

describe("Obras: obras por criar", () => {
  it("o gestor vê o contrato pago no topo e 'Criar obra' abre a Nova obra nesse contrato", async () => {
    em("/obras");
    expect(await screen.findByText("1 obra por criar")).toBeInTheDocument();
    expect(screen.getByText(/pago hoje/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Criar obra de Maria Silva" }));
    const escolhido = await screen.findByRole("button", { name: /CT-001 · Remodelação WC/ });
    expect(escolhido).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Seguinte" })).toBeEnabled();
  });

  it("o link do sino (?criar=<id>) abre a Nova obra sozinho e limpa o endereço", async () => {
    em(`/obras?criar=${CTR}`);
    const escolhido = await screen.findByRole("button", { name: /CT-001 · Remodelação WC/ });
    expect(escolhido).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByTestId("endereco").textContent).toBe("/obras"));
  });

  it("um contrato que já não está na lista avisa e não deixa avançar", async () => {
    em(`/obras?criar=${CTR_OUTRO}`);
    expect(await screen.findByText(/Este contrato já tem obra, ou já não está assinado/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seguinte" })).toBeDisabled();
  });

  it("o técnico não vê a lista nem abre nada pelo link", async () => {
    auth.funcao = "tecnico";
    vi.mocked(listarObrasPorCriar).mockClear();
    em(`/obras?criar=${CTR}`);
    expect(await screen.findByText("Sem obras")).toBeInTheDocument();
    expect(screen.queryByText(/obra por criar/)).not.toBeInTheDocument();
    expect(screen.queryByText("Nova obra")).not.toBeInTheDocument();
    expect(listarObrasPorCriar).not.toHaveBeenCalled();
  });
});
