// A faixa «X pessoas saem nos próximos 30 dias com Y itens por devolver → ver»: só com X > 0, com as contagens (também sem acesso completo),
// no singular e no plural, e «ver» como botão (dentro dos Ativos) ou ligação (a partir do RH). Uma recusa ou um defeito não mostram nada.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";

const m = vi.hoisted(() => ({ leitura: {} as Record<string, unknown>, chamadas: vi.fn() }));
vi.mock("@/hooks/ativos/useAtivosPorDevolver", () => ({
  useAtivosPorDevolver: (o: unknown) => { m.chamadas(o); return m.leitura; },
}));

import { FaixaPorDevolver } from "./FaixaPorDevolver";

const dados = (totalPessoas: number, totalItens: number, detalhe = false) => ({ hoje: "2026-11-27", dias: 30, detalhe, totalPessoas, totalItens, pessoas: [] });
const leitura = (p: Record<string, unknown>) => { m.leitura = { estado: "ok", dados: dados(2, 5), mensagem: null, aAtualizar: false, refazer: vi.fn(), ...p }; };

function ver(props: Partial<Parameters<typeof FaixaPorDevolver>[0]> = {}) {
  return render(
    <LanguageProvider>
      <MemoryRouter><FaixaPorDevolver organizationId="org-1" {...props} /></MemoryRouter>
    </LanguageProvider>,
  );
}

beforeEach(() => { window.localStorage.setItem("language", "pt"); m.chamadas.mockClear(); leitura({}); });
afterEach(cleanup);

describe("FaixaPorDevolver", () => {
  it("pede 30 dias (e a pessoa, quando é a da ficha) e diz quantas pessoas saem com quantos itens", () => {
    ver({ pessoaId: "p1" });
    expect(m.chamadas).toHaveBeenLastCalledWith(expect.objectContaining({ organizationId: "org-1", pessoaId: "p1", dias: 30 }));
    const faixa = screen.getByRole("status");
    expect(faixa.textContent).toContain("2 pessoas saem nos próximos 30 dias com 5 itens por devolver");
  });

  it("no singular", () => {
    leitura({ dados: dados(1, 1) });
    ver();
    expect(screen.getByRole("status").textContent).toContain("1 pessoa sai nos próximos 30 dias com 1 item por devolver");
  });

  it("funciona só com contagens (detalhe false): a faixa aparece na mesma", () => {
    leitura({ dados: dados(3, 4, false) });
    ver();
    expect(screen.getByRole("status").textContent).toContain("3 pessoas saem");
  });

  it("não mostra nada com X = 0, a carregar, recusado, indisponível ou erro", () => {
    for (const p of [{ dados: dados(0, 0) }, { estado: "a_carregar", dados: null }, { estado: "recusado", dados: null }, { estado: "indisponivel", dados: null }, { estado: "erro", dados: null, mensagem: "x" }]) {
      leitura(p);
      const { container } = ver();
      expect(container.textContent).toBe("");
      cleanup();
    }
  });

  it("com `aoVer` o «Ver» é um botão que chama-o; com `hrefVer` é uma ligação", () => {
    const aoVer = vi.fn();
    ver({ aoVer });
    fireEvent.click(screen.getByRole("button", { name: "Ver quem sai e o que falta devolver" }));
    expect(aoVer).toHaveBeenCalledTimes(1);
    cleanup();
    ver({ hrefVer: "/ativos?aba=saidas" });
    expect(screen.getByRole("link", { name: "Ver quem sai e o que falta devolver" }).getAttribute("href")).toBe("/ativos?aba=saidas");
  });

  it("sem `aoVer` nem `hrefVer` (sem acesso aos Ativos) fica só o texto", () => {
    ver();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("respeita `enabled` falso (não pede nada)", () => {
    ver({ enabled: false });
    expect(m.chamadas).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  });
});
