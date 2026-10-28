// A correção de pontos é só do RH (fluxo 5): a pessoa que se esqueceu de picar JUSTIFICA em 5 dias úteis (motivo e hora real)
// e o RH aceita ou recusa. Na vista da própria pessoa não existe «Corrigir» em lado nenhum; na do RH existe. Tudo em memória.
// A data é fixa (14/10/2026): a Sofia tem uma picagem por emparelhar a 13/10 (dentro do prazo).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
// As justificacoes do dia vivem na base: aqui a base e simulada (sem CompanyProvider e sem chamadas).
vi.mock("@/components/rh-exemplo/hooks/useJustificacoesDoDia", async () => (await import("@/test/justificacoesDoDiaFalso")).wrapperFalso());
vi.mock("@/components/rh-exemplo/hooks/usePrazoJustificacao", async () => (await import("@/test/prazoJustificacaoFalso")).wrapperFalso());

// O limite anual da pessoa vem do contrato real; aqui, sem base, vale o limite por omissão da organização.
vi.mock("@/components/rh-exemplo/fluxosC/limitePessoa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/rh-exemplo/fluxosC/limitePessoa")>()),
  useLimiteAnualMin: (_pessoaId: string, omissaoMin: number) => omissaoMin,
}));
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { definirFluxosB, lerFluxosB, reporFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { reporFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
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
    expect(screen.getByRole("button", { name: "Justificar" })).toBeInTheDocument();
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

  it("num dia com picagem em falta dentro dos 5 dias úteis só há «Justificar», e a justificação fica pendente", () => {
    aba(true);
    fireEvent.click(celula("2026-10-13"));
    const detalhe = screen.getByTestId("rhcal-detalhe");
    expect(within(detalhe).getByText(/dias úteis para justificar/)).toBeInTheDocument();
    expect(botoesDeCorrecao()).toEqual([]);
    fireEvent.click(within(detalhe).getByRole("button", { name: "Justificar" }));
    fireEvent.change(within(detalhe).getByLabelText("Hora real"), { target: { value: "18:30" } });
    fireEvent.click(within(detalhe).getByRole("button", { name: "Enviar justificação" }));
    expect(within(detalhe).getByRole("alert")).toBeInTheDocument();
    fireEvent.change(within(detalhe).getByLabelText(/Motivo/), { target: { value: "Saí de uma reunião fora do escritório" } });
    fireEvent.click(within(detalhe).getByRole("button", { name: "Enviar justificação" }));
    expect(lerFluxosB().justificacoesPicagem.find((j) => j.pessoaId === "p-sofia")).toMatchObject({ horaReal: "18:30", estado: "pendente" });
    const secao = within(screen.getByTestId("rhcal-detalhe")).getByTestId("rhcal-justificacao");
    expect(within(secao).getByText("Pendente")).toBeInTheDocument();
    expect(within(secao).getByText("Justificação (hora real 18:30):")).toBeInTheDocument();
    expect(within(secao).queryByRole("button", { name: "Justificar" })).not.toBeInTheDocument();
  });

  it("mostra a justificação recusada com o motivo da recusa", () => {
    const alerta = lerFluxosB().alertas.find((a) => a.pessoaId === "p-sofia");
    expect(alerta?.data).toBe("2026-10-13");
    definirFluxosB((atual) => ({
      ...atual,
      justificacoesPicagem: [...atual.justificacoesPicagem, {
        id: "j-teste", alertaId: alerta?.id ?? "", pessoaId: "p-sofia", horaReal: "18:00", motivo: "Esqueci-me", anexoNome: null,
        enviadaEm: "2026-10-14T09:00:00Z", estado: "recusada", decididaPor: "Marta", decididaEm: "2026-10-14T10:00:00Z", motivoRecusa: "Sem prova",
      }],
    }));
    aba(true);
    fireEvent.click(celula("2026-10-13"));
    const secao = within(screen.getByTestId("rhcal-detalhe")).getByTestId("rhcal-justificacao");
    expect(within(secao).getByText("Recusada")).toBeInTheDocument();
    expect(within(secao).getByText("Motivo da recusa: Sem prova")).toBeInTheDocument();
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
