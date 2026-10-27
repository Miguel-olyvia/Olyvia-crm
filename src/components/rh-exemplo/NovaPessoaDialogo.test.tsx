/**
 * O painel "Nova pessoa" do rh-exemplo diz ao utilizador o que correu mal: uma recusa total, as seccoes que nao ficaram
 * gravadas e o que o formulario recolheu mas nao tem onde gravar. Antes, uma recusa era uma promessa rejeitada sem dono.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string) => chave }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: vi.fn(async () => "mensagem amigavel") }));
vi.mock("@/components/rh-exemplo/novaPessoa/CabecalhoNova", () => ({ CabecalhoNova: () => null }));
vi.mock("@/components/rh-exemplo/novaPessoa/FormularioNovaPessoa", () => ({
  FormularioNovaPessoa: ({ aoCriar }: { aoCriar: (d: unknown) => void }) => (
    <button type="button" onClick={() => aoCriar({ payload: {}, naoGravado: [] })}>criar</button>
  ),
}));

import { toast } from "@/lib/toast";
import { NovaPessoaDialogo } from "./NovaPessoaDialogo";

function montar(onCriar: (d: never) => Promise<unknown>) {
  const onCriada = vi.fn();
  const onOpenChange = vi.fn();
  render(<NovaPessoaDialogo open onOpenChange={onOpenChange} colegas={[]} onCriar={onCriar as never} onCriada={onCriada} />);
  fireEvent.click(screen.getByRole("button", { name: "criar" }));
  return { onCriada, onOpenChange };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("NovaPessoaDialogo (rh-exemplo): a falha aparece ao utilizador", () => {
  it("sucesso limpo: aviso de sucesso, painel fecha e abre a ficha", async () => {
    const { onCriada, onOpenChange } = montar(async () => ({ id: "p1", falhas: [], naoGravado: [] }));
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p1"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalledWith("hr.sucesso.criada");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("recusa total: erro visivel, o painel fica aberto e nao abre ficha nenhuma", async () => {
    const { onCriada, onOpenChange } = montar(async () => { throw new Error("recusado"); });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("mensagem amigavel"));
    expect(onCriada).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("falhas por seccao: a ficha abre, e o erro diz quais seccoes nao ficaram gravadas", async () => {
    const { onCriada } = montar(async () => ({
      id: "p1", falhas: [{ seccao: "niss", mensagem: "x" }, { seccao: "saude", mensagem: "y" }], naoGravado: [],
    }));
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p1"));
    expect(toast.error).toHaveBeenCalledWith("hr.form.criadaComFalhas hr.form.seccoes.niss, hr.form.seccoes.saude");
  });

  it("o que nao tem onde gravar e dito num aviso, mesmo sem falhas", async () => {
    const { onCriada } = montar(async () => ({ id: "p1", falhas: [], naoGravado: ["anexos"] }));
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p1"));
    expect(toast.warning).toHaveBeenCalledWith("rhNova.naoGravado rhNova.naoGravado.anexos");
  });
});
