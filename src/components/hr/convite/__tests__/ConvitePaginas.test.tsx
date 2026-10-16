/**
 * `ConvitePagina1` e `ConvitePagina2`: a UI do convite que a pessoa ja preenchia, agora DENTRO do
 * portal. As duas adaptacoes (opcionais, por isso o resto fica como estava):
 *  - `editavel(campo)`: o que o estado do processo deixa editar; sem ela, tudo se edita;
 *  - `aposCampo`: um sitio, junto do NISS (pagina 1) e do IBAN (pagina 2), para o botao que os
 *    guarda no cofre pela accao `sensiveis`.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string) => chave }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { ConvitePagina1 } from "../ConvitePagina1";
import { ConvitePagina2 } from "../ConvitePagina2";
import { RASCUNHO_CONVITE_VAZIO, type RascunhoConvite } from "@/lib/hr/conviteAdmissaoPayload";
import type { PaginaConviteProps } from "../tiposConvite";

const t = (chave: string) => chave;

function props(extra: Partial<PaginaConviteProps> = {}): PaginaConviteProps {
  return {
    t,
    rascunho: { ...RASCUNHO_CONVITE_VAZIO } as RascunhoConvite,
    definir: vi.fn(),
    erroDe: () => null,
    obrigatorio: () => false,
    ...extra,
  };
}

const pagina2 = (extra: Partial<PaginaConviteProps> = {}) =>
  render(<ConvitePagina2 {...props(extra)} erroAssinatura={null} erroAceite={null} />);

describe("ConvitePagina1", () => {
  it("sem `editavel` todos os campos se editam (o comportamento de sempre)", () => {
    render(<ConvitePagina1 {...props()} />);
    for (const id of ["convite-data-nascimento", "convite-telefone-pessoal", "convite-nif", "convite-niss", "convite-linha1"]) {
      expect(document.getElementById(id), id).toBeEnabled();
    }
  });

  it("com `editavel`, so ficam activos os campos que o estado deixa editar", () => {
    const editavel = vi.fn((campo: keyof RascunhoConvite) => campo === "telefone_pessoal" || campo === "genero");
    render(<ConvitePagina1 {...props({ editavel })} />);
    expect(document.getElementById("convite-telefone-pessoal")).toBeEnabled();
    expect(document.getElementById("convite-genero")).toBeEnabled();
    expect(document.getElementById("convite-data-nascimento")).toBeDisabled();
    expect(document.getElementById("convite-nif")).toBeDisabled();
    expect(document.getElementById("convite-niss")).toBeDisabled();
    expect(document.getElementById("convite-linha1")).toBeDisabled();
    expect(document.getElementById("convite-nacionalidade")).toBeDisabled();
  });

  it("pergunta o estado de cada campo pela chave do rascunho (nif, niss, linha1...)", () => {
    const editavel = vi.fn((_campo: keyof RascunhoConvite) => true);
    render(<ConvitePagina1 {...props({ editavel })} />);
    const perguntados = new Set(editavel.mock.calls.map(([campo]) => campo));
    for (const campo of ["nif", "niss", "linha1", "codigo_postal", "genero", "nacionalidade", "data_nascimento"]) {
      expect(perguntados.has(campo as keyof RascunhoConvite), campo).toBe(true);
    }
  });

  it("o NISS pode levar a seguir o botao que o guarda no cofre (aposCampo)", () => {
    render(<ConvitePagina1 {...props({ aposCampo: { niss: <button type="button">guardar-niss</button> } })} />);
    const botao = screen.getByRole("button", { name: "guardar-niss" });
    const campo = document.getElementById("convite-niss") as HTMLElement;
    // Vem depois do campo do NISS e antes do campo seguinte (carta de conducao).
    expect(campo.compareDocumentPosition(botao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const seguinte = document.getElementById("convite-carta-numero") as HTMLElement;
    expect(botao.compareDocumentPosition(seguinte) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sem aposCampo nao se acrescenta nada junto do NISS", () => {
    render(<ConvitePagina1 {...props()} />);
    expect(screen.queryByRole("button", { name: "guardar-niss" })).toBeNull();
  });

  it("o `obrigatorio` continua a mandar no asterisco e no aria-required", () => {
    render(<ConvitePagina1 {...props({ obrigatorio: (c) => c === "genero" })} />);
    expect(document.getElementById("convite-genero")).toHaveAttribute("aria-required", "true");
    expect(document.getElementById("convite-nif")).not.toHaveAttribute("aria-required");
  });
});

describe("ConvitePagina2", () => {
  it("sem `editavel` tudo se edita, a assinatura e a declaracao incluidas", () => {
    pagina2();
    expect(document.getElementById("convite-conta-numero")).toBeEnabled();
    expect(document.getElementById("convite-conta-bic")).toBeEnabled();
    expect(document.getElementById("convite-tamanho-cima")).toBeEnabled();
    expect(document.getElementById("convite-assinatura-nome")).toBeEnabled();
    expect(document.getElementById("convite-aceite")).toBeEnabled();
  });

  it("com `editavel` falso nada se edita, nem a declaracao de veracidade", () => {
    pagina2({ editavel: () => false });
    expect(document.getElementById("convite-conta-numero")).toBeDisabled();
    expect(document.getElementById("convite-conta-titular")).toBeDisabled();
    expect(document.getElementById("convite-tamanho-baixo")).toBeDisabled();
    expect(document.getElementById("convite-assinatura-nome")).toBeDisabled();
    expect(document.getElementById("convite-aceite")).toBeDisabled();
  });

  it("o IBAN pode levar a seguir o botao que o guarda no cofre (aposCampo)", () => {
    pagina2({ aposCampo: { conta_numero: <button type="button">guardar-iban</button> } });
    const botao = screen.getByRole("button", { name: "guardar-iban" });
    const campo = document.getElementById("convite-conta-numero") as HTMLElement;
    expect(campo.compareDocumentPosition(botao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const seguinte = document.getElementById("convite-conta-bic") as HTMLElement;
    expect(botao.compareDocumentPosition(seguinte) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("o cartao de anexos continua a ter o seu sitio (slot `anexos`)", () => {
    render(<ConvitePagina2 {...props()} erroAssinatura={null} erroAceite={null} anexos={<p>cartao-de-anexos</p>} />);
    expect(screen.getByText("cartao-de-anexos")).toBeInTheDocument();
  });
});
