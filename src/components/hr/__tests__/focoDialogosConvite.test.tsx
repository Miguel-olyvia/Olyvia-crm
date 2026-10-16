/**
 * O foco nos modais do convite (Prolongar, Enviar convite, Cancelar admissao):
 *  - fechados com Esc, o foco volta ao botao que os abriu (nao fica no BODY);
 *  - uma recusa (motivo em falta, dias invalidos, tecto do servidor) leva o foco ao campo em causa, para quem usa
 *    teclado ou leitor de ecra nao ter de o procurar a partir do botao.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string) => chave }),
}));

const prolongar = vi.fn();
const cancelar = vi.fn();
vi.mock("@/hooks/useAcoesConviteAdmissao", () => ({
  useAcoesConviteAdmissao: () => ({ prolongar, cancelar, aExecutar: false }),
}));
vi.mock("@/hooks/useEnviarConviteAdmissao", () => ({
  useEnviarConviteAdmissao: () => ({ enviarConvite: vi.fn(), enviando: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-nike" } }) }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { ProlongarConviteDialog } from "@/components/hr/ProlongarConviteDialog";
import { CancelarConviteDialog } from "@/components/hr/CancelarConviteDialog";
import { EnviarConviteDialog } from "@/components/hr/EnviarConviteDialog";

/** Um clique de utilizador: o botao ganha o foco antes de a accao correr (o `fireEvent.click` sozinho nao o faz). */
function carregar(botao: HTMLElement) {
  botao.focus();
  fireEvent.click(botao);
}

/** Escreve num campo (o `fireEvent.change` nao precisa de foco). */
function escrever(campo: HTMLElement, valor: string) {
  fireEvent.change(campo, { target: { value: valor } });
}

function Palco() {
  const [prolongarAberto, setProlongarAberto] = useState(false);
  const [enviarAberto, setEnviarAberto] = useState(false);
  const [cancelarAberto, setCancelarAberto] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setProlongarAberto(true)}>abrir-prolongar</button>
      <button type="button" onClick={() => setEnviarAberto(true)}>abrir-enviar</button>
      <button type="button" onClick={() => setCancelarAberto(true)}>abrir-cancelar</button>
      <ProlongarConviteDialog
        open={prolongarAberto} onOpenChange={setProlongarAberto} conviteId="c1" validUntil={null} onConcluido={() => {}}
      />
      <EnviarConviteDialog open={enviarAberto} onOpenChange={setEnviarAberto} pessoaId="p1" emailSugerido={null} />
      <CancelarConviteDialog open={cancelarAberto} onOpenChange={setCancelarAberto} conviteId="c1" onConcluido={() => {}} />
    </div>
  );
}

beforeEach(() => {
  prolongar.mockReset();
  cancelar.mockReset();
});

const esc = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

describe("foco devolvido ao botao que abriu o modal, ao fechar com Esc", () => {
  it.each(["abrir-prolongar", "abrir-enviar", "abrir-cancelar"])("%s", async (nome) => {
    render(<Palco />);
    const botao = screen.getByRole("button", { name: nome });
    carregar(botao);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    esc();

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(botao).toHaveFocus());
  });
});

describe("foco no campo em causa quando o modal recusa", () => {
  it("Cancelar admissao sem motivo: o alerta aparece e o foco vai para o campo do motivo", async () => {
    render(<Palco />);
    carregar(screen.getByRole("button", { name: "abrir-cancelar" }));
    carregar(await screen.findByRole("button", { name: "hr.convite.cancelar.confirmar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("hr.convite.cancelar.motivoObrigatorio");
    const motivo = document.getElementById("hr-convite-cancelar-motivo");
    await waitFor(() => expect(motivo).toHaveFocus());
    expect(cancelar).not.toHaveBeenCalled();
  });

  it("Prolongar com 'Outro' invalido: o foco vai para o campo dos dias", async () => {
    render(<Palco />);
    carregar(screen.getByRole("button", { name: "abrir-prolongar" }));
    fireEvent.click(await screen.findByRole("radio", { name: "hr.convite.prolongar.outro" }));
    const campo = document.getElementById("hr-convite-prolongar-outro") as HTMLInputElement;
    escrever(campo, "95");
    carregar(screen.getByRole("button", { name: "hr.convite.prolongar.confirmar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("hr.convite.erro.diasInvalidos");
    await waitFor(() => expect(campo).toHaveFocus());
  });

  it("Prolongar com 'Outro' que o servidor recusa (tecto dos 90 dias): o foco volta ao campo dos dias", async () => {
    prolongar.mockResolvedValue({ ok: false, erro: "O tecto de 90 dias seria ultrapassado." });
    render(<Palco />);
    carregar(screen.getByRole("button", { name: "abrir-prolongar" }));
    fireEvent.click(await screen.findByRole("radio", { name: "hr.convite.prolongar.outro" }));
    const campo = document.getElementById("hr-convite-prolongar-outro") as HTMLInputElement;
    escrever(campo, "60");
    carregar(screen.getByRole("button", { name: "hr.convite.prolongar.confirmar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("O tecto de 90 dias");
    await waitFor(() => expect(campo).toHaveFocus());
    expect(campo).toHaveAttribute("aria-invalid", "true");
  });
});
