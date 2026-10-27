// A admissão do /rh-exemplo ligada ao real: o pipeline (rpc_hr_admissao_listar), o contador «por aprovar», o cartão e a faixa
// da ficha (a partir do resumo do convite). Os hooks reais são simulados; o que se vê tem de ser o texto REAL, não o do exemplo.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LanguageProvider } from "@/contexts/LanguageContext";

let permissoes: Set<string>;
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (p: string) => permissoes.has(p), loading: false }),
}));

let estadoHook: Record<string, unknown>;
const chamadas: Array<{ estados: string[] | null }> = [];
vi.mock("@/hooks/useAdmissoesPipeline", () => ({
  LIMITE_PIPELINE: 50,
  useAdmissoesPipeline: (opcoes: { estados: string[] | null }) => {
    chamadas.push(opcoes);
    return estadoHook;
  },
}));

vi.mock("@/hooks/useRevisaoAdmissao", () => ({
  useRevisaoAdmissao: () => ({
    carregando: false,
    erro: null,
    revisao: { campos: [], niss: { preenchido: false }, iban: { preenchido: false }, anexos: [], devolucao: null, pendencias: [], eventos: [] },
    revelar: vi.fn(),
    recarregar: vi.fn(),
  }),
}));

import { PipelineAdmissoes } from "@/components/rh-exemplo/hooks/PipelineAdmissoesReal";
import { useAdmissoesPorAprovar } from "@/components/rh-exemplo/hooks/useAdmissoesPorAprovar";
import { CartaoAdmissaoDaFicha } from "@/components/rh-exemplo/hooks/CartaoAdmissaoDaFicha";
import { FaixaProgressoAdmissaoDaFicha } from "@/components/rh-exemplo/hooks/FaixaProgressoAdmissaoDaFicha";
import type { ResumoConvite } from "@/components/rh-exemplo/hooks/useConviteAdmissaoResumo";

const resumo = (sobre: Partial<ResumoConvite> = {}): ResumoConvite => ({
  conviteId: "c1",
  estado: "submetida",
  estadoPortal: "ativo",
  emailDestino: null,
  criadoEm: "2026-12-10T09:00:00Z",
  validUntil: "2026-12-20T10:00:00Z",
  portalEncerradoEm: null,
  emailEnviado: true,
  emailErro: null,
  bloqueado: false,
  ultimaRecusa: null,
  ...sobre,
});

const item = (n: number, sobre: Record<string, unknown> = {}) => ({
  conviteId: `c${n}`, pessoaId: `p${n}`, nome: `Pessoa ${n}`, cargo: "Operador de linha", estado: "submetida", estadoPortal: "ativo",
  validUntil: "2026-12-20T10:00:00Z", submetidoEm: "2026-12-14T09:00:00Z", devolvidaEm: null, atualizadoEm: null, ...sobre,
});

const montar = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (window.HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  permissoes = new Set(["hr.onboarding.approve", "hr.pessoas.convite.enviar"]);
  chamadas.length = 0;
  estadoHook = {
    itens: [item(1)], contadores: { submetida: 3, convidada: 2 }, carregando: false, aCarregarMais: false, temMais: false,
    erro: null, carregarMais: vi.fn(), recarregar: vi.fn(),
  };
});

describe("pipeline de admissões (real)", () => {
  it("mostra os processos que a lista real devolve, com o texto real da explicação", () => {
    montar(<PipelineAdmissoes aoAbrirFicha={vi.fn()} />);
    expect(screen.getByText("Pessoa 1")).toBeInTheDocument();
    expect(screen.getByText(/Os dados que a pessoa submete só passam para a ficha quando o RH aprova/)).toBeInTheDocument();
    expect(screen.queryByText(/login temporário de 7 dias/)).not.toBeInTheDocument();
    expect(chamadas[0]?.estados).toBeNull();
  });

  it("o vazio e o título da revisão são os reais, não os do exemplo", () => {
    estadoHook = { ...estadoHook, itens: [], contadores: {} };
    const { unmount } = montar(<PipelineAdmissoes aoAbrirFicha={vi.fn()} />);
    expect(screen.getByText("Não há admissões nesta organização.")).toBeInTheDocument();
    unmount();

    estadoHook = { ...estadoHook, itens: [item(1)] };
    montar(<PipelineAdmissoes aoAbrirFicha={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Rever/ }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText(/Consulta do que a pessoa submeteu/)).toBeInTheDocument();
    expect(within(dialogo).queryByText(/devolva, ou aprove/)).not.toBeInTheDocument();
  });
});

describe("contador «por aprovar»", () => {
  it("lê o número de submetidas da lista real, a quem a pode ver", () => {
    const { result } = renderHook(() => useAdmissoesPorAprovar());
    expect(result.current).toBe(3);
    expect(chamadas[0]?.estados).toEqual(["submetida"]);
  });

  it("é zero se a lista não traz o estado «submetida»", () => {
    estadoHook = { ...estadoHook, contadores: { convidada: 2 } };
    expect(renderHook(() => useAdmissoesPorAprovar()).result.current).toBe(0);
  });

  it("é zero sem permissão para ver o pipeline (a base recusaria a lista)", () => {
    permissoes = new Set();
    expect(renderHook(() => useAdmissoesPorAprovar()).result.current).toBe(0);
  });

  it("é zero enquanto a lista carrega ou se ela falhou", () => {
    estadoHook = { ...estadoHook, carregando: true };
    expect(renderHook(() => useAdmissoesPorAprovar()).result.current).toBe(0);
    estadoHook = { ...estadoHook, carregando: false, erro: { codigo: null } };
    expect(renderHook(() => useAdmissoesPorAprovar()).result.current).toBe(0);
  });
});

describe("cartão «Admissão» da ficha (real)", () => {
  const cartao = (r: ResumoConvite | null) =>
    montar(<CartaoAdmissaoDaFicha pessoaId="p1" nome="Marco Ventura" cargo="Vendedor" resumo={r} aoAbrirFicha={vi.fn()} />);

  it("sem convite não mostra nada", () => {
    cartao(null);
    expect(screen.queryByText("Marco Ventura")).not.toBeInTheDocument();
  });

  it("mostra o nome, o cargo, os selos e «Rever» a quem pode aprovar; «Rever» abre a revisão real", () => {
    cartao(resumo());
    expect(screen.getByText("Marco Ventura")).toBeInTheDocument();
    expect(screen.getByText("Vendedor")).toBeInTheDocument();
    expect(screen.getByText("Submetida")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Rever/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("sem «hr.onboarding.approve» não há «Rever»", () => {
    permissoes = new Set(["hr.pessoas.convite.enviar"]);
    cartao(resumo());
    expect(screen.queryByRole("button", { name: /Rever/ })).not.toBeInTheDocument();
  });

  it("um processo terminado (mascarado) não se pode rever", () => {
    cartao(resumo({ estado: "terminado", estadoPortal: "revogado" }));
    expect(screen.queryByRole("button", { name: /Rever/ })).not.toBeInTheDocument();
  });

  it("sem identificador do convite não há cartão (não se inventa um processo)", () => {
    cartao(resumo({ conviteId: null }));
    expect(screen.queryByText("Marco Ventura")).not.toBeInTheDocument();
  });
});

describe("faixa de progresso da ficha (real)", () => {
  it("marca o passo em curso com aria-current e diz em texto o que está feito", () => {
    montar(<FaixaProgressoAdmissaoDaFicha resumo={resumo({ estado: "submetida" })} />);
    const faixa = screen.getByRole("list", { name: "Progresso da admissão" });
    expect(within(faixa).getByText("Aprovação do RH").closest("li")).toHaveAttribute("aria-current", "step");
    expect(within(faixa).getByText("Convite").closest("li")).not.toHaveAttribute("aria-current");
  });

  it("sem convite, ou sem saber onde vai (cancelada), não mostra faixa", () => {
    const { container, rerender } = montar(<FaixaProgressoAdmissaoDaFicha resumo={null} />);
    expect(container.querySelector("ol")).toBeNull();
    rerender(<LanguageProvider><FaixaProgressoAdmissaoDaFicha resumo={resumo({ estado: "cancelada" })} /></LanguageProvider>);
    expect(container.querySelector("ol")).toBeNull();
  });
});

describe("o ecrã já não lê a admissão da memória", () => {
  const ler = (ficheiro: string): string => readFileSync(join(process.cwd(), "src", ficheiro), "utf8");
  it.each(["pages/rh-exemplo/PessoasRh.tsx", "components/rh-exemplo/ficha/ConteudoFichaRh.tsx", "components/rh-exemplo/ficha/AbasPessoa.tsx"])(
    "%s não importa lojaAdmissao nem os componentes de admissão em memória",
    (ficheiro) => {
      const fonte = ler(ficheiro);
      expect(fonte).not.toMatch(/lojaAdmissao/);
      expect(fonte).not.toMatch(/components\/rh-exemplo\/admissao\//);
    },
  );
});
