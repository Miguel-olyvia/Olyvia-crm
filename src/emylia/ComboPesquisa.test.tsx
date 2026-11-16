// 13/11: o dropdown com pesquisa em texto do Catálogo (marca, categoria, subcategoria): padrão ARIA 1.2, como o das opções dos atributos.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComboPesquisa, type ItemCombo } from "./ComboPesquisa";

afterEach(cleanup);

const ITENS: ItemCombo[] = [
  { id: "a", nome: "Grohe" }, { id: "b", nome: "Roca" }, { id: "c", nome: "Cerâmica Álvaro" }, { id: "d", nome: "Hansgrohe" },
];
interface Opc { atual?: ItemCombo | null; onEscolher?: (i: ItemCombo) => void; onNova?: ((n: string) => void) | undefined; desativado?: boolean; itens?: ItemCombo[]; textoNova?: string }
const montar = (o: Opc = {}) => {
  const onEscolher = o.onEscolher ?? vi.fn();
  render(<ComboPesquisa rotulo="Marca" itens={o.itens ?? ITENS} atual={o.atual ?? null} onEscolher={onEscolher} onNova={"onNova" in o ? o.onNova : undefined}
    desativado={o.desativado} textoNova={o.textoNova} />);
  return { onEscolher, cb: screen.getByRole("combobox", { name: "Marca" }) as HTMLInputElement };
};
const nomes = () => screen.queryAllByRole("option").map((x) => x.textContent);

describe("ComboPesquisa", () => {
  it("papéis e estados: aria-expanded, aria-controls para a listbox e aria-activedescendant na opção ativa", () => {
    const { cb } = montar({ atual: ITENS[1] });
    expect(cb).toHaveAttribute("aria-expanded", "false");
    expect(cb).not.toHaveAttribute("aria-controls");
    fireEvent.click(cb);
    expect(cb).toHaveAttribute("aria-expanded", "true");
    const lista = screen.getByRole("listbox", { name: "Marca" });
    expect(cb).toHaveAttribute("aria-controls", lista.id);
    // ao abrir, a opção ativa é a escolhida
    expect(document.getElementById(cb.getAttribute("aria-activedescendant")!)).toHaveTextContent("Roca");
    expect(cb).toHaveAttribute("aria-autocomplete", "list");
  });

  it("setas, Home, End, Enter e Esc; a Nova… é o último item", () => {
    const onNova = vi.fn();
    const { cb, onEscolher } = montar({ onNova });
    fireEvent.keyDown(cb, { key: "ArrowDown" }); // fechado: abre
    expect(cb).toHaveAttribute("aria-expanded", "true");
    const ativo = () => document.getElementById(cb.getAttribute("aria-activedescendant")!)?.textContent;
    fireEvent.keyDown(cb, { key: "ArrowDown" });
    expect(ativo()).toBe("Roca");
    fireEvent.keyDown(cb, { key: "End" });
    expect(ativo()).toBe("Nova opção…");
    fireEvent.keyDown(cb, { key: "Home" });
    expect(ativo()).toBe("Grohe");
    fireEvent.keyDown(cb, { key: "ArrowUp" });
    expect(ativo()).toBe("Grohe");
    fireEvent.keyDown(cb, { key: "Escape" });
    expect(cb).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(cb, { key: "ArrowDown" });
    fireEvent.keyDown(cb, { key: "ArrowDown" });
    fireEvent.keyDown(cb, { key: "Enter" });
    expect(cb).toHaveAttribute("aria-expanded", "false");
    expect(onEscolher).toHaveBeenCalledWith(ITENS[1]);
    expect(onNova).not.toHaveBeenCalled();
  });

  it("Esc fecha sem deixar o evento subir; Tab fecha", () => {
    const { cb } = montar();
    const sobe = vi.fn();
    document.addEventListener("keydown", sobe);
    fireEvent.click(cb);
    fireEvent.keyDown(cb, { key: "Escape" });
    document.removeEventListener("keydown", sobe);
    expect(cb).toHaveAttribute("aria-expanded", "false");
    expect(sobe).not.toHaveBeenCalled();
    fireEvent.click(cb);
    fireEvent.keyDown(cb, { key: "Tab" });
    expect(cb).toHaveAttribute("aria-expanded", "false");
  });

  it("pesquisa em texto, sem acentos nem maiúsculas", () => {
    const { cb } = montar();
    fireEvent.change(cb, { target: { value: "CERAMICA" } });
    expect(cb).toHaveAttribute("aria-expanded", "true");
    expect(nomes()).toEqual(["Cerâmica Álvaro"]);
    fireEvent.change(cb, { target: { value: "grohe" } });
    expect(nomes()).toEqual(["Grohe", "Hansgrohe"]);
  });

  it("estado vazio: «Nenhuma opção encontrada», anunciado também na região de estado (sempre montada)", () => {
    const { cb } = montar();
    const estado = screen.getByRole("status");
    expect(estado).toHaveTextContent("");
    fireEvent.change(cb, { target: { value: "zzz" } });
    expect(screen.getByText("Nenhuma opção encontrada", { selector: "p" })).toBeInTheDocument();
    expect(within(screen.queryByRole("listbox") ?? document.body).queryAllByRole("presentation")).toHaveLength(0);
    expect(estado).toHaveTextContent("Nenhuma opção encontrada");
    fireEvent.change(cb, { target: { value: "roca" } });
    expect(estado).toHaveTextContent("1 opção");
    fireEvent.change(cb, { target: { value: "gro" } });
    expect(estado).toHaveTextContent("2 opções");
  });

  it("«Nova …» é opcional: leva o que se escreveu e, sem onNova, não existe", () => {
    const onNova = vi.fn();
    const { cb } = montar({ onNova, textoNova: "Nova marca…" });
    fireEvent.change(cb, { target: { value: "Duravit" } });
    expect(nomes()).toEqual(["Nova marca…"]);
    fireEvent.click(screen.getByRole("option", { name: "Nova marca…" }));
    expect(onNova).toHaveBeenCalledWith("Duravit");
    expect(cb).toHaveAttribute("aria-expanded", "false");
    cleanup();
    const { cb: c2 } = montar();
    fireEvent.change(c2, { target: { value: "Duravit" } });
    expect(nomes()).toEqual([]);
  });

  it("a escolhida aparece no campo e escolher com o rato chama onEscolher", () => {
    const { cb, onEscolher } = montar({ atual: ITENS[0] });
    expect(cb).toHaveValue("Grohe");
    fireEvent.click(cb);
    expect(screen.getByRole("option", { name: /^Grohe/ })).toHaveTextContent("(escolhida)");
    fireEvent.click(screen.getByRole("option", { name: "Roca" }));
    expect(onEscolher).toHaveBeenCalledWith(ITENS[1]);
  });

  it("opção desativada atual: «X (desativada)» no campo e não se pode escolher de novo", () => {
    const { cb, onEscolher } = montar({ atual: { id: "z", nome: "Antiga", inativo: true }, itens: [...ITENS, { id: "z", nome: "Antiga", inativo: true }] });
    expect(cb).toHaveValue("Antiga (desativada)");
    fireEvent.click(cb);
    expect(nomes()).not.toContain("Antiga");
    expect(nomes().some((t) => /Antiga/.test(t ?? ""))).toBe(false);
    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(onEscolher).toHaveBeenCalledWith(ITENS[0]);
  });

  it("ao focar com valor escolhido, seleciona o texto para escrever por cima", () => {
    const { cb } = montar({ atual: ITENS[1] });
    const sel = vi.spyOn(cb, "select");
    fireEvent.focus(cb);
    expect(sel).toHaveBeenCalled();
  });

  it("o rato no menu não tira o foco do campo (mousedown prevenido)", () => {
    const { cb } = montar();
    fireEvent.click(cb);
    const ok = fireEvent.mouseDown(screen.getByRole("listbox"));
    expect(ok).toBe(false); // preventDefault foi chamado
  });

  it("o scroll da opção ativa é só por teclado: o rato por cima não rola", () => {
    const rolar = vi.fn();
    Element.prototype.scrollIntoView = rolar;
    const { cb } = montar();
    fireEvent.click(cb);
    rolar.mockClear();
    fireEvent.mouseEnter(screen.getByRole("option", { name: "Roca" }));
    expect(rolar).not.toHaveBeenCalled();
    fireEvent.keyDown(cb, { key: "ArrowDown" });
    expect(rolar).toHaveBeenCalled();
  });

  it("desativado: o campo não abre", () => {
    const { cb } = montar({ desativado: true });
    expect(cb).toBeDisabled();
    fireEvent.click(cb);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("sair do campo sem escolher volta ao valor e fecha a lista", () => {
    const { cb } = montar({ atual: ITENS[1] });
    fireEvent.change(cb, { target: { value: "gro" } });
    expect(cb).toHaveAttribute("aria-expanded", "true");
    fireEvent.blur(cb);
    expect(cb).toHaveAttribute("aria-expanded", "false");
    expect(cb).toHaveValue("Roca");
  });

  it("com «semValor»: o primeiro item limpa a escolha (id vazio) e some quando se escreve para procurar", () => {
    const onEscolher = vi.fn();
    render(<ComboPesquisa rotulo="Marca" itens={ITENS} atual={ITENS[0]} onEscolher={onEscolher} semValor="Sem marca" />);
    const cb = screen.getByRole("combobox", { name: "Marca" });
    fireEvent.click(cb);
    expect(nomes()[0]).toBe("Sem marca");
    fireEvent.click(screen.getByRole("option", { name: "Sem marca" }));
    expect(onEscolher).toHaveBeenCalledWith({ id: "", nome: "" });
    fireEvent.change(cb, { target: { value: "roc" } });
    expect(nomes()).toEqual(["Roca"]);
  });

  it("aria-selected marca a ESCOLHIDA (não a ativa, que se anuncia por aria-activedescendant)", () => {
    const { cb } = montar({ atual: ITENS[1] });
    fireEvent.click(cb);
    fireEvent.keyDown(cb, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /^Roca/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Cerâmica Álvaro" })).toHaveAttribute("aria-selected", "false");
    expect(document.getElementById(cb.getAttribute("aria-activedescendant")!)).toHaveTextContent("Cerâmica Álvaro");
  });

  it("tocar no campo com texto escrito não o apaga; com o campo vazio, fecha", () => {
    const { cb } = montar();
    fireEvent.change(cb, { target: { value: "gro" } });
    fireEvent.click(cb);
    expect(cb).toHaveValue("gro");
    expect(cb).toHaveAttribute("aria-expanded", "true");
    fireEvent.change(cb, { target: { value: "" } });
    fireEvent.click(cb);
    expect(cb).toHaveAttribute("aria-expanded", "false");
  });

  it("a região de estado conta também a «Nova …»", () => {
    const { cb } = montar({ onNova: vi.fn(), textoNova: "Nova marca…" });
    fireEvent.change(cb, { target: { value: "roc" } });
    expect(screen.getByRole("status")).toHaveTextContent("1 opção, e Nova marca…");
    fireEvent.change(cb, { target: { value: "zzz" } });
    expect(screen.getByRole("status")).toHaveTextContent("Nenhuma opção encontrada, e Nova marca…");
  });

  it("controlado por quem usa: escolher troca o valor mostrado", () => {
    function Pai() {
      const [v, setV] = useState<ItemCombo | null>(null);
      return <ComboPesquisa rotulo="Marca" itens={ITENS} atual={v} onEscolher={setV} />;
    }
    render(<Pai />);
    const cb = screen.getByRole("combobox", { name: "Marca" });
    fireEvent.click(cb);
    fireEvent.click(screen.getByRole("option", { name: "Roca" }));
    expect(cb).toHaveValue("Roca");
  });
});

// 16/11: a lista aberta tem de SOBREPOR o cartão seguinte: vai num portal para o <body>, com position: fixed junto ao campo
describe("ComboPesquisa · a lista flutua por cima de tudo", () => {
  const retangulo = (r: { left: number; top: number; width: number; height: number }) => () =>
    ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => ({}) }) as DOMRect;
  const comRetangulo = (cb: HTMLElement, r: { left: number; top: number; width: number; height: number }) => {
    const caixa = cb.parentElement as HTMLElement; // o wrapper que a lista acompanha
    caixa.getBoundingClientRect = retangulo(r);
    return caixa;
  };

  it("o listbox está no <body>, fora do wrapper do campo, e é fixo com z-index acima dos cartões e dos diálogos", () => {
    const { cb } = montar();
    comRetangulo(cb, { left: 40, top: 100, width: 300, height: 44 });
    fireEvent.click(cb);
    const lista = screen.getByRole("listbox", { name: "Marca" });
    const flutuante = lista.closest("[data-lista-flutuante]") as HTMLElement;
    expect(flutuante.parentElement).toBe(document.body);
    expect(cb.parentElement!.contains(lista)).toBe(false);
    expect(flutuante.style.position).toBe("fixed");
    expect(Number(flutuante.style.zIndex)).toBeGreaterThan(610); // diálogos: 600/610
    expect(Number(flutuante.style.zIndex)).toBeLessThan(700); // popovers e selects: 700
  });

  it("tem a largura do campo e fica logo por baixo dele quando há espaço", () => {
    const { cb } = montar();
    comRetangulo(cb, { left: 40, top: 100, width: 300, height: 44 });
    fireEvent.click(cb);
    const f = screen.getByRole("listbox").closest("[data-lista-flutuante]") as HTMLElement;
    expect(f.style.width).toBe("300px");
    expect(f.style.left).toBe("40px");
    expect(f.style.top).toBe("148px"); // 100 + 44 + folga de 4
    expect(f.style.bottom).toBe("");
    expect(f).not.toHaveAttribute("data-para-cima");
  });

  it("sem espaço por baixo, abre para cima (colada ao topo do campo)", () => {
    const { cb } = montar();
    const alturaJanela = window.innerHeight;
    comRetangulo(cb, { left: 10, top: alturaJanela - 60, width: 200, height: 44 });
    fireEvent.click(cb);
    const f = screen.getByRole("listbox").closest("[data-lista-flutuante]") as HTMLElement;
    expect(f).toHaveAttribute("data-para-cima");
    expect(f.style.top).toBe("");
    expect(f.style.bottom).toBe("64px"); // 60 + folga de 4
  });

  it("acompanha o campo quando um contentor com scroll rola e quando a janela muda de tamanho", async () => {
    const { cb } = montar();
    const caixa = comRetangulo(cb, { left: 40, top: 100, width: 300, height: 44 });
    fireEvent.click(cb);
    const f = () => screen.getByRole("listbox").closest("[data-lista-flutuante]") as HTMLElement;
    expect(f().style.top).toBe("148px");
    caixa.getBoundingClientRect = retangulo({ left: 40, top: 20, width: 300, height: 44 });
    fireEvent.scroll(document.body); // o scroll de um contentor não borbulha: apanha-se em capture, na janela
    await waitFor(() => expect(f().style.top).toBe("68px")); // o recálculo vai num requestAnimationFrame
    caixa.getBoundingClientRect = retangulo({ left: 70, top: 20, width: 260, height: 44 });
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(f().style.left).toBe("70px"));
    expect(f().style.width).toBe("260px");
    expect(screen.getByRole("listbox")).toBeInTheDocument(); // rolar (com o campo à vista) não fecha
  });

  it("L1: muitos eventos de scroll seguidos medem uma só vez por frame", async () => {
    const { cb } = montar();
    const caixa = comRetangulo(cb, { left: 40, top: 100, width: 300, height: 44 });
    fireEvent.click(cb);
    const medir = vi.fn(retangulo({ left: 40, top: 100, width: 300, height: 44 }));
    caixa.getBoundingClientRect = medir;
    for (let i = 0; i < 20; i++) fireEvent.scroll(document.body);
    expect(medir).not.toHaveBeenCalled();
    await waitFor(() => expect(medir).toHaveBeenCalledTimes(1));
  });

  it("M3: se o campo sai da vista (rolou para fora da janela), a lista fecha", async () => {
    const { cb } = montar();
    const caixa = comRetangulo(cb, { left: 40, top: 100, width: 300, height: 44 });
    fireEvent.click(cb);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    caixa.getBoundingClientRect = retangulo({ left: 40, top: -200, width: 300, height: 44 }); // fim do campo acima da janela
    fireEvent.scroll(document.body);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(cb).toHaveAttribute("aria-expanded", "false");
  });

  it("M3: também fecha quando o campo sai da área visível de um contentor com scroll", async () => {
    render(<div data-testid="contentor" style={{ overflowY: "auto" }}><ComboPesquisa rotulo="Cor" itens={ITENS} atual={null} onEscolher={vi.fn()} /></div>);
    const cb = screen.getByRole("combobox", { name: "Cor" });
    const contentor = screen.getByTestId("contentor");
    contentor.getBoundingClientRect = retangulo({ left: 0, top: 100, width: 400, height: 200 }); // visível: 100..300
    comRetangulo(cb, { left: 10, top: 150, width: 300, height: 44 });
    fireEvent.click(cb);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    cb.parentElement!.getBoundingClientRect = retangulo({ left: 10, top: 320, width: 300, height: 44 }); // abaixo do fundo do contentor
    fireEvent.scroll(contentor);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("M2: com window.visualViewport (teclado virtual), o espaço conta-se pela área visível", () => {
    const vv = { height: 300, offsetTop: 0, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    try {
      const { cb } = montar();
      comRetangulo(cb, { left: 10, top: 200, width: 280, height: 44 }); // por baixo só há 300 − 244 − 12 = 44 px de área visível
      fireEvent.click(cb);
      const f = screen.getByRole("listbox").closest("[data-lista-flutuante]") as HTMLElement;
      expect(f).toHaveAttribute("data-para-cima"); // com innerHeight (768) abriria para baixo
      expect(vv.addEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
      expect(vv.addEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
      fireEvent.keyDown(cb, { key: "Escape" });
      expect(vv.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    } finally {
      Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
    }
  });

  it("fechar tira a lista do <body> e deixa de ouvir o scroll", () => {
    const { cb } = montar();
    fireEvent.click(cb);
    fireEvent.keyDown(cb, { key: "Escape" });
    expect(document.querySelector("[data-lista-flutuante]")).toBeNull();
    expect(() => fireEvent.scroll(document.body)).not.toThrow();
  });

  it("escolher com um clique na lista (no <body>) continua a funcionar e o rato não tira o foco ao campo", () => {
    const { cb, onEscolher } = montar();
    fireEvent.click(cb);
    expect(fireEvent.mouseDown(screen.getByRole("listbox"))).toBe(false); // preventDefault: o input não perde o foco
    fireEvent.click(screen.getByRole("option", { name: "Roca" }));
    expect(onEscolher).toHaveBeenCalledWith(ITENS[1]);
  });
});
