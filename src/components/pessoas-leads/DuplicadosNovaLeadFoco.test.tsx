// O diálogo de duplicados: «Voltar» da confirmação devolve o foco a «Atualizar dados» (o botão clicado já não existe), e o aviso parcial
// traz «Tentar de novo» (repetir é seguro e é a única saída que o utilizador não tem de adivinhar).
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { PessoaBloqueio } from "@/hooks/pessoas/novaLead/tiposNovaLead";
import type { Bloqueio } from "@/hooks/pessoas/novaLead/useNovaLead";
import { DuplicadosNovaLead } from "./DuplicadosNovaLead";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

const pessoa = (id: string, nome: string): PessoaBloqueio => ({
  entityId: id, nome, papel: "lead", jaECliente: false, estado: "new", encerrada: false, motivoEncerramento: null, atribuidoA: null,
  criadaEm: null, campos: ["email"], ladoALado: [], podeAbrir: true,
  atualizar: { leadId: "l1", reabrirLead: false, reabrirAbordagem: false, email: null, telefone: { antigo: "911", novo: "912" } },
});
const A = pessoa("p1", "Ana Lopes");
const B = pessoa("p2", "Bea Sousa");
const decisao: Bloqueio = { tipo: "bloquear", pessoas: [A, B], semAcesso: false, grupo: [] };

type Props = Parameters<typeof DuplicadosNovaLead>[0];
const funcoes = () => ({ aoAbrir: vi.fn(), aoAtualizar: vi.fn(), aoConfirmar: vi.fn(), aoVoltar: vi.fn(), aoCancelar: vi.fn(), aoTentarDeNovo: vi.fn() });
const base = (sobre: Partial<Props> = {}): Props => ({ decisao, confirmar: null, aGuardar: false, erro: null, parcial: null, ...funcoes(), ...sobre });

describe("DuplicadosNovaLead: o foco ao voltar da confirmação", () => {
  it("volta ao «Atualizar dados» da pessoa de que se veio (e não à outra)", () => {
    const { rerender } = render(<DuplicadosNovaLead {...base({ confirmar: B })} />);
    expect(screen.getByRole("button", { name: "Voltar" })).toHaveFocus();
    rerender(<DuplicadosNovaLead {...base({ confirmar: null })} />);
    expect(screen.getByRole("button", { name: /^Atualizar dados\s*Bea Sousa/ })).toHaveFocus();
  });

  it("sem ter passado pela confirmação, não mexe no foco (o Radix põe-no onde deve)", () => {
    render(<DuplicadosNovaLead {...base()} />);
    expect(screen.getByRole("button", { name: /^Atualizar dados\s*Bea Sousa/ })).not.toHaveFocus();
  });

  it("se a pessoa já não tem «Atualizar dados», o foco vai para o título do diálogo", () => {
    const semAtualizar = { ...B, atualizar: null };
    const { rerender } = render(<DuplicadosNovaLead {...base({ confirmar: B })} />);
    rerender(<DuplicadosNovaLead {...base({ decisao: { ...decisao, pessoas: [A, semAtualizar] }, confirmar: null })} />);
    expect(within(screen.getByRole("alertdialog")).getByRole("heading", { name: "Esta pessoa já existe" })).toHaveFocus();
  });
});

describe("DuplicadosNovaLead: aviso parcial", () => {
  it("tem «Tentar de novo», que repete a atualização", () => {
    const f = funcoes();
    render(<DuplicadosNovaLead {...base({ ...f, confirmar: A, parcial: { feito: ["contacto"], falhou: "lead", chave: "pessoasPagina.erroNeg.generico" } })} />);
    const alerta = screen.getByRole("alert");
    fireEvent.click(within(alerta).getByRole("button", { name: "Tentar de novo" }));
    expect(f.aoTentarDeNovo).toHaveBeenCalledTimes(1);
  });
});
