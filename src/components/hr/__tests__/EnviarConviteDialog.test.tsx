/**
 * `EnviarConviteDialog`, com o Supabase simulado: so se mexe na Edge Function
 * `convite-admissao`.
 *
 * O que este teste fecha:
 *  1. e-mail enviado -> toast de sucesso, fecha, avisa quem chamou;
 *  2. e-mail NAO enviado -> o dialogo NAO fecha e mostra o link UMA vez, com
 *     "Copiar link"; copiar chama a area de transferencia;
 *  3. fechar e reabrir ja nao mostra o link (nunca fica guardado);
 *  4. o link nunca vai para o Sentry nem para o toast;
 *  5. no modo reenviar o e-mail vem pre-preenchido e o titulo muda.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";

const TEXTOS: Record<string, string> = {
  "hr.convite.emailNaoEnviado": "O email não foi enviado. Copie o link ou carregue em Reenviar.",
  "hr.convite.copiarLink": "Copiar link",
  "hr.convite.linkCopiado": "Link copiado.",
  "hr.convite.linkUmaVez": "Este link só é mostrado agora.",
  "hr.convite.linkDoConvite": "Link do convite",
  "hr.convite.reenviar": "Reenviar",
  "hr.convite.tituloReenviar": "Reenviar convite",
  "hr.convite.tituloDialogo": "Convidar a preencher a ficha",
  "hr.convite.enviar": "Enviar convite",
  "hr.convite.enviadoComSucesso": "Convite enviado.",
  "hr.convite.copiado": "Copiado",
  "hr.convite.copiarFalhou": "Não foi possível copiar automaticamente. Seleccione o texto e copie com Ctrl+C.",
  "hr.convite.criadoSemLink": "O convite foi criado, mas o link não foi devolvido. Carregue em Reenviar para gerar outro.",
  "hr.convite.fecharSemCopiar": "Ainda não copiou o link e ele não volta a aparecer. Fechar mesmo assim?",
  "hr.convite.fecharMesmoAssim": "Fechar mesmo assim",
  "hr.convite.voltarAoLink": "Voltar ao link",
  "common.close": "Fechar",
};

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    language: "pt",
    t: (chave: string) => TEXTOS[chave] ?? chave,
  }),
}));

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowError(...args),
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { toast } from "@/lib/toast";
import { EnviarConviteDialog } from "@/components/hr/EnviarConviteDialog";

const LINK = "https://app.exemplo.pt/admissao/TOKEN-SECRETO-123";

function montar(props?: Partial<ComponentProps<typeof EnviarConviteDialog>>) {
  const onOpenChange = vi.fn();
  const onEnviado = vi.fn();
  const utilizador = render(
    <EnviarConviteDialog
      open
      onOpenChange={onOpenChange}
      onEnviado={onEnviado}
      pessoaId="pessoa-1"
      emailSugerido="ana@exemplo.pt"
      {...props}
    />,
  );
  return { onOpenChange, onEnviado, ...utilizador };
}

const respostaSemEmail = {
  data: {
    ok: true,
    convite_id: "c1",
    email_enviado: false,
    email_erro: "SMTP em baixo",
    valid_until: "2026-12-01T10:00:00Z",
    link: LINK,
  },
  error: null,
};

describe("EnviarConviteDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it("com e-mail enviado fecha, avisa e nao mostra link nenhum", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, convite_id: "c1", email_enviado: true, link: null },
      error: null,
    });
    const { onOpenChange, onEnviado } = montar();

    fireEvent.click(screen.getByRole("button", { name: "Enviar convite" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onEnviado).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Convite enviado.");
    expect(screen.queryByText(LINK)).not.toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("convite-admissao", {
      body: { action: "criar", pessoa_id: "pessoa-1", email: "ana@exemplo.pt" },
    });
  });

  it("sem e-mail enviado NAO fecha e mostra o link uma vez, para copiar", async () => {
    invoke.mockResolvedValue(respostaSemEmail);
    const { onOpenChange, onEnviado } = montar();

    fireEvent.click(screen.getByRole("button", { name: "Enviar convite" }));

    const campo = await screen.findByLabelText("Link do convite");
    expect(campo).toHaveValue(LINK);
    expect(campo).toHaveAttribute("readonly");
    expect(screen.getByText(/não foi enviado/i)).toBeInTheDocument();
    expect(screen.getByText("Este link só é mostrado agora.")).toBeInTheDocument();
    // O motivo tecnico e para o RH, em letra pequena.
    expect(screen.getByText("SMTP em baixo")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onEnviado).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(LINK));
    expect(toast.success).toHaveBeenCalledWith("Link copiado.");
  });

  it("o link nunca vai para o Sentry nem para um toast", async () => {
    invoke.mockResolvedValue(respostaSemEmail);
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Enviar convite" }));
    await screen.findByLabelText("Link do convite");
    fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());

    const tudo = JSON.stringify([
      captureFlowError.mock.calls,
      (toast.error as ReturnType<typeof vi.fn>).mock.calls,
      (toast.success as ReturnType<typeof vi.fn>).mock.calls,
      (toast.warning as ReturnType<typeof vi.fn>).mock.calls,
    ]);
    expect(tudo).not.toContain("TOKEN-SECRETO-123");
  });

  it("fechar e reabrir ja nao mostra o link", async () => {
    invoke.mockResolvedValue(respostaSemEmail);
    const { rerender, onOpenChange } = montar();

    fireEvent.click(screen.getByRole("button", { name: "Enviar convite" }));
    await screen.findByLabelText("Link do convite");

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // O pai fecha e volta a abrir o mesmo dialogo.
    rerender(
      <EnviarConviteDialog
        open={false}
        onOpenChange={onOpenChange}
        pessoaId="pessoa-1"
        emailSugerido="ana@exemplo.pt"
      />,
    );
    rerender(
      <EnviarConviteDialog
        open
        onOpenChange={onOpenChange}
        pessoaId="pessoa-1"
        emailSugerido="ana@exemplo.pt"
      />,
    );

    expect(screen.queryByText(LINK)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(LINK)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/hr.convite.email/)).toBeInTheDocument();
  });

  it("Reenviar, no estado do link, repete o envio para o mesmo e-mail", async () => {
    invoke.mockResolvedValue(respostaSemEmail);
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Enviar convite" }));
    await screen.findByLabelText("Link do convite");
    expect(invoke).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Reenviar" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(invoke).toHaveBeenLastCalledWith("convite-admissao", {
      body: { action: "criar", pessoa_id: "pessoa-1", email: "ana@exemplo.pt" },
    });
  });

  it("no modo reenviar muda o titulo e traz o e-mail do convite actual", () => {
    montar({ modo: "reenviar", emailSugerido: "atual@exemplo.pt" });

    expect(screen.getByText("Reenviar convite")).toBeInTheDocument();
    expect(screen.getByLabelText(/hr.convite.email/)).toHaveValue("atual@exemplo.pt");
  });

  it("um erro do servidor fica em toast, sem o codigo em bruto, e nao fecha", async () => {
    invoke.mockResolvedValue({ data: { error: "erro_inesperado" }, error: null });
    const { onOpenChange } = montar();

    fireEvent.click(screen.getByRole("button", { name: "Enviar convite" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const mensagem = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(mensagem).not.toBe("erro_inesperado");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  describe("email nao saiu e a resposta veio sem link", () => {
    const respostaSemLink = {
      data: { ok: true, convite_id: "c1", email_enviado: false, email_erro: "SMTP em baixo", link: null },
      error: null,
    };

    it("nao fecha: mostra um erro persistente com Reenviar, em vez de um toast que some", async () => {
      invoke.mockResolvedValue(respostaSemLink);
      const { onOpenChange, onEnviado } = montar();

      fireEvent.click(screen.getByRole("button", { name: "Enviar convite" }));

      const alerta = await screen.findByRole("alert");
      expect(alerta).toHaveTextContent("O convite foi criado, mas o link não foi devolvido.");
      expect(onOpenChange).not.toHaveBeenCalled();
      // O convite existe: quem chamou tem de saber para actualizar o cartao.
      expect(onEnviado).toHaveBeenCalledTimes(1);
      expect(toast.warning).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Reenviar" })).toBeInTheDocument();
      expect(screen.queryByLabelText("Link do convite")).not.toBeInTheDocument();
    });

    it("Reenviar volta a pedir o envio ao mesmo e-mail", async () => {
      invoke.mockResolvedValue(respostaSemLink);
      montar();

      fireEvent.click(screen.getByRole("button", { name: "Enviar convite" }));
      await screen.findByRole("alert");
      fireEvent.click(screen.getByRole("button", { name: "Reenviar" }));

      await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    });
  });

  describe("o link so aparece uma vez: nao se perde por engano", () => {
    async function ateAoLink() {
      invoke.mockResolvedValue(respostaSemEmail);
      const montado = montar();
      fireEvent.click(screen.getByRole("button", { name: "Enviar convite" }));
      await screen.findByLabelText("Link do convite");
      return montado;
    }

    it("o foco passa para o campo do link e o aviso e anunciado", async () => {
      await ateAoLink();

      await waitFor(() => expect(screen.getByLabelText("Link do convite")).toHaveFocus());
      expect(screen.getByRole("alert")).toHaveTextContent(/não foi enviado/i);
    });

    it("Escape sem ter copiado pede confirmacao e nao apaga o link", async () => {
      const { onOpenChange } = await ateAoLink();

      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

      expect(await screen.findByText(/Ainda não copiou o link/)).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(screen.getByDisplayValue(LINK)).toBeInTheDocument();
    });

    it("'Voltar ao link' cancela o fecho", async () => {
      const { onOpenChange } = await ateAoLink();

      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      fireEvent.click(await screen.findByRole("button", { name: "Voltar ao link" }));

      expect(screen.queryByText(/Ainda não copiou o link/)).not.toBeInTheDocument();
      expect(screen.getByDisplayValue(LINK)).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("'Fechar mesmo assim' fecha", async () => {
      const { onOpenChange } = await ateAoLink();

      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      fireEvent.click(await screen.findByRole("button", { name: "Fechar mesmo assim" }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("depois de copiar, Escape fecha sem perguntar", async () => {
      const { onOpenChange } = await ateAoLink();
      fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
      await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(LINK));

      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      expect(screen.queryByText(/Ainda não copiou o link/)).not.toBeInTheDocument();
    });

    it("o botao 'Fechar' e uma saida explicita e fecha logo", async () => {
      const { onOpenChange } = await ateAoLink();

      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("copiar o link", () => {
    it("o botao passa a dizer 'Copiado' numa regiao anunciada", async () => {
      invoke.mockResolvedValue(respostaSemEmail);
      montar();
      fireEvent.click(screen.getByRole("button", { name: "Enviar convite" }));
      await screen.findByLabelText("Link do convite");

      fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));

      expect(await screen.findByRole("button", { name: "Copiado" })).toBeInTheDocument();
      expect(screen.getByText("Copiado", { selector: "[aria-live]" })).toBeInTheDocument();
    });

    it("se a area de transferencia falhar, avisa e deixa o texto seleccionado", async () => {
      invoke.mockResolvedValue(respostaSemEmail);
      Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("negado")) } });
      montar();
      fireEvent.click(screen.getByRole("button", { name: "Enviar convite" }));
      await screen.findByLabelText("Link do convite");

      fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));

      await waitFor(() =>
        expect(toast.warning).toHaveBeenCalledWith(
          "Não foi possível copiar automaticamente. Seleccione o texto e copie com Ctrl+C.",
        ),
      );
      expect(screen.getByLabelText("Link do convite")).toHaveFocus();
      expect(screen.queryByRole("button", { name: "Copiado" })).not.toBeInTheDocument();
    });
  });
});
