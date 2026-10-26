// O Pipeline real com a ficha REAL (FichaReal sem simulação): abrir um cartão põe a ficha no lugar do quadro, dentro da página, e o quadro fica montado mas
// escondido. A ligação «← Pipeline», o Esc e o botão «atrás» do browser voltam ao quadro tal como estava, com o foco no cartão.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { fichaDb, pessoaDb } from "@/hooks/pessoas/fichaFabrica";
import type { FiltrosQuadro } from "@/hooks/pessoas/quadroPessoasTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { cartaoQuadro, quadroBase } from "./fabricaQuadro";
import { PipelineReal } from "./PipelineReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/components/pessoas-leads/NovaLeadReal", () => ({ NovaLeadReal: () => null }));
vi.mock("@/components/pessoas-workflow/BotaoWorkflowPessoas", () => ({ BotaoWorkflowPessoas: () => null }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => false, hasAnyPermission: () => false, permissions: [], loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
const quadroMock = vi.hoisted(() => vi.fn());
const fichaMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/useListaPessoas", () => ({ useListaPessoas: () => ({}) }));
vi.mock("@/hooks/pessoas/useQuadroPessoas", () => ({ useQuadroPessoas: (f: FiltrosQuadro, ativo?: boolean) => quadroMock(f, ativo) }));
vi.mock("@/hooks/pessoas/useFichaPessoa", () => ({ useFichaPessoa: (id: string | null) => fichaMock(id) }));
vi.mock("@/hooks/pessoas/useAcoesFichaReal", () => ({
  useAcoesFichaReal: () => ({
    registarChamada: vi.fn(), adiar: vi.fn(), encerrar: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn(), registarResultadoVisita: vi.fn(),
    capacidades: { chamada: true, encerrar: true, adiar: false, nota: false, visita: false, negocios: false },
  }),
}));
vi.mock("@/hooks/pessoas/useSubmissoesPessoa", () => ({ useSubmissoesPessoa: () => ({ submissoes: [], pendentes: 0, estado: "ok", recarregar: () => undefined }) }));
vi.mock("@/hooks/pessoas/useGuardarIdentidadePessoa", () => ({ useGuardarIdentidadePessoa: () => ({ guardar: async () => ({}) }) }));
vi.mock("@/hooks/pessoas/useGuardarContactoPessoa", () => ({ useGuardarContactoPessoa: () => ({ guardar: async () => ({}) }) }));
vi.mock("@/hooks/pessoas/useSubstituirContactoPessoa", () => ({ useSubstituirContactoPessoa: () => ({ guardar: async () => ({}) }) }));
vi.mock("@/hooks/pessoas/useQualificarLeadPessoa", () => ({ useQualificarLeadPessoa: () => ({ classificar: async () => ({}) }) }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/pessoas/AvatarPessoa", () => ({ AvatarPessoa: () => null }));

beforeAll(prepararRadixNoJsdom);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null };
const CARTOES = [cartaoQuadro(A, { nome: "Ana Lopes", pessoaId: A }), cartaoQuadro(B, { nome: "Bruno Reis", pessoaId: B, coluna: "visita" })];

const fichaDe = (id: string, nome: string) => ({
  ficha: fichaDb({ pessoa: pessoaDb({ id, nome }) }), estado: "ok", erro: null, carregarMais: vi.fn(), aCarregarMais: false, carregandoTipos: [], errosMais: {},
  atualizacaoFalhou: false, erroAoCarregarMais: null, recarregar: vi.fn(),
});
const semFicha = { ...fichaDe(A, "x"), ficha: null, estado: "indisponivel" };

function Local() {
  const l = useLocation();
  return <output data-testid="url">{`${l.pathname}${l.search}`}</output>;
}
function Atras() {
  const navegar = useNavigate();
  return <button type="button" onClick={() => navegar(-1)}>atrás do browser</button>;
}
const url = () => screen.getByTestId("url").textContent;
const ficha = (nome: string) => screen.queryByRole("region", { name: nome });
const quadroEscondido = () => document.querySelector("[data-pagina-escondida]")?.hasAttribute("hidden");

function desenhar(inicial = "/pipeline") {
  return render(
    <FontePessoasContext.Provider value={REAL}>
      <MemoryRouter initialEntries={[inicial]}><main data-testid="main"><PipelineReal /></main><Local /><Atras /></MemoryRouter>
    </FontePessoasContext.Provider>,
  );
}

beforeEach(() => {
  quadroMock.mockReset().mockReturnValue(quadroBase({}, CARTOES));
  fichaMock.mockReset();
  fichaMock.mockImplementation((id: string | null) => (id === A ? fichaDe(A, "Ana Lopes") : id === B ? fichaDe(B, "Bruno Reis") : semFicha));
});

describe("PipelineReal: a ficha toma o lugar do quadro", () => {
  it("abrir um cartão esconde o quadro (montado) e mostra a ficha com a ligação «← Pipeline»; a ligação repõe o quadro sem o refazer e devolve o foco ao cartão", async () => {
    desenhar();
    const quadro = document.querySelector("[data-pagina-escondida]") as HTMLElement;
    const cartao = screen.getByRole("button", { name: "Abrir a ficha de Ana Lopes" });
    cartao.focus();
    fireEvent.click(cartao);
    expect(url()).toBe(`/pipeline?open=${A}`);
    expect(quadroEscondido()).toBe(true);
    expect(document.querySelector("[data-pagina-escondida]")).toBe(quadro); // o mesmo elemento: nada foi desmontado
    expect(ficha("Ana Lopes")).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao Pipeline" }));
    await waitFor(() => expect(url()).toBe("/pipeline"));
    expect(quadroEscondido()).toBe(false);
    expect(ficha("Ana Lopes")).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Abrir a ficha de Ana Lopes" })).toHaveFocus());
  });

  it("com a ficha aberta, as teclas do quadro (j, k, setas, o, /) lançadas no documento não movem o foco nem abrem nada", () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir a ficha de Ana Lopes" }));
    const foco = document.activeElement;
    for (const key of ["j", "k", "ArrowDown", "ArrowRight", "o", "/"]) fireEvent.keyDown(document.body, { key });
    expect(document.activeElement).toBe(foco);
    expect(url()).toBe(`/pipeline?open=${A}`);
  });

  it("o botão «atrás» do browser fecha a ficha e deixa o quadro visível", async () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir a ficha de Ana Lopes" }));
    expect(quadroEscondido()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "atrás do browser", hidden: true }));
    await waitFor(() => expect(url()).toBe("/pipeline"));
    expect(quadroEscondido()).toBe(false);
    expect(ficha("Ana Lopes")).toBeNull();
  });

  it("um ?open= vindo de fora (ligação) abre a ficha na página e, ao fechar, limpa o ?open=", async () => {
    desenhar(`/pipeline?open=${A}`);
    expect(ficha("Ana Lopes")).not.toBeNull();
    expect(quadroEscondido()).toBe(true);
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(url()).toBe("/pipeline"));
    expect(quadroEscondido()).toBe(false);
  });

  it("a tecla ] passa à pessoa seguinte do quadro sem repor o quadro", async () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir a ficha de Ana Lopes" }));
    fireEvent.keyDown(document.body, { key: "]" });
    await waitFor(() => expect(url()).toBe(`/pipeline?open=${B}`));
    expect(await screen.findByRole("region", { name: "Bruno Reis" })).toBeInTheDocument();
    expect(quadroEscondido()).toBe(true);
  });
});
