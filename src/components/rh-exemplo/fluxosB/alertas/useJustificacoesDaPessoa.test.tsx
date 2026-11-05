// A lista «por justificar» e a pastilha da aba Justificacoes saem dos desvios que a base propoe (hr_assiduidade_desvios), dos
// periodo da folha de hoje, filtrados para a pessoa. Supabase simulado: o hook do mapa da organizacao e trocado por um que devolve o que
// o teste lhe der e regista a janela pedida.
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Desvio } from "@/components/rh-exemplo/tiposAssiduidade";

const organizacao = vi.hoisted(() => ({
  janelas: [] as Array<{ de: string; ate: string }>,
  desvios: [] as unknown[],
  desviosErro: false,
  desviosRecusado: false,
  loading: false,
}));

vi.mock("@/components/rh-exemplo/hooks/useAssiduidadeDaOrganizacao", () => ({
  useAssiduidadeDaOrganizacao: (janela: { de: string; ate: string }) => {
    organizacao.janelas.push(janela);
    return {
      desvios: organizacao.desvios,
      desviosErro: organizacao.desviosErro,
      desviosRecusado: organizacao.desviosRecusado,
      loading: organizacao.loading,
    };
  },
}));

// O prazo e o fim do periodo da folha: o wrapper do hook real esta simulado, o teste escolhe as regras do periodo.
const prazo = vi.hoisted(() => ({ regras: [] as Array<{ dia_inicio: number; valido_de: string }> }));
vi.mock("@/components/rh-exemplo/hooks/usePrazoJustificacao", async () => {
  const { fimDoPeriodoDoDia, periodoDoDia } = await import("@/lib/hr/periodoFolha");
  return {
    usePrazoJustificacao: () => ({
      prazoDe: (data: string) => fimDoPeriodoDoDia(data, prazo.regras),
      periodoDe: (data: string) => periodoDoDia(data, prazo.regras),
      aCarregar: false,
    }),
  };
});

import { diaIsoAntes, useJustificacoesDaPessoa } from "./useJustificacoesDaPessoa";

const HOJE = "2026-10-14";

const desvio = (parcial: Partial<Desvio> = {}): Desvio => ({
  organization_id: "org", pessoa_id: "pessoa-1", data: HOJE, tipo: "planeado_sem_realizado", hora_inicio: "09:00:00",
  hora_fim: "13:00:00", minutos: 240, planeado_id: "plan-1", local_id: null, referencia_id: null, detalhe: null, ...parcial,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${HOJE}T12:00:00`));
  organizacao.janelas.length = 0;
  organizacao.desvios = [];
  organizacao.desviosErro = false;
  organizacao.desviosRecusado = false;
  organizacao.loading = false;
  prazo.regras = [];
});
afterEach(() => vi.useRealTimers());

describe("diaIsoAntes", () => {
  it("recua dias sem passar pelo fuso, atravessando meses e anos", () => {
    expect(diaIsoAntes("2026-10-14", 30)).toBe("2026-09-14");
    expect(diaIsoAntes("2026-01-10", 30)).toBe("2025-12-11");
    expect(diaIsoAntes("2026-03-01", 1)).toBe("2026-02-28");
    expect(diaIsoAntes("2028-03-01", 1)).toBe("2028-02-29");
  });
});

describe("useJustificacoesDaPessoa", () => {
  it("sem regra pede os desvios do periodo da folha de hoje: o mes de calendario, de 1/10 a hoje", () => {
    renderHook(() => useJustificacoesDaPessoa("pessoa-1"));
    expect(organizacao.janelas[0]).toEqual({ de: "2026-10-01", ate: HOJE });
  });

  it("com inicio a 10 a folha de hoje (14/10) comeca a 10/10, e e dai que a janela parte", () => {
    prazo.regras = [{ dia_inicio: 10, valido_de: "2000-01-01" }];
    renderHook(() => useJustificacoesDaPessoa("pessoa-1"));
    expect(organizacao.janelas[0]).toEqual({ de: "2026-10-10", ate: HOJE });
  });

  it("o fecho do periodo decide o que ainda esta dentro do prazo: 08/10 conta sem regra e ja nao conta com inicio a 10", () => {
    organizacao.desvios = [desvio({ data: "2026-10-08" })];
    const semRegra = renderHook(() => useJustificacoesDaPessoa("pessoa-1"));
    expect(semRegra.result.current.porFazer).toBe(1);
    expect(semRegra.result.current.menorPrazoDias).toBe(17); // de 14/10 a 31/10
    prazo.regras = [{ dia_inicio: 10, valido_de: "2000-01-01" }];
    const com10 = renderHook(() => useJustificacoesDaPessoa("pessoa-1"));
    expect(com10.result.current.porFazer).toBe(0); // a folha de 08/10 fechou a 09/10: injustificada
  });

  it("lista so os desvios da pessoa que sao falhas de marcacao, e conta os que estao dentro do prazo", () => {
    organizacao.desvios = [
      desvio(),
      desvio({ tipo: "pendente_par", referencia_id: "pic-1", data: "2026-10-13" }),
      desvio({ tipo: "realizado_sem_planeado", referencia_id: "r-1" }),
      desvio({ pessoa_id: "pessoa-2" }),
      // Folha de setembro (fechou a 30/9): continua na lista, mas ja nao conta na pastilha.
      desvio({ data: "2026-09-20" }),
    ];
    const { result } = renderHook(() => useJustificacoesDaPessoa("pessoa-1"));
    expect(result.current.porJustificar.map((a) => `${a.data}|${a.tipo}`)).toEqual([
      "2026-10-14|planeado_sem_realizado",
      "2026-10-13|pendente_par",
      "2026-09-20|planeado_sem_realizado",
    ]);
    expect(result.current.porFazer).toBe(2);
    expect(result.current.menorPrazoDias).not.toBeNull();
    expect(result.current.pendentes).toEqual([]);
    expect(result.current.aceites).toEqual([]);
    expect(result.current.recusadas).toEqual([]);
  });

  it("sem desvios da pessoa a pastilha e zero e nao ha prazo", () => {
    organizacao.desvios = [desvio({ pessoa_id: "pessoa-2" })];
    const { result } = renderHook(() => useJustificacoesDaPessoa("pessoa-1"));
    expect(result.current).toMatchObject({ porJustificar: [], porFazer: 0, menorPrazoDias: null, erro: false, recusado: false });
  });

  it("uma leitura falhada, recusada ou em curso passa para o ecra, e nao por «nao ha nada»", () => {
    organizacao.desviosErro = true;
    organizacao.desviosRecusado = true;
    organizacao.loading = true;
    const { result } = renderHook(() => useJustificacoesDaPessoa("pessoa-1"));
    expect(result.current).toMatchObject({ erro: true, recusado: true, loading: true });
  });
});
