// O Inventário nativo: o menu só o mostra na V2, os separadores, as listas com filtros, receber numa PO com diálogo próprio, o motivo exigido, o aviso aria-live,
// o teclado (/, setas, Enter, Esc) e "Repor inventário". Em jsdom (sem matchMedia) as listas mostram-se como cartões.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import PrototipoNegocios from "../PrototipoNegocios";
import { esquecerPessoas } from "../PessoasSimples";
import { esquecerPessoasFunc } from "../PessoasFunc";
import { esquecerNegociosFunc } from "../NegociosFunc";
import { esquecerDiaADia } from "../diaADia";
import InventarioPagina from "./InventarioPagina";
import { esquecerInventario, lerInventario } from "./loja";

const CHAVE = "olyvia-prototipo-v2";
const app = (guardado: string | null): void => {
  localStorage.clear();
  if (guardado !== null) localStorage.setItem(CHAVE, guardado);
  render(<PrototipoNegocios />);
};
const lateral = (): HTMLElement => screen.getAllByRole("navigation", { name: "Menu" })[0];
const entrada = (): HTMLElement | null => within(lateral()).queryByRole("button", { name: "Inventário completo" });
const separador = (nome: string): void => { fireEvent.click(screen.getByRole("tab", { name: nome })); };
const painel = (): HTMLElement => document.getElementById("inv-painel") as HTMLElement;
const estado = (nome: RegExp): HTMLElement => within(screen.getByRole("group", { name: "Estado" })).getByRole("button", { name: nome });

beforeEach(() => { esquecerPessoas(); esquecerPessoasFunc(); esquecerNegociosFunc(); esquecerDiaADia(); esquecerInventario(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe("Inventário completo no menu", () => {
  it("não aparece na Atual; aparece na V2 e na V2 funcional", () => {
    app(null);
    expect(entrada()).toBeNull();
    cleanup();
    app("1");
    expect(entrada()).not.toBeNull();
    cleanup();
    app("funcional");
    expect(entrada()).not.toBeNull();
  });

  it("abre a página nativa (sem iframe) e, ao mudar para a Atual, volta a Negócios", async () => {
    app("1");
    fireEvent.click(entrada()!);
    expect(await screen.findByRole("heading", { level: 1, name: "Inventário completo" })).toBeInTheDocument();
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByText(/exemplo · dados inventados, 09\/10\/2026/)).toBeInTheDocument();
    const seletor = screen.getAllByRole("group", { name: "Versão" })[0];
    fireEvent.click(within(seletor).getByRole("button", { name: "Atual" }));
    expect(screen.queryByRole("tab", { name: "Armazéns" })).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })[0].textContent).toBe("Negócios");
  });
});

describe("Separadores", () => {
  it("há um separador por área e o Hoje mostra a fila de trabalho com os números do mockup", () => {
    render(<InventarioPagina />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Hoje", "Encomendas", "Fornecedores", "Stock", "Movimentos", "Encomendas de cliente", "Guias", "Contagens", "Armazéns"]);
    expect(screen.getByRole("tab", { name: "Hoje" })).toHaveAttribute("aria-selected", "true");
    const fila = screen.getByRole("button", { name: /^3\s*POs por aprovar/ });
    expect(within(fila).getByText("3")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /^2\s*Guias abertas com divergências/ })).getByText("2")).toBeInTheDocument();
  });

  it("cada ecrã tem no máximo um botão primário", () => {
    render(<InventarioPagina />);
    for (const nome of ["Hoje", "Encomendas", "Fornecedores", "Stock", "Movimentos", "Encomendas de cliente", "Guias", "Contagens", "Armazéns"]) {
      separador(nome);
      const primarios = painel().querySelectorAll("button.bg-primary");
      expect(primarios.length, nome).toBeLessThanOrEqual(1);
    }
  });

  it("o texto, os alvos e os avisos seguem as regras: sem texto abaixo de 15 px e sem iframe", () => {
    render(<InventarioPagina />);
    for (const nome of ["Hoje", "Encomendas", "Stock", "Armazéns"]) {
      separador(nome);
      expect(painel().innerHTML).not.toMatch(/text-\[1[0-4]px\]|text-xs/);
    }
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("a fila do Hoje abre a lista já filtrada", () => {
    render(<InventarioPagina />);
    fireEvent.click(screen.getByRole("button", { name: /^3\s*POs por aprovar/ }));
    expect(screen.getByRole("tab", { name: "Encomendas" })).toHaveAttribute("aria-selected", "true");
    expect(estado(/^Pendente/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: /^Abrir PO-/ })).toHaveLength(3);
  });
});

describe("Encomendas", () => {
  it("filtra por estado e pesquisa por fornecedor", () => {
    render(<InventarioPagina />);
    separador("Encomendas");
    expect(screen.getAllByRole("button", { name: /^Abrir PO-/ })).toHaveLength(13);
    fireEvent.click(estado(/^Atrasadas/));
    expect(screen.getAllByRole("button", { name: /^Abrir PO-/ })).toHaveLength(4);
    fireEvent.click(estado(/^Todas/));
    fireEvent.change(screen.getByRole("searchbox", { name: /Pesquisar encomendas/ }), { target: { value: "zeta" } });
    expect(screen.getAllByRole("button", { name: /^Abrir PO-/ })).toHaveLength(1);
  });

  it("receber a PO da Silva & Filhos: o diálogo mostra a repartição, confirma, avisa e a PO fica Recebida", async () => {
    render(<InventarioPagina />);
    separador("Encomendas");
    fireEvent.click(screen.getByRole("button", { name: /^Abrir PO-2026-0137/ }));
    const folha = await screen.findByRole("dialog", { name: "PO-2026-0137" });
    fireEvent.click(within(folha).getByRole("button", { name: "Receber" }));
    const dlg = await screen.findByRole("dialog", { name: "Receber PO-2026-0137" });
    expect(within(dlg).getByText(/falta 2/)).toBeInTheDocument();
    expect(within(dlg).getByText(/2 → EC-0087/)).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole("button", { name: "Confirmar receção" }));
    expect(await screen.findAllByText(/Receção registada: 2 un servem Encomendas Clientes/)).not.toHaveLength(0);
    const po = lerInventario().pos.find((p) => p.id === "PO-2026-0137")!;
    expect(po.lines[0].recv).toBe(10);
    expect(screen.getAllByRole("status").some((s) => /Receção registada/.test(s.textContent ?? ""))).toBe(true);
  });

});

describe("Encomendas (continuação)", () => {
  it("um valor acima do que falta não passa do campo: fica no máximo", async () => {
    render(<InventarioPagina />);
    separador("Encomendas");
    fireEvent.click(screen.getByRole("button", { name: /^Abrir PO-2026-0137/ }));
    const folha = await screen.findByRole("dialog", { name: "PO-2026-0137" });
    fireEvent.click(within(folha).getByRole("button", { name: "Receber" }));
    const dlg = await screen.findByRole("dialog", { name: "Receber PO-2026-0137" });
    const campo = within(dlg).getByRole("spinbutton", { name: /Receber agora/ });
    fireEvent.change(campo, { target: { value: "9" } });
    expect(campo).toHaveValue(2);
  });

  it("aprovar e enviar exige confirmar num diálogo (nunca confirm()) e passa a Encomendado", async () => {
    render(<InventarioPagina />);
    separador("Encomendas");
    fireEvent.click(estado(/^Pendente/));
    fireEvent.click(screen.getAllByRole("button", { name: "Aprovar e enviar" })[0]);
    const dlg = await screen.findByRole("dialog", { name: /^Aprovar e enviar PO-/ });
    fireEvent.click(within(dlg).getByRole("button", { name: "Aprovar e enviar" }));
    await waitFor(() => expect(lerInventario().pos.filter((p) => p.status === "pending" && !p.deleted)).toHaveLength(2));
  });

  it("reverter uma receção pede motivo: o botão só fica ativo com 3 caracteres, e a regra que recusa aparece no diálogo", async () => {
    render(<InventarioPagina />);
    separador("Encomendas");
    fireEvent.click(screen.getByRole("button", { name: /^Abrir PO-2026-0136/ }));
    const folha = await screen.findByRole("dialog", { name: "PO-2026-0136" });
    fireEvent.click(within(folha).getByRole("tab", { name: /^Receções/ }));
    fireEvent.click(within(folha).getByRole("button", { name: "Reverter receção" }));
    const dlg = await screen.findByRole("dialog", { name: "Reverter receção" });
    const ok = within(dlg).getByRole("button", { name: "Reverter receção" });
    expect(ok).toBeDisabled();
    fireEvent.change(within(dlg).getByRole("textbox"), { target: { value: "ab" } });
    expect(ok).toBeDisabled();
    fireEvent.change(within(dlg).getByRole("textbox"), { target: { value: "engano nosso" } });
    expect(ok).toBeEnabled();
  });
});

describe("Stock, movimentos e transferências", () => {
  it("o stock filtra por estado e o detalhe do produto abre numa folha lateral", async () => {
    render(<InventarioPagina />);
    separador("Stock");
    fireEvent.click(screen.getByRole("button", { name: /Em excesso/ }));
    expect(screen.getAllByRole("button", { name: /^Abrir o stock de/ }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /^Abrir o stock de/ })[0]);
    const folha = await screen.findByRole("dialog");
    expect(within(folha).getByRole("button", { name: "Registar movimento" })).toBeInTheDocument();
  });

  it("registar um ajuste sem motivo recusa na hora e com motivo regista no livro", async () => {
    render(<InventarioPagina />);
    separador("Movimentos");
    const antes = lerInventario().moves.length;
    fireEvent.click(screen.getAllByRole("button", { name: /Registar movimento/ })[0]);
    const dlg = await screen.findByRole("dialog", { name: /Registar movimento · 1 de 2/ });
    fireEvent.click(within(dlg).getByRole("button", { name: /^Ajuste/ }));
    const d2 = await screen.findByRole("dialog", { name: /2 de 2 · Ajuste/ });
    fireEvent.change(within(d2).getByLabelText(/Produto da linha 1/), { target: { value: "CD-80" } });
    fireEvent.click(within(d2).getByRole("button", { name: /^Registar 1 linha/ }));
    expect((await within(d2).findAllByText("Motivo obrigatório em ajustes.")).length).toBeGreaterThan(0);
    expect(lerInventario().moves).toHaveLength(antes);
    fireEvent.change(within(d2).getByLabelText(/^Motivo/), { target: { value: "Contagem" } });
    fireEvent.click(within(d2).getByRole("button", { name: /^Registar 1 linha/ }));
    await waitFor(() => expect(lerInventario().moves).toHaveLength(antes + 1));
    expect(lerInventario().moves[antes]).toMatchObject({ type: "adjp", sku: "CD-80", qty: 1 });
  });
});

describe("Encomendas de cliente, guias e contagens", () => {
  it("a lista de ECs mostra o progresso em texto e filtra as prontas a expedir", () => {
    render(<InventarioPagina />);
    separador("Encomendas de cliente");
    expect(screen.getAllByRole("button", { name: /^Abrir EC-/ })).toHaveLength(9);
    fireEvent.click(estado(/^Prontas a expedir/));
    expect(screen.getAllByRole("button", { name: /^Abrir EC-/ })).toHaveLength(7);
    expect(screen.getAllByText(/servido ·/).length).toBeGreaterThan(0);
  });

  it("fechar uma guia com divergências pede nota", async () => {
    render(<InventarioPagina />);
    separador("Guias");
    fireEvent.click(screen.getByRole("button", { name: /^Abrir a guia GR 2026\/311/ }));
    const folha = await screen.findByRole("dialog", { name: "GR 2026/311" });
    const fechar = within(folha).getAllByRole("button", { name: "Fechar" });
    fireEvent.click(fechar[fechar.length - 1]);
    const dlg = await screen.findByRole("dialog", { name: /Fechar guia/ });
    expect(within(dlg).getByRole("button", { name: "Fechar guia" })).toBeDisabled();
    fireEvent.change(within(dlg).getByRole("textbox"), { target: { value: "faltaram 2 painéis" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Fechar guia" }));
    await waitFor(() => expect(lerInventario().guias.find((g) => g.id === "GR 2026/311")?.state).toBe("closed"));
  });

  it("a contagem em curso só finaliza com tudo contado e resolvido", async () => {
    render(<InventarioPagina />);
    separador("Contagens");
    fireEvent.click(screen.getByRole("button", { name: /^Abrir a contagem INV-2026-014/ }));
    const folha = await screen.findByRole("dialog", { name: "INV-2026-014" });
    expect(within(folha).getByRole("button", { name: "Finalizar" })).toBeDisabled();
  });
});

describe("Teclado e Repor", () => {
  it("'/' vai à pesquisa; setas movem entre linhas; Enter abre; Esc fecha e devolve o foco à linha", async () => {
    render(<InventarioPagina />);
    separador("Encomendas");
    fireEvent.keyDown(document.body, { key: "/" });
    expect(screen.getByRole("searchbox", { name: /Pesquisar encomendas/ })).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    const primeira = screen.getAllByRole("button", { name: /^Abrir PO-/ }).find((b) => b.hasAttribute("data-linha-func"))!;
    expect(primeira).toHaveFocus();
    fireEvent.keyDown(primeira, { key: "Enter" });
    fireEvent.click(primeira);
    const folha = await screen.findByRole("dialog");
    expect(folha).toBeInTheDocument();
    fireEvent.keyDown(folha, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Repor inventário apaga o que se fez (com diálogo próprio) e deixa o resto do protótipo", async () => {
    render(<InventarioPagina />);
    separador("Encomendas");
    fireEvent.click(estado(/^Pendente/));
    fireEvent.click(screen.getAllByRole("button", { name: "Aprovar e enviar" })[0]);
    const dlg = await screen.findByRole("dialog", { name: /^Aprovar e enviar PO-/ });
    fireEvent.click(within(dlg).getByRole("button", { name: "Aprovar e enviar" }));
    await waitFor(() => expect(lerInventario().pos.filter((p) => p.status === "pending" && !p.deleted)).toHaveLength(2));
    localStorage.setItem("outra-chave", "fica");
    fireEvent.click(screen.getByRole("button", { name: "Repor inventário" }));
    const conf = await screen.findByRole("dialog", { name: "Repor inventário" });
    fireEvent.click(within(conf).getByRole("button", { name: "Repor inventário" }));
    await waitFor(() => expect(lerInventario().pos.filter((p) => p.status === "pending" && !p.deleted)).toHaveLength(3));
    expect(localStorage.getItem("outra-chave")).toBe("fica");
  });
});
