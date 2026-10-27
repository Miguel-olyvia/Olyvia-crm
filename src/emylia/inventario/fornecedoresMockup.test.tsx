import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import InventarioPagina from "./InventarioPagina";
import MenuInventario from "./MenuInventario";
import { recusa } from "./ajudaTestes";
import { nifCompleto } from "./base";
import { esquecerInventario, lerInventario } from "./loja";
import type { AbaInv } from "./ctxInv";
import { esquecerPerfil, mudarPerfil } from "./perfil";
// Os Fornecedores do Inventário contra o mockup (scrSup, newSupDlg, supSheet, openPortalSim, XP.suppliers e XP.items): cabeçalho, filtros, seleção e ações em massa, edição na célula,
// novo fornecedor com NIF e email únicos, a ficha com os cinco separadores, a simulação do portal, importar e as permissões.

function Casa() {
  const [aba, setAba] = useState<AbaInv>("sup");
  return <><MenuInventario aba={aba} aoIr={setAba} /><InventarioPagina aba={aba} aoMudarAba={setAba} /></>;
}
const painel = (): HTMLElement => document.getElementById("inv-painel") as HTMLElement;
const linha = (nome: RegExp): HTMLElement => within(painel()).getByRole("row", { name: nome });
const dialogo = (): HTMLElement => { const d = screen.getAllByRole("dialog"); return d[d.length - 1]; };
const botao = (raiz: HTMLElement, nome: RegExp | string): HTMLElement => within(raiz).getByRole("button", { name: nome });
const avisos = (t: RegExp | string): Promise<HTMLElement[]> => screen.findAllByText(t);
const abrirFicha = (nome: RegExp = /^Abrir a ficha de Fornecedor Alfa/): HTMLElement => { fireEvent.click(linha(nome)); return dialogo(); };
const separador = (folha: HTMLElement, nome: RegExp | string): void => { fireEvent.click(within(folha).getByRole("tab", { name: nome })); };

beforeEach(() => { esquecerPerfil(); esquecerInventario(); });
afterEach(() => cleanup());

describe("Fornecedores: lista", () => {
  it("o cabeçalho traz Exportar, Importar e Novo fornecedor, e o texto do mockup", async () => {
    render(<Casa />);
    const acoes = painel().querySelector(".ph-actions") as HTMLElement;
    expect(within(acoes).getAllByRole("button").map((b) => b.textContent)).toEqual(["Exportar", "Importar", "Novo fornecedor"]);
    expect(painel().querySelector("h1")?.textContent).toBe("Fornecedores");
    expect(painel().querySelector(".ph p")?.textContent).toBe("Criar um fornecedor é convidá-lo para o portal.");
  });

  it("mostra o alerta dos que esperam a ficha e os filtros do mockup, na ordem", async () => {
    render(<Casa />);
    const al = painel().querySelector(".alert.info") as HTMLElement;
    expect(al.textContent).toContain("1 fornecedor(es) à espera de preencher a ficha no portal: Beta Climatização. Filtrar");
    const card = painel().querySelector(".card.filters") as HTMLElement;
    expect(within(card).getByLabelText("Pesquisar fornecedores")).toBeTruthy();
    expect(Array.from(card.querySelectorAll("label.check")).map((l) => l.textContent?.trim())).toEqual(["À espera do fornecedor Novo", "Com catálogo por ligar", "Com preços por aprovar", "Ver eliminados"]);
    expect(Array.from(card.querySelectorAll("select[aria-label=Empresa] option")).map((o) => o.textContent)).toEqual(["Todas as empresas", "Empresa A (Lisboa)", "Empresa B (Porto)"]);
    expect(card.querySelector(".rules")?.textContent).toBe("Clique num valor da tabela para o editar (Enter grava, Esc cancela). Email repetido de equipa, cliente ou outro fornecedor é recusado.");
  });

  it("a tabela tem as colunas do mockup, o rodapé com a contagem e o filtro por empresa", async () => {
    render(<Casa />);
    const cab = Array.from(painel().querySelectorAll("thead th")).map((t) => t.textContent?.replace(/\s*[↑↓]$/, ""));
    expect(cab).toEqual(["", "Nome", "Código", "Contacto", "Cidade", "POs abertas", "SLA %", "Portal", "Preços por aprovar", "Estado", "Ações"]);
    expect(painel().querySelector(".tbl-foot span")?.textContent).toBe("6 fornecedor(es)");
    fireEvent.change(within(painel()).getByLabelText("Empresa"), { target: { value: "Empresa B (Porto)" } });
    expect(painel().querySelector(".tbl-foot span")?.textContent).toBe("2 fornecedor(es)");
    fireEvent.click(within(painel()).getByLabelText("Ver eliminados"));
    expect(painel().querySelector(".tbl-foot span")?.textContent).toBe("3 fornecedor(es)");
  });

  it("o convidado mostra o selo com a ficha em espera e o botão de simular; os preços abrem a ficha no separador certo", async () => {
    render(<Casa />);
    const beta = linha(/^Abrir a ficha de Beta/);
    expect(beta.querySelector(".badge.b-info")?.textContent).toBe("Convidado · à espera da ficha");
    expect(within(beta).getByRole("button", { name: /Simular entrada no portal/ })).toBeTruthy();
    fireEvent.click(within(linha(/^Abrir a ficha de Fornecedor Alfa/)).getByRole("button", { name: /por aprovar/ }));
    expect(within(dialogo()).getByRole("tab", { name: /^Preços por aprovar/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("selecionar mostra a barra de ações em massa; Mudar estado aplica-se aos selecionados", async () => {
    render(<Casa />);
    fireEvent.click(within(painel()).getByLabelText("Selecionar Gama Elétrica"));
    fireEvent.click(within(painel()).getByLabelText("Selecionar Épsilon Ferragens"));
    const barra = within(painel()).getByRole("region", { name: "Ações em massa" });
    expect(barra.querySelector("b")?.textContent).toBe("2 selecionado(s)");
    fireEvent.click(botao(barra, "Mudar estado"));
    fireEvent.change(within(dialogo()).getByLabelText("Novo estado"), { target: { value: "inactive" } });
    fireEvent.click(botao(dialogo(), "Aplicar"));
    expect(lerInventario().suppliers.filter((s) => !s.active).map((s) => s.id).sort()).toEqual(["eps", "gama", "omega"]);
    expect((await avisos("2 atualizado(s).")).length).toBeGreaterThan(0);
    expect(within(painel()).queryByRole("region", { name: "Ações em massa" })).toBeNull();
  });

  it("Eliminar em massa ignora quem tem encomendas em aberto e diz quantos", async () => {
    render(<Casa />);
    fireEvent.click(within(painel()).getByLabelText("Selecionar Fornecedor Alfa Materiais"));
    fireEvent.click(within(painel()).getByLabelText("Selecionar Gama Elétrica"));
    fireEvent.click(botao(within(painel()).getByRole("region", { name: "Ações em massa" }), "Eliminar"));
    fireEvent.click(botao(dialogo(), "Aplicar"));
    expect((await avisos("1 atualizado(s), 1 ignorado(s) pelas regras.")).length).toBeGreaterThan(0);
    expect(lerInventario().suppliers.find((s) => s.id === "gama")?.deleted).toBe(true);
    expect(lerInventario().suppliers.find((s) => s.id === "alfa")?.deleted).toBe(false);
  });
});

describe("Fornecedores: edição na célula", () => {
  it("clicar no nome edita; Enter grava com o aviso Gravado.", async () => {
    render(<Casa />);
    fireEvent.click(within(linha(/^Abrir a ficha de Gama/)).getAllByTitle("Clique para editar")[0]);
    const campo = screen.getByLabelText("Editar");
    fireEvent.change(campo, { target: { value: "Gama Nova" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(lerInventario().suppliers.find((s) => s.id === "gama")?.name).toBe("Gama Nova");
    expect((await avisos("Gravado.")).length).toBeGreaterThan(0);
  });

  it("um email de equipa é recusado com a mensagem do mockup e nada muda", async () => {
    render(<Casa />);
    const cel = within(linha(/^Abrir a ficha de Gama/)).getAllByTitle("Clique para editar");
    fireEvent.click(cel[3]);
    const campo = screen.getByLabelText("Editar");
    fireEvent.change(campo, { target: { value: "equipa@olyvia-demo.pt" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect((await avisos("Email já usado por Equipa (T. Marques).")).length).toBeGreaterThan(0);
    expect(lerInventario().suppliers.find((s) => s.id === "gama")?.email).toBe("vendas@gama.exemplo");
  });

  it("o interruptor Ativo grava logo; o prazo SLA mostra 'd' e recusa negativos", async () => {
    render(<Casa />);
    const gama = linha(/^Abrir a ficha de Gama/);
    fireEvent.click(within(gama).getByLabelText("Ativo"));
    expect(lerInventario().suppliers.find((s) => s.id === "gama")?.active).toBe(false);
    fireEvent.click(within(linha(/^Abrir a ficha de Gama/)).getByText("4 d"));
    const campo = screen.getByLabelText("Editar");
    fireEvent.change(campo, { target: { value: "-2" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect((await avisos("Prazo SLA: inteiro ≥ 0.")).length).toBeGreaterThan(0);
  });

  it("sem suppliers.manage as células ficam com cadeado e os botões desativados com o porquê", async () => {
    mudarPerfil("armazem");
    render(<Casa />);
    expect(within(linha(/^Abrir a ficha de Gama/)).queryAllByTitle("Clique para editar")).toHaveLength(0);
    const acoes = painel().querySelector(".ph-actions") as HTMLElement;
    for (const n of ["Importar", "Novo fornecedor"]) {
      const b = botao(acoes, n) as HTMLButtonElement;
      expect(b.disabled).toBe(true);
      expect(b.title).toBe("Sem permissão: requer suppliers.manage. Peça acesso a um administrador.");
    }
    expect((botao(acoes, "Exportar") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("Fornecedores: novo fornecedor", () => {
  const abrirNovo = (): HTMLElement => { fireEvent.click(botao(painel().querySelector(".ph-actions") as HTMLElement, "Novo fornecedor")); return dialogo(); };
  const preencher = (d: HTMLElement, v: Record<string, string>): void => { for (const [k, x] of Object.entries(v)) fireEvent.change(within(d).getByLabelText(new RegExp("^" + k)), { target: { value: x } }); };

  it("tem os campos, os dados para testar e os três botões do mockup", async () => {
    render(<Casa />);
    const d = abrirNovo();
    expect(Array.from(d.querySelectorAll("label.fl > span")).map((s) => s.textContent?.replace(" *", ""))).toEqual(["Empresa", "Nome do fornecedor", "NIF", "Email", "Nome do contacto"]);
    expect(d.querySelector("details.box summary")?.textContent).toBe("Dados para testar");
    expect(Array.from(d.querySelectorAll(".df button")).map((b) => b.textContent)).toEqual(["Cancelar", "Criar sem portal (preencho eu)", "Criar e enviar acesso ao portal"]);
  });

  it("recusa NIF inválido e email de equipa; avisa NIF repetido; só mostra erros dos campos preenchidos até tentar", async () => {
    render(<Casa />);
    const d = abrirNovo();
    preencher(d, { "Nome do fornecedor": "Novo Lda", NIF: "123456780", Email: "equipa@olyvia-demo.pt" });
    expect(d.querySelectorAll(".ferr")).toHaveLength(2);
    expect(within(d).getByText("NIF inválido (9 dígitos com dígito de controlo).")).toBeTruthy();
    fireEvent.click(botao(d, /Criar e enviar acesso/));
    expect((await avisos("NIF inválido (9 dígitos com dígito de controlo).")).length).toBeGreaterThan(0);
    expect(d.textContent).toContain("Indique quem recebe o acesso.");
    preencher(d, { NIF: lerInventario().suppliers[0].nif });
    expect(within(d).getByText(/NIF já usado por Fornecedor Alfa Materiais\. Confirme/)).toBeTruthy();
  });

  it("criar e enviar acesso convida: fica à espera da ficha e abre a ficha no Portal", async () => {
    render(<Casa />);
    const d = abrirNovo();
    preencher(d, { "Nome do fornecedor": "Novo Lda", NIF: nifCompleto("51234567"), Email: "geral@novo.exemplo", "Nome do contacto": "Rita" });
    fireEvent.click(botao(d, /Criar e enviar acesso/));
    const s = lerInventario().suppliers.find((x) => x.name === "Novo Lda");
    expect(s).toMatchObject({ portal: "invited", awaiting: true, code: "FOR-008", contact: "Rita" });
    expect(s?.invite).toMatchObject({ email: "geral@novo.exemplo", name: "Rita", state: "pending" });
    expect((await avisos("Acesso enviado para geral@novo.exemplo. À espera que o fornecedor preencha a ficha.")).length).toBeGreaterThan(0);
    expect(within(dialogo()).getByRole("tab", { name: "Portal" }).getAttribute("aria-selected")).toBe("true");
  });

  it("criar sem portal abre um rascunho com todos os separadores e só grava em Gravar fornecedor", async () => {
    render(<Casa />);
    const d = abrirNovo();
    preencher(d, { "Nome do fornecedor": "Rascunho SA" });
    fireEvent.click(botao(d, /Criar sem portal/));
    const folha = dialogo();
    expect(folha.textContent).toContain("Rascunho: pode preencher todos os separadores; nada é gravado até “Gravar fornecedor”.");
    expect(within(folha).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Resumo", "Dados", "Artigos e preços", "Preços por aprovar", "Portal"]);
    expect(lerInventario().suppliers.some((s) => s.name === "Rascunho SA")).toBe(false);
    fireEvent.click(botao(folha, /Gravar fornecedor/));
    expect(lerInventario().suppliers.some((s) => s.name === "Rascunho SA" && s.code === "FOR-008")).toBe(true);
    expect((await avisos("Fornecedor criado com 0 artigo(s).")).length).toBeGreaterThan(0);
  });
});

describe("Fornecedores: a ficha", () => {
  it("tem o cabeçalho, os cinco separadores e Fechar no rodapé", async () => {
    render(<Casa />);
    const f = abrirFicha();
    expect(f.querySelector(".crumbs")?.textContent).toBe("Compras › Fornecedor");
    expect(f.querySelector("h2")?.textContent).toBe("Fornecedor Alfa Materiais");
    expect(Array.from(f.querySelectorAll(".sh-head .badge")).map((b) => b.textContent)).toEqual(["FOR-001", "Ativo", "Ativo"]);
    expect(within(f).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Resumo", "Dados", "Artigos e preços4", "Preços por aprovar4", "Portal"]);
    expect(Array.from(f.querySelectorAll(".sh-foot button")).map((b) => b.textContent)).toEqual(["Fechar"]);
    expect(f.querySelectorAll(".kpi")).toHaveLength(5);
  });

  it("Dados: com portal ativo o NIF e a empresa ficam bloqueados; gravar valida o código repetido", async () => {
    render(<Casa />);
    const f = abrirFicha();
    separador(f, "Dados");
    expect(f.textContent).toContain("NIF e empresa bloqueados porque o portal está ativo");
    expect((within(f).getByLabelText(/^NIF/) as HTMLInputElement).disabled).toBe(true);
    expect((within(f).getByLabelText(/^Empresa/) as HTMLSelectElement).disabled).toBe(true);
    expect(Array.from(f.querySelectorAll(".sh-foot button")).map((b) => b.textContent)).toEqual(["Cancelar", "Gravar"]);
    fireEvent.change(within(f).getByLabelText(/^Código \*/), { target: { value: "FOR-002" } });
    fireEvent.click(botao(f, "Gravar"));
    expect(within(f).getByText("Código já usado.")).toBeTruthy();
    expect((await avisos("Corrija os campos assinalados em Dados.")).length).toBeGreaterThan(0);
  });

  it("Dados: Revogar acesso desbloqueia o NIF", async () => {
    render(<Casa />);
    const f = abrirFicha();
    separador(f, "Dados");
    fireEvent.click(botao(f, /Revogar acesso para editar/));
    fireEvent.click(botao(dialogo(), "Revogar"));
    expect(lerInventario().suppliers.find((s) => s.id === "alfa")?.portal).toBe("revoked");
  });

  it("Artigos: ★ muda o preferido, a edição na célula grava o preço e Remover recusa com encomendas abertas", async () => {
    render(<Casa />);
    const f = abrirFicha(/^Abrir a ficha de Zeta/);
    separador(f, /^Artigos e preços/);
    const zs = within(f).getAllByRole("row").find((r) => r.textContent?.includes("ZS-450M")) as HTMLElement;
    fireEvent.click(within(zs).getByRole("button", { name: "Marcar como preferido" }));
    expect(lerInventario().items.find((i) => i.ref === "ZS-450M")?.pref).toBe(true);
    expect((await avisos("Fornecedor preferido atualizado.")).length).toBeGreaterThan(0);
    fireEvent.click(within(within(f).getAllByRole("row").find((r) => r.textContent?.includes("ZS-450M")) as HTMLElement).getByText("121,00 €"));
    const campo = screen.getByLabelText("Editar");
    fireEvent.change(campo, { target: { value: "120.5" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(lerInventario().items.find((i) => i.ref === "ZS-450M")?.price).toBe(120.5);
    expect(lerInventario().products.find((p) => p.sku === "PV-450")?.cost).toBe(120.5);
  });

  it("Artigos: adicionar um artigo valida a referência repetida e depois acrescenta", async () => {
    render(<Casa />);
    const f = abrirFicha(/^Abrir a ficha de Gama/);
    separador(f, /^Artigos e preços/);
    fireEvent.change(within(f).getByLabelText(/^Produto/), { target: { value: "KF-10" } });
    fireEvent.change(within(f).getByLabelText(/^Ref\. fornecedor/), { target: { value: "GM-NOVO" } });
    fireEvent.click(botao(f, "Adicionar artigo"));
    expect((await avisos("Indique o preço.")).length).toBeGreaterThan(0);
    fireEvent.change(within(f).getByLabelText(/^Preço por embalagem/), { target: { value: "9.9" } });
    fireEvent.click(botao(f, "Adicionar artigo"));
    expect(lerInventario().items.find((i) => i.ref === "GM-NOVO")).toMatchObject({ sku: "KF-10", price: 9.9, sup: "gama" });
  });

  it("Preços: aceitar atualiza o artigo; recusar pede a nota e regista; sem products.manage_prices fica só leitura", async () => {
    render(<Casa />);
    const f = abrirFicha();
    separador(f, /^Preços por aprovar/);
    const l = within(f).getAllByRole("row").find((r) => r.textContent?.includes("ALF-PV450")) as HTMLElement;
    fireEvent.click(botao(l, "Aceitar"));
    expect(lerInventario().items.find((i) => i.ref === "ALF-PV450")?.price).toBe(124.5);
    expect((await avisos("Preço aceite: artigo e custo de referência atualizados.")).length).toBeGreaterThan(0);
    const l2 = within(f).getAllByRole("row").find((r) => r.textContent?.includes("ALF-EST4")) as HTMLElement;
    fireEvent.click(botao(l2, "Recusar"));
    fireEvent.change(within(dialogo()).getByLabelText("Nota para o fornecedor"), { target: { value: "caro" } });
    fireEvent.click(botao(dialogo(), "Recusar"));
    expect(lerInventario().prices.find((p) => p.state === "rejected")).toMatchObject({ note: "caro", by: "Admin Demo" });
    expect(f.textContent).toContain("Decididos (2)");
    cleanup();
    mudarPerfil("armazem");
    render(<Casa />);
    const g = abrirFicha();
    separador(g, /^Preços por aprovar/);
    expect(g.textContent).toContain("Decidir preços exige products.manage_prices");
  });

  it("Portal: o catálogo liga com a sugestão, cria produtos e dispensa/repõe", async () => {
    render(<Casa />);
    const f = abrirFicha(/^Abrir a ficha de Zeta/);
    separador(f, "Portal");
    expect(Array.from(f.querySelectorAll(".dl .lbl")).map((e) => e.textContent)).toEqual(["Estado", "NIF", "Utilizadores ativos", "Último acesso", "Artigos no catálogo", "Dados confirmados"]);
    expect(botao(f, /Aceitar sugestões exatas \(2\)/)).toBeTruthy();
    fireEvent.click(botao(f, /Aceitar sugestões exatas/));
    expect(lerInventario().catalog.filter((c) => c.sup === "zeta" && c.state === "linked")).toHaveLength(5);
    const linhaBat = within(f).getAllByRole("row").find((r) => r.textContent?.includes("ZS-BAT5")) as HTMLElement;
    fireEvent.click(botao(linhaBat, "Criar produto"));
    expect(lerInventario().products.some((p) => p.sku === "BAT5")).toBe(true);
    expect((await avisos("Produto BAT5 criado e ligado.")).length).toBeGreaterThan(0);
  });

  it("Portal: reenviar e revogar o acesso de quem está convidado; o catálogo vazio diz 'Nada nesta vista'", async () => {
    render(<Casa />);
    const f = abrirFicha(/^Abrir a ficha de Beta/);
    expect(f.textContent).toContain("À espera que o fornecedor preencha a ficha.");
    separador(f, "Portal");
    expect(f.textContent).toContain("Utilizador do portal: Responsável de compras · compras@beta.exemplo");
    expect(f.textContent).toContain("Nada nesta vista");
    fireEvent.click(botao(f, /Reenviar$/));
    expect((await avisos("Acesso reenviado para compras@beta.exemplo.")).length).toBeGreaterThan(0);
  });
});

describe("Fornecedores: simulação do portal", () => {
  it("os quatro passos recusam a password curta e, ao submeter, a ficha e o catálogo chegam ao CRM", async () => {
    render(<Casa />);
    fireEvent.click(within(linha(/^Abrir a ficha de Beta/)).getByRole("button", { name: /Simular entrada no portal/ }));
    const d = dialogo();
    expect(d.className).toContain("portalsim");
    expect(Array.from(d.querySelectorAll(".ps-steps span")).map((s) => s.textContent)).toEqual(["1. Primeiro acesso", "2. Definir password", "3. Ficha e catálogo", "4. Concluído"]);
    fireEvent.click(botao(d, "Abrir convite e entrar"));
    fireEvent.change(within(d).getByLabelText(/^Nova password/), { target: { value: "curta" } });
    fireEvent.click(botao(d, "Definir password"));
    expect(d.textContent).toContain("Password com pelo menos 8 caracteres.");
    fireEvent.change(within(d).getByLabelText(/^Nova password/), { target: { value: "segredo123" } });
    fireEvent.change(within(d).getByLabelText(/^Repetir password/), { target: { value: "outra1234" } });
    fireEvent.click(botao(d, "Definir password"));
    expect(d.textContent).toContain("As passwords não coincidem.");
    fireEvent.change(within(d).getByLabelText(/^Repetir password/), { target: { value: "segredo123" } });
    fireEvent.click(botao(d, "Definir password"));
    fireEvent.click(botao(d, "Submeter"));
    expect(d.textContent).toContain("Código postal no formato 0000-000.");
    fireEvent.click(botao(d, "Preencher com exemplo"));
    fireEvent.click(botao(d, "Submeter"));
    expect(d.textContent).toContain("Obrigado! Ficha submetida.");
    expect(d.textContent).toContain("3 artigo(s) enviados para o catálogo.");
    const s = lerInventario().suppliers.find((x) => x.id === "beta");
    expect(s).toMatchObject({ portal: "active", awaiting: false, city: "Porto", dataConfirmed: true });
    expect(lerInventario().catalog.filter((c) => c.sup === "beta")).toHaveLength(3);
    fireEvent.click(botao(d, /Voltar ao CRM/));
    expect(within(dialogo()).getByRole("tab", { name: "Portal" }).getAttribute("aria-selected")).toBe("true");
  });

  it("quem não tem convite pendente não entra no portal simulado (menu Portal do fornecedor)", async () => {
    render(<Casa />);
    expect(within(linha(/^Abrir a ficha de Gama/)).queryByRole("button", { name: /Simular entrada/ })).toBeNull();
  });
});

