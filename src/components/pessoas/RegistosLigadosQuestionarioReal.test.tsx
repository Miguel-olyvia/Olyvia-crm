// Os «Registos ligados» de um negócio da ficha real NÃO leem o questionário do levantamento: o painel «Visita e levantamento» monta o seu próprio
// fornecedor (PainelVisitaLevantamentoReal, só quando se abre), e nada nesta lista usa as perguntas. Montar o fornecedor aqui lia
// neg_questionario_levantamento em cada ficha, mesmo sem abrir o painel. O fornecedor é simulado: aqui só interessa que não se monta.
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { repor } from "@/components/negocio-metas/registosPessoa";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { levantamentoBase, negocioBase, registosBase } from "./fabricaTestes";
import { RegistosLigadosNegocio } from "./RegistosLigadosNegocio";

const { fornecedor } = vi.hoisted(() => ({ fornecedor: vi.fn() }));
vi.mock("@/hooks/pessoas/QuestionarioFormularioProvider", () => ({
  QuestionarioFormularioProvider: (p: { children: ReactNode }) => {
    fornecedor();
    return <div data-testid="fornecedor">{p.children}</div>;
  },
}));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

beforeAll(prepararRadixNoJsdom);
afterEach(() => { cleanup(); repor(); fornecedor.mockReset(); });

const negocio = negocioBase("n1", { pessoaId: "a", pessoa: "Ana", servico: "Cozinha", estadoReal: "aberto" });

function mostrar(levantamentos: ReturnType<typeof levantamentoBase>[]) {
  render(
    <ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos({ registos: registosBase({ levantamentos }) })}>
      <RegistosLigadosNegocio negocio={negocio} aberto />
    </ComCostura>,
  );
}

describe("RegistosLigadosReal: não lê as perguntas do levantamento", () => {
  it("sem levantamentos, não monta o fornecedor do questionário", () => {
    mostrar([]);
    expect(screen.queryByTestId("fornecedor")).toBeNull();
    expect(fornecedor).not.toHaveBeenCalled();
  });

  it("com um levantamento livre da pessoa também não (a carga é só a do painel, quando se abre)", () => {
    mostrar([levantamentoBase("rl-2", { rascunho: { linhas: [], observacoes: "", respostas: {}, gravadas: [] } })]);
    expect(screen.queryByTestId("fornecedor")).toBeNull();
    expect(fornecedor).not.toHaveBeenCalled();
  });
});
