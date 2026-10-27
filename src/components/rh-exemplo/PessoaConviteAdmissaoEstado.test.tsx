/**
 * O cartao «Estado do convite» da ficha de /rh-exemplo, ligado ao RH real (o Supabase e simulado: o resumo do convite e as
 * acoes reenviar/prolongar/cancelar sao dobles; as regras de estado sao as verdadeiras).
 *
 * O que fecha: os estados novos da V2 (nao os antigos pendente/usado); Reenviar so com processo aberto e portal ativo, e
 * travado (com o motivo) com o portal expirado; Prolongar e Cancelar so para quem pode enviar; Cancelar desde «aprovada»
 * exige hr.onboarding.approve; o link para a ficha em conflito aponta para /rh-exemplo; e uma falha ao reenviar diz-se.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { reenviar, recarregar, toast } = vi.hoisted(() => ({
  reenviar: vi.fn(),
  recarregar: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string, p?: Record<string, unknown>) => (p ? `${chave}|${JSON.stringify(p)}` : chave) }),
}));
vi.mock("@/lib/toast", () => ({ toast }));
vi.mock("@/components/rh-exemplo/hooks/useConviteAdmissaoResumo", () => ({
  useConviteAdmissaoResumo: () => ({ resumo: null, recarregar }),
}));
vi.mock("@/components/rh-exemplo/hooks/useAcoesConviteAdmissao", () => ({ useAcoesConviteAdmissao: () => ({ reenviar }) }));
vi.mock("@/components/rh-exemplo/hooks/conviteAdmissaoReal", async () => {
  const regras = await import("@/components/rh-exemplo/hooks/estadoAdmissaoReal");
  return {
    ...regras,
    fraseDoPortal: (_t: unknown, portal: string) => `frase:${portal}`,
    SelosAdmissao: ({ estado, estadoPortal }: { estado: string; estadoPortal: string }) => <div>{`selos:${estado}:${estadoPortal}`}</div>,
    ProlongarConviteDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog">prolongar</div> : null),
    CancelarConviteDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog">cancelar</div> : null),
  };
});

import { PessoaConviteAdmissaoEstado } from "./PessoaConviteAdmissaoEstado";

const RESUMO_BASE = {
  conviteId: "c1", estado: "em_preenchimento", estadoPortal: "ativo", validUntil: "2026-11-05T10:00:00Z",
  emailDestino: "rui@x.pt", emailEnviado: true, emailErro: null, ultimaRecusa: null, bloqueado: false,
};

function montar(resumo: Record<string, unknown> | null, extra: { podeEnviar?: boolean; podeAprovar?: boolean; conflitos?: unknown[] } = {}) {
  const estado = {
    semAcesso: false, erro: false, resumo: resumo === null ? null : { ...RESUMO_BASE, ...resumo },
    conflitos: extra.conflitos ?? [], conflitosIndisponiveis: false, recarregar,
  };
  render(
    <MemoryRouter>
      <PessoaConviteAdmissaoEstado
        pessoaId="p1" podeEnviar={extra.podeEnviar ?? true} podeAprovar={extra.podeAprovar} estado={estado as never}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  reenviar.mockResolvedValue({ ok: true });
});

describe("PessoaConviteAdmissaoEstado (rh-exemplo): ligado ao RH real", () => {
  it("mostra os dois selos (admissao e portal) e a frase do link", () => {
    montar({});
    expect(screen.getByText("selos:em_preenchimento:ativo")).toBeTruthy();
    expect(screen.getByText("frase:ativo")).toBeTruthy();
    expect(screen.getByText(/hr\.convite\.estado\.enviadoPara/)).toBeTruthy();
  });

  it("sem resumo (a primeira carga, ou sem convite) o cartao nao aparece", () => {
    montar(null);
    expect(screen.queryByText("hr.convite.estado.titulo")).toBeNull();
  });

  it("com processo aberto e portal ativo: Prolongar, Reenviar e Cancelar", () => {
    montar({});
    expect(screen.getByRole("button", { name: "hr.convite.prolongar.botao" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "hr.convite.reenviar.botao" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "hr.convite.cancelar.botao" })).toBeTruthy();
  });

  it("sem permissao de enviar nao ha nenhuma acao", () => {
    montar({}, { podeEnviar: false });
    expect(screen.queryByRole("button", { name: "hr.convite.prolongar.botao" })).toBeNull();
    expect(screen.queryByRole("button", { name: "hr.convite.reenviar.botao" })).toBeNull();
    expect(screen.queryByRole("button", { name: "hr.convite.cancelar.botao" })).toBeNull();
  });

  it("com o processo fechado (concluida) nao ha acoes: o botao de topo e que abre outro convite", () => {
    montar({ estado: "concluida", estadoPortal: "encerrado" });
    expect(screen.queryByRole("button", { name: "hr.convite.reenviar.botao" })).toBeNull();
    expect(screen.queryByRole("button", { name: "hr.convite.cancelar.botao" })).toBeNull();
    expect(screen.queryByRole("button", { name: "hr.convite.prolongar.botao" })).toBeNull();
  });

  it("Reenviar chama a accao real com o id do convite, diz o sucesso e relê o estado", async () => {
    montar({});
    fireEvent.click(screen.getByRole("button", { name: "hr.convite.reenviar.botao" }));
    await waitFor(() => expect(reenviar).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(recarregar).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith('hr.convite.reenviar.sucesso|{"email":"rui@x.pt"}');
  });

  it("uma recusa ao reenviar aparece por escrito e nao relê nada", async () => {
    reenviar.mockResolvedValue({ ok: false, erro: "A base recusou" });
    montar({});
    fireEvent.click(screen.getByRole("button", { name: "hr.convite.reenviar.botao" }));
    expect((await screen.findByRole("alert")).textContent).toBe("A base recusou");
    expect(recarregar).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("com o portal expirado Reenviar fica travado (aria-disabled), com o motivo, e nao chama nada", () => {
    montar({ estadoPortal: "expirado" });
    const botao = screen.getByRole("button", { name: "hr.convite.reenviar.botao" });
    expect(botao.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("hr.convite.reenviar.expirado")).toBeTruthy();
    fireEvent.click(botao);
    expect(reenviar).not.toHaveBeenCalled();
  });

  it("Prolongar e Cancelar abrem os dialogos reais", () => {
    montar({});
    fireEvent.click(screen.getByRole("button", { name: "hr.convite.prolongar.botao" }));
    expect(screen.getByText("prolongar")).toBeTruthy();
  });

  it("Cancelar desde «aprovada» sem hr.onboarding.approve fica travado, com o motivo; com a permissao abre", () => {
    montar({ estado: "aprovada" }, { podeAprovar: false });
    const travado = screen.getByRole("button", { name: "hr.convite.cancelar.botao" });
    expect(travado.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("hr.convite.cancelar.exigeAprovar")).toBeTruthy();
    fireEvent.click(travado);
    expect(screen.queryByText("cancelar")).toBeNull();
  });

  it("Cancelar com a permissao de aprovar abre o dialogo", () => {
    montar({ estado: "aprovada" }, { podeAprovar: true });
    const botao = screen.getByRole("button", { name: "hr.convite.cancelar.botao" });
    expect(botao.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(botao);
    expect(screen.getByText("cancelar")).toBeTruthy();
  });

  it("a recusa por NIF repetido liga a ficha em conflito dentro de /rh-exemplo", () => {
    montar(
      { estado: "devolvida", ultimaRecusa: { codigo: "nif_ja_existe", campos: [] } },
      { conflitos: [{ campo: "nif", pessoaId: "outra", nome: "Ana Dias" }] },
    );
    const ligacao = screen.getByRole("link", { name: "hr.convite.estado.abrirFicha" });
    expect(ligacao.getAttribute("href")).toBe("/rh-exemplo/pessoas/outra");
  });

  it("um processo concluido nunca mostra a ultima recusa", () => {
    montar({ estado: "concluida", estadoPortal: "encerrado", ultimaRecusa: { codigo: "nif_ja_existe", campos: [] } });
    expect(screen.queryByText(/ultimaRecusa|recusaDuplicado/)).toBeNull();
  });
});
