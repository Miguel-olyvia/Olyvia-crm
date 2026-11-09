import { describe, expect, it, vi } from "vitest";
import {
  chaveDeAssiduidade,
  chaveDeFaltasMarcadas,
  conferirFaltasDoFecho,
  chavesDeFaltasPorPessoa,
  pessoasComFaltasMudadas,
} from "@/lib/hr/faltasFecho";

const hrFromMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hr/hrDb", () => ({ hrFrom: hrFromMock, isPermissionError: () => false }));

/** Uma cadeia de consulta simulada que responde com `resposta` (por tabela) no fim do `range`. */
function cadeia(resposta: { data?: unknown[]; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lte", "order"]) c[m] = () => c;
  c.range = () => Promise.resolve({ data: resposta.data ?? [], error: resposta.error ?? null });
  return c;
}

const linha = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "f1",
    pessoa_id: "p1",
    data: "2026-03-10",
    minutos: 480,
    estado: "activa",
    justificacao_estado: "sem_justificacao",
    remunerada: false,
    motivo_codigo: "ausencia_nao_comunicada",
    corrige_falta_id: null,
    ...overrides,
  }) as Parameters<typeof chaveDeFaltasMarcadas>[0][number];

describe("conferencia das faltas no fecho", () => {
  it("sem faltas a chave e vazia; uma falta anulada nao desconta mas conta na chave (trata o dia)", () => {
    expect(chaveDeFaltasMarcadas([])).toBe("");
    expect(chaveDeFaltasMarcadas([linha({ estado: "anulada" })])).not.toBe("");
  });

  it("anular uma falta DEPOIS de calcular muda a chave: o fecho obriga a recalcular", () => {
    const usada = chavesDeFaltasPorPessoa([linha()]);
    const atual = chavesDeFaltasPorPessoa([linha({ estado: "anulada" })]);
    expect(pessoasComFaltasMudadas(usada, atual)).toBe(1);
  });

  it("uma justificacao aprovada depois do calculo muda a chave por pessoa e o fecho ve-a", () => {
    const usada = chavesDeFaltasPorPessoa([linha(), linha({ id: "f2", pessoa_id: "p2" })]);
    const atual = chavesDeFaltasPorPessoa([
      linha({ justificacao_estado: "justificada", remunerada: true }),
      linha({ id: "f2", pessoa_id: "p2" }),
    ]);
    expect(pessoasComFaltasMudadas(usada, atual)).toBe(1);
    expect(pessoasComFaltasMudadas(usada, usada)).toBe(0);
  });

  it("uma pessoa que passou a ter uma falta, ou que deixou de ter, conta como mudada", () => {
    expect(pessoasComFaltasMudadas(new Map([["p1", ""]]), chavesDeFaltasPorPessoa([linha()]))).toBe(1);
    expect(pessoasComFaltasMudadas(chavesDeFaltasPorPessoa([linha()]), new Map())).toBe(1);
  });
});
const picagem = (overrides: Record<string, unknown> = {}) =>
  ({ id: "r1", pessoa_id: "p1", data: "2026-03-10", hora_inicio: "09:00", hora_fim: "13:00", minutos: 240, estado: "fechado", corrige_realizado_id: null, deleted_at: null, ...overrides }) as Parameters<typeof chaveDeAssiduidade>[0]["realizado"][number];
const ausencia = (overrides: Record<string, unknown> = {}) =>
  ({ pessoa_id: "p1", data: "2026-03-10", tipo_id: "t1", fraccao_dia: 0.5, ...overrides }) as Parameters<typeof chaveDeAssiduidade>[0]["ausencias"][number];

describe("a chave tambem cobre as picagens em vigor e as ausencias aprovadas", () => {
  it("sem nada a chave e vazia", () => {
    expect(chaveDeAssiduidade({ faltas: [], realizado: [], ausencias: [] })).toBe("");
  });

  it("uma picagem corrigida depois do calculo muda a chave", () => {
    const usada = chavesDeFaltasPorPessoa([], [picagem()]);
    const atual = chavesDeFaltasPorPessoa([], [picagem({ estado: "rejeitado" }), picagem({ id: "r2", corrige_realizado_id: "r1", hora_fim: "17:00", minutos: 480 })]);
    expect(pessoasComFaltasMudadas(usada, atual)).toBe(1);
    expect(pessoasComFaltasMudadas(usada, usada)).toBe(0);
  });

  it("uma ausencia aprovada depois do calculo muda a chave", () => {
    const usada = new Map([["p1", ""]]);
    const atual = chavesDeFaltasPorPessoa([], [], [ausencia()]);
    expect(pessoasComFaltasMudadas(usada, atual)).toBe(1);
  });
});

describe("conferirFaltasDoFecho", () => {
  it("uma leitura que falha (erro ou recusa de permissao) e um ERRO, nunca um ok", async () => {
    hrFromMock.mockImplementation((tabela: string) => cadeia(tabela === "pessoas_ausencias_dias" ? { error: { code: "42501" } } : {}));
    expect(await conferirFaltasDoFecho({ organizationId: "o", de: "2026-03-01", ate: "2026-03-31", calculadas: new Map() })).toEqual({ ok: false, motivo: "erro" });
  });

  it("com tudo lido compara com o que o calculo usou", async () => {
    hrFromMock.mockImplementation((tabela: string) => cadeia(tabela === "pessoas_ausencias_dias" ? { data: [ausencia()] } : {}));
    const igual = await conferirFaltasDoFecho({ organizationId: "o", de: "2026-03-01", ate: "2026-03-31", calculadas: new Map([["p1", chaveDeAssiduidade({ faltas: [], realizado: [], ausencias: [ausencia()] })]]) });
    expect(igual).toEqual({ ok: true });
    const mudou = await conferirFaltasDoFecho({ organizationId: "o", de: "2026-03-01", ate: "2026-03-31", calculadas: new Map([["p1", ""]]) });
    expect(mudou).toEqual({ ok: false, motivo: "mudaram", mudou: 1 });
  });
});