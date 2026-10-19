// «Dar como ganho» na ficha real (neg_ganhar_negocio): escolhe a lead a converter quando há mais de uma, diz o que aconteceu (conversão feita,
// pessoa que já era cliente, lead já convertida, outras leads abertas, já estava ganho) e traduz os erros pelo código DENTRO do diálogo.
// NG015 (sem lead aberta nem cliente) mostra o erro e não oferece solução: é uma decisão de produto por tomar.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { negocioBase } from "@/components/pessoas/fabricaTestes";
import { ComCostura, dadosFalsos, erroNegFalso, mutacoesFalsas, pendente } from "./costuraTestUtil";
import type { DadosNegocio } from "./costuraNegocio";
import { GanharNegocioDialogo } from "./GanharNegocioDialogo";
import type { MutacoesNegocio, ResultadoGanho } from "./mutacoesNegocio";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

beforeAll(prepararRadixNoJsdom);
afterEach(cleanup);

const negocio = negocioBase("n1", { pessoa: "Ana", servico: "Cozinha", estadoReal: "aberto" });
const feito = (extra: Partial<ResultadoGanho> = {}): ResultadoGanho => ({ mudou: true, conversao: "feita", outrasLeadsAbertas: 0, ...extra });

function montar(mutacoes: MutacoesNegocio | null = mutacoesFalsas(), dados: DadosNegocio = dadosFalsos()) {
  const aoFechar = vi.fn();
  const aoGanho = vi.fn();
  render(<ComCostura mutacoes={mutacoes} dados={dados}><GanharNegocioDialogo negocio={negocio} aoFechar={aoFechar} aoGanho={aoGanho} /></ComCostura>);
  return { aoFechar, aoGanho };
}
const confirmar = () => screen.getByRole("button", { name: /^(Dar como ganho|A guardar…)$/ });
const comGanhar = (ganhar: MutacoesNegocio["ganhar"]) => mutacoesFalsas({ ganhar });

describe("GanharNegocioDialogo: abrir", () => {
  it("diz o negócio e o que acontece", () => {
    montar();
    const dialogo = screen.getByRole("dialog", { name: "Dar o negócio como ganho" });
    expect(dialogo).toHaveTextContent("Ana");
    expect(dialogo).toHaveTextContent("Cozinha");
  });

  it("sem mutações da ficha real não desenha nada", () => {
    montar(null);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("com uma só lead (ou nenhuma) não há seletor e a base escolhe a lead", () => {
    const { aoFechar } = montar(mutacoesFalsas(), dadosFalsos({ leadsAbertas: [{ id: "l1", criadaEm: "2026-10-01", encerrada: false }] }));
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(confirmar());
    expect(aoFechar).not.toHaveBeenCalled();
  });
});

describe("GanharNegocioDialogo: a lead a converter", () => {
  const duas = dadosFalsos({
    leadsAbertas: [{ id: "velha", criadaEm: "2026-09-01", encerrada: false }, { id: "nova", criadaEm: "2026-10-01", encerrada: true }],
  });

  it("com duas ou mais leads abertas há um seletor, com a mais recente escolhida e a abordagem encerrada dita em texto", () => {
    montar(mutacoesFalsas(), duas);
    const seletor = screen.getByRole("combobox", { name: "Lead a converter" });
    expect(seletor).toHaveValue("nova");
    const opcoes = Array.from(seletor.querySelectorAll("option")).map((o) => o.textContent);
    expect(opcoes).toEqual(["Lead de 2026-09-01", "Lead de 2026-10-01 (abordagem encerrada)"]);
  });

  it("a lead escolhida vai para a base", () => {
    const mutacoes = mutacoesFalsas();
    montar(mutacoes, duas);
    fireEvent.change(screen.getByRole("combobox", { name: "Lead a converter" }), { target: { value: "velha" } });
    fireEvent.click(confirmar());
    expect(mutacoes.ganhar).toHaveBeenCalledWith("n1", "velha");
  });

  it("por omissão vai a mais recente; com uma só lead vai null (a base escolhe)", () => {
    const m1 = mutacoesFalsas();
    montar(m1, duas);
    fireEvent.click(confirmar());
    expect(m1.ganhar).toHaveBeenCalledWith("n1", "nova");
    cleanup();
    const m2 = mutacoesFalsas();
    montar(m2, dadosFalsos({ leadsAbertas: [{ id: "l1", criadaEm: "2026-10-01", encerrada: false }] }));
    fireEvent.click(confirmar());
    expect(m2.ganhar).toHaveBeenCalledWith("n1", null);
  });
});

describe("GanharNegocioDialogo: o que aconteceu", () => {
  it.each([
    ["feita", "Ana: negócio ganho. A pessoa passou a cliente."],
    ["ja_cliente", "Ana: negócio ganho. A pessoa já era cliente."],
    ["ja_convertida", "Ana: negócio ganho. A lead já estava convertida."],
    [null, "Ana: negócio ganho."],
  ] as const)("conversão %s", async (conversao, texto) => {
    const { aoFechar, aoGanho } = montar(comGanhar(vi.fn(async () => feito({ conversao }))));
    fireEvent.click(confirmar());
    await vi.waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(aoGanho).toHaveBeenCalledWith(texto);
  });

  it("mudou: false diz que já estava ganho", async () => {
    const { aoGanho, aoFechar } = montar(comGanhar(vi.fn(async () => feito({ mudou: false }))));
    fireEvent.click(confirmar());
    await vi.waitFor(() => expect(aoFechar).toHaveBeenCalled());
    expect(aoGanho).toHaveBeenCalledWith("Ana: o negócio já estava ganho.");
  });

  it("com outras leads abertas avisa, no singular e no plural", async () => {
    const um = montar(comGanhar(vi.fn(async () => feito({ outrasLeadsAbertas: 1 }))));
    fireEvent.click(confirmar());
    await vi.waitFor(() => expect(um.aoFechar).toHaveBeenCalled());
    expect(um.aoGanho).toHaveBeenCalledWith("Ana: negócio ganho. A pessoa passou a cliente. Atenção: a pessoa tem mais 1 lead aberta.");
    cleanup();
    const dois = montar(comGanhar(vi.fn(async () => feito({ outrasLeadsAbertas: 2 }))));
    fireEvent.click(confirmar());
    await vi.waitFor(() => expect(dois.aoFechar).toHaveBeenCalled());
    expect(dois.aoGanho).toHaveBeenCalledWith("Ana: negócio ganho. A pessoa passou a cliente. Atenção: a pessoa tem mais 2 leads abertas.");
  });

  it("a guardar: aria-disabled e aria-busy (com o nome de sempre), «A guardar…» só na região de estado, e um segundo clique não repete nem fecha", () => {
    const acao = pendente<ResultadoGanho>();
    const mutacoes = comGanhar(vi.fn(() => acao.promessa));
    const { aoFechar } = montar(mutacoes);
    fireEvent.click(confirmar());
    const botao = confirmar();
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).toHaveAttribute("aria-busy", "true");
    // O nome do botão não muda (o «A guardar…» só se anuncia na região de estado, senão leria-se duas vezes) e o aria-disabled tem pista visual.
    expect(botao).toHaveTextContent("Dar como ganho");
    expect(botao).not.toHaveTextContent("A guardar…");
    expect(botao.className).toMatch(/aria-disabled:/);
    expect(screen.getByRole("status")).toHaveTextContent("A guardar…");
    fireEvent.click(botao);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mutacoes.ganhar).toHaveBeenCalledTimes(1);
    expect(aoFechar).not.toHaveBeenCalled();
  });
});

describe("GanharNegocioDialogo: erros, pelo código, dentro do diálogo", () => {
  async function falharCom(chave: string, dados: DadosNegocio = dadosFalsos()) {
    const acao = pendente<ResultadoGanho>();
    const m = montar(comGanhar(vi.fn(() => acao.promessa)), dados);
    fireEvent.click(confirmar());
    await acao.falhar(erroNegFalso(chave));
    const alerta = screen.getByRole("alert");
    expect(screen.getByRole("dialog")).toContainElement(alerta);
    expect(m.aoFechar).not.toHaveBeenCalled();
    expect(confirmar()).not.toHaveAttribute("aria-busy", "true");
    return alerta;
  }

  it("NG006 com a regra «contrato assinado»: pede o contrato assinado", async () => {
    expect(await falharCom("pessoasPagina.erroNeg.ng006", dadosFalsos({ momentoGanho: "contrato_assinado" })))
      .toHaveTextContent("Para dar como ganho é preciso um contrato assinado ligado.");
  });

  it("NG006 com a regra «proposta aceite»: pede a proposta aceite (a variante pela regra, ainda pelo código)", async () => {
    expect(await falharCom("pessoasPagina.erroNeg.ng006", dadosFalsos({ momentoGanho: "proposta_aceite" })))
      .toHaveTextContent("Para dar como ganho é preciso uma proposta aceite ligada.");
  });

  it("NG007 (sem permissão para converter a lead)", async () => {
    expect(await falharCom("pessoasPagina.erroNeg.ng007")).toHaveTextContent("Não tem permissão para converter esta lead.");
  });

  it("NG012 (a conversão não é possível nesta organização)", async () => {
    expect(await falharCom("pessoasPagina.erroNeg.ng012")).toHaveTextContent("A conversão não é possível nesta organização.");
  });

  it("NG015 (sem lead aberta nem cliente): mostra o erro e não oferece solução, só Cancelar e repetir", async () => {
    const alerta = await falharCom("pessoasPagina.erroNeg.ng015");
    expect(alerta).toHaveTextContent("A pessoa não tem lead aberta para converter.");
    // O «Fechar» do diálogo é um botão só de ícone (sem texto, com aria-label); fora ele, só há Cancelar e repetir.
    const botoes = screen.getAllByRole("button").map((b) => b.textContent).filter((texto) => texto !== "");
    expect(botoes).toEqual(["Cancelar", "Dar como ganho"]);
  });

  it("um erro sem chave conhecida mostra a mensagem genérica, nunca o texto cru", async () => {
    const acao = pendente<ResultadoGanho>();
    montar(comGanhar(vi.fn(() => acao.promessa)));
    fireEvent.click(confirmar());
    await acao.falhar(new Error("permission denied for table"));
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível concluir a ação. Tente novamente.");
    expect(screen.queryByText(/permission denied/)).toBeNull();
  });

  it("depois de um erro pode repetir, e o erro some ao repetir", async () => {
    const acao = pendente<ResultadoGanho>();
    const ganhar = vi.fn().mockReturnValueOnce(acao.promessa).mockResolvedValueOnce(feito());
    const { aoFechar } = montar(comGanhar(ganhar));
    fireEvent.click(confirmar());
    await acao.falhar(erroNegFalso("pessoasPagina.erroNeg.ng006"));
    fireEvent.click(confirmar());
    expect(screen.queryByRole("alert")).toBeNull();
    await vi.waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(ganhar).toHaveBeenCalledTimes(2);
  });
});
