// A lista «por justificar» e a pastilha da aba Justificacoes saem dos desvios que a base propoe (hr_assiduidade_desvios), dos
// ultimos 30 dias, filtrados para a pessoa. Supabase simulado: o hook do mapa da organizacao e trocado por um que devolve o que
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

import { diaIsoAntes, JANELA_DE_DESVIOS_DIAS, useJustificacoesDaPessoa } from "./useJustificacoesDaPessoa";

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
  it("pede os desvios dos ultimos 30 dias ate hoje", () => {
    renderHook(() => useJustificacoesDaPessoa("pessoa-1"));
    expect(JANELA_DE_DESVIOS_DIAS).toBe(30);
    expect(organizacao.janelas[0]).toEqual({ de: "2026-09-14", ate: HOJE });
  });

  it("lista so os desvios da pessoa que sao falhas de marcacao, e conta os que estao dentro do prazo", () => {
    organizacao.desvios = [
      desvio(),
      desvio({ tipo: "pendente_par", referencia_id: "pic-1", data: "2026-10-13" }),
      desvio({ tipo: "realizado_sem_planeado", referencia_id: "r-1" }),
      desvio({ pessoa_id: "pessoa-2" }),
      // Fora do prazo de 5 dias uteis: continua por justificar, mas nao conta na pastilha.
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
