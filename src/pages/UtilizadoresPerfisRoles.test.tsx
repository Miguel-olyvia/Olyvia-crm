// O separador Roles de "Utilizadores e perfis" ligado à base: estados de carga, erro e vazio, lista, criar, editar (só leitura
// em roles de sistema ou sem permissão), eliminar e restaurar. O que o wrapper `useRolesPerfis` devolve é um objecto fixo (a
// leitura e as RPCs têm os seus testes em hooks/); o `Roles` abaixo liga AbaRoles, FichaRole e FormRole como a página faz, sem
// depender do separador de utilizadores. Vê-se o que o ecrã faz com o que a base devolve, incluindo falhas que não se engolem.
import { useState } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { AbaRoles } from "@/components/utilizadores-perfis/AbaRoles";
import { FichaRole } from "@/components/utilizadores-perfis/FichaRole";
import { FormRole } from "@/components/utilizadores-perfis/FormRole";
import { roleDaBase, type LinhaRole } from "@/components/utilizadores-perfis/rolesReais";
import type { RolesPerfis } from "@/components/utilizadores-perfis/hooks/useRolesPerfis";
import type { Aberto, Permissao, Role } from "@/components/utilizadores-perfis/tipos";
import { useFormulariosPerfis } from "@/components/utilizadores-perfis/useFormulariosPerfis";
import { useUltimo } from "@/components/utilizadores-perfis/useUltimo";

const toastErro = vi.fn();
const toastOk = vi.fn();
vi.mock("@/lib/toast", () => ({ toast: { success: (...a: unknown[]) => toastOk(...a), error: (...a: unknown[]) => toastErro(...a) } }));

let rolesPerfis: RolesPerfis;

/** As mesmas ligações que o separador Roles da página faz. */
function Roles() {
  const rp = rolesPerfis;
  const [aberto, setAberto] = useState<Aberto>(null);
  const formularios = useFormulariosPerfis(() => setAberto(null));
  const role = useUltimo(aberto?.tipo === "role" ? rp.lista.find((r) => r.id === aberto.id) ?? rp.roles.find((r) => r.id === aberto.id) ?? null : null);
  const { autorizacoes, acoes, catalogo, modelos, contagem } = rp;
  return (
    <>
      <Button type="button" onClick={() => formularios.abrir({ tipo: "role", modo: "criar" })}>Nova role</Button>
      <AbaRoles
        roles={rp.lista} estado={rp.estado} utilizadores={contagem.contagem} permissoes={rp.permissoesPorRole}
        eliminadas={rp.verEliminadas} aoMudarEliminadas={rp.mudarVerEliminadas} aoTentarDeNovo={rp.recarregar}
        aoAbrirRole={(id) => setAberto({ tipo: "role", id })} aoVerUtilizadores={() => {}}
        aoEditar={(id) => formularios.abrir({ tipo: "role", modo: "editar", id })}
        podeRestaurar={autorizacoes.podeRestaurar} aoRestaurar={(r) => acoes.restaurar(r.id)}
      />
      <FichaRole
        role={role} aberto={aberto?.tipo === "role"} visiveis={catalogo.visiveis} utilizadores={[]}
        utilizadoresNaBase={role && contagem.disponivel ? contagem.contagem[role.id] ?? 0 : null}
        autorizado={{ criar: autorizacoes.podeCriar, eliminar: autorizacoes.podeEliminar, restaurar: autorizacoes.podeRestaurar }}
        aoFechar={() => setAberto(null)} aoAbrirUtilizador={() => {}} aoFiltrarUtilizadores={() => {}}
        aoEditar={(id) => formularios.abrir({ tipo: "role", modo: "editar", id })}
        aoDuplicar={(id) => formularios.abrir({ tipo: "role", modo: "duplicar", id })}
        aoEliminar={(r) => acoes.eliminar(r.id, contagem.disponivel ? contagem.contagem[r.id] ?? 0 : null)}
        aoRestaurar={(r) => acoes.restaurar(r.id)}
      />
      <FormRole
        form={formularios.form} roles={rp.roles} catalogo={{ visiveis: catalogo.visiveis, carregando: catalogo.carregando, erro: catalogo.erro }}
        modelos={{ lista: modelos.modelos, erro: modelos.erro }} acoes={acoes} podeEditar={autorizacoes.podeEditar}
        aoFechar={formularios.fechar} aoConcluir={formularios.concluir}
      />
    </>
  );
}

// Os utilizadores vêm da base (testados em UtilizadoresPerfisUtilizadores.test.tsx): aqui o wrapper é simulado e vazio.
vi.mock("@/components/utilizadores-perfis/hooks/useUtilizadoresPerfis", async () => (await import("./utilizadoresPerfisFalso")).moduloFalso());

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

const linha = (p: Partial<LinhaRole>): LinhaRole => ({
  id: "r", code: "x", name: "X", description: null, organization_id: "org", is_system: false, can_sign_contracts: false, created_by: null, deleted_at: null, ...p,
});
const comercial = roleDaBase(linha({ id: "r1", code: "comercial", name: "Comercial", description: "Vende" }), ["leads.view"]);
const arquivo = roleDaBase(linha({ id: "r2", code: "arquivo", name: "Arquivo" }), []);
const sistema = roleDaBase(linha({ id: "r3", code: "org_viewer", name: "Visualizador", organization_id: null, is_system: true }), ["leads.view"]);
const apagada = roleDaBase(linha({ id: "r4", code: "antiga", name: "Antiga", deleted_at: "2026-01-01" }), []);

const catalogo: Permissao[] = [
  { codigo: "leads.view", categoria: "leads", nome: "Ver leads", perigosa: false, comAmbito: true },
  { codigo: "leads.create", categoria: "leads", nome: "Criar leads", perigosa: false, comAmbito: false },
];

const ok = { ok: true } as const;
const criar = vi.fn();
const guardar = vi.fn();
const eliminar = vi.fn();
const restaurar = vi.fn();
const recarregar = vi.fn();
const mudarVerEliminadas = vi.fn();

function montar(sobre: Partial<RolesPerfis> = {}): RolesPerfis {
  const roles = [comercial, arquivo, sistema];
  return {
    roles, lista: roles, estado: { carregando: false, erro: null, semOrganizacao: false }, recarregar,
    verEliminadas: false, mudarVerEliminadas,
    catalogo: { catalogo, editor: { administradorSistema: true, codigos: [] }, visiveis: catalogo, carregando: false, erro: null },
    modelos: { modelos: [{ id: "m1", nome: "Consulta", descricao: "Só vê", permissoes: ["leads.view"] }], carregando: false, erro: null },
    contagem: { contagem: { r1: 2, r2: 0, r3: 5, r4: 0 }, disponivel: true, erro: null },
    permissoesPorRole: { r1: 1, r2: 0, r3: 1, r4: 0 },
    autorizacoes: {
      podeCriar: true, podeEditar: (r) => !r.eliminada, podeEliminar: (r) => !r.sistema && !r.eliminada, podeRestaurar: (r) => !!r.eliminada && !r.sistema,
    },
    acoes: { criar, guardar, eliminar, restaurar, aGravar: false },
    ...sobre,
  };
}

beforeEach(() => {
  [criar, guardar, eliminar, restaurar, recarregar, mudarVerEliminadas, toastErro, toastOk].forEach((f) => f.mockReset());
  criar.mockResolvedValue(ok);
  guardar.mockResolvedValue(ok);
  eliminar.mockResolvedValue(ok);
  restaurar.mockResolvedValue(ok);
  rolesPerfis = montar();
});

const renderPage = () => render(<Roles />);
const linhaDe = (nome: string) => screen.getByRole("button", { name: nome }).closest("tr")!;
const escrever = (d: HTMLElement, campo: RegExp, valor: string) =>
  fireEvent.change(within(d).getByRole("textbox", { name: campo }), { target: { value: valor } });

describe("lista de roles", () => {
  it("mostra as roles da base com contagens reais, tipo e permissões", () => {
    renderPage();
    expect(within(linhaDe("Comercial")).getByText("comercial")).toBeInTheDocument();
    expect(within(linhaDe("Comercial")).getByRole("button", { name: /2/ })).toBeInTheDocument();
    expect(within(linhaDe("Arquivo")).getByText("0")).toBeInTheDocument();
    expect(within(linhaDe("Visualizador")).getByText("Sistema")).toBeInTheDocument();
  });

  it("enquanto carrega mostra o estado de carga, sem tabela e sem lista vazia", () => {
    rolesPerfis = montar({ roles: [], lista: [], estado: { carregando: true, erro: null, semOrganizacao: false } });
    renderPage();
    expect(screen.getByText("A carregar as roles...")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("uma falha de leitura aparece como erro com a mensagem e deixa tentar de novo (não finge uma lista vazia)", () => {
    rolesPerfis = montar({ roles: [], lista: [], estado: { carregando: false, erro: "permission denied for table anew_roles", semOrganizacao: false } });
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("permission denied for table anew_roles");
    expect(screen.queryByText(/ainda não tem roles/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("sem roles diz que a organização ainda não tem; sem organização pede para escolher uma", () => {
    rolesPerfis = montar({ roles: [], lista: [] });
    const { unmount } = renderPage();
    expect(screen.getByText("Esta organização ainda não tem roles.")).toBeInTheDocument();
    unmount();
    rolesPerfis = montar({ roles: [], lista: [], estado: { carregando: false, erro: null, semOrganizacao: true } });
    renderPage();
    expect(screen.getByText("Escolha uma organização para ver as roles.")).toBeInTheDocument();
  });

  it("sem a contagem de utilizadores mostra um traço, e não um zero inventado", () => {
    rolesPerfis = montar({ contagem: { contagem: {}, disponivel: false, erro: "falha" } });
    renderPage();
    expect(within(linhaDe("Arquivo")).queryByText("0")).not.toBeInTheDocument();
    expect(within(linhaDe("Arquivo")).getByText("—")).toBeInTheDocument();
  });

  it("a pesquisa filtra por nome ou código e diz quando nada corresponde", () => {
    renderPage();
    fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar por nome ou código" }), { target: { value: "arq" } });
    expect(screen.queryByRole("button", { name: "Comercial" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Arquivo" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.getByText("Nenhuma role corresponde à pesquisa.")).toBeInTheDocument();
  });
});

describe("criar role", () => {
  const abrir = () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Nova role" }));
    return screen.getByRole("dialog", { name: "Nova role" });
  };

  it("grava com as permissões escolhidas, fecha e avisa só depois de a base confirmar", async () => {
    const form = abrir();
    escrever(form, /^Nome/, "Gestor de Parceiros");
    fireEvent.click(within(form).getByRole("button", { name: "Criar role" }));
    await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
    expect(criar).toHaveBeenCalledWith({ nome: "Gestor de Parceiros", codigo: "gestor_de_parceiros", descricao: "", podeAssinar: false, permissoes: [] });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Nova role" })).not.toBeInTheDocument());
    expect(toastOk).toHaveBeenCalledWith("Role criada");
  });

  it("um erro da base mantém o painel aberto, mostra a mensagem e avisa; nada se dá por gravado", async () => {
    criar.mockResolvedValue({ ok: false, erro: "Sem permissão para criar roles" });
    const form = abrir();
    escrever(form, /^Nome/, "Gestor de Parceiros");
    fireEvent.click(within(form).getByRole("button", { name: "Criar role" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("Sem permissão para criar roles");
    expect(screen.getByRole("dialog", { name: "Nova role" })).toBeInTheDocument();
    expect(toastErro).toHaveBeenCalledWith(expect.stringContaining("Sem permissão para criar roles"));
    expect(toastOk).not.toHaveBeenCalled();
  });

  it("não chama a base com o nome vazio nem com código repetido", () => {
    const form = abrir();
    fireEvent.click(within(form).getByRole("button", { name: "Criar role" }));
    escrever(form, /^Nome/, "Comercial");
    fireEvent.click(within(form).getByRole("button", { name: "Criar role" }));
    expect(within(form).getByText("Outra role já usa este código.")).toBeInTheDocument();
    expect(criar).not.toHaveBeenCalled();
  });

  it("os modelos vêm da base e o botão de criar fica desligado se o catálogo falhou a carregar", async () => {
    rolesPerfis = montar({ catalogo: { ...montar().catalogo, visiveis: [], erro: "falha", carregando: false } });
    const form = abrir();
    expect(within(form).getByRole("button", { name: "Criar role" })).toBeDisabled();
  });

  it("a matriz só mostra as permissões do catálogo da base", () => {
    const form = abrir();
    fireEvent.mouseDown(within(form).getByRole("tab", { name: /^Permissões/ }));
    fireEvent.click(within(form).getByRole("tab", { name: /^Permissões/ }));
    expect(within(form).getByText("0 de 2 permissões concedidas")).toBeInTheDocument();
  });
});

describe("editar role", () => {
  it("guarda as alterações com a role e a indicação de sistema", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Editar a role Comercial" }));
    const form = screen.getByRole("dialog", { name: /Editar/ });
    escrever(form, /^Nome/, "Comercial Sénior");
    fireEvent.click(within(form).getByRole("button", { name: /Guardar/ }));
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1));
    expect(guardar).toHaveBeenCalledWith("r1", expect.objectContaining({ nome: "Comercial Sénior", codigo: "comercial", permissoes: ["leads.view"] }), false);
  });

  it("uma role de sistema abre só para ver: sem botão de guardar", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Editar a role Visualizador" }));
    const form = screen.getByRole("dialog", { name: /Editar/ });
    expect(within(form).queryByRole("button", { name: /Guardar/ })).not.toBeInTheDocument();
    expect(within(form).getByText("Só leitura")).toBeInTheDocument();
  });

  it("sem permissão para editar abre só para ver e explica porquê", () => {
    rolesPerfis = montar({ autorizacoes: { ...montar().autorizacoes, podeEditar: () => false } });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Editar a role Comercial" }));
    const form = screen.getByRole("dialog", { name: /Editar/ });
    expect(within(form).queryByRole("button", { name: /Guardar/ })).not.toBeInTheDocument();
    expect(within(form).getByText(/Não tem permissão para editar esta role/)).toBeInTheDocument();
  });

  it("um erro ao guardar fica visível e o painel não fecha", async () => {
    guardar.mockResolvedValue({ ok: false, erro: "A base não confirmou a gravação da role" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Editar a role Comercial" }));
    const form = screen.getByRole("dialog", { name: /Editar/ });
    escrever(form, /^Nome/, "Outro");
    fireEvent.click(within(form).getByRole("button", { name: /Guardar/ }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("A base não confirmou a gravação da role");
    expect(screen.getByRole("dialog", { name: /Editar/ })).toBeInTheDocument();
  });
});

describe("ficha, eliminar e restaurar", () => {
  const abrirFicha = (nome: string) => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: nome }));
    return screen.getByRole("dialog");
  };

  it("uma role com utilizadores não se elimina e a ficha diz porquê", () => {
    const ficha = abrirFicha("Comercial");
    expect(within(ficha).getByRole("button", { name: "Eliminar" })).toBeDisabled();
    expect(within(ficha).getByText(/Esta role tem utilizadores/)).toBeInTheDocument();
  });

  it("uma role de sistema não se elimina", () => {
    const ficha = abrirFicha("Visualizador");
    expect(within(ficha).getByRole("button", { name: "Eliminar" })).toBeDisabled();
    expect(within(ficha).getByText("As roles de sistema não se eliminam.")).toBeInTheDocument();
  });

  it("sem a contagem de utilizadores não deixa eliminar e avisa", () => {
    rolesPerfis = montar({ contagem: { contagem: {}, disponivel: false, erro: "falha" } });
    const ficha = abrirFicha("Arquivo");
    expect(within(ficha).getByRole("button", { name: "Eliminar" })).toBeDisabled();
    expect(within(ficha).getByRole("alert")).toHaveTextContent("Não foi possível contar os utilizadores");
  });

  it("elimina uma role sem utilizadores depois de confirmar, e avisa", async () => {
    const ficha = abrirFicha("Arquivo");
    fireEvent.click(within(ficha).getByRole("button", { name: "Eliminar" }));
    const confirma = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirma).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(eliminar).toHaveBeenCalledWith("r2", 0));
    await waitFor(() => expect(toastOk).toHaveBeenCalledWith("Arquivo eliminada"));
  });

  it("se a base recusar a eliminação mostra o erro e não dá a role por eliminada", async () => {
    eliminar.mockResolvedValue({ ok: false, erro: "Role fora do âmbito do utilizador" });
    const ficha = abrirFicha("Arquivo");
    fireEvent.click(within(ficha).getByRole("button", { name: "Eliminar" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("Role fora do âmbito do utilizador"));
    expect(toastOk).not.toHaveBeenCalled();
  });

  it("Ver eliminadas pede à base as eliminadas, e a linha eliminada oferece Restaurar", async () => {
    rolesPerfis = montar({ verEliminadas: true, lista: [apagada] });
    renderPage();
    fireEvent.click(screen.getByRole("switch", { name: "Ver eliminadas" }));
    expect(mudarVerEliminadas).toHaveBeenCalledWith(false);
    expect(within(linhaDe("Antiga")).queryByRole("button", { name: /^Editar/ })).not.toBeInTheDocument();
    fireEvent.click(within(linhaDe("Antiga")).getByRole("button", { name: "Restaurar a role Antiga" }));
    await waitFor(() => expect(restaurar).toHaveBeenCalledWith("r4"));
    await waitFor(() => expect(toastOk).toHaveBeenCalledWith("Antiga restaurada"));
  });

  it("sem roles.delete a linha eliminada não oferece Restaurar", () => {
    rolesPerfis = montar({ verEliminadas: true, lista: [apagada], autorizacoes: { ...montar().autorizacoes, podeRestaurar: () => false } });
    renderPage();
    expect(screen.queryByRole("button", { name: /Restaurar/ })).not.toBeInTheDocument();
  });

  it("um erro ao restaurar aparece em aviso", async () => {
    restaurar.mockResolvedValue({ ok: false, erro: "Sem permissão para restaurar roles" });
    rolesPerfis = montar({ verEliminadas: true, lista: [apagada] });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar a role Antiga" }));
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("Sem permissão para restaurar roles"));
  });

  it("super_admin mostra acesso total em vez de uma matriz", () => {
    const sa = roleDaBase(linha({ id: "r5", code: "super_admin", name: "Super", organization_id: null, is_system: true }), []);
    rolesPerfis = montar({ roles: [sa], lista: [sa] });
    const ficha = abrirFicha("Super");
    fireEvent.mouseDown(within(ficha).getByRole("tab", { name: /^Permissões/ }));
    fireEvent.click(within(ficha).getByRole("tab", { name: /^Permissões/ }));
    expect(within(ficha).getByText(/acesso total/i)).toBeInTheDocument();
  });
});

describe("tipos de apoio", () => {
  it("o Role de teste tem os campos de âmbito", () => {
    const r: Role = comercial;
    expect(r.organizacaoId).toBe("org");
  });
});
