// Mandar um negócio para o lixo e restaurá-lo, os dois com confirmação: o diálogo diz o que vai acontecer, espera pela base (estado ocupado,
// duplo clique), diz o erro traduzido DENTRO do diálogo e só fecha em sucesso. O foco abre no «Cancelar» (a ação é a que se pode lamentar).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComCostura, erroNegFalso, mutacoesFalsas, pendente } from "@/components/negocio-metas/costuraTestUtil";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ConfirmarLixoNegocioDialogo, type NegocioDoLixo } from "./ConfirmarLixoNegocioDialogo";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

beforeAll(prepararRadixNoJsdom);
afterEach(cleanup);

const NEGOCIO: NegocioDoLixo = { id: "n1", pessoa: "Ana", servico: "Cozinha" };

function abrir(modo: "apagar" | "restaurar", mutacoes: MutacoesNegocio | null) {
  const aoFechar = vi.fn();
  const aoConcluido = vi.fn();
  render(
    <MemoryRouter>
      <ComCostura mutacoes={mutacoes}>
        <ConfirmarLixoNegocioDialogo modo={modo} negocio={NEGOCIO} aoFechar={aoFechar} aoConcluido={aoConcluido} />
      </ComCostura>
    </MemoryRouter>,
  );
  return { aoFechar, aoConcluido };
}
const com = (extra: Partial<MutacoesNegocio>) => mutacoesFalsas({ enviarParaLixo: vi.fn(async () => undefined), restaurar: vi.fn(async () => undefined), ...extra });

describe("enviar para o lixo", () => {
  it("diz o que vai acontecer e abre com o foco em «Cancelar»", () => {
    abrir("apagar", com({}));
    const d = screen.getByRole("dialog", { name: "Enviar o negócio para o lixo" });
    expect(within(d).getByText(/O negócio Cozinha de Ana deixa a lista de negócios/)).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: "Cancelar" })).toHaveFocus();
  });

  it("confirmar chama enviarParaLixo com o negócio, fecha e anuncia", async () => {
    const mutacoes = com({});
    const { aoFechar, aoConcluido } = abrir("apagar", mutacoes);
    fireEvent.click(screen.getByRole("button", { name: "Enviar para o lixo" }));
    expect(mutacoes.enviarParaLixo).toHaveBeenCalledWith("n1");
    expect(mutacoes.restaurar).not.toHaveBeenCalled();
    await waitFor(() => expect(aoConcluido).toHaveBeenCalledWith("Ana: negócio Cozinha enviado para o lixo."));
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("Cancelar fecha sem chamar a base", () => {
    const mutacoes = com({});
    const { aoFechar } = abrir("apagar", mutacoes);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(mutacoes.enviarParaLixo).not.toHaveBeenCalled();
  });

  it("estado ocupado: aria-busy, duplo clique faz uma só chamada, e «Cancelar» não fecha a meio", async () => {
    const acao = pendente();
    const enviarParaLixo = vi.fn(() => acao.promessa);
    const { aoFechar } = abrir("apagar", com({ enviarParaLixo }));
    const confirmar = screen.getByRole("button", { name: "Enviar para o lixo" });
    fireEvent.click(confirmar);
    fireEvent.click(confirmar);
    expect(enviarParaLixo).toHaveBeenCalledTimes(1);
    expect(confirmar).toHaveAttribute("aria-busy", "true");
    expect(confirmar).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoFechar).not.toHaveBeenCalled();
    await acao.terminar(undefined);
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
  });

  it("sem permissão (42501) o erro vem traduzido num alerta dentro do diálogo, que fica aberto", async () => {
    const enviarParaLixo = vi.fn(async () => { throw erroNegFalso("pessoasPagina.neg.write.error.permission", "42501"); });
    const { aoFechar, aoConcluido } = abrir("apagar", com({ enviarParaLixo }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar para o lixo" }));
    const alerta = await within(screen.getByRole("dialog")).findByRole("alert");
    expect(alerta).toHaveTextContent("Não tem permissão para fazer esta alteração.");
    expect(aoFechar).not.toHaveBeenCalled();
    expect(aoConcluido).not.toHaveBeenCalled();
  });

  it("sem a mutação de lixo (o exemplo) ou sem ficha real não desenha nada", () => {
    abrir("apagar", mutacoesFalsas());
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    abrir("apagar", null);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("restaurar", () => {
  it("diz que o negócio volta à lista e confirmar chama restaurar", async () => {
    const mutacoes = com({});
    const { aoConcluido, aoFechar } = abrir("restaurar", mutacoes);
    const d = screen.getByRole("dialog", { name: "Restaurar o negócio" });
    expect(within(d).getByText(/O negócio Cozinha de Ana volta à lista de negócios/)).toBeInTheDocument();
    fireEvent.click(within(d).getByRole("button", { name: "Restaurar o negócio" }));
    expect(mutacoes.restaurar).toHaveBeenCalledWith("n1");
    expect(mutacoes.enviarParaLixo).not.toHaveBeenCalled();
    await waitFor(() => expect(aoConcluido).toHaveBeenCalledWith("Ana: negócio Cozinha restaurado."));
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("um erro de restaurar também vem traduzido", async () => {
    const restaurar = vi.fn(async () => { throw erroNegFalso("pessoasPagina.neg.write.error.unavailable"); });
    abrir("restaurar", com({ restaurar }));
    fireEvent.click(screen.getByRole("button", { name: "Restaurar o negócio" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("já não está disponível para si");
  });
});
