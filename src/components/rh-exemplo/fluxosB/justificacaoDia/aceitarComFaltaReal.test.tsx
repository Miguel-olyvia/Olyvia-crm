// Aceitar uma justificação de dia cria a falta NA BASE: marca-a (rpc_hr_falta_marcar, com a justificação registada) e decide-a
// como justificada (rpc_hr_falta_decidir_justificacao). Supabase simulado: o hook de assiduidade da pessoa é trocado por um
// que guarda as faltas em estado e regista o que lhe pedem. Nada vai à base.
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import { argumentosDaFalta, criaFalta, ehPessoaDaBase, faltaActivaDoDia, faltaCriada, MOTIVO_DA_FALTA } from "@/components/rh-exemplo/lib/faltaDaAceitacao";

const base = vi.hoisted(() => ({
  pessoas: [] as string[],
  marcar: [] as unknown[],
  decidir: [] as unknown[],
  marcarErro: null as string | null,
  decidirErro: null as string | null,
  criaFalta: true,
  inicial: [] as { id: string; data: string; hora_inicio: string; estado: string }[],
}));

vi.mock("@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa", async () => {
  const { useCallback, useState } = await import("react");
  return {
    useAssiduidadeDaPessoa: (pessoaId: string) => {
      base.pessoas.push(pessoaId);
      const [faltas, setFaltas] = useState(base.inicial);
      const marcarFalta = useCallback(async (args: { data: string; horaInicio: string }) => {
        base.marcar.push(args);
        if (base.marcarErro) return base.marcarErro;
        if (base.criaFalta) setFaltas((f) => [...f, { id: "falta-nova", data: args.data, hora_inicio: `${args.horaInicio}:00`, estado: "activa" }]);
        return null;
      }, []);
      const decidirJustificacao = useCallback(async (args: unknown) => {
        base.decidir.push(args);
        return base.decidirErro;
      }, []);
      return { loading: false, saving: false, faltas, marcarFalta, decidirJustificacao };
    },
  };
});

import { AceitarComFaltaReal, type ResultadoDaAceitacao } from "./AceitarComFaltaReal";

const justificacao = (parcial: Partial<JustificacaoDia> = {}): JustificacaoDia => ({
  id: "jd-1", origem: "sugestao", pessoaId: "pessoa-1", data: "2026-10-07", tipo: "transporte",
  motivo: "O autocarro avariou a meio do caminho", horaReal: "09:15", anexos: [], minutos: 15, periodoInicio: "09:00",
  periodoFim: "09:15", deAtraso: false, enviadaEm: "2026-10-12T10:00:00.000Z", estado: "pendente", decididaPor: null,
  decididaEm: null, motivoRecusa: null, faltaId: null, mesFechado: false, ...parcial,
});

beforeEach(() => {
  base.pessoas.length = 0;
  base.marcar.length = 0;
  base.decidir.length = 0;
  base.marcarErro = null;
  base.decidirErro = null;
  base.criaFalta = true;
  base.inicial = [];
});
afterEach(cleanup);

function correr(j: JustificacaoDia, decisao: "aceitar_paga" | "aceitar_nao_paga") {
  const concluir = vi.fn<(resultado: ResultadoDaAceitacao) => void>();
  render(<AceitarComFaltaReal justificacao={j} decisao={decisao} aoConcluir={concluir} />);
  return concluir;
}

describe("AceitarComFaltaReal: marca a falta e decide-a, pela pessoa e pelo dia da justificação", () => {
  it("aceitar paga marca a falta remunerada com a justificação e decide-a como justificada", async () => {
    const concluir = correr(justificacao(), "aceitar_paga");
    await waitFor(() => expect(concluir).toHaveBeenCalledTimes(1));
    expect(base.pessoas.every((p) => p === "pessoa-1")).toBe(true);
    expect(base.marcar).toEqual([
      {
        data: "2026-10-07", horaInicio: "09:00", horaFim: "09:15", motivoCodigo: "outro", remunerada: true, descontaSaldo: false,
        justificacao: { tipoDocumento: null, documentoRef: null, texto: "O autocarro avariou a meio do caminho", entidadeEmissora: null, dataDocumento: null, diasAtestados: null },
      },
    ]);
    expect(base.decidir).toEqual([{ faltaId: "falta-nova", resultado: "justificada", motivo: null }]);
    expect(concluir).toHaveBeenCalledWith({ erro: null, faltaId: "falta-nova", etapa: "decidir" });
  });

  it("aceitar não paga marca a falta sem remuneração; um atraso usa o motivo «atraso»", async () => {
    const concluir = correr(justificacao({ deAtraso: true }), "aceitar_nao_paga");
    await waitFor(() => expect(concluir).toHaveBeenCalledTimes(1));
    expect(base.marcar[0]).toMatchObject({ remunerada: false, descontaSaldo: false, motivoCodigo: "atraso" });
  });

  it("se a falta não se marca, não decide nada e diz em que passo ficou", async () => {
    base.marcarErro = "A falta sobrepõe-se a outra.";
    const concluir = correr(justificacao(), "aceitar_paga");
    await waitFor(() => expect(concluir).toHaveBeenCalledTimes(1));
    expect(base.decidir).toEqual([]);
    expect(concluir).toHaveBeenCalledWith({ erro: "A falta sobrepõe-se a outra.", faltaId: null, etapa: "marcar" });
  });

  it("se a decisão falha, a falta fica marcada e o resultado traz o id e o erro", async () => {
    base.decidirErro = "Sem permissão para decidir.";
    const concluir = correr(justificacao(), "aceitar_paga");
    await waitFor(() => expect(concluir).toHaveBeenCalledTimes(1));
    expect(concluir).toHaveBeenCalledWith({ erro: "Sem permissão para decidir.", faltaId: "falta-nova", etapa: "decidir" });
  });

  it("se já existe uma falta activa no mesmo dia e hora, não marca outra e decide a que existe", async () => {
    base.inicial = [{ id: "falta-antiga", data: "2026-10-07", hora_inicio: "09:00:00", estado: "activa" }];
    const concluir = correr(justificacao(), "aceitar_paga");
    await waitFor(() => expect(concluir).toHaveBeenCalledTimes(1));
    expect(base.marcar).toEqual([]);
    expect(base.decidir).toEqual([{ faltaId: "falta-antiga", resultado: "justificada", motivo: null }]);
    expect(concluir).toHaveBeenCalledWith({ erro: null, faltaId: "falta-antiga", etapa: "decidir" });
  });

  it("uma falta anulada à mesma hora não conta: marca uma nova", async () => {
    base.inicial = [{ id: "anulada", data: "2026-10-07", hora_inicio: "09:00:00", estado: "anulada" }];
    const concluir = correr(justificacao(), "aceitar_paga");
    await waitFor(() => expect(concluir).toHaveBeenCalledTimes(1));
    expect(base.marcar).toHaveLength(1);
    expect(base.decidir).toEqual([{ faltaId: "falta-nova", resultado: "justificada", motivo: null }]);
  });

  it("se a falta nova não aparece nas faltas relidas, não decide nenhuma", async () => {
    base.criaFalta = false;
    const concluir = correr(justificacao(), "aceitar_paga");
    await waitFor(() => expect(concluir).toHaveBeenCalledTimes(1));
    expect(base.decidir).toEqual([]);
    expect(concluir).toHaveBeenCalledWith({ erro: "rhJust.erro.faltaNaoEncontrada", faltaId: null, etapa: "procurar" });
  });

  it("marca uma só vez, mesmo com renderizações a mais", async () => {
    const concluir = vi.fn();
    const { rerender } = render(<AceitarComFaltaReal justificacao={justificacao()} decisao="aceitar_paga" aoConcluir={concluir} />);
    rerender(<AceitarComFaltaReal justificacao={justificacao()} decisao="aceitar_paga" aoConcluir={concluir} />);
    await waitFor(() => expect(concluir).toHaveBeenCalledTimes(1));
    expect(base.marcar).toHaveLength(1);
    expect(base.decidir).toHaveLength(1);
  });
});

describe("a falta da aceitação (funções puras)", () => {
  it("só aceitar cria falta", () => {
    expect(criaFalta("aceitar_paga")).toBe(true);
    expect(criaFalta("aceitar_nao_paga")).toBe(true);
    expect(criaFalta("recusar")).toBe(false);
  });

  it("cada tipo de justificação tem o seu motivo de falta, e o atraso sobrepõe-se", () => {
    expect(MOTIVO_DA_FALTA).toEqual({ consulta_medica: "doenca", transporte: "outro", assunto_pessoal: "assuntos_pessoais", outro: "outro" });
    expect(argumentosDaFalta(justificacao({ tipo: "consulta_medica" }), "aceitar_paga").motivoCodigo).toBe("doenca");
    expect(argumentosDaFalta(justificacao({ tipo: "consulta_medica", deAtraso: true }), "aceitar_paga").motivoCodigo).toBe("atraso");
  });

  it("faltaCriada ignora as que já existiam, as anuladas e as de outra hora ou dia", () => {
    const f = (id: string, parcial: object = {}) => ({ id, data: "2026-10-07", hora_inicio: "09:00:00", estado: "activa", ...parcial });
    const depois = [f("antes"), f("anulada", { estado: "anulada" }), f("outra-hora", { hora_inicio: "14:00:00" }), f("outro-dia", { data: "2026-10-08" }), f("nova")];
    expect(faltaCriada(depois, new Set(["antes"]), { data: "2026-10-07", periodoInicio: "09:00" })?.id).toBe("nova");
    expect(faltaCriada(depois.slice(0, 4), new Set(["antes"]), { data: "2026-10-07", periodoInicio: "09:00" })).toBeNull();
  });
});

describe("faltaActivaDoDia e ehPessoaDaBase", () => {
  it("encontra a falta activa do dia e hora, ignorando anuladas e outras horas", () => {
    const f = (id: string, p: object = {}) => ({ id, data: "2026-10-07", hora_inicio: "09:00:00", estado: "activa", ...p });
    const j = { data: "2026-10-07", periodoInicio: "09:00" };
    expect(faltaActivaDoDia([f("a", { estado: "anulada" }), f("b", { hora_inicio: "14:00:00" }), f("c")], j)?.id).toBe("c");
    expect(faltaActivaDoDia([], j)).toBeNull();
  });

  it("só ids UUID são pessoas da base", () => {
    expect(ehPessoaDaBase("p-ines")).toBe(false);
    expect(ehPessoaDaBase("")).toBe(false);
    expect(ehPessoaDaBase("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });
});
