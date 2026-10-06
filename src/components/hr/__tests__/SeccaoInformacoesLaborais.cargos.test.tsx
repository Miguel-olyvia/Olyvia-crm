/**
 * `SeccaoInformacoesLaborais`, a ligacao para gerir Cargos (fluxo 2).
 *
 * Quando a organizacao ainda nao tem cargos activos, o assistente oferece ir ao
 * ecra de Cargos. Essa ligacao NAO pode perder o rascunho da ficha: abre em NOVO
 * separador (o assistente continua aberto, com tudo o que ja foi preenchido) e so
 * aparece a quem pode ver os cargos (`hr.pessoas.laborais.view`).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string) => chave }),
}));

import { SeccaoInformacoesLaborais } from "@/components/hr/form/SeccaoInformacoesLaborais";

function montar(overrides: { podeAbrirCargos: boolean; cargos?: Array<{ id: string; nome: string }> }) {
  render(
    <MemoryRouter>
      <SeccaoInformacoesLaborais
        valor={
          {
            cargo_id: "",
            local_id: "",
            reporta_a_pessoa_id: "",
            data_admissao: "",
          } as unknown as Parameters<typeof SeccaoInformacoesLaborais>[0]["valor"]
        }
        onPatch={vi.fn()}
        erroDe={() => null}
        locais={[]}
        locaisALoad={false}
        podeCriarLocal={false}
        onCriarLocal={vi.fn()}
        colegas={[]}
        cargos={overrides.cargos ?? []}
        cargosALoad={false}
        podeAbrirCargos={overrides.podeAbrirCargos}
      />
    </MemoryRouter>,
  );
}

describe("SeccaoInformacoesLaborais: ir para Cargos", () => {
  it("sem cargos e com permissao: ligacao que abre em novo separador (o rascunho nao se perde)", () => {
    montar({ podeAbrirCargos: true });
    const ligacao = screen.getByRole("link", { name: "hr.cargos.tituloPagina" });
    expect(ligacao).toHaveAttribute("href", "/rh/pessoas?tab=funcoes");
    expect(ligacao).toHaveAttribute("target", "_blank");
    expect(ligacao.getAttribute("rel")).toContain("noopener");
  });

  it("sem hr.pessoas.laborais.view nao oferece a ligacao (so diz que nao ha cargos)", () => {
    montar({ podeAbrirCargos: false });
    expect(screen.queryByRole("link", { name: "hr.cargos.tituloPagina" })).not.toBeInTheDocument();
    expect(screen.getByText(/hr\.form\.cargoSemCatalogo/)).toBeInTheDocument();
  });

  it("com cargos activos nao mostra a ligacao", () => {
    montar({ podeAbrirCargos: true, cargos: [{ id: "c1", nome: "Operador" }] });
    expect(screen.queryByRole("link", { name: "hr.cargos.tituloPagina" })).not.toBeInTheDocument();
  });
});
