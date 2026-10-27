// A decisão do RH sobre uma justificação de dia: recusar decide-se logo; aceitar só fica decidida quando a base criou a falta,
// e quando algo falha diz-se (nunca se dá por aceite uma justificação cuja falta não ficou marcada). O executor que fala com
// a base está simulado (a prova dele está em aceitarComFaltaReal.test.tsx): aqui testa-se o que o ecrã faz com a resposta.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { lerGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { lerJustificacaoDia, reporJustificacaoDia } from "@/components/rh-exemplo/dados/lojaJustificacaoDia";
import { reporFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";

const executor = vi.hoisted(() => ({
  montagens: 0,
  concluir: null as null | ((r: { erro: string | null; faltaId: string | null; etapa: "marcar" | "procurar" | "decidir" }) => void),
}));

vi.mock("./AceitarComFaltaReal", async () => {
  const { useEffect } = await import("react");
  return {
    AceitarComFaltaReal: ({ aoConcluir }: { aoConcluir: NonNullable<typeof executor.concluir> }) => {
      useEffect(() => {
        executor.montagens += 1;
        executor.concluir = aoConcluir;
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    },
  };
});

import { useDecisaoDoDia } from "./useDecisaoDoDia";

function Cena({ aoCriarFalta }: { aoCriarFalta?: () => void }) {
  const { decidir, mensagem, executor: montado, aOcupar } = useDecisaoDoDia(aoCriarFalta);
  const j = lerJustificacaoDia().justificacoes.find((x) => x.id === "jd-ines");
  if (!j) return null;
  return (
    <div>
      <button type="button" onClick={() => decidir({ ...j, pessoaId: "123e4567-e89b-12d3-a456-426614174000" }, "aceitar_paga")}>aceitar paga</button>
      <button type="button" onClick={() => decidir(j, "aceitar_paga")}>aceitar exemplo</button>
      <button type="button" onClick={() => decidir(j, "recusar", "Sem comprovativo do transporte")}>recusar</button>
      <button type="button" onClick={() => decidir(j, "recusar", "ab")}>recusar curto</button>
      <p data-testid="msg" role={mensagem?.erro ? "alert" : "status"}>{mensagem?.texto ?? ""}</p>
      <p data-testid="ocupado">{String(aOcupar)}</p>
      {montado}
    </div>
  );
}

const montar = (aoCriarFalta?: () => void) =>
  render(<LanguageProvider><Cena aoCriarFalta={aoCriarFalta} /></LanguageProvider>);
const estadoDaJustificacao = () => lerJustificacaoDia().justificacoes.find((x) => x.id === "jd-ines");

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  repor();
  reporJustificacaoDia();
  reporFluxosC();
  executor.montagens = 0;
  executor.concluir = null;
});
afterEach(cleanup);

describe("useDecisaoDoDia", () => {
  it("recusar decide logo, sem tocar na base nem montar o executor", () => {
    montar();
    fireEvent.click(screen.getByText("recusar"));
    expect(executor.montagens).toBe(0);
    expect(estadoDaJustificacao()).toMatchObject({ estado: "recusada", motivoRecusa: "Sem comprovativo do transporte" });
    expect(screen.getByTestId("msg")).toHaveTextContent("Justificação recusada.");
  });

  it("recusar com motivo curto diz o erro e não decide", () => {
    montar();
    fireEvent.click(screen.getByText("recusar curto"));
    expect(screen.getByTestId("msg")).toHaveAttribute("role", "alert");
    expect(estadoDaJustificacao()?.estado).toBe("pendente");
  });

  it("aceitar monta o executor e fica a dizer que está a marcar; ainda nada está decidido", () => {
    montar();
    fireEvent.click(screen.getByText("aceitar paga"));
    expect(executor.montagens).toBe(1);
    expect(screen.getByTestId("ocupado")).toHaveTextContent("true");
    expect(screen.getByTestId("msg")).toHaveTextContent("A marcar a falta");
    expect(estadoDaJustificacao()?.estado).toBe("pendente");
  });

  it("uma justificação de exemplo (pessoa que não existe na base) não se aceita: diz-o e não monta o executor", () => {
    montar();
    fireEvent.click(screen.getByText("aceitar exemplo"));
    expect(executor.montagens).toBe(0);
    expect(screen.getByTestId("msg")).toHaveAttribute("role", "alert");
    expect(screen.getByTestId("msg")).toHaveTextContent("Esta justificação é de exemplo");
    expect(estadoDaJustificacao()?.estado).toBe("pendente");
  });

  it("enquanto uma aceitação corre, outro clique não monta outra", () => {
    montar();
    fireEvent.click(screen.getByText("aceitar paga"));
    fireEvent.click(screen.getByText("aceitar paga"));
    expect(executor.montagens).toBe(1);
  });

  it("quando a base criou a falta, regista a decisão com o id dela e não cria falta em memória", () => {
    const aoCriarFalta = vi.fn();
    const faltasEmMemoria = lerGestao().faltas.length;
    montar(aoCriarFalta);
    fireEvent.click(screen.getByText("aceitar paga"));
    act(() => executor.concluir?.({ erro: null, faltaId: "falta-da-base-9", etapa: "decidir" }));
    expect(estadoDaJustificacao()).toMatchObject({ estado: "aceite_paga", faltaId: "falta-da-base-9" });
    expect(lerGestao().faltas.length).toBe(faltasEmMemoria);
    expect(screen.getByTestId("msg")).toHaveTextContent("Justificação aceite · paga.");
    expect(screen.getByTestId("ocupado")).toHaveTextContent("false");
    expect(aoCriarFalta).toHaveBeenCalledTimes(1);
  });

  it("se a falta não ficou marcada, diz-o, deixa a justificação por decidir e não relê o mês", () => {
    const aoCriarFalta = vi.fn();
    montar(aoCriarFalta);
    fireEvent.click(screen.getByText("aceitar paga"));
    act(() => executor.concluir?.({ erro: "A falta sobrepõe-se a outra.", faltaId: null, etapa: "marcar" }));
    expect(screen.getByTestId("msg")).toHaveAttribute("role", "alert");
    expect(screen.getByTestId("msg")).toHaveTextContent("A falta não foi marcada e a justificação continua por decidir: A falta sobrepõe-se a outra.");
    expect(estadoDaJustificacao()?.estado).toBe("pendente");
    expect(aoCriarFalta).not.toHaveBeenCalled();
    expect(screen.getByTestId("ocupado")).toHaveTextContent("false");
  });

  it("se a falta ficou marcada mas a decisão falhou, diz-o, relê o mês e não dá a justificação por aceite", () => {
    const aoCriarFalta = vi.fn();
    montar(aoCriarFalta);
    fireEvent.click(screen.getByText("aceitar paga"));
    act(() => executor.concluir?.({ erro: "Sem permissão.", faltaId: "falta-da-base-9", etapa: "decidir" }));
    expect(screen.getByTestId("msg")).toHaveTextContent("A falta ficou marcada, mas a justificação não ficou decidida: Sem permissão.");
    expect(estadoDaJustificacao()?.estado).toBe("pendente");
    expect(aoCriarFalta).toHaveBeenCalledTimes(1);
  });

  it("se a falta marcada não se reencontra, diz-o tal como está e relê o mês", () => {
    const aoCriarFalta = vi.fn();
    montar(aoCriarFalta);
    fireEvent.click(screen.getByText("aceitar paga"));
    act(() => executor.concluir?.({ erro: "rhJust.erro.faltaNaoEncontrada", faltaId: null, etapa: "procurar" }));
    expect(screen.getByTestId("msg")).toHaveTextContent("A falta foi marcada mas não a conseguimos reencontrar");
    expect(estadoDaJustificacao()?.estado).toBe("pendente");
    expect(aoCriarFalta).toHaveBeenCalledTimes(1);
  });
});
