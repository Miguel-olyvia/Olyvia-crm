// A amostra de uma opção de atributo: foto > hex > quadrado neutro tracejado. Decorativa (o nome vem escrito ao lado).
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => ({ buckets: [] as string[], falhar: false }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: (b: string) => {
        sb.buckets.push(b);
        return { getPublicUrl: (p: string) => { if (sb.falhar) throw new Error("sem storage"); return { data: { publicUrl: `https://cdn.teste/${b}/${p}` } }; } };
      },
    },
  },
}));

import { AmostraOpcao } from "./AmostraOpcao";

afterEach(() => { cleanup(); sb.buckets = []; sb.falhar = false; });
const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const CAMINHO = `${ORG}/11111111-1111-4111-a111-111111111111.webp`;
const raiz = (c: HTMLElement) => c.firstElementChild as HTMLElement;

describe("AmostraOpcao", () => {
  it("com foto desenha a imagem (URL pública do bucket catalogo-opcoes), decorativa e preguiçosa", () => {
    const { container } = render(<AmostraOpcao foto={CAMINHO} hex="#112233" nome="Carvalho" testId="a" />);
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe(`https://cdn.teste/catalogo-opcoes/${CAMINHO}`);
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(raiz(container)).toHaveAttribute("aria-hidden", "true");
    expect(sb.buckets).toContain("catalogo-opcoes");
  });
  it("a foto vence o hex (a imagem cobre-o), mas o hex fica por baixo enquanto a foto carrega", () => {
    const { container } = render(<AmostraOpcao foto={CAMINHO} hex="#112233" nome="Carvalho" />);
    expect(container.querySelector("img")).not.toBeNull();
    expect(raiz(container).style.backgroundColor).toBe("rgb(17, 34, 51)");
    expect(raiz(container).className).not.toContain("border-dashed");
  });
  it("só com foto (sem hex) não é o neutro tracejado", () => {
    const { container } = render(<AmostraOpcao foto={CAMINHO} hex={null} nome="Carvalho" />);
    expect(container.querySelector("img")).not.toBeNull();
    expect(raiz(container).className).not.toContain("border-dashed");
  });
  it("sem foto, o hex desenha o quadrado e fica em data-hex", () => {
    const { container } = render(<AmostraOpcao foto={null} hex="#112233" nome="Azul" testId="a" />);
    expect(container.querySelector("img")).toBeNull();
    expect(raiz(container)).toHaveAttribute("data-hex", "#112233");
    expect(raiz(container).style.backgroundColor).toBe("rgb(17, 34, 51)");
  });
  it("sem foto nem hex, é o quadrado neutro tracejado (data-hex vazio)", () => {
    const { container } = render(<AmostraOpcao hex={null} nome="Pedra" />);
    expect(container.querySelector("img")).toBeNull();
    expect(raiz(container)).toHaveAttribute("data-hex", "");
    expect(raiz(container).className).toContain("border-dashed");
  });
  it("se a imagem falhar, volta ao hex (e ao neutro se não houver hex)", () => {
    const { container, rerender } = render(<AmostraOpcao foto={CAMINHO} hex="#112233" nome="Azul" />);
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
    expect(raiz(container)).toHaveAttribute("data-hex", "#112233");
    rerender(<AmostraOpcao foto={CAMINHO} hex={null} nome="Azul" />);
    expect(raiz(container)).toHaveAttribute("data-hex", "");
    expect(raiz(container).className).toContain("border-dashed");
  });
  it("a falha de uma foto não se agarra a outra: trocar de foto tenta de novo", () => {
    const outra = `${ORG}/22222222-2222-4222-a222-222222222222.webp`;
    const { container, rerender } = render(<AmostraOpcao foto={CAMINHO} hex={null} nome="A" />);
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
    rerender(<AmostraOpcao foto={outra} hex={null} nome="A" />);
    expect(container.querySelector("img")?.getAttribute("src")).toContain(outra);
  });
  it("se o storage não responde (cliente sem storage), cai no hex sem rebentar", () => {
    sb.falhar = true;
    const { container } = render(<AmostraOpcao foto={CAMINHO} hex="#112233" nome="Azul" />);
    expect(container.querySelector("img")).toBeNull();
    expect(raiz(container)).toHaveAttribute("data-hex", "#112233");
  });
  it("o tamanho é em píxeis (24 por omissão)", () => {
    const { container, rerender } = render(<AmostraOpcao hex="#112233" nome="A" />);
    expect(raiz(container).style.width).toBe("24px");
    rerender(<AmostraOpcao hex="#112233" nome="A" tamanho={96} />);
    expect(raiz(container).style.width).toBe("96px");
    expect(raiz(container).style.height).toBe("96px");
  });
});
