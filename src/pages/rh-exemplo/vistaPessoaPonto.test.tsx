// A correção de pontos é só do RH (fluxo 5): a pessoa que se esqueceu de picar JUSTIFICA em 5 dias úteis (motivo e hora real)
// e o RH aceita ou recusa. Na vista da própria pessoa não existe «Corrigir» em lado nenhum; na do RH existe. Tudo em memória.
// A data é fixa (14/10/2026): a Sofia tem uma picagem por emparelhar a 13/10 (dentro do prazo).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
// As justificacoes do dia vivem na base: aqui a base e simulada (sem CompanyProvider e sem chamadas).
vi.mock("@/components/rh-exemplo/hooks/useJustificacoesDoDia", async () => (await import("@/test/justificacoesDoDiaFalso")).wrapperFalso());
vi.mock("@/components/rh-exemplo/hooks/usePrazoJustificacao", async () => (await import("@/test/prazoJustificacaoFalso")).wrapperFalso());
// As horas extra e as permissoes de assiduidade vem da base: simuladas, semeadas com as horas extra de exemplo.
vi.mock("@/components/rh-exemplo/hooks/horasExtraReal", async () => (await import("@/test/horasExtraFalso")).wrapperFalso());
vi.mock("@/components/rh-exemplo/hooks/usePermissoesAssiduidade", async () => (await import("@/test/horasExtraFalso")).permissoesFalsas());

// A base e simulada como nos outros testes do rh-exemplo (mesmo conjunto do justificacaoDia.test): sem CompanyProvider e sem chamadas.
vi.mock("@/contexts/CompanyContext", async () => (await import("@/test/rhExemploProviders")).moduloCompanyFalso());
vi.mock("@/contexts/PermissionsContext", async () => (await import("@/test/rhExemploProviders")).moduloPermissoesFalso());
vi.mock("@/integrations/supabase/client", async () => (await import("@/test/rhExemploProviders")).moduloSupabaseFalso());
vi.mock("@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa", async (importOriginal) =>
  (await import("@/test/assiduidadeDaPessoaFalso")).wrapperAssiduidadeDaPessoaFalso(
    await importOriginal<typeof import("@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa")>(),
  ));
vi.mock("@/components/rh-exemplo/hooks/useAssiduidadeDaOrganizacao", async (importOriginal) =>
  (await import("@/test/assiduidadeDaPessoaFalso")).wrapperAssiduidadeDaOrganizacaoFalso(
    await importOriginal<typeof import("@/components/rh-exemplo/hooks/useAssiduidadeDaOrganizacao")>(),
  ));
vi.mock("@/components/rh-exemplo/hooks/useLocaisTrabalho", () => {
  const resultado = { locais: [] as never[], loading: false, recusado: false };
  return { useLocaisTrabalho: () => resultado };
});
vi.mock("@/components/rh-exemplo/hooks/useAusenciasTipos", async () => {
  const tipos = (await import("@/components/rh-exemplo/dados/catalogos")).catalogos().tiposAusencia;
  const resultado = { tipos, loading: false, recusado: false, vazio: false };
  return { useAusenciasTipos: () => resultado };
});
vi.mock("@/components/rh-exemplo/hooks/useRegrasSalariais", async (importarOriginal) => {
  const original = await importarOriginal<typeof import("@/components/rh-exemplo/hooks/useRegrasSalariais")>();
  // O limite do subsidio vem da regra salarial em vigor.
  const resultado = { versoes: [], emVigor: { subsidio_limite_min: 240 }, maisRecente: null, estado: "ok", isLoading: false };
  return { ...original, useRegrasSalariais: () => resultado };
});
vi.mock("@/components/rh-exemplo/hooks/PessoaRelatorioAssiduidadeMensalReal", () => ({ PessoaRelatorioAssiduidadeMensal: () => null }));
import { reporAssiduidadeFalsa } from "@/test/assiduidadeDaPessoaFalso";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { reporFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { lerFluxosC, reporFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import { reporBaseFalsa, semearHoras } from "@/test/horasExtraFalso";
import { FilaAlertasFimDoDia } from "@/components/rh-exemplo/fluxosB/alertas/FilaAlertasFimDoDia";
import { PainelDoDiaDePessoa } from "@/components/rh-exemplo/assiduidade/PainelDoDiaDePessoa";
import { PessoaAssiduidadeTab } from "@/components/rh-exemplo/PessoaAssiduidadeTab";
import type { PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";

const TUDO: PermissoesAssiduidade = {
  view: true, viewOwn: true, equipaView: true, picar: true, picarOutros: true, gerir: true, corrigir: true, faltasView: true,
  faltasEdit: true, justificacaoView: true, justificacaoEdit: true, validarRealizado: true, obrasRegistar: false,
};

const envolver = (conteudo: JSX.Element) => render(<LanguageProvider><MemoryRouter>{conteudo}</MemoryRouter></LanguageProvider>);
const aba = (souAPessoa: boolean, abaAberta = "calendario") =>
  envolver(<PessoaAssiduidadeTab pessoaId="p-sofia" pessoaNome="Sofia Rebelo" souAPessoa={souAPessoa} permissoes={TUDO} aba={abaAberta} />);
const painelDoDia = (souAPessoa: boolean, data: string) =>
  envolver(
    <PainelDoDiaDePessoa
      pessoaId="p-sofia" pessoaNome="Sofia Rebelo" data={data} souAPessoa={souAPessoa} locais={[]} permissoes={TUDO} onFechar={() => undefined}
    />,
  );

const celula = (iso: string): HTMLElement => document.getElementById(`cal-dia-${iso}`) as HTMLElement;
/** Todo o botão da página (incluindo painéis abertos) cujo nome fala em corrigir ou em pedir justificação. */
const botoesDeCorrecao = (): HTMLElement[] =>
  screen.queryAllByRole("button", { name: /corrigir|pedir justificação|marcar falta|aceitar diferença|lançar picagem/i, hidden: true });

beforeAll(() => {
  // O Radix Select e o ResizeObserver precisam de APIs que o jsdom não traz.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T12:00:00"));
  window.localStorage.setItem("language", "pt");
  repor();
  reporGestao();
  reporFluxosB();
  reporFluxosC();
  reporBaseFalsa();
  semearHoras(lerFluxosC().horasExtra);
  reporAssiduidadeFalsa();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("vista da própria pessoa: nunca «Corrigir»", () => {
  it("o calendário e o painel do dia não têm Corrigir nem Pedir justificação, em nenhum dia", () => {
    aba(true);
    for (const dia of ["2026-10-06", "2026-10-08", "2026-10-13", "2026-10-20"]) {
      fireEvent.click(celula(dia));
      const detalhe = screen.getByTestId("rhcal-detalhe");
      expect(within(detalhe).queryByRole("button", { name: /Corrigir|justificação|Ver o registo/ })).not.toBeInTheDocument();
      expect(botoesDeCorrecao()).toEqual([]);
      fireEvent.keyDown(detalhe, { key: "Escape" });
    }
  });

  it("um dia sem picagem em falta é só leitura: não há ação nenhuma no painel, só o fechar", () => {
    aba(true);
    fireEvent.click(celula("2026-10-06"));
    const detalhe = screen.getByTestId("rhcal-detalhe");
    expect(within(detalhe).getByText("Entrada 09:00")).toBeInTheDocument();
    expect(within(detalhe).queryByTestId("rhcal-justificacao")).not.toBeInTheDocument();
    expect(within(detalhe).queryByRole("button", { name: "Justificar" })).not.toBeInTheDocument();
  });

  it("a Picar e a aba Justificações também não têm Corrigir", () => {
    const { unmount } = aba(true, "picar");
    expect(screen.getByRole("tab", { name: /Picar/ })).toBeInTheDocument();
    expect(botoesDeCorrecao()).toEqual([]);
    unmount();
    aba(true, "justificacoes");
    // A justificação de uma falha de marcação faz-se no detalhe do dia do calendário (formulário real, na base): a aba só as lista.
    expect(screen.getByRole("tab", { name: /Justificações/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Justificar" })).not.toBeInTheDocument();
    expect(botoesDeCorrecao()).toEqual([]);
  });

  it("o painel do dia da própria pessoa, mesmo com a conta cheia de permissões, não corrige, anula nem marca falta", async () => {
    painelDoDia(true, "2026-10-06");
    expect(await screen.findByText("Picagens")).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(botoesDeCorrecao()).toEqual([]);
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Consolidar/ })).not.toBeInTheDocument();
  });

});

describe("vista do RH: corrige, pede justificação, marca falta e aceita a diferença", () => {
  it("o painel do calendário tem «Corrigir ou pedir justificação» e não tem «Justificar»", () => {
    aba(false);
    fireEvent.click(celula("2026-10-13"));
    const detalhe = screen.getByTestId("rhcal-detalhe");
    expect(within(detalhe).getByRole("button", { name: /Corrigir ou pedir justificação/ })).toBeInTheDocument();
    expect(within(detalhe).queryByRole("button", { name: "Justificar" })).not.toBeInTheDocument();
  });

  it("o painel do dia do RH tem Corrigir nas picagens e nas horas realizadas", async () => {
    painelDoDia(false, "2026-10-06");
    expect(await screen.findByText("Picagens")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Corrigir" }).length).toBeGreaterThan(0));
    expect(screen.getAllByRole("button", { name: "Anular" }).length).toBeGreaterThan(0);
  });

  it("a fila de fim do dia (desvios reais) tem Corrigir, Marcar falta e Anular, e já não tem Pedir justificação nem Aceitar diferença", () => {
    const base = { organization_id: "org", pessoa_id: "pessoa-real", data: "2026-10-13", planeado_id: null, local_id: null, detalhe: null };
    envolver(
      <FilaAlertasFimDoDia
        desvios={[
          { ...base, tipo: "planeado_sem_realizado", hora_inicio: "09:00:00", hora_fim: "13:00:00", minutos: 240, referencia_id: null },
          { ...base, tipo: "realizado_sem_planeado", hora_inicio: "14:00:00", hora_fim: "16:00:00", minutos: 120, referencia_id: "real-1" },
          { ...base, tipo: "falta_coberta_por_ausencia", hora_inicio: "09:00:00", hora_fim: "13:00:00", minutos: 240, referencia_id: "aus-1" },
        ]}
        nomePorPessoaId={new Map([["pessoa-real", "Pessoa Real"]])}
        locais={[]}
        permissoes={TUDO}
        onAlterado={() => undefined}
      />,
    );
    for (const nome of ["Corrigir", "Marcar falta", /Anular/]) {
      expect(screen.getByRole("button", { name: nome })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /Pedir justificação|Aceitar diferença/ })).not.toBeInTheDocument();
  });
});
