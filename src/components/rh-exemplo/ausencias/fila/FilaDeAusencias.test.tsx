// A fila de ausências por pessoa: a lista só com pessoas, o painel com todos os pedidos dela, acções nos próprios itens,
// chefia e RH separadas (a que a permissão não dá fica desactivada com o motivo escrito), foco, e fontes que falham.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { FilaDeTrabalho, PessoaNaFila } from "@/components/rh-exemplo/hooks/useFilaDeTrabalho";
import { agruparPorPessoa, construirItensDeAusencias, ordenarPessoas, type FonteAusencias } from "@/lib/hr/filaDeTrabalho";
import type { AusenciaPedido } from "@/types/hrAusencias";
import { FilaDeAusencias } from "./FilaDeAusencias";

beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
});

const pedido = (parcial: Partial<AusenciaPedido> & Pick<AusenciaPedido, "id" | "pessoa_id" | "data_inicio" | "data_fim">): AusenciaPedido =>
  ({ organization_id: "o", tipo_id: "ferias", dias_solicitados: 3, estado: "pendente_chefia", aprovador_chefia_pessoa_id: "chefe", substitui_pedido_id: null, ...parcial }) as AusenciaPedido;

const PEDIDOS = [
  pedido({ id: "a1", pessoa_id: "ana", data_inicio: "2026-11-10", data_fim: "2026-11-12" }),
  pedido({ id: "a2", pessoa_id: "ana", data_inicio: "2026-11-02", data_fim: "2026-11-02", estado: "pendente_rh", dias_solicitados: 1 }),
  pedido({ id: "a3", pessoa_id: "rui", data_inicio: "2026-10-20", data_fim: "2026-10-26" }),
];
const NOMES: Record<string, string> = { ana: "Ana Silva", rui: "Rui Matos" };

const pessoasDe = (pedidos: AusenciaPedido[]): PessoaNaFila[] =>
  ordenarPessoas(
    agruparPorPessoa(construirItensDeAusencias(pedidos, () => "Férias"), (id) => NOMES[id] ?? id),
    { hoje: "2026-11-05", periodo: null },
  );

const filaCom = (parcial: Partial<FilaDeTrabalho<FonteAusencias>> = {}): FilaDeTrabalho<FonteAusencias> => {
  const pessoas = parcial.pessoas ?? pessoasDe(PEDIDOS);
  return {
    pessoas,
    totalPendencias: pessoas.reduce((s, p) => s + p.total, 0),
    contador: String(pessoas.length),
    horasExtraCortadas: false,
    horasExtra: { lidas: 0, total: 0 },
    fontes: { ausencias: "ok" },
    aCarregar: false,
    lidaComSucesso: true,
    periodo: null,
    hoje: "2026-11-05",
    recarregar: async () => undefined,
    ...parcial,
  };
};

const decisoesFalsas = () => ({
  decidirChefia: vi.fn(async () => null as string | null),
  decidirRh: vi.fn(async () => null as string | null),
  saving: false,
});

const TUDO = { aprovarChefia: true, aprovarRh: true };

function arvore(fila: FilaDeTrabalho<FonteAusencias>, decisoes = decisoesFalsas(), permissoes = TUDO, aoAbrirDetalhe = vi.fn()) {
  return (
    <LanguageProvider>
      <MemoryRouter>
        <FilaDeAusencias fila={fila} permissoes={permissoes} decisoes={decisoes} aoAbrirDetalhe={aoAbrirDetalhe} />
      </MemoryRouter>
    </LanguageProvider>
  );
}

const abrirAna = () => {
  const linha = screen.getByRole("button", { name: /^Ana Silva, 2 pendências/ });
  fireEvent.click(linha);
  return linha;
};

describe("lista de pessoas com pedidos por decidir", () => {
  it("mostra uma linha por PESSOA (não por pedido), com as contagens em texto", () => {
    render(arvore(filaCom()));
    const lista = screen.getByRole("list", { name: "Pessoas com pedidos por decidir" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
    const ana = within(lista).getByRole("button", { name: /^Ana Silva, 2 pendências: 2 ausências, mais antigo: 02\/11\/2026/ });
    expect(ana).toHaveTextContent("2 ausências");
    expect(screen.getByTestId("rhd-fila-totais")).toHaveTextContent("2 pessoas · 3 pendências");
  });

  it("com um só tipo não há filtro por tipo, mas há pesquisa por nome", () => {
    render(arvore(filaCom()));
    expect(screen.queryByLabelText("Tipo de pendência")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Pesquisar por nome")).toBeInTheDocument();
  });

  it("lista vazia só diz que não há nada quando a fonte leu bem", () => {
    const { unmount } = render(arvore(filaCom({ pessoas: [] })));
    expect(screen.getByTestId("rhd-fila-vazia")).toHaveTextContent("Não tem nada à espera de decisão.");
    unmount();
    render(arvore(filaCom({ pessoas: [], lidaComSucesso: false, fontes: { ausencias: "erro" } })));
    expect(screen.queryByTestId("rhd-fila-vazia")).not.toBeInTheDocument();
    expect(screen.getByTestId("rhd-fila-aviso-ausencias")).toHaveTextContent("Não foi possível ler os pedidos de ausência");
  });

  it("uma fonte que falha ao reler mantém as pessoas na lista e avisa", () => {
    render(arvore(filaCom({ lidaComSucesso: false, fontes: { ausencias: "erro" } })));
    expect(screen.getByRole("button", { name: /^Ana Silva/ })).toBeInTheDocument();
    expect(screen.getByTestId("rhd-fila-aviso-ausencias")).toBeInTheDocument();
  });

  it("perto do fecho do período a pessoa leva o selo «Fecha em N dias»", () => {
    const pessoas = ordenarPessoas(
      agruparPorPessoa(construirItensDeAusencias(PEDIDOS, () => "Férias"), (id) => NOMES[id] ?? id),
      { hoje: "2026-11-19", periodo: { de: "2026-10-22", ate: "2026-11-21" } },
    );
    render(arvore(filaCom({ pessoas, hoje: "2026-11-19" })));
    expect(screen.getAllByText("Fecha em 2 dias")).toHaveLength(2);
  });
});

describe("painel da pessoa", () => {
  it("abre com o foco no título e UMA lista cronológica com a etiqueta do tipo em cada pedido", () => {
    render(arvore(filaCom()));
    abrirAna();
    const painel = screen.getByRole("dialog", { name: "Ana Silva" });
    expect(within(painel).getByText("Ana Silva")).toHaveFocus();
    const lista = within(painel).getByRole("list", { name: "Pedidos por decidir de Ana Silva, do mais antigo para o mais recente" });
    const itens = within(lista).getAllByTestId(/^item-fila-ausencia-[a-z0-9]+$/);
    expect(itens.map((e) => e.getAttribute("data-testid"))).toEqual(["item-fila-ausencia-a2", "item-fila-ausencia-a1"]);
    expect(within(itens[0]).getByText("Ausência: Férias")).toBeInTheDocument();
    // O passo por extenso, não só a cor.
    expect(within(itens[0]).getByText("A aguardar o RH")).toBeInTheDocument();
    expect(within(itens[1]).getByText("A aguardar a chefia")).toBeInTheDocument();
    expect(within(painel).getByRole("link", { name: "Abrir ficha (Ausências)" })).toHaveAttribute("href", "/rh-exemplo/pessoas/ana?aba=ausencias");
  });

  it("aprovar como chefia chama a decisão da chefia e anuncia o resultado num só estado", async () => {
    const decisoes = decisoesFalsas();
    render(arvore(filaCom(), decisoes));
    abrirAna();
    const item = screen.getByTestId("item-fila-ausencia-a1");
    fireEvent.click(within(item).getByRole("button", { name: /^Aprovar como chefia, pedido de ausência de Ana Silva/ }));
    await waitFor(() => expect(decisoes.decidirChefia).toHaveBeenCalledWith({ pedidoId: "a1", resultado: "aprovado" }));
    expect(decisoes.decidirRh).not.toHaveBeenCalled();
    await waitFor(() => expect(within(screen.getByTestId("painel-fila-estado")).getByText("Pedido aprovado")).toBeInTheDocument());
  });

  it("aprovar no passo do RH chama a decisão do RH, não a da chefia", async () => {
    const decisoes = decisoesFalsas();
    render(arvore(filaCom(), decisoes));
    abrirAna();
    const item = screen.getByTestId("item-fila-ausencia-a2");
    fireEvent.click(within(item).getByRole("button", { name: /^Aprovar como RH/ }));
    await waitFor(() => expect(decisoes.decidirRh).toHaveBeenCalledWith({ pedidoId: "a2", resultado: "aprovado" }));
    expect(decisoes.decidirChefia).not.toHaveBeenCalled();
  });

  it("recusar pede o motivo (obrigatório) e só depois grava", async () => {
    const decisoes = decisoesFalsas();
    render(arvore(filaCom(), decisoes));
    abrirAna();
    fireEvent.click(within(screen.getByTestId("item-fila-ausencia-a1")).getByRole("button", { name: /^Recusar, pedido de ausência de Ana Silva/ }));
    const dialogo = await screen.findByRole("alertdialog");
    const confirmar = within(dialogo).getByRole("button", { name: "Recusar" });
    expect(confirmar).toBeDisabled();
    fireEvent.change(within(dialogo).getByLabelText("Motivo (obrigatório)"), { target: { value: "equipa curta nessa semana" } });
    expect(confirmar).toBeEnabled();
    fireEvent.click(confirmar);
    await waitFor(() =>
      expect(decisoes.decidirChefia).toHaveBeenCalledWith({ pedidoId: "a1", resultado: "recusado", motivo: "equipa curta nessa semana" }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("devolver à chefia (RH) grava com o motivo", async () => {
    const decisoes = decisoesFalsas();
    render(arvore(filaCom(), decisoes));
    abrirAna();
    fireEvent.click(within(screen.getByTestId("item-fila-ausencia-a2")).getByRole("button", { name: /^Devolver à chefia/ }));
    const dialogo = await screen.findByRole("alertdialog");
    fireEvent.change(within(dialogo).getByLabelText("Motivo (obrigatório)"), { target: { value: "falta confirmar cobertura" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Devolver à chefia" }));
    await waitFor(() =>
      expect(decisoes.decidirRh).toHaveBeenCalledWith({ pedidoId: "a2", resultado: "devolvido", motivo: "falta confirmar cobertura" }),
    );
  });

  it("quem só decide como RH vê as acções da chefia desactivadas, com o motivo escrito, e nada é gravado", () => {
    const decisoes = decisoesFalsas();
    render(arvore(filaCom(), decisoes, { aprovarChefia: false, aprovarRh: true }));
    abrirAna();
    const item = screen.getByTestId("item-fila-ausencia-a1");
    const aprovar = within(item).getByRole("button", { name: /^Aprovar como chefia/ });
    expect(aprovar).toHaveAttribute("aria-disabled", "true");
    expect(aprovar).toHaveAccessibleDescription("Sem permissão para decidir como chefia");
    expect(within(item).getByTestId("item-fila-ausencia-a1-porque")).toHaveTextContent("Sem permissão para decidir como chefia");
    fireEvent.click(aprovar);
    expect(decisoes.decidirChefia).not.toHaveBeenCalled();
    // O passo do RH, esse, está activo.
    expect(within(screen.getByTestId("item-fila-ausencia-a2")).getByRole("button", { name: /^Aprovar como RH/ })).not.toHaveAttribute("aria-disabled");
  });

  it("um erro ao gravar aparece como alerta, junto ao painel, e o pedido continua por decidir", async () => {
    const decisoes = decisoesFalsas();
    decisoes.decidirChefia.mockResolvedValueOnce("Não foi possível gravar a decisão.");
    render(arvore(filaCom(), decisoes));
    abrirAna();
    fireEvent.click(within(screen.getByTestId("item-fila-ausencia-a1")).getByRole("button", { name: /^Aprovar como chefia/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível gravar a decisão.");
    expect(screen.getByTestId("item-fila-ausencia-a1")).toBeInTheDocument();
  });

  it("«Ver detalhe» abre o pedido inteiro", () => {
    const aoAbrirDetalhe = vi.fn();
    render(arvore(filaCom(), decisoesFalsas(), TUDO, aoAbrirDetalhe));
    abrirAna();
    fireEvent.click(within(screen.getByTestId("item-fila-ausencia-a1")).getByRole("button", { name: /^Ver detalhe do pedido de Ana Silva/ }));
    expect(aoAbrirDetalhe).toHaveBeenCalledWith("a1");
  });

  it("se uma fonte falhar a reler, o painel mantém os itens e avisa que podem estar desactualizados", () => {
    const { rerender } = render(arvore(filaCom()));
    abrirAna();
    rerender(arvore(filaCom({ lidaComSucesso: false, fontes: { ausencias: "erro" } })));
    const painel = screen.getByRole("dialog", { name: "Ana Silva" });
    expect(within(painel).getByTestId("painel-fila-desactualizado")).toHaveTextContent("Não foi possível ler os pedidos de ausência");
    expect(within(painel).getByTestId("item-fila-ausencia-a1")).toBeInTheDocument();
  });

  it("quando o último pedido sai o foco vai para «Fechar»; «Nada por tratar» só se a fonte leu bem", () => {
    const { rerender } = render(arvore(filaCom()));
    abrirAna();
    rerender(arvore(filaCom({ pessoas: pessoasDe([PEDIDOS[2]]) })));
    const painel = screen.getByRole("dialog", { name: "Ana Silva" });
    expect(within(painel).getByText("Nada por tratar para Ana Silva.")).toBeInTheDocument();
    expect(within(painel).getByRole("button", { name: "Fechar" })).toHaveFocus();
  });

  it("Escape fecha o painel e o foco volta à linha da pessoa", async () => {
    render(arvore(filaCom()));
    const linha = abrirAna();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Ana Silva" }), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(linha).toHaveFocus());
  });
});
