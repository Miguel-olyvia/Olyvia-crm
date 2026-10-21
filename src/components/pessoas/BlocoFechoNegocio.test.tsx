// O bloco de fecho do detalhe (fecho v4), com a bandeira ligada: «Fechar agora» num aberto pronto a ganhar, a origem do ganho, «Converter em
// cliente» e «Reabrir negócio» num ganho, «Manter perdido» num perdido e os alertas. Sem a bandeira nada disto aparece.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FechoV4Context } from "@/components/negocio-metas/bandeiraFecho";
import type { DadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { ComCostura, dadosFalsos, erroNegFalso, mutacoesFalsas, pendente } from "@/components/negocio-metas/costuraTestUtil";
import type { MutacoesNegocio, ResultadoReavaliar } from "@/components/negocio-metas/mutacoesNegocio";
import { repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";
import { negocioBase } from "./fabricaTestes";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
const { sucesso } = vi.hoisted(() => ({ sucesso: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: sucesso } }));

beforeAll(prepararRadixNoJsdom);
beforeEach(() => sucesso.mockReset());
afterEach(() => { cleanup(); repor(); reporRegistos(); });

const HOJE = "2026-10-19";
const aberto = (extra = {}) => negocioBase("n1", { pessoa: "Ana", servico: "Cozinha", estadoReal: "aberto", fecho: "contrato", ...extra });
const ganho = (extra = {}) => ({
  ...negocioBase("n2", { pessoa: "Ana", servico: "Casa", estadoReal: "ganho", fecho: "contrato", ...extra }), resultado: "ganho" as const, mes: "2026-10",
});
const perdido = (extra = {}) => ({
  ...negocioBase("n3", { pessoa: "Ana", servico: "Sala", estadoReal: "perdido", fecho: "contrato", ...extra }), resultado: "perdido" as const, mes: "2026-10",
});

const resultado = (extra: Partial<ResultadoReavaliar> = {}): ResultadoReavaliar => ({
  mudou: true, estado: "ganho", origemTipo: "proposta", origemId: "p1", prova: "aceite_pelo_cliente", conversao: "feita", motivo: null, ...extra,
});

function abrir(
  negocio: Parameters<typeof DetalheNegocioFicha>[0]["negocio"], extra: Partial<MutacoesNegocio> = {}, dados: Partial<DadosNegocio> = {}, ligada = true,
) {
  const mutacoes = mutacoesFalsas({
    reavaliar: vi.fn(async () => resultado()), reabrirGanho: vi.fn(async () => ({ mudou: true })), dispensarAlerta: vi.fn(async () => ({ mudou: true })), ...extra,
  });
  render(
    <MemoryRouter>
      <FechoV4Context.Provider value={ligada}>
        <ComCostura mutacoes={mutacoes} dados={dadosFalsos({ podeReabrir: true, podeConverter: true, ...dados })}>
          <DetalheNegocioFicha negocio={negocio} hoje={HOJE} aoVoltar={vi.fn()} />
        </ComCostura>
      </FechoV4Context.Provider>
    </MemoryRouter>,
  );
  return mutacoes;
}

describe("com a bandeira desligada", () => {
  it("nada do fecho novo, e o «Dar como ganho» antigo já não existe", () => {
    abrir(aberto({ prontoAGanhar: true }), {}, {}, false);
    expect(screen.queryByRole("button", { name: "Dar como ganho" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fechar agora" })).toBeNull();
    cleanup();
    abrir(ganho({ alerta: { codigo: "conversao_falhou" } }), {}, {}, false);
    expect(screen.queryByRole("button", { name: "Reabrir negócio" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Converter em cliente" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Avisos do negócio" })).toBeNull();
  });
});

describe("negócio aberto", () => {
  it("sai o «Dar como ganho» antigo e há «Perder»", () => {
    abrir(aberto());
    expect(screen.queryByRole("button", { name: "Dar como ganho" })).toBeNull();
    expect(screen.getByRole("button", { name: "Perder negócio" })).toBeInTheDocument();
  });

  it("«Fechar agora» só aparece com o negócio pronto a ganhar e com permissão de editar", () => {
    abrir(aberto());
    expect(screen.queryByRole("button", { name: "Fechar agora" })).toBeNull();
    cleanup();
    abrir(aberto({ prontoAGanhar: true }), {}, { podeEditar: false });
    expect(screen.queryByRole("button", { name: "Fechar agora" })).toBeNull();
    cleanup();
    abrir(aberto({ prontoAGanhar: true }), { reavaliar: undefined });
    expect(screen.queryByRole("button", { name: "Fechar agora" })).toBeNull();
    cleanup();
    abrir(aberto({ prontoAGanhar: true }));
    expect(screen.getByRole("button", { name: "Fechar agora" })).toBeInTheDocument();
  });

  it("«Fechar agora» chama a base e mostra o que ela devolveu (origem, prova e conversão)", async () => {
    const mutacoes = abrir(aberto({ prontoAGanhar: true }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar agora" }));
    expect(mutacoes.reavaliar).toHaveBeenCalledWith("n1");
    const estado = await screen.findByRole("status", { name: "Resultado de fechar agora" });
    expect(estado).toHaveTextContent("O negócio ficou ganho");
    expect(estado).toHaveTextContent("proposta");
    expect(estado).toHaveTextContent("A pessoa foi convertida em cliente.");
    await waitFor(() => expect(sucesso).toHaveBeenCalled());
  });

  it("quando a conversão fica por fazer diz que falta e aponta «Converter em cliente»", async () => {
    abrir(aberto({ prontoAGanhar: true }), { reavaliar: vi.fn(async () => resultado({ conversao: "por_fazer" })) });
    fireEvent.click(screen.getByRole("button", { name: "Fechar agora" }));
    expect(await screen.findByRole("status", { name: "Resultado de fechar agora" })).toHaveTextContent("Converter em cliente");
  });

  it("sem efeito (mudou: false) diz que o negócio continua aberto", async () => {
    abrir(aberto({ prontoAGanhar: true }), {
      reavaliar: vi.fn(async () => resultado({ mudou: false, estado: "aberto", origemTipo: null, prova: null, conversao: null, motivo: "sem_positivo_com_prova" })),
    });
    fireEvent.click(screen.getByRole("button", { name: "Fechar agora" }));
    expect(await screen.findByRole("status", { name: "Resultado de fechar agora" })).toHaveTextContent("continua aberto");
  });

  it("um erro da base aparece traduzido, em alerta, e o botão volta a estar livre", async () => {
    const acao = pendente<ResultadoReavaliar>();
    const mutacoes = abrir(aberto({ prontoAGanhar: true }), { reavaliar: vi.fn(() => acao.promessa) });
    const botao = screen.getByRole("button", { name: "Fechar agora" });
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(mutacoes.reavaliar).toHaveBeenCalledTimes(1);
    expect(botao).toHaveAttribute("aria-busy", "true");
    await acao.falhar(erroNegFalso("pessoasPagina.erroNeg.permissao", "42501"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não tem permissão");
    expect(botao).not.toHaveAttribute("aria-busy");
  });
});

describe("negócio ganho", () => {
  it("mostra a origem do ganho (documento e data) quando a base a diz", () => {
    abrir(ganho({ origemDecisao: { tipo: "proposta", numero: "P-2026-0042", em: "2026-10-15" } }));
    expect(screen.getByText(/P-2026-0042/)).toBeInTheDocument();
    expect(screen.getByText(/15\/10\/2026/)).toBeInTheDocument();
  });

  it("sem a origem (a base ainda não a devolve) não inventa nenhuma", () => {
    abrir(ganho());
    expect(screen.queryByText(/Ganho por/)).toBeNull();
  });

  it("«Converter em cliente» só com a conversão pendente, permissão de editar e de converter", async () => {
    abrir(ganho());
    expect(screen.queryByRole("button", { name: "Converter em cliente" })).toBeNull();
    cleanup();
    abrir(ganho({ alerta: { codigo: "conversao_falhou" } }), {}, { podeConverter: false });
    expect(screen.queryByRole("button", { name: "Converter em cliente" })).toBeNull();
    cleanup();
    const mutacoes = abrir(ganho({ conversaoPendente: true }));
    fireEvent.click(within(screen.getByRole("group", { name: "Fecho do negócio" })).getByRole("button", { name: "Converter em cliente" }));
    expect(mutacoes.ganhar).toHaveBeenCalledWith("n2", null);
    await waitFor(() => expect(sucesso).toHaveBeenCalled());
  });

  it("«Reabrir negócio» não aparece (nem desativado) sem pessoas.reopen", () => {
    abrir(ganho(), {}, { podeReabrir: false });
    expect(screen.queryByRole("button", { name: "Reabrir negócio" })).toBeNull();
    cleanup();
    abrir(ganho(), {}, { podeReabrir: undefined });
    expect(screen.queryByRole("button", { name: "Reabrir negócio" })).toBeNull();
  });

  it("«Reabrir negócio» exige o motivo (até 1000 caracteres) e só chama a base com ele", async () => {
    const mutacoes = abrir(ganho());
    fireEvent.click(screen.getByRole("button", { name: "Reabrir negócio" }));
    const dialogo = screen.getByRole("dialog", { name: "Reabrir negócio" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Reabrir negócio" }));
    expect(within(dialogo).getByText("Diga porque reabre o negócio.")).toBeInTheDocument();
    expect(mutacoes.reabrirGanho).not.toHaveBeenCalled();
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "x".repeat(1001) } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Reabrir negócio" }));
    expect(within(dialogo).getByText(/no máximo 1000 caracteres/)).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "  Cliente pediu alterações  " } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Reabrir negócio" }));
    expect(mutacoes.reabrirGanho).toHaveBeenCalledWith("n2", "Cliente pediu alterações");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sucesso).toHaveBeenCalled();
  });

  it("um erro da base vem traduzido dentro do diálogo, que fica aberto", async () => {
    abrir(ganho(), { reabrirGanho: vi.fn(async () => { throw erroNegFalso("pessoasPagina.erroNeg.ng008", "NG008"); }) });
    fireEvent.click(screen.getByRole("button", { name: "Reabrir negócio" }));
    const dialogo = screen.getByRole("dialog", { name: "Reabrir negócio" });
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "Porque sim" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Reabrir negócio" }));
    expect(await within(dialogo).findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("negócio perdido", () => {
  it("«Manter perdido» só com um alerta, permissão de editar e a função da base; limpa o alerta", async () => {
    abrir(perdido());
    expect(screen.queryByRole("button", { name: "Manter perdido" })).toBeNull();
    cleanup();
    abrir(perdido({ alerta: { codigo: "positivo_depois_perda" } }), {}, { podeEditar: false });
    expect(screen.queryByRole("button", { name: "Manter perdido" })).toBeNull();
    cleanup();
    const mutacoes = abrir(perdido({ alerta: { codigo: "positivo_depois_perda" } }));
    fireEvent.click(screen.getAllByRole("button", { name: "Manter perdido" })[0]);
    expect(mutacoes.dispensarAlerta).toHaveBeenCalledWith("n3");
    await waitFor(() => expect(sucesso).toHaveBeenCalled());
  });

  it("mostra a origem da perda: automática com o documento, ou manual", () => {
    abrir(perdido({ origemDecisao: { tipo: "proposta", numero: "P-7", em: null }, perdaAutomatica: true }));
    expect(screen.getByText(/Perdido automaticamente/)).toHaveTextContent("P-7");
    cleanup();
    abrir(perdido({ perdaAutomatica: false }));
    expect(screen.getByText(/Perdido à mão/)).toBeInTheDocument();
  });
});

describe("alertas", () => {
  it("cada código tem o seu texto e a sua ação, e o código desconhecido ou nulo é genérico", () => {
    abrir(ganho({ alerta: { codigo: "recusa_depois_aceite" } }));
    const avisos = screen.getByRole("region", { name: "Avisos do negócio" });
    expect(avisos).toHaveTextContent("recusada depois de aceite");
    expect(within(avisos).getByRole("button", { name: "Reabrir negócio" })).toBeInTheDocument();
    cleanup();
    abrir(aberto({ alerta: { codigo: "sem_prova" }, prontoAGanhar: true }));
    expect(within(screen.getByRole("region", { name: "Avisos do negócio" })).getByRole("button", { name: "Fechar agora" })).toBeInTheDocument();
    cleanup();
    abrir(aberto({ alerta: { codigo: null } }));
    expect(screen.getByRole("region", { name: "Avisos do negócio" })).toHaveTextContent("precisa de atenção");
    cleanup();
    abrir(aberto({ alerta: { codigo: "codigo_novo_da_base" } }));
    expect(screen.getByRole("region", { name: "Avisos do negócio" })).toHaveTextContent("precisa de atenção");
  });

  it("sem alerta não há região de avisos; nunca há alerta de conflito proposta aceite com contrato recusado", () => {
    abrir(aberto({ proposta: { estado: "aceite" }, contrato: { estado: "pendente" } }));
    expect(screen.queryByRole("region", { name: "Avisos do negócio" })).toBeNull();
    expect(screen.queryByText(/conflito/i)).toBeNull();
  });
});
