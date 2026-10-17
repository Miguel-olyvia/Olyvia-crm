// Defesa do ProcessoProvider: o pedido só sai se o negócio foi criado para a MESMA pessoa do painel (o seletor da pessoa já não se muda,
// mas quem chama o `aoCriar` pode trazer outra). Usa um diálogo simulado que devolve os dados que se quiser.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import type { DadosCriarNegocio } from "@/components/negocio-metas/novoNegocio";
import { feitaComLinhas, Gatilho, itemDe, renderizar } from "./arnesProcesso";

vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ language: "pt", t: (key: string) => key }) }));
vi.mock("@/components/negocio-metas/NovoNegocioDialogo", () => ({
  NovoNegocioDialogo: ({ aoCriar, aberto }: { aoCriar: (d: DadosCriarNegocio) => void; aberto: boolean }) => (aberto ? (
    <div>
      <button type="button" onClick={() => aoCriar({ pessoa: { id: "a", nome: "a" }, comercial: "Ana Ribeiro" })}>criar para a mesma</button>
      <button type="button" onClick={() => aoCriar({ pessoa: { id: "outra", nome: "Outra" }, comercial: "Ana Ribeiro" })}>criar para outra</button>
    </div>
  ) : null),
}));

describe("ProcessoProvider: a pessoa do negócio criado a partir de um pedido", () => {
  const abrirPainel = () => {
    const { r, item } = itemDe(feitaComLinhas());
    const resultado = renderizar(r, <Gatilho item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    return resultado;
  };

  it("para a mesma pessoa, o pedido sai", async () => {
    const { a, aoCriarNegocio } = abrirPainel();
    fireEvent.click(await screen.findByRole("button", { name: "criar para a mesma" }));
    expect(aoCriarNegocio).toHaveBeenCalledTimes(1);
    expect(a.removerPedido).toHaveBeenCalledExactlyOnceWith("pd-1");
  });

  it("para outra pessoa, o negócio cria-se e o pedido da primeira NÃO sai", async () => {
    const { a, aoCriarNegocio } = abrirPainel();
    fireEvent.click(await screen.findByRole("button", { name: "criar para outra" }));
    expect(aoCriarNegocio).toHaveBeenCalledTimes(1);
    expect(aoCriarNegocio.mock.calls[0][0]).not.toHaveProperty("servico");
    expect(a.removerPedido).not.toHaveBeenCalled();
  });
});
