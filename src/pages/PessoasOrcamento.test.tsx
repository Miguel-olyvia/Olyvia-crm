// A Fase 4 na página real: os botões do "A fazer" do Quadro de Pessoas executam o orçamento, a verificação e o envio da proposta, e o
// que muda fica gravado onde o Quadro de Negócios e a página Negócio e metas o leem.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { faseDoNegocio, valorDoNegocio } from "@/components/negocio-metas/negocioMetas";
import { alteracoesAtuais, repor as reporNegocios } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporNegociosNovos } from "@/components/negocio-metas/negociosNovos";
import { repor as reporPessoas } from "@/components/pessoas/pessoasNovas";
import { CHAVE_PREFS_PESSOAS } from "@/components/pessoas/preferenciasPessoas";
import { extrasAtuais, repor as reporExtras } from "@/components/pessoas/processo/processoNegocios";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import PessoasCrm from "./PessoasCrm";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/test/traducoesPessoasTeste")).moduloDeTraducao());
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => true }) }));

/** Os fluxos abrem vários diálogos seguidos: com a máquina ocupada passam dos 5 s por omissão. */
const TEMPO = 30_000;

beforeAll(prepararRadixNoJsdom);
beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(CHAVE_PREFS_PESSOAS, JSON.stringify({ vista: "quadro" }));
  reporNegocios(); reporNegociosNovos(); reporPessoas(); reporExtras();
});
afterEach(() => { reporNegocios(); reporNegociosNovos(); reporPessoas(); reporExtras(); });

const abrirPagina = () => render(<MemoryRouter initialEntries={["/pessoas"]}><PessoasCrm /></MemoryRouter>);
const botao = (nome: string) => screen.getByRole("button", { name: nome });
const coluna = (titulo: string) => within(screen.getByRole("heading", { level: 3, name: new RegExp(`^${titulo}`) }).closest("section") as HTMLElement);
const semDialogo = () => waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
const textoLive = () => Array.from(document.querySelectorAll('[role="status"]')).map((e) => e.textContent ?? "").join(" | ").replace(/\u00a0/g, "");

describe("Pessoas: o orçamento e a proposta a partir do Quadro", () => {
  it("a Casa de banho do Vasco Pinto (Orçamento, sem orçamentos) percorre criar → verificar → enviar e passa a Proposta, gravada para o resto da app", async () => {
    abrirPagina();
    expect(coluna("Orçamento").getByRole("button", { name: "Criar o orçamento: Casa de banho de Vasco Pinto" })).toBeInTheDocument();

    fireEvent.click(botao("Criar o orçamento: Casa de banho de Vasco Pinto"));
    let dialogo = await screen.findByRole("dialog", { name: "Orçamento de Casa de banho" });
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: "Juntar um serviço" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Trocar sanita" }));
    fireEvent.change(within(dialogo).getByLabelText("Quantidade de Trocar sanita"), { target: { value: "2" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar o orçamento" }));
    await semDialogo();
    // Sanita: 2 × 220 € de material, com 23 % de IVA.
    expect(valorDoNegocio(alteracoesAtuais().editados.x3)).toBeCloseTo(541.2, 9);
    await waitFor(() => expect(textoLive()).toContain("Orçamento guardado: Vasco Pinto. A fazer: Verificar o orçamento."));

    fireEvent.click(botao("Verificar o orçamento: Casa de banho de Vasco Pinto"));
    dialogo = await screen.findByRole("dialog", { name: "Verificar o orçamento de Casa de banho" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Marcar como verificado" }));
    await semDialogo();
    await waitFor(() => expect(textoLive()).toContain("Orçamento verificado: Vasco Pinto. A fazer: Enviar a proposta."));

    fireEvent.click(botao("Enviar a proposta: Casa de banho de Vasco Pinto"));
    dialogo = await screen.findByRole("dialog", { name: "Enviar a proposta de Casa de banho" });
    fireEvent.change(within(dialogo).getByLabelText("Início previsto"), { target: { value: "2026-11-16" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Enviar a proposta" }));
    await semDialogo();

    const negocio = alteracoesAtuais().editados.x3;
    expect(faseDoNegocio(negocio)).toBe("proposta");
    expect(valorDoNegocio(negocio)).toBeCloseTo(541.2, 9);
    expect(extrasAtuais().x3.condicoes).toMatchObject({ inicio: "2026-11-16", pagamento: "metade" });
    expect(coluna("Proposta").getByRole("button", { name: "Registar a resposta do cliente: Casa de banho de Vasco Pinto" })).toBeInTheDocument();
    expect(coluna("Orçamento").queryByRole("button", { name: /Casa de banho de Vasco Pinto/ })).not.toBeInTheDocument();
    await waitFor(() => expect(textoLive()).toContain("Proposta enviada: Vasco Pinto passa a Proposta."));
  }, TEMPO);

  it("as Janelas do Vasco Pinto (proposta em rascunho, do exemplo) enviam-se a partir do botão e passam a enviadas", async () => {
    abrirPagina();
    fireEvent.click(botao("Enviar a proposta: Janelas de Vasco Pinto"));
    const dialogo = await screen.findByRole("dialog", { name: "Enviar a proposta de Janelas" });
    expect(dialogo).toHaveAccessibleDescription(/5\.600,00 €/);
    fireEvent.change(within(dialogo).getByLabelText("Início previsto"), { target: { value: "2026-11-02" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Enviar a proposta" }));
    await semDialogo();
    expect(alteracoesAtuais().editados.x4.proposta).toEqual({ estado: "enviada" });
    expect(valorDoNegocio(alteracoesAtuais().editados.x4)).toBe(5600);
  }, TEMPO);

  it("um negócio de exemplo com orçamento escolhido e sem detalhe (Marta Silveira) também executa o passo: nenhum botão se limita a abrir a ficha", () => {
    abrirPagina();
    expect(botao("Criar a proposta: Cozinha de Marta Silveira")).toBeInTheDocument();
  });
});
