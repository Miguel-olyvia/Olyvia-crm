// 13/11: o dropdown com pesquisa em texto do Catálogo (marca, categoria, subcategoria): padrão ARIA 1.2, como o das opções dos atributos.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
