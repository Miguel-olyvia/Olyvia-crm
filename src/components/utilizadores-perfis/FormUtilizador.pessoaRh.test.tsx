// O campo «Pessoa do RH» no formulário de utilizador: escondido sem permissão, mostra a ficha já ligada, e a ligação só
// corre DEPOIS de gravar o utilizador (a RPC exige membership ativa); se falhar, a gravação fica e o erro sobe num alerta.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { FormUtilizador } from "./FormUtilizador";
import type { EstadoPessoaRh } from "./pessoaRh";
import type { FormAberto, Organizacao, Role, Utilizador } from "./tipos";

const ORGS: Organizacao[] = [{ id: "org-a", nome: "Empresa A" }];
const ROLES: Role[] = [{ id: "r1", codigo: "tecnico", nome: "Técnico", descricao: "", sistema: false, podeAssinar: false, permissoes: [], organizacaoId: "org-a" }];
const ANA: Utilizador = {
  id: "u1", nome: "Ana", email: "ana@x.pt", ativo: true, ultimoAcesso: null, atividade: [],
  vinculos: [{ organizacaoId: "org-a", roleId: "r1", ativo: true, ambitos: {}, membershipId: "m1" }],
};

const ordem: string[] = [];
const estado = (parcial: Partial<EstadoPessoaRh> = {}): EstadoPessoaRh => ({
  podeLigar: true, organizacaoId: "org-a", ligadaId: null, carregando: false, erro: null,
  pessoas: [{ id: "p1", nome: "Ana Silva", detalhe: "007" }],
  ligar: vi.fn(async () => { ordem.push("ligar"); return { ok: true as const }; }),
  ...parcial,
});

function montar(form: FormAberto, pessoaRh: EstadoPessoaRh | undefined, aoGravar = vi.fn(async () => { ordem.push("gravar"); return { ok: true as const, id: "novo" }; })) {
  const aoConcluir = vi.fn();
  render(
    <LanguageProvider>
      <FormUtilizador
        form={form} utilizadores={[ANA]} roles={ROLES} organizacoes={ORGS} catalogo={[]} editor={{ administradorSistema: true, codigos: [] }}
        podeEditar={() => true} podeMudarPalavraPasse={() => true} podeGerirRoles pessoaRh={pessoaRh}
        aoGravar={aoGravar} aoFechar={vi.fn()} aoConcluir={aoConcluir}
      />
    </LanguageProvider>,
  );
  return { aoGravar, aoConcluir };
}

/** O Select do Radix, dentro de um formulário, tem um <select> nativo escondido: muda-se por aí. */
const escolherPessoa = (valor: string) => {
  const nativo = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === valor));
  if (!nativo) throw new Error("select da pessoa do RH não encontrado");
  fireEvent.change(nativo, { target: { value: valor } });
};
const submeter = () => fireEvent.submit(document.querySelector("form") as HTMLFormElement);

beforeEach(() => { ordem.length = 0; localStorage.setItem("language", "pt"); });
afterEach(cleanup);

describe("FormUtilizador: Pessoa do RH", () => {
  it("sem hr.pessoas.conta.link (ou sem estado) o campo não aparece e grava-se sem ligar", async () => {
    const pessoaRh = estado({ podeLigar: false });
    const { aoGravar, aoConcluir } = montar({ tipo: "utilizador", modo: "editar", id: "u1" }, pessoaRh);
    expect(screen.queryByText("Pessoa do RH")).toBeNull();
    submeter();
    await waitFor(() => expect(aoConcluir).toHaveBeenCalled());
    expect(aoGravar).toHaveBeenCalledTimes(1);
    expect(pessoaRh.ligar).not.toHaveBeenCalled();
    cleanup();
    montar({ tipo: "utilizador", modo: "editar", id: "u1" }, undefined);
    expect(screen.queryByText("Pessoa do RH")).toBeNull();
  });

  it("ao editar um utilizador já ligado mostra a ficha, sem escolher outra", () => {
    montar({ tipo: "utilizador", modo: "editar", id: "u1" }, estado({ ligadaId: "p1" }));
    expect(screen.getByTestId("pessoa-rh-ligada").textContent).toContain("Ana Silva");
    expect(document.querySelector("select")).toBeNull();
  });

  it("ao editar, liga a ficha escolhida DEPOIS de gravar, com o id do utilizador", async () => {
    const pessoaRh = estado();
    const { aoConcluir } = montar({ tipo: "utilizador", modo: "editar", id: "u1" }, pessoaRh);
    expect(screen.getByText("Pessoa do RH")).toBeTruthy();
    escolherPessoa("p1");
    submeter();
    await waitFor(() => expect(aoConcluir).toHaveBeenCalled());
    expect(ordem).toEqual(["gravar", "ligar"]);
    expect(pessoaRh.ligar).toHaveBeenCalledWith("p1", "u1");
    expect(aoConcluir.mock.calls[0][0].alerta).toBeUndefined();
  });

  it("se a gravação falhar não liga nada", async () => {
    const pessoaRh = estado();
    const aoGravar = vi.fn(async () => ({ ok: false as const, erro: "falhou" }));
    const { aoConcluir } = montar({ tipo: "utilizador", modo: "editar", id: "u1" }, pessoaRh, aoGravar);
    escolherPessoa("p1");
    submeter();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("falhou"));
    expect(pessoaRh.ligar).not.toHaveBeenCalled();
    expect(aoConcluir).not.toHaveBeenCalled();
  });

  it("se a ligação falhar, a gravação fica e o erro sobe como alerta", async () => {
    const pessoaRh = estado({ ligar: vi.fn(async () => ({ ok: false as const, erro: "Esta conta já está ligada a outra pessoa." })) });
    const { aoConcluir } = montar({ tipo: "utilizador", modo: "editar", id: "u1" }, pessoaRh);
    escolherPessoa("p1");
    submeter();
    await waitFor(() => expect(aoConcluir).toHaveBeenCalled());
    expect(aoConcluir.mock.calls[0][0].alerta).toContain("Esta conta já está ligada a outra pessoa.");
  });

  it("ao criar, liga com o anew_user_id que a criação devolveu", async () => {
    const pessoaRh = estado();
    const { aoConcluir } = montar({ tipo: "utilizador", modo: "criar", aba: "vinculos" }, pessoaRh);
    const selects = () => [...document.querySelectorAll("select")];
    fireEvent.change(selects()[0], { target: { value: "org-a" } });
    await waitFor(() => expect(selects()[1]?.querySelector('option[value="r1"]')).toBeTruthy());
    fireEvent.change(selects()[1], { target: { value: "r1" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Dados/ }));
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: "Teste" } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "teste@x.pt" } });
    fireEvent.change(screen.getByLabelText(/^Palavra-passe/), { target: { value: "segredo1" } });
    escolherPessoa("p1");
    submeter();
    await waitFor(() => expect(aoConcluir).toHaveBeenCalled());
    expect(ordem).toEqual(["gravar", "ligar"]);
    expect(pessoaRh.ligar).toHaveBeenCalledWith("p1", "novo");
  });
});
