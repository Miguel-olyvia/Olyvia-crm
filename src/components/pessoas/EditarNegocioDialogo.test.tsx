// «Editar negócio» na ficha real: título, notas e comercial. Valida os limites da base no ecrã, só envia o que mudou, espera pela base (estado
// ocupado, duplo clique), diz o erro traduzido DENTRO do diálogo e só fecha em sucesso. Sem as mutações de editar não desenha nada.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComCostura, erroNegFalso, mutacoesFalsas, pendente } from "@/components/negocio-metas/costuraTestUtil";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { EditarNegocioDialogo } from "./EditarNegocioDialogo";
import { negocioBase } from "./fabricaTestes";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
const { comerciaisMock } = vi.hoisted(() => ({ comerciaisMock: vi.fn() }));
vi.mock("@/hooks/pessoas/useComerciaisNegocio", () => ({ useComerciaisNegocio: (ativo: boolean) => comerciaisMock(ativo) }));

beforeAll(prepararRadixNoJsdom);

const LISTA = [{ id: "u1", nome: "Ana Gomes" }, { id: "u2", nome: "Rui Pinto" }];
const repetir = vi.fn();
const comerciais = (sobre: Partial<{ comerciais: typeof LISTA; isLoading: boolean; isError: boolean }> = {}) => ({
  comerciais: LISTA, isLoading: false, isError: false, repetir, ...sobre,
});

beforeEach(() => { comerciaisMock.mockReturnValue(comerciais()); repetir.mockReset(); });
afterEach(cleanup);

const negocio = { ...negocioBase("n1", { pessoa: "Ana", servico: "Cozinha", comercial: "Ana Gomes" }), notas: "Tudo branco", comercialId: "u1" };

function abrir(mutacoes: MutacoesNegocio | null = mutacoesFalsas({ editar: vi.fn(async () => ({ mudou: true })) })) {
  const aoFechar = vi.fn();
  const aoEditado = vi.fn();
  render(
    <MemoryRouter>
      <ComCostura mutacoes={mutacoes}>
        <EditarNegocioDialogo negocio={negocio} aoFechar={aoFechar} aoEditado={aoEditado} />
      </ComCostura>
    </MemoryRouter>,
  );
  return { mutacoes, aoFechar, aoEditado };
}

const dialogo = () => screen.getByRole("dialog", { name: "Editar o negócio" });
const titulo = () => within(dialogo()).getByRole("textbox", { name: /^Título do negócio/ });
const notas = () => within(dialogo()).getByRole("textbox", { name: "Notas" });
const comercial = () => within(dialogo()).getByRole("combobox", { name: "Comercial" });
const guardar = () => within(dialogo()).getByRole("button", { name: "Guardar" });

describe("EditarNegocioDialogo: o que mostra", () => {
  it("abre com o título, as notas e o comercial do negócio, e o foco no título", () => {
    abrir();
    expect(titulo()).toHaveValue("Cozinha");
    expect(notas()).toHaveValue("Tudo branco");
    expect(comercial()).toHaveValue("u1");
    expect(titulo()).toHaveFocus();
  });

  it("diz que o estado e as fases não se mudam aqui", () => {
    abrir();
    expect(within(dialogo()).getByText(/O estado e as fases não se mudam aqui/)).toBeInTheDocument();
  });

  it("sem as mutações de editar (o exemplo) não desenha nada", () => {
    abrir(mutacoesFalsas());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sem ficha real (sem contexto) não desenha nada", () => {
    abrir(null);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("só lê os comerciais com o diálogo aberto", () => {
    abrir();
    expect(comerciaisMock).toHaveBeenCalledWith(true);
  });
});

describe("EditarNegocioDialogo: validar os limites da base", () => {
  it("um título vazio mostra o erro, leva o foco ao título e não chama a base", () => {
    const { mutacoes } = abrir();
    fireEvent.change(titulo(), { target: { value: "   " } });
    fireEvent.click(guardar());
    expect(within(dialogo()).getByText("Escreva o título do negócio.")).toBeInTheDocument();
    expect(titulo()).toHaveAttribute("aria-invalid", "true");
    expect(titulo()).toHaveFocus();
    expect(mutacoes?.editar).not.toHaveBeenCalled();
  });

  it("um título com mais de 200 caracteres é recusado, e com 200 passa", () => {
    const { mutacoes } = abrir();
    fireEvent.change(titulo(), { target: { value: "t".repeat(201) } });
    fireEvent.click(guardar());
    expect(within(dialogo()).getByText("O título tem no máximo 200 caracteres.")).toBeInTheDocument();
    expect(mutacoes?.editar).not.toHaveBeenCalled();
    fireEvent.change(titulo(), { target: { value: "t".repeat(200) } });
    fireEvent.click(guardar());
    expect(mutacoes?.editar).toHaveBeenCalledTimes(1);
  });

  it("notas com mais de 5000 caracteres são recusadas e o foco vai para as notas", () => {
    const { mutacoes } = abrir();
    fireEvent.change(notas(), { target: { value: "n".repeat(5001) } });
    fireEvent.click(guardar());
    expect(within(dialogo()).getByText("As notas têm no máximo 5000 caracteres.")).toBeInTheDocument();
    expect(notas()).toHaveFocus();
    expect(mutacoes?.editar).not.toHaveBeenCalled();
  });

  it("o erro do título está ligado ao campo (aria-describedby)", () => {
    abrir();
    fireEvent.change(titulo(), { target: { value: "" } });
    fireEvent.click(guardar());
    const ligado = document.getElementById(titulo().getAttribute("aria-describedby")?.split(" ").pop() ?? "");
    expect(ligado).toHaveTextContent("Escreva o título do negócio.");
  });

  it("a contagem das notas diz quantos caracteres leva", () => {
    abrir();
    expect(within(dialogo()).getByText("11 de 5000")).toBeInTheDocument();
  });
});

describe("EditarNegocioDialogo: guardar", () => {
  it("envia os valores de antes e de depois (a base só recebe o que mudou)", async () => {
    const { mutacoes, aoFechar } = abrir();
    fireEvent.change(titulo(), { target: { value: "Cozinha nova" } });
    fireEvent.change(comercial(), { target: { value: "u2" } });
    fireEvent.click(guardar());
    expect(mutacoes?.editar).toHaveBeenCalledWith({
      negocioId: "n1",
      antes: { titulo: "Cozinha", notas: "Tudo branco", comercialId: "u1" },
      depois: { titulo: "Cozinha nova", notas: "Tudo branco", comercialId: "u2" },
    });
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
  });

  it("«Sem comercial» envia null", () => {
    const { mutacoes } = abrir();
    fireEvent.change(comercial(), { target: { value: "" } });
    fireEvent.click(guardar());
    expect(mutacoes?.editar).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ comercialId: null }) }));
  });

  it("em sucesso fecha e anuncia o que aconteceu", async () => {
    const { aoFechar, aoEditado } = abrir();
    fireEvent.change(titulo(), { target: { value: "Cozinha nova" } });
    fireEvent.click(guardar());
    await waitFor(() => expect(aoEditado).toHaveBeenCalledWith("Ana: negócio Cozinha atualizado."));
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("se nada mudou, a base diz que não mudou e o anúncio diz «nada mudou»", async () => {
    const editar = vi.fn(async () => ({ mudou: false }));
    const { aoEditado, aoFechar } = abrir(mutacoesFalsas({ editar }));
    fireEvent.click(guardar());
    await waitFor(() => expect(aoEditado).toHaveBeenCalledWith("Nada mudou no negócio Cozinha."));
    expect(aoFechar).toHaveBeenCalled();
  });

  it("estado ocupado: o botão fica aria-busy e aria-disabled e o duplo clique faz uma só chamada", async () => {
    const acao = pendente<{ mudou: boolean }>();
    const editar = vi.fn(() => acao.promessa);
    const { aoFechar } = abrir(mutacoesFalsas({ editar }));
    fireEvent.change(titulo(), { target: { value: "Outro" } });
    fireEvent.click(guardar());
    fireEvent.click(guardar());
    expect(editar).toHaveBeenCalledTimes(1);
    expect(guardar()).toHaveAttribute("aria-busy", "true");
    expect(guardar()).toHaveAttribute("aria-disabled", "true");
    expect(within(dialogo()).getByText("A guardar…")).toBeInTheDocument();
    // Enquanto guarda, «Cancelar» não fecha.
    fireEvent.click(within(dialogo()).getByRole("button", { name: "Cancelar" }));
    expect(aoFechar).not.toHaveBeenCalled();
    await acao.terminar({ mudou: true });
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
  });
});

describe("EditarNegocioDialogo: erros da base", () => {
  it("o erro aparece traduzido num alerta DENTRO do diálogo, que fica aberto e volta a deixar guardar", async () => {
    const acao = pendente<{ mudou: boolean }>();
    const editar = vi.fn(() => acao.promessa);
    const { aoFechar, aoEditado } = abrir(mutacoesFalsas({ editar }));
    fireEvent.change(titulo(), { target: { value: "Outro" } });
    fireEvent.click(guardar());
    await acao.falhar(erroNegFalso("pessoasPagina.neg.write.error.permission", "42501"));
    const alerta = await within(dialogo()).findByRole("alert");
    expect(alerta).toHaveTextContent("Não tem permissão para fazer esta alteração.");
    expect(alerta.textContent).not.toMatch(/42501|row-level/);
    expect(aoFechar).not.toHaveBeenCalled();
    expect(aoEditado).not.toHaveBeenCalled();
    expect(guardar()).not.toHaveAttribute("aria-busy");
  });

  it("o erro de um comercial que não é membro ativo diz-se em português", async () => {
    const editar = vi.fn(async () => { throw erroNegFalso("pessoasPagina.neg.write.error.rep", "23514"); });
    abrir(mutacoesFalsas({ editar }));
    fireEvent.change(comercial(), { target: { value: "u2" } });
    fireEvent.click(guardar());
    expect(await within(dialogo()).findByRole("alert")).toHaveTextContent("O comercial escolhido não é membro ativo desta organização.");
  });

  it("uma falha sem chave dá a mensagem genérica, nunca a mensagem em bruto", async () => {
    const editar = vi.fn(async () => { throw new Error("segredo interno da base"); });
    abrir(mutacoesFalsas({ editar }));
    fireEvent.change(titulo(), { target: { value: "Outro" } });
    fireEvent.click(guardar());
    const alerta = await within(dialogo()).findByRole("alert");
    expect(alerta.textContent).not.toMatch(/segredo/);
  });
});

describe("EditarNegocioDialogo: o seletor de comercial", () => {
  it("lista os comerciais da organização e «Sem comercial»", () => {
    abrir();
    const opcoes = within(comercial()).getAllByRole("option").map((o) => o.textContent);
    expect(opcoes).toEqual(["Sem comercial", "Ana Gomes", "Rui Pinto"]);
  });

  it("um comercial atual que já não está na lista continua escolhido (não se perde sem querer)", () => {
    comerciaisMock.mockReturnValue(comerciais({ comerciais: [{ id: "u2", nome: "Rui Pinto" }] }));
    abrir();
    expect(comercial()).toHaveValue("u1");
    expect(within(comercial()).getByRole("option", { name: "Ana Gomes" })).toBeInTheDocument();
  });

  it("enquanto carrega a lista, o seletor está desativado e o texto à vista diz porquê", () => {
    comerciaisMock.mockReturnValue(comerciais({ isLoading: true, comerciais: [] }));
    abrir();
    expect(comercial()).toBeDisabled();
    expect(within(dialogo()).getByText("A carregar os comerciais…")).toBeInTheDocument();
  });

  it("se a lista falha diz-se, deixa tentar de novo, e não impede de guardar o resto", () => {
    comerciaisMock.mockReturnValue(comerciais({ isError: true, comerciais: [] }));
    const { mutacoes } = abrir();
    expect(within(dialogo()).getByText("Não foi possível carregar os comerciais.")).toBeInTheDocument();
    fireEvent.click(within(dialogo()).getByRole("button", { name: "Tentar de novo" }));
    expect(repetir).toHaveBeenCalledTimes(1);
    fireEvent.change(titulo(), { target: { value: "Outro" } });
    fireEvent.click(guardar());
    expect(mutacoes?.editar).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ comercialId: "u1" }) }));
  });
});

describe("EditarNegocioDialogo: cancelar", () => {
  it("Cancelar fecha sem gravar", () => {
    const { mutacoes, aoFechar } = abrir();
    fireEvent.click(within(dialogo()).getByRole("button", { name: "Cancelar" }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(mutacoes?.editar).not.toHaveBeenCalled();
  });
});
