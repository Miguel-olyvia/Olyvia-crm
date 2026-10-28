// Os separadores Utilizadores e Portal de "Utilizadores e perfis" ligados à base: carga, erro, vazio, lista, ficha, criar, editar,
// mudar a role, desativar e reativar. O wrapper `useUtilizadoresPerfis` é simulado (a leitura e as escritas têm os seus testes em
// hooks/); aqui vê-se o que o ecrã faz com o que o wrapper devolve, incluindo falhas que não se engolem.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UtilizadoresPerfis from "./UtilizadoresPerfis";
import { criarDadosFalsos, dadosFalsos } from "./utilizadoresPerfisFalso";
import { PERMISSOES } from "@/components/utilizadores-perfis/permissoesExemplo";
import type { Organizacao, Role, Utilizador } from "@/components/utilizadores-perfis/tipos";

const toastErro = vi.fn();
const toastOk = vi.fn();
vi.mock("@/lib/toast", () => ({ toast: { success: (...a: unknown[]) => toastOk(...a), error: (...a: unknown[]) => toastErro(...a), info: vi.fn() } }));

let permitidos: string[] = ["utilizadores", "portal"];
vi.mock("@/components/utilizadores-perfis/hooks/usePermissoesPerfis", () => ({
  usePermissoesPerfis: () => ({ carregando: false, permitidos, tem: () => true }),
}));
vi.mock("@/components/utilizadores-perfis/hooks/useUtilizadoresPerfis", async () => (await import("./utilizadoresPerfisFalso")).moduloFalso());

const rolesPerfisFalso = {
  roles: [] as Role[], lista: [] as Role[], estado: { carregando: false, erro: null, semOrganizacao: false }, recarregar: vi.fn(),
  verEliminadas: false, mudarVerEliminadas: vi.fn(),
  catalogo: { catalogo: PERMISSOES, editor: { administradorSistema: true, codigos: [] as string[] }, visiveis: PERMISSOES, carregando: false, erro: null },
  modelos: { modelos: [], erro: null }, contagem: { contagem: {}, disponivel: false }, permissoesPorRole: {},
  autorizacoes: { podeCriar: true, podeEditar: () => true, podeEliminar: () => true, podeRestaurar: true },
  acoes: { criar: vi.fn(), guardar: vi.fn(), eliminar: vi.fn(), restaurar: vi.fn() },
};
vi.mock("@/components/utilizadores-perfis/hooks/useRolesPerfis", () => ({ useRolesPerfis: () => rolesPerfisFalso }));

vi.mock("@/hooks/useTranslation", async () => {
  const { utilizadoresPerfisTranslations } = await import("@/translations/utilizadoresPerfis");
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const pt: Record<string, string> = { ...negocioMetasTranslations.pt, ...pessoasPaginaTranslations.pt, ...utilizadoresPerfisTranslations.pt };
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), pt[key] ?? key),
    }),
  };
});

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

const role = (id: string, nome: string, extra: Partial<Role> = {}): Role => ({
  id, codigo: id, nome, descricao: "", sistema: false, podeAssinar: false, permissoes: ["leads.view", "leads.edit"], organizacaoId: "empresa", ...extra,
});
const ROLES = [role("rc", "Comercial"), role("rl", "Leitura", { permissoes: ["leads.view"] })];
const ORGS: Organizacao[] = [{ id: "grupo", nome: "Grupo Aurora" }, { id: "empresa", nome: "Aurora Remodelações", pai: "Grupo Aurora", paiId: "grupo" }];
const ana: Utilizador = {
  id: "u1", nome: "Ana Prata", email: "ana@exemplo.pt", ativo: true, telefone: "+351 912345678", posicao: "Chefe", ultimoAcesso: null, atividade: [],
  authUserId: "a1", entityId: "e1",
  vinculos: [{ organizacaoId: "empresa", roleId: "rc", ativo: true, ambitos: {}, membershipId: "m1", relationshipType: "BELONGS_TO", roleCodigo: "rc" }],
};
const rui: Utilizador = { ...ana, id: "u2", nome: "Rui Pacheco", email: "rui@exemplo.pt", ativo: false, authUserId: "a2", entityId: "e2", vinculos: [{ ...ana.vinculos[0], membershipId: "m2" }] };
const cliente = { id: "u3", nome: "Carla Cliente", organizacaoId: "empresa", ativo: true, ultimoAcesso: null };

const preparar = (extra: Parameters<typeof criarDadosFalsos>[0] = {}) => {
  dadosFalsos.atual = criarDadosFalsos({ todos: [ana, rui], utilizadores: [ana, rui], clientes: [cliente], organizacoes: ORGS, ...extra });
  rolesPerfisFalso.roles = ROLES;
  rolesPerfisFalso.lista = ROLES;
};
const renderPage = (url = "/utilizadores-perfis") => render(<MemoryRouter initialEntries={[url]}><UtilizadoresPerfis /></MemoryRouter>);
const acoes = () => dadosFalsos.atual.acoes;
const irParaTab = (nome: RegExp, dentro: HTMLElement | Document = document.body) => {
  const aba = within(dentro as HTMLElement).getByRole("tab", { name: nome });
  fireEvent.mouseDown(aba);
  fireEvent.click(aba);
};
const escolher = async (dialogo: HTMLElement, campo: RegExp, opcao: string) => {
  fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: campo }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: opcao }));
};
const escrever = (dialogo: HTMLElement, campo: RegExp, valor: string) =>
  fireEvent.change(within(dialogo).getByLabelText(campo), { target: { value: valor } });

beforeEach(() => {
  permitidos = ["utilizadores", "portal"];
  toastErro.mockClear();
  toastOk.mockClear();
  preparar();
});

describe("Utilizadores: carga, erro e vazio", () => {
  it("enquanto carrega diz que está a carregar e não mostra lista nem botão de convidar", () => {
    preparar({ carregando: true, todos: [], utilizadores: [], clientes: [] });
    renderPage();
    expect(screen.getByText("A carregar utilizadores...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Convidar utilizador" })).not.toBeInTheDocument();
    expect(screen.queryByText("Nenhum utilizador ainda")).not.toBeInTheDocument();
  });

  it("uma falha de leitura mostra o erro com «Tentar de novo» e nunca uma lista vazia", () => {
    preparar({ erro: "permission denied", todos: [], utilizadores: [], clientes: [] });
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("permission denied");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(dadosFalsos.atual.recarregar).toHaveBeenCalled();
    expect(screen.queryByText("A mostrar 0 de 0 utilizadores")).not.toBeInTheDocument();
  });

  it("sem organização ativa diz para escolher uma", () => {
    preparar({ semOrganizacao: true });
    renderPage();
    expect(screen.getByText("Escolha uma organização ativa para ver os utilizadores.")).toBeInTheDocument();
  });

  it("o Portal também mostra a carga e o erro", () => {
    preparar({ erro: "falhou", clientes: [] });
    renderPage("/utilizadores-perfis?aba=portal");
    expect(screen.getByRole("alert")).toHaveTextContent("falhou");
  });

  it("sem utilizadores e sem users.create não oferece convidar", () => {
    preparar({ todos: [], utilizadores: [], autorizacoes: { ...criarDadosFalsos().autorizacoes, podeCriar: false } });
    renderPage();
    expect(screen.getByText("Ainda não há utilizadores")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Convidar utilizador" })).not.toBeInTheDocument();
  });
});

describe("Utilizadores: lista", () => {
  it("lista só os ativos por omissão, com organização e role de verdade, sem aviso de exemplo nem último acesso", () => {
    renderPage();
    expect(screen.getByText("A mostrar 1 de 2 utilizadores")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ana Prata/ })).toBeInTheDocument();
    expect(screen.queryByText("Rui Pacheco")).not.toBeInTheDocument();
    const linha = screen.getByRole("button", { name: /Ana Prata/ }).closest("tr")!;
    expect(within(linha).getByText("Aurora Remodelações")).toBeInTheDocument();
    expect(within(linha).getByText("(Comercial)")).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Dados de exemplo|Último acesso|Nunca entrou/);
  });

  it("o botão Convidar só existe com users.create", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Convidar utilizador" })).toBeInTheDocument();
  });

  it("sem users.create o botão não aparece", () => {
    preparar({ autorizacoes: { ...criarDadosFalsos().autorizacoes, podeCriar: false } });
    renderPage();
    expect(screen.queryByRole("button", { name: "Convidar utilizador" })).not.toBeInTheDocument();
  });

  it("um utilizador que não se pode alterar mostra o cadeado", () => {
    preparar({ autorizacoes: { ...criarDadosFalsos().autorizacoes, podeEditar: (u) => u.id !== "u1" } });
    renderPage();
    expect(within(screen.getByRole("button", { name: /Ana Prata/ })).getByText("Protegido: super administrador")).toBeInTheDocument();
  });

  it("o Portal lista os clientes do portal, sem coluna de último acesso", () => {
    renderPage("/utilizadores-perfis?aba=portal");
    expect(screen.getByText("Carla Cliente")).toBeInTheDocument();
    expect(screen.getByText("Aurora Remodelações")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Último acesso" })).not.toBeInTheDocument();
  });
});

describe("Utilizadores: ficha", () => {
  it("abre com as quatro abas, sem «Repor palavra-passe» (a base não a repõe por email)", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Ana Prata/ }));
    const ficha = screen.getByRole("dialog");
    expect(within(ficha).getAllByRole("tab")).toHaveLength(4);
    expect(within(ficha).queryByRole("button", { name: "Repor palavra-passe" })).not.toBeInTheDocument();
    expect(within(ficha).getByRole("button", { name: "Editar utilizador" })).toBeEnabled();
  });

  it("as ações desligam-se quando as guardas de /users o dizem", () => {
    preparar({ autorizacoes: { ...criarDadosFalsos().autorizacoes, podeEditar: () => false, podeDesativar: () => false } });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Ana Prata/ }));
    const ficha = screen.getByRole("dialog");
    expect(within(ficha).getByRole("button", { name: "Editar utilizador" })).toBeDisabled();
    expect(within(ficha).getByRole("button", { name: "Mudar role" })).toBeDisabled();
    expect(within(ficha).getByRole("button", { name: "Desativar" })).toBeDisabled();
  });

  it("sem users.manage_roles não se muda a role", () => {
    preparar({ autorizacoes: { ...criarDadosFalsos().autorizacoes, podeGerirRoles: false } });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Ana Prata/ }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Mudar role" })).toBeDisabled();
  });

  it("desativar pede confirmação, chama a ação real e avisa", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Ana Prata/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Desativar" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Desativar" }));
    await waitFor(() => expect(acoes().desativar).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" })));
    await waitFor(() => expect(toastOk).toHaveBeenCalledWith("Ana Prata desativado"));
  });

  it("se desativar falha, o erro aparece e não se avisa de sucesso", async () => {
    vi.mocked(acoes().desativar).mockResolvedValueOnce({ ok: false, erro: "Sem permissão para desativar" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Ana Prata/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Desativar" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Desativar" }));
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("Sem permissão para desativar"));
    expect(toastOk).not.toHaveBeenCalled();
  });

  it("um utilizador inativo reativa-se", async () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole("button", { name: /Inativos/ }));
    fireEvent.click(screen.getByRole("button", { name: /Inativos/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Rui Pacheco/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reativar" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Reativar" }));
    await waitFor(() => expect(acoes().reativar).toHaveBeenCalledWith(expect.objectContaining({ id: "u2" })));
  });

  it("a aba Atividade mostra o histórico real, a carregar, o erro e a falta de permissão sem os confundir com «sem atividade»", () => {
    preparar({ atividade: { estado: "ok", entradas: [{ id: "h1", data: "2026-10-01", tipo: "status_changed", campo: "status", antes: "active", depois: "inactive", quem: "Admin" }] } });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Ana Prata/ }));
    irParaTab(/Atividade/, screen.getByRole("dialog"));
    expect(screen.getByText("Estado mudou de active para inactive (Admin)")).toBeInTheDocument();
  });

  it("a atividade com erro diz o erro", () => {
    preparar({ atividade: { estado: "erro", mensagem: "rls" } });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Ana Prata/ }));
    irParaTab(/Atividade/, screen.getByRole("dialog"));
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a atividade: rls");
  });

  it("a atividade sem permissão diz que não há permissão", () => {
    preparar({ atividade: { estado: "semPermissao" } });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Ana Prata/ }));
    irParaTab(/Atividade/, screen.getByRole("dialog"));
    expect(screen.getByText("Não tem permissão para ver a atividade deste utilizador.")).toBeInTheDocument();
  });

  it("mudar a role de um vínculo chama a ação real com o id do membership", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Ana Prata/ }));
    const ficha = screen.getByRole("dialog");
    irParaTab(/Vínculos/, ficha);
    await escolher(ficha, /Role/, "Leitura");
    await waitFor(() => expect(acoes().mudarRole).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), "m1", "rl", true));
    await waitFor(() => expect(toastOk).toHaveBeenCalledWith("Ana Prata passou a Leitura em Aurora Remodelações"));
  });

  it("se mudar a role falha, o erro aparece", async () => {
    vi.mocked(acoes().mudarRole).mockResolvedValueOnce({ ok: false, erro: "A base recusou" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Ana Prata/ }));
    const ficha = screen.getByRole("dialog");
    irParaTab(/Vínculos/, ficha);
    await escolher(ficha, /Role/, "Leitura");
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("A base recusou"));
  });
});

describe("Utilizadores: formulário", () => {
  const abrirConvidar = () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Convidar utilizador" }));
    return screen.getByRole("dialog");
  };

  it("não tem morada nem estado: a morada guarda-se na base e o estado muda-se na ficha", () => {
    const form = abrirConvidar();
    expect(within(form).queryByLabelText(/Morada/)).not.toBeInTheDocument();
    expect(within(form).queryByLabelText(/^Estado/)).not.toBeInTheDocument();
    expect(within(form).getByLabelText(/Nome/)).toBeInTheDocument();
  });

  it("valida antes de gravar e não chama a base com dados em falta", async () => {
    const form = abrirConvidar();
    fireEvent.click(within(form).getByRole("button", { name: "Criar utilizador" }));
    expect(await within(form).findByText("Indique o nome do utilizador.")).toBeInTheDocument();
    expect(acoes().criar).not.toHaveBeenCalled();
  });

  it("cria: envia nome, email, palavra-passe e o vínculo escolhido, e fecha ao correr bem", async () => {
    const form = abrirConvidar();
    escrever(form, /^Nome/, "Rita Costa");
    escrever(form, /^Email/, "rita@exemplo.pt");
    escrever(form, /^Palavra-passe/, "segredo123");
    irParaTab(/Vínculos/, form);
    await escolher(form, /Organização/, "Aurora Remodelações");
    await escolher(form, /Role/, "Comercial");
    fireEvent.click(within(form).getByRole("button", { name: "Criar utilizador" }));
    await waitFor(() => expect(acoes().criar).toHaveBeenCalled());
    const [valores, vinculos] = vi.mocked(acoes().criar).mock.calls[0];
    expect(valores).toMatchObject({ nome: "Rita Costa", email: "rita@exemplo.pt", palavraPasse: "segredo123" });
    expect(vinculos).toEqual([expect.objectContaining({ organizacaoId: "empresa", roleId: "rc" })]);
    await waitFor(() => expect(toastOk).toHaveBeenCalledWith("Utilizador criado"));
  });

  it("se a base recusa, o erro fica no painel, o painel não fecha e não há aviso de sucesso", async () => {
    vi.mocked(acoes().criar).mockResolvedValueOnce({ ok: false, erro: "Já existe uma conta com este email" });
    const form = abrirConvidar();
    escrever(form, /^Nome/, "Rita Costa");
    escrever(form, /^Email/, "rita@exemplo.pt");
    escrever(form, /^Palavra-passe/, "segredo123");
    irParaTab(/Vínculos/, form);
    await escolher(form, /Organização/, "Aurora Remodelações");
    await escolher(form, /Role/, "Comercial");
    fireEvent.click(within(form).getByRole("button", { name: "Criar utilizador" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("Já existe uma conta com este email");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(toastOk).not.toHaveBeenCalled();
  });

  it("editar abre com os dados do utilizador e grava o original, os vínculos com o id do membership e o âmbito permitido", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Ana Prata/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Editar utilizador" }));
    const form = screen.getAllByRole("dialog").find((d) => within(d).queryByLabelText(/^Nome/))!;
    expect(within(form).getByLabelText(/^Nome/)).toHaveValue("Ana Prata");
    expect(within(form).getByLabelText(/^Telefone/)).toHaveValue("+351 912345678");
    escrever(form, /^Nome/, "Ana Maria Prata");
    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(acoes().atualizar).toHaveBeenCalled());
    const [original, valores, vinculos, ambitos] = vi.mocked(acoes().atualizar).mock.calls[0];
    expect(original.id).toBe("u1");
    expect(valores).toMatchObject({ nome: "Ana Maria Prata", palavraPasse: "" });
    expect(vinculos[0]).toMatchObject({ membershipId: "m1", roleId: "rc" });
    expect(ambitos).toBe(true);
  });

  it("o utilizador que não se pode alterar abre só para ver, sem botão de guardar", () => {
    preparar({ autorizacoes: { ...criarDadosFalsos().autorizacoes, podeEditar: (u) => u.id !== "u1" } });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Ana Prata/ }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Editar utilizador" })).toBeDisabled();
  });
});
