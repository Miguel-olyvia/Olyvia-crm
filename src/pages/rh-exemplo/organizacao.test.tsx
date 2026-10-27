// Arranque da página «Organização» do RH de exemplo: a árvore (Grupo, Empresas, Filiais, Centros), o painel de um nó com
// «Trabalha noutro centro», «Ligar pessoa» a atualizar contadores e painel, «Desligar» a pedir motivo, e o teclado da árvore.
// Tudo em memória, sem base.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderRh, reporRhTeste, rhTeste } from "@/test/rhExemploProviders";
import { menuSections } from "@/components/sidebar/menuConfig";
import * as K from "@/components/rh-exemplo/dados/constantes";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { ligacoesDoCentro } from "@/components/rh-exemplo/organizacao/arvore";
import { lerOrganizacao } from "@/components/rh-exemplo/organizacao/lojaOrganizacao";
import RhOrganizacao from "./RhOrganizacao";

// A organizacao activa e o Supabase vem de src/test/rhExemploProviders.tsx (organizacao de teste, base vazia).
vi.mock("@/contexts/CompanyContext", async () => (await import("@/test/rhExemploProviders")).moduloCompanyFalso());
vi.mock("@/contexts/PermissionsContext", async () => (await import("@/test/rhExemploProviders")).moduloPermissoesFalso());
vi.mock("@/integrations/supabase/client", async () => (await import("@/test/rhExemploProviders")).moduloSupabaseFalso());

// A leitura e a gravacao reais testam-se em useOrganizacaoReal.test.ts; aqui a pagina corre sobre dados de exemplo em memoria.
vi.mock("@/components/rh-exemplo/organizacao/useOrganizacaoReal", async () => {
  const m = await import("@/components/rh-exemplo/organizacao/organizacaoEmMemoria");
  return { useOrganizacaoReal: m.useOrganizacaoEmMemoria };
});

// Ligar, Alterar e Desligar pedem `hr.pessoas.colocacao.edit`; os testes mudam as permissões de quem olha por aqui.
const permissoes = vi.hoisted(() => ({ concedidas: new Set<string>(["hr.pessoas.colocacao.edit"]) }));
vi.mock("@/components/rh-exemplo/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => permissoes.concedidas.has(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => permissoes.concedidas.has(p)),
    permissions: [...permissoes.concedidas],
    loading: false,
  }),
}));

const renderPagina = () => renderRh(<RhOrganizacao />, { rota: "/rh-exemplo/organizacao" });

// `hidden`: com um painel aberto o Radix esconde o resto da página das tecnologias de apoio.
const no = (nome: RegExp | string) => screen.getByRole("treeitem", { name: nome, hidden: true });
const abrir = (nome: string) => fireEvent.click(screen.getByText(nome));
const painel = () => screen.getByRole("dialog");

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (window.HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  cleanup();
  reporRhTeste();
  window.localStorage.setItem("language", "pt");
  permissoes.concedidas = new Set(["hr.pessoas.colocacao.edit"]);
  repor();
});

describe("o acesso a Ligar, Alterar e Desligar", () => {
  it("sem hr.pessoas.colocacao.edit não há botão Ligar pessoa nem Alterar/Desligar no painel de um nó", () => {
    permissoes.concedidas = new Set();
    renderPagina();
    expect(screen.queryByRole("button", { name: "Ligar pessoa" })).toBeNull();
    abrir("Filial Faro");
    expect(painel()).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ligar pessoa" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Alterar:/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Desligar:/ })).toBeNull();
  });

  it("com hr.pessoas.colocacao.edit o botão Ligar pessoa aparece no cabeçalho", () => {
    renderPagina();
    expect(screen.getAllByRole("button", { name: "Ligar pessoa" }).length).toBeGreaterThan(0);
  });
});

describe("a árvore da organização", () => {
  it("abre e mostra o Grupo, as Empresas, as Filiais e os Centros, com tipo e contadores", () => {
    renderPagina();
    expect(screen.getByRole("heading", { level: 1, name: "Organização" })).toBeTruthy();
    expect(screen.getByRole("tree")).toBeTruthy();
    expect(no(/^Grupo Aurora/).getAttribute("aria-expanded")).toBe("true");
    expect(no(/^Aurora Remodelações, Lda\./)).toBeTruthy();
    expect(no(/^Aurora Climatização, Lda\./)).toBeTruthy();
    // 15 nós da estrutura (1 grupo, 2 empresas, 5 filiais, 7 centros) e as 15 pessoas ligadas, uma folha cada.
    expect(screen.getAllByRole("treeitem")).toHaveLength(1 + 2 + 5 + 7 + 15);
    expect(within(no(/^Filial Faro/)).getAllByText("Filial").length).toBeGreaterThan(0);
    expect(within(no(/^Loja Faro/)).getByText("Centro")).toBeTruthy();
    expect(no(/^Grupo Aurora/).textContent).toContain("15 pessoas");
    expect(no(/^Loja Faro/).textContent).toContain("2 trabalham aqui");
    expect(screen.getByText(/Legalmente a pessoa está numa empresa e filial; o centro é onde trabalha\./)).toBeTruthy();
  });

  it("os nós recolhem e expandem, e o chevron não é um botão dentro de outro", () => {
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: "Recolher tudo" }));
    expect(screen.getAllByRole("treeitem")).toHaveLength(1);
    expect(no(/^Grupo Aurora/).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Expandir tudo" }));
    expect(screen.getAllByRole("treeitem")).toHaveLength(15 + 15);
    expect(screen.getByRole("tree").querySelectorAll("button")).toHaveLength(0);
  });

  it("pesquisa por nome, sem acentos, e avisa quando nada corresponde", () => {
    renderPagina();
    const campo = screen.getByRole("searchbox", { name: "Pesquisar por nome" });
    fireEvent.change(campo, { target: { value: "armazem" } });
    // O caminho (grupo, empresa, filial, centro) e, por baixo do centro que corresponde, as pessoas que lá trabalham.
    const noArmazem = ligacoesDoCentro(K.LOCAL_ARMAZEM, lerOrganizacao().ligacoes).length;
    expect(noArmazem).toBeGreaterThan(0);
    expect(screen.getAllByRole("treeitem")).toHaveLength(4 + noArmazem);
    expect(no(/^Armazém Azambuja/)).toBeTruthy();
    fireEvent.change(campo, { target: { value: "zzzz" } });
    expect(screen.getByText("Nenhuma pessoa ou nó corresponde à pesquisa.")).toBeTruthy();
  });

  it("o teclado percorre a árvore: setas, Enter para abrir o painel e Esc para o fechar", () => {
    renderPagina();
    const grupo = no(/^Grupo Aurora/);
    grupo.focus();
    fireEvent.keyDown(grupo, { key: "ArrowDown" });
    expect(document.activeElement).toBe(no(/^Aurora Remodelações, Lda\./));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowLeft" });
    expect(no(/^Aurora Remodelações, Lda\./).getAttribute("aria-expanded")).toBe("false");
    // Grupo, as 2 empresas e, da Climatização (aberta), 2 filiais, 2 centros e as 3 pessoas que lá trabalham (Braga 1, Faro 2).
    expect(screen.getAllByRole("treeitem")).toHaveLength(1 + 2 + 4 + 3);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(no(/^Grupo Aurora/));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Enter" });
    expect(within(painel()).getByText("Grupo Aurora")).toBeTruthy();
    fireEvent.keyDown(painel(), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("o painel de um nó: vínculo legal e local de trabalho", () => {
  it("numa filial, as pessoas com vínculo legal mostram onde trabalham e o chip «Trabalha noutro centro»", () => {
    renderPagina();
    abrir("Filial Lisboa");
    const p = painel();
    expect(within(p).getByRole("tab", { name: "Pessoas" })).toBeTruthy();
    const tiago = within(p).getByText("Tiago Pinheiro").closest("li") as HTMLElement;
    expect(within(tiago).getByText("Trabalha em")).toBeTruthy();
    expect(within(tiago).getByText("Loja Faro")).toBeTruthy();
    expect(within(tiago).getByText("Trabalha noutro centro")).toBeTruthy();
    const rui = within(p).getByText("Rui Amaral").closest("li") as HTMLElement;
    expect(within(rui).queryByText("Trabalha noutro centro")).toBeNull();
  });

  it("num centro, «Trabalham aqui» mostra quem trabalha lá com o chip do vínculo legal de outra filial", () => {
    renderPagina();
    abrir("Loja Faro");
    const p = painel();
    expect(within(p).queryByRole("tab", { name: "Pessoas" })).toBeNull();
    const tiago = within(p).getByText("Tiago Pinheiro").closest("li") as HTMLElement;
    expect(within(tiago).getByText("Vínculo legal: Filial Lisboa")).toBeTruthy();
    fireEvent.mouseDown(within(p).getByRole("tab", { name: "Dados" }), { button: 0 });
    expect(within(p).getByText("Não se aplica: um centro não é uma entidade legal")).toBeTruthy();
  });

  it("a aba «Dados» de uma empresa mostra o NIF e a morada fiscal", () => {
    renderPagina();
    abrir("Aurora Remodelações, Lda.");
    fireEvent.mouseDown(within(painel()).getByRole("tab", { name: "Dados" }), { button: 0 });
    expect(within(painel()).getByText("509 482 316")).toBeTruthy();
    expect(within(painel()).getByText("Morada fiscal")).toBeTruthy();
  });

  it("o histórico da ligação mostra data e de/para, lido das colocações da base", async () => {
    // A base (simulada) devolve as linhas de pessoas_colocacao_organograma do Tiago: Lisboa e, depois, Faro com motivo.
    const base = { pessoa_id: "p-tiago", organization_id: "org-teste", deleted_at: null };
    rhTeste.respostas["pessoas_colocacao_organograma"] = [
      { ...base, id: "c2", organograma_node_id: K.FILIAL_FARO, valido_de: "2026-09-01", valido_ate: null, motivo: "Reforço da loja de Faro" },
      { ...base, id: "c1", organograma_node_id: K.FILIAL_LISBOA, valido_de: "2026-01-01", valido_ate: "2026-08-31", motivo: null },
    ];
    renderPagina();
    abrir("Loja Faro");
    fireEvent.click(within(painel()).getByRole("button", { name: /Histórico: Tiago Pinheiro/ }));
    expect(await within(painel()).findByText(/Reforço da loja de Faro/)).toBeTruthy();
    expect(within(painel()).getAllByText(/^De: /).length).toBeGreaterThan(0);
  });
});

describe("ligar, alterar e desligar a pessoa", () => {
  const escolher = (rotulo: RegExp | string, valor: string) =>
    fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

  it("«Ligar pessoa» atualiza os contadores e a pessoa aparece no painel da filial", async () => {
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: "Ligar pessoa" }));
    escolher(/^Pessoa$/, "p-nadia");
    expect((screen.getByLabelText("Filial") as HTMLSelectElement).disabled).toBe(true);
    escolher(/^Empresa$/, "emp-aurora-remodelacoes");
    escolher(/^Filial$/, "fil-porto");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Nádia Coelho: ligação criada."));
    expect(no(/^Grupo Aurora/).textContent).toContain("16 pessoas");
    abrir("Filial Porto");
    expect(within(painel()).getByText("Nádia Coelho")).toBeTruthy();
  });

  it("o centro não se escolhe aqui: o painel remete para a ficha da pessoa", () => {
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: "Ligar pessoa" }));
    expect(screen.queryByLabelText(/^Centro$/)).toBeNull();
    expect(screen.getByText(/O centro de trabalho altera-se na ficha da pessoa/)).toBeTruthy();
  });

  it("só oferece as filiais da empresa escolhida", () => {
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: "Ligar pessoa" }));
    escolher(/^Empresa$/, "emp-aurora-climatizacao");
    const filiais = Array.from((screen.getByLabelText("Filial") as HTMLSelectElement).options).map((o) => o.textContent);
    expect(filiais).toEqual(["Escolhe a filial", "Filial Braga", "Filial Faro"]);
  });

  it("guardar sem pessoa mostra o erro e não fecha o painel", async () => {
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: "Ligar pessoa" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Escolhe a pessoa."));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("«Alterar ligação» muda a filial da pessoa", async () => {
    renderPagina();
    abrir("Loja Faro");
    fireEvent.click(within(painel()).getByRole("button", { name: /Alterar ligação: Tiago Pinheiro/ }));
    expect((screen.getByLabelText(/^Pessoa$/) as HTMLSelectElement).value).toBe("p-tiago");
    escolher(/^Filial$/, "fil-porto");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Tiago Pinheiro: ligação alterada."));
  });

  it("«Desligar» pede confirmação e um motivo com pelo menos 3 caracteres", async () => {
    renderPagina();
    abrir("Filial Lisboa");
    fireEvent.click(within(painel()).getByRole("button", { name: /Desligar: Tiago Pinheiro/ }));
    const dialogo = screen.getByRole("alertdialog");
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: " ab " } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Desligar" }));
    await waitFor(() => expect(within(dialogo).getByRole("alert").textContent).toBe("Indica um motivo com pelo menos 3 caracteres."));
    expect(no(/^Grupo Aurora/).textContent).toContain("15 pessoas");
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "Fim de contrato" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Desligar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(no(/^Grupo Aurora/).textContent).toContain("14 pessoas");
    expect(within(painel()).queryByText("Tiago Pinheiro")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Tiago Pinheiro: ligação terminada.");
  });
});

describe("o menu", () => {
  it("tem «Organização» no grupo de RH de exemplo, logo a seguir a Pessoas, para users.view", () => {
    const grupo = menuSections.find((s) => s.id === "rh-exemplo")!;
    const destinos = grupo.items.map((i) => i.to);
    expect(destinos.slice(0, 2)).toEqual(["/rh-exemplo/pessoas", "/rh-exemplo/organizacao"]);
    const item = grupo.items[1]!;
    expect(item.labelKey).toBe("sidebar.rhExemploOrganizacao");
    expect(item.permission).toBe("users.view");
  });
});
