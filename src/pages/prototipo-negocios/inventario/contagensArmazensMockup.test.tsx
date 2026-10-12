// Contagens e Armazéns iguais ao mockup: ações no cabeçalho, filtros e chips, a folha da contagem com edição inline, os cartões dos armazéns com edição na própria célula,
// exportar/importar e as permissões por perfil.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import InventarioPagina from "./InventarioPagina";
import MenuInventario from "./MenuInventario";
import type { AbaInv } from "./ctxInv";
import { exigir } from "./base";
import { criarContagem } from "./contagens";
import { paraCsv } from "./csvInv";
import { defArmazens, defContagem } from "./importContArm";
import { esquecerInventario, lerInventario } from "./loja";
import { esquecerPerfil, mudarPerfil } from "./perfil";

const NOME_MENU: Record<string, string> = { Contagens: "Contagens", Armazéns: "Armazéns" };
const item = (nome: string): HTMLElement => within(screen.getAllByTestId("menu-inventario")[0]).getByRole("button", { name: new RegExp("^" + NOME_MENU[nome]) });
const separador = (nome: string): void => { fireEvent.click(item(nome)); };
function Casa() {
  const [aba, setAba] = useState<AbaInv>("hoje");
  return <><MenuInventario aba={aba} aoIr={setAba} /><InventarioPagina aba={aba} aoMudarAba={setAba} /></>;
}
const acoes = (): HTMLElement => document.querySelector(".ph-actions") as HTMLElement;
const aviso = async (texto: string): Promise<void> => { expect((await screen.findAllByText(texto)).length).toBeGreaterThan(0); };
const abrirContagem = async (): Promise<HTMLElement> => {
  render(<Casa />);
  separador("Contagens");
  fireEvent.click(screen.getByRole("row", { name: /^Abrir a contagem INV-2026-014/ }));
  return screen.findByRole("dialog", { name: "INV-2026-014" });
};
const cartao = (nome: RegExp): HTMLElement => screen.getByRole("heading", { name: nome }).closest("article") as HTMLElement;
const contagem = (id = "INV-2026-014") => lerInventario().counts.find((c) => c.id === id)!;

beforeEach(() => { esquecerPerfil(); esquecerInventario(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe("Contagens: a lista", () => {
  it("o botão Nova contagem está dentro do cabeçalho, com os chips de estado e os números do mockup", () => {
    render(<Casa />);
    separador("Contagens");
    expect(within(acoes()).getByRole("button", { name: "Nova contagem" })).toBeEnabled();
    const chips = within(screen.getByRole("group", { name: "Estado das contagens" }));
    expect(chips.getByRole("button", { name: /^Todas 3$/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chips.getByRole("button", { name: /^Em contagem/ }));
    expect(screen.getAllByRole("row", { name: /^Abrir a contagem/ })).toHaveLength(1);
    expect(screen.getByText(/^Parada há \d+ dias$/)).toBeInTheDocument();
    fireEvent.click(chips.getByRole("button", { name: /^Canceladas/ }));
    expect(screen.getAllByRole("row", { name: /^Abrir a contagem/ })).toHaveLength(1);
  });

  it("cada linha tem o documento a negrito, o progresso (.prog e 'x / y contadas') e o botão Abrir", () => {
    render(<Casa />);
    separador("Contagens");
    const linha = screen.getByRole("row", { name: /^Abrir a contagem INV-2026-014/ });
    expect(linha.querySelector(".mono b")?.textContent).toBe("INV-2026-014");
    expect(linha.querySelector(".prog span")).not.toBeNull();
    expect(within(linha).getByText(/^\d+ \/ \d+ contadas$/)).toBeInTheDocument();
    expect(linha.querySelector("td.act")).not.toBeNull();
    fireEvent.click(within(linha).getByRole("button", { name: "Abrir" }));
  });

  it("Nova contagem cria a contagem e abre a folha; uma regra recusada mantém o diálogo", async () => {
    render(<Casa />);
    separador("Contagens");
    fireEvent.click(within(acoes()).getByRole("button", { name: "Nova contagem" }));
    const dlg = await screen.findByRole("dialog", { name: "Nova contagem" });
    fireEvent.click(within(dlg).getByRole("button", { name: "Começar contagem" }));
    await aviso("Já existe uma contagem em curso que cobre este armazém/categoria.");
    expect(screen.getByRole("dialog", { name: "Nova contagem" })).toBeInTheDocument();
    fireEvent.change(within(dlg).getByLabelText(/^Armazém/), { target: { value: "POR" } });
    fireEvent.change(within(dlg).getByLabelText("Categoria"), { target: { value: "Isolamento" } });
    fireEvent.change(within(dlg).getByLabelText("Contagem inicial"), { target: { value: "system" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Começar contagem" }));
    await waitFor(() => expect(lerInventario().counts).toHaveLength(4));
    expect(await screen.findByRole("dialog", { name: "INV-2026-015" })).toBeInTheDocument();
  });
});

describe("Contagens: a folha", () => {
  it("tem o cabeçalho com progresso e as quatro ações, e a tabela com as colunas do mockup", async () => {
    const folha = await abrirContagem();
    for (const r of ["Iniciada", "Última atividade", "Progresso"]) expect(within(folha).getByText(r)).toBeInTheDocument();
    expect(within(folha).getAllByText("Por resolver").length).toBeGreaterThan(0);
    for (const b of [/Câmara \/ leitor/, /Exportar/, /Importar/, /Preencher contadas = esperado/]) expect(within(folha).getByRole("button", { name: b })).toBeEnabled();
    const cols = within(folha).getAllByRole("columnheader").map((h) => h.textContent);
    expect(cols).toEqual(["Produto", "Sistema", "Movida durante", "Esperado", "Contada", "Diferença", "Resolução", "Nota"]);
    expect(within(folha).getByText(/Diferença = contada − \(sistema/)).toBeInTheDocument();
  });

  it("a quantidade contada grava ao sair do campo e recusa o que não é inteiro ≥ 0", async () => {
    const folha = await abrirContagem();
    const campo = within(folha).getAllByLabelText(/^Contada /)[0] as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "-1" } });
    fireEvent.blur(campo);
    await aviso("Contada: inteiro ≥ 0.");
    const antes = contagem().lines[0].counted;
    expect(antes).not.toBe(-1);
    fireEvent.change(within(folha).getAllByLabelText(/^Contada /)[0], { target: { value: "7" } });
    fireEvent.blur(within(folha).getAllByLabelText(/^Contada /)[0]);
    await waitFor(() => expect(contagem().lines[0].counted).toBe(7));
  });

  it("Preencher = esperado, resolver as diferenças e Finalizar gera os movimentos de ajuste", async () => {
    const folha = await abrirContagem();
    const fin = within(folha).getByRole("button", { name: "Finalizar" });
    expect(fin).toBeDisabled();
    expect(fin).toHaveAttribute("title", "Há linhas por contar ou diferenças por resolver");
    fireEvent.click(within(folha).getByRole("button", { name: /Preencher contadas = esperado/ }));
    await aviso("Linhas por contar preenchidas com o esperado.");
    for (const s of within(folha).getAllByLabelText("Resolução")) fireEvent.change(s, { target: { value: "adjusted" } });
    await waitFor(() => expect(within(folha).getByRole("button", { name: "Finalizar" })).toBeEnabled());
    expect(within(folha).getByText("Pronta a finalizar")).toBeInTheDocument();
    fireEvent.click(within(folha).getByRole("button", { name: "Finalizar" }));
    await waitFor(() => expect(contagem().state).toBe("final"));
    await waitFor(() => expect(within(screen.getByRole("dialog", { name: "INV-2026-014" })).getByText("Movimentos gerados")).toBeInTheDocument());
  });

  it("a nota edita-se ao sair do campo (só nas linhas com diferença)", async () => {
    const folha = await abrirContagem();
    const nota = within(folha).getAllByLabelText("Nota")[0] as HTMLInputElement;
    fireEvent.change(nota, { target: { value: "caixa danificada" } });
    fireEvent.blur(nota);
    await waitFor(() => expect(contagem().lines.some((l) => l.note === "caixa danificada")).toBe(true));
  });

  it("o leitor soma 1 à contada; um código de fora recusa com a mensagem do mockup", async () => {
    const folha = await abrirContagem();
    fireEvent.click(within(folha).getByRole("button", { name: /Câmara \/ leitor/ }));
    const dlg = await screen.findByRole("dialog", { name: "Contar com leitor/câmara" });
    expect(within(dlg).getByText("Cada leitura soma 1 à contada.")).toBeInTheDocument();
    const entrada = within(dlg).getByPlaceholderText("Leia ou escreva o código e Enter");
    fireEvent.change(entrada, { target: { value: "XPTO" } });
    fireEvent.keyDown(entrada, { key: "Enter" });
    await aviso("Código fora desta contagem: XPTO");
    const botoes = within(dlg).getAllByRole("button").filter((b) => b.classList.contains("btn") && b.querySelector(".mono"));
    const antes = contagem().lines.map((l) => l.counted);
    fireEvent.click(botoes[0]);
    await waitFor(() => expect(contagem().lines[0].counted).toBe((antes[0] ?? 0) + 1));
    fireEvent.click(within(dlg).getByRole("button", { name: "Concluir" }));
  });

  it("Cancelar contagem pede motivo e a contagem fica cancelada", async () => {
    const folha = await abrirContagem();
    fireEvent.click(within(folha).getByRole("button", { name: "Cancelar contagem" }));
    const dlg = await screen.findByRole("dialog", { name: "Cancelar INV-2026-014" });
    expect(within(dlg).getByRole("button", { name: "Cancelar contagem" })).toBeDisabled();
    fireEvent.change(within(dlg).getByRole("textbox"), { target: { value: "armazém fechado" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Cancelar contagem" }));
    await waitFor(() => expect(contagem()).toMatchObject({ state: "cancelled", cancelReason: "armazém fechado" }));
  });

  it("numa contagem finalizada a quantidade fica bloqueada e oferece Registar ajuste", async () => {
    render(<Casa />);
    separador("Contagens");
    fireEvent.click(screen.getByRole("row", { name: /^Abrir a contagem INV-2026-013/ }));
    const folha = await screen.findByRole("dialog", { name: "INV-2026-013" });
    expect(within(folha).getByRole("button", { name: /Câmara \/ leitor/ })).toBeDisabled();
    expect(within(folha).getByRole("button", { name: /Câmara \/ leitor/ })).toHaveAttribute("title", "Contagem fechada: corrija quantidades com um ajuste em Movimentos");
    expect(within(folha).getAllByLabelText(/^Bloqueado: Contagem finalizada/).length).toBeGreaterThan(0);
    fireEvent.click(within(folha).getAllByRole("button", { name: /Registar ajuste/ })[0]);
    expect(await screen.findByRole("dialog", { name: /ajuste/i })).toBeInTheDocument();
  });
});

describe("Contagens: importar, exportar e permissões", () => {
  it("o CSV da contagem tem as colunas do mockup e a importação só aceita a coluna contada", () => {
    const db = lerInventario();
    const def = defContagem(db, "INV-2026-014");
    expect(paraCsv(def, def.linhas()).split("\r\n")[0].replace("﻿", "")).toBe("sku;produto;sistema;contada");
    expect(def.verificar({ sku: "NAO-EXISTE", contada: "1" }, db)).toEqual({ key: "NAO-EXISTE", st: "Erro", msg: "Produto fora desta contagem." });
    const sku = db.counts.find((c) => c.id === "INV-2026-014")!.lines[0].sku;
    expect(def.verificar({ sku, contada: "x" }, db)).toMatchObject({ st: "Erro", msg: "Contada: inteiro ≥ 0." });
    expect(def.verificar({ sku, contada: "9" }, db).st).toBe("Atualizar");
  });

  it("importar na folha atualiza a quantidade contada", async () => {
    const folha = await abrirContagem();
    const sku = contagem().lines[0].sku;
    fireEvent.click(within(folha).getByRole("button", { name: /Importar/ }));
    const dlg = await screen.findByRole("dialog", { name: "Importar linhas da contagem" });
    fireEvent.change(within(dlg).getByLabelText("Conteúdo CSV"), { target: { value: `sku;produto;sistema;contada\n${sku};x;1;11` } });
    fireEvent.click(within(dlg).getByRole("button", { name: /Pré-visualizar/ }));
    fireEvent.click(await within(dlg).findByRole("button", { name: "Importar 1 linha(s)" }));
    await waitFor(() => expect(contagem().lines[0].counted).toBe(11));
  });

  it("o perfil sem inventory.count tem tudo desativado, com o porquê, e as regras recusam", async () => {
    mudarPerfil("consulta");
    render(<InventarioPagina aba="cont" aoMudarAba={() => undefined} />);
    const nova = within(acoes()).getByRole("button", { name: "Nova contagem" });
    expect(nova).toBeDisabled();
    expect(nova).toHaveAttribute("title", "Sem permissão: requer inventory.count. Peça acesso a um administrador.");
    fireEvent.click(screen.getByRole("row", { name: /^Abrir a contagem INV-2026-014/ }));
    const folha = await screen.findByRole("dialog", { name: "INV-2026-014" });
    expect(within(folha).getByRole("button", { name: "Finalizar" })).toBeDisabled();
    expect(within(folha).getByRole("button", { name: "Cancelar contagem" })).toBeDisabled();
    expect(() => criarContagem(lerInventario(), { wh: "POR", cat: "Isolamento", init: "blank" })).toThrow("Sem permissão: criar contagens (requer inventory.count).");
    expect(() => exigir("inventory.count")).toThrow("Sem permissão: inventory.count (requer inventory.count).");
  });
});

describe("Armazéns", () => {
  it("as ações estão no cabeçalho e os cartões têm o DOM do mockup", () => {
    render(<Casa />);
    separador("Armazéns");
    const a = within(acoes());
    for (const b of ["Exportar", "Importar", "Novo armazém"]) expect(a.getByRole("button", { name: b })).toBeEnabled();
    expect(a.getByLabelText(/Ver eliminados/)).not.toBeChecked();
    const c = cartao(/Armazém Central/);
    expect(c.classList.contains("whcard")).toBe(true);
    expect(c.querySelector(".stats")?.textContent).toMatch(/produtos.*valor.*abaixo do mínimo/);
    expect(within(c).getByText("Por defeito")).toBeInTheDocument();
    for (const l of ["Morada", "Código postal", "Cidade", "Gestor", "Telefone", "Email", "Capacidade", "Coordenadas"]) expect(within(c).getByText(l)).toBeInTheDocument();
    for (const b of ["Ver existências", "Movimentos", "Registar movimento", "Mais ações"]) expect(within(c).getByRole("button", { name: b })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Definições de inventário" })).toBeInTheDocument();
  });

  it("cada campo edita-se na própria célula: Enter grava, Esc cancela e a regra do código repetido recusa", async () => {
    render(<Casa />);
    separador("Armazéns");
    const c = cartao(/Armazém Central/);
    fireEvent.click(within(c).getByText("Lisboa"));
    const campo = within(c).getByLabelText("Cidade");
    fireEvent.change(campo, { target: { value: "Amadora" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    await waitFor(() => expect(lerInventario().warehouses.find((w) => w.id === "LIS")?.city).toBe("Amadora"));
    await aviso("Gravado.");
    fireEvent.click(within(cartao(/Armazém Central/)).getByText("Amadora"));
    fireEvent.keyDown(within(cartao(/Armazém Central/)).getByLabelText("Cidade"), { key: "Escape" });
    expect(lerInventario().warehouses.find((w) => w.id === "LIS")?.city).toBe("Amadora");
    fireEvent.click(within(cartao(/Armazém Central/)).getByText("ARM-01"));
    const cod = within(cartao(/Armazém Central/)).getByLabelText("Código");
    fireEvent.change(cod, { target: { value: "arm-03" } });
    fireEvent.keyDown(cod, { key: "Enter" });
    await aviso("Código já usado.");
  });

  it("o interruptor Ativo do armazém por defeito recusa com a mensagem do mockup", async () => {
    render(<Casa />);
    separador("Armazéns");
    fireEvent.click(within(cartao(/Armazém Central/)).getByRole("checkbox", { name: "Ativo" }));
    await aviso("É o armazém por defeito: escolha outro nas Definições primeiro.");
    expect(lerInventario().warehouses.find((w) => w.id === "LIS")?.active).toBe(true);
  });

  it("o menu Mais ações edita e elimina; eliminar o armazém por defeito é recusado; Ver eliminados mostra os eliminados e Restaurar volta a pô-los", async () => {
    render(<Casa />);
    separador("Armazéns");
    fireEvent.click(within(cartao(/Armazém Sul/)).getByRole("button", { name: "Mais ações" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Eliminar/ }));
    const dlg = await screen.findByRole("dialog", { name: /^Eliminar Armazém Sul/ });
    fireEvent.click(within(dlg).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(lerInventario().warehouses.find((w) => w.id === "FAR")?.deleted).toBe(true));
    expect(screen.queryByRole("heading", { name: /Armazém Sul/ })).toBeNull();
    fireEvent.click(within(acoes()).getByLabelText(/Ver eliminados/));
    const sul = cartao(/Armazém Sul/);
    expect(sul.classList.contains("deleted")).toBe(true);
    expect(within(sul).getByText("Eliminado")).toBeInTheDocument();
    fireEvent.click(within(sul).getAllByRole("button", { name: /Restaurar/ })[0]);
    await waitFor(() => expect(lerInventario().warehouses.find((w) => w.id === "FAR")?.deleted).toBe(false));
    fireEvent.click(within(cartao(/Armazém Central/)).getByRole("button", { name: "Mais ações" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Eliminar/ }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: /^Eliminar Armazém Central/ })).getByRole("button", { name: "Eliminar" }));
    await aviso("É o armazém por defeito.");
  });

  it("Novo armazém valida ao gravar (Obrigatório., Formato 0000-000.) e mostra as coordenadas do código postal", async () => {
    render(<Casa />);
    separador("Armazéns");
    fireEvent.click(within(acoes()).getByRole("button", { name: "Novo armazém" }));
    const dlg = await screen.findByRole("dialog", { name: "Novo armazém" });
    expect(within(dlg).getByDisplayValue("ARM-" + String(lerInventario().warehouses.length + 1).padStart(2, "0"))).toBeInTheDocument();
    expect(within(dlg).getByText("Indique o código postal (0000-000) para obter as coordenadas.")).toBeInTheDocument();
    fireEvent.change(within(dlg).getByLabelText(/Código postal/), { target: { value: "12" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Gravar" }));
    expect(await within(dlg).findByText("Obrigatório.")).toBeInTheDocument();
    expect(within(dlg).getByText("Formato 0000-000.")).toBeInTheDocument();
    fireEvent.change(within(dlg).getByLabelText(/^Nome/), { target: { value: "Armazém Norte" } });
    fireEvent.change(within(dlg).getByLabelText(/Código postal/), { target: { value: "4000-100" } });
    expect(within(dlg).getByText(/Coordenadas obtidas pelo código postal/)).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole("button", { name: "Gravar" }));
    await waitFor(() => expect(lerInventario().warehouses.some((w) => w.name === "Armazém Norte" && w.lat != null)).toBe(true));
  });

  it("as definições mudam o armazém por defeito e o momento da baixa", async () => {
    render(<Casa />);
    separador("Armazéns");
    fireEvent.click(screen.getByRole("radio", { name: /Proposta aceite/ }));
    await waitFor(() => expect(lerInventario().settings.deduction).toBe("proposal"));
    await aviso("Baixa na proposta aceite.");
    fireEvent.change(screen.getByLabelText(/^Armazém por defeito/), { target: { value: "POR" } });
    await waitFor(() => expect(lerInventario().settings.defaultWh).toBe("POR"));
  });

  it("o CSV dos armazéns tem as colunas do mockup e a importação cria e atualiza", async () => {
    const db = lerInventario();
    const def = defArmazens(db);
    expect(paraCsv(def, def.linhas()).split("\r\n")[0].replace("﻿", "")).toBe("codigo;nome;morada;codigo_postal;cidade;ativo;serve_clientes");
    expect(def.verificar({ codigo: "ARM-01", nome: "x", codigo_postal: "", ativo: "nao", serve_clientes: "sim" }, db)).toMatchObject({ st: "Erro", msg: "Armazém por defeito tem de estar ativo e servir clientes." });
    render(<Casa />);
    separador("Armazéns");
    fireEvent.click(within(acoes()).getByRole("button", { name: "Importar" }));
    const dlg = await screen.findByRole("dialog", { name: "Importar armazéns" });
    fireEvent.change(within(dlg).getByLabelText("Conteúdo CSV"), { target: { value: "codigo;nome;morada;codigo_postal;cidade;ativo;serve_clientes\nARM-09;Armazém Novo;Rua A;1000-001;Lisboa;sim;sim\nARM-03;Sul;;;;nao;nao\n;sem código;;;;sim;sim" } });
    fireEvent.click(within(dlg).getByRole("button", { name: /Pré-visualizar/ }));
    expect(await within(dlg).findByText("1 Novo")).toBeInTheDocument();
    expect(within(dlg).getByText("1 Atualizar")).toBeInTheDocument();
    expect(within(dlg).getByText("1 Erro")).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole("button", { name: "Importar 2 linha(s)" }));
    await waitFor(() => expect(lerInventario().warehouses.some((w) => w.code === "ARM-09" && w.name === "Armazém Novo")).toBe(true));
    expect(lerInventario().warehouses.find((w) => w.code === "ARM-03")?.name).toBe("Sul");
  });

  it("sem inventory.manage as ações estão desativadas e os campos mostram o cadeado", () => {
    render(<Casa />);
    separador("Armazéns");
    act(() => mudarPerfil("compras"));
    const nova = within(acoes()).getByRole("button", { name: "Novo armazém" });
    expect(nova).toBeDisabled();
    expect(nova).toHaveAttribute("title", "Sem permissão: requer inventory.manage. Peça acesso a um administrador.");
    expect(within(acoes()).getByRole("button", { name: "Importar" })).toBeDisabled();
    const c = cartao(/Armazém Central/);
    expect(within(c).getByRole("button", { name: "Registar movimento" })).toBeDisabled();
    expect(c.querySelector(".lk .lk-ic")).not.toBeNull();
    expect(c.querySelector("button.ie")).toBeNull();
    expect(screen.getByLabelText(/^Armazém por defeito/)).toBeDisabled();
  });
});
