// 03/11: o cartão do produto na seleção guiada mostra a foto do produto (products.image_urls[0]); sem ela, a ilustração.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { CartaoProduto } from "./CartoesSelecao";

MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

const cartao = (fotos?: string[] | null) =>
  render(<CartaoProduto nome="Torneira" nomeCompleto="Torneira Teste" preco={50} un="un" img="torneira" fotos={fotos} on={false} onTocar={vi.fn()} />);

describe("CartaoProduto · foto do produto (03/11)", () => {
  it("com fotos mostra a 1.ª (lazy, alt = nome completo) no lugar da ilustração", () => {
    const { container } = cartao(["https://x.supabase.co/a.webp", "https://x.supabase.co/b.webp"]);
    const img = screen.getByRole("img", { name: "Torneira Teste" });
    expect(img).toHaveAttribute("src", "https://x.supabase.co/a.webp");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(container.querySelector("svg[data-ilustracao]")).toBeNull();
  });
  it("se a foto falhar ao carregar, volta a ilustração", () => {
    const { container } = cartao(["https://x.supabase.co/a.webp"]);
    fireEvent.error(screen.getByRole("img", { name: "Torneira Teste" }));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('svg[data-ilustracao="torneira"]')).not.toBeNull();
  });
  it("sem fotos mostra a ilustração", () => {
    for (const f of [undefined, null, []]) {
      const { container, unmount } = cartao(f);
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector('svg[data-ilustracao="torneira"]')).not.toBeNull();
      unmount();
    }
  });
});
