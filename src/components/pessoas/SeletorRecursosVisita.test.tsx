// SeletorRecursosVisita: os chips de recursos de quem vai à visita (o padrão de Leads), com aria-pressed, aviso de ocupado em texto e teclado.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SeletorRecursosVisita } from "./SeletorRecursosVisita";

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

const RECURSOS = [
  { id: "r1", name: "Rita Gomes", resource_type: "user", user_id: "u1" },
  { id: "r2", name: "Rui Costa", resource_type: "user", user_id: "u2" },
  { id: "r3", name: "Carrinha", resource_type: "equipment", user_id: null },
];

function montar(extra: Partial<Parameters<typeof SeletorRecursosVisita>[0]> = {}) {
  const aoMudar = vi.fn();
  render(<SeletorRecursosVisita id="x" recursos={RECURSOS} escolhidos={["r1"]} emConflito={[]} aoMudar={aoMudar} {...extra} />);
  return { aoMudar };
}

describe("SeletorRecursosVisita", () => {
  it("é um grupo com legenda e um botão por recurso, com aria-pressed no que está escolhido", () => {
    montar();
    const grupo = screen.getByRole("group", { name: "Quem vai à visita" });
    const botoes = within(grupo).getAllByRole("button");
    expect(botoes.map((b) => b.textContent)).toEqual(["Rita Gomes", "Rui Costa", "Carrinha"]);
    expect(botoes.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
    for (const b of botoes) expect(b.className).toMatch(/min-h-11/);
  });

  it("escolher um recurso junta-o aos escolhidos, pela ordem em que se escolhem", () => {
    const { aoMudar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Carrinha" }));
    expect(aoMudar).toHaveBeenCalledExactlyOnceWith(["r1", "r3"]);
  });

  it("voltar a carregar num escolhido tira-o", () => {
    const { aoMudar } = montar({ escolhidos: ["r1", "r2"] });
    fireEvent.click(screen.getByRole("button", { name: "Rita Gomes" }));
    expect(aoMudar).toHaveBeenCalledExactlyOnceWith(["r2"]);
  });

  it("o teclado serve: o botão é nativo, por isso Enter e Espaço são cliques (e tem foco por Tab)", () => {
    montar();
    const botao = screen.getByRole("button", { name: "Rui Costa" });
    expect(botao.tagName).toBe("BUTTON");
    expect(botao).toHaveAttribute("type", "button");
    expect(botao).not.toHaveAttribute("tabindex", "-1");
  });

  it("um recurso ocupado nesse horário di-lo em texto (a cor não é o único sinal), dentro do próprio botão", () => {
    montar({ emConflito: ["r2"] });
    const botao = screen.getByRole("button", { name: /Rui Costa/ });
    expect(botao).toHaveTextContent("ocupado nesse horário");
    expect(screen.getByRole("button", { name: "Rita Gomes" })).not.toHaveTextContent("ocupado");
  });

  it("sem recursos diz que não há nenhum ativo na agenda, em vez de um grupo vazio", () => {
    montar({ recursos: [], escolhidos: [] });
    expect(screen.getByText("Não há recursos ativos na agenda.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("um erro liga-se ao grupo por aria-describedby e fica num alerta", () => {
    montar({ erro: "Escolha quem vai à visita." });
    const grupo = screen.getByRole("group", { name: "Quem vai à visita" });
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("Escolha quem vai à visita.");
    expect(grupo.getAttribute("aria-describedby")).toContain(alerta.id);
    expect(grupo).toHaveAttribute("aria-invalid", "true");
  });

  it("desativado (a guardar) usa aria-disabled e ignora os cliques, sem tirar os botões do teclado", () => {
    const { aoMudar } = montar({ desativado: true });
    const botao = screen.getByRole("button", { name: "Rui Costa" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).not.toBeDisabled();
    fireEvent.click(botao);
    expect(aoMudar).not.toHaveBeenCalled();
  });
});
