// O detalhe de um negócio na ficha REAL (com as mutações e os dados da ficha por contexto): perder, anular a perda com razão e dar como
// ganho, tudo contra as mutações (nunca contra os stores do exemplo); o botão de ganhar desativado com o motivo à vista; e sem permissão
// para editar nenhuma destas ações aparece. Os testes do exemplo (sem contexto) estão em DetalheNegocioFicha.test.tsx e não mudam.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import type { DadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { alteracoesAtuais, repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";
import { negocioBase } from "./fabricaTestes";
import { ProcessoContext, type ProcessoValor } from "./processo/processoContexto";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
const { sucesso } = vi.hoisted(() => ({ sucesso: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: sucesso } }));

beforeAll(prepararRadixNoJsdom);
afterEach(() => { cleanup(); repor(); reporRegistos(); sucesso.mockReset(); });

const HOJE = "2026-10-19";
const aberto = negocioBase("n1", {
  pessoa: "Ana", servico: "Cozinha", estadoReal: "aberto", orcamentos: [{ id: "o", valor: 100, escolhido: true }], proposta: { estado: "enviada" },
});
const perdido = { ...negocioBase("n2", { pessoa: "Ana", servico: "Sala", estadoReal: "perdido", orcamentos: [{ id: "o", valor: 100, escolhido: true }], proposta: { estado: "enviada" } }), resultado: "perdido" as const, mes: "2026-10" };
const ganho = { ...negocioBase("n3", { pessoa: "Ana", servico: "Casa de banho", estadoReal: "ganho" }), resultado: "ganho" as const, mes: "2026-10" };
const comPerda: DadosNegocio["alteracoes"] = {
  editados: {}, detalhes: {}, sequencia: 0, perdidos: { n2: { motivo: "Preço", mes: "2026-10", data: "2026-10-05", fase: "proposta" } },
};

function abrir(negocio: Parameters<typeof DetalheNegocioFicha>[0]["negocio"], dados: Partial<DadosNegocio> = {}, mutacoes: MutacoesNegocio = mutacoesFalsas()) {
  render(
    <MemoryRouter>
      <ComCostura mutacoes={mutacoes} dados={dadosFalsos(dados)}>
        <DetalheNegocioFicha negocio={negocio} hoje={HOJE} aoVoltar={vi.fn()} />
      </ComCostura>
    </MemoryRouter>,
  );
  return mutacoes;
}

describe("negócio em curso, na ficha real", () => {
  it("oferece «Perder negócio» e «Dar como ganho»", () => {
    abrir(aberto);
    expect(screen.getByRole("button", { name: "Perder negócio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dar como ganho" })).toBeInTheDocument();
  });

  it("perder vai para a base (com a fase da base) e nunca para o store do exemplo", async () => {
    const mutacoes = abrir(aberto);
    fireEvent.click(screen.getByRole("button", { name: "Perder negócio" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Motivo da perda" }), { target: { value: "Preço" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar a perda" }));
    expect(mutacoes.perder).toHaveBeenCalledWith({ negocioId: "n1", fase: "proposta", motivo: "Preço" });
    await waitFor(() => expect(sucesso).toHaveBeenCalledTimes(1));
    expect(alteracoesAtuais().perdidos).toEqual({});
  });

  it("dar como ganho abre o diálogo e chama a base", async () => {
    const mutacoes = abrir(aberto);
    fireEvent.click(screen.getByRole("button", { name: "Dar como ganho" }));
    expect(screen.getByRole("dialog", { name: "Dar o negócio como ganho" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Dar como ganho" }));
    expect(mutacoes.ganhar).toHaveBeenCalledWith("n1", null);
    await waitFor(() => expect(sucesso).toHaveBeenCalledWith("Ana: negócio ganho. A pessoa passou a cliente."));
  });
});

describe("«Dar como ganho» quando as condições não estão cumpridas", () => {
  it("fica aria-disabled, com o motivo em texto visível ligado por aria-describedby, e não abre o diálogo", () => {
    abrir(aberto, { momentoGanho: "contrato_assinado" });
    const botao = screen.getByRole("button", { name: "Dar como ganho" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    const motivo = document.getElementById(botao.getAttribute("aria-describedby") ?? "");
    expect(motivo).toHaveTextContent("Para ganhar é preciso um contrato assinado ligado ao negócio.");
    expect(motivo).toBeVisible();
    fireEvent.click(botao);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("com a regra «proposta aceite» o motivo é a proposta", () => {
    abrir(aberto, { momentoGanho: "proposta_aceite" });
    const botao = screen.getByRole("button", { name: "Dar como ganho" });
    expect(document.getElementById(botao.getAttribute("aria-describedby") ?? "")).toHaveTextContent("Para ganhar é preciso uma proposta aceite ligada ao negócio.");
  });

  it("a proposta aceite cumpre a regra «proposta aceite»: o botão fica ativo", () => {
    abrir({ ...aberto, proposta: { estado: "aceite" } }, { momentoGanho: "proposta_aceite" });
    const botao = screen.getByRole("button", { name: "Dar como ganho" });
    expect(botao).not.toHaveAttribute("aria-disabled", "true");
    expect(botao).not.toHaveAttribute("aria-describedby");
  });

  it("o «pronto a ganhar» da base manda sobre a regra local", () => {
    abrir({ ...aberto, prontoAGanhar: true }, { momentoGanho: "contrato_assinado" });
    expect(screen.getByRole("button", { name: "Dar como ganho" })).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("negócio perdido, na ficha real", () => {
  it("diz em que fase e porquê se perdeu (da base) e oferece «Anular perda»", () => {
    abrir(perdido, { alteracoes: comPerda });
    // No aviso da perda e, como o negócio está terminado, também no percurso (que vem aberto).
    expect(screen.getAllByText("Perdido em Proposta: Preço").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Anular perda" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dar como ganho" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Perder negócio" })).toBeNull();
  });

  it("«Anular perda» abre o diálogo da razão e chama a base com ela (o store fica como estava)", async () => {
    const mutacoes = abrir(perdido, { alteracoes: comPerda });
    fireEvent.click(screen.getByRole("button", { name: "Anular perda" }));
    expect(screen.getByRole("dialog", { name: "Anular a perda" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Razão para anular a perda" }), { target: { value: "O cliente voltou" } });
    fireEvent.click(screen.getByRole("button", { name: "Anular a perda" }));
    expect(mutacoes.anular).toHaveBeenCalledWith("n2", "O cliente voltou");
    await waitFor(() => expect(sucesso).toHaveBeenCalledWith("Ana: perda anulada. O negócio Sala voltou a estar em curso."));
    expect(alteracoesAtuais().perdidos).toEqual({});
  });
});

describe("negócio ganho e permissões, na ficha real", () => {
  it("um negócio ganho não tem perder, anular nem ganhar", () => {
    abrir(ganho);
    for (const nome of ["Perder negócio", "Anular perda", "Dar como ganho"]) expect(screen.queryByRole("button", { name: nome })).toBeNull();
  });

  it("sem permissão para editar (pessoas.edit) não há perder nem ganhar", () => {
    abrir(aberto, { podeEditar: false });
    expect(screen.queryByRole("button", { name: "Perder negócio" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Dar como ganho" })).toBeNull();
  });

  it("sem permissão para editar não há «Anular perda»", () => {
    abrir(perdido, { alteracoes: comPerda, podeEditar: false });
    expect(screen.getAllByText("Perdido em Proposta: Preço").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("button", { name: "Anular perda" })).toBeNull();
  });
});

describe("abrir os documentos do negócio, na ficha real", () => {
  const noContrato = negocioBase("n4", {
    pessoa: "Ana", servico: "Cozinha", estadoReal: "aberto", orcamentos: [{ id: "o", valor: 100, escolhido: true }],
    proposta: { estado: "aceite" }, contrato: { estado: "pendente" },
  });

  function comProcesso(negocio: Parameters<typeof DetalheNegocioFicha>[0]["negocio"], processo: Partial<ProcessoValor>) {
    render(
      <MemoryRouter>
        <ProcessoContext.Provider value={{ executar: vi.fn(), abrirVisitaLevantamento: vi.fn(), ...processo }}>
          <ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos()}>
            <DetalheNegocioFicha negocio={negocio} hoje={HOJE} aoVoltar={vi.fn()} />
          </ComCostura>
        </ProcessoContext.Provider>
      </MemoryRouter>,
    );
  }
  const abrirSecao = (nome: RegExp) => fireEvent.click(within(screen.getAllByRole("heading", { level: 4, name: nome })[0]).getByRole("button"));

  it("cada secção de documentos tem o seu «Abrir», que pede o documento ao processo", () => {
    const abrirDocumento = vi.fn();
    comProcesso(noContrato, { abrirDocumento });
    abrirSecao(/^Orçamentos/);
    abrirSecao(/^Proposta/);
    fireEvent.click(screen.getByRole("button", { name: "Abrir orçamento" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir proposta" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir contrato" }));
    expect(abrirDocumento.mock.calls).toEqual([["orcamento", "n4"], ["proposta", "n4"], ["contrato", "n4"]]);
  });

  it("sem o processo real (o exemplo) não há botões «Abrir»", () => {
    comProcesso(noContrato, {});
    abrirSecao(/^Orçamentos/);
    abrirSecao(/^Proposta/);
    for (const nome of ["Abrir orçamento", "Abrir proposta", "Abrir contrato"]) expect(screen.queryByRole("button", { name: nome })).toBeNull();
  });

  it("só se abre o que existe: sem proposta nem contrato não há «Abrir proposta» nem «Abrir contrato»", () => {
    // Sem proposta nem contrato o negócio está em Orçamento, e essa secção já vem aberta.
    comProcesso({ ...noContrato, proposta: null, contrato: null }, { abrirDocumento: vi.fn() });
    expect(screen.getByRole("button", { name: "Abrir orçamento" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir proposta" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Abrir contrato" })).toBeNull();
  });
});

describe("«Criar orçamento» no detalhe (grupo A)", () => {
  // Sem proposta nem contrato o negócio está em Orçamento, e essa secção vem aberta.
  const semDocumentos = negocioBase("n5", { pessoa: "Ana", servico: "Cozinha", estadoReal: "aberto" });

  it("na ficha real não há «Criar orçamento»: o diálogo gravava só em memória e dizia que tinha criado", () => {
    abrir(semDocumentos);
    expect(screen.queryByRole("button", { name: "Criar orçamento" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Criar orçamento" })).toBeNull();
  });

  it("na ficha real, sem permissão para editar, também não", () => {
    abrir(semDocumentos, { podeEditar: false });
    expect(screen.queryByRole("button", { name: "Criar orçamento" })).toBeNull();
  });

  it("no exemplo (sem ficha real) o botão continua a existir e abre o diálogo", () => {
    render(<MemoryRouter><DetalheNegocioFicha negocio={semDocumentos} hoje={HOJE} aoVoltar={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Criar orçamento" }));
    expect(screen.getByRole("dialog", { name: "Criar orçamento" })).toBeInTheDocument();
  });
});
