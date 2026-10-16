/**
 * `ProlongarConviteDialog`: um modal simples para somar dias a validade do
 * link da admissao (3, 7, 14, 30 ou outro valor entre 1 e 90). O que decide se
 * se pode (estado, tecto de 90 dias acumulados) e a base: o erro volta em
 * portugues claro, dentro do modal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const TEXTOS: Record<string, string> = {
  "hr.convite.prolongar.titulo": "Prolongar o acesso",
  "hr.convite.prolongar.descricao": "Escolha quantos dias somar à validade do link.",
  "hr.convite.prolongar.limite": "O link nunca pode ficar válido mais de 90 dias a partir de hoje.",
  "hr.convite.prolongar.validoAte": "Válido atualmente até {{data}}",
  "hr.convite.prolongar.dias": "{{n}} dias",
  "hr.convite.prolongar.outro": "Outro",
  "hr.convite.prolongar.outroDias": "Número de dias (1 a 90)",
  "hr.convite.erro.diasInvalidos": "Indique um número inteiro de dias entre 1 e 90.",
  "hr.convite.prolongar.confirmar": "Prolongar",
  "hr.convite.prolongar.sucesso": "Acesso prolongado.",
  "hr.convite.accao.voltar": "Voltar",
};

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    language: "pt",
    t: (chave: string, params?: Record<string, string | number>) => {
      let texto = TEXTOS[chave] ?? chave;
      Object.entries(params ?? {}).forEach(([k, v]) => {
        texto = texto.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
      });
      return texto;
    },
  }),
}));

const prolongar = vi.fn();
let aExecutar = false;
vi.mock("@/hooks/useAcoesConviteAdmissao", () => ({
  useAcoesConviteAdmissao: () => ({ prolongar, cancelar: vi.fn(), aExecutar }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { toast } from "@/lib/toast";
import { ProlongarConviteDialog } from "@/components/hr/ProlongarConviteDialog";

function montar(validUntil: string | null = "2026-11-08T12:30:00Z") {
  const onOpenChange = vi.fn();
  const onConcluido = vi.fn();
  render(
    <ProlongarConviteDialog
      open
      onOpenChange={onOpenChange}
      conviteId="c1"
      validUntil={validUntil}
      onConcluido={onConcluido}
    />,
  );
  return { onOpenChange, onConcluido };
}

const confirmar = () => screen.getByRole("button", { name: "Prolongar" });

beforeEach(() => {
  vi.clearAllMocks();
  aExecutar = false;
  prolongar.mockResolvedValue({ ok: true, validUntil: "2026-11-15T12:30:00Z" });
});

describe("ProlongarConviteDialog", () => {
  it("oferece 3, 7, 14, 30 dias e outro, com 7 escolhido", () => {
    montar();
    for (const n of [3, 7, 14, 30]) {
      expect(screen.getByRole("radio", { name: `${n} dias` })).toBeInTheDocument();
    }
    expect(screen.getByRole("radio", { name: "Outro" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "7 dias" })).toBeChecked();
    expect(screen.queryByLabelText("Número de dias (1 a 90)")).not.toBeInTheDocument();
  });

  it("diz a validade actual e o tecto de 90 dias", () => {
    montar();
    expect(screen.getByText(/Válido atualmente até \d\d\/\d\d\/\d{4}/)).toBeInTheDocument();
    expect(screen.getByText("O link nunca pode ficar válido mais de 90 dias a partir de hoje.")).toBeInTheDocument();
  });

  it("confirmar com a omissao prolonga 7 dias, avisa, atualiza e fecha", async () => {
    const { onOpenChange, onConcluido } = montar();
    fireEvent.click(confirmar());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(prolongar).toHaveBeenCalledWith("c1", 7);
    expect(toast.success).toHaveBeenCalledWith("Acesso prolongado.");
    expect(onConcluido).toHaveBeenCalledTimes(1);
  });

  it("escolher 30 prolonga 30 dias", async () => {
    const { onConcluido } = montar();
    fireEvent.click(screen.getByRole("radio", { name: "30 dias" }));
    fireEvent.click(confirmar());
    await waitFor(() => expect(onConcluido).toHaveBeenCalled());
    expect(prolongar).toHaveBeenCalledWith("c1", 30);
  });

  it("outro: aparece o campo de dias e prolonga o numero escrito", async () => {
    const { onConcluido } = montar();
    fireEvent.click(screen.getByRole("radio", { name: "Outro" }));
    fireEvent.change(screen.getByLabelText("Número de dias (1 a 90)"), { target: { value: "45" } });
    fireEvent.click(confirmar());
    await waitFor(() => expect(onConcluido).toHaveBeenCalled());
    expect(prolongar).toHaveBeenCalledWith("c1", 45);
  });

  it.each([["0"], ["91"], ["1.5"], ["-3"], [""], ["abc"]])(
    "outro com %j nao chega a Edge Function e diz porque",
    (valor) => {
      const { onConcluido } = montar();
      fireEvent.click(screen.getByRole("radio", { name: "Outro" }));
      fireEvent.change(screen.getByLabelText("Número de dias (1 a 90)"), { target: { value: valor } });
      fireEvent.click(confirmar());
      expect(screen.getByRole("alert")).toHaveTextContent("Indique um número inteiro de dias entre 1 e 90.");
      expect(prolongar).not.toHaveBeenCalled();
      expect(onConcluido).not.toHaveBeenCalled();
    },
  );

  it("os limites 1 e 90 passam", async () => {
    const { onConcluido } = montar();
    fireEvent.click(screen.getByRole("radio", { name: "Outro" }));
    const campo = screen.getByLabelText("Número de dias (1 a 90)");
    fireEvent.change(campo, { target: { value: "90" } });
    fireEvent.click(confirmar());
    await waitFor(() => expect(onConcluido).toHaveBeenCalled());
    expect(prolongar).toHaveBeenCalledWith("c1", 90);
  });

  it("uma recusa da base (prazo excedido) aparece dentro do modal, que fica aberto", async () => {
    prolongar.mockResolvedValue({
      ok: false,
      codigo: "prazo_excedido",
      erro: "O acesso não pode ficar válido mais de 90 dias a partir de hoje.",
    });
    const { onOpenChange, onConcluido } = montar();
    fireEvent.click(confirmar());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "O acesso não pode ficar válido mais de 90 dias a partir de hoje.",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onConcluido).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("enquanto prolonga, o botao fica desativado (um so pedido)", () => {
    aExecutar = true;
    montar();
    expect(confirmar()).toBeDisabled();
  });

  it("Voltar fecha sem chamar nada", () => {
    const { onOpenChange } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(prolongar).not.toHaveBeenCalled();
  });

  it("sem validade conhecida nao inventa uma data", () => {
    montar(null);
    expect(screen.queryByText(/Válido atualmente/)).not.toBeInTheDocument();
  });

  it("o erro de uma tentativa anterior nao fica quando se muda de opcao", async () => {
    prolongar.mockResolvedValue({ ok: false, codigo: "estado_invalido", erro: "Estado inválido." });
    montar();
    fireEvent.click(confirmar());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "3 dias" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
