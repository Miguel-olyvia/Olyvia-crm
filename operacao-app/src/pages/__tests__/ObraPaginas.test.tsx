/**
 * Fumo: cada página de Obras monta, com dados realistas, sem erros em tempo
 * de execução — e mostra o essencial. A base é simulada (vi.mock); as regras
 * de verdade estão provadas em tools/validar-obras.mjs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { TarefaObra } from "../../lib/obras";

const auth = {
  activeOrgId: "org",
  businessUserId: "u-tec",
  funcao: "gestor" as string,
};

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../../lib/supabase", () => ({ supabase: { from: () => ({ select: () => ({ in: () => ({ order: async () => ({ data: [], error: null }) }) }) }), storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) }, auth: {}, functions: {}, rpc: async () => ({ data: null, error: null }) } }));

const agora = new Date();
const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;

const tarefa = (p: Partial<TarefaObra>): TarefaObra => ({
  id: "t1",
  organization_id: "org",
  obra_id: "o1",
  fase_id: "f1",
  modelo_tarefa_id: "m1",
  ordem: 1,
  nome: "Demolição de revestimentos",
  procedimento: "Picar até ao reboco.",
  materiais: "Sacos de entulho",
  ferramentas: "Martelo demolidor",
  minutos_previstos: 300,
  inicio_planeado: hoje,
  fim_planeado: hoje,
  depende_de: null,
  estado: "por_fazer",
  iniciada_em: null,
  terminada_em: null,
  motivo_desvio: null,
  nota_desvio: null,
  validada_por: null,
  validada_em: null,
  motivo_rejeicao: null,
  fase_ordem: 1,
  fase_nome: "Preparação e demolições",
  obra_codigo: "OB-2026-00001",
  obra_titulo: "Remodelação WC",
  obra_estado: "em_curso",
  obra_morada: "Rua X, 12",
  tolerancia_percent: 10,
  minutos_reais: 0,
  a_correr: 0,
  pessoas: ["u-tec"],
  ...p,
});

const TAREFAS: TarefaObra[] = [
  tarefa({ id: "t1", estado: "em_curso", minutos_reais: 250, a_correr: 1 }),
  tarefa({ id: "t2", nome: "Remoção de entulho", ordem: 2, minutos_previstos: 120 }),
  tarefa({
    id: "t3",
    nome: "Canalização",
    fase_id: "f2",
    fase_ordem: 2,
    fase_nome: "Instalações técnicas",
    estado: "feita",
    minutos_reais: 400,
    minutos_previstos: 360,
    motivo_desvio: "secagem",
    terminada_em: agora.toISOString(),
  }),
  tarefa({ id: "t4", nome: "Pintura", estado: "rejeitada", motivo_rejeicao: "Ficou mancha" }),
];

const OBRA = {
  id: "o1",
  organization_id: "org",
  codigo: "OB-2026-00001",
  titulo: "Remodelação WC",
  estado: "em_curso",
  cliente_id: "c1",
  orcamento_id: "q1",
  contrato_id: null,
  modelo_id: "m",
  morada: "Rua X, 12",
  data_inicio_prevista: hoje,
  gestor_id: "u-g",
  supervisor_id: "u-s",
  tolerancia_percent: 10,
  criada_em: agora.toISOString(),
  n_tarefas: 4,
  n_feitas: 1,
  n_validadas: 0,
  n_por_validar: 1,
  minutos_previstos: 900,
  minutos_reais: 680,
  inicio_planeado: hoje,
  fim_planeado: hoje,
  n_extras: 1,
};

const ALERTAS = [
  {
    tipo: "fim_ultrapassado", gravidade: 1, tarefa_id: "t4", obra_id: "o1", obra_codigo: "OB-2026-00001",
    obra_titulo: "Remodelação WC", tarefa_nome: "Pintura", pessoas: ["u-tec"], pessoas_nomes: ["Tiago Técnico"],
    desde: agora.toISOString(), minutos_atraso: 1500, detalhe: "Devia ter acabado a 01/10 e voltou para refazer", atraso_id: null,
  },
  {
    tipo: "nao_iniciada", gravidade: 2, tarefa_id: "t2", obra_id: "o1", obra_codigo: "OB-2026-00001",
    obra_titulo: "Remodelação WC", tarefa_nome: "Remoção de entulho", pessoas: ["u-tec"], pessoas_nomes: ["Tiago Técnico"],
    desde: agora.toISOString(), minutos_atraso: 90, detalhe: "Devia ter começado a 02/10 às 08:00", atraso_id: null,
  },
  {
    tipo: "cliente_por_avisar", gravidade: 3, tarefa_id: "t1", obra_id: "o1", obra_codigo: "OB-2026-00001",
    obra_titulo: "Remodelação WC", tarefa_nome: "Demolição de revestimentos", pessoas: ["u-tec"], pessoas_nomes: ["Tiago Técnico"],
    desde: agora.toISOString(), minutos_atraso: 480, detalhe: "Acesso / cliente: sem chave da porta · novo fim 05/10", atraso_id: "a1",
  },
];

const ATRASOS = [
  {
    id: "a1", obra_id: "o1", tarefa_id: "t1", motivo: "secagem", contexto: "Parede ainda húmida",
    minutos_extra: 480, novo_fim: hoje, fim_anterior: hoje, registado_por: "u-tec", registado_em: agora.toISOString(),
    cliente_avisado: false, cliente_avisado_em: null, cliente_avisado_por: null, nota_cliente: null,
  },
];

const tarefaPrevista = (id: string, nome: string, p: Record<string, unknown> = {}) => ({
  id,
  ordem: 1000 + Number(id.replace(/\D/g, "") || 1),
  linha_id: "l1",
  servico_id: "s1",
  servico_tarefa_id: null,
  do_tipo: false,
  nome,
  fase: 2,
  minutos: 30,
  pessoas_previstas: 1,
  skill_id: null,
  skill_nome: "Eletricidade",
  depende: [] as string[],
  procedimento: null,
  materiais: null,
  ferramentas: null,
  materiais_crm: [],
  inicio: hoje,
  fim: hoje,
  pessoas: ["u-tec"],
  livres: ["u-tec"],
  ocupados: [] as { utilizador_id: string; motivo: string | null }[],
  ...p,
});

const PREVISAO_CONTRATO = {
  orcamento_id: "q2",
  inicio: hoje,
  minutos: 150,
  outras: [],
  produtos: [],
  servicos: [
    {
      linha_id: "l1",
      servico_id: "s1",
      nome: "Tomadas",
      descricao: null,
      categoria: null,
      quantidade: 6,
      unidade: "un",
      sugerido: true,
      com_modelo: false,
      sem_ficha: false,
      materiais_ficha: [{ produto_id: "pTom", nome: "Tomada schuko", quantidade: 6, origem: "ficha" }],
      tarefas: [
        // Nesse dia, o técnico está de férias: aparece indisponível, com o motivo.
        tarefaPrevista("t1", "Tomadas: Marcar traçado", {
          pessoas: [],
          livres: [],
          ocupados: [{ utilizador_id: "u-tec", motivo: "ausência: Férias" }],
        }),
        tarefaPrevista("t2", "Tomadas: Passar cabos", { minutos: 90, materiais: "Tomada × 1 /un", depende: ["t1"] }),
        tarefaPrevista("t3", "Tomadas: Ensaio", { depende: ["t2"] }),
      ],
    },
  ],
};

vi.mock("../../lib/dados", () => ({
  ErroDeDados: class extends Error {},
  ErroDeEscrita: class extends Error {},
  listarClientes: vi.fn(async () => [{ id: "c1", nome: "Cliente Lda" }]),
  listarEquipa: vi.fn(async () => [
    { utilizador_id: "u-tec", nome: "Tiago Técnico", email: "t@x", funcao: "tecnico" },
    { utilizador_id: "u-s", nome: "Sara Supervisora", email: "s@x", funcao: "supervisor" },
    { utilizador_id: "u-g", nome: "Gil Gestor", email: "g@x", funcao: "gestor" },
  ]),
  listarOrcamentos: vi.fn(async () => [
    {
      id: "q2",
      numero: "ORC-9",
      titulo: "WC suite",
      cliente_id: "c1",
      obra_endereco: "Rua Y",
      total: 4500,
      custo_previsto: 2000,
      linhas: 3,
      tem_obra: false,
    },
  ]),
}));

vi.mock("../../lib/obras", () => ({
  listarObras: vi.fn(async () => [OBRA]),
  obterObra: vi.fn(async () => OBRA),
  areasDaVisitaDoOrcamento: vi.fn(async () => []),
  alertasDaOrganizacao: vi.fn(async () => [
    {
      tarefa_id: "t1",
      obra_id: "o1",
      obra_codigo: "OB-2026-00001",
      nome: "Demolição",
      estado: "em_curso",
      minutos_previstos: 300,
      minutos_reais: 250,
      a_correr: 1,
      nivel: "aviso",
    },
  ]),
  fasesDaObra: vi.fn(async () => [
    { id: "f1", obra_id: "o1", ordem: 1, nome: "Preparação e demolições" },
    { id: "f2", obra_id: "o1", ordem: 2, nome: "Instalações técnicas" },
  ]),
  tarefasDaObra: vi.fn(async () => TAREFAS),
  conflitosDaObra: vi.fn(async () => [
    {
      tarefa_id: "t2",
      utilizador_id: "u-tec",
      outra_tarefa_id: "x",
      outra_tarefa: "Pintura",
      outra_obra: "OB-2026-00002",
      outro_inicio: hoje,
      outro_fim: hoje,
    },
  ]),
  extrasDaObra: vi.fn(async () => [
    {
      id: "e1",
      obra_id: "o1",
      tarefa_id: "t1",
      descricao: "Tubagem podre",
      valor_estimado: 180,
      fotos: [],
      estado: "registado",
      motivo_recusa: null,
      registado_por: "u-tec",
      registado_em: agora.toISOString(),
      decidido_em: null,
      enviado_em: null,
    },
  ]),
  custosDaObra: vi.fn(async () => ({
    obra_id: "o1",
    ve_custos: true,
    minutos_previstos: 900,
    minutos_reais: 680,
    por_fase: [{ fase_id: "f1", ordem: 1, nome: "Preparação", minutos_previstos: 420, minutos_reais: 280 }],
    por_pessoa: [{ utilizador_id: "u-tec", nome: "Tiago Técnico", minutos: 680, custo: 226.67, sem_tarifa: false }],
    custo_previsto: 300,
    custo_real: 226.67,
    sem_tarifa: 0,
    orcado_mao_obra: 800,
  })),
  minhasTarefas: vi.fn(async () => TAREFAS),
  meuRegistoAberto: vi.fn(async () => ({
    id: "r1",
    obra_id: "o1",
    tarefa_id: "t1",
    utilizador_id: "u-tec",
    inicio: new Date(Date.now() - 3600_000).toISOString(),
    fim: null,
  })),
  registosDasTarefas: vi.fn(async () => [
    {
      id: "r0",
      obra_id: "o1",
      tarefa_id: "t3",
      utilizador_id: "u-tec",
      inicio: new Date(Date.now() - 8 * 3600_000).toISOString(),
      fim: new Date(Date.now() - 1 * 3600_000).toISOString(),
    },
  ]),
  tarefasPorValidar: vi.fn(async () => TAREFAS.filter((t) => t.estado === "feita")),
  tarefasTerminadas: vi.fn(async () => TAREFAS.filter((t) => t.estado === "feita")),
  listarModelos: vi.fn(async () => [
    {
      id: "m",
      nome: "Remodelação casa de banho",
      descricao: null,
      tipo_servico: "remodelacao",
      ativo: true,
      fases: [
        {
          id: "mf1",
          ordem: 1,
          nome: "Preparação e demolições",
          tarefas: [
            {
              id: "mt1",
              modelo_fase_id: "mf1",
              ordem: 1,
              nome: "Proteção",
              procedimento: null,
              materiais: null,
              ferramentas: null,
              minutos_previstos: 60,
            },
          ],
        },
      ],
    },
  ]),
  listarContratos: vi.fn(async () => ({ contratos: [], indisponivel: false })),
  orcamentosComObra: vi.fn(async () => new Set<string>()),
  moradaSugerida: vi.fn(async () => "Rua do Cliente 7, Lisboa"),
  previsaoDoOrcamento: vi.fn(async () => ({
    orcamento_id: "q2",
    minutos: 840,
    sem_ficha: 1,
    tarefas: [
      { fase: 1, nome: "Remoção de azulejo", minutos: 600, sem_ficha: false, materiais: null },
      { fase: 2, nome: "Base de duche", minutos: 180, sem_ficha: false, materiais: "Cimento cola × 2" },
      { fase: 3, nome: "Pintura de tetos", minutos: 60, sem_ficha: true, materiais: null },
    ],
  })),
  previsaoDoContrato: vi.fn(async () => PREVISAO_CONTRATO),
  stockDosProdutos: vi.fn(async () => ({
    com_inventario: true,
    produtos: [
      { produto_id: "pTom", nome: "Tomada schuko", sku: "T1", unidade: "un", gere_stock: true, stock: 4, reservado: 1, disponivel: 3 },
    ],
  })),
  pessoasLivres: vi.fn(async () => []),
  gravarDependencias: vi.fn(async () => ({ ok: true, dependencias: [], antes_de_acabar: [] })),
  iniciarTarefa: vi.fn(),
  terminarTarefa: vi.fn(async () => ({ ok: true })),
  validarTarefa: vi.fn(async () => ({ ok: true })),
  planearTarefa: vi.fn(async () => ({ ok: true, conflitos: [] })),
  semearModeloExemplo: vi.fn(),
  gravarModelo: vi.fn(),
  criarObra: vi.fn(),
  atualizarObra: vi.fn(),
  mudarEstadoObra: vi.fn(),
  replanearObra: vi.fn(),
  distribuirEquipa: vi.fn(async () => ({ ok: true, tarefas: 3 })),
  ritmosAprendidos: vi.fn(async () => []),
  semearTemposPadrao: vi.fn(async () => ({ ok: true, versao: "x", servicos: 0, passos: 0, saltados: [], nao_encontrados: [] })),
  listarServicosComModelo: vi.fn(async () => [
    {
      servico_id: "s1",
      nome: "Base de duche",
      sku: "SRV-1",
      categoria: "Canalização",
      horas: 3,
      pessoas: 1,
      descricao_mao_obra: null,
      editado: false,
      tarefas: [
        { nome: "Abrir roços", fase: 2, minutos_por_unidade: 45, minutos_fixos: 0, pessoas: 1, skill_id: "k1", depende_ordem: null, procedimento: null, materiais: null, ferramentas: null },
        { nome: "Instalar", fase: 2, minutos_por_unidade: 90, minutos_fixos: 30, pessoas: 1, skill_id: "k1", depende_ordem: 1, procedimento: null, materiais: null, ferramentas: null },
      ],
    },
    { servico_id: "s2", nome: "Pintura de tetos", sku: null, categoria: "Pinturas", horas: null, pessoas: null, descricao_mao_obra: null, editado: false, tarefas: [] },
  ]),
  listarSkills: vi.fn(async () => [{ id: "k1", nome: "Canalização" }]),
  sugerirModelos: vi.fn(async () => ({ ok: true, servicos: 1, tarefas: 5 })),
  gravarModeloServico: vi.fn(async () => ({ ok: true, tarefas: 2 })),
  criarSkill: vi.fn(),
  tornarTipoPorDefeito: vi.fn(async () => ({ ok: true })),
  renomearFase: vi.fn(),
  gravarTarefa: vi.fn(),
  apagarTarefa: vi.fn(),
  atribuirTarefa: vi.fn(),
  registarExtra: vi.fn(),
  decidirExtra: vi.fn(),
  // Atrasos e alertas do supervisor.
  EVENTO_ALERTAS: "ops:alertas-mudaram",
  avisarAlertasMudaram: vi.fn(),
  avisoBancada: vi.fn(async () => null),
  sincronizarAvisos: vi.fn(async () => undefined),
  alertasDeSupervisao: vi.fn(async () => ALERTAS),
  atrasosDaObra: vi.fn(async () => ATRASOS),
  obterTarefa: vi.fn(async (id: string) => TAREFAS.find((t) => t.id === id) ?? null),
  registarAtraso: vi.fn(async () => ({
    ok: true, simulado: false, atraso_id: "a9", fim_anterior: hoje, novo_fim: hoje, minutos_estimativa: 420,
    empurradas: [], fim_obra_anterior: hoje, fim_obra_novo: hoje,
  })),
  simularAtraso: vi.fn(async () => ({
    ok: true, simulado: true, atraso_id: null, fim_anterior: hoje, novo_fim: hoje, minutos_estimativa: 420,
    empurradas: [], fim_obra_anterior: hoje, fim_obra_novo: hoje,
  })),
  marcarClienteAvisado: vi.fn(async () => ({ ok: true, ja_avisado: false })),
}));

import Obras from "../Obras";
import ObraDetalhe from "../ObraDetalhe";
import MinhasTarefas from "../MinhasTarefas";
import Validar from "../Validar";
import ObraMetricas from "../ObraMetricas";
import ObraModelos from "../ObraModelos";
import * as obras from "../../lib/obras";

function em(rota: string, elemento: JSX.Element, caminho = rota) {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path={caminho} element={elemento} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  auth.funcao = "gestor";
  auth.businessUserId = "u-tec";
});

describe("páginas de Obras (fumo)", () => {
  it("Obras: lista, alerta e Nova obra para o gestor", async () => {
    em("/obras", <Obras />);
    expect(await screen.findByText("Remodelação WC")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Nova obra"));
    expect(await screen.findByText(/ORC-9 · WC suite/)).toBeInTheDocument();
  });

  it("Nova obra: escolher o orçamento mostra as tarefas que os serviços vão gerar", async () => {
    em("/obras", <Obras />);
    fireEvent.click(await screen.findByText("Nova obra"));
    fireEvent.click(await screen.findByText(/ORC-9 · WC suite/));
    expect(await screen.findByText("Remoção de azulejo")).toBeInTheDocument();
    expect(screen.getByText(/3 tarefas/)).toBeInTheDocument();
    expect(screen.getByText(/1 serviço sem modelo nem horas na ficha técnica/)).toBeInTheDocument();
    expect(screen.getByText("(sem ficha)")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Rua do Cliente 7, Lisboa")).toBeInTheDocument();
  });

  it("Nova obra, passo 2: os serviços do contrato, editáveis, e 'Abrir obra' grava as tarefas", async () => {
    vi.mocked(obras.criarObra).mockResolvedValueOnce({ ok: true, id: "o9", codigo: "OB-2026-00009", tarefas: 2 });
    em("/obras", <Obras />);
    fireEvent.click(await screen.findByText("Nova obra"));
    fireEvent.click(await screen.findByText(/ORC-9 · WC suite/));
    fireEvent.click(await screen.findByText("Seguinte"));

    expect(await screen.findByText("Tomadas")).toBeInTheDocument();
    expect(screen.getByText("sugestão automática")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Tomadas: Passar cabos")).toBeInTheDocument();
    // Quem está de férias nesse dia não se escolhe — e vê-se porquê.
    const indisponivel = screen.getByRole("option", { name: /Tiago Técnico — indisponível: ausência: Férias/ });
    expect(indisponivel).toBeDisabled();
    // Os materiais da ficha (6 tomadas) contra o stock (3 disponíveis).
    expect((await screen.findAllByText(/faltam 3 un — encomendar/)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByLabelText("Tirar a tarefa")[0]);
    fireEvent.click(screen.getByText("Abrir obra"));
    await waitFor(() => expect(obras.criarObra).toHaveBeenCalled());
    const chamadas = vi.mocked(obras.criarObra).mock.calls;
    const args = chamadas[chamadas.length - 1][0];
    expect(args.orcamentoId).toBe("q2");
    expect(args.tarefas?.map((t) => t.nome)).toEqual(["Tomadas: Passar cabos", "Tomadas: Ensaio"]);
    expect(args.tarefas?.[0]).toMatchObject({ pessoas: ["u-tec"], depende: [], minutos: 90 });
    expect(args.tarefas?.[1].depende).toEqual([1]);
    expect(args.tarefas?.[0].materiais_crm[0]).toMatchObject({ produto_id: "pTom", quantidade: 6, disponivel: 3 });
  });

  it("Obras: o técnico não vê Nova obra nem Validar", async () => {
    auth.funcao = "tecnico";
    em("/obras", <Obras />);
    expect(await screen.findByText("Remodelação WC")).toBeInTheDocument();
    expect(screen.queryByText("Nova obra")).not.toBeInTheDocument();
    expect(screen.queryByText("Validar")).not.toBeInTheDocument();
  });

  it("Obra: Gantt, previsto vs real e extras", async () => {
    em("/obras/OB-2026-00001", <ObraDetalhe />, "/obras/:codigo");
    expect(await screen.findByText("1. Preparação e demolições")).toBeInTheDocument();
    expect(screen.getAllByText("Demolição de revestimentos").length).toBeGreaterThan(0);
    expect(screen.getByText(/alguém que está noutra obra/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Previsto vs real"));
    expect(await screen.findByText("Mão de obra")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Trabalhos extra/));
    expect(await screen.findByText("Tubagem podre")).toBeInTheDocument();
    expect(screen.getByText("Aprovar")).toBeInTheDocument();
  });

  it("Obra: abrir uma tarefa mostra a ficha editável ao gestor, com o choque", async () => {
    em("/obras/OB-2026-00001", <ObraDetalhe />, "/obras/:codigo");
    fireEvent.click(await screen.findByText("Remoção de entulho"));
    expect(await screen.findByText("Quem faz")).toBeInTheDocument();
    expect(screen.getByText("Choque de agenda")).toBeInTheDocument();
  });

  it("Minhas tarefas: relógio a correr, alerta a ≥ 80 % e botões grandes", async () => {
    auth.funcao = "tecnico";
    em("/minhas-tarefas", <MinhasTarefas />);
    expect(await screen.findByText("A correr")).toBeInTheDocument();
    expect(screen.getByText("Perto do previsto")).toBeInTheDocument();
    expect(screen.getByText("Pausar")).toBeInTheDocument();
    expect(screen.getByText("Para refazer")).toBeInTheDocument();
    expect(screen.getByText(/Ficou mancha/)).toBeInTheDocument();
  });

  it("Minhas tarefas: terminar dentro da tolerância é um toque", async () => {
    auth.funcao = "tecnico";
    em("/minhas-tarefas", <MinhasTarefas />);
    fireEvent.click(await screen.findByText("Terminar"));
    await waitFor(() =>
      expect(obras.terminarTarefa).toHaveBeenCalledWith({ tarefaId: "t1", concluir: true, motivo: null, nota: null })
    );
  });

  it("Validar: a fila do supervisor", async () => {
    auth.funcao = "supervisor";
    auth.businessUserId = "u-s";
    em("/validar", <Validar />);
    // Linha compacta + detalhe aberto da 1.ª (telemóvel): o nome aparece nos dois.
    expect((await screen.findAllByText("Canalização")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Secagem/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Validar" }));
    await waitFor(() => expect(obras.validarTarefa).toHaveBeenCalledWith("t3", true, undefined));
  });

  it("Validar: por obra, filtros e 'Validar todas' (só as que posso)", async () => {
    auth.funcao = "supervisor";
    auth.businessUserId = "u-s";
    const feita = TAREFAS.find((t) => t.estado === "feita")!;
    vi.mocked(obras.tarefasPorValidar).mockResolvedValueOnce([
      feita,
      { ...feita, id: "t5", nome: "Assentamento de loiças", motivo_desvio: null, minutos_reais: 30, minutos_previstos: 60 },
    ]);
    em("/validar", <Validar />);
    expect(await screen.findByRole("button", { name: "Com desvio · 1" })).toBeInTheDocument();
    expect(screen.getByText("2 de 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Com desvio · 1" }));
    expect(screen.getByText("1 de 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    fireEvent.click(screen.getByRole("button", { name: /Validar todas \(2\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Validar todas" }));
    await waitFor(() => expect(obras.validarTarefa).toHaveBeenCalledWith("t5", true));
    expect(obras.validarTarefa).toHaveBeenCalledWith("t3", true);
  });

  it("Validar: quem fez a tarefa não a pode validar", async () => {
    auth.funcao = "gestor";
    em("/validar", <Validar />);
    expect(await screen.findByText(/a validação tem de ser de outra pessoa/)).toBeInTheDocument();
  });

  it("Validar: alertas no topo, o pior primeiro, com 'Cliente avisado'", async () => {
    auth.funcao = "supervisor";
    auth.businessUserId = "u-s";
    const { container } = em("/validar", <Validar />);
    // Os alertas têm o seu separador, para não empurrarem a fila.
    fireEvent.click(await screen.findByRole("tab", { name: "Alertas · 3" }));
    expect(await screen.findByText("1 tarefa passou do fim previsto")).toBeInTheDocument();
    expect(screen.getByText("1 tarefa não iniciada a tempo")).toBeInTheDocument();
    expect(screen.getByText("1 atraso por avisar ao cliente")).toBeInTheDocument();
    const tipos = [...container.querySelectorAll("[data-alerta]")].map((e) => e.getAttribute("data-alerta"));
    expect(tipos).toEqual(["fim_ultrapassado", "nao_iniciada", "cliente_por_avisar"]);
    fireEvent.click(screen.getByRole("button", { name: "Cliente avisado" }));
    fireEvent.change(screen.getByPlaceholderText(/liguei à D. Maria/), { target: { value: "Liguei ao cliente" } });
    fireEvent.click(screen.getByRole("button", { name: "Marcar como avisado" }));
    await waitFor(() => expect(obras.marcarClienteAvisado).toHaveBeenCalledWith("a1", "Liguei ao cliente"));
  });

  it("Obra: fim original vs revisto, 'Avisar o cliente' e o Gantt recebe o plano original", async () => {
    vi.mocked(obras.obterObra).mockResolvedValueOnce({ ...OBRA, fim_planeado: "2026-10-09", fim_original: "2026-10-06", n_alertas: 2 } as never);
    vi.mocked(obras.tarefasDaObra).mockResolvedValueOnce([
      { ...TAREFAS[0], inicio_original: "2026-10-01", fim_original: "2026-10-01", n_atrasos: 1,
        ultimo_atraso: { ...ATRASOS[0], motivo: "secagem" } as never, atrasada_inicio: false },
      ...TAREFAS.slice(1),
    ]);
    em("/obras/OB-2026-00001", <ObraDetalhe />, "/obras/:codigo");
    expect(await screen.findByText(/original 06\/10\/2026, \+3 dias úteis/)).toBeInTheDocument();
    expect(screen.getByTestId("avisar-cliente")).toHaveTextContent("Parede ainda húmida");
    expect(screen.getByText("2 alertas")).toBeInTheDocument();
  });

  it("Minhas tarefas: 'Vai atrasar' abre a folha e regista com contexto", async () => {
    auth.funcao = "tecnico";
    em("/minhas-tarefas", <MinhasTarefas />);
    fireEvent.click(await screen.findByText("Remoção de entulho"));
    // A que está a correr está sempre aberta: a 2.ª "Vai atrasar" é a da tarefa aberta agora.
    const vai = screen.getAllByText(/Vai atrasar/);
    fireEvent.click(vai[vai.length - 1]);
    expect(await screen.findByText("Mais quanto tempo?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Material em falta" }));
    fireEvent.change(screen.getByPlaceholderText(/betonilha/), { target: { value: "Falta o cimento cola" } });
    fireEvent.change(screen.getByLabelText("Quanto tempo a mais"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Registar atraso" }));
    await waitFor(() =>
      expect(obras.registarAtraso).toHaveBeenCalledWith({
        tarefaId: "t2", motivo: "material_em_falta", contexto: "Falta o cimento cola",
        minutosExtra: 120, novoFim: null, empurrar: true,
      })
    );
    expect(await screen.findByText(/Atraso registado: "Remoção de entulho"/)).toBeInTheDocument();
  });

  it("Validar: o técnico é mandado embora", () => {
    auth.funcao = "tecnico";
    em("/validar", <Validar />);
    expect(screen.getByText(/supervisor de obra ou o gestor/)).toBeInTheDocument();
  });

  it("Métricas e Modelos montam", async () => {
    em("/obras/metricas", <ObraMetricas />);
    expect(await screen.findByText("Por tarefa — o default está certo?")).toBeInTheDocument();
    em("/obras/modelos", <ObraModelos />);
    fireEvent.click(await screen.findByText("Tipos de obra"));
    expect(await screen.findByText("Remodelação casa de banho")).toBeInTheDocument();
  });

  it("Modelos → Serviços: lista com o estado do modelo, e o editor com os passos", async () => {
    em("/obras/modelos", <ObraModelos />);
    expect(await screen.findByText("Base de duche")).toBeInTheDocument();
    expect(screen.getByText("sem modelo")).toBeInTheDocument();
    expect(screen.getByText(/2 passos/)).toBeInTheDocument();
    expect(screen.getByText(/Gerar sugestões para 1 sem modelo/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Base de duche"));
    expect(await screen.findByDisplayValue("Abrir roços")).toBeInTheDocument();
    expect(screen.getByText(/de trabalho \(pessoa × tempo\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Gravar modelo"));
    await waitFor(() => expect(obras.gravarModeloServico).toHaveBeenCalled());
    const [, servico, tarefas] = vi.mocked(obras.gravarModeloServico).mock.calls[0];
    expect(servico).toBe("s1");
    expect(tarefas[1]).toMatchObject({ nome: "Instalar", depende_ordem: 1, minutos_fixos: 30, skill_id: "k1" });
  });
});
