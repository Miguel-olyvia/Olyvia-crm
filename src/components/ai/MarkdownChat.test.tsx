// 26/11: as respostas da Olyvia no chat desenham o markdown (antes apareciam «###» e «**»).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownChat, blocosMarkdown } from "./MarkdownChat";

afterEach(cleanup);

// a resposta real do chat no testarh (26/11), encurtada
const RESPOSTA = `*(Informação atualizada a 26 de novembro de 2026, às 10:46)*

### Obras com decisões dos agentes à espera:
Todas as seguintes obras têm propostas à espera:
1. **Obra 1009 (Rúben Carvalho)** — Várias decisões pendentes.
2. **Obra 1048 (Tiago João Gonçalves Bandarra)** — Períodos sem ninguém.

---

### Valor do negócio:
O negócio 1048 tem uma proposta de **37.661,03 €** (com IVA). Ver [a obra](/negocios?vista=operacoes&obra=1048).`;

describe("o markdown do chat", () => {
  it("parte em blocos: parágrafo, título, lista numerada, linha", () => {
    expect(blocosMarkdown(RESPOSTA).map((b) => b.k)).toEqual(["paragrafo", "titulo", "paragrafo", "lista", "linha", "titulo", "paragrafo"]);
    expect(blocosMarkdown("- a\n- b\n\n1. c").map((b) => (b.k === "lista" ? `${b.ordenada}:${b.itens.join(",")}` : b.k))).toEqual(["false:a,b", "true:c"]);
  });
  it("desenha títulos, negritos, itálicos e listas, sem os símbolos à mostra", () => {
    const { container } = render(<MarkdownChat texto={RESPOSTA} aoLink={() => {}} />);
    expect(container.textContent).not.toMatch(/###|\*\*|^---/);
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual(["Obras com decisões dos agentes à espera:", "Valor do negócio:"]);
    expect(container.querySelector("ol")!.children).toHaveLength(2);
    expect(container.querySelector("strong")!.textContent).toBe("Obra 1009 (Rúben Carvalho)");
    expect(container.querySelector("em")!.textContent).toBe("(Informação atualizada a 26 de novembro de 2026, às 10:46)");
    expect(container.querySelector("hr")).toBeTruthy();
  });
  it("a ligação interna abre a página na app; o texto nunca vira HTML", () => {
    const aoLink = vi.fn();
    const { container } = render(<MarkdownChat texto={`${RESPOSTA}\n\n<img src=x onerror=alert(1)>`} aoLink={aoLink} />);
    fireEvent.click(screen.getByRole("button", { name: /a obra/ }));
    expect(aoLink).toHaveBeenCalledWith("/negocios?vista=operacoes&obra=1048");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});
