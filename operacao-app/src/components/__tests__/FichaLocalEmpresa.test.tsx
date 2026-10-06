import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FichaLocal from "../FichaLocal";

vi.mock("../../lib/obras", () => ({
  fichaLocalDaObra: vi.fn(async () => ({
    piso: "2.º",
    tem_elevador: true,
    tipologia: "T3",
    habitada_durante_obra: true,
    organization_id: "org-1",
    extra: { horario: "noite", credenciacao: true, antigo: "x" },
  })),
  areasDaVisitaDoOrcamento: vi.fn(async () => []),
}));

vi.mock("../../lib/camposEmpresa", async () => {
  const { combinarFicha: combinar } = await import("../../domain/campos/definicoes");
  return {
    camposLocalDaEmpresa: vi.fn(async () =>
      combinar("local", [
        { chave: "habitada_durante_obra", sistema: true, rotulo: "Loja aberta ao público" },
        { chave: "tipologia", sistema: true, ativo: false },
        { chave: "horario", sistema: false, tipo: "escolha", rotulo: "Horário",
          opcoes: [{ valor: "dia", rotulo: "Dia" }, { valor: "noite", rotulo: "Só à noite" }] },
        { chave: "credenciacao", sistema: false, tipo: "sim_nao", rotulo: "Exige credenciação" },
      ])),
  };
});

describe("FichaLocal — campos da empresa", () => {
  it("mostra os 'Outros dados', os rótulos da empresa e esconde o que a empresa escondeu", async () => {
    render(<FichaLocal obraId="o-empresa" />);
    expect(await screen.findByTestId("ficha-local-outros")).toBeInTheDocument();
    expect(screen.getByText("Horário")).toBeInTheDocument();
    expect(screen.getByText("Só à noite")).toBeInTheDocument();
    expect(screen.getByText("Exige credenciação")).toBeInTheDocument();
    expect(screen.getByText("Loja aberta ao público")).toBeInTheDocument();
    expect(screen.queryByText(/T3/)).not.toBeInTheDocument();
    expect(screen.queryByText("x")).not.toBeInTheDocument();
  });
});

describe("campos configuráveis (Operações)", () => {
  it("são os mesmos ficheiros do CRM", () => {
    for (const f of ["catalogo.ts", "definicoes.ts"]) {
      const aqui = readFileSync(resolve(__dirname, "../../domain/campos", f), "utf8");
      const crm = readFileSync(resolve(__dirname, "../../../../src/lib/campos", f), "utf8");
      expect(aqui.replace(/\r\n/g, "\n"), f).toBe(crm.replace(/\r\n/g, "\n"));
    }
  });
});
