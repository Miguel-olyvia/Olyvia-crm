// Arranque do botão "Descarregar PDF": o nome acessível, a minuta, o aviso ao descarregar e o erro. O desenho do PDF
// está noutro teste (`pdfGerar.test.ts`); aqui a geração é simulada.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BotaoPdf } from "./BotaoPdf";
import { DETALHES_EXEMPLO } from "./negocioDetalhesExemplo";
import { DADOS_EXEMPLO } from "./negocioMetasExemplo";
import { descarregarPdf, gerarBytesPdf } from "./pdfGerar";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) => {
        let texto = negocioMetasTranslations.pt[key] ?? key;
        Object.entries(params ?? {}).forEach(([k, v]) => { texto = texto.replace(`{${k}}`, String(v)); });
        return texto;
      },
    }),
  };
});

const { erro } = vi.hoisted(() => ({ erro: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: erro, success: vi.fn(), info: vi.fn() } }));
vi.mock("./pdfGerar", () => ({ gerarBytesPdf: vi.fn(), descarregarPdf: vi.fn() }));

const negocio = (id: string) => DADOS_EXEMPLO.negocios.find((n) => n.id === id)!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(gerarBytesPdf).mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});

describe("BotaoPdf", () => {
  it("o orçamento diz o documento e o valor no nome, com o texto visível curto", () => {
    const n6 = negocio("n6");
    render(<BotaoPdf documento={{ tipo: "orcamento", orcamento: n6.orcamentos[0] }} negocio={n6} detalhe={DETALHES_EXEMPLO.n6 ?? null} />);
    const botao = screen.getByRole("button", { name: /^Descarregar PDF do orçamento de .*8\.600/ });
    expect(botao).toHaveTextContent("Descarregar PDF");
    expect(botao).toHaveAttribute("type", "button");
    expect(botao).not.toHaveAccessibleDescription();
  });

  it("a proposta e o contrato têm o seu nome; a minuta (rascunho, por assinar) explica-se na descrição", () => {
    const { unmount } = render(<BotaoPdf documento={{ tipo: "proposta" }} negocio={negocio("n9")} detalhe={null} />);
    expect(screen.getByRole("button", { name: "Descarregar PDF da proposta" })).toHaveAccessibleDescription(/Minuta/);
    unmount();
    render(<BotaoPdf documento={{ tipo: "contrato" }} negocio={negocio("n10")} detalhe={null} />);
    expect(screen.getByRole("button", { name: "Descarregar PDF do contrato" })).toHaveAccessibleDescription(/Minuta/);
  });

  it("um documento fechado não tem descrição de minuta", () => {
    render(<BotaoPdf documento={{ tipo: "contrato" }} negocio={negocio("n1")} detalhe={null} />);
    expect(screen.getByRole("button", { name: "Descarregar PDF do contrato" })).not.toHaveAccessibleDescription();
  });

  it("ao clicar gera o PDF, descarrega-o com o nome certo e anuncia", async () => {
    render(<BotaoPdf documento={{ tipo: "proposta" }} negocio={negocio("n6")} detalhe={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Descarregar PDF da proposta" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("PDF descarregado (exemplo)"));
    expect(descarregarPdf).toHaveBeenCalledWith(expect.any(Uint8Array), "proposta-n6-8600.pdf");
    expect(erro).not.toHaveBeenCalled();
  });

  it("se a geração falhar, avisa e não descarrega nada", async () => {
    vi.mocked(gerarBytesPdf).mockRejectedValue(new Error("falhou"));
    render(<BotaoPdf documento={{ tipo: "proposta" }} negocio={negocio("n6")} detalhe={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Descarregar PDF da proposta" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Não foi possível gerar o PDF de exemplo."));
    expect(erro).toHaveBeenCalledWith("Não foi possível gerar o PDF de exemplo.");
    expect(descarregarPdf).not.toHaveBeenCalled();
  });
});
