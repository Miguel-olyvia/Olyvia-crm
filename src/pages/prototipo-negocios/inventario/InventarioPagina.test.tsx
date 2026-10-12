// O Inventário nativo: o menu lateral só o mostra na V2 (secção INVENTÁRIO, grupos e contadores como no mockup), o Hoje, as listas com filtros, receber numa PO com diálogo próprio, o motivo exigido, o aviso aria-live,
// o teclado (/, setas, Enter, Esc) e "Repor inventário". Em jsdom (sem matchMedia) as listas mostram-se como cartões.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import PrototipoNegocios from "../PrototipoNegocios";
import { esquecerPessoas } from "../PessoasSimples";
import { esquecerPessoasFunc } from "../PessoasFunc";
import { esquecerNegociosFunc } from "../NegociosFunc";
import { esquecerDiaADia } from "../diaADia";
import InventarioPagina from "./InventarioPagina";
import MenuInventario from "./MenuInventario";
import { contadores } from "./contadores";
import type { AbaInv } from "./ctxInv";
import { esquecerInventario, lerInventario } from "./loja";
import { esquecerPerfil } from "./perfil";

const CHAVE = "olyvia-prototipo-v2";
const app = (guardado: string | null): void => {
  localStorage.clear();
  if (guardado !== null) localStorage.setItem(CHAVE, guardado);
  render(<PrototipoNegocios />);
};
const menuInv = (): HTMLElement | null => screen.queryAllByTestId("menu-inventario")[0] ?? null;
// Os nomes do menu (os do mockup): o que a app chamava Stock é Existências, Encomendas de cliente é Saídas para clientes e Guias é Receção.
const NOME_MENU: Record<string, string> = { Stock: "Existências", "Encomendas de cliente": "Saídas para clientes", Guias: "Receção" };
const item = (nome: string): HTMLElement => within(menuInv()!).getByRole("button", { name: new RegExp("^" + (NOME_MENU[nome] ?? nome)) });
const separador = (nome: string): void => { fireEvent.click(item(nome)); };
/** O que a página do protótipo faz: o menu lateral manda no ecrã aberto (a página não tem separadores). */
function Casa() {
  const [aba, setAba] = useState<AbaInv>("hoje");
  return <><MenuInventario aba={aba} aoIr={setAba} /><InventarioPagina aba={aba} aoMudarAba={setAba} /></>;
}
const painel = (): HTMLElement => document.getElementById("inv-painel") as HTMLElement;
const estado = (nome: RegExp): HTMLElement => within(screen.getByRole("group", { name: "Estado" })).getByRole("button", { name: nome });

beforeEach(() => { esquecerPerfil(); esquecerPessoas(); esquecerPessoasFunc(); esquecerNegociosFunc(); esquecerDiaADia(); esquecerInventario(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe("Inventário no menu lateral", () => {
  it("não aparece na Atual nem na V2 funcional; aparece só na V2", async () => {
    app(null);
    expect(menuInv()).toBeNull();
    cleanup();
    app("funcional");
    expect(menuInv()).toBeNull();
    cleanup();
    app("1");
    expect(await screen.findAllByTestId("menu-inventario")).not.toHaveLength(0);
  });

  it("tem a estrutura do mockup: rótulo INVENTÁRIO, Hoje, grupo Compras (2) e grupo Armazém (6), com Movimentos marcado Novo", async () => {
    app("1");
    await screen.findAllByTestId("menu-inventario");
    const m = within(menuInv()!);
    expect(m.getByText("Inventário")).toBeInTheDocument();
    const nomes = m.getAllByRole("button").map((b) => b.querySelector("span")!.textContent!.trim());
    expect(nomes.slice(0, 11)).toEqual(["Hoje", "Compras", "Encomendas", "Fornecedores", "Armazém", "Existências", "Movimentos Novo", "Saídas para clientes", "Receção", "Contagens", "Armazéns"]);
    expect(nomes[11]).toBe("Mockup · cobertura");
    expect(within(m.getByRole("group", { name: "Compras" })).getAllByRole("button")).toHaveLength(3);
    expect(within(m.getByRole("group", { name: "Armazém" })).getAllByRole("button")).toHaveLength(7);
    expect(m.queryByRole("button", { name: /Inventário completo/ })).toBeNull();
  });

  it("os contadores são os do mockup, calculados da base: Hoje com o total da fila e um por item", async () => {
    app("1");
    await screen.findAllByTestId("menu-inventario");
    const c = contadores(lerInventario());
    const total = c.pending + c.late + c.ecReady + c.ecNoSup + c.transfers + c.prices + c.low + c.stalled + c.guiasDiv + c.awaiting + c.catUnlinked;
    const pil = (nome: string): string => item(nome).querySelector(".pill")!.textContent!;
    expect(pil("Hoje")).toBe(String(total));
    expect(pil("Encomendas")).toBe(String(c.pending));
    expect(pil("Fornecedores")).toBe(String(c.prices + c.awaiting));
    expect(pil("Stock")).toBe(String(c.low));
    expect(pil("Encomendas de cliente")).toBe(String(c.ecReady));
    expect(pil("Guias")).toBe(String(c.guiasOpen));
    expect(pil("Contagens")).toBe(String(c.stalled));
    expect(total).toBeGreaterThan(0);
  });

  it("cada item abre diretamente o ecrã (sem separadores), com o rótulo Inventário e o título do mockup", async () => {
    app("1");
    await screen.findAllByTestId("menu-inventario");
    const casos: [string, string][] = [["Hoje", "Hoje"], ["Encomendas", "Encomendas a fornecedor"], ["Fornecedores", "Fornecedores"], ["Existências", "Existências"], ["Movimentos", "Movimentos"],
      ["Saídas para clientes", "Saídas para clientes"], ["Receção", "Receção"], ["Contagens", "Contagens"], ["Armazéns", "Armazéns"]];
    for (const [nome, h1] of casos) {
      fireEvent.click(item(nome));
      expect(await screen.findByRole("heading", { level: 1, name: h1 })).toBeInTheDocument();
      expect(item(nome)).toHaveAttribute("aria-current", "page");
      expect(screen.queryByRole("tablist", { name: "Áreas do inventário" })).toBeNull();
      expect(document.querySelector(".crumbs")!.textContent).toMatch(/^Inventário/);
    }
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("ao mudar para a Atual ou para a V2 funcional com o Inventário aberto, volta a Negócios", async () => {
    for (const nova of ["Atual", "V2 funcional"]) {
      app("1");
      await screen.findAllByTestId("menu-inventario");
      fireEvent.click(item("Existências"));
      await screen.findByRole("heading", { level: 1, name: "Existências" });
      const seletor = screen.getAllByRole("group", { name: "Versão" })[0];
      fireEvent.click(within(seletor).getByRole("button", { name: nova }));
      expect(menuInv()).toBeNull();
      expect(screen.getAllByRole("heading", { level: 1 })[0].textContent).toMatch(/^Negócios/);
      cleanup();
    }
  });

  it("o perfil simulado filtra o menu: Fiel de armazém não vê Saídas para clientes", async () => {
    app("1");
    await screen.findAllByTestId("menu-inventario");
    fireEvent.change(within(menuInv()!).getByLabelText(/Simular perfil/), { target: { value: "armazem" } });
    expect(within(menuInv()!).queryByRole("button", { name: /^Saídas para clientes/ })).toBeNull();
    expect(within(menuInv()!).getByRole("button", { name: /^Contagens/ })).toBeInTheDocument();
    fireEvent.change(within(menuInv()!).getByLabelText(/Simular perfil/), { target: { value: "consulta" } });
    expect(within(menuInv()!).queryByRole("button", { name: /^Contagens/ })).toBeNull();
  });
});

describe("Hoje igual ao mockup", () => {
  it("tem o fluxo em cinco passos, a bifurcação Sim/Não e as ações do topo com um só botão primário", () => {
    render(<Casa />);
    expect(screen.getByRole("heading", { level: 1, name: "Hoje" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Fluxo" })).toBeInTheDocument();
    for (const t of ["Vendas assinadas", "Encomendas Clientes", "Stock"]) expect(screen.getByRole("heading", { level: 3, name: new RegExp(t + "$") })).toBeInTheDocument();
    for (const t of ["Contratos", "Vendas diretas", "Encomendas manuais", "Em aberto", "Sem fornecedor", "Transferências pendentes", "Contagens em curso", "Valor em stock"]) {
      expect(screen.getAllByRole("button", { name: new RegExp("^" + t) }).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("Há stock → serve do stock", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Falta → encomenda ao fornecedor preferencial", { exact: false })).toBeInTheDocument();
    for (const t of ["Reserva FIFO", "Saída", "Encomenda servida", "Publicada no portal", "Fornecedor confirma", "Serve a EC"]) expect(screen.getAllByText(new RegExp("^" + t)).length).toBeGreaterThan(0);
    for (const a of ["Registar movimento", "Receber", "Simular venda assinada"]) expect(screen.getAllByRole("button", { name: new RegExp("^" + a + "$") }).length).toBeGreaterThan(0);
    expect(document.querySelectorAll("#inv-painel button.btn-p")).toHaveLength(1);
  });

  it("a fila de trabalho tem os cartões do mockup (e o das guias) com número, barra de cor e 'Abrir lista filtrada'", () => {
    render(<Casa />);
    const fila = screen.getByRole("heading", { level: 2, name: "Fila de trabalho" }).closest("section")!;
    const nomes = ["POs por aprovar", "POs atrasadas", "ECs prontas a expedir", "ECs sem fornecedor preferencial", "Pedidos de transferência", "Alterações de preço por aprovar", "Produtos abaixo do ponto de encomenda", "Contagem parada", "Fornecedores à espera da ficha", "Artigos do portal por ligar", "Guias abertas com divergências"];
    for (const n of nomes) expect(within(fila).getByRole("button", { name: new RegExp("^\\d+\\s*" + n) })).toBeInTheDocument();
    expect(fila.querySelectorAll(".qcard")).toHaveLength(11);
    expect(fila.querySelector(".qcard.t-warn")).not.toBeNull();
    expect(within(fila).getAllByText("Abrir lista filtrada").length).toBeGreaterThan(0);
  });

  it("os links levam ao ecrã certo já filtrado (e o menu acompanha)", () => {
    render(<Casa />);
    fireEvent.click(screen.getByRole("button", { name: /^2\s*Guias abertas com divergências/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Receção" })).toBeInTheDocument();
    expect(item("Guias")).toHaveAttribute("aria-current", "page");
    separador("Hoje");
    fireEvent.click(screen.getByRole("button", { name: /^\d+\s*Produtos abaixo do ponto de encomenda/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Existências" })).toBeInTheDocument();
  });

  it("a pesquisa global do topo encontra uma PO e abre o detalhe", async () => {
    render(<Casa />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisa global" }), { target: { value: "PO-2026-0137" } });
    fireEvent.click(await screen.findByRole("option", { name: /PO-2026-0137/ }));
    expect(await screen.findByRole("dialog", { name: "PO-2026-0137" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Encomendas a fornecedor", hidden: true })).toBeInTheDocument();
  });
});

describe("Ecrãs do menu", () => {
  it("o Hoje mostra a fila de trabalho com os números do mockup", () => {
    render(<Casa />);
    expect(item("Hoje")).toHaveAttribute("aria-current", "page");
    const fila = screen.getByRole("button", { name: /^3\s*POs por aprovar/ });
    expect(within(fila).getByText("3")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /^2\s*Guias abertas com divergências/ })).getByText("2")).toBeInTheDocument();
  });

  it("cada ecrã tem no máximo um botão primário", () => {
    render(<Casa />);
    for (const nome of ["Hoje", "Encomendas", "Fornecedores", "Stock", "Movimentos", "Encomendas de cliente", "Guias", "Contagens", "Armazéns"]) {
      separador(nome);
      // As ações das linhas (td.act) seguem o mockup (a PO pendente tem "Aprovar e enviar" primário): a regra vale para o cabeçalho e o corpo do ecrã.
      const primarios = [...painel().querySelectorAll("button.btn-p")].filter((b) => !b.closest("td.act"));
      expect(primarios.length, nome).toBeLessThanOrEqual(1);
    }
  });

  it("o texto, os alvos e os avisos seguem as regras: sem texto abaixo de 15 px e sem iframe", () => {
    render(<Casa />);
    for (const nome of ["Hoje", "Encomendas", "Stock", "Armazéns"]) {
      separador(nome);
      expect(painel().innerHTML).not.toMatch(/text-\[1[0-4]px\]|text-xs/);
    }
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("a fila do Hoje abre a lista já filtrada", () => {
    render(<Casa />);
    fireEvent.click(screen.getByRole("button", { name: /^3\s*POs por aprovar/ }));
    expect(item("Encomendas")).toHaveAttribute("aria-current", "page");
    expect(estado(/^Pendente/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("row", { name: /^Abrir PO-/ })).toHaveLength(3);
  });
});

describe("Encomendas", () => {
  it("filtra por estado e pesquisa por fornecedor", () => {
    render(<Casa />);
    separador("Encomendas");
    expect(screen.getAllByRole("row", { name: /^Abrir PO-/ })).toHaveLength(13);
    fireEvent.click(estado(/^Atrasadas/));
    expect(screen.getAllByRole("row", { name: /^Abrir PO-/ })).toHaveLength(4);
    fireEvent.click(estado(/^Todas/));
    fireEvent.change(screen.getByRole("searchbox", { name: /Pesquisar encomendas/ }), { target: { value: "zeta" } });
    expect(screen.getAllByRole("row", { name: /^Abrir PO-/ })).toHaveLength(1);
  });

  it("receber a PO da Silva & Filhos: o diálogo mostra a repartição, confirma, avisa e a PO fica Recebida", async () => {
    render(<Casa />);
    separador("Encomendas");
    fireEvent.click(screen.getByRole("row", { name: /^Abrir PO-2026-0137/ }));
    const folha = await screen.findByRole("dialog", { name: "PO-2026-0137" });
    fireEvent.click(within(folha).getByRole("button", { name: "Receber" }));
    const dlg = await screen.findByRole("dialog", { name: "Receber PO-2026-0137" });
    expect(within(dlg).getByText(/faltam 2 un/)).toBeInTheDocument();
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
    render(<Casa />);
    separador("Encomendas");
    fireEvent.click(screen.getByRole("row", { name: /^Abrir PO-2026-0137/ }));
    const folha = await screen.findByRole("dialog", { name: "PO-2026-0137" });
    fireEvent.click(within(folha).getByRole("button", { name: "Receber" }));
    const dlg = await screen.findByRole("dialog", { name: "Receber PO-2026-0137" });
    const campo = within(dlg).getByRole("spinbutton", { name: /Receber agora/ });
    fireEvent.change(campo, { target: { value: "9" } });
    expect(campo).toHaveValue(2);
  });

  it("aprovar e enviar exige confirmar num diálogo (nunca confirm()) e passa a Encomendado", async () => {
    render(<Casa />);
    separador("Encomendas");
    fireEvent.click(estado(/^Pendente/));
    fireEvent.click(screen.getAllByRole("button", { name: "Aprovar e enviar" })[0]);
    const dlg = await screen.findByRole("dialog", { name: /^Aprovar e enviar PO-/ });
    fireEvent.click(within(dlg).getByRole("button", { name: "Aprovar e enviar" }));
    await waitFor(() => expect(lerInventario().pos.filter((p) => p.status === "pending" && !p.deleted)).toHaveLength(2));
  });

  it("reverter uma receção pede motivo: o botão só fica ativo com 3 caracteres, e a regra que recusa aparece no diálogo", async () => {
    render(<Casa />);
    separador("Encomendas");
    fireEvent.click(screen.getByRole("row", { name: /^Abrir PO-2026-0136/ }));
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
  it("o stock filtra por estado e a linha do produto abre-se para mostrar os armazéns", async () => {
    render(<Casa />);
    separador("Stock");
    fireEvent.click(screen.getByRole("button", { name: /Em excesso/ }));
    const abrir = document.querySelectorAll<HTMLElement>('tr.click button[aria-expanded="false"]');
    expect(abrir.length).toBeGreaterThan(0);
    fireEvent.click(abrir[0]);
    expect(document.querySelectorAll("tr.subrow").length).toBeGreaterThan(0);
  });

  it("registar um ajuste sem motivo recusa na hora e com motivo regista no livro", async () => {
    render(<Casa />);
    separador("Movimentos");
    const antes = lerInventario().moves.length;
    fireEvent.click(screen.getAllByRole("button", { name: /Registar movimento/ })[0]);
    const dlg = await screen.findByRole("dialog", { name: /Registar movimento · 1 de 2/ });
    fireEvent.click(within(dlg).getByRole("button", { name: /^Ajuste/ }));
    const d2 = await screen.findByRole("dialog", { name: /2 de 2 · Ajuste/ });
    fireEvent.change(within(d2).getByLabelText(/^Produto/), { target: { value: "CD-80" } });
    fireEvent.click(within(d2).getByRole("button", { name: /^Registar 1 linha/ }));
    expect((await within(d2).findAllByText("Motivo obrigatório.")).length).toBeGreaterThan(0);
    expect(lerInventario().moves).toHaveLength(antes);
    fireEvent.change(within(d2).getByLabelText(/^Motivo/), { target: { value: "Contagem" } });
    fireEvent.click(within(d2).getByRole("button", { name: /^Registar 1 linha/ }));
    await waitFor(() => expect(lerInventario().moves).toHaveLength(antes + 1));
    expect(lerInventario().moves[antes]).toMatchObject({ type: "adjp", sku: "CD-80", qty: 1 });
  });
});

describe("Encomendas de cliente, guias e contagens", () => {
  it("a lista de ECs mostra o progresso em texto e filtra as prontas a expedir", () => {
    render(<Casa />);
    separador("Encomendas de cliente");
    expect(screen.getAllByRole("row", { name: /^Abrir EC-/ })).toHaveLength(9);
    fireEvent.click(estado(/^Prontas a expedir/));
    expect(screen.getAllByRole("row", { name: /^Abrir EC-/ })).toHaveLength(7);
    expect(screen.getAllByText(/servido ·/).length).toBeGreaterThan(0);
  });

  it("fechar uma guia com divergências pede nota", async () => {
    render(<Casa />);
    separador("Guias");
    fireEvent.click(screen.getByRole("row", { name: /^Abrir a guia GR 2026\/311/ }));
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
    render(<Casa />);
    separador("Contagens");
    fireEvent.click(screen.getByRole("row", { name: /^Abrir a contagem INV-2026-014/ }));
    const folha = await screen.findByRole("dialog", { name: "INV-2026-014" });
    expect(within(folha).getByRole("button", { name: "Finalizar" })).toBeDisabled();
  });
});

describe("Teclado e Repor", () => {
  it("'/' vai à pesquisa; setas movem entre linhas; Enter abre; Esc fecha e devolve o foco à linha", async () => {
    render(<Casa />);
    separador("Encomendas");
    fireEvent.keyDown(document.body, { key: "/" });
    expect(screen.getByRole("searchbox", { name: /Pesquisar encomendas/ })).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    const primeira = screen.getAllByRole("row", { name: /^Abrir PO-/ }).find((b) => b.hasAttribute("data-linha-func"))!;
    expect(primeira).toHaveFocus();
    fireEvent.keyDown(primeira, { key: "Enter" });
    fireEvent.click(primeira);
    const folha = await screen.findByRole("dialog");
    expect(folha).toBeInTheDocument();
    fireEvent.keyDown(folha, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Repor dados de demonstração apaga o que se fez (com diálogo próprio) e deixa o resto do protótipo", async () => {
    render(<Casa />);
    separador("Encomendas");
    fireEvent.click(estado(/^Pendente/));
    fireEvent.click(screen.getAllByRole("button", { name: "Aprovar e enviar" })[0]);
    const dlg = await screen.findByRole("dialog", { name: /^Aprovar e enviar PO-/ });
    fireEvent.click(within(dlg).getByRole("button", { name: "Aprovar e enviar" }));
    await waitFor(() => expect(lerInventario().pos.filter((p) => p.status === "pending" && !p.deleted)).toHaveLength(2));
    localStorage.setItem("outra-chave", "fica");
    fireEvent.click(screen.getByRole("button", { name: /^Repor dados de demonstração/ }));
    const conf = await screen.findByRole("dialog", { name: "Repor dados de demonstração" });
    fireEvent.click(within(conf).getByRole("button", { name: "Repor dados" }));
    await waitFor(() => expect(lerInventario().pos.filter((p) => p.status === "pending" && !p.deleted)).toHaveLength(3));
    expect(localStorage.getItem("outra-chave")).toBe("fica");
  });
});
