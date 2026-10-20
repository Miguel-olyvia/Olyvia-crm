// Um campo do formulário da «Nova lead» (cópia de DynamicFormField, sem base): cada tipo desenha-se com o rótulo ligado, devolve o valor
// certo, e o erro liga-se ao campo (aria-invalid e aria-describedby). O Supabase (distritos) é simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DefinicaoCampo } from "@/hooks/pessoas/novaLead/fluxoNovaLead";
import { supabaseFalso } from "@/hooks/pessoas/novaLead/supabaseFalso";
import { CampoNovaLead } from "./CampoNovaLead";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("@/hooks/pessoas/novaLead/supabaseFalso")).supabaseFalso }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

const def = (sobre: Partial<DefinicaoCampo>): DefinicaoCampo => ({ id: "c", field_key: "x", field_label: "Campo X", field_type: "text", is_required: false, ...sobre });

function desenhar(campo: DefinicaoCampo, valor: unknown = "", erro?: string) {
  const aoMudar = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CampoNovaLead campo={campo} valor={valor} aoMudar={aoMudar} campanhaId={null} erro={erro} />
    </QueryClientProvider>,
  );
  return aoMudar;
}

beforeEach(() => {
  supabaseFalso.reiniciar();
  supabaseFalso.estado.tabelas = { administrative_divisions: [{ id: "d1", name: "Lisboa" }, { id: "d2", name: "Porto" }], campaign_districts: [] };
});

describe("CampoNovaLead: os tipos", () => {
  it("texto: rótulo ligado, valor mostrado, e escrever devolve o texto", () => {
    const aoMudar = desenhar(def({ field_label: "Cidade" }), "Faro");
    const campo = screen.getByLabelText("Cidade");
    expect(campo).toHaveValue("Faro");
    fireEvent.change(campo, { target: { value: "Tavira" } });
    expect(aoMudar).toHaveBeenCalledWith("Tavira");
  });

  it("obrigatório: asterisco escondido do leitor e «(obrigatório)» em texto, com aria-required", () => {
    desenhar(def({ field_label: "Cidade", is_required: true }));
    expect(screen.getByLabelText(/Cidade/)).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("(obrigatório)")).toHaveClass("sr-only");
    expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
  });

  it("email, data e número usam o tipo certo do input", () => {
    desenhar(def({ field_label: "E", field_type: "email" }));
    expect(screen.getByLabelText("E")).toHaveAttribute("type", "email");
  });

  it("número e data", () => {
    desenhar(def({ field_label: "Valor", field_type: "number" }), "5");
    expect(screen.getByLabelText("Valor")).toHaveAttribute("type", "number");
  });

  it("texto longo: textarea", () => {
    const aoMudar = desenhar(def({ field_label: "Notas", field_type: "textarea" }));
    const t = screen.getByLabelText("Notas");
    expect(t.tagName).toBe("TEXTAREA");
    fireEvent.change(t, { target: { value: "olá" } });
    expect(aoMudar).toHaveBeenCalledWith("olá");
  });

  it("lista de opções: seletor com as opções e o valor escolhido", () => {
    const aoMudar = desenhar(def({ field_label: "Tipo", field_type: "select", options: { options: ["A", "B"] } }), "B");
    const s = screen.getByLabelText("Tipo");
    expect(s).toHaveValue("B");
    expect(within(s).getAllByRole("option").map((o) => o.textContent)).toEqual(["Selecionar...", "A", "B"]);
    fireEvent.change(s, { target: { value: "A" } });
    expect(aoMudar).toHaveBeenCalledWith("A");
  });

  it("lista em caixas: um grupo com legenda, e marcar e desmarcar devolve a lista", () => {
    const aoMudar = desenhar(def({ field_label: "Divisões", field_type: "select", display_style: "checkbox", options: { options: ["Sala", "Cozinha"] } }), ["Sala"]);
    const grupo = screen.getByRole("group", { name: "Divisões" });
    expect(within(grupo).getByRole("checkbox", { name: "Sala" })).toBeChecked();
    fireEvent.click(within(grupo).getByRole("checkbox", { name: "Cozinha" }));
    expect(aoMudar).toHaveBeenCalledWith(["Sala", "Cozinha"]);
    fireEvent.click(within(grupo).getByRole("checkbox", { name: "Sala" }));
    expect(aoMudar).toHaveBeenLastCalledWith([]);
  });

  it("sim/não: interruptor com o rótulo", () => {
    const aoMudar = desenhar(def({ field_label: "Tem projeto", field_type: "boolean" }), false);
    const i = screen.getByRole("switch", { name: "Tem projeto" });
    fireEvent.click(i);
    expect(aoMudar).toHaveBeenCalledWith(true);
  });

  it("distrito: opções lidas da base e valor antigo (id, outra grafia) escolhe a opção certa", async () => {
    desenhar(def({ field_label: "Distrito", field_type: "ref_district" }), "PORTO");
    await waitFor(() => expect(within(screen.getByLabelText("Distrito")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Selecionar distrito...", "Lisboa", "Porto"]));
    expect(screen.getByLabelText("Distrito")).toHaveValue("Porto");
  });

  it("distrito com um «-» solto fica por escolher", async () => {
    desenhar(def({ field_label: "Distrito", field_type: "ref_district" }), "-");
    await waitFor(() => expect(within(screen.getByLabelText("Distrito")).getAllByRole("option")).toHaveLength(3));
    expect(screen.getByLabelText("Distrito")).toHaveValue("");
  });

  it("telefone: indicativo e número separados, com nome, e escrever junta «+indicativo» e os dígitos (sem espaços)", () => {
    const aoMudar = desenhar(def({ field_key: "phone", field_label: "Telefone", field_type: "phone" }), "+351912345678");
    expect(screen.getByLabelText("Indicativo do telefone")).toHaveValue("+351");
    const numero = screen.getByLabelText("Telefone", { selector: "input" });
    expect(numero).toHaveValue("912345678");
    fireEvent.change(numero, { target: { value: "913 000 000" } });
    expect(aoMudar).toHaveBeenCalledWith("+351913000000");
  });

  it("telefone: só aceita dígitos e espaços, e mudar o indicativo mantém o número", () => {
    const aoMudar = desenhar(def({ field_key: "phone", field_label: "Telefone", field_type: "phone" }), "+351912345678");
    fireEvent.change(screen.getByLabelText("Telefone", { selector: "input" }), { target: { value: "91a2" } });
    expect(aoMudar).toHaveBeenCalledWith("+351912");
    fireEvent.change(screen.getByLabelText("Indicativo do telefone"), { target: { value: "+34" } });
    expect(aoMudar).toHaveBeenLastCalledWith("+34912345678");
  });
});

describe("CampoNovaLead: ajuda e erro", () => {
  it("o erro marca o campo e liga-se a ele pela descrição", () => {
    desenhar(def({ field_label: "Cidade", help_text: "A da obra" }), "", "Cidade é obrigatório");
    const campo = screen.getByLabelText("Cidade");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(campo).toHaveAccessibleDescription("A da obra Cidade é obrigatório");
  });

  it("sem erro não há aria-invalid", () => {
    desenhar(def({ field_label: "Cidade" }));
    expect(screen.getByLabelText("Cidade")).not.toHaveAttribute("aria-invalid");
  });
});
