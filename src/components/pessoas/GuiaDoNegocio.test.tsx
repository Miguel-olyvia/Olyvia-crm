// O guia do passo seguinte dentro do detalhe de um negócio aberto (a ficha real): o botão faz o passo no próprio ecrã. Criar o orçamento usa o mesmo
// executor do Quadro (`ProcessoContext`), «Fazer o levantamento» abre o painel ligado ao negócio, sem permissão o passo fica desativado com a razão,
// e perder o negócio continua ao alcance. Os painéis e a base estão simulados.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ComClienteQuery } from "@/test/clienteQueryTeste";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";
import { negocioBase, pessoaBase } from "./fabricaTestes";
import { ProcessoContext, type ProcessoValor } from "./processo/processoContexto";
import type { ItemProcesso } from "./processo/tiposProcesso";

const { levantamentoPode } = vi.hoisted(() => ({ levantamentoPode: { valor: true } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/pessoas/useComerciaisNegocio", () => ({
  useComerciaisNegocio: () => ({ comerciais: [], isLoading: false, isError: false, repetir: vi.fn() }),
}));
vi.mock("@/components/pessoas-processo/LevantamentoDoNegocioReal", () => ({
  useLevantamentoDoNegocio: () => ({ pode: levantamentoPode.valor, ficha: null }),
}));
const { abrirDocumento, documentos } = vi.hoisted(() => ({ abrirDocumento: vi.fn(), documentos: { pode: true, semProvider: false } }));
vi.mock("@/components/pessoas-processo/DocumentosDoNegocioReal", () => ({
  useDocumentosDoNegocio: () => (documentos.semProvider ? null : { pode: () => documentos.pode, abrir: abrirDocumento }),
}));

beforeAll(prepararRadixNoJsdom);
afterEach(() => {
  cleanup(); repor(); reporRegistos(); levantamentoPode.valor = true;
  abrirDocumento.mockReset(); documentos.pode = true; documentos.semProvider = false;
});

const HOJE = "2026-10-19";
const negocio = { ...negocioBase("n1", { pessoa: "Pedro Lopes", servico: "WC social", estadoReal: "aberto", contacto: { telefone: "927 118 300", email: null } }), notas: "", comercialId: "u1" };
// O negócio já tem o levantamento escrito: está para lá da abordagem (sem isto um negócio sem orçamento recua para Por contactar, Contactado ou Visita; ver GuiaDoNegocioAssistente.test.tsx).
const negocioComLevantamento = { ...negocio, levantamento: { data: "2026-10-10", feitoPor: "Ana Ribeiro", estado: "feito" as const, linhas: [], observacoes: "" } };
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
    <ComClienteQuery><MemoryRouter>
      <FontePessoasContext.Provider value={opcoes.fonte ?? REAL}>
        <ProcessoContext.Provider value={p}>
          <ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos({ podeEditar: opcoes.podeEditar ?? true })}>
            <DetalheNegocioFicha negocio={opcoes.negocio ?? (item.fase === "levantamento" ? negocio : negocioComLevantamento)} hoje={HOJE} aoVoltar={vi.fn()} item={item} pessoa={pessoaBase("a", { nome: "Pedro Lopes", contacto: { telefone: "927 118 300", email: "pedro@x.pt" } })} atividade={[]} comGuia />
          </ComCostura>
        </ProcessoContext.Provider>
      </FontePessoasContext.Provider>
    </MemoryRouter></ComClienteQuery>,
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

  describe("em Levantamento o guia é o assistente da fase Visita", () => {
    const coluna = () => within(screen.getByRole("navigation", { name: "Passos da fase" }));

    it("mostra os passos da fase (Visitas e Fechar levantamento) em vez do botão único «Fazer o levantamento», e não abre o painel antigo", () => {
      const p = processo({ podeExecutar: () => false });
      abrir(itemDe({ fase: "levantamento" }), p);
      expect(screen.queryByRole("button", { name: /^Fazer o levantamento/ })).toBeNull();
      const nomes = coluna().getAllByRole("button").map((b) => b.textContent?.replace(/^\d+/, "").replace(/, .*$/, ""));
      expect(nomes[0]).toBe("Visitas");
      expect(nomes.at(-1)).toBe("Fechar levantamento");
      expect(screen.getByText(/^Passo 1 de \d+/)).toBeInTheDocument();
      expect(p.executar).not.toHaveBeenCalled();
    });

    it("o levantamento é do negócio: os passos que gravam dizem que sem permissão não se pode", () => {
      abrir(itemDe({ fase: "levantamento" }), processo(), { podeEditar: false });
      fireEvent.click(coluna().getByRole("button", { name: /^Fechar levantamento/ }));
      expect(screen.getByText("Não tem permissão para fazer este passo.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Guardar o levantamento" })).toBeNull();
    });

    it("sem a ficha da base (o painel do levantamento indisponível) não se pode guardar e diz porquê", () => {
      abrir(itemDe({ fase: "levantamento" }));
      fireEvent.click(coluna().getByRole("button", { name: /^Fechar levantamento/ }));
      expect(screen.getByRole("button", { name: "Guardar o levantamento" })).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByText("Só se pode guardar com a ficha da base aberta.")).toBeInTheDocument();
    });
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

  it("o botão de perder continua ao alcance, dentro do guia, e diz «Marcar como perdido»", () => {
    abrir(itemDe());
    expect(screen.getByRole("button", { name: "Marcar como perdido" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Perder negócio" })).toBeNull();
  });

  it("«Marcar como perdido» abre o mesmo diálogo do motivo da perda", () => {
    abrir(itemDe());
    fireEvent.click(screen.getByRole("button", { name: "Marcar como perdido" }));
    expect(screen.getByRole("combobox", { name: "Motivo da perda" })).toBeInTheDocument();
  });

  it("no Pipeline não há «Fechar agora», nem «Ganhar o negócio» sem nada para onde levar: só o texto do passo", () => {
    const p = processo({ podeExecutar: () => false });
    abrir(itemDe({ fase: "contrato", prontoAGanhar: true }), p, { negocio: { ...negocio, prontoAGanhar: true } });
    expect(screen.queryByRole("button", { name: "Fechar agora" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ganhar o negócio" })).toBeNull();
    expect(document.querySelector("[data-bloco-fecho]")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "O contrato está assinado. Ganhar o negócio." })).toBeInTheDocument();
  });

  it("o aviso «sem prova» (que só mandava para «Fechar agora») também não aparece no Pipeline", () => {
    const comAviso = { ...negocio, prontoAGanhar: true, alerta: { codigo: "sem_prova" as const } } as unknown as typeof negocio;
    abrir(itemDe({ fase: "contrato", prontoAGanhar: true }), processo({ podeExecutar: () => false }), { negocio: comAviso });
    expect(screen.queryByText(/sem prova de que o cliente decidiu/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Fechar agora" })).toBeNull();
  });

  it("sem o bloco de fecho (o negócio não está pronto a ganhar) não há botão morto: só o texto do passo", () => {
    abrir(itemDe({ fase: "contrato", prontoAGanhar: true }), processo({ podeExecutar: () => false }));
    expect(screen.queryByRole("button", { name: "Ganhar o negócio" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "O contrato está assinado. Ganhar o negócio." })).toBeInTheDocument();
  });
});

describe("o negócio aberto com o guia é um só ecrã (sem o bloco de título de antes)", () => {
  it("o serviço é a linha do cabeçalho do guia: já não há o título do negócio nem os selos «Negócio» e da fase", () => {
    abrir(itemDe());
    expect(screen.getAllByText("WC social")).not.toHaveLength(0);
    expect(screen.queryByText("Negócio", { selector: "span" })).toBeNull();
    expect(screen.getAllByRole("heading", { name: "Pedro Lopes" })).toHaveLength(1);
    expect(screen.getAllByRole("list", { name: "Fases" })).toHaveLength(1);
  });

  it("o guia do Pipeline já não tem as linhas «Valor» e «Comercial», nem o alerta «Sem orçamento escolhido»", () => {
    abrir(itemDe());
    const guia = screen.getByRole("region", { name: "Passo seguinte" });
    expect(within(guia).queryByText("Valor")).toBeNull();
    expect(within(guia).queryByText("Comercial")).toBeNull();
    expect(screen.queryByText("Sem orçamento escolhido")).toBeNull();
  });

  it("o selo «Fecha no contrato» (a omissão) não aparece no Pipeline; a venda directa continua dita", () => {
    abrir(itemDe(), processo(), { negocio: { ...negocioComLevantamento, fecho: "contrato" } as typeof negocio });
    expect(screen.queryByText("Fecha no contrato")).toBeNull();
    cleanup();
    abrir(itemDe(), processo(), { negocio: { ...negocioComLevantamento, fecho: "proposta" } as typeof negocio });
    expect(screen.getByText("Fecha na proposta (venda directa)")).toBeInTheDocument();
  });

  it("um negócio ganho também fica sem as linhas «Valor» e «Comercial»", () => {
    abrir(itemDe(), processo(), { negocio: { ...negocio, estadoReal: "ganho" } });
    expect(screen.queryByText("Valor")).toBeNull();
    expect(screen.queryByText("Comercial")).toBeNull();
  });

  it("o foco inicial vai para o cabeçalho do guia (o título que antes era o do negócio)", () => {
    abrir(itemDe());
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Pedro Lopes" }));
  });

  it("um negócio ganho fica com o cabeçalho, a barra de fases, o cartão do cliente, sem passo nem botão primário", () => {
    abrir(itemDe(), processo(), { negocio: { ...negocio, estadoReal: "ganho" } });
    expect(screen.getAllByRole("list", { name: "Fases" })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 4, name: "Cliente" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Criar o orçamento." })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Criar o orçamento/ })).toBeNull();
  });
});
