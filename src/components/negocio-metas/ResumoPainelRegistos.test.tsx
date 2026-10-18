// O Resumo do painel de um negócio: as visitas e o levantamento DERIVAM dos registos da pessoa ligados ao negócio (nada se copia). Um negócio de
// exemplo antigo, sem registos ligados, continua a mostrar o que trazia.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ResumoPainel } from "./ResumoPainel";
import { MORADA_VAZIA } from "./moradaObra";
import type { NegocioMes, VisitaNegocio } from "./negocioMetas";
import { HOJE_EXEMPLO } from "./negocioMetasExemplo";
import { ligarRegisto, registarLevantamento, registarVisita, repor as reporRegistos } from "./registosPessoa";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) => {
        let texto = negocioMetasTranslations.pt[key] ?? key;
        Object.entries(params ?? {}).forEach(([k, v]) => { texto = texto.replace(`{${k}}`, String(v)); });
        return texto;
      },
    }),
  };
});
afterEach(() => { cleanup(); reporRegistos(); });

const negocio = (extra: Partial<NegocioMes> = {}): NegocioMes => ({
  id: "n1", pessoaId: "p1", pessoa: "Ana", servico: "Cozinha", comercial: "Ana Ribeiro", dias: 3, parado: null, proximoPrazo: null,
  contacto: { telefone: null, email: null }, orcamentos: [], proposta: null, contrato: null, ...extra,
});
const visita = (extra: Partial<VisitaNegocio> = {}) => ({
  pessoaId: "p1", data: "2026-10-10", hora: "10:00", feitoPor: "Bruno Costa", estado: "feita" as const, tipo: "levantamento" as const, quemVaiEstar: "", duracao: "",
  morada: { ...MORADA_VAZIA, rua: "Rua A 1", localidade: "Lisboa" }, igualALead: true, nota: "", ...extra,
});
const linha = { id: "l1", divisao: "cozinha", trabalho: "outro", trabalhoOutro: "Bancada", medida: "3,5", unidade: "m2", observacoes: "" };

describe("ResumoPainel: visitas e levantamento derivados dos registos ligados", () => {
  it("mostra as visitas ligadas ao negócio, e não as de outro negócio nem as por ligar", () => {
    const a = registarVisita(visita({ data: "2026-10-10" }));
    const b = registarVisita(visita({ data: "2026-10-12" }));
    registarVisita(visita({ data: "2026-10-14" }));
    ligarRegisto({ tipo: "visita", id: a.id }, "n1");
    ligarRegisto({ tipo: "visita", id: b.id }, "n-outro");
    render(<ResumoPainel negocio={negocio()} hoje={HOJE_EXEMPLO} />);
    const seccao = screen.getByRole("heading", { name: "Visitas" }).closest("section")!;
    expect(within(seccao).getAllByRole("listitem")).toHaveLength(1);
    expect(seccao).toHaveTextContent("10/10/2026");
    expect(seccao).not.toHaveTextContent("12/10/2026");
    expect(seccao).not.toHaveTextContent("14/10/2026");
  });

  it("mostra o levantamento ligado, com as linhas em texto", () => {
    const l = registarLevantamento({
      pessoaId: "p1", visitaId: null, data: "2026-10-11", feitoPor: "Bruno Costa",
      rascunho: { linhas: [linha], observacoes: "Ver canos", respostas: {} },
    });
    ligarRegisto({ tipo: "levantamento", id: l.id }, "n1");
    render(<ResumoPainel negocio={negocio()} hoje={HOJE_EXEMPLO} />);
    const seccao = screen.getByRole("heading", { name: "Levantamento" }).closest("section")!;
    expect(seccao).toHaveTextContent("Ver canos");
    expect(within(seccao).getByRole("listitem")).toHaveTextContent("Cozinha: Bancada, 3.5 m²");
    expect(seccao).toHaveTextContent("Feito");
  });

  it("um levantamento por ligar, ou ligado a outro negócio, não aparece", () => {
    registarLevantamento({ pessoaId: "p1", visitaId: null, data: "2026-10-11", feitoPor: "Ana", rascunho: { linhas: [linha], observacoes: "livre", respostas: {} } });
    const l = registarLevantamento({ pessoaId: "p1", visitaId: null, data: "2026-10-12", feitoPor: "Ana", rascunho: { linhas: [linha], observacoes: "doutro", respostas: {} } });
    ligarRegisto({ tipo: "levantamento", id: l.id }, "n-outro");
    render(<ResumoPainel negocio={negocio()} hoje={HOJE_EXEMPLO} />);
    expect(screen.queryByRole("heading", { name: "Levantamento" })).not.toBeInTheDocument();
  });

  it("um negócio antigo sem registos ligados continua a mostrar as visitas e o levantamento que trazia (os de exemplo)", () => {
    const antigo = negocio({
      visitas: [{ ...visita(), id: "v1" }],
      levantamento: { data: "2026-10-11", feitoPor: "Ana", estado: "feito", observacoes: "do exemplo", linhas: [] },
    });
    render(<ResumoPainel negocio={antigo} hoje={HOJE_EXEMPLO} />);
    expect(screen.getByRole("heading", { name: "Visitas" })).toBeInTheDocument();
    expect(screen.getByText("do exemplo")).toBeInTheDocument();
  });

  it("com registos ligados mandam estes: o que o negócio antigo trazia não se junta (sem fonte dupla)", () => {
    const a = registarVisita(visita({ data: "2026-10-10" }));
    ligarRegisto({ tipo: "visita", id: a.id }, "n1");
    const antigo = negocio({ visitas: [{ ...visita({ data: "2026-09-01" }), id: "v1" }] });
    render(<ResumoPainel negocio={antigo} hoje={HOJE_EXEMPLO} />);
    const seccao = screen.getByRole("heading", { name: "Visitas" }).closest("section")!;
    expect(within(seccao).getAllByRole("listitem")).toHaveLength(1);
    expect(seccao).not.toHaveTextContent("01/09/2026");
  });

  it("sem nada, não há secção de visitas nem de levantamento", () => {
    render(<ResumoPainel negocio={negocio()} hoje={HOJE_EXEMPLO} />);
    expect(screen.queryByRole("heading", { name: "Visitas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Levantamento" })).not.toBeInTheDocument();
  });
});
