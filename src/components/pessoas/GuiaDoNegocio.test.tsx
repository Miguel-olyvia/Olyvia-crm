// O guia do passo seguinte dentro do detalhe de um negócio aberto (a ficha real): o botão faz o passo no próprio ecrã. Criar o orçamento usa o mesmo
// executor do Quadro (`ProcessoContext`), «Fazer o levantamento» abre o painel ligado ao negócio, sem permissão o passo fica desativado com a razão,
// e perder o negócio continua ao alcance. Os painéis e a base estão simulados.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";
import { negocioBase, pessoaBase } from "./fabricaTestes";
import { ProcessoContext, type ProcessoValor } from "./processo/processoContexto";
import type { ItemProcesso } from "./processo/tiposProcesso";

const { abrirLevantamento, levantamentoPode } = vi.hoisted(() => ({ abrirLevantamento: vi.fn(), levantamentoPode: { valor: true } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/pessoas/useComerciaisNegocio", () => ({
  useComerciaisNegocio: () => ({ comerciais: [], isLoading: false, isError: false, repetir: vi.fn() }),
}));
vi.mock("@/components/pessoas-processo/LevantamentoDoNegocioReal", () => ({
  useLevantamentoDoNegocio: () => ({ pode: levantamentoPode.valor, abrir: abrirLevantamento }),
}));
const { abrirDocumento, documentos } = vi.hoisted(() => ({ abrirDocumento: vi.fn(), documentos: { pode: true, semProvider: false } }));
vi.mock("@/components/pessoas-processo/DocumentosDoNegocioReal", () => ({
  useDocumentosDoNegocio: () => (documentos.semProvider ? null : { pode: () => documentos.pode, abrir: abrirDocumento }),
}));

beforeAll(prepararRadixNoJsdom);
afterEach(() => {
  cleanup(); repor(); reporRegistos(); abrirLevantamento.mockReset(); levantamentoPode.valor = true;
  abrirDocumento.mockReset(); documentos.pode = true; documentos.semProvider = false;
});

const HOJE = "2026-10-19";
const negocio = { ...negocioBase("n1", { pessoa: "Pedro Lopes", servico: "WC social", estadoReal: "aberto", contacto: { telefone: "927 118 300", email: null } }), notas: "", comercialId: "u1" };
const itemDe = (extra: Partial<ItemProcesso> = {}): ItemProcesso => ({
  id: "n1", pessoaId: "a", tipo: "negocio", fase: "orcamento", trabalho: "WC social", valor: null, prazo: null, atrasado: false, orcamentos: 0,
  verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false, ...extra,
});
const REAL: FontePessoas = {
  modo: "real", organizationId: "org-1", momentoGanho: "manual",
  permissoesFecho: ["quotes.create", "proposals.edit", "client_contracts.create", "client_contracts.edit"],
};

function processo(extra: Partial<ProcessoValor> = {}): ProcessoValor {
  return { executar: vi.fn(), abrirVisitaLevantamento: vi.fn(), podeExecutar: () => true, ...extra };
}

function abrir(item: ItemProcesso, p: ProcessoValor | null = processo(), opcoes: { podeEditar?: boolean; fonte?: FontePessoas; negocio?: typeof negocio } = {}) {
  render(
    <MemoryRouter>
      <FontePessoasContext.Provider value={opcoes.fonte ?? REAL}>
        <ProcessoContext.Provider value={p}>
          <ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos({ podeEditar: opcoes.podeEditar ?? true })}>
            <DetalheNegocioFicha negocio={opcoes.negocio ?? negocio} hoje={HOJE} aoVoltar={vi.fn()} item={item} pessoa={pessoaBase("a", { nome: "Pedro Lopes", contacto: { telefone: "927 118 300", email: "pedro@x.pt" } })} atividade={[]} comGuia />
          </ComCostura>
        </ProcessoContext.Provider>
      </FontePessoasContext.Provider>
    </MemoryRouter>,
  );
}

describe("o guia do negócio aberto", () => {
  it("sem a bandeira do guia (o exemplo) fica o texto do passo e a lista de fases de sempre", () => {
    render(
      <MemoryRouter>
        <ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos()}>
          <DetalheNegocioFicha negocio={negocio} hoje={HOJE} aoVoltar={vi.fn()} item={itemDe()} />
        </ComCostura>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("heading", { level: 2, name: "Criar o orçamento." })).toBeNull();
    expect(screen.getByRole("heading", { level: 4, name: "Próximo passo e prazo" })).toBeInTheDocument();
  });

  it("mostra o passo como título grande, as fases, o cartão do cliente e substitui a faixa e a lista de fases antigas", () => {
    abrir(itemDe());
    expect(screen.getByRole("heading", { level: 2, name: "Criar o orçamento." })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Fases" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Cliente" })).toBeInTheDocument();
    expect(screen.getByText("pedro@x.pt")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Próximo passo e prazo" })).toBeInTheDocument();
    expect(screen.queryByText(/depois:/)).toBeNull();
  });

  it("«Criar o orçamento» abre o editor real pelo executor do processo, no próprio ecrã", () => {
    const p = processo();
    abrir(itemDe(), p);
    fireEvent.click(screen.getByRole("button", { name: /^Criar o orçamento/ }));
    expect(p.executar).toHaveBeenCalledTimes(1);
    expect((p.executar as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ id: "n1", fase: "orcamento" });
  });

  it("«Fazer o levantamento» abre o painel ligado ao NEGÓCIO (e não executa nada do processo)", () => {
    const p = processo({ podeExecutar: () => false });
    abrir(itemDe({ fase: "levantamento" }), p);
    fireEvent.click(screen.getByRole("button", { name: /^Fazer o levantamento/ }));
    expect(abrirLevantamento).toHaveBeenCalledTimes(1);
    expect(abrirLevantamento.mock.calls[0][0]).toBe("n1");
    expect(p.executar).not.toHaveBeenCalled();
  });

  it("sem o painel do levantamento disponível, o passo fica desativado com a razão (não desaparece nem finge)", () => {
    levantamentoPode.valor = false;
    abrir(itemDe({ fase: "levantamento" }));
    const botao = screen.getByRole("button", { name: /^Fazer o levantamento/ });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Este passo ainda não está disponível neste ecrã.")).toBeInTheDocument();
    fireEvent.click(botao);
    expect(abrirLevantamento).not.toHaveBeenCalled();
  });

  it("sem permissão de editar o passo fica desativado com a razão", () => {
    abrir(itemDe({ fase: "levantamento" }), processo(), { podeEditar: false });
    expect(screen.getByRole("button", { name: /^Fazer o levantamento/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Não tem permissão para fazer este passo.")).toBeInTheDocument();
  });

  it("sem quotes.create o orçamento não se cria: desativado com a razão, e o executor não é chamado", () => {
    const p = processo();
    abrir(itemDe(), p, { fonte: { ...REAL, permissoesFecho: ["proposals.create"] } });
    const botao = screen.getByRole("button", { name: /^Criar o orçamento/ });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botao);
    expect(p.executar).not.toHaveBeenCalled();
  });

  const PASSOS_DOCUMENTO: Array<[string, Partial<ItemProcesso>, RegExp, string]> = [
    ["enviarProposta", { fase: "proposta", propostaRascunho: true }, /^Enviar a proposta/, "Enviar a proposta."],
    ["registarRespostaCliente", { fase: "proposta" }, /^Registar a resposta do cliente/, "Registar a resposta do cliente."],
    ["criarContrato", { fase: "proposta", propostaAceite: true }, /^Criar o contrato/, "A proposta foi aceite. Criar o contrato."],
    ["registarAssinatura", { fase: "contrato" }, /^Registar a assinatura/, "Registar a assinatura."],
  ];

  it.each(PASSOS_DOCUMENTO)("«%s» abre o diálogo do passo no próprio ecrã (sem navegar nem usar o executor do processo)", (passo, extra, nomeBotao, titulo) => {
    const p = processo();
    abrir(itemDe(extra), p);
    expect(screen.getByRole("heading", { level: 2, name: titulo })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: nomeBotao }));
    expect(abrirDocumento).toHaveBeenCalledTimes(1);
    expect(abrirDocumento).toHaveBeenCalledWith(passo, "n1");
    expect(p.executar).not.toHaveBeenCalled();
    expect(p.abrirDocumento).toBeUndefined();
  });

  it.each(PASSOS_DOCUMENTO)("«%s» sem a lista de permissões conhecida fica desativado «a carregar» e não abre nada (falha fechada)", (_passo, extra, nomeBotao) => {
    const { permissoesFecho: _fora, ...semLista } = REAL as Extract<FontePessoas, { modo: "real" }>;
    abrir(itemDe(extra), processo(), { fonte: semLista });
    const botao = screen.getByRole("button", { name: nomeBotao });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("A carregar as suas permissões. Se isto persistir, recarregue a página.")).toBeInTheDocument();
    fireEvent.click(botao);
    expect(abrirDocumento).not.toHaveBeenCalled();
  });

  it.each(PASSOS_DOCUMENTO)("«%s» sem o documento no negócio fica desativado com a razão (não é um botão morto)", (_passo, extra, nomeBotao) => {
    documentos.pode = false;
    abrir(itemDe(extra));
    const botao = screen.getByRole("button", { name: nomeBotao });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("O documento deste passo ainda não está no negócio.")).toBeInTheDocument();
    fireEvent.click(botao);
    expect(abrirDocumento).not.toHaveBeenCalled();
  });

  it("sem o provider dos documentos o passo fica desativado e o executor do processo não navega", () => {
    documentos.semProvider = true;
    const p = processo();
    abrir(itemDe({ fase: "proposta", propostaRascunho: true }), p);
    const botao = screen.getByRole("button", { name: /^Enviar a proposta/ });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botao);
    expect(p.executar).not.toHaveBeenCalled();
  });

  it("sem permissão de editar, enviar a proposta fica desativado com a razão", () => {
    abrir(itemDe({ fase: "proposta", propostaRascunho: true }), processo(), { podeEditar: false });
    expect(screen.getByRole("button", { name: /^Enviar a proposta/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Não tem permissão para fazer este passo.")).toBeInTheDocument();
  });

  it("«Perder negócio» continua ao alcance, dentro do guia", () => {
    abrir(itemDe());
    expect(screen.getByRole("button", { name: "Perder negócio" })).toBeInTheDocument();
  });

  it("no passo de ganhar o botão «Ganhar o negócio» leva o foco ao bloco de fecho que já existe, sem executar nada do processo", () => {
    const p = processo({ podeExecutar: () => false });
    abrir(itemDe({ fase: "contrato", prontoAGanhar: true }), p, { negocio: { ...negocio, prontoAGanhar: true } });
    fireEvent.click(screen.getByRole("button", { name: "Ganhar o negócio" }));
    expect(document.activeElement).toBe(document.querySelector("[data-bloco-fecho]"));
    expect(p.executar).not.toHaveBeenCalled();
  });

  it("sem o bloco de fecho (o negócio não está pronto a ganhar) não há botão morto: só o texto do passo", () => {
    abrir(itemDe({ fase: "contrato", prontoAGanhar: true }), processo({ podeExecutar: () => false }));
    expect(screen.queryByRole("button", { name: "Ganhar o negócio" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "O contrato está assinado. Ganhar o negócio." })).toBeInTheDocument();
  });
});
