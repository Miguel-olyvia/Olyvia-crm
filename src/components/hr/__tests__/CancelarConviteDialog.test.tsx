/**
 * `CancelarConviteDialog`: cancela o processo de admissao aberto. Cancelar NAO
 * e rejeitar (nao ha decisao sobre a pessoa) e o link deixa de funcionar: o
 * modal di-lo antes de pedir o motivo, que e obrigatorio e interno.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const TEXTOS: Record<string, string> = {
  "hr.convite.cancelar.titulo": "Cancelar a admissão",
  "hr.convite.cancelar.aviso": "Cancelar não é rejeitar. O link deixa de funcionar.",
  "hr.convite.cancelar.motivo": "Motivo do cancelamento",
  "hr.convite.cancelar.motivoAjuda": "O motivo é interno: a pessoa não o vê.",
  "hr.convite.cancelar.motivoObrigatorio": "Escreva o motivo do cancelamento.",
  "hr.convite.cancelar.confirmar": "Cancelar admissão",
  "hr.convite.cancelar.sucesso": "Admissão cancelada.",
  "hr.convite.accao.voltar": "Voltar",
  "hr.campos.obrigatorio": "obrigatório",
};

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string) => TEXTOS[chave] ?? chave }),
}));

const cancelar = vi.fn();
let aExecutar = false;
vi.mock("@/hooks/useAcoesConviteAdmissao", () => ({
  useAcoesConviteAdmissao: () => ({ prolongar: vi.fn(), cancelar, aExecutar }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { toast } from "@/lib/toast";
import { CancelarConviteDialog } from "@/components/hr/CancelarConviteDialog";

function montar() {
  const onOpenChange = vi.fn();
  const onConcluido = vi.fn();
  render(<CancelarConviteDialog open onOpenChange={onOpenChange} conviteId="c1" onConcluido={onConcluido} />);
  return { onOpenChange, onConcluido };
}

const confirmar = () => screen.getByRole("button", { name: "Cancelar admissão" });
const campoMotivo = () => screen.getByLabelText(/Motivo do cancelamento/);

beforeEach(() => {
  vi.clearAllMocks();
  aExecutar = false;
  cancelar.mockResolvedValue({ ok: true, validUntil: null });
});

describe("CancelarConviteDialog", () => {
  it("diz que cancelar nao e rejeitar e que o link deixa de funcionar", () => {
    montar();
    expect(screen.getByText("Cancelar não é rejeitar. O link deixa de funcionar.")).toBeInTheDocument();
    expect(screen.getByText("O motivo é interno: a pessoa não o vê.")).toBeInTheDocument();
  });

  it("o motivo e obrigatorio, com limite de 2000 caracteres", () => {
    montar();
    const campo = campoMotivo();
    expect(campo).toBeRequired();
    expect(campo).toHaveAttribute("maxlength", "2000");
  });

  it.each([[""], ["   "], ["\n\t"]])("motivo %j: diz que e obrigatorio e nao chama a Edge Function", (valor) => {
    const { onConcluido } = montar();
    fireEvent.change(campoMotivo(), { target: { value: valor } });
    fireEvent.click(confirmar());
    expect(screen.getByRole("alert")).toHaveTextContent("Escreva o motivo do cancelamento.");
    expect(campoMotivo()).toHaveAttribute("aria-invalid", "true");
    expect(cancelar).not.toHaveBeenCalled();
    expect(onConcluido).not.toHaveBeenCalled();
  });

  it("com motivo cancela, avisa, atualiza e fecha", async () => {
    const { onOpenChange, onConcluido } = montar();
    fireEvent.change(campoMotivo(), { target: { value: "A pessoa desistiu" } });
    fireEvent.click(confirmar());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(cancelar).toHaveBeenCalledWith("c1", "A pessoa desistiu");
    expect(toast.success).toHaveBeenCalledWith("Admissão cancelada.");
    expect(onConcluido).toHaveBeenCalledTimes(1);
  });

  it("uma recusa da base aparece dentro do modal, que fica aberto e com o motivo escrito", async () => {
    cancelar.mockResolvedValue({ ok: false, codigo: "estado_invalido", erro: "O estado da admissão já não permite isto." });
    const { onOpenChange, onConcluido } = montar();
    fireEvent.change(campoMotivo(), { target: { value: "Motivo" } });
    fireEvent.click(confirmar());
    expect(await screen.findByRole("alert")).toHaveTextContent("O estado da admissão já não permite isto.");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onConcluido).not.toHaveBeenCalled();
    expect(campoMotivo()).toHaveValue("Motivo");
  });

  it("enquanto cancela, o botao fica desativado", () => {
    aExecutar = true;
    montar();
    expect(confirmar()).toBeDisabled();
  });

  it("Voltar fecha sem chamar nada", () => {
    const { onOpenChange } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(cancelar).not.toHaveBeenCalled();
  });
});
