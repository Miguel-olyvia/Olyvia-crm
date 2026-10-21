// O separador «Negócios» do Workflow de Pessoas: cinco campos (o que acontece ao ganhar, o que fazer quando a proposta ou o contrato são
// recusados, o cancelamento no prazo e o prazo de reflexão), «Guardar» pela função (via o hook), o aviso das conversões, o prazo de reflexão sem
// valor por omissão e validado antes de ir à base, e os erros NG008/NG009/42501 traduzidos. O hook é simulado: aqui só se vê o que o ecrã faz com
// o que o hook dá e devolve (o hook tem os seus testes em hooks/pessoas/workflow).
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import { CHAVES_ERRO_NEG } from "@/hooks/pessoas/errosNeg";
import type { ConfigNegocios, ResultadoGuardarConfig } from "@/hooks/pessoas/workflow/configNegocios";
import type { ConfigNegociosHook } from "@/hooks/pessoas/workflow/useConfigNegocios";
import { NegociosSeparador } from "./NegociosSeparador";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
beforeAll(prepararRadixNoJsdom);

const OMISSOES: ConfigNegocios = {
  conversaoAoGanhar: "automatica", recusaProposta: "perder", recusaContrato: "perder", cancelamentoNoPrazo: "perder", reflexaoDias: null,
};
const resultado = (extra: Partial<ResultadoGuardarConfig> = {}): ResultadoGuardarConfig => ({ mudou: true, depois: null, avisoConversaoContratos: false, ...extra });

const hook = (sobre: Partial<ConfigNegociosHook> = {}): ConfigNegociosHook => ({
  estado: "pronto", dados: OMISSOES, aGuardar: false, guardar: vi.fn().mockResolvedValue(resultado()), recarregar: vi.fn(), ...sobre,
});
const grupo = (nome: string) => screen.getByRole("radiogroup", { name: nome });
const radio = (nomeGrupo: string, nome: string) => within(grupo(nomeGrupo)).getByRole("radio", { name: nome });
const G = {
  conv: "Ao ganhar um negócio",
  proposta: "Quando a proposta é recusada",
  contrato: "Quando o contrato é recusado ou cancelado antes de assinado",
  cancel: "Quando o contrato que deu o ganho é cancelado dentro do prazo de reflexão",
};
const prazo = () => screen.getByRole("textbox", { name: "Prazo de reflexão (dias)" });
const guardarBtn = () => screen.getByRole("button", { name: /guardar configuração|a guardar/i });
const estado = () => screen.getByRole("status");
const erroNeg = (codigo: string | null) => new ErroNeg(new Error("texto da base"), codigo, codigo ? CHAVES_ERRO_NEG[codigo] : "pessoasPagina.erroNeg.generico");

describe("NegociosSeparador: carregar", () => {
  it("enquanto lê mostra «A carregar» e ainda não mostra campos nem o botão Guardar", () => {
    render(<NegociosSeparador config={hook({ estado: "a-carregar", dados: null })} />);
    expect(screen.getByText("A carregar a configuração...")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("button", { name: /guardar/i })).toBeNull();
  });

  it("se a leitura falha, diz-o num alerta com «Tentar de novo», que relê, e não deixa guardar por cima do que não se viu", () => {
    const recarregar = vi.fn();
    render(<NegociosSeparador config={hook({ estado: "erro", dados: null, recarregar })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a configuração.");
    expect(screen.queryByRole("button", { name: /guardar/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("uma organização sem a configuração diz-o e não oferece campos nem Guardar", () => {
    render(<NegociosSeparador config={hook({ estado: "sem-config", dados: null })} />);
    expect(screen.getByText("Esta organização ainda não tem a configuração de negócios ativa.")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("button", { name: /guardar/i })).toBeNull();
  });

  it("não é um workflow: tem cinco campos (quatro escolhas e o prazo) e nada de regras nem de condições", () => {
    render(<NegociosSeparador config={hook()} />);
    expect(screen.getAllByRole("radiogroup")).toHaveLength(4);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("NegociosSeparador: cada campo explica-se com um exemplo", () => {
  it("os quatro grupos e o prazo trazem uma linha «Exemplo:» em linguagem de negócio", () => {
    render(<NegociosSeparador config={hook()} />);
    expect(screen.getAllByText(/^Exemplo:/)).toHaveLength(5);
  });
});

describe("NegociosSeparador: mostrar o que a base tem", () => {
  it("as omissões: conversão automática, perder em tudo e o prazo em branco", () => {
    render(<NegociosSeparador config={hook()} />);
    expect(radio(G.conv, "Passar a pessoa a cliente automaticamente")).toBeChecked();
    expect(radio(G.proposta, "Perder o negócio")).toBeChecked();
    expect(radio(G.contrato, "Perder o negócio")).toBeChecked();
    expect(radio(G.cancel, "Perder o negócio")).toBeChecked();
    expect(prazo()).toHaveValue("");
  });

  it("mostra os valores gravados, o prazo incluído", () => {
    render(<NegociosSeparador config={hook({ dados: {
      conversaoAoGanhar: "nao_alterar", recusaProposta: "manter_aberto", recusaContrato: "manter_aberto", cancelamentoNoPrazo: "manter_ganho", reflexaoDias: 14,
    } })} />);
    expect(radio(G.conv, "Não alterar a pessoa")).toBeChecked();
    expect(radio(G.proposta, "Manter o negócio aberto")).toBeChecked();
    expect(radio(G.contrato, "Manter o negócio aberto")).toBeChecked();
    expect(radio(G.cancel, "Manter o negócio ganho")).toBeChecked();
    expect(prazo()).toHaveValue("14");
  });

  it("o prazo de reflexão não leva valor por omissão nem aconselhamento: só o intervalo e «em branco»", () => {
    render(<NegociosSeparador config={hook()} />);
    expect(prazo()).toHaveValue("");
    expect(prazo()).not.toHaveAttribute("placeholder");
    expect(screen.getByText("De 1 a 365 dias. Deixe em branco enquanto o prazo não estiver definido.")).toBeInTheDocument();
  });
});

describe("NegociosSeparador: guardar", () => {
  it("sem tocar em nada também se pode guardar: manda o que a base tem, com o prazo nulo", async () => {
    const h = hook();
    render(<NegociosSeparador config={h} />);
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(h.guardar).toHaveBeenCalledTimes(1));
    expect(h.guardar).toHaveBeenCalledWith(OMISSOES);
  });

  it("escolhas novas e um prazo novo vão tal e qual", async () => {
    const h = hook();
    render(<NegociosSeparador config={h} />);
    fireEvent.click(radio(G.conv, "Passar a cliente à mão (a ficha oferece «Converter em cliente»)"));
    fireEvent.click(radio(G.proposta, "Manter o negócio aberto"));
    fireEvent.click(radio(G.cancel, "Manter o negócio ganho"));
    fireEvent.change(prazo(), { target: { value: " 30 " } });
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(h.guardar).toHaveBeenCalledTimes(1));
    expect(h.guardar).toHaveBeenCalledWith({
      conversaoAoGanhar: "manual", recusaProposta: "manter_aberto", recusaContrato: "perder", cancelamentoNoPrazo: "manter_ganho", reflexaoDias: 30,
    });
  });

  it("apagar o prazo guarda nulo", async () => {
    const h = hook({ dados: { ...OMISSOES, reflexaoDias: 14 } });
    render(<NegociosSeparador config={h} />);
    fireEvent.change(prazo(), { target: { value: "" } });
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(h.guardar).toHaveBeenCalledWith({ ...OMISSOES, reflexaoDias: null }));
  });

  it("diz «Configuração guardada.» quando mudou e «Sem alterações» quando a base diz que não", async () => {
    const guardar = vi.fn().mockResolvedValueOnce(resultado({ mudou: true })).mockResolvedValueOnce(resultado({ mudou: false }));
    render(<NegociosSeparador config={hook({ guardar })} />);
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(estado()).toHaveTextContent("Configuração guardada."));
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(estado()).toHaveTextContent("Sem alterações: a configuração já estava assim."));
  });

  it("mexer num campo limpa o aviso do resultado anterior", async () => {
    render(<NegociosSeparador config={hook()} />);
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(estado()).toHaveTextContent("Configuração guardada."));
    fireEvent.click(radio(G.proposta, "Manter o negócio aberto"));
    expect(estado()).toHaveTextContent("");
  });

  it("enquanto grava o botão fica aria-busy e aria-disabled, e um duplo clique dá um só pedido", async () => {
    let acabar: (r: ResultadoGuardarConfig) => void = () => undefined;
    const guardar = vi.fn(() => new Promise<ResultadoGuardarConfig>((r) => { acabar = r; }));
    render(<NegociosSeparador config={hook({ guardar })} />);
    const botao = guardarBtn();
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(botao).toHaveAttribute("aria-busy", "true");
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(estado()).toHaveTextContent("A guardar...");
    acabar(resultado());
    await waitFor(() => expect(estado()).toHaveTextContent("Configuração guardada."));
    expect(guardarBtn()).not.toHaveAttribute("aria-busy");
  });
});

describe("NegociosSeparador: o prazo de reflexão é validado antes de ir à base", () => {
  it.each([
    ["0", "O prazo tem de ir de 1 a 365 dias."],
    ["366", "O prazo tem de ir de 1 a 365 dias."],
    ["1,5", "Escreva um número inteiro de dias, ou deixe em branco."],
    ["abc", "Escreva um número inteiro de dias, ou deixe em branco."],
    ["-3", "Escreva um número inteiro de dias, ou deixe em branco."],
  ])("%s recusa, diz porquê em texto e não chama a base", (texto, mensagem) => {
    const h = hook();
    render(<NegociosSeparador config={h} />);
    fireEvent.change(prazo(), { target: { value: texto } });
    fireEvent.click(guardarBtn());
    expect(h.guardar).not.toHaveBeenCalled();
    const erro = screen.getByText(mensagem);
    expect(prazo()).toHaveAttribute("aria-invalid", "true");
    expect(prazo().getAttribute("aria-describedby")).toContain(erro.id);
    expect(prazo()).toHaveFocus();
  });

  it("corrigir o prazo tira o erro e deixa guardar", async () => {
    const h = hook();
    render(<NegociosSeparador config={h} />);
    fireEvent.change(prazo(), { target: { value: "0" } });
    fireEvent.click(guardarBtn());
    fireEvent.change(prazo(), { target: { value: "365" } });
    expect(screen.queryByText("O prazo tem de ir de 1 a 365 dias.")).toBeNull();
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(h.guardar).toHaveBeenCalledWith({ ...OMISSOES, reflexaoDias: 365 }));
  });
});

describe("NegociosSeparador: enquanto grava, as escolhas não mexem", () => {
  it("os radios ficam bloqueados (aria-disabled) e um clique durante a gravação não muda a escolha", async () => {
    let acabar: (r: ResultadoGuardarConfig) => void = () => undefined;
    const guardar = vi.fn(() => new Promise<ResultadoGuardarConfig>((r) => { acabar = r; }));
    render(<NegociosSeparador config={hook({ guardar })} />);
    fireEvent.click(guardarBtn());
    expect(radio(G.proposta, "Manter o negócio aberto")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(radio(G.proposta, "Manter o negócio aberto"));
    expect(radio(G.proposta, "Perder o negócio")).toBeChecked();
    acabar(resultado());
    await waitFor(() => expect(estado()).toHaveTextContent("Configuração guardada."));
    expect(radio(G.proposta, "Manter o negócio aberto")).not.toHaveAttribute("aria-disabled");
  });

  it("com a base a confirmar que não mudou (sem «depois»), a edição limpa-se: o diálogo não pergunta por alterações que já estão gravadas", async () => {
    const aoEditar = vi.fn();
    const edicao = { conversaoAoGanhar: "automatica", recusaProposta: "manter_aberto", recusaContrato: "perder", cancelamentoNoPrazo: "perder", reflexao: "" } as const;
    const guardar = vi.fn().mockResolvedValue(resultado({ mudou: false, depois: null }));
    render(<NegociosSeparador config={hook({ guardar })} edicao={edicao} aoEditar={aoEditar} />);
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(aoEditar).toHaveBeenLastCalledWith(null));
  });

  it("gravou mas a resposta não traz «depois»: a edição fica até a leitura voltar (não se mostra o que a base ainda não confirmou)", async () => {
    const aoEditar = vi.fn();
    const edicao = { conversaoAoGanhar: "automatica", recusaProposta: "manter_aberto", recusaContrato: "perder", cancelamentoNoPrazo: "perder", reflexao: "" } as const;
    render(<NegociosSeparador config={hook({ guardar: vi.fn().mockResolvedValue(resultado({ mudou: true, depois: null })) })} edicao={edicao} aoEditar={aoEditar} />);
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(estado()).toHaveTextContent("Configuração guardada."));
    expect(aoEditar).not.toHaveBeenCalledWith(null);
  });
});

describe("NegociosSeparador: o exemplo da conversão não induz em erro nos negócios de proposta", () => {
  it("diz que só vale nos negócios que fecham no contrato", () => {
    render(<NegociosSeparador config={hook()} />);
    expect(within(grupo(G.conv).closest("fieldset") as HTMLElement).getByText(/Exemplo:/)).toHaveTextContent(/fecham na proposta/);
  });
});

describe("NegociosSeparador: o aviso das conversões", () => {
  it("quando a base avisa, o separador avisa e diz que não mexe em Contratos", async () => {
    const guardar = vi.fn().mockResolvedValue(resultado({ avisoConversaoContratos: true }));
    render(<NegociosSeparador config={hook({ guardar })} />);
    expect(screen.queryByText(/Esta configuração não altera Contratos/)).toBeNull();
    fireEvent.click(radio(G.conv, "Não alterar a pessoa"));
    fireEvent.click(guardarBtn());
    // O aviso vive na região que o leitor de ecrã anuncia (a mesma de «Configuração guardada.»), não num role="note" mudo.
    await waitFor(() => expect(estado()).toHaveTextContent("Esta configuração não altera Contratos"));
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("sem aviso da base não aparece nenhum", async () => {
    render(<NegociosSeparador config={hook()} />);
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(estado()).toHaveTextContent("Configuração guardada."));
    expect(screen.queryByText(/Esta configuração não altera Contratos/)).toBeNull();
  });

  it("mexer na configuração tira o aviso (pode já não valer)", async () => {
    const guardar = vi.fn().mockResolvedValue(resultado({ avisoConversaoContratos: true }));
    render(<NegociosSeparador config={hook({ guardar })} />);
    fireEvent.click(radio(G.conv, "Não alterar a pessoa"));
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(estado()).toHaveTextContent("Esta configuração não altera Contratos"));
    fireEvent.click(radio(G.conv, "Passar a pessoa a cliente automaticamente"));
    expect(screen.queryByText(/Esta configuração não altera Contratos/)).toBeNull();
  });
});

describe("NegociosSeparador: erros", () => {
  it.each([
    ["NG008", /a organização ainda não tem esta configuração ativa, ou a sua conta não tem acesso a ela\. Nada foi guardado\./],
    ["NG009", /Um dos valores não é válido\. Nada foi guardado\./],
    ["42501", /Só quem tem a permissão de configurar o Workflow de Pessoas pode guardar esta configuração\. Nada foi guardado\./],
  ])("%s diz-se em texto num alerta e o que se escolheu fica no ecrã", async (codigo, texto) => {
    const guardar = vi.fn().mockRejectedValue(erroNeg(codigo));
    render(<NegociosSeparador config={hook({ guardar })} />);
    fireEvent.click(radio(G.proposta, "Manter o negócio aberto"));
    fireEvent.click(guardarBtn());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Não foi possível guardar a configuração.");
    expect(alerta).toHaveTextContent(texto);
    expect(radio(G.proposta, "Manter o negócio aberto")).toBeChecked();
    expect(guardarBtn()).not.toHaveAttribute("aria-busy");
  });

  it("um erro sem código conhecido dá a mensagem genérica, nunca o texto da base", async () => {
    const guardar = vi.fn().mockRejectedValue(erroNeg(null));
    render(<NegociosSeparador config={hook({ guardar })} />);
    fireEvent.click(guardarBtn());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Não foi possível concluir a ação. Tente novamente.");
    expect(alerta).not.toHaveTextContent("texto da base");
  });

  it("um novo envio limpa o erro anterior", async () => {
    const guardar = vi.fn().mockRejectedValueOnce(erroNeg("NG009")).mockResolvedValueOnce(resultado());
    render(<NegociosSeparador config={hook({ guardar })} />);
    fireEvent.click(guardarBtn());
    await screen.findByRole("alert");
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
