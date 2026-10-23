// «Marcar visita para este negócio» nos Registos ligados do exemplo (memória): a visita marcada fica ligada a esse negócio e aparece nele; um
// negócio terminado só mostra (sem botão). Sem o diálogo da página (sem provider) o botão não existe. Nada fala com a base.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AnuncioFichaContext } from "@/components/ficha-comum/anuncioFicha";
import { repor as reporAlterados } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporNovos } from "@/components/negocio-metas/negociosNovos";
import { registosAtuais, repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { MarcarVisitaProvider } from "./MarcarVisita";
import { repor as reporPessoasNovas } from "./pessoasNovas";
import { RegistosLigadosNegocio } from "./RegistosLigadosNegocio";
import { moradaDaLead } from "./moradaVisita";
import { usePessoasEstado } from "./usePessoasEstado";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

beforeAll(prepararRadixNoJsdom);
const reporTudo = () => { reporRegistos(); reporPessoasNovas(); reporNovos(); reporAlterados(); };
beforeEach(() => { reporTudo(); localStorage.clear(); });
afterEach(() => { cleanup(); reporTudo(); });

const AMANHA = "2026-12-30";
/** O nome do botão começa pelo texto visível e acrescenta o negócio (rótulo no nome acessível, e distingue os negócios da ficha). */
const BOTAO = /^Marcar visita para este negócio\b/;

/** A página em miniatura: o estado do exemplo, o diálogo de marcar visita e os registos ligados de um negócio (aberto ou terminado). */
function Pagina({ negocioId, aberto = true, comProvider = true, anunciar = vi.fn(), comMorada = false }: {
  negocioId?: string; aberto?: boolean; comProvider?: boolean; anunciar?: (t: string) => void; comMorada?: boolean;
}) {
  const p = usePessoasEstado(true);
  const resumo = p.resumos.find((r) => r.abertos.length > 0 && !r.pessoa.perdida && !r.pessoa.encerrada && (!comMorada || moradaDaLead(r.pessoa)))!;
  const negocio = resumo.abertos.find((n) => n.id === negocioId) ?? resumo.abertos[0];
  const conteudo = (
    <AnuncioFichaContext.Provider value={anunciar}>
      <p data-testid="ids">{`${resumo.pessoa.id}|${negocio.id}`}</p>
      <RegistosLigadosNegocio negocio={negocio} aberto={aberto} />
    </AnuncioFichaContext.Provider>
  );
  return comProvider ? <MarcarVisitaProvider hoje={HOJE_EXEMPLO} aoMarcar={p.marcarVisita}>{conteudo}</MarcarVisitaProvider> : conteudo;
}

const marcar = () => {
  fireEvent.click(screen.getByRole("button", { name: BOTAO }));
  const dialogo = screen.getByRole("dialog");
  fireEvent.change(within(dialogo).getByLabelText("Dia"), { target: { value: AMANHA } });
  fireEvent.change(within(dialogo).getByLabelText("Hora (opcional)"), { target: { value: "10:00" } });
  // Com a morada da lead (a escolha por omissão) não há campo de rua; sem ela, escreve-se a rua.
  const rua = within(dialogo).queryByLabelText("Rua e número");
  if (rua) fireEvent.change(rua, { target: { value: "Rua B 2" } });
  fireEvent.click(within(dialogo).getByRole("button", { name: /^Marcar visita$/ }));
};

describe("Marcar visita para este negócio (exemplo)", () => {
  it("a visita marcada a partir do negócio fica ligada a ele e aparece nos registos ligados", () => {
    render(<Pagina />);
    const [pessoaId, negocioId] = screen.getByTestId("ids").textContent!.split("|");
    marcar();
    const nova = registosAtuais().visitas.find((v) => v.pessoaId === pessoaId && v.data === AMANHA);
    expect(nova).toMatchObject({ negocioId, hora: "10:00", estado: "porFazer" });
    // Aparece no negócio, já com «Desligar», e não em «por ligar».
    expect(screen.getByRole("button", { name: /^Desligar do negócio: Visita de/ })).toBeInTheDocument();
  });

  it("sem o diálogo da página (sem provider) o botão não existe", () => {
    render(<Pagina comProvider={false} />);
    expect(screen.queryByRole("button", { name: BOTAO })).not.toBeInTheDocument();
  });

  it("um negócio terminado só mostra: não há botão de marcar visita", () => {
    render(<Pagina aberto={false} />);
    expect(screen.queryByRole("button", { name: BOTAO })).not.toBeInTheDocument();
  });
});

describe("Marcar visita para este negócio: acessibilidade", () => {
  it("o nome acessível diz de que negócio se trata", () => {
    render(<Pagina />);
    const nome = screen.getByRole("button", { name: BOTAO }).getAttribute("aria-label") ?? "";
    expect(nome).toMatch(/^Marcar visita para este negócio: .+/);
  });

  it("o botão não transborda em ecrãs estreitos: o texto quebra linha", () => {
    render(<Pagina />);
    const botao = screen.getByRole("button", { name: BOTAO });
    expect(botao).toHaveClass("whitespace-normal");
    expect(botao).toHaveClass("h-auto");
  });

  it("a morada da lead é oferecida, como no passo «A fazer»", () => {
    render(<Pagina comMorada />);
    fireEvent.click(screen.getByRole("button", { name: BOTAO }));
    expect(within(screen.getByRole("dialog")).getByRole("radio", { name: /Na morada da lead/i })).toBeInTheDocument();
  });

  it("ao marcar, a região live diz que a visita ficou ligada ao negócio", () => {
    const anunciar = vi.fn();
    render(<Pagina anunciar={anunciar} />);
    marcar();
    expect(anunciar).toHaveBeenCalledWith(expect.stringMatching(/ligada ao negócio/));
  });

  it("ao cancelar, o foco volta ao botão que abriu o diálogo", async () => {
    render(<Pagina />);
    const botao = screen.getByRole("button", { name: BOTAO });
    botao.focus();
    fireEvent.click(botao);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(botao).toHaveFocus());
  });

  it("ao marcar, o foco volta ao botão", async () => {
    render(<Pagina />);
    const botao = screen.getByRole("button", { name: BOTAO });
    botao.focus();
    marcar();
    await waitFor(() => expect(botao).toHaveFocus());
  });
});

