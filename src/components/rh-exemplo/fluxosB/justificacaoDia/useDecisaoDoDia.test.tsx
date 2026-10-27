// A decisão do RH sobre uma justificação de dia, tudo na base: recusar é uma chamada (exige motivo); aceitar monta o executor
// que faz UMA chamada transaccional. Quando algo falha diz-se, e nunca se dá por aceite o que a base não aceitou.
// O executor e as acções estão simulados (a prova do executor está em aceitarComFaltaReal.test.tsx): nada toca em base nenhuma.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";

const mundo = vi.hoisted(() => ({
  montagens: 0,
  concluir: null as null | ((r: { erro: string | null; faltaId: string | null; mesFechado: boolean }) => void),
  pedidos: [] as unknown[],
  resposta: { erro: null, faltaId: null, mesFechado: false } as { erro: string | null; faltaId: string | null; mesFechado: boolean },
  adiar: null as null | Promise<void>,
  /** O `confirmarMesFechado` com que cada execução foi montada. */
  confirmacoes: [] as boolean[],
}));

vi.mock("./AceitarComFaltaReal", async () => {
  const { useEffect } = await import("react");
  return {
    AceitarComFaltaReal: ({ aoConcluir, confirmarMesFechado = false }: { aoConcluir: NonNullable<typeof mundo.concluir>; confirmarMesFechado?: boolean }) => {
      useEffect(() => {
        mundo.montagens += 1;
        mundo.confirmacoes.push(confirmarMesFechado);
        mundo.concluir = aoConcluir;
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    },
  };
});

vi.mock("@/components/rh-exemplo/hooks/useJustificacoesDoDia", () => {
  const decidir = async (args: unknown) => {
    mundo.pedidos.push(args);
    if (mundo.adiar) await mundo.adiar;
    return mundo.resposta;
  };
  return { useAccoesJustificacaoDia: () => ({ decidir }) };
});

import { useDecisaoDoDia, type RespostaDaDecisao } from "./useDecisaoDoDia";

const justificacao: JustificacaoDia = {
  id: "jd-1", origem: "sugestao", pessoaId: "123e4567-e89b-12d3-a456-426614174000", data: "2026-10-07", tipo: "transporte",
  motivo: "O autocarro avariou", horaReal: null, anexos: [], minutos: 15, periodoInicio: "09:00", periodoFim: "09:15",
  deAtraso: false, enviadaEm: "2026-10-12T10:00:00.000Z", estado: "pendente", decididaPor: null, decididaEm: null,
  motivoRecusa: null, faltaId: null, mesFechado: false,
};

let ultimaResposta: RespostaDaDecisao = null;

function Cena({ aoCriarFalta }: { aoCriarFalta?: () => void }) {
  const { decidir, mensagem, executor, aOcupar } = useDecisaoDoDia(aoCriarFalta);
  return (
    <div>
      <button type="button" onClick={() => { ultimaResposta = decidir(justificacao, "aceitar_paga"); }}>aceitar paga</button>
      <button type="button" onClick={() => { ultimaResposta = decidir(justificacao, "aceitar_nao_paga"); }}>aceitar não paga</button>
      <button type="button" onClick={() => { ultimaResposta = decidir(justificacao, "recusar", "  Sem comprovativo do transporte  "); }}>recusar</button>
      <button type="button" onClick={() => { ultimaResposta = decidir(justificacao, "recusar", "ab"); }}>recusar curto</button>
      <p data-testid="msg" role={mensagem?.erro ? "alert" : "status"}>{mensagem?.texto ?? ""}</p>
      <p data-testid="ocupado">{String(aOcupar)}</p>
      {executor}
    </div>
  );
}

const montar = (aoCriarFalta?: () => void) => render(<LanguageProvider><Cena aoCriarFalta={aoCriarFalta} /></LanguageProvider>);

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  mundo.montagens = 0;
  mundo.concluir = null;
  mundo.pedidos.length = 0;
  mundo.resposta = { erro: null, faltaId: null, mesFechado: false };
  mundo.adiar = null;
  mundo.confirmacoes.length = 0;
  ultimaResposta = null;
});
afterEach(cleanup);

describe("useDecisaoDoDia: recusar", () => {
  it("é uma chamada à base com o motivo sem espaços nas pontas, e não monta o executor", async () => {
    montar();
    fireEvent.click(screen.getByText("recusar"));
    await waitFor(() => expect(screen.getByTestId("msg")).toHaveTextContent("Justificação recusada."));
    expect(mundo.pedidos).toEqual([{ justificacaoId: "jd-1", decisao: "recusar", motivo: "Sem comprovativo do transporte" }]);
    expect(mundo.montagens).toBe(0);
    expect(await ultimaResposta).toBeNull();
  });

  it("com motivo curto diz o erro e nem chega à base", () => {
    montar();
    fireEvent.click(screen.getByText("recusar curto"));
    expect(screen.getByTestId("msg")).toHaveAttribute("role", "alert");
    expect(screen.getByTestId("msg")).toHaveTextContent("pelo menos 3 caracteres");
    expect(mundo.pedidos).toEqual([]);
    expect(ultimaResposta).toBe("rhExemplo.pic.erro.motivoCurto");
  });

  it("enquanto a base responde está ocupado e depois liberta", async () => {
    let libertar: () => void = () => undefined;
    mundo.adiar = new Promise<void>((resolver) => { libertar = resolver; });
    montar();
    fireEvent.click(screen.getByText("recusar"));
    expect(screen.getByTestId("ocupado")).toHaveTextContent("true");
    await act(async () => { libertar(); await mundo.adiar; });
    await waitFor(() => expect(screen.getByTestId("ocupado")).toHaveTextContent("false"));
  });

  it("se a base recusa (já decidida) mostra o erro e devolve a chave", async () => {
    mundo.resposta = { erro: "rhJust.erro.jaDecidida", faltaId: null, mesFechado: false };
    montar();
    fireEvent.click(screen.getByText("recusar"));
    await waitFor(() => expect(screen.getByTestId("msg")).toHaveAttribute("role", "alert"));
    expect(screen.getByTestId("msg")).toHaveTextContent("Esta justificação já foi decidida.");
    expect(await ultimaResposta).toBe("rhJust.erro.jaDecidida");
    expect(screen.getByTestId("ocupado")).toHaveTextContent("false");
  });
});

describe("useDecisaoDoDia: aceitar", () => {
  it("monta o executor, fica a dizer que está a aceitar e ainda não chamou nada por si", () => {
    montar();
    fireEvent.click(screen.getByText("aceitar paga"));
    expect(mundo.montagens).toBe(1);
    expect(screen.getByTestId("ocupado")).toHaveTextContent("true");
    expect(screen.getByTestId("msg")).toHaveTextContent("A aceitar e a marcar a falta");
    expect(mundo.pedidos).toEqual([]);
  });

  it("não precisa de a pessoa «existir» à parte: a base é que valida (já não há pessoas de exemplo no caminho)", () => {
    montar();
    fireEvent.click(screen.getByText("aceitar não paga"));
    expect(mundo.montagens).toBe(1);
    expect(screen.getByTestId("msg")).not.toHaveAttribute("role", "alert");
  });

  it("enquanto uma aceitação corre, outro clique não monta outra", () => {
    montar();
    fireEvent.click(screen.getByText("aceitar paga"));
    fireEvent.click(screen.getByText("aceitar paga"));
    expect(mundo.montagens).toBe(1);
  });

  it("quando a base criou a falta, diz que foi aceite e relê o mês", () => {
    const aoCriarFalta = vi.fn();
    montar(aoCriarFalta);
    fireEvent.click(screen.getByText("aceitar paga"));
    act(() => mundo.concluir?.({ erro: null, faltaId: "falta-da-base-9", mesFechado: false }));
    expect(screen.getByTestId("msg")).toHaveTextContent("Justificação aceite · paga.");
    expect(screen.getByTestId("msg")).not.toHaveTextContent("mês já está fechado");
    expect(screen.getByTestId("ocupado")).toHaveTextContent("false");
    expect(aoCriarFalta).toHaveBeenCalledTimes(1);
  });

  it("aceitar não paga diz «não paga»", () => {
    montar();
    fireEvent.click(screen.getByText("aceitar não paga"));
    act(() => mundo.concluir?.({ erro: null, faltaId: "f", mesFechado: false }));
    expect(screen.getByTestId("msg")).toHaveTextContent("Justificação aceite · não paga.");
  });

  it("mês fechado sem confirmação: abre o diálogo, não diz que falhou e não relê o mês", async () => {
    const aoCriarFalta = vi.fn();
    montar(aoCriarFalta);
    fireEvent.click(screen.getByText("aceitar paga"));
    act(() => mundo.concluir?.({ erro: "rhJust.erro.mesFechado", faltaId: null, mesFechado: false }));
    expect(await screen.findByText("O mês já está fechado")).toBeInTheDocument();
    expect(screen.getByTestId("msg")).not.toHaveAttribute("role", "alert");
    expect(screen.getByTestId("msg")).not.toHaveTextContent("nada ficou registado");
    expect(screen.getByTestId("ocupado")).toHaveTextContent("true");
    expect(aoCriarFalta).not.toHaveBeenCalled();
    expect(mundo.confirmacoes).toEqual([false]);
  });

  it("«Aceitar na mesma» volta a chamar a base com a confirmação e conclui", async () => {
    const aoCriarFalta = vi.fn();
    montar(aoCriarFalta);
    fireEvent.click(screen.getByText("aceitar paga"));
    act(() => mundo.concluir?.({ erro: "rhJust.erro.mesFechado", faltaId: null, mesFechado: false }));
    fireEvent.click(await screen.findByRole("button", { name: "Aceitar na mesma" }));
    await waitFor(() => expect(mundo.confirmacoes).toEqual([false, true]));
    expect(screen.getByTestId("msg")).toHaveTextContent("A aceitar e a marcar a falta");
    act(() => mundo.concluir?.({ erro: null, faltaId: "f", mesFechado: true }));
    expect(screen.getByTestId("msg")).toHaveTextContent("Justificação aceite · paga.");
    expect(screen.getByTestId("msg")).toHaveTextContent("O mês já está fechado: o desconto não se altera sem reabrir.");
    expect(aoCriarFalta).toHaveBeenCalledTimes(1);
  });

  it("cancelar a confirmação não decide nada e liberta os botões", async () => {
    montar();
    fireEvent.click(screen.getByText("aceitar paga"));
    act(() => mundo.concluir?.({ erro: "rhJust.erro.mesFechado", faltaId: null, mesFechado: false }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.getByTestId("ocupado")).toHaveTextContent("false"));
    expect(screen.getByTestId("msg")).toHaveTextContent("Nada foi decidido");
    expect(mundo.confirmacoes).toEqual([false]);
  });

  it("se mesmo confirmado a base recusar por mês fechado, diz que falhou (não pergunta em ciclo)", async () => {
    montar();
    fireEvent.click(screen.getByText("aceitar paga"));
    act(() => mundo.concluir?.({ erro: "rhJust.erro.mesFechado", faltaId: null, mesFechado: false }));
    fireEvent.click(await screen.findByRole("button", { name: "Aceitar na mesma" }));
    await waitFor(() => expect(mundo.confirmacoes).toEqual([false, true]));
    act(() => mundo.concluir?.({ erro: "rhJust.erro.mesFechado", faltaId: null, mesFechado: false }));
    expect(screen.getByTestId("msg")).toHaveAttribute("role", "alert");
    expect(screen.getByTestId("msg")).toHaveTextContent("nada ficou registado");
  });

  it("num mês fechado (já confirmado) a falta fica marcada e o aviso di-lo", () => {
    montar();
    fireEvent.click(screen.getByText("aceitar paga"));
    act(() => mundo.concluir?.({ erro: null, faltaId: "f", mesFechado: true }));
    expect(screen.getByTestId("msg")).toHaveTextContent("Justificação aceite · paga.");
    expect(screen.getByTestId("msg")).toHaveTextContent("O mês já está fechado: o desconto não se altera sem reabrir.");
  });

  it("se a base recusou, diz que nada ficou registado, mantém por decidir e NÃO relê o mês", () => {
    const aoCriarFalta = vi.fn();
    montar(aoCriarFalta);
    fireEvent.click(screen.getByText("aceitar paga"));
    act(() => mundo.concluir?.({ erro: "rhJust.erro.faltaDivergente", faltaId: null, mesFechado: false }));
    expect(screen.getByTestId("msg")).toHaveAttribute("role", "alert");
    expect(screen.getByTestId("msg")).toHaveTextContent("nada ficou registado e a justificação continua por decidir");
    expect(screen.getByTestId("msg")).toHaveTextContent("Já existe uma falta neste dia e hora");
    expect(aoCriarFalta).not.toHaveBeenCalled();
    expect(screen.getByTestId("ocupado")).toHaveTextContent("false");
  });

  it("depois de falhar pode tentar de novo", () => {
    montar();
    fireEvent.click(screen.getByText("aceitar paga"));
    act(() => mundo.concluir?.({ erro: "rhJust.erro.semPermissao", faltaId: null, mesFechado: false }));
    fireEvent.click(screen.getByText("aceitar paga"));
    expect(mundo.montagens).toBe(2);
  });
});
