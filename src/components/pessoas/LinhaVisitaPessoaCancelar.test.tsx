// LinhaVisitaPessoa: «Cancelar visita» (com confirmação) e quando se pode alterar ou cancelar: uma visita feita, com resultado ou já cancelada
// não se altera nem se cancela; uma ligada a um negócio ainda se cancela (a base decide) mas não se altera.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos = pessoasPaginaTranslations.pt;
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});
const { sucesso } = vi.hoisted(() => ({ sucesso: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: sucesso } }));
vi.mock("@/hooks/pessoas/useAgendaVisita", () => ({
  useAgendaVisita: () => ({ quadros: [], recursos: [], isLoading: false, isError: false, refetch: vi.fn(), omissao: { boardId: null, recursoId: null } }),
}));
vi.mock("@/hooks/pessoas/useAcoesVisita", () => ({
  useAcoesVisita: () => ({ marcar: vi.fn(), alterar: vi.fn(), cancelar: vi.fn(), resultado: vi.fn() }),
}));
vi.mock("@/hooks/pessoas/useConflitoVisita", () => ({ useConflitoVisita: () => ({ emConflito: [], aVerificar: false, falhou: false }) }));

import { LinhaVisitaPessoa } from "./LinhaVisitaPessoa";
import { idLinhaVisita } from "./focoVisita";
import { pessoaBase, visitaPessoaBase } from "./fabricaTestes";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";

beforeAll(prepararRadixNoJsdom);

const ANA = pessoaBase("a", { nome: "Ana", morada: { linha: "Rua A 1", cp: "1000-001", localidade: "Lisboa" } });
const HOJE = "2026-10-13";

function montar(visita: VisitaPessoa, extra: Partial<Parameters<typeof LinhaVisitaPessoa>[0]> = {}) {
  const cancelarVisita = vi.fn().mockResolvedValue(undefined);
  render(
    <ul>
      <LinhaVisitaPessoa pessoa={ANA} visita={visita} hoje={HOJE} aoRegistarResultado={vi.fn()} cancelarVisita={cancelarVisita} naBase {...extra} />
    </ul>,
  );
  return { cancelarVisita };
}
const botaoCancelar = () => screen.queryByRole("button", { name: /^Cancelar visita/ });
const botaoAlterar = () => screen.queryByRole("button", { name: /^Alterar visita/ });

describe("LinhaVisitaPessoa: Cancelar visita", () => {
  it("uma visita por fazer e sem resultado tem «Cancelar visita», com nome único (dia, hora e pessoa)", () => {
    montar(visitaPessoaBase("rv-1", { data: "2026-10-20" }));
    const botao = botaoCancelar();
    expect(botao).not.toBeNull();
    expect(botao?.getAttribute("aria-label")).toMatch(/^Cancelar visita: .*20\/10\/2026.* \(Ana\)$/);
  });

  it("carregar abre a confirmação; confirmar cancela a visita certa e fecha", async () => {
    const { cancelarVisita } = montar(visitaPessoaBase("rv-7", { data: "2026-10-20" }));
    fireEvent.click(botaoCancelar() as HTMLElement);
    const dialogo = screen.getByRole("alertdialog", { name: "Cancelar esta visita?" });
    expect(dialogo).toHaveTextContent("A visita de Ana");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar a visita" }));
    expect(cancelarVisita).toHaveBeenCalledExactlyOnceWith("rv-7");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(sucesso).toHaveBeenCalledWith("Visita de Ana cancelada");
  });

  it("«Voltar» na confirmação não cancela nada", () => {
    const { cancelarVisita } = montar(visitaPessoaBase("rv-1", { data: "2026-10-20" }));
    fireEvent.click(botaoCancelar() as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(cancelarVisita).not.toHaveBeenCalled();
  });

  it("uma visita feita não se cancela nem se altera", () => {
    montar(visitaPessoaBase("rv-1", { estado: "feita", data: "2026-10-10" }));
    expect(botaoCancelar()).toBeNull();
    expect(botaoAlterar()).toBeNull();
  });

  it("uma visita cancelada não se cancela outra vez nem se altera", () => {
    montar(visitaPessoaBase("rv-1", { estado: "cancelada" }));
    expect(botaoCancelar()).toBeNull();
    expect(botaoAlterar()).toBeNull();
    expect(screen.getByText("Cancelada")).toBeInTheDocument();
  });

  it("uma visita com resultado já não se cancela nem se altera", () => {
    montar(visitaPessoaBase("rv-1", { data: "2026-10-20", resultado: "aPensar" }));
    expect(botaoCancelar()).toBeNull();
    expect(botaoAlterar()).toBeNull();
  });

  it("uma visita ligada a um negócio já não se altera, mas ainda se cancela (a base recusa se o negócio estiver fechado)", () => {
    montar(visitaPessoaBase("rv-1", { data: "2026-10-20", negocioId: "n1" }), { negocio: "Cozinha" });
    expect(botaoAlterar()).toBeNull();
    expect(botaoCancelar()).not.toBeNull();
  });

  it("sem a ação de cancelar (o exemplo) o botão não existe", () => {
    montar(visitaPessoaBase("rv-1", { data: "2026-10-20" }), { cancelarVisita: undefined, naBase: false });
    expect(botaoCancelar()).toBeNull();
  });
});

describe("LinhaVisitaPessoa: Alterar visita", () => {
  it("na base, uma visita por fazer e por ligar altera-se mesmo sem a ação de exemplo", () => {
    montar(visitaPessoaBase("rv-1", { data: "2026-10-20" }), { alterarVisita: undefined });
    expect(botaoAlterar()).not.toBeNull();
  });

  it("sem a ação de exemplo e fora da base não há «Alterar visita»", () => {
    montar(visitaPessoaBase("rv-1", { data: "2026-10-20" }), { alterarVisita: undefined, naBase: false });
    expect(botaoAlterar()).toBeNull();
  });

  it("uma visita com resultado não se altera, mesmo por fazer", () => {
    montar(visitaPessoaBase("rv-1", { data: "2026-10-20", resultado: "interessado" }), { alterarVisita: vi.fn(), naBase: false });
    expect(botaoAlterar()).toBeNull();
  });
});

describe("LinhaVisitaPessoa: o foco depois de cancelar", () => {
  it("se a ficha refaz-se e a visita passa a Cancelada ANTES de o diálogo fechar (o botão e a condição de cancelar desaparecem), o foco vai para a linha na mesma", async () => {
    const aoRegistarResultado = vi.fn();
    const linha = (v: VisitaPessoa, cancelarVisita: (id: string) => Promise<void>) => (
      <ul><LinhaVisitaPessoa pessoa={ANA} visita={v} hoje={HOJE} aoRegistarResultado={aoRegistarResultado} cancelarVisita={cancelarVisita} naBase /></ul>
    );
    const porFazer = visitaPessoaBase("rv-9", { data: "2026-10-20" });
    const cancelada = visitaPessoaBase("rv-9", { data: "2026-10-20", estado: "cancelada" });
    let refazer: () => void = () => {};
    const cancelarVisita = vi.fn(async () => { refazer(); });
    const { rerender } = render(linha(porFazer, cancelarVisita));
    refazer = () => act(() => { rerender(linha(cancelada, cancelarVisita)); });
    fireEvent.click(botaoCancelar() as HTMLElement);
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancelar a visita" }));
    await waitFor(() => expect(screen.getByText("Cancelada")).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(idLinhaVisita("rv-9"))));
  });
});

describe("LinhaVisitaPessoa: foco", () => {
  it("a linha tem um id estável e pode receber foco por código (para onde o foco volta quando o botão desaparece)", () => {
    montar(visitaPessoaBase("rv-3", { data: "2026-10-20" }));
    const linha = document.getElementById(idLinhaVisita("rv-3"));
    expect(linha).not.toBeNull();
    expect(linha?.tagName).toBe("LI");
    expect(linha).toHaveAttribute("tabindex", "-1");
  });
});
