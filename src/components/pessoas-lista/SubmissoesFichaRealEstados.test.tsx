// Mais estados do separador Submissões: «inativo» (ficha a fechar) não diz «sem submissões»; uma lista desatualizada avisa e deixa repetir.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SubmissaoFicha } from "@/hooks/pessoas/adaptarSubmissoes";
import { SubmissoesFichaReal } from "./SubmissoesFichaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());

const cartao = (): SubmissaoFicha => ({
  chave: "submissao:s1", tipo: "submissao", id: "s1", criadoEm: "2026-10-20T09:00:00Z", campanha: "Remodelações", origem: null, etapa: null, revisao: "pending",
  conflito: null, emailNaoGravado: null, telefoneNaoGravado: null, coincidencia: null, campos: [],
});
type Props = Parameters<typeof SubmissoesFichaReal>[0];
function desenhar(sobre: Partial<Props> = {}) {
  const aoTentarDeNovo = vi.fn();
  const { container } = render(
    <SubmissoesFichaReal submissoes={[cartao()]} estado="ok" hoje="2026-10-20" aoTentarDeNovo={aoTentarDeNovo} {...sobre} />,
  );
  return { aoTentarDeNovo, container };
}

describe("SubmissoesFichaReal: inativo", () => {
  it("não desenha nada (nem «Sem submissões…» durante a animação de fecho da ficha)", () => {
    const { container } = desenhar({ estado: "inativo", submissoes: [] });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/Sem submissões/)).toBeNull();
  });
});

describe("SubmissoesFichaReal: lista desatualizada", () => {
  it("mantém a lista, avisa com discrição e repete a leitura", () => {
    const { aoTentarDeNovo } = desenhar({ desatualizado: true });
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("Remodelações")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Não foi possível atualizar as submissões.");
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(aoTentarDeNovo).toHaveBeenCalledTimes(1);
  });

  it("lista vazia mas desatualizada (releitura falhada): avisa e deixa repetir, em vez de dizer só «Sem submissões»", () => {
    const { aoTentarDeNovo } = desenhar({ desatualizado: true, submissoes: [] });
    expect(screen.getByRole("status")).toHaveTextContent("Não foi possível atualizar as submissões.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(aoTentarDeNovo).toHaveBeenCalledTimes(1);
  });

  it("lista vazia e atualizada: só «Sem submissões», sem aviso nem botão", () => {
    desenhar({ submissoes: [] });
    expect(screen.getByText(/Sem submissões/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
  });

  it("sem o aviso, não há botão nem estado", () => {
    desenhar();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
  });
});
