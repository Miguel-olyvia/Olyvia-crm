// O assistente de passos, acessibilidade e corridas: o cabeçalho «Passo N de M...» é lido com o título (aria-describedby), «Continuar» ocupado diz «A guardar...»
// num estado anunciado, o erro liga-se ao campo em falta e leva o foco até ele, o erro de um passo não passa para outro sem efeitos, e Continuar navega
// pelo id do passo (nunca pelo índice do render do clique).
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistenteDoGuia } from "./AssistenteDoGuia";
import { useAssistente } from "./useAssistente";
import type { PassoAssistente } from "./tiposAssistente";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));
afterEach(cleanup);

const p = (id: string, extra: Partial<PassoAssistente> = {}): PassoAssistente => ({
  id, rotuloChave: `pessoasPagina.assistente.passo.${id}`, icone: "telefone", obrigatorias: 2, respondidas: 0, precisaNegocio: false, ...extra,
});
const PASSOS = [p("chamada", { obrigatorias: 1, respondidas: 1 }), p("qualificacao", { obrigatorias: 6 }), p("morada", { obrigatorias: 3 }), p("preparar")];

const coluna = () => within(screen.getByRole("navigation", { name: "Passos da fase" }));

type Continuar = (passo: PassoAssistente) => Promise<string | null> | string | null;

function Ecra({ passos = PASSOS, aoContinuar, inicial = 1 }: { passos?: PassoAssistente[]; aoContinuar?: Continuar; inicial?: number }) {
  const assistente = useAssistente(passos, { inicial });
  return (
    <AssistenteDoGuia
      faseRotuloChave="pessoasPagina.board.col.contactado" passos={passos} assistente={assistente} feitas={[]} aoVerFase={vi.fn()} nivel="h3"
      aoContinuar={aoContinuar}
      renderCorpo={(passo) => (
        <div>
          <p>corpo de {passo.id}</p>
          <input aria-label={`Campo de ${passo.id}`} aria-invalid={passo.id === "qualificacao" ? true : undefined} />
        </div>
      )}
    />
  );
}

describe("o cabeçalho do passo é lido com o título", () => {
  it("o título descreve-se pelo «Passo N de M · faltam X respostas», para o leitor de ecrã o dizer ao mudar de passo", () => {
    render(<Ecra />);
    const titulo = screen.getByRole("heading", { level: 3, name: "Qualificação" });
    expect(titulo).toHaveAccessibleDescription("Passo 2 de 4 · faltam 6 respostas · menos de 1 minuto");
  });

  it("ao mudar de passo a descrição muda com ele e o foco vai para o título", () => {
    render(<Ecra />);
    fireEvent.click(coluna().getByRole("button", { name: /Morada da obra/ }));
    const titulo = screen.getByRole("heading", { level: 3, name: "Morada da obra" });
    expect(titulo).toHaveAccessibleDescription(/^Passo 3 de 4 · faltam 3 respostas/);
    expect(titulo).toHaveFocus();
  });

  it("à entrada o foco não vai para o título, nem em StrictMode (sem flag que o efeito duplo estrague)", () => {
    render(<StrictMode><Ecra /></StrictMode>);
    expect(screen.getByRole("heading", { level: 3, name: "Qualificação" })).not.toHaveFocus();
  });
});

describe("os círculos dos passos são decorativos", () => {
  it("o círculo e o que leva dentro (check, «!») estão escondidos do leitor de ecrã", () => {
    render(<Ecra />);
    const lista = screen.getByRole("navigation", { name: "Passos da fase" });
    const circulos = lista.querySelectorAll("li button > span[aria-hidden='true']");
    expect(circulos.length).toBeGreaterThan(0);
    for (const svg of Array.from(lista.querySelectorAll("svg"))) expect(svg.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("«Continuar» ocupado", () => {
  it("enquanto grava há um estado «A guardar...» anunciado, o botão fica ocupado e um segundo clique não grava outra vez", async () => {
    let terminar: (v: string | null) => void = () => undefined;
    const aoContinuar = vi.fn(() => new Promise<string | null>((r) => { terminar = r; }));
    render(<Ecra aoContinuar={aoContinuar} />);
    const botao = screen.getByRole("button", { name: /^Continuar/ });
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(await screen.findByText("A guardar...")).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((s) => s.textContent === "A guardar...")).toBe(true);
    expect(botao).toHaveAttribute("aria-busy", "true");
    expect(aoContinuar).toHaveBeenCalledTimes(1);
    await act(async () => { terminar(null); });
    await waitFor(() => expect(screen.queryByText("A guardar...")).toBeNull());
  });
});

describe("o erro de Continuar", () => {
  it("liga-se ao campo em falta (aria-describedby e aria-errormessage) e o foco vai para o primeiro campo inválido", async () => {
    render(<Ecra aoContinuar={() => "Falta o telefone"} />);
    fireEvent.click(screen.getByRole("button", { name: /^Continuar/ }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Falta o telefone");
    const campo = screen.getByLabelText("Campo de qualificacao");
    expect(campo.getAttribute("aria-describedby")).toContain(alerta.id);
    expect(campo).toHaveAttribute("aria-errormessage", alerta.id);
    expect(campo).toHaveFocus();
  });

  it("sem campo inválido o erro fica só no alerta, sem estragar nada", async () => {
    render(<Ecra inicial={2} aoContinuar={() => "Falhou"} />);
    fireEvent.click(screen.getByRole("button", { name: /^Continuar/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falhou");
    expect(screen.getByLabelText("Campo de morada")).not.toHaveAttribute("aria-errormessage");
  });

  it("o erro é do passo em que aconteceu: ao mudar de passo desaparece, e ao voltar não ressuscita", async () => {
    render(<Ecra aoContinuar={() => "Falhou"} />);
    fireEvent.click(screen.getByRole("button", { name: /^Continuar/ }));
    await screen.findByRole("alert");
    fireEvent.click(coluna().getByRole("button", { name: /Morada da obra/ }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("um erro que lança é dito em geral e o passo não avança", async () => {
    render(<Ecra aoContinuar={() => { throw new Error("rebentou"); }} />);
    fireEvent.click(screen.getByRole("button", { name: /^Continuar/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível guardar este passo");
    expect(screen.getByRole("heading", { level: 3, name: "Qualificação" })).toBeInTheDocument();
  });
});

describe("Continuar navega pelo id do passo", () => {
  it("se a lista ganhou um passo enquanto a gravação corria, avança para o que vem depois do passo gravado (na lista de agora)", async () => {
    let terminar: (v: string | null) => void = () => undefined;
    const aoContinuar = () => new Promise<string | null>((r) => { terminar = r; });
    const { rerender } = render(<Ecra aoContinuar={aoContinuar} />);
    fireEvent.click(screen.getByRole("button", { name: /^Continuar/ }));
    rerender(<Ecra aoContinuar={aoContinuar} passos={[PASSOS[0], PASSOS[1], p("novo", { rotuloChave: undefined, rotulo: "Passo novo" }), ...PASSOS.slice(2)]} />);
    await act(async () => { terminar(null); });
    expect(await screen.findByRole("heading", { level: 3, name: "Passo novo" })).toBeInTheDocument();
  });

  it("se o utilizador já foi para outro passo enquanto gravava, não o puxa de volta nem o faz saltar", async () => {
    let terminar: (v: string | null) => void = () => undefined;
    const aoContinuar = () => new Promise<string | null>((r) => { terminar = r; });
    render(<Ecra aoContinuar={aoContinuar} />);
    fireEvent.click(screen.getByRole("button", { name: /^Continuar/ }));
    fireEvent.click(coluna().getByRole("button", { name: /Preparar a visita/ }));
    await act(async () => { terminar(null); });
    expect(screen.getByRole("heading", { level: 3, name: "Preparar a visita" })).toBeInTheDocument();
  });
});
