// A ficha real na página: o conteúdo da página (o quadro ou a lista) fica montado mas escondido enquanto a ficha está aberta, e volta tal como estava.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useState, type MutableRefObject } from "react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { agregadosDb, contactoDb, fichaDb, seccaoDb } from "@/hooks/pessoas/fichaFabrica";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { ComClienteQuery } from "@/test/clienteQueryTeste";
import { FichaReal } from "./FichaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
const fichaMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/useFichaPessoa", () => ({ useFichaPessoa: (id: string | null) => fichaMock(id) }));
vi.mock("@/hooks/pessoas/useAcoesFichaReal", () => ({
  useAcoesFichaReal: () => ({
    registarChamada: vi.fn(), adiar: vi.fn(), encerrar: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn(), registarResultadoVisita: vi.fn(),
    capacidades: { chamada: true, encerrar: true, adiar: false, nota: false, visita: false, negocios: false },
  }),
}));
vi.mock("@/hooks/pessoas/useSubmissoesPessoa", () => ({ useSubmissoesPessoa: () => ({ submissoes: [], pendentes: 0, estado: "ok", recarregar: () => undefined }) }));
vi.mock("@/hooks/pessoas/useGuardarIdentidadePessoa", () => ({ useGuardarIdentidadePessoa: () => ({ guardar: async () => ({}) }) }));
vi.mock("@/hooks/pessoas/useGuardarContactoPessoa", async (original) => ({ ...(await original<object>()), useGuardarContactoPessoa: () => ({ guardar: async () => ({}) }) }));
vi.mock("@/hooks/pessoas/useSubstituirContactoPessoa", () => ({ useSubstituirContactoPessoa: () => ({ guardar: async () => ({}) }) }));
vi.mock("@/hooks/pessoas/useQualificarLeadPessoa", () => ({ useQualificarLeadPessoa: () => ({ classificar: async () => ({}) }) }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

beforeAll(prepararRadixNoJsdom);

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null };
const A = "11111111-1111-4111-8111-111111111111";
const B = "33333333-3333-4333-8333-333333333333";

const estado = (sobre: Record<string, unknown> = {}) => ({
  ficha: null as FichaDb | null, estado: "a-carregar", erro: null, carregarMais: vi.fn(), aCarregarMais: false, carregandoTipos: [], errosMais: {},
  atualizacaoFalhou: false, erroAoCarregarMais: null, recarregar: vi.fn(), ...sobre,
});
const fichaDe = (id: string, nome: string) => fichaDb({
  pessoa: { ...fichaDb().pessoa, id, nome }, agregados: agregadosDb({ ultimo_contacto_em: "2026-10-12T09:00:00Z" }), contactos: seccaoDb([contactoDb()]),
});
const FICHAS: Record<string, FichaDb> = { [A]: fichaDe(A, "Ana Lopes"), [B]: fichaDe(B, "Bruno Reis") };

/** O «quadro» simulado: um contador com estado próprio, para provar que não se desmonta, e um botão que abriu a ficha. */
function Quadro() {
  const [n, setN] = useState(0);
  return (
    <div data-testid="quadro">
      <button type="button" data-testid="cartao" onClick={() => setN(n + 1)}>cartão {n}</button>
    </div>
  );
}

function desenhar(sobre: Partial<Parameters<typeof FichaReal>[0]> = {}) {
  const props = { pessoaId: A as string | null, idsVisiveis: [A, B], aoFechar: vi.fn(), aoIrPara: vi.fn(), aoLimpar: vi.fn(), voltaPara: "pipeline" as const, tituloPagina: "Pipeline", ...sobre };
  const ui = (p: typeof props) => (
    <ComClienteQuery><FontePessoasContext.Provider value={REAL}>
      <MemoryRouter>
        <main data-testid="main"><FichaReal comGuia {...p}><Quadro /></FichaReal></main>
      </MemoryRouter>
    </FontePessoasContext.Provider></ComClienteQuery>
  );
  const r = render(ui(props));
  return { props, ...r, reenviar: (nova: Partial<typeof props>) => r.rerender(ui({ ...props, ...nova })) };
}
const escondido = () => screen.getByTestId("quadro").closest("[hidden]");

beforeEach(() => {
  fichaMock.mockReset();
  fichaMock.mockImplementation((id: string | null) => (id ? estado({ ficha: FICHAS[id], estado: "ok" }) : estado({ estado: "indisponivel" })));
});

describe("FichaReal na página", () => {
  it("com a ficha chegada, o quadro continua no DOM (mesmo elemento, mesmo estado) mas escondido, e nada da ficha é um diálogo", () => {
    const { reenviar } = desenhar({ pessoaId: null });
    const antes = screen.getByTestId("quadro");
    fireEvent.click(screen.getByTestId("cartao"));
    expect(screen.getByTestId("cartao")).toHaveTextContent("cartão 1");
    expect(escondido()).toBeNull();
    reenviar({ pessoaId: A });
    expect(screen.getByTestId("quadro")).toBe(antes);
    expect(escondido()).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Ana Lopes" })).toBeInTheDocument();
    reenviar({ pessoaId: null });
    expect(screen.getByTestId("quadro")).toBe(antes);
    expect(escondido()).toBeNull();
    expect(screen.getByTestId("cartao")).toHaveTextContent("cartão 1");
  });

  it("há um título de página (h1) para leitores de ecrã dentro da ficha", () => {
    desenhar();
    expect(screen.getByRole("heading", { level: 1, name: "Pipeline" })).toBeInTheDocument();
  });

  it("sem pessoa aberta o quadro não está escondido", () => {
    desenhar({ pessoaId: null });
    expect(escondido()).toBeNull();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("enquanto a primeira ficha carrega o quadro continua visível, com o aviso «A abrir»", () => {
    fichaMock.mockImplementation(() => estado());
    desenhar();
    expect(escondido()).toBeNull();
    expect(screen.getAllByText("A abrir a ficha…").length).toBeGreaterThan(0);
  });

  it("na troca de A para B o quadro continua escondido e mostra-se um bloco de espera, sem os dados de A", () => {
    const { reenviar } = desenhar();
    expect(screen.getByRole("heading", { level: 2, name: "Ana Lopes" })).toBeInTheDocument();
    fichaMock.mockImplementation((id: string | null) => (id === B ? estado() : estado({ ficha: FICHAS[A], estado: "ok" })));
    reenviar({ pessoaId: B });
    expect(escondido()).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Ana Lopes" })).toBeNull();
    expect(screen.getByRole("button", { name: "Voltar ao Pipeline" })).toBeInTheDocument();
    fichaMock.mockImplementation((id: string | null) => estado({ ficha: FICHAS[id ?? A], estado: "ok" }));
    reenviar({ pessoaId: B });
    expect(screen.getByRole("heading", { level: 2, name: "Bruno Reis" })).toBeInTheDocument();
    expect(escondido()).not.toBeNull();
  });

  it("o foco entra no nome ao abrir", () => {
    desenhar();
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "Ana Lopes" }));
  });

  it("ao fechar o foco volta ao cartão que abriu a ficha e a posição de rolagem do <main> é reposta", () => {
    const origem: MutableRefObject<HTMLElement | null> = { current: null };
    const { reenviar } = desenhar({ pessoaId: null, origemFoco: origem });
    const main = screen.getByTestId("main");
    const cartao = screen.getByTestId("cartao");
    cartao.focus();
    origem.current = cartao;
    main.scrollTop = 340;
    fireEvent.scroll(main);
    reenviar({ pessoaId: A, origemFoco: origem });
    expect(main.scrollTop).toBe(0);
    act(() => { reenviar({ pessoaId: null, origemFoco: origem }); });
    expect(main.scrollTop).toBe(340);
    expect(document.activeElement).toBe(screen.getByTestId("cartao"));
    expect(origem.current).toBeNull();
  });

  it("a ligação de volta chama aoFechar", () => {
    const { props } = desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao Pipeline" }));
    expect(props.aoFechar).toHaveBeenCalledTimes(1);
  });
});
