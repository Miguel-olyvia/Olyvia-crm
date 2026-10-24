// Registos e atividade da ficha real: contacto sem resultado, motivo ao encerrar.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AtividadeFicha } from "./AtividadeFicha";
import { contactoBase } from "./fabricaTestes";
import type { ItemAtividade } from "./pessoasTipos";
import { SeccaoRegistos } from "./SeccaoRegistos";

vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos = pessoasPaginaTranslations.pt;
  const t = (key: string, params?: Record<string, string | number>) =>
    Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key);
  return { useTranslation: () => ({ language: "pt", t }) };
});

describe("SeccaoRegistos: contacto sem resultado", () => {
  it("mostra a chamada com o texto neutro (nunca a chave nem «null»)", () => {
    render(<SeccaoRegistos contactos={[contactoBase("c1", { resultado: null })]} levantamentos={[]} negocios={new Map()} />);
    expect(screen.getByText(/Resultado não indicado/)).toBeInTheDocument();
    expect(screen.queryByText(/pessoasPagina\.result|null/)).toBeNull();
  });

  it("um resultado conhecido continua a mostrar o seu texto", () => {
    render(<SeccaoRegistos contactos={[contactoBase("c1", { resultado: "naoAtendeu" })]} levantamentos={[]} negocios={new Map()} />);
    expect(screen.getByText(/Não atendeu/)).toBeInTheDocument();
  });
});

describe("AtividadeFicha: motivo ao encerrar", () => {
  const item = (extra: Partial<ItemAtividade>): ItemAtividade => ({
    id: "i", pessoaId: "a", tipo: "historico", titulo: "", chaveTitulo: "pessoasPagina.close.activity.closed", detalhe: "", quando: "2026-10-12", exemplo: false, ...extra,
  });

  it("mostra o motivo traduzido", () => {
    render(<AtividadeFicha itens={[item({ chaveMotivo: "pessoasPagina.lost.preco" })]} hoje="2026-10-13" />);
    expect(screen.getByText(/Preço/)).toBeInTheDocument();
  });

  it("com «outro» mostra o motivo e o texto escrito, juntos", () => {
    render(<AtividadeFicha itens={[item({ chaveMotivo: "pessoasPagina.close.reason.other", detalhe: "Mudou de casa" })]} hoje="2026-10-13" />);
    const linha = screen.getByText(/Mudou de casa/);
    expect(linha.textContent).toMatch(/Outro.*Mudou de casa|Mudou de casa/);
    expect(linha.textContent).toContain("Mudou de casa");
    expect(linha.textContent).toMatch(/Outro/i);
  });

  it("sem motivo mostra só o detalhe, como antes", () => {
    render(<AtividadeFicha itens={[item({ chaveTitulo: undefined, titulo: "Reunião", detalhe: "Na obra" })]} hoje="2026-10-13" />);
    expect(screen.getByText("Na obra")).toBeInTheDocument();
  });
});
