// A visita diz que houve levantamento nela; o levantamento NÃO diz a visita (só a data, quem fez, as linhas e o negócio).
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { levantamentoBase, pessoaBase, visitaPessoaBase } from "./fabricaTestes";
import { SeccaoRegistos } from "./SeccaoRegistos";
import { SeccaoVisitas } from "./SeccaoVisitas";
import { SeccaoVisitasPorFechar } from "./SeccaoVisitasPorFechar";

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

const ANA = pessoaBase("a", { nome: "Ana" });
const NEGOCIOS = new Map([["n1", "Cozinha"]]);
const COM = visitaPessoaBase("rv-1", { estado: "feita", data: "2026-10-10", negocioId: "n1" });
const SEM = visitaPessoaBase("rv-2", { estado: "porFazer", data: "2026-10-22" });

const montar = (comLevantamento?: ReadonlySet<string>) => render(
  <SeccaoVisitas
    pessoa={ANA} visitas={[COM, SEM]} item={undefined} hoje="2026-10-13" negocios={NEGOCIOS} aoRegistarResultado={vi.fn()}
    comLevantamento={comLevantamento}
  />,
);

describe("a visita diz que houve levantamento", () => {
  it("só a visita onde se fez o levantamento o diz", () => {
    montar(new Set(["rv-1"]));
    expect(screen.getAllByText("Levantamento feito nesta visita")).toHaveLength(1);
    const linhas = screen.getAllByRole("listitem");
    expect(linhas.filter((l) => l.textContent?.includes("Levantamento feito nesta visita"))).toHaveLength(1);
  });

  it("sem a informação (a ficha real não a passa), nenhuma visita o diz", () => {
    montar();
    expect(screen.queryByText("Levantamento feito nesta visita")).not.toBeInTheDocument();
  });
});

describe("o levantamento não mostra a visita", () => {
  it("mesmo com visitaId, a linha do levantamento não fala de visita", () => {
    render(<SeccaoRegistos contactos={[]} levantamentos={[levantamentoBase("rl-1", { visitaId: "rv-1", negocioId: "n1" })]} negocios={NEGOCIOS} />);
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("Levantamento");
    expect(item.textContent ?? "").not.toMatch(/visita/i);
  });
});

describe("a visita por fechar do Resumo diz o mesmo que a aba Visitas", () => {
  const VELHA = visitaPessoaBase("rv-3", { estado: "porFazer", data: "2026-10-01", negocioId: "n1" });
  const porFechar = (comLevantamento?: ReadonlySet<string>) => render(
    <SeccaoVisitasPorFechar
      pessoa={ANA} porFechar={[VELHA]} visitas={[VELHA]} item={undefined} hoje="2026-10-13" negocios={NEGOCIOS}
      aoRegistarResultado={vi.fn()} comLevantamento={comLevantamento}
    />,
  );

  it("a visita por fechar onde se fez o levantamento di-lo", () => {
    porFechar(new Set(["rv-3"]));
    expect(screen.getAllByText("Levantamento feito nesta visita")).toHaveLength(1);
  });

  it("sem a informação, a visita por fechar não o diz", () => {
    porFechar();
    expect(screen.queryByText("Levantamento feito nesta visita")).not.toBeInTheDocument();
  });
});
