// Horas extra ligadas à base (Supabase simulado nos wrappers): os coeficientes de pagamento são os códigos de
// processamento da organização (o limite anual é da regra salarial, não é testado aqui).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { rhExemploHorasExtraRealTranslations } from "@/translations/rhExemploHorasExtraReal";
import { CoeficientesHorasExtraReais, ORIGENS_HORAS_EXTRA, codigoDaOrigem } from "./CoeficientesHorasExtraReais";

const m = vi.hoisted(() => ({
  codigos: [] as unknown[],
  isLoading: false,
  error: null as unknown,
  actualizar: vi.fn(),
  permissoes: new Set<string>(),
  permissoesALoad: false,
  toastErro: vi.fn(),
  toastSucesso: vi.fn(),
}));

vi.mock("@/components/rh-exemplo/hooks/useCodigosProcessamento", () => ({
  useCodigosProcessamento: () => ({
    codigos: m.codigos, isLoading: m.isLoading, isSaving: false, error: m.error, criar: vi.fn(), actualizar: m.actualizar, definirActivo: vi.fn(),
  }),
}));
vi.mock("@/components/rh-exemplo/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => m.permissoes.has(p), hasAnyPermission: () => true, permissions: [], loading: m.permissoesALoad,
  }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: (...a: unknown[]) => m.toastErro(...a), success: (...a: unknown[]) => m.toastSucesso(...a) } }));
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: async () => "mensagem amigavel" }));

const codigo = (over: Record<string, unknown>) => ({
  id: "c1", organization_id: "org", codigo: "300", nome: "Horas extra", descricao: null, activo: true,
  modo_calculo: "percentagem_hora_normal", percentagem: 150, valor_fixo: null, origem_automatica: "horas_extra", ...over,
});
const linha = (origem: string) => screen.queryByTestId(`he-coef-real-${origem}`);
const montar = () => render(<LanguageProvider><CoeficientesHorasExtraReais /></LanguageProvider>);

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  m.codigos = [];
  m.isLoading = false;
  m.error = null;
  m.actualizar = vi.fn().mockResolvedValue(undefined);
  m.permissoes = new Set(["hr.vencimento.codigos.view", "hr.vencimento.codigos.gerir"]);
  m.permissoesALoad = false;
  m.toastErro.mockClear();
  m.toastSucesso.mockClear();
});

describe("traduções rhHeReal", () => {
  it("en e pt têm exatamente as mesmas chaves", () => {
    const { en, pt } = rhExemploHorasExtraRealTranslations;
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });
});

describe("regras puras dos coeficientes", () => {
  it("as nocturnas já não são uma origem escolhível (o valor vem da regra salarial)", () => {
    expect(ORIGENS_HORAS_EXTRA).toEqual(["horas_extra", "feriado_trabalhado", "descanso_trabalhado"]);
  });

  it("o código da origem é o activo; um inactivo ou de outra origem não conta", () => {
    const a = codigo({ id: "a", activo: false });
    const b = codigo({ id: "b", origem_automatica: "feriado_trabalhado" });
    const c = codigo({ id: "c" });
    expect(codigoDaOrigem([a, b] as never, "horas_extra")).toBeUndefined();
    expect(codigoDaOrigem([a, b, c] as never, "horas_extra")?.id).toBe("c");
    expect(codigoDaOrigem([] as never, "horas_extra")).toBeUndefined();
  });
});

describe("coeficientes das horas extra: códigos de processamento reais", () => {
  it("mostra o código activo de cada origem, sem percentagem nem campo editável", () => {
    m.codigos = [
      codigo({ id: "c1" }),
      codigo({ id: "c3", codigo: "302", origem_automatica: "feriado_trabalhado", percentagem: 200 }),
    ];
    montar();
    expect(linha("horas_extra")).toHaveTextContent("300 · Horas extra");
    expect(linha("horas_extra")).toHaveTextContent(/regra salarial em vigor/);
    expect(linha("feriado_trabalhado")).toHaveTextContent("302");
    expect(linha("descanso_trabalhado")).toBeNull();
    expect(screen.getByTestId("he-coef-real-descanso_trabalhado-sem-codigo")).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    expect(screen.queryByText(/150|200/)).not.toBeInTheDocument();
  });

  it("nunca escreve no código (nada para guardar aqui)", () => {
    m.codigos = [codigo({ descricao: "d" })];
    montar();
    expect(m.actualizar).not.toHaveBeenCalled();
  });

  it("um código por valor fixo explica que se muda no separador Códigos", () => {
    m.codigos = [codigo({ origem_automatica: "feriado_trabalhado", modo_calculo: "valor_fixo_ocorrencia", percentagem: null, valor_fixo: 12.5, codigo: "305", nome: "Feriado fixo" })];
    montar();
    expect(linha("feriado_trabalhado")).toBeNull();
    expect(screen.getByTestId("he-coef-real-feriado_trabalhado-outro-modo")).toHaveTextContent("305");
  });

  it("sem permissão de ver não mostra códigos nenhuns", () => {
    m.permissoes = new Set();
    m.codigos = [codigo({})];
    montar();
    expect(linha("horas_extra")).toBeNull();
    expect(screen.getByText(/permiss/i)).toBeInTheDocument();
  });

  it("se a leitura falhar mostra o erro em vez de uma lista vazia", () => {
    m.error = new Error("falhou");
    montar();
    expect(screen.getByRole("alert")).toHaveTextContent(/Não foi possível ler/);
    expect(linha("horas_extra")).toBeNull();
  });

  it("enquanto carrega não mostra linhas", () => {
    m.isLoading = true;
    montar();
    expect(linha("horas_extra")).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});


