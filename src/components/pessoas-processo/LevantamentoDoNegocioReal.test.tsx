// «Fazer o levantamento» de um NEGÓCIO, sem sair da ficha: o painel «Visita e levantamento» abre sobre a pessoa mas grava ligado ao negócio
// (neg_guardar_levantamento com p_negocio_id), sempre um levantamento novo (nunca reescreve o que a pessoa já tinha por ligar). O Supabase está simulado.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fichaDb, levantamentoDb, PESSOA_ID, seccaoDb } from "@/hooks/pessoas/fichaFabrica";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { respostaOk, rpcMock } from "@/hooks/pessoas/fichaTestUtil";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { QUESTIONARIO_BRUTO } from "@/hooks/pessoas/workflow/questionarioTestUtil";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { LevantamentoDoNegocioProvider, useLevantamentoDoNegocio } from "./LevantamentoDoNegocioReal";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpcMock(...a) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/pessoas/useAgendaVisita", async (importar) => ({
  ...(await importar<typeof import("@/hooks/pessoas/useAgendaVisita")>()),
  useAgendaVisita: () => ({ quadros: [], recursos: [], isLoading: false, isError: false, refetch: vi.fn(), omissao: { boardId: "q1", recursoId: "r1" } }),
}));

beforeAll(async () => {
  prepararRadixNoJsdom();
  await import("./PainelVisitaLevantamentoReal");
}, 60_000);
afterEach(cleanup);

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: "manual" };
const NEGOCIO = "n-1";
const TITULO = "Visita e levantamento de Ana Lopes";
const GUARDAR = "Guardar a visita e o levantamento";

function Consumidor() {
  const levantamento = useLevantamentoDoNegocio();
  return (
    <>
      <span data-testid="pode">{String(levantamento?.pode)}</span>
      <button type="button" onClick={(e) => levantamento?.abrir(NEGOCIO, e.currentTarget)}>abrir levantamento</button>
    </>
  );
}

const montar = (ficha: FichaDb | null, fonte: FontePessoas = REAL) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <FontePessoasContext.Provider value={fonte}>
      <LevantamentoDoNegocioProvider ficha={ficha}><Consumidor /></LevantamentoDoNegocioProvider>
    </FontePessoasContext.Provider>
  </QueryClientProvider>,
);

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockImplementation((nome: string) => {
    if (nome === "neg_questionario_levantamento") return respostaOk(QUESTIONARIO_BRUTO);
    if (nome === "neg_guardar_levantamento") return respostaOk({ levantamento_id: "lev-novo", criado: true, mudou: true, ligado_a: NEGOCIO, versao_questionario: 7, questionario_mudou: false });
    return respostaOk({ mudou: true });
  });
});

const abrir = async (): Promise<HTMLElement> => {
  fireEvent.click(screen.getByRole("button", { name: "abrir levantamento" }));
  const d = await screen.findByRole("dialog", { name: TITULO }, { timeout: 8000 });
  await waitFor(() => expect(within(d).getByRole("button", { name: GUARDAR })).not.toHaveAttribute("aria-disabled"));
  return d;
};

describe("levantamento de um negócio dentro da ficha", () => {
  it("grava ligado ao negócio e à pessoa, e fecha o painel", async () => {
    montar(fichaDb());
    const d = await abrir();
    fireEvent.click(within(d).getByRole("button", { name: /^Medidas/ }));
    fireEvent.change(await within(d).findByLabelText(/Observações/), { target: { value: "casa de banho a refazer" } });
    fireEvent.click(within(d).getByRole("button", { name: GUARDAR }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: TITULO })).toBeNull());
    const [chamada] = rpcMock.mock.calls.filter((c) => c[0] === "neg_guardar_levantamento");
    expect(chamada[1]).toMatchObject({ p_entity_id: PESSOA_ID, p_negocio_id: NEGOCIO, p_dados: { notas: "casa de banho a refazer" } });
  });

  it("abre sem o levantamento por ligar da pessoa e grava um novo, sem reescrever o antigo", async () => {
    const ficha = fichaDb({ levantamentos: seccaoDb([levantamentoDb({ id: "lev-livre", data: "2026-10-22", notas: "obs antigas" })]) });
    montar(ficha);
    const d = await abrir();
    fireEvent.click(within(d).getByRole("button", { name: /^Medidas/ }));
    const observacoes = await within(d).findByLabelText(/Observações/);
    expect(observacoes).toHaveValue("");
    fireEvent.change(observacoes, { target: { value: "obs do negócio" } });
    fireEvent.click(within(d).getByRole("button", { name: GUARDAR }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: TITULO })).toBeNull());
    const [chamada] = rpcMock.mock.calls.filter((c) => c[0] === "neg_guardar_levantamento");
    expect(chamada[1]).toMatchObject({ p_negocio_id: NEGOCIO });
    expect((chamada[1] as { p_id: string }).p_id).not.toBe("lev-livre");
  });

  it("sem permissão para editar a ficha (ou fora da base) diz que não pode e não abre nada", () => {
    montar(fichaDb({ permissoes: { editar: false, criar: true } }));
    expect(screen.getByTestId("pode")).toHaveTextContent("false");
    fireEvent.click(screen.getByRole("button", { name: "abrir levantamento" }));
    expect(screen.queryByRole("dialog", { name: TITULO })).toBeNull();
    cleanup();
    montar(fichaDb(), { modo: "exemplo" });
    expect(screen.getByTestId("pode")).toHaveTextContent("false");
  });

  it("sem ficha não há levantamento a abrir", () => {
    montar(null);
    expect(screen.getByTestId("pode")).toHaveTextContent("undefined");
  });
});
