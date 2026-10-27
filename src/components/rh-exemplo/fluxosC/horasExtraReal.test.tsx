// Horas extra ligadas à base (Supabase simulado nos wrappers): os coeficientes de pagamento são os códigos de
// processamento da organização e o limite anual da pessoa é o «Horas anuais máximas» do contrato.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { rhExemploHorasExtraRealTranslations } from "@/translations/rhExemploHorasExtraReal";
import { CoeficientesHorasExtraReais, codigoDaOrigem, percentagemValida } from "./CoeficientesHorasExtraReais";
import { limiteAnualMin, useLimiteAnualDaPessoa, useLimiteAnualMin } from "./limitePessoa";

const m = vi.hoisted(() => ({
  codigos: [] as unknown[],
  isLoading: false,
  error: null as unknown,
  actualizar: vi.fn(),
  permissoes: new Set<string>(),
  permissoesALoad: false,
  pessoa: { vinculos: [] as unknown[], loading: false, error: null as string | null },
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
vi.mock("@/components/rh-exemplo/hooks/usePessoa", () => ({ usePessoa: () => m.pessoa }));
vi.mock("@/lib/toast", () => ({ toast: { error: (...a: unknown[]) => m.toastErro(...a), success: (...a: unknown[]) => m.toastSucesso(...a) } }));
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: async () => "mensagem amigavel" }));

const codigo = (over: Record<string, unknown>) => ({
  id: "c1", organization_id: "org", codigo: "300", nome: "Horas extra", descricao: null, activo: true,
  modo_calculo: "percentagem_hora_normal", percentagem: 150, valor_fixo: null, origem_automatica: "horas_extra", ...over,
});
const campo = (origem: string) => document.getElementById(`he-coef-real-${origem}`) as HTMLInputElement | null;
const montar = () => render(<LanguageProvider><CoeficientesHorasExtraReais /></LanguageProvider>);

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  m.codigos = [];
  m.isLoading = false;
  m.error = null;
  m.actualizar = vi.fn().mockResolvedValue(undefined);
  m.permissoes = new Set(["hr.vencimento.codigos.view", "hr.vencimento.codigos.gerir"]);
  m.permissoesALoad = false;
  m.pessoa = { vinculos: [], loading: false, error: null };
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
  it.each([["150", true], ["0.5", true], ["1000", true], ["", false], ["  ", false], ["0", false], ["-5", false], ["1000.1", false], ["abc", false]])(
    "percentagemValida(%j) = %s", (texto, esperado) => expect(percentagemValida(texto)).toBe(esperado),
  );

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
  it("mostra a percentagem do código activo de cada origem, sem valores de exemplo", () => {
    m.codigos = [
      codigo({ id: "c1" }),
      codigo({ id: "c2", codigo: "301", origem_automatica: "horas_extra_noturnas", percentagem: 175 }),
      codigo({ id: "c3", codigo: "302", origem_automatica: "feriado_trabalhado", percentagem: 200 }),
    ];
    montar();
    expect(campo("horas_extra")?.value).toBe("150");
    expect(campo("horas_extra_noturnas")?.value).toBe("175");
    expect(campo("feriado_trabalhado")?.value).toBe("200");
    expect(campo("descanso_trabalhado")).toBeNull();
    expect(screen.getByTestId("he-coef-real-descanso_trabalhado-sem-codigo")).toBeInTheDocument();
  });

  it("guarda a nova percentagem no próprio código, mantendo nome, modo e origem", async () => {
    m.codigos = [codigo({ descricao: "d" })];
    montar();
    const botao = screen.getByRole("button", { name: "Guardar" });
    expect(botao).toBeDisabled();
    fireEvent.change(campo("horas_extra") as HTMLInputElement, { target: { value: "175" } });
    expect(botao).toBeEnabled();
    fireEvent.click(botao);
    await waitFor(() => expect(m.actualizar).toHaveBeenCalledTimes(1));
    expect(m.actualizar).toHaveBeenCalledWith("c1", {
      nome: "Horas extra", descricao: "d", modo_calculo: "percentagem_hora_normal", percentagem: 175, valor_fixo: null, origem_automatica: "horas_extra",
    });
    await waitFor(() => expect(m.toastSucesso).toHaveBeenCalledTimes(1));
  });

  it.each(["", "0", "-3", "1001"])("não deixa guardar %j e diz porquê", (valor) => {
    m.codigos = [codigo({})];
    montar();
    fireEvent.change(campo("horas_extra") as HTMLInputElement, { target: { value: valor } });
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/maior que 0/);
    expect(m.actualizar).not.toHaveBeenCalled();
  });

  it("se a base recusar, mostra o erro e mantém o valor escrito (não finge que guardou)", async () => {
    m.actualizar = vi.fn().mockRejectedValue(new Error("rls"));
    m.codigos = [codigo({})];
    montar();
    fireEvent.change(campo("horas_extra") as HTMLInputElement, { target: { value: "190" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(m.toastErro).toHaveBeenCalledWith("mensagem amigavel"));
    expect(m.toastSucesso).not.toHaveBeenCalled();
    expect(campo("horas_extra")?.value).toBe("190");
  });

  it("um código por valor fixo explica que se muda no separador Códigos, sem campo de percentagem", () => {
    m.codigos = [codigo({ origem_automatica: "feriado_trabalhado", modo_calculo: "valor_fixo_ocorrencia", percentagem: null, valor_fixo: 12.5, codigo: "305", nome: "Feriado fixo" })];
    montar();
    expect(campo("feriado_trabalhado")).toBeNull();
    expect(screen.getByTestId("he-coef-real-feriado_trabalhado-outro-modo")).toHaveTextContent("305");
  });

  it("sem permissão de gerir os campos ficam só de leitura e sem botão", () => {
    m.permissoes = new Set(["hr.vencimento.codigos.view"]);
    m.codigos = [codigo({})];
    montar();
    expect(campo("horas_extra")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("sem permissão de ver não mostra percentagens nenhumas", () => {
    m.permissoes = new Set();
    m.codigos = [codigo({})];
    montar();
    expect(campo("horas_extra")).toBeNull();
    expect(screen.getByText(/permiss/i)).toBeInTheDocument();
  });

  it("se a leitura falhar mostra o erro em vez de uma lista vazia", () => {
    m.error = new Error("falhou");
    montar();
    expect(screen.getByRole("alert")).toHaveTextContent(/Não foi possível ler/);
    expect(campo("horas_extra")).toBeNull();
  });

  it("enquanto carrega não mostra campos", () => {
    m.isLoading = true;
    montar();
    expect(campo("horas_extra")).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("limite anual da pessoa: o «Horas anuais máximas» do contrato", () => {
  const v = (over: Record<string, unknown>) => ({ data_inicio: "2026-01-01", estado: "activo", horas_anuais_maximas: 100, ...over });

  it("a regra pura continua: vigente activo, senão o mais recente, senão a omissão", () => {
    expect(limiteAnualMin(undefined, 9000)).toBe(9000);
    expect(limiteAnualMin(null, 9000)).toBe(9000);
    expect(limiteAnualMin({ vinculos: [] }, 9000)).toBe(9000);
    expect(limiteAnualMin({ vinculos: [v({ horas_anuais_maximas: null })] as never }, 9000)).toBe(9000);
    expect(limiteAnualMin({ vinculos: [v({ horas_anuais_maximas: 0 })] as never }, 9000)).toBe(9000);
    expect(limiteAnualMin({ vinculos: [v({})] as never }, 9000)).toBe(6000);
    expect(limiteAnualMin({ vinculos: [v({ estado: "terminado", data_inicio: "2027-01-01", horas_anuais_maximas: 50 }), v({})] as never }, 9000)).toBe(6000);
    expect(limiteAnualMin({ vinculos: [v({ estado: "terminado", horas_anuais_maximas: 50 })] as never }, 9000)).toBe(3000);
  });

  it("lê o limite do contrato real da pessoa", () => {
    m.pessoa = { vinculos: [v({})], loading: false, error: null };
    const { result } = renderHook(() => useLimiteAnualDaPessoa("p1", 9000));
    expect(result.current).toEqual({ limiteMin: 6000, origem: "contrato", aCarregar: false, erro: null });
    expect(renderHook(() => useLimiteAnualMin("p1", 9000)).result.current).toBe(6000);
  });

  it("sem limite no contrato vale a omissão da organização e diz que veio dela", () => {
    m.pessoa = { vinculos: [v({ horas_anuais_maximas: null })], loading: false, error: null };
    const { result } = renderHook(() => useLimiteAnualDaPessoa("p1", 9000));
    expect(result.current).toMatchObject({ limiteMin: 9000, origem: "omissao", erro: null });
  });

  it("enquanto carrega não finge um limite do contrato", () => {
    m.pessoa = { vinculos: [v({})], loading: true, error: null };
    const { result } = renderHook(() => useLimiteAnualDaPessoa("p1", 9000));
    expect(result.current).toMatchObject({ limiteMin: 9000, origem: "omissao", aCarregar: true });
  });

  it("se a leitura da ficha falhar devolve o erro para o ecrã o mostrar", () => {
    m.pessoa = { vinculos: [], loading: false, error: "falhou a ler" };
    const { result } = renderHook(() => useLimiteAnualDaPessoa("p1", 9000));
    expect(result.current).toMatchObject({ limiteMin: 9000, origem: "omissao", erro: "falhou a ler" });
  });
});
