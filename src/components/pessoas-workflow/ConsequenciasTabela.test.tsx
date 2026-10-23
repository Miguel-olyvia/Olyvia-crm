// A tabela das consequências: seis acontecimentos com «Ao negócio» e «A seguir». Os interruptores e a recusa do orçamento gravam logo (pelo hook, simulado
// aqui); as escolhas que já existiam seguem a edição do separador; o resto é só leitura. Cabeçalhos, rótulos, estados de gravar e erros traduzidos.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import { CHAVES_ERRO_NEG } from "@/hooks/pessoas/errosNeg";
import type { Consequencias } from "@/hooks/pessoas/workflow/consequencias";
import type { ConsequenciasHook } from "@/hooks/pessoas/workflow/useConsequencias";
import { ConsequenciasTabela, type ConsequenciasTabelaProps } from "./ConsequenciasTabela";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
beforeAll(prepararRadixNoJsdom);

const DADOS: Consequencias = { recusaOrcamento: "perder_se_ultimo", orcamentoCriaProposta: true, propostaCriaContrato: false };
const hook = (sobre: Partial<ConsequenciasHook> = {}): ConsequenciasHook => ({
  estado: "pronto", dados: DADOS, aGuardar: false, recarregar: vi.fn(),
  guardarCadeia: vi.fn().mockResolvedValue({ mudou: true, depois: null }),
  guardarRecusaOrcamento: vi.fn().mockResolvedValue({ mudou: true, depois: null }),
  ...sobre,
});
const EDICAO = { recusaProposta: "perder", recusaContrato: "perder", cancelamentoNoPrazo: "perder" } as const;
const desenhar = (sobre: Partial<ConsequenciasTabelaProps> = {}) => {
  const props: ConsequenciasTabelaProps = {
    consequencias: hook(), pode: true, edicao: EDICAO, aoMudar: vi.fn(), bloqueado: false, prazo: <input aria-label="Prazo de teste" />, ...sobre,
  };
  return { props, ...render(<ConsequenciasTabela {...props} />) };
};
const linha = (nome: string) => screen.getByRole("row", { name: new RegExp(`^${nome}`) });
const erroNeg = (codigo: string | null, causa: unknown = new Error("texto da base")) =>
  new ErroNeg(causa, codigo, codigo ? CHAVES_ERRO_NEG[codigo] : "pessoasPagina.erroNeg.generico");

describe("ConsequenciasTabela: estrutura", () => {
  it("é uma tabela com legenda, cabeçalhos de coluna e um cabeçalho de linha por acontecimento", () => {
    desenhar();
    const tabela = screen.getByRole("table", { name: /Consequências dos orçamentos, propostas e contratos/ });
    expect(within(tabela).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Acontecimento", "Ao negócio", "A seguir"]);
    expect(within(tabela).getAllByRole("rowheader").map((c) => c.textContent)).toEqual([
      "Orçamento aceite", "Orçamento recusado", "Proposta aceite", "Proposta recusada", "Contrato assinado", "Contrato recusado ou cancelado",
    ]);
  });

  it("(a) orçamento aceite: «Não altera o negócio» e o interruptor «Cria a proposta»", () => {
    desenhar();
    const l = within(linha("Orçamento aceite"));
    expect(l.getByText("Não altera o negócio.")).toBeInTheDocument();
    expect(l.getByRole("switch", { name: "Cria a proposta" })).toBeChecked();
  });

  it("(c) proposta aceite: interruptor «Cria o contrato», a frase de todas as propostas e o texto só de leitura do negócio", () => {
    desenhar();
    const l = within(linha("Proposta aceite"));
    const interruptor = l.getByRole("switch", { name: "Cria o contrato" });
    expect(interruptor).not.toBeChecked();
    expect(interruptor).toHaveAccessibleDescription(/Vale para todas as propostas da organização.*venda direta.*fora do negócio.*não leva contratos.*No contrato/);
    expect(l.getByText(/Só para ler\. Venda direta: o negócio fica ganho, com prova\. Fecho no contrato: fica a acompanhar\./)).toBeInTheDocument();
    expect(l.queryByRole("radio")).toBeNull();
  });

  it("(e) contrato assinado: «Nada a criar» e o negócio fica ganho com prova, só para ler", () => {
    desenhar();
    const l = within(linha("Contrato assinado"));
    expect(l.getByText("Nada a criar.")).toBeInTheDocument();
    expect(l.getByText(/ganho, com prova/)).toBeInTheDocument();
    expect(l.queryByRole("switch")).toBeNull();
    expect(l.queryByRole("radio")).toBeNull();
  });

  it("(b) e (d): os avisos do efeito fixo do motor só se leem", () => {
    desenhar();
    expect(within(linha("Orçamento recusado")).getByText(/se for o último orçamento, desqualifica o pedido e a lead/)).toBeInTheDocument();
    expect(within(linha("Proposta recusada")).getByText(/desqualifica o pedido e marca a lead como perdida/)).toBeInTheDocument();
  });

  it("(f) contrato recusado: as três escolhas que já existiam (recusa, cancelamento e o prazo) e nada a seguir", () => {
    desenhar();
    const l = within(linha("Contrato recusado ou cancelado"));
    expect(l.getByRole("radiogroup", { name: "Quando o contrato é recusado ou cancelado antes de assinado" })).toBeInTheDocument();
    expect(l.getByRole("radiogroup", { name: "Quando o contrato que deu o ganho é cancelado dentro do prazo de reflexão" })).toBeInTheDocument();
    expect(l.getByLabelText("Prazo de teste")).toBeInTheDocument();
    expect(l.getByText("Nada a criar.")).toBeInTheDocument();
  });
});

describe("ConsequenciasTabela: as escolhas que já existiam seguem a edição", () => {
  it("mostram os valores da edição e mudar uma devolve só esse campo", () => {
    const { props } = desenhar({ edicao: { ...EDICAO, recusaProposta: "manter_aberto" } });
    const proposta = within(screen.getByRole("radiogroup", { name: "Quando a proposta é recusada" }));
    expect(proposta.getByRole("radio", { name: "Manter o negócio aberto" })).toBeChecked();
    const contrato = within(screen.getByRole("radiogroup", { name: "Quando o contrato é recusado ou cancelado antes de assinado" }));
    fireEvent.click(contrato.getByRole("radio", { name: "Manter o negócio aberto" }));
    expect(props.aoMudar).toHaveBeenCalledWith({ recusaContrato: "manter_aberto" });
    const cancelamento = within(screen.getByRole("radiogroup", { name: "Quando o contrato que deu o ganho é cancelado dentro do prazo de reflexão" }));
    fireEvent.click(cancelamento.getByRole("radio", { name: "Manter o negócio ganho" }));
    expect(props.aoMudar).toHaveBeenCalledWith({ cancelamentoNoPrazo: "manter_ganho" });
  });

  it("com a gravação principal em curso ficam bloqueadas", () => {
    const { props } = desenhar({ bloqueado: true });
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Quando a proposta é recusada" })).getByRole("radio", { name: "Manter o negócio aberto" }));
    expect(props.aoMudar).not.toHaveBeenCalled();
  });
});

describe("ConsequenciasTabela: a recusa do orçamento", () => {
  const grupo = () => within(screen.getByRole("radiogroup", { name: "Quando o orçamento é recusado" }));

  it("mostra a omissão e a escolha gravada", () => {
    desenhar();
    expect(grupo().getByRole("radio", { name: "Perder o negócio se for o último documento em aberto" })).toBeChecked();
    expect(grupo().getByRole("radio", { name: "Manter o negócio aberto" })).not.toBeChecked();
  });

  it("escolher «Manter o negócio aberto» grava logo e diz «Guardado.»", async () => {
    const c = hook();
    desenhar({ consequencias: c });
    fireEvent.click(grupo().getByRole("radio", { name: "Manter o negócio aberto" }));
    await waitFor(() => expect(c.guardarRecusaOrcamento).toHaveBeenCalledWith("manter_aberto"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Guardado."));
  });

  it("escolher o que já está não chama a base", () => {
    const c = hook();
    desenhar({ consequencias: c });
    fireEvent.click(grupo().getByRole("radio", { name: "Perder o negócio se for o último documento em aberto" }));
    expect(c.guardarRecusaOrcamento).not.toHaveBeenCalled();
  });

  it("se a base diz que não mudou, diz «Sem alterações»", async () => {
    const c = hook({ guardarRecusaOrcamento: vi.fn().mockResolvedValue({ mudou: false, depois: null }) });
    desenhar({ consequencias: c });
    fireEvent.click(grupo().getByRole("radio", { name: "Manter o negócio aberto" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Sem alterações: já estava assim."));
  });

  it("sem o valor lido (organização sem configuração ou erro) não se mostra nenhuma escolha como marcada: diz «Não foi possível ler»", () => {
    const c = hook({ dados: { ...DADOS, recusaOrcamento: null } });
    desenhar({ consequencias: c });
    expect(screen.queryByRole("radiogroup", { name: "Quando o orçamento é recusado" })).toBeNull();
    expect(within(linha("Orçamento recusado")).getByText("Não foi possível ler")).toBeInTheDocument();
    expect(c.guardarRecusaOrcamento).not.toHaveBeenCalled();
  });

  it("enquanto um interruptor grava, a recusa do orçamento e as outras escolhas ficam bloqueadas (uma gravação de cada vez)", async () => {
    let acabar: (r: { mudou: boolean; depois: null }) => void = () => undefined;
    const c = hook({ guardarCadeia: vi.fn(() => new Promise((r) => { acabar = r as never; })) });
    const { props } = desenhar({ consequencias: c });
    fireEvent.click(screen.getByRole("switch", { name: "Cria a proposta" }));
    fireEvent.click(grupo().getByRole("radio", { name: "Manter o negócio aberto" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Quando a proposta é recusada" })).getByRole("radio", { name: "Manter o negócio aberto" }));
    expect(c.guardarRecusaOrcamento).not.toHaveBeenCalled();
    expect(props.aoMudar).not.toHaveBeenCalled();
    acabar({ mudou: true, depois: null });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Guardado."));
  });

  it("com a gravação principal do separador em curso, a recusa do orçamento fica bloqueada", () => {
    const c = hook();
    desenhar({ consequencias: c, bloqueado: true });
    fireEvent.click(grupo().getByRole("radio", { name: "Manter o negócio aberto" }));
    expect(c.guardarRecusaOrcamento).not.toHaveBeenCalled();
  });

  it("avisa o separador de que há uma gravação em curso e de que acabou", async () => {
    let acabar: (r: { mudou: boolean; depois: null }) => void = () => undefined;
    const aoOcupar = vi.fn();
    const c = hook({ guardarCadeia: vi.fn(() => new Promise((r) => { acabar = r as never; })) });
    desenhar({ consequencias: c, aoOcupar });
    fireEvent.click(screen.getByRole("switch", { name: "Cria a proposta" }));
    expect(aoOcupar).toHaveBeenLastCalledWith(true);
    acabar({ mudou: true, depois: null });
    await waitFor(() => expect(aoOcupar).toHaveBeenLastCalledWith(false));
  });
});

describe("ConsequenciasTabela: os interruptores", () => {
  it("«Cria a proposta» grava os dois valores: o novo e o atual do outro", async () => {
    const c = hook();
    desenhar({ consequencias: c });
    fireEvent.click(screen.getByRole("switch", { name: "Cria a proposta" }));
    await waitFor(() => expect(c.guardarCadeia).toHaveBeenCalledWith({ orcamentoCriaProposta: false, propostaCriaContrato: false }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Guardado."));
  });

  it("«Cria o contrato» liga só esse e mantém o outro", async () => {
    const c = hook();
    desenhar({ consequencias: c });
    fireEvent.click(screen.getByRole("switch", { name: "Cria o contrato" }));
    await waitFor(() => expect(c.guardarCadeia).toHaveBeenCalledWith({ orcamentoCriaProposta: true, propostaCriaContrato: true }));
  });

  it("enquanto grava fica aria-disabled e um duplo clique dá um só pedido; o estado diz «A guardar...»", async () => {
    let acabar: (r: { mudou: boolean; depois: null }) => void = () => undefined;
    const c = hook({ guardarCadeia: vi.fn(() => new Promise((r) => { acabar = r as never; })) });
    desenhar({ consequencias: c });
    const interruptor = screen.getByRole("switch", { name: "Cria a proposta" });
    fireEvent.click(interruptor);
    fireEvent.click(interruptor);
    expect(c.guardarCadeia).toHaveBeenCalledTimes(1);
    expect(interruptor).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status")).toHaveTextContent("A guardar...");
    acabar({ mudou: true, depois: null });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Guardado."));
    expect(interruptor).not.toHaveAttribute("aria-disabled", "true");
  });

  it("sem o valor lido o interruptor não grava", () => {
    const c = hook({ dados: { ...DADOS, orcamentoCriaProposta: null } });
    desenhar({ consequencias: c });
    const interruptor = screen.getByRole("switch", { name: "Cria a proposta" });
    expect(interruptor).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(interruptor);
    expect(c.guardarCadeia).not.toHaveBeenCalled();
  });

  it("o interruptor segue o que a base tem (controlado): depois de um erro não fica no valor tentado", async () => {
    const c = hook({ guardarCadeia: vi.fn().mockRejectedValue(erroNeg("42501")) });
    desenhar({ consequencias: c });
    fireEvent.click(screen.getByRole("switch", { name: "Cria a proposta" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("switch", { name: "Cria a proposta" })).toBeChecked();
  });
});

describe("ConsequenciasTabela: erros traduzidos", () => {
  const falhar = async (erro: unknown) => {
    desenhar({ consequencias: hook({ guardarCadeia: vi.fn().mockRejectedValue(erro) }) });
    fireEvent.click(screen.getByRole("switch", { name: "Cria a proposta" }));
    return waitFor(() => screen.getByRole("alert"));
  };

  it("NG008: a organização não tem a configuração; nada foi guardado", async () => {
    expect(await falhar(erroNeg("NG008"))).toHaveTextContent(/organização ainda não tem esta configuração ativa.*Nada foi guardado/);
  });

  it("42501: sem permissão", async () => {
    expect(await falhar(erroNeg("42501"))).toHaveTextContent(/permissão de configurar o Workflow de Pessoas.*Nada foi guardado/);
  });

  it("NG026: mais do que uma organização", async () => {
    expect(await falhar(erroNeg(null, { code: "NG026", message: "x" }))).toHaveTextContent(/mais do que uma organização.*Nada foi guardado/);
  });

  it("um erro desconhecido mostra a mensagem genérica, nunca o texto da base", async () => {
    const alerta = await falhar(erroNeg(null));
    expect(alerta).not.toHaveTextContent("texto da base");
    expect(alerta).toHaveTextContent("Não foi possível guardar");
  });

  it("mexer noutro controlo limpa o erro anterior", async () => {
    desenhar({ consequencias: hook({ guardarCadeia: vi.fn().mockRejectedValueOnce(erroNeg("NG008")).mockResolvedValue({ mudou: true, depois: null }) }) });
    fireEvent.click(screen.getByRole("switch", { name: "Cria a proposta" }));
    await waitFor(() => screen.getByRole("alert"));
    fireEvent.click(screen.getByRole("switch", { name: "Cria o contrato" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

describe("ConsequenciasTabela: falha de leitura", () => {
  it("diz-o num alerta com «Tentar de novo», que relê, e a tabela continua à vista", () => {
    const recarregar = vi.fn();
    desenhar({ consequencias: hook({ estado: "erro", recarregar, dados: { ...DADOS, recusaOrcamento: null } }) });
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível ler algumas destas escolhas.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(recarregar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("enquanto lê, os controlos que dependem da leitura ficam desativados", () => {
    desenhar({ consequencias: hook({ estado: "a-carregar", dados: { recusaOrcamento: null, orcamentoCriaProposta: null, propostaCriaContrato: null } }) });
    expect(screen.getByRole("switch", { name: "Cria a proposta" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("enquanto lê, diz que está a ler e os interruptores desativados apontam para essa frase", () => {
    desenhar({ consequencias: hook({ estado: "a-carregar", dados: { recusaOrcamento: null, orcamentoCriaProposta: null, propostaCriaContrato: null } }) });
    expect(screen.getByText("A ler as escolhas da organização...")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Cria a proposta" })).toHaveAccessibleDescription(/A ler as escolhas da organização/);
  });

  it("lido sem erro mas sem configuração na organização, diz porque a recusa do orçamento não aparece", () => {
    desenhar({ consequencias: hook({ estado: "pronto", dados: { ...DADOS, recusaOrcamento: null } }) });
    expect(screen.getByText(/Esta organização ainda não tem a configuração do fecho de negócios/)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Quando o orçamento é recusado" })).toBeNull();
  });

  it("com tudo lido não aparece nenhuma destas frases", () => {
    desenhar();
    expect(screen.queryByText(/A ler as escolhas/)).toBeNull();
    expect(screen.queryByText(/ainda não tem a configuração do fecho/)).toBeNull();
  });
});

describe("ConsequenciasTabela: quem não pode configurar", () => {
  it("não vê interruptores nem escolhas: os valores aparecem como texto e há uma nota", () => {
    desenhar({ pode: false });
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByText("Só quem tem a permissão de configurar o Workflow de Pessoas pode alterar estas escolhas.")).toBeInTheDocument();
    expect(within(linha("Orçamento aceite")).getByText("Ligado")).toBeInTheDocument();
    expect(within(linha("Proposta aceite")).getByText("Desligado")).toBeInTheDocument();
    expect(within(linha("Orçamento recusado")).getByText("Perder o negócio se for o último documento em aberto")).toBeInTheDocument();
    expect(within(linha("Proposta recusada")).getByText("Perder o negócio")).toBeInTheDocument();
  });

  it("um valor que não se leu diz «Não foi possível ler», não «Desligado»", () => {
    desenhar({ pode: false, consequencias: hook({ dados: { ...DADOS, orcamentoCriaProposta: null } }) });
    expect(within(linha("Orçamento aceite")).getByText("Não foi possível ler")).toBeInTheDocument();
  });
});
