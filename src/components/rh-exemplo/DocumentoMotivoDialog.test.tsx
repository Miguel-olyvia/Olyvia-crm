/**
 * DocumentoMotivoDialog: o motivo de anular, ocultar e repor um documento. Botao desactivado ate 3 caracteres uteis (com a razao em
 * texto), contador, apoio so na anulacao, erro da base anunciado (role=alert) com o campo invalido, e o foco devolvido ao menu.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (chave: string, params?: Record<string, string | number>) => (params ? `${chave} ${JSON.stringify(params)}` : chave),
    language: "pt",
  }),
}));

import { DocumentoMotivoDialog } from "@/components/rh-exemplo/DocumentoMotivoDialog";

function montar(sobre: Partial<React.ComponentProps<typeof DocumentoMotivoDialog>> = {}) {
  const onConfirmar = vi.fn().mockResolvedValue(null);
  const onFechar = vi.fn();
  render(
    <DocumentoMotivoDialog
      aberto
      titulo="Anular documento"
      descricao="O documento será anulado."
      rotuloConfirmar="Anular documento"
      apoioColaborador
      onConfirmar={onConfirmar}
      onFechar={onFechar}
      {...sobre}
    />,
  );
  return { onConfirmar, onFechar };
}

const campo = () => screen.getByLabelText("hr.documentos.motivo.rotulo") as HTMLTextAreaElement;
const confirmar = () => screen.getByRole("button", { name: "Anular documento" }) as HTMLButtonElement;

describe("DocumentoMotivoDialog", () => {
  it("tem o campo com rotulo, o titulo e a descricao", () => {
    montar();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(campo()).toBeTruthy();
    expect(screen.getByText("O documento será anulado.")).toBeTruthy();
  });

  it("mostra o apoio para o colaborador so na anulacao", () => {
    montar();
    expect(screen.getByText("hr.documentos.motivo.apoioAnular")).toBeTruthy();
  });

  it("sem apoioColaborador mostra o apoio simples, sem prometer que o colaborador ve o motivo", () => {
    montar({ apoioColaborador: false });
    expect(screen.queryByText("hr.documentos.motivo.apoioAnular")).toBeNull();
    expect(screen.getByText("hr.documentos.motivo.apoio")).toBeTruthy();
  });

  it("o botao esta desactivado ate haver 3 caracteres uteis, e diz porque em texto", () => {
    montar();
    expect(confirmar().disabled).toBe(true);
    expect(screen.getByText(/hr\.documentos\.motivo\.razaoCurto/)).toBeTruthy();
    fireEvent.change(campo(), { target: { value: "  ab   " } });
    expect(confirmar().disabled).toBe(true);
    fireEvent.change(campo(), { target: { value: "abc" } });
    expect(confirmar().disabled).toBe(false);
    expect(screen.queryByText(/hr\.documentos\.motivo\.razaoCurto/)).toBeNull();
  });

  it("mostra o contador de caracteres", () => {
    montar();
    fireEvent.change(campo(), { target: { value: "abcd" } });
    expect(screen.getByText(/hr\.documentos\.motivo\.contador.*"n":4.*"max":2000/)).toBeTruthy();
  });

  it("o campo nao tem maxLength (conta unidades UTF-16): quem decide e a validacao por pontos de codigo", () => {
    montar();
    expect(campo().hasAttribute("maxlength")).toBe(false);
  });

  it("2000 emojis (4000 unidades UTF-16) sao aceites, porque a base conta pontos de codigo", () => {
    montar();
    fireEvent.change(campo(), { target: { value: "\u{1F600}".repeat(2000) } });
    expect(campo().value.length).toBe(4000);
    expect(confirmar().disabled).toBe(false);
    expect(screen.queryByText(/hr\.documentos\.motivo\.razaoLongo/)).toBeNull();
  });

  it("acima de 2000 pontos de codigo o campo aceita o texto e a razao longa diz o motivo, com o contador", () => {
    montar();
    fireEvent.change(campo(), { target: { value: "a".repeat(2001) } });
    expect(campo().value.length).toBe(2001);
    expect(confirmar().disabled).toBe(true);
    expect(screen.getByText(/hr\.documentos\.motivo\.razaoLongo/)).toBeTruthy();
    expect(screen.getByText(/hr\.documentos\.motivo\.contador.*"n":2001/)).toBeTruthy();
  });

  it("depois de um erro da base o foco volta ao campo (o botao esteve desactivado e o foco cairia no corpo)", async () => {
    montar({ onConfirmar: vi.fn().mockResolvedValue("Erro da base.") });
    fireEvent.change(campo(), { target: { value: "Emitido por engano" } });
    confirmar().focus();
    fireEvent.click(confirmar());
    await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(campo()));
  });

  it("confirma com o motivo sem espacos nas pontas e fecha quando corre bem", async () => {
    const { onConfirmar, onFechar } = montar();
    fireEvent.change(campo(), { target: { value: "  Emitido por engano " } });
    fireEvent.click(confirmar());
    await waitFor(() => expect(onFechar).toHaveBeenCalled());
    expect(onConfirmar).toHaveBeenCalledWith("Emitido por engano");
  });

  it("um erro da base fica no ecra, anunciado, com o campo invalido, e o dialogo nao fecha", async () => {
    const { onFechar } = montar({ onConfirmar: vi.fn().mockResolvedValue("O documento já não pode ser anulado.") });
    fireEvent.change(campo(), { target: { value: "Emitido por engano" } });
    fireEvent.click(confirmar());
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toBe("O documento já não pode ser anulado.");
    expect(campo().getAttribute("aria-invalid")).toBe("true");
    expect(campo().getAttribute("aria-describedby")).toContain(alerta.id);
    expect(onFechar).not.toHaveBeenCalled();
  });

  it("nao deixa confirmar duas vezes enquanto a base responde", async () => {
    let resolver: (v: string | null) => void = () => undefined;
    const onConfirmar = vi.fn().mockReturnValue(new Promise<string | null>((r) => { resolver = r; }));
    montar({ onConfirmar });
    fireEvent.change(campo(), { target: { value: "Emitido por engano" } });
    fireEvent.click(confirmar());
    expect(confirmar().disabled).toBe(true);
    fireEvent.click(confirmar());
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    resolver(null);
    await waitFor(() => expect(onConfirmar).toHaveBeenCalledTimes(1));
  });

  it("cancelar fecha sem confirmar", () => {
    const { onConfirmar, onFechar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(onFechar).toHaveBeenCalled();
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it("os botoes tem 44 px de altura minima", () => {
    montar();
    expect(confirmar().className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "common.cancel" }).className).toContain("min-h-11");
  });

  it("limpa o motivo e o erro quando volta a abrir", async () => {
    function Caixa() {
      const [aberto, setAberto] = useState(true);
      return (
        <>
          <button onClick={() => setAberto(true)}>abrir</button>
          <DocumentoMotivoDialog aberto={aberto} titulo="T" descricao="D" rotuloConfirmar="Anular documento" onConfirmar={async () => "erro"} onFechar={() => setAberto(false)} />
        </>
      );
    }
    render(<Caixa />);
    fireEvent.change(campo(), { target: { value: "Emitido por engano" } });
    fireEvent.click(confirmar());
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "abrir" }));
    expect(campo().value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("devolve o foco ao elemento indicado (o menu) quando fecha", async () => {
    function Caixa() {
      const [aberto, setAberto] = useState(true);
      return (
        <>
          <button id="gatilho">Mais ações</button>
          <DocumentoMotivoDialog
            aberto={aberto}
            titulo="T"
            descricao="D"
            rotuloConfirmar="Anular documento"
            onConfirmar={async () => null}
            onFechar={() => setAberto(false)}
            devolverFoco={() => document.getElementById("gatilho")}
          />
        </>
      );
    }
    render(<Caixa />);
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    await waitFor(() => expect(document.activeElement?.id).toBe("gatilho"));
  });
});
