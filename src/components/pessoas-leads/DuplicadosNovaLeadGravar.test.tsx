// A gravar a atualização, o diálogo «Confirmar atualização» não se fecha (Escape, clique fora): senão «Tentar de novo» de um aviso parcial
// ficava sem pessoa a que se aplicar e não fazia nada nem avisava.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PessoaBloqueio } from "@/hooks/pessoas/novaLead/tiposNovaLead";
import type { Bloqueio } from "@/hooks/pessoas/novaLead/useNovaLead";
import { DuplicadosNovaLead } from "./DuplicadosNovaLead";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

const pessoa: PessoaBloqueio = {
  entityId: "p1", nome: "Ana Lopes", papel: "lead", jaECliente: false, estado: "new", encerrada: false, motivoEncerramento: null, atribuidoA: null,
  criadaEm: null, campos: ["email"],
  ladoALado: [{ campo: "email", escrito: "ana@x.pt", existente: "ana@x.pt", estado: "igual" }],
  podeAbrir: true,
  atualizar: { leadId: "l1", reabrirLead: false, reabrirAbordagem: false, email: null, telefone: { antigo: "911 222 333", novo: "+351 912 000 111" } },
};
const decisao: Bloqueio = { tipo: "bloquear", pessoas: [pessoa], semAcesso: false, grupo: [] };

function desenhar(aGuardar: boolean, confirmar: PessoaBloqueio | null) {
  const f = { aoAbrir: vi.fn(), aoAtualizar: vi.fn(), aoConfirmar: vi.fn(), aoVoltar: vi.fn(), aoCancelar: vi.fn(), aoTentarDeNovo: vi.fn() };
  render(<DuplicadosNovaLead decisao={decisao} confirmar={confirmar} aGuardar={aGuardar} erro={null} parcial={null} {...f} />);
  return f;
}

describe("DuplicadosNovaLead: fechar a meio da gravação", () => {
  it("Escape na confirmação, a gravar, não volta atrás nem cancela", () => {
    const f = desenhar(true, pessoa);
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape", code: "Escape" });
    expect(f.aoVoltar).not.toHaveBeenCalled();
    expect(f.aoCancelar).not.toHaveBeenCalled();
    expect(screen.getByText("Confirmar a atualização de Ana Lopes")).toBeInTheDocument();
  });

  it("Escape na confirmação, sem gravar, continua a voltar atrás", () => {
    const f = desenhar(false, pessoa);
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape", code: "Escape" });
    expect(f.aoVoltar).toHaveBeenCalledTimes(1);
    expect(f.aoCancelar).not.toHaveBeenCalled();
  });
});
