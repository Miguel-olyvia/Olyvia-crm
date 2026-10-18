// «Próximo passo e prazo» da ficha: lido dos registos da pessoa (o próximo contacto e a hora vêm do resumo), e o estado «Abordagem encerrada»
// com o resultado, o motivo e o dia.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { contactoBase, pessoaBase, registosBase, resumoBase, visitaPessoaBase } from "./fabricaTestes";
import { SeccaoPasso } from "./SeccoesResumo";
import type { Pessoa } from "./pessoasTipos";

vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  const textos: Record<string, string> = { ...negocioMetasTranslations.pt, ...pessoasPaginaTranslations.pt };
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});

const HOJE = "2026-10-13";
const resumo = (extra: Partial<Pessoa> = {}, registos = registosBase({ contactos: [contactoBase()] })) =>
  resumoBase(pessoaBase("a", extra), [], HOJE, "lead", registos);

describe("SeccaoPasso", () => {
  it("diz o passo dos registos, a explicação e o prazo", () => {
    render(<SeccaoPasso resumo={resumo({ proximoContacto: "2026-10-20" })} hoje={HOJE} />);
    expect(screen.getByText("Marcar a visita")).toBeInTheDocument();
    expect(screen.getByText(/Combinar o dia e a hora/)).toBeInTheDocument();
  });

  it("o prazo leva a hora da visita quando é a visita o próximo contacto", () => {
    const registos = registosBase({ visitas: [visitaPessoaBase("rv-1", { data: "2026-10-20", hora: "14:30" })] });
    render(<SeccaoPasso resumo={resumo({ proximoContacto: null }, registos)} hoje={HOJE} />);
    expect(screen.getByText(/14:30/)).toBeInTheDocument();
  });

  it("uma abordagem encerrada diz o resultado, o motivo e o dia, e não tem passo", () => {
    const encerrada = { resultado: "semInteresse" as const, motivo: "preco" as const, data: "2026-10-10" };
    render(<SeccaoPasso resumo={resumo({ encerrada })} hoje={HOJE} />);
    expect(screen.getByText(/Abordagem encerrada · Sem interesse · .+ · 10\/10\/2026/)).toBeInTheDocument();
    expect(screen.queryByText("Marcar a visita")).not.toBeInTheDocument();
  });

  it("o motivo «Outro» mostra o texto escrito", () => {
    const encerrada = { resultado: "obraInviavel" as const, motivo: "outro" as const, motivoOutro: "Prédio em ruínas", data: "2026-10-10" };
    render(<SeccaoPasso resumo={resumo({ encerrada })} hoje={HOJE} />);
    expect(screen.getByText(/Obra inviável · Prédio em ruínas/)).toBeInTheDocument();
  });

  it("sem passo (uma pessoa com negócios só terminados) diz que não há próximo passo", () => {
    const fechado = { ...resumoBase(pessoaBase("a"), [], HOJE, "lead", registosBase()), parte: "nenhuma" as const, proximo: { id: "nenhum" as const, prazo: null } };
    render(<SeccaoPasso resumo={fechado} hoje={HOJE} />);
    expect(screen.getByText("Sem próximo passo")).toBeInTheDocument();
  });
});
