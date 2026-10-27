// Arranque do calendario do mes da pessoa, na aba Assiduidade: abre, ve o mes, clica num dia, confirma uma hora
// extra e o dia atualiza; e so quem tem banco de horas ve saldo. A data e fixa (14/10/2026) para os dados serem os mesmos.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// As justificacoes do dia vivem na base: aqui a base e simulada (sem CompanyProvider e sem chamadas).
vi.mock("@/components/rh-exemplo/hooks/useJustificacoesDoDia", async () => (await import("@/test/justificacoesDoDiaFalso")).wrapperFalso());

// O limite anual da pessoa vem do contrato real; aqui, sem base, vale o limite por omissão da organização.
vi.mock("@/components/rh-exemplo/fluxosC/limitePessoa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/rh-exemplo/fluxosC/limitePessoa")>()),
  useLimiteAnualMin: (_pessoaId: string, omissaoMin: number) => omissaoMin,
}));
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { reporFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { lerFluxosC, reporFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import { PessoaAssiduidadeTab } from "@/components/rh-exemplo/PessoaAssiduidadeTab";
import type { PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";
import { rhExemploCalendarioTranslations } from "@/translations/rhExemploCalendario";

const TUDO: PermissoesAssiduidade = {
  view: true, viewOwn: true, equipaView: true, picar: false, picarOutros: false, gerir: true, corrigir: true, faltasView: true,
  faltasEdit: true, justificacaoView: true, justificacaoEdit: true, validarRealizado: true, obrasRegistar: false,
};

function abrir(pessoaId: string, nome: string, souAPessoa = false) {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <PessoaAssiduidadeTab pessoaId={pessoaId} pessoaNome={nome} souAPessoa={souAPessoa} permissoes={TUDO} />
      </MemoryRouter>
    </LanguageProvider>,
  );
}

const celula = (iso: string): HTMLElement => document.getElementById(`cal-dia-${iso}`) as HTMLElement;
const celulas = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[id^="cal-dia-"]'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T12:00:00"));
  window.localStorage.setItem("language", "pt");
  repor();
  reporGestao();
  reporFluxosB();
  reporFluxosC();
});

afterEach(() => vi.useRealTimers());

describe("traducoes do calendario", () => {
  it("en e pt tem exactamente as mesmas chaves", () => {
    const { en, pt } = rhExemploCalendarioTranslations;
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });
});

describe("o calendario do mes na aba Assiduidade", () => {
  it("abre em Outubro, com uma celula por dia e os totais no cabecalho", () => {
    abrir("p-sofia", "Sofia Rebelo");
    expect(screen.getByRole("heading", { name: "Calendário do mês" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /outubro de 2026/i })).toBeInTheDocument();
    expect(celulas()).toHaveLength(31);
    expect(screen.getByTestId("rhcal-previstas")).toHaveTextContent("Previstas");
    expect(screen.getByTestId("rhcal-extra")).toHaveTextContent("Horas extra");
    expect(screen.getByTestId("rhcal-faltas")).toHaveTextContent("Faltas");
  });

  it("cada dia mostra o previsto: horario, feriado, ausencia e folga", () => {
    abrir("p-sofia", "Sofia Rebelo");
    expect(celula("2026-10-06")).toHaveTextContent("09:00–18:00 · pausa de 1 h");
    expect(celula("2026-10-05")).toHaveTextContent("Feriado · Implantação da República");
    expect(celula("2026-10-10")).toHaveTextContent("Não trabalha");
    expect(celula("2026-10-16")).toHaveTextContent("exceção do dia");
    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(celulas()).toHaveLength(30);
    expect(celula("2026-09-15")).toHaveTextContent("Ausência aprovada · Férias");
  });

  it("os chips dizem a diferenca com texto, nao so com cor", () => {
    abrir("p-sofia", "Sofia Rebelo");
    expect(celula("2026-10-06")).toHaveTextContent("+1 h 30 min · hora extra pendente");
    expect(celula("2026-10-08")).toHaveTextContent("Atraso de 12 min");
    expect(celula("2026-10-08")).toHaveTextContent("−12 min · falta sugerida");
    expect(celula("2026-10-09")).toHaveTextContent(/hora extra acima do limite/i);
  });

  it("clicar num dia abre o detalhe com o previsto, as picagens e as horas extra do dia", () => {
    abrir("p-sofia", "Sofia Rebelo");
    fireEvent.click(celula("2026-10-06"));
    const detalhe = screen.getByTestId("rhcal-detalhe");
    expect(within(detalhe).getByText("Previsto")).toBeInTheDocument();
    expect(within(detalhe).getByText("Entrada 09:00")).toBeInTheDocument();
    expect(within(detalhe).getByText("Saída 19:30")).toBeInTheDocument();
    expect(within(detalhe).getByText("saiu às 19:30")).toBeInTheDocument();
    expect(within(detalhe).getByRole("button", { name: /Corrigir ou pedir justificação/ })).toBeInTheDocument();
  });

  it("confirmar uma hora extra no detalhe atualiza o dia", () => {
    abrir("p-sofia", "Sofia Rebelo");
    fireEvent.click(celula("2026-10-06"));
    fireEvent.click(within(screen.getByTestId("rhcal-detalhe")).getByRole("button", { name: /Confirmar hora extra de 1 h 30 min/ }));
    const dialogo = screen.getAllByRole("dialog").at(-1) as HTMLElement;
    fireEvent.click(within(dialogo).getByRole("button", { name: "Confirmar" }));
    expect(lerFluxosC().horasExtra.find((h) => h.id === "he-sofia-2026-10-06")?.estado).toBe("confirmada");
    expect(celula("2026-10-06")).toHaveTextContent("hora extra confirmada");
    expect(within(screen.getByTestId("rhcal-detalhe")).queryByRole("button", { name: /Confirmar hora extra/ })).not.toBeInTheDocument();
  });

  it("as setas passam de dia para dia e de semana para semana", () => {
    abrir("p-sofia", "Sofia Rebelo");
    celula("2026-10-06").focus();
    fireEvent.keyDown(celula("2026-10-06"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(celula("2026-10-07"));
    fireEvent.keyDown(celula("2026-10-07"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(celula("2026-10-14"));
  });

  it("«Hoje» volta ao mes corrente", () => {
    abrir("p-sofia", "Sofia Rebelo");
    fireEvent.click(screen.getByRole("button", { name: "Mês seguinte" }));
    expect(celulas()).toHaveLength(30);
    fireEvent.click(screen.getByRole("button", { name: "Hoje" }));
    expect(celulas()).toHaveLength(31);
  });
});

describe("o banco de horas so aparece para quem tem horario de banco de horas", () => {
  it("uma pessoa de horario padrao nao ve saldo, nem movimentos, nem a palavra banco", () => {
    abrir("p-sofia", "Sofia Rebelo");
    expect(screen.queryByTestId("rhcal-saldo")).not.toBeInTheDocument();
    for (const mes of [0, 1]) {
      expect(document.body.textContent).not.toMatch(/banco de horas/i);
      if (mes === 0) fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    }
    fireEvent.click(celula("2026-09-03"));
    expect(within(screen.getByTestId("rhcal-detalhe")).queryByText("Banco de horas neste dia")).not.toBeInTheDocument();
  });

  it("uma pessoa com banco ve o saldo e os creditos e debitos do mes", () => {
    abrir("p-rui", "Rui Amaral");
    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(screen.getByTestId("rhcal-saldo")).toHaveTextContent("Saldo do banco de horas");
    expect(screen.getByTestId("rhcal-saldo")).toHaveTextContent(/^Saldo do banco de horas\+/);
    expect(celula("2026-09-04")).toHaveTextContent("+1 h · crédito no banco de horas");
    expect(celula("2026-09-18")).toHaveTextContent("−8 h · débito no banco de horas");
    fireEvent.click(celula("2026-09-18"));
    expect(within(screen.getByTestId("rhcal-detalhe")).getByText(/Folga gozada por banco de horas/)).toBeInTheDocument();
  });
});

describe("os cinco tipos de horario no calendario", () => {
  it("repartido, isencao e livre dizem o que lhes e proprio", () => {
    abrir("p-hugo", "Hugo Teixeira");
    expect(celula("2026-10-06")).toHaveTextContent("11:00–15:00 · 19:00–23:00");
    cleanup();
    abrir("p-marta", "Marta Figueiredo");
    expect(celula("2026-10-06")).toHaveTextContent("Isenção de horário · 8 h por dia");
    expect(celula("2026-10-06")).toHaveTextContent("Cumprido, sem picagens (isenção)");
    cleanup();
    abrir("p-ines", "Inês Cardoso");
    expect(celula("2026-10-06")).toHaveTextContent("Horário livre · 40 h na semana");
    fireEvent.click(celula("2026-10-06"));
    expect(within(screen.getByTestId("rhcal-detalhe")).getByText(/Semana de .* feitas de 40 h previstas/)).toBeInTheDocument();
  });
});
