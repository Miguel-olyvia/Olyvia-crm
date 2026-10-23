// O Resumo da ficha com visitas por fechar (já passaram e ainda estão Por fazer): o botão do passo fica no bloco «Por fechar» e não se repete na
// «Próxima visita» nem no «Próximo passo e prazo». O botão vem do processo (`useAcaoDoPasso`), simulado aqui.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { contactoBase, pessoaBase, registosBase, resumoBase, visitaPessoaBase } from "./fabricaTestes";
import { ResumoFicha } from "./ResumoFicha";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("./processo/processoContexto", async (importar) => ({
  ...(await importar<typeof import("./processo/processoContexto")>()),
  useAcaoDoPasso: () => ({ executa: true, aoClicar: vi.fn(), atributos: {}, bloqueio: null, idBloqueio: null }),
}));

beforeAll(prepararRadixNoJsdom);
afterEach(cleanup);

const HOJE = "2026-10-13";
const resumoCom = (visitas: ReturnType<typeof visitaPessoaBase>[]) =>
  resumoBase(pessoaBase("a", { nome: "Ana" }), [], HOJE, "lead", registosBase({ contactos: [contactoBase()], visitas }));

function montar(visitas: ReturnType<typeof visitaPessoaBase>[]) {
  render(
    <ResumoFicha
      resumo={resumoCom(visitas)} hoje={HOJE} voltou={false} podeVerSubmissoes={false} pendentes={0} aoVerSubmissoes={vi.fn()} aoVerVisitas={vi.fn()}
      aoRegistarResultado={vi.fn()}
    />,
  );
}
const passo = () => screen.queryAllByRole("button", { name: /^Marcar a visita como feita/ });
const bloco = (nome: string) => screen.getByRole("heading", { name: nome }).closest("section")!;

describe("Resumo: o botão do passo com visitas por fechar", () => {
  it("só por fechar: o botão do passo está no bloco «Por fechar» (e só ali)", () => {
    montar([visitaPessoaBase("v1", { data: "2026-10-12" })]);
    expect(passo()).toHaveLength(1);
    expect(within(bloco("Por fechar")).getAllByRole("button", { name: /^Marcar a visita como feita/ })).toHaveLength(1);
  });

  it("por fechar e próxima visita: o botão do passo aparece uma só vez, no bloco «Por fechar»", () => {
    montar([visitaPessoaBase("v1", { data: "2026-10-12" }), visitaPessoaBase("v2", { data: "2026-10-20" })]);
    expect(passo()).toHaveLength(1);
    expect(within(bloco("Por fechar")).getAllByRole("button", { name: /^Marcar a visita como feita/ })).toHaveLength(1);
    expect(within(bloco("Próxima visita")).queryAllByRole("button", { name: /^Marcar a visita como feita/ })).toHaveLength(0);
  });

  it("só a próxima visita (nada por fechar): o botão fica na «Próxima visita», como antes", () => {
    montar([visitaPessoaBase("v2", { data: "2026-10-20" })]);
    expect(passo()).toHaveLength(1);
    expect(within(bloco("Próxima visita")).getAllByRole("button", { name: /^Marcar a visita como feita/ })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Por fechar" })).toBeNull();
  });
});
