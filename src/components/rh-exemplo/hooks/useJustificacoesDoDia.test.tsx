// O wrapper das justificações do dia: traduz as linhas da base para o contrato `JustificacaoDia` dos ecrãs de /rh-exemplo.
// O hook real está simulado (a prova dele está em src/hooks/__tests__/useJustificacoesDoDia.test.tsx); nada toca em base nenhuma.
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { JustificacaoDiaLinha } from "@/lib/hr/justificacaoDia";

const real = vi.hoisted(() => ({
  linhas: [] as unknown[],
  estado: { loading: false, recusado: false, erro: false, indisponivel: false },
  recarregar: () => Promise.resolve(),
  opcoes: [] as unknown[],
}));

vi.mock("@/hooks/useJustificacoesDoDia", () => ({
  useJustificacoesDoDia: (opcoes: unknown) => {
    real.opcoes.push(opcoes);
    return { linhas: real.linhas, ...real.estado, leitura: "ok", recarregar: real.recarregar };
  },
  useAccoesJustificacaoDia: () => ({}),
}));

import {
  linhaParaJustificacaoDia,
  ordenarPorEnvio,
  useJustificacoesDoDia,
  type JustificacaoDiaLinhaEmVigor,
} from "./useJustificacoesDoDia";

// As colunas do RETURNS TABLE de rpc_hr_justificacao_dia_listar no rascunho: o envio chega como enviada_em, e não há
// organization_id nem created_at.
const linha = (parcial: Partial<JustificacaoDiaLinhaEmVigor> = {}): JustificacaoDiaLinhaEmVigor => ({
  id: "j-1", pessoa_id: "pessoa-1", pessoa_nome: "Ana", data: "2026-10-08", tipo: "transporte", de_atraso: false,
  periodo_inicio: "09:00:00", periodo_fim: "09:15:00", minutos: 15, hora_real: "09:14:00", motivo: "Autocarro avariado",
  texto_sensivel: false, anexos_nomes: ["a.pdf"], estado: "pendente", enviada_em: "2026-10-12T10:00:00Z", decidida_por: null,
  decidida_por_nome: null, decidida_em: null, motivo_recusa: null, falta_id: null, mes_fechado_na_decisao: false,
  sem_efeito_em: null, ...parcial,
});

/** Uma linha que ficou sem efeito (a falta da aceitação foi anulada). */
const semEfeito = (parcial: Partial<JustificacaoDiaLinha> = {}): JustificacaoDiaLinha => ({
  ...linha(),
  estado: "sem_efeito",
  decidida_por: "u-1",
  decidida_por_nome: "Rita",
  decidida_em: "2026-10-13T09:00:00Z",
  falta_id: "falta-anulada",
  sem_efeito_em: "2026-10-15T09:00:00Z",
  ...parcial,
});

describe("linhaParaJustificacaoDia", () => {
  it("passa os campos da base para o contrato do ecrã, com as horas sem segundos", () => {
    expect(linhaParaJustificacaoDia(linha())).toEqual({
      id: "j-1", origem: "sugestao", pessoaId: "pessoa-1", data: "2026-10-08", tipo: "transporte", motivo: "Autocarro avariado",
      horaReal: "09:14", anexos: ["a.pdf"], minutos: 15, periodoInicio: "09:00", periodoFim: "09:15", deAtraso: false,
      enviadaEm: "2026-10-12T10:00:00Z", estado: "pendente", decididaPor: null, decididaEm: null, motivoRecusa: null,
      faltaId: null, mesFechado: false,
    });
  });

  it("o motivo reservado (consulta médica para o RH) chega vazio, e a hora real em falta fica nula", () => {
    const j = linhaParaJustificacaoDia(linha({ tipo: "consulta_medica", motivo: null, texto_sensivel: true, hora_real: null }));
    expect(j.motivo).toBe("");
    expect(j.horaReal).toBeNull();
    expect(j.tipo).toBe("consulta_medica");
  });

  it("uma decisão traz o nome de quem decidiu, a falta e o mês fechado", () => {
    const j = linhaParaJustificacaoDia(
      linha({ estado: "aceite_paga", decidida_por: "u-1", decidida_por_nome: "Rita", decidida_em: "2026-10-13T09:00:00Z", falta_id: "falta-9", mes_fechado_na_decisao: true }),
    );
    expect(j).toMatchObject({ estado: "aceite_paga", decididaPor: "Rita", decididaEm: "2026-10-13T09:00:00Z", faltaId: "falta-9", mesFechado: true });
  });

  it("decidida por um utilizador entretanto apagado continua a dizer que foi decidida", () => {
    const j = linhaParaJustificacaoDia(linha({ estado: "recusada", decidida_por_nome: null, decidida_em: "2026-10-13T09:00:00Z", motivo_recusa: "Sem comprovativo" }));
    expect(j.decididaPor).toBe("—");
    expect(j.motivoRecusa).toBe("Sem comprovativo");
  });

  it("anexos em falta na linha dão lista vazia", () => {
    const sem = { ...linha(), anexos_nomes: undefined } as unknown as JustificacaoDiaLinhaEmVigor;
    expect(linhaParaJustificacaoDia(sem).anexos).toEqual([]);
  });

  it("copia os anexos (não partilha a lista da base)", () => {
    const origem = linha();
    expect(linhaParaJustificacaoDia(origem).anexos).not.toBe(origem.anexos_nomes);
  });
});

describe("ordenarPorEnvio", () => {
  it("ordena da mais antiga para a mais recente, sem mexer na lista original", () => {
    const a = linhaParaJustificacaoDia(linha({ id: "a", enviada_em: "2026-10-12T10:00:00Z" }));
    const b = linhaParaJustificacaoDia(linha({ id: "b", enviada_em: "2026-10-14T10:00:00Z" }));
    const c = linhaParaJustificacaoDia(linha({ id: "c", enviada_em: "2026-10-13T10:00:00Z" }));
    const original = [b, c, a];
    expect(ordenarPorEnvio(original).map((j) => j.id)).toEqual(["a", "c", "b"]);
    expect(original.map((j) => j.id)).toEqual(["b", "c", "a"]);
  });
});

describe("useJustificacoesDoDia (wrapper)", () => {
  it("devolve as justificações traduzidas e ordenadas, e o estado da leitura", () => {
    real.linhas = [linha({ id: "recente", enviada_em: "2026-10-14T10:00:00Z" }), linha({ id: "antiga", enviada_em: "2026-10-12T10:00:00Z" })];
    real.estado = { loading: false, recusado: false, erro: false, indisponivel: true };
    const { result } = renderHook(() => useJustificacoesDoDia({ pessoaId: "pessoa-1" }));
    expect(result.current.justificacoes.map((j) => j.id)).toEqual(["antiga", "recente"]);
    expect(result.current.indisponivel).toBe(true);
    expect(result.current.erro).toBe(false);
    expect(real.opcoes.at(-1)).toEqual({ pessoaId: "pessoa-1" });
  });

  it("lê o envio de enviada_em: com várias linhas não rebenta e ordena pela data de envio", () => {
    real.linhas = [
      linha({ id: "b", enviada_em: "2026-10-14T10:00:00Z" }),
      linha({ id: "c", enviada_em: "2026-10-13T10:00:00Z" }),
      linha({ id: "a", enviada_em: "2026-10-12T10:00:00Z" }),
    ];
    real.estado = { loading: false, recusado: false, erro: false, indisponivel: false };
    const { result } = renderHook(() => useJustificacoesDoDia());
    expect(result.current.justificacoes.map((j) => [j.id, j.enviadaEm])).toEqual([
      ["a", "2026-10-12T10:00:00Z"],
      ["c", "2026-10-13T10:00:00Z"],
      ["b", "2026-10-14T10:00:00Z"],
    ]);
  });

  it("as linhas sem_efeito não chegam ao ecrã: o dia volta a contar só com as que valem", () => {
    real.linhas = [
      semEfeito({ id: "anulada", enviada_em: "2026-10-14T10:00:00Z" }),
      linha({ id: "recusada", estado: "recusada", decidida_em: "2026-10-13T09:00:00Z", motivo_recusa: "Sem comprovativo", enviada_em: "2026-10-12T10:00:00Z" }),
    ];
    real.estado = { loading: false, recusado: false, erro: false, indisponivel: false };
    const { result } = renderHook(() => useJustificacoesDoDia());
    expect(result.current.justificacoes.map((j) => j.id)).toEqual(["recusada"]);
    expect(result.current.justificacoes.every((j) => (j.estado as string) !== "sem_efeito")).toBe(true);
  });

  it("só uma linha sem_efeito no dia: lista vazia (a pessoa pode voltar a justificar)", () => {
    real.linhas = [semEfeito()];
    real.estado = { loading: false, recusado: false, erro: false, indisponivel: false };
    const { result } = renderHook(() => useJustificacoesDoDia());
    expect(result.current.justificacoes).toEqual([]);
  });

  it("sem linhas dá lista vazia", () => {
    real.linhas = [];
    real.estado = { loading: true, recusado: false, erro: false, indisponivel: false };
    const { result } = renderHook(() => useJustificacoesDoDia());
    expect(result.current.justificacoes).toEqual([]);
    expect(result.current.loading).toBe(true);
  });
});
