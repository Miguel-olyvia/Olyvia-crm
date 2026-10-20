// As VISITAS nos «Registos ligados» de um negócio na ficha real: marcar uma visita já ligada ao negócio (só com o negócio aberto, com permissão e
// com o diálogo de marcar disponível) e ligar uma visita que já existe com neg_ligar_registo (só visitas NÃO canceladas, da MESMA pessoa e de um
// negócio ABERTO), desligar com neg_desligar_registo. O resto dos registos está em RegistosLigadosNegocioReal.test.tsx.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import type { DadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { repor } from "@/components/negocio-metas/registosPessoa";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { negocioBase, registosBase, visitaPessoaBase } from "./fabricaTestes";
import { textoDiaCompleto } from "./formatoPessoas";
import { MarcarVisitaContext, type MarcarVisitaValor } from "./marcarVisitaContexto";
import { RegistosLigadosNegocio } from "./RegistosLigadosNegocio";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

beforeAll(prepararRadixNoJsdom);
afterEach(() => { cleanup(); repor(); });

const negocio = negocioBase("n1", { pessoaId: "a", pessoa: "Ana", servico: "Cozinha", estadoReal: "aberto" });
const data = (d: string) => textoDiaCompleto(d);
const BOTAO_MARCAR = "Marcar visita para este negócio";

function mostrar(opcoes: { dados?: Partial<DadosNegocio>; aberto?: boolean; marcar?: MarcarVisitaValor | null; negocio?: typeof negocio } = {}) {
  const mutacoes = mutacoesFalsas();
  const marcar = opcoes.marcar === undefined ? { pedir: vi.fn(), marcadas: new Set<string>() } : opcoes.marcar;
  render(
    <MarcarVisitaContext.Provider value={marcar}>
      <ComCostura mutacoes={mutacoes} dados={dadosFalsos(opcoes.dados)}>
        <RegistosLigadosNegocio negocio={opcoes.negocio ?? negocio} aberto={opcoes.aberto ?? true} />
      </ComCostura>
    </MarcarVisitaContext.Provider>,
  );
  return { mutacoes, marcar };
}

describe("«Marcar visita para este negócio»", () => {
  it("com o negócio aberto e permissão, abre o diálogo de marcar com a pessoa e o negócio", () => {
    const { marcar } = mostrar();
    fireEvent.click(screen.getByRole("button", { name: BOTAO_MARCAR }));
    expect(marcar?.pedir).toHaveBeenCalledWith(expect.objectContaining({ pessoaId: "a", nome: "Ana", negocioId: "n1" }));
  });

  it("um negócio terminado não oferece marcar uma visita", () => {
    mostrar({ aberto: false });
    expect(screen.queryByRole("button", { name: BOTAO_MARCAR })).toBeNull();
  });

  it("sem permissão para editar não oferece marcar uma visita", () => {
    mostrar({ dados: { podeEditar: false } });
    expect(screen.queryByRole("button", { name: BOTAO_MARCAR })).toBeNull();
  });

  it("um negócio sem pessoa (pessoaId em falta) não oferece marcar: o diálogo abriria para ninguém e falharia", () => {
    const { marcar } = mostrar({ negocio: { ...negocio, pessoaId: "" } });
    expect(screen.queryByRole("button", { name: BOTAO_MARCAR })).toBeNull();
    expect(marcar?.pedir).not.toHaveBeenCalled();
  });

  it("sem o diálogo de marcar (fora da ficha real) o botão não existe", () => {
    mostrar({ marcar: null });
    expect(screen.queryByRole("button", { name: BOTAO_MARCAR })).toBeNull();
  });
});

describe("ligar e desligar uma visita que já existe", () => {
  const registos = registosBase({
    visitas: [
      visitaPessoaBase("v-livre", { pessoaId: "a", negocioId: null, data: "2026-10-12" }),
      visitaPessoaBase("v-feita", { pessoaId: "a", negocioId: null, data: "2026-10-13", estado: "feita" }),
      visitaPessoaBase("v-cancelada", { pessoaId: "a", negocioId: null, data: "2026-10-14", estado: "cancelada" }),
      visitaPessoaBase("v-outra", { pessoaId: "b", negocioId: null, data: "2026-10-15" }),
      visitaPessoaBase("v-ligada", { pessoaId: "a", negocioId: "n1", data: "2026-10-11" }),
      visitaPessoaBase("v-de-outro", { pessoaId: "a", negocioId: "n2", data: "2026-10-16" }),
    ],
  });
  const ligar = (d: string) => screen.queryByRole("button", { name: `Ligar a este negócio: Visita de ${data(d)}` });

  it("oferece as visitas livres da mesma pessoa (por fazer e feitas) e nenhuma cancelada, de outra pessoa ou já ligada a outro negócio", () => {
    mostrar({ dados: { registos } });
    expect(ligar("2026-10-12")).toBeInTheDocument();
    expect(ligar("2026-10-13")).toBeInTheDocument();
    expect(ligar("2026-10-14")).toBeNull();
    expect(ligar("2026-10-15")).toBeNull();
    expect(ligar("2026-10-16")).toBeNull();
  });

  it("ligar chama neg_ligar_registo (pela ação da ficha) com o tipo e o id da visita", async () => {
    const { mutacoes } = mostrar({ dados: { registos } });
    fireEvent.click(ligar("2026-10-12") as HTMLElement);
    await waitFor(() => expect(mutacoes.ligar).toHaveBeenCalledWith("n1", { tipo: "visita", id: "v-livre" }));
  });

  it("uma visita ligada a este negócio desliga-se; com o negócio terminado nada se oferece", async () => {
    const { mutacoes } = mostrar({ dados: { registos } });
    fireEvent.click(screen.getByRole("button", { name: `Desligar do negócio: Visita de ${data("2026-10-11")}` }));
    await waitFor(() => expect(mutacoes.desligar).toHaveBeenCalledWith("n1", { tipo: "visita", id: "v-ligada" }));
    cleanup();
    mostrar({ dados: { registos }, aberto: false });
    expect(ligar("2026-10-12")).toBeNull();
    expect(screen.queryByRole("button", { name: `Desligar do negócio: Visita de ${data("2026-10-11")}` })).toBeNull();
  });
});
