// «Perder o negócio» na ficha real: a mesma caixa do exemplo, mas com a ação injetada por contexto (neg_perder_negocio) em vez do store.
// A fase vai na linguagem da base (`faseParaBase`: «ganho» nunca), a gravação espera pela base (aria-busy, «A guardar…»), o erro
// traduz-se pelo código em role="alert" dentro do diálogo, e o store do exemplo fica intacto.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { negocioBase } from "@/components/pessoas/fabricaTestes";
import { ComCostura, erroNegFalso, mutacoesFalsas, pendente } from "./costuraTestUtil";
import type { NegocioMes } from "./negocioMetas";
import { alteracoesAtuais, repor } from "./negociosAlterados";
import { PerderNegocioDialogo } from "./PerderNegocioDialogo";
import { MOTIVOS_PREDEFINIDOS } from "./workflowNegocio";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

beforeAll(prepararRadixNoJsdom);
afterEach(() => { cleanup(); repor(); });

const emProposta: NegocioMes = negocioBase("n1", {
  pessoa: "Ana", servico: "Cozinha", estadoReal: "aberto", orcamentos: [{ id: "o", valor: 100, escolhido: true }], proposta: { estado: "enviada" },
});

function montar(negocio: NegocioMes = emProposta, mutacoes = mutacoesFalsas()) {
  const aoFechar = vi.fn();
  const aoPerder = vi.fn();
  render(
    <ComCostura mutacoes={mutacoes}>
      <PerderNegocioDialogo negocio={negocio} hoje="2026-10-19" motivos={MOTIVOS_PREDEFINIDOS} aoFechar={aoFechar} aoPerder={aoPerder} />
    </ComCostura>,
  );
  return { aoFechar, aoPerder, mutacoes };
}
const confirmar = () => screen.getByRole("button", { name: /^(Confirmar a perda|A guardar…)$/ });
const escolher = (valor: string) => fireEvent.change(screen.getByRole("combobox", { name: "Motivo da perda" }), { target: { value: valor } });

describe("PerderNegocioDialogo na ficha real", () => {
  it("chama perder com o negócio, a fase em que estava (na linguagem da base) e o motivo, sem tocar no store", async () => {
    const { mutacoes, aoFechar, aoPerder } = montar();
    escolher("Preço");
    fireEvent.click(confirmar());
    expect(mutacoes.perder).toHaveBeenCalledWith({ negocioId: "n1", fase: "proposta", motivo: "Preço" });
    await vi.waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(aoPerder).toHaveBeenCalledTimes(1);
    expect(aoPerder.mock.calls[0][0]).toContain("Preço");
    expect(alteracoesAtuais().perdidos).toEqual({});
  });

  it("um aberto com contrato assinado perde-se na fase «contrato» (a base não aceita «ganho»)", () => {
    const assinado = { ...emProposta, contrato: { estado: "assinado" as const } };
    const { mutacoes } = montar(assinado);
    escolher("Preço");
    fireEvent.click(confirmar());
    expect(mutacoes.perder).toHaveBeenCalledWith(expect.objectContaining({ fase: "contrato" }));
  });

  it("sem orçamentos e com o levantamento por decidir, perde-se em «levantamento»", () => {
    const { mutacoes } = montar(negocioBase("n2", { pessoa: "Ana", servico: "Sala", estadoReal: "aberto", decisaoLevantamento: "porDecidir" }));
    escolher("Preço");
    fireEvent.click(confirmar());
    expect(mutacoes.perder).toHaveBeenCalledWith(expect.objectContaining({ negocioId: "n2", fase: "levantamento" }));
  });

  it("o motivo «Outro» vai como o texto escrito", () => {
    const { mutacoes } = montar();
    escolher("__outro__");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Mudou de ideias" } });
    fireEvent.click(confirmar());
    expect(mutacoes.perder).toHaveBeenCalledWith(expect.objectContaining({ motivo: "Mudou de ideias" }));
  });

  it("sem motivo continua a não perder: o erro diz-se em texto e a base não é chamada", () => {
    const { mutacoes } = montar();
    fireEvent.click(confirmar());
    expect(screen.getByText("Escolha o motivo da perda.")).toBeInTheDocument();
    expect(mutacoes.perder).not.toHaveBeenCalled();
  });

  it("a guardar: o botão fica aria-disabled e aria-busy (com o nome de sempre), «A guardar…» só na região de estado, e um segundo clique não repete nem fecha", () => {
    const acao = pendente<{ mudou: boolean }>();
    const { mutacoes, aoFechar } = montar(emProposta, mutacoesFalsas({ perder: vi.fn(() => acao.promessa) }));
    escolher("Preço");
    fireEvent.click(confirmar());
    const botao = confirmar();
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).toHaveAttribute("aria-busy", "true");
    // O nome do botão não muda (o «A guardar…» só se anuncia na região de estado, senão leria-se duas vezes) e o aria-disabled tem pista visual.
    expect(botao).toHaveTextContent("Confirmar a perda");
    expect(botao).not.toHaveTextContent("A guardar…");
    expect(botao.className).toMatch(/aria-disabled:/);
    expect(screen.getByRole("status")).toHaveTextContent("A guardar…");
    fireEvent.click(botao);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mutacoes.perder).toHaveBeenCalledTimes(1);
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it("mudou: false anuncia o mesmo texto e fecha", async () => {
    const { aoFechar, aoPerder } = montar(emProposta, mutacoesFalsas({ perder: vi.fn(async () => ({ mudou: false })) }));
    escolher("Preço");
    fireEvent.click(confirmar());
    await vi.waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(aoPerder.mock.calls[0][0]).toContain("Preço");
  });

  it("um erro traduz-se pelo código em role=alert dentro do diálogo; o diálogo fica aberto e pode repetir", async () => {
    const acao = pendente<{ mudou: boolean }>();
    const perder = vi.fn().mockReturnValueOnce(acao.promessa).mockResolvedValueOnce({ mudou: true });
    const { aoFechar } = montar(emProposta, mutacoesFalsas({ perder }));
    escolher("Preço");
    fireEvent.click(confirmar());
    await acao.falhar(erroNegFalso("pessoasPagina.erroNeg.ng002", "NG002"));
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("O estado atual não permite esta ação.");
    expect(screen.getByRole("dialog")).toContainElement(alerta);
    expect(aoFechar).not.toHaveBeenCalled();
    expect(confirmar()).not.toHaveAttribute("aria-busy", "true");
    fireEvent.click(confirmar());
    await vi.waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(perder).toHaveBeenCalledTimes(2);
  });

  it("um erro sem chave conhecida mostra a mensagem genérica", async () => {
    const acao = pendente<{ mudou: boolean }>();
    montar(emProposta, mutacoesFalsas({ perder: vi.fn(() => acao.promessa) }));
    escolher("Preço");
    fireEvent.click(confirmar());
    await acao.falhar(new Error("boom"));
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível concluir a ação. Tente novamente.");
  });
});
