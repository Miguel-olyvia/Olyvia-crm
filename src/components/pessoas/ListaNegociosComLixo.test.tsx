// O filtro «Lixo» da lista de negócios da ficha real: só quem pode restaurar (pessoas.delete e pessoas.edit) o vê; mostra os negócios no lixo com os
// eventos apagado e restaurado, sem os poder editar; restaurar pede confirmação. Quem não pode vê só a lista normal.
import { useEffect, useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { PermissoesPorNegocioContext } from "@/hooks/pessoas/bandeirasNegocio";
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import type { LixoDosNegocios, NegocioNoLixo } from "@/hooks/pessoas/useNegociosNoLixo";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ListaNegociosComLixo } from "./ListaNegociosComLixo";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
const { sucesso } = vi.hoisted(() => ({ sucesso: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: sucesso } }));
const { lixoMock } = vi.hoisted(() => ({ lixoMock: vi.fn() }));
vi.mock("@/hooks/pessoas/useNegociosNoLixo", () => ({ useNegociosNoLixo: (pessoa: string, ativo: boolean) => lixoMock(pessoa, ativo) }));

beforeAll(prepararRadixNoJsdom);
const repetir = vi.fn();
const lixo = (sobre: Partial<LixoDosNegocios> = {}): LixoDosNegocios => ({ itens: [], isLoading: false, isError: false, repetir, ...sobre });
beforeEach(() => { sucesso.mockReset(); repetir.mockReset(); lixoMock.mockReturnValue(lixo()); });
afterEach(cleanup);

const APAGADO: NegocioNoLixo = {
  id: "n9", titulo: "Cozinha velha", estado: "perdido", apagadoEm: "2026-10-18T10:00:00Z",
  eventos: [{ id: "e1", tipo: "apagado", em: "2026-10-18T10:00:00Z" }, { id: "e2", tipo: "restaurado", em: "2026-10-19T09:00:00Z" }, { id: "e3", tipo: "apagado", em: "2026-10-20T08:30:00Z" }],
};

function abrir(dados: Partial<DadosNegocio> = {}, extra: Partial<MutacoesNegocio> = { restaurar: vi.fn(async () => undefined) }) {
  const mutacoes = mutacoesFalsas(extra);
  render(
    <MemoryRouter>
      <ComCostura mutacoes={mutacoes} dados={dadosFalsos({ podeApagar: true, ...dados })}>
        <ListaNegociosComLixo pessoaId="p1" pessoaNome="Ana" lista={<p>LISTA NORMAL</p>} />
      </ComCostura>
    </MemoryRouter>,
  );
  return mutacoes;
}
const filtro = () => screen.getByRole("group", { name: "Negócios a mostrar" });
const abrirLixo = () => fireEvent.click(within(filtro()).getByRole("button", { name: "Lixo" }));

describe("quem vê o filtro", () => {
  it("com pessoas.delete e pessoas.edit vê «Em lista» e «Lixo», e a lista normal por omissão", () => {
    abrir();
    expect(within(filtro()).getByRole("button", { name: "Em lista" })).toHaveAttribute("aria-pressed", "true");
    expect(within(filtro()).getByRole("button", { name: "Lixo" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("LISTA NORMAL")).toBeInTheDocument();
  });

  it.each([
    ["sem pessoas.delete", { podeApagar: false }, undefined],
    ["sem pessoas.edit", { podeEditar: false }, undefined],
    ["sem a mutação de restaurar", {}, {}],
  ] as const)("%s só vê a lista normal, sem filtro", (_nome, dados, extra) => {
    abrir(dados, extra);
    expect(screen.getByText("LISTA NORMAL")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Negócios a mostrar" })).toBeNull();
  });

  it("no exemplo (sem ficha real) só vê a lista normal", () => {
    render(<MemoryRouter><ComCostura mutacoes={null} dados={null}><ListaNegociosComLixo pessoaId="p1" pessoaNome="Ana" lista={<p>LISTA NORMAL</p>} /></ComCostura></MemoryRouter>);
    expect(screen.getByText("LISTA NORMAL")).toBeInTheDocument();
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("só lê o lixo quando o filtro «Lixo» está escolhido", () => {
    abrir();
    expect(lixoMock).not.toHaveBeenCalled();
    abrirLixo();
    expect(lixoMock).toHaveBeenLastCalledWith("p1", true);
  });
});

describe("o foco ao entrar na lista", () => {
  it("quando a ficha o pede (o negócio foi para o lixo e o detalhe fechou-se), vai para o filtro e avisa que já o fez", async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    const aoFocado = vi.fn();
    render(
      <MemoryRouter>
        <ComCostura mutacoes={mutacoesFalsas({ restaurar: vi.fn(async () => undefined) })} dados={dadosFalsos({ podeApagar: true })}>
          <ListaNegociosComLixo pessoaId="p1" pessoaNome="Ana" lista={<p>LISTA NORMAL</p>} focarAoEntrar aoFocado={aoFocado} />
        </ComCostura>
      </MemoryRouter>,
    );
    await waitFor(() => expect(within(filtro()).getByRole("button", { name: "Em lista" })).toHaveFocus());
    expect(aoFocado).toHaveBeenCalledTimes(1);
  });

  it("sem esse pedido não puxa o foco, mesmo que ele esteja no corpo da página (abrir a ficha ou o separador)", () => {
    (document.activeElement as HTMLElement | null)?.blur();
    abrir();
    expect(document.body).toHaveFocus();
  });

  it("se o foco está noutro sítio (o separador que se acabou de escolher), não lho tira", () => {
    const fora = document.createElement("button");
    document.body.appendChild(fora);
    fora.focus();
    abrir();
    expect(fora).toHaveFocus();
    fora.remove();
  });
});

describe("a lista não remonta quando as permissões chegam", () => {
  it("passar de «sem pessoas.delete» a «com pessoas.delete» não perde o estado da lista nem a remonta", () => {
    const montagens = vi.fn();
    function ListaComEstado() {
      const [valor, setValor] = useState("");
      useEffect(() => { montagens(); }, []);
      return <input aria-label="pesquisa" value={valor} onChange={(e) => setValor(e.target.value)} />;
    }
    const arvore = (podeApagar: boolean) => (
      <MemoryRouter>
        <ComCostura mutacoes={mutacoesFalsas({ restaurar: vi.fn(async () => undefined) })} dados={dadosFalsos({ podeApagar })}>
          <ListaNegociosComLixo pessoaId="p1" pessoaNome="Ana" lista={<ListaComEstado />} />
        </ComCostura>
      </MemoryRouter>
    );
    const { rerender } = render(arvore(false));
    fireEvent.change(screen.getByRole("textbox", { name: "pesquisa" }), { target: { value: "cozinha" } });
    rerender(arvore(true));
    expect(screen.getByRole("group", { name: "Negócios a mostrar" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "pesquisa" })).toHaveValue("cozinha");
    expect(montagens).toHaveBeenCalledTimes(1);
  });

  it("sem o filtro visível mostra a lista e deixa de ler o lixo, mesmo que ele estivesse escolhido antes de perder a permissão", () => {
    const arvore = (podeApagar: boolean) => (
      <MemoryRouter>
        <ComCostura mutacoes={mutacoesFalsas({ restaurar: vi.fn(async () => undefined) })} dados={dadosFalsos({ podeApagar })}>
          <ListaNegociosComLixo pessoaId="p1" pessoaNome="Ana" lista={<p>LISTA NORMAL</p>} />
        </ComCostura>
      </MemoryRouter>
    );
    const { rerender } = render(arvore(true));
    abrirLixo();
    const leituras = lixoMock.mock.calls.length;
    rerender(arvore(false));
    expect(screen.getByText("LISTA NORMAL")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Negócios a mostrar" })).toBeNull();
    expect(lixoMock.mock.calls.length).toBe(leituras);
  });
});

describe("o lixo", () => {
  it("escolher «Lixo» esconde a lista normal e mostra os negócios do lixo com o estado, a data e os eventos", () => {
    lixoMock.mockReturnValue(lixo({ itens: [APAGADO] }));
    abrir();
    abrirLixo();
    expect(screen.queryByText("LISTA NORMAL")).toBeNull();
    const lista = screen.getByRole("list", { name: "Negócios no lixo" });
    expect(within(lista).getByText("Cozinha velha")).toBeInTheDocument();
    expect(within(lista).getByText("Perdido")).toBeInTheDocument();
    expect(within(lista).getByText("No lixo desde 18/10/2026")).toBeInTheDocument();
    expect(within(lista).getByText("Enviado para o lixo em 18/10/2026")).toBeInTheDocument();
    expect(within(lista).getByText("Restaurado em 19/10/2026")).toBeInTheDocument();
    expect(within(lista).getByText("Enviado para o lixo em 20/10/2026")).toBeInTheDocument();
  });

  it("um negócio no lixo não se edita: não tem botão de editar, e diz porquê", () => {
    lixoMock.mockReturnValue(lixo({ itens: [APAGADO] }));
    abrir();
    abrirLixo();
    expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
    expect(screen.getByText("Um negócio no lixo não se edita: restaure-o primeiro.")).toBeInTheDocument();
  });

  it("vazio diz que o lixo está vazio", () => {
    abrir();
    abrirLixo();
    expect(screen.getByText(/O lixo está vazio/)).toBeInTheDocument();
  });

  it("a carregar diz-o, num estado que o leitor de ecrã anuncia", () => {
    lixoMock.mockReturnValue(lixo({ isLoading: true }));
    abrir();
    abrirLixo();
    expect(screen.getByRole("status")).toHaveTextContent("A carregar o lixo…");
  });

  it("se a leitura falha diz que falhou (não finge que está vazio) e deixa tentar de novo", () => {
    lixoMock.mockReturnValue(lixo({ isError: true }));
    abrir();
    abrirLixo();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível ler o lixo");
    expect(screen.queryByText(/O lixo está vazio/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(repetir).toHaveBeenCalledTimes(1);
  });

  it("voltar a «Em lista» mostra outra vez a lista normal", () => {
    abrir();
    abrirLixo();
    fireEvent.click(within(filtro()).getByRole("button", { name: "Em lista" }));
    expect(screen.getByText("LISTA NORMAL")).toBeInTheDocument();
  });
});

describe("restaurar", () => {
  const botao = () => screen.getByRole("button", { name: "Restaurar o negócio Cozinha velha" });

  it("o botão começa pelo texto visível «Restaurar» (WCAG 2.5.3) e pede confirmação antes de chamar a base", async () => {
    lixoMock.mockReturnValue(lixo({ itens: [APAGADO] }));
    const mutacoes = abrir();
    abrirLixo();
    expect(botao()).toHaveTextContent("Restaurar");
    fireEvent.click(botao());
    expect(mutacoes.restaurar).not.toHaveBeenCalled();
    const d = screen.getByRole("dialog", { name: "Restaurar o negócio" });
    expect(within(d).getByText(/O negócio Cozinha velha de Ana volta à lista de negócios/)).toBeInTheDocument();
    fireEvent.click(within(d).getByRole("button", { name: "Restaurar o negócio" }));
    expect(mutacoes.restaurar).toHaveBeenCalledWith("n9");
    await waitFor(() => expect(sucesso).toHaveBeenCalledWith("Ana: negócio Cozinha velha restaurado."));
  });

  it("Cancelar devolve o foco ao botão «Restaurar» e não chama a base", async () => {
    lixoMock.mockReturnValue(lixo({ itens: [APAGADO] }));
    const mutacoes = abrir();
    abrirLixo();
    botao().focus();
    fireEvent.click(botao());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    expect(mutacoes.restaurar).not.toHaveBeenCalled();
    await waitFor(() => expect(botao()).toHaveFocus());
  });

  it("se a base recusa (sem permissão sobre este negócio), o erro aparece traduzido no diálogo e o negócio fica no lixo", async () => {
    lixoMock.mockReturnValue(lixo({ itens: [APAGADO] }));
    const restaurar = vi.fn(async () => { throw new ErroNeg(null, "42501", "pessoasPagina.erroNeg.permissao"); });
    abrir({}, { restaurar });
    abrirLixo();
    fireEvent.click(botao());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restaurar o negócio" }));
    await waitFor(() => expect(restaurar).toHaveBeenCalledWith("n9"));
    expect(await within(screen.getByRole("dialog")).findByText("Não tem permissão para esta ação.")).toBeInTheDocument();
    expect(sucesso).not.toHaveBeenCalled();
  });

  it("depois de restaurar, o foco passa para o filtro (o botão desapareceu com o negócio)", async () => {
    lixoMock.mockReturnValue(lixo({ itens: [APAGADO] }));
    abrir();
    abrirLixo();
    fireEvent.click(botao());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restaurar o negócio" }));
    await waitFor(() => expect(sucesso).toHaveBeenCalled());
    await waitFor(() => expect(within(filtro()).getByRole("button", { name: "Lixo" })).toHaveFocus());
  });
});

describe("restaurar com as permissões por negócio (bandeira da migration B)", () => {
  function abrirComBandeira(dados: Partial<DadosNegocio>, bandeira: boolean) {
    lixoMock.mockReturnValue(lixo({ itens: [APAGADO] }));
    render(
      <MemoryRouter>
        <PermissoesPorNegocioContext.Provider value={bandeira}>
          <ComCostura mutacoes={mutacoesFalsas({ restaurar: vi.fn(async () => undefined) })} dados={dadosFalsos({ podeApagar: true, ...dados })}>
            <ListaNegociosComLixo pessoaId="p1" pessoaNome="Ana" lista={<p>LISTA NORMAL</p>} />
          </ComCostura>
        </PermissoesPorNegocioContext.Provider>
      </MemoryRouter>,
    );
    abrirLixo();
  }
  const restaurar = () => screen.queryByRole("button", { name: /Restaurar/ });

  it("pode_restaurar falso para este negócio: o botão não aparece", () => {
    abrirComBandeira({ permissoesNegocio: (id) => (id === "n9" ? { restaurar: false } : null) }, true);
    expect(screen.getByText("Cozinha velha")).toBeInTheDocument();
    expect(restaurar()).toBeNull();
  });

  it("pode_restaurar verdadeiro, em falta, ou negócio que a ficha não conhece (o lixo não vem na ficha): aparece como hoje", () => {
    abrirComBandeira({ permissoesNegocio: () => ({ restaurar: true }) }, true);
    expect(restaurar()).toBeInTheDocument();
    cleanup();
    abrirComBandeira({ permissoesNegocio: () => null }, true);
    expect(restaurar()).toBeInTheDocument();
    cleanup();
    abrirComBandeira({}, true);
    expect(restaurar()).toBeInTheDocument();
  });

  it("com a bandeira desligada o campo é ignorado", () => {
    abrirComBandeira({ permissoesNegocio: () => ({ restaurar: false }) }, false);
    expect(restaurar()).toBeInTheDocument();
  });
});
