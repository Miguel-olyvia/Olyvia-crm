// Aceitar uma justificação de dia cria a falta NA BASE, numa só chamada: `rpc_hr_justificacao_dia_decidir` marca a falta, regista
// a justificação dela e decide-a na mesma transacção. Supabase simulado: o hook de acções é trocado por um que regista o que lhe
// pedem. Nada vai à base. A prova da transacção (nada fica escrito se um passo falha) é da base; aqui prova-se o que o ecrã faz.
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import { criaFalta, faltaActivaDoDia, MOTIVO_DA_FALTA } from "@/components/rh-exemplo/lib/faltaDaAceitacao";

const base = vi.hoisted(() => ({
  pedidos: [] as unknown[],
  resposta: { erro: null, faltaId: "falta-nova", mesFechado: false } as { erro: string | null; faltaId: string | null; mesFechado: boolean },
}));

vi.mock("@/components/rh-exemplo/hooks/useJustificacoesDoDia", () => {
  // Estável entre renderizações, como o `useCallback` do hook real.
  const decidir = async (args: unknown) => {
    base.pedidos.push(args);
    return base.resposta;
  };
  return { useAccoesJustificacaoDia: () => ({ decidir }) };
});

import { AceitarComFaltaReal, type ResultadoDaAceitacao } from "./AceitarComFaltaReal";

const justificacao = (parcial: Partial<JustificacaoDia> = {}): JustificacaoDia => ({
  id: "jd-1", origem: "sugestao", pessoaId: "pessoa-1", data: "2026-10-07", tipo: "transporte",
  motivo: "O autocarro avariou a meio do caminho", horaReal: "09:15", anexos: [], minutos: 15, periodoInicio: "09:00",
  periodoFim: "09:15", deAtraso: false, enviadaEm: "2026-10-12T10:00:00.000Z", estado: "pendente", decididaPor: null,
  decididaEm: null, motivoRecusa: null, faltaId: null, mesFechado: false, ...parcial,
});

beforeEach(() => {
  base.pedidos.length = 0;
  base.resposta = { erro: null, faltaId: "falta-nova", mesFechado: false };
});
afterEach(cleanup);

function correr(j: JustificacaoDia, decisao: "aceitar_paga" | "aceitar_nao_paga") {
  const concluir = vi.fn<(resultado: ResultadoDaAceitacao) => void>();
  render(<AceitarComFaltaReal justificacao={j} decisao={decisao} aoConcluir={concluir} />);
  return concluir;
}

describe("AceitarComFaltaReal: uma só chamada à base", () => {
  it("aceitar paga decide a justificação pelo id e devolve o id da falta", async () => {
    const concluir = correr(justificacao(), "aceitar_paga");
    await waitFor(() => expect(concluir).toHaveBeenCalledTimes(1));
    expect(base.pedidos).toEqual([{ justificacaoId: "jd-1", decisao: "aceitar_paga", confirmarMesFechado: false }]);
    expect(concluir).toHaveBeenCalledWith({ erro: null, faltaId: "falta-nova", mesFechado: false });
  });

  it("confirmado o mês fechado, manda confirmarMesFechado: true", async () => {
    const concluir = vi.fn<(resultado: ResultadoDaAceitacao) => void>();
    render(<AceitarComFaltaReal justificacao={justificacao()} decisao="aceitar_paga" confirmarMesFechado aoConcluir={concluir} />);
    await waitFor(() => expect(concluir).toHaveBeenCalledTimes(1));
    expect(base.pedidos).toEqual([{ justificacaoId: "jd-1", decisao: "aceitar_paga", confirmarMesFechado: true }]);
  });

  it("aceitar não paga manda a decisão «não paga»", async () => {
    const concluir = correr(justificacao({ deAtraso: true }), "aceitar_nao_paga");
    await waitFor(() => expect(concluir).toHaveBeenCalledTimes(1));
    expect(base.pedidos).toEqual([{ justificacaoId: "jd-1", decisao: "aceitar_nao_paga", confirmarMesFechado: false }]);
  });

  it("não manda argumentos de falta: quem marca a falta, justifica e decide é a base", async () => {
    const concluir = correr(justificacao(), "aceitar_paga");
    await waitFor(() => expect(concluir).toHaveBeenCalledTimes(1));
    expect(Object.keys(base.pedidos[0] as object).sort()).toEqual(["confirmarMesFechado", "decisao", "justificacaoId"]);
  });

  it("mês fechado já confirmado: o resultado di-lo (a falta ficou marcada, o aviso aparece)", async () => {
    base.resposta = { erro: null, faltaId: "falta-nova", mesFechado: true };
    const concluir = correr(justificacao(), "aceitar_paga");
    await waitFor(() => expect(concluir).toHaveBeenCalledTimes(1));
    expect(concluir).toHaveBeenCalledWith({ erro: null, faltaId: "falta-nova", mesFechado: true });
  });

  it("se a base recusa (sobreposição, falta divergente, já decidida) não há falta e o erro vem à superfície", async () => {
    base.resposta = { erro: "rhJust.erro.faltaDivergente", faltaId: null, mesFechado: false };
    const concluir = correr(justificacao(), "aceitar_paga");
    await waitFor(() => expect(concluir).toHaveBeenCalledTimes(1));
    expect(concluir).toHaveBeenCalledWith({ erro: "rhJust.erro.faltaDivergente", faltaId: null, mesFechado: false });
  });

  it("chama uma só vez, mesmo com renderizações a mais", async () => {
    const concluir = vi.fn();
    const { rerender } = render(<AceitarComFaltaReal justificacao={justificacao()} decisao="aceitar_paga" aoConcluir={concluir} />);
    rerender(<AceitarComFaltaReal justificacao={justificacao()} decisao="aceitar_paga" aoConcluir={concluir} />);
    await waitFor(() => expect(concluir).toHaveBeenCalledTimes(1));
    expect(base.pedidos).toHaveLength(1);
  });
});

describe("a falta da aceitação (funções puras)", () => {
  it("só aceitar cria falta", () => {
    expect(criaFalta("aceitar_paga")).toBe(true);
    expect(criaFalta("aceitar_nao_paga")).toBe(true);
    expect(criaFalta("recusar")).toBe(false);
  });

  it("cada tipo de justificação tem o seu motivo de falta (a tabela que a base aplica)", () => {
    expect(MOTIVO_DA_FALTA).toEqual({ consulta_medica: "doenca", transporte: "outro", assunto_pessoal: "assuntos_pessoais", outro: "outro" });
  });

  it("faltaActivaDoDia encontra a falta activa do dia e hora, ignorando anuladas e outras horas", () => {
    const f = (id: string, p: object = {}) => ({ id, data: "2026-10-07", hora_inicio: "09:00:00", estado: "activa", ...p });
    const j = { data: "2026-10-07", periodoInicio: "09:00" };
    expect(faltaActivaDoDia([f("a", { estado: "anulada" }), f("b", { hora_inicio: "14:00:00" }), f("c", { data: "2026-10-08" }), f("d")], j)?.id).toBe("d");
    expect(faltaActivaDoDia([], j)).toBeNull();
  });
});
