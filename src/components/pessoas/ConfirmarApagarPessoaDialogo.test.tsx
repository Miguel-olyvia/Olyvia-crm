// Apagar uma pessoa por engano: o diálogo lê o que está ligado (neg_pessoa_ligacoes) e avisa, abre com o foco em «Cancelar», chama
// neg_apagar_pessoa e, em sucesso, fecha o diálogo e a ficha ANTES de refazer as listas; os erros (NG011, 42501) ficam dentro do diálogo.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ConfirmarApagarPessoaDialogo, type PessoaAApagar } from "./ConfirmarApagarPessoaDialogo";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

beforeAll(prepararRadixNoJsdom);
afterEach(cleanup);

const SEM_NADA = {
  contratos: 0, encomendas: 0, faturas: 0, pagamentos: 0, propostas_aceites: 0, negocios_abertos: 0, negocios_ganhos: 0,
  negocios_perdidos: 0, visitas_futuras: 0, portal: 0,
};
const LEAD: PessoaAApagar = { id: "p1", nome: "Ana Silva", papel: "lead" };

let ligacoes: Record<string, number> = SEM_NADA;
let respostaApagar: { data: unknown; error: unknown } = { data: { mudou: true, apagada: true }, error: null };

beforeEach(() => {
  ligacoes = SEM_NADA;
  respostaApagar = { data: { mudou: true, apagada: true }, error: null };
  rpc.mockReset();
  rpc.mockImplementation(async (nome: string) => {
    if (nome === "neg_pessoa_ligacoes") return { data: ligacoes, error: null };
    if (nome === "neg_apagar_pessoa") return respostaApagar;
    return { data: null, error: { code: "XX000", message: "inesperado" } };
  });
});

function abrir(pessoa: PessoaAApagar = LEAD) {
  const ordem: string[] = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidar = vi.spyOn(client, "invalidateQueries").mockImplementation(async () => { ordem.push("refazer"); });
  const aoFechar = vi.fn(() => { ordem.push("fecharDialogo"); });
  const aoFecharFicha = vi.fn(() => { ordem.push("fecharFicha"); });
  const aoConcluido = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ConfirmarApagarPessoaDialogo organizationId="org-1" pessoa={pessoa} aoFechar={aoFechar} aoFecharFicha={aoFecharFicha} aoConcluido={aoConcluido} />
    </QueryClientProvider>,
  );
  return { aoFechar, aoFecharFicha, aoConcluido, ordem, invalidar };
}

describe("ConfirmarApagarPessoaDialogo", () => {
  it("sem ligações: título e texto da lead, sem aviso, foco em «Cancelar»", async () => {
    abrir();
    const d = screen.getByRole("dialog", { name: "Apagar esta lead?" });
    expect(within(d).getByText(/"Ana Silva" sai da lista e do quadro\. Use para corrigir um engano\. Pode ser restaurada no Lixo\./)).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: "Cancelar" })).toHaveFocus();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("neg_pessoa_ligacoes", { p_organization_id: "org-1", p_entity_id: "p1" }));
    await waitFor(() => expect(within(d).queryByText("A ver o que está ligado a esta pessoa…")).toBeNull());
    expect(d.querySelector("[data-aviso-ligacoes]")).toBeNull();
  });

  it("com ligações: o aviso diz o que está ligado e que os documentos ficam", async () => {
    ligacoes = { ...SEM_NADA, contratos: 1, faturas: 2, propostas_aceites: 1 };
    abrir({ id: "p2", nome: "Rui", papel: "cliente" });
    const d = screen.getByRole("dialog", { name: "Apagar este cliente?" });
    expect(await within(d).findByText("Tem 1 contrato, 2 faturas e 1 proposta aceite.")).toBeInTheDocument();
    expect(within(d).getByText("Os documentos ficam guardados e continuam ligados.")).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: "Apagar" })).not.toHaveAttribute("aria-disabled");
  });

  it("apagar chama a base, fecha o diálogo e a ficha ANTES de refazer, e anuncia", async () => {
    const { aoConcluido, ordem } = abrir();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("neg_pessoa_ligacoes", expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
    await waitFor(() => expect(aoConcluido).toHaveBeenCalledWith("Ana Silva foi apagada."));
    expect(rpc).toHaveBeenCalledWith("neg_apagar_pessoa", { p_organization_id: "org-1", p_entity_id: "p1", p_apagar: true });
    expect(ordem.slice(0, 3)).toEqual(["fecharDialogo", "fecharFicha", "refazer"]);
  });

  it("NG011 da base: a mensagem própria de apagar fica num alerta dentro do diálogo, que não fecha", async () => {
    respostaApagar = { data: null, error: { code: "NG011", message: "A pessoa tem negócios abertos." } };
    const { aoFechar, aoFecharFicha, aoConcluido } = abrir();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("neg_pessoa_ligacoes", expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
    const alerta = await within(screen.getByRole("dialog")).findByRole("alert");
    expect(alerta).toHaveTextContent("Esta pessoa tem negócios abertos. Perca-os, ganhe-os ou mande-os para o lixo antes de a apagar.");
    expect(aoFechar).not.toHaveBeenCalled();
    expect(aoFecharFicha).not.toHaveBeenCalled();
    expect(aoConcluido).not.toHaveBeenCalled();
  });

  it("negócios abertos já na leitura: avisa logo e «Apagar» fica desativado", async () => {
    ligacoes = { ...SEM_NADA, negocios_abertos: 1 };
    abrir();
    const d = screen.getByRole("dialog");
    expect(await within(d).findByRole("alert")).toHaveTextContent(/tem negócios abertos/);
    const apagar = within(d).getByRole("button", { name: "Apagar" });
    expect(apagar).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(apagar);
    expect(rpc).not.toHaveBeenCalledWith("neg_apagar_pessoa", expect.anything());
  });

  it("sem permissão (42501): a mensagem de apagar, dentro do diálogo", async () => {
    respostaApagar = { data: null, error: { code: "42501", message: "Sem permissão" } };
    abrir();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("neg_pessoa_ligacoes", expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Não tem permissão para apagar esta pessoa.");
  });

  it("Cancelar fecha sem apagar", async () => {
    const { aoFechar } = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalledWith("neg_apagar_pessoa", expect.anything());
  });
});
