/**
 * O separador Equipa: as pessoas vêm do Olyvia (CRM/RH), com a origem à vista,
 * e o que é de Operações edita-se como antes. A base é simulada; as regras da
 * RPC estão provadas em tools/validar-pessoas-crm.mjs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { EquipaCrm, PessoaEquipa } from "../../lib/equipaCrm";

const auth = { activeOrgId: "org", businessUserId: "u-g", funcao: "gestor" as string };
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../../lib/supabase", () => ({ supabase: { rpc: async () => ({ data: null, error: null }) } }));

vi.mock("../../lib/dados", () => ({
  ErroDeDados: class extends Error {},
  ErroDeEscrita: class extends Error {},
  listarClientes: vi.fn(async () => []),
  listarLocais: vi.fn(async () => []),
  ativosDoLocal: vi.fn(async () => []),
}));

vi.mock("../../lib/config", () => ({
  gravarAtivo: vi.fn(),
  gravarCategoria: vi.fn(),
  gravarChecklist: vi.fn(),
  gravarLocal: vi.fn(),
  gravarMedicao: vi.fn(),
  gravarPerfil: vi.fn(async () => undefined),
  listarCategorias: vi.fn(async () => []),
  listarMedicoes: vi.fn(async () => []),
  listarTodasChecklists: vi.fn(async () => []),
  medicoesDasTarefas: vi.fn(async () => []),
  opcoesDasMedicoes: vi.fn(async () => []),
  proximoCodigo: vi.fn(async () => "X"),
  tarefasDaChecklist: vi.fn(async () => []),
}));

vi.mock("../../lib/obras", () => ({
  listarSkills: vi.fn(async () => [
    { id: "k1", nome: "Canalização" },
    { id: "k2", nome: "Eletricidade" },
  ]),
  gravarPlaneamentoPessoa: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../../lib/equipaCrm", async (orig) => ({
  ...(await orig<typeof import("../../lib/equipaCrm")>()),
  listarEquipaCrm: vi.fn(),
}));

import Definicoes from "../Definicoes";
import * as config from "../../lib/config";
import * as obras from "../../lib/obras";
import * as equipaCrm from "../../lib/equipaCrm";

const pessoa = (p: Partial<PessoaEquipa>): PessoaEquipa => ({
  utilizador_id: "u",
  nome: "Pessoa",
  email: "p@x.pt",
  telefone: null,
  avatar_url: null,
  cargo_crm: null,
  local_crm: null,
  papel_crm: null,
  papel_crm_codigo: null,
  equipa_crm: null,
  distritos: null,
  codigos_postais: null,
  em_operacoes: false,
  funcao: null,
  ativo: null,
  zona_base: null,
  skills: [],
  skills_nomes: [],
  custo_hora: null,
  pode_ver_custos: true,
  rh_disponivel: false,
  rh_ligado: false,
  numero_interno: null,
  cargo: null,
  local_trabalho: null,
  tipo_contrato: null,
  regime: null,
  categoria_funcao: null,
  estado_contrato: null,
  data_admissao: null,
  ausencia_tipo: null,
  ausencia_inicio: null,
  ausencia_fim: null,
  ausencia_origem: null,
  ...p,
});

const TEC = pessoa({
  utilizador_id: "u-t",
  nome: "Tiago Técnico",
  email: "tiago@x.pt",
  telefone: "912 000 000",
  papel_crm: "Técnicos",
  equipa_crm: "Equipa Sul",
  distritos: ["Setúbal", "Lisboa"],
  em_operacoes: true,
  funcao: "tecnico",
  ativo: true,
  skills: ["k1"],
  skills_nomes: ["Canalização"],
  custo_hora: 18.5,
  rh_disponivel: true,
  rh_ligado: true,
  numero_interno: "F-007",
  cargo: "Técnico de Manutenção",
  tipo_contrato: "sem_termo",
  ausencia_tipo: "Férias",
  ausencia_inicio: "2099-08-01",
  ausencia_fim: "2099-08-15",
  ausencia_origem: "rh",
});
const GESTOR = pessoa({
  utilizador_id: "u-g", nome: "Gina Gestora", em_operacoes: true, funcao: "gestor", ativo: true,
  rh_disponivel: true,
});
const NOVA = pessoa({ utilizador_id: "u-n", nome: "Nuno Novo", papel_crm: "Comercial", rh_disponivel: true });

const equipa = (over: Partial<EquipaCrm> = {}): EquipaCrm => ({
  pessoas: [GESTOR, TEC, NOVA],
  ligadaAoCrm: true,
  rhDisponivel: true,
  podeVerCustos: true,
  ...over,
});

function abrir() {
  return render(
    <MemoryRouter initialEntries={["/definicoes?ver=equipa"]}>
      <Definicoes />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(equipaCrm.listarEquipaCrm).mockResolvedValue(equipa());
});

describe("Definições › Equipa", () => {
  it("mostra os dados do CRM e do RH com a origem, e os de Operações", async () => {
    abrir();
    const cartao = await screen.findByTestId("pessoa-u-t");
    const c = within(cartao);
    expect(c.getByText("Tiago Técnico")).toBeInTheDocument();
    expect(c.getByText("do CRM")).toBeInTheDocument();
    expect(c.getAllByText("do RH").length).toBeGreaterThan(0);
    expect(c.getByText(/Equipa Sul/)).toBeInTheDocument();
    expect(c.getByText(/Setúbal, Lisboa/)).toBeInTheDocument();
    expect(c.getByText(/Técnico de Manutenção/)).toBeInTheDocument();
    expect(c.getByText(/Sem termo/)).toBeInTheDocument();
    expect(c.getByText(/Férias de 01\/08\/2099 a 15\/08\/2099/)).toBeInTheDocument();
    expect(c.getByText(/Canalização/)).toBeInTheDocument();
    expect(c.getByText("Técnico")).toBeInTheDocument();
  });

  it("separa quem está no Olyvia sem acesso a Operações, e dá-lhe uma função", async () => {
    abrir();
    expect(await screen.findByText("Pessoas do Olyvia sem acesso a Operações")).toBeInTheDocument();
    const nova = within(screen.getByTestId("pessoa-u-n"));
    fireEvent.click(nova.getByText("Dar função"));
    expect(await screen.findByText(/Dar acesso a Operações — Nuno Novo/)).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("Técnico"), { target: { value: "supervisor" } });
    fireEvent.click(screen.getByText("Dar acesso"));
    await waitFor(() => expect(config.gravarPerfil).toHaveBeenCalled());
    expect(vi.mocked(config.gravarPerfil).mock.calls[0][0]).toMatchObject({
      orgId: "org",
      utilizadorId: "u-n",
      funcao: "supervisor",
      ativo: true,
    });
    // Sem zona nem especialidades, não passa pela regra do planeamento.
    expect(obras.gravarPlaneamentoPessoa).not.toHaveBeenCalled();
  });

  it("a zona-base é um override, e mostra os distritos da agenda", async () => {
    abrir();
    const t = within(await screen.findByTestId("pessoa-u-t"));
    fireEvent.click(t.getByText("Editar"));
    expect(await screen.findByText("Zona-base (override de Operações)")).toBeInTheDocument();
    expect(screen.getByText(/A agenda do CRM já diz: Setúbal, Lisboa/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Setúbal, Lisboa"), { target: { value: "Margem Sul" } });
    fireEvent.click(screen.getByText("Gravar"));
    await waitFor(() => expect(obras.gravarPlaneamentoPessoa).toHaveBeenCalled());
    expect(vi.mocked(obras.gravarPlaneamentoPessoa).mock.calls[0][0]).toMatchObject({
      utilizadorId: "u-t",
      zona: "Margem Sul",
      skills: ["k1"],
    });
    expect(vi.mocked(config.gravarPerfil).mock.calls[0][0]).toMatchObject({ custoHora: 18.5 });
  });

  it("sem RH na base, os campos de RH não aparecem; sem costs.view, nem o custo", async () => {
    vi.mocked(equipaCrm.listarEquipaCrm).mockResolvedValue(
      equipa({
        rhDisponivel: false,
        podeVerCustos: false,
        pessoas: [
          { ...TEC, rh_disponivel: false, rh_ligado: false, numero_interno: null, cargo: null,
            tipo_contrato: null, ausencia_origem: "crm", custo_hora: null, pode_ver_custos: false },
          GESTOR,
        ],
      })
    );
    abrir();
    const c = within(await screen.findByTestId("pessoa-u-t"));
    expect(c.queryByText("do RH")).not.toBeInTheDocument();
    expect(c.queryByText(/18,50/)).not.toBeInTheDocument();
    expect(screen.getByText(/operations\.costs\.view/)).toBeInTheDocument();
  });

  it("se a RPC ainda não estiver instalada, avisa e continua a mostrar a equipa", async () => {
    vi.mocked(equipaCrm.listarEquipaCrm).mockResolvedValue(equipa({ ligadaAoCrm: false }));
    abrir();
    expect(await screen.findByText(/db\/pessoas-crm\.sql/)).toBeInTheDocument();
    expect(screen.getByText("Tiago Técnico")).toBeInTheDocument();
  });
});
