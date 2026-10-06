/**
 * `BotaoCriarAcesso`: "Criar acesso" bloqueado por pendencias da ficha.
 *
 * O botao bloqueado NAO esta `disabled` (um botao desactivado nao recebe foco
 * e o leitor de ecra passa-lhe ao lado) nem vive dentro de um `<span
 * tabIndex=0>` sem nome: fica focavel, com `aria-disabled` e `aria-describedby`
 * a apontar para o texto visivel que diz porque.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    language: "pt",
    t: (chave: string, params?: Record<string, string | number>) => {
      const textos: Record<string, string> = {
        "hr.acesso.criar": "Criar acesso",
        "hr.acesso.reenviar": "Reenviar credenciais",
        "hr.acesso.bloqueadoPendencias": "Faltam {{n}} campos para criar acesso.",
      };
      let texto = textos[chave] ?? chave;
      Object.entries(params ?? {}).forEach(([k, v]) => {
        texto = texto.replace(`{{${k}}}`, String(v));
      });
      return texto;
    },
  }),
}));

import { BotaoCriarAcesso } from "@/components/hr/BotaoCriarAcesso";

describe("BotaoCriarAcesso", () => {
  it("sem pendencias e um botao normal: activo e clicavel", () => {
    const onClick = vi.fn();
    render(<BotaoCriarAcesso reenviar={false} pendencias={0} onClick={onClick} />);

    const botao = screen.getByRole("button", { name: "Criar acesso" });
    expect(botao).toBeEnabled();
    expect(botao).not.toHaveAttribute("aria-disabled");
    fireEvent.click(botao);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("com pendencias fica focavel, aria-disabled, e o clique nao faz nada", () => {
    const onClick = vi.fn();
    render(<BotaoCriarAcesso reenviar={false} pendencias={3} onClick={onClick} />);

    const botao = screen.getByRole("button", { name: "Criar acesso" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).not.toBeDisabled();
    botao.focus();
    expect(document.activeElement).toBe(botao);
    fireEvent.click(botao);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("a razao esta ligada ao botao por aria-describedby, em texto visivel", () => {
    render(<BotaoCriarAcesso reenviar={false} pendencias={3} onClick={vi.fn()} />);

    const botao = screen.getByRole("button", { name: "Criar acesso" });
    const idDaRazao = botao.getAttribute("aria-describedby");
    expect(idDaRazao).toBeTruthy();
    expect(document.getElementById(idDaRazao as string)).toHaveTextContent("Faltam 3 campos para criar acesso.");
  });

  it("nao ha paragem de tabulacao vazia: nenhum envolvente focavel sem nome", () => {
    const { container } = render(<BotaoCriarAcesso reenviar={false} pendencias={3} onClick={vi.fn()} />);

    expect(container.querySelector("span[tabindex]")).toBeNull();
    expect(container.querySelectorAll("[tabindex]")).toHaveLength(0);
  });

  it("reenviar credenciais a quem ja tem conta nunca e travado pelas pendencias", () => {
    const onClick = vi.fn();
    render(<BotaoCriarAcesso reenviar pendencias={5} onClick={onClick} />);

    const botao = screen.getByRole("button", { name: "Reenviar credenciais" });
    expect(botao).not.toHaveAttribute("aria-disabled");
    fireEvent.click(botao);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
