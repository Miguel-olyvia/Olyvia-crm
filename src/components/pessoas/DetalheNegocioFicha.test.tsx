// O detalhe de um negócio dentro da ficha: «Perder negócio» num negócio em curso, «Anular perda» num negócio perdido, e nenhum dos dois num ganho.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { faseDoNegocio, isNegocioGanho } from "@/components/negocio-metas/negocioMetas";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { negociosComPerdidos, alteracoesAtuais, perdaDoNegocio, perderNegocio, repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => { cleanup(); repor(); reporRegistos(); });

const emProposta = DADOS_EXEMPLO.negocios.find((n) => faseDoNegocio(n) === "proposta")!;
const ganho = DADOS_EXEMPLO.negocios.find(isNegocioGanho)!;

const abrir = (negocio: typeof emProposta) =>
  render(<MemoryRouter><DetalheNegocioFicha negocio={negocio} hoje={HOJE_EXEMPLO} aoVoltar={vi.fn()} /></MemoryRouter>);

describe("DetalheNegocioFicha: perder e anular a perda", () => {
  it("um negócio em curso oferece «Perder negócio» e não «Anular perda»", () => {
    abrir(emProposta);
    expect(screen.getByRole("button", { name: "Perder negócio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular perda" })).toBeNull();
  });

  it("perder com motivo deixa a ficha a mostrar «Perdido em Proposta» e «Anular perda» (e já não «Perder negócio»)", () => {
    const { rerender } = render(<MemoryRouter><DetalheNegocioFicha negocio={emProposta} hoje={HOJE_EXEMPLO} aoVoltar={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Perder negócio" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Motivo da perda" }), { target: { value: "Preço" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar a perda" }));
    expect(perdaDoNegocio(emProposta.id)?.fase).toBe("proposta");
    const [perdido] = negociosComPerdidos([emProposta], alteracoesAtuais());
    rerender(<MemoryRouter><DetalheNegocioFicha negocio={perdido} hoje={HOJE_EXEMPLO} aoVoltar={vi.fn()} /></MemoryRouter>);
    // Uma vez, no aviso da perda: o percurso (onde a perda também aparece) está fechado, porque o negócio estava em Proposta ao abrir.
    expect(screen.getAllByText("Perdido em Proposta: Preço")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Anular perda" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Perder negócio" })).toBeNull();
  });

  it("Anular perda tira a perda do negócio e o negócio volta a oferecer «Perder negócio»", () => {
    perderNegocio(emProposta, "Preço", HOJE_EXEMPLO);
    const [perdido] = negociosComPerdidos([emProposta], alteracoesAtuais());
    abrir(perdido);
    fireEvent.click(screen.getByRole("button", { name: "Anular perda" }));
    expect(perdaDoNegocio(emProposta.id)).toBeUndefined();
  });

  it("um negócio ganho não tem nenhum dos dois", () => {
    abrir(ganho);
    expect(screen.queryByRole("button", { name: "Perder negócio" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Anular perda" })).toBeNull();
  });
});

describe("DetalheNegocioFicha: o estado em cima e os detalhes recolhidos", () => {
  /** O botão do título de uma secção de detalhes (o que a abre e fecha), e não outros botões do seu conteúdo. */
  const detalhe = (nome: RegExp) => within(screen.getAllByRole("heading", { level: 4, name: nome })[0]).getByRole("button");

  it("os detalhes têm uma linha de resumo e só vem aberto o da fase em que o negócio está (Proposta)", () => {
    abrir(emProposta);
    expect(detalhe(/^Proposta/)).toHaveAttribute("aria-expanded", "true");
    for (const fechado of [/^Percurso/, /^Registos ligados/, /^Orçamentos/]) expect(detalhe(fechado)).toHaveAttribute("aria-expanded", "false");
    // O resumo diz o essencial sem abrir: quantos orçamentos e quantos registos.
    expect(detalhe(/^Orçamentos/)).toHaveTextContent(/orçamento/i);
    expect(detalhe(/^Registos ligados/)).toHaveTextContent(/ligados/);
  });

  it("abrir um detalhe fechado mostra-o, e voltar a carregar fecha-o", () => {
    abrir(emProposta);
    fireEvent.click(detalhe(/^Percurso/));
    expect(detalhe(/^Percurso/)).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(detalhe(/^Percurso/));
    expect(detalhe(/^Percurso/)).toHaveAttribute("aria-expanded", "false");
  });

  it("um negócio ganho vem com o percurso aberto", () => {
    abrir(ganho);
    expect(detalhe(/^Percurso/)).toHaveAttribute("aria-expanded", "true");
  });

  it("o estado (fases e passo seguinte) vem antes dos detalhes", () => {
    abrir(emProposta);
    const fases = screen.getByRole("heading", { level: 4, name: /fases do negócio/i });
    const percurso = detalhe(/^Percurso/);
    expect(fases.compareDocumentPosition(percurso) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("DetalheNegocioFicha: o negócio abre-se por inteiro na página de Pessoas", () => {
  it("mostra o percurso do negócio (contactos, visitas, levantamento) e as secções de orçamentos", () => {
    abrir(emProposta);
    expect(screen.getByRole("heading", { level: 4, name: /percurso/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: /orçamentos/i })).toBeInTheDocument();
  });

  it("não tem nenhuma ligação para a página de Negócio e metas, nem num negócio em curso, nem num ganho", () => {
    for (const negocio of [emProposta, ganho]) {
      const { unmount } = abrir(negocio);
      const destinos = screen.queryAllByRole("link").map((a) => a.getAttribute("href") ?? "");
      expect(destinos.filter((d) => d.includes("negocio-metas"))).toEqual([]);
      unmount();
    }
  });
});
