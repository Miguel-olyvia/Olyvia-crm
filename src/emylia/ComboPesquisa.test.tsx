// 13/11: o dropdown com pesquisa em texto do Catálogo (marca, categoria, subcategoria).
// 18/11: passou ao padrão «botão + painel com pesquisa»: fechado é só um botão com a escolha atual; o que se escreve vai para o campo de pesquisa
// do painel (que só existe em listas com mais de 7 opções), nunca para o botão.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComboPesquisa, type ItemCombo } from "./ComboPesquisa";
import { posicaoDaLista } from "./listaFlutuante";

afterEach(cleanup);

const ITENS: ItemCombo[] = [
  { id: "a", nome: "Grohe" }, { id: "b", nome: "Roca" }, { id: "c", nome: "Cerâmica Álvaro" }, { id: "d", nome: "Hansgrohe" },
];
/** Mais de 7 opções: o painel mostra o campo de pesquisa. */
const LONGA: ItemCombo[] = [
  ...ITENS,
  { id: "e", nome: "Duravit" }, { id: "f", nome: "Geberit" }, { id: "g", nome: "Ideal Standard" }, { id: "h", nome: "Jacob Delafon" },
];
interface Opc {
  atual?: ItemCombo | null; onEscolher?: (i: ItemCombo) => void; onNova?: ((n: string) => void) | undefined; desativado?: boolean; itens?: ItemCombo[];
  textoNova?: string; semValor?: string; semValorComoValor?: boolean; placeholder?: string; vazio?: string; pesquisavel?: boolean;
}
const montar = (o: Opc = {}) => {
  const onEscolher = o.onEscolher ?? vi.fn();
  render(<ComboPesquisa rotulo="Marca" itens={o.itens ?? ITENS} atual={o.atual ?? null} onEscolher={onEscolher} onNova={"onNova" in o ? o.onNova : undefined}
    desativado={o.desativado} textoNova={o.textoNova} semValor={o.semValor} semValorComoValor={o.semValorComoValor} placeholder={o.placeholder} vazio={o.vazio}
    pesquisavel={o.pesquisavel} />);
  return { onEscolher, cb: screen.getByRole("combobox", { name: "Marca" }) as HTMLButtonElement };
};
const pesquisa = () => screen.getByRole("combobox", { name: "Pesquisar Marca" }) as HTMLInputElement;
const semPesquisa = () => screen.queryByRole("combobox", { name: "Pesquisar Marca" });
const escrever = (t: string) => fireEvent.change(pesquisa(), { target: { value: t } });
const nomes = () => screen.queryAllByRole("option").map((x) => x.textContent);

describe("ComboPesquisa · o campo fechado é um botão", () => {
  it("é um botão (role=combobox) com a escolha atual, sem painel nem campo de pesquisa", () => {
    const { cb } = montar({ atual: ITENS[1] });
    expect(cb.tagName).toBe("BUTTON");
    expect(cb).toHaveAttribute("type", "button");
    expect(cb).toHaveAttribute("aria-haspopup", "listbox");
    expect(cb).toHaveAttribute("aria-expanded", "false");
    expect(cb).not.toHaveAttribute("aria-controls");
    expect(cb).toHaveTextContent("Roca");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getAllByRole("combobox")).toHaveLength(1); // só o botão: a pesquisa só existe com o painel aberto
  });

  it("sem escolha mostra o placeholder (suave); com semValorComoValor mostra o texto de semValor como valor", () => {
    const { cb } = montar({ placeholder: "Escolher a marca" });
    expect(cb).toHaveTextContent("Escolher a marca");
    cleanup();
    const { cb: c2 } = montar({ semValor: "Todas as marcas", semValorComoValor: true });
    expect(c2).toHaveTextContent("Todas as marcas");
  });

  it("escrever no painel nunca altera o botão («Todas as marcas» + «aaaa» não fica colado)", () => {
    const { cb } = montar({ itens: LONGA, semValor: "Todas as marcas", semValorComoValor: true });
    fireEvent.click(cb);
    escrever("aaaa");
    expect(pesquisa()).toHaveValue("aaaa");
    expect(cb).toHaveTextContent(/^Todas as marcas$/);
    expect(cb.textContent).not.toContain("aaaa");
    fireEvent.keyDown(pesquisa(), { key: "Escape" });
    expect(cb).toHaveTextContent(/^Todas as marcas$/);
  });

  it("papéis e estados: aria-expanded e aria-controls para a listbox ao abrir", () => {
    const { cb } = montar({ atual: ITENS[1] });
    fireEvent.click(cb);
    expect(cb).toHaveAttribute("aria-expanded", "true");
    const lista = screen.getByRole("listbox", { name: "Marca" });
    expect(cb).toHaveAttribute("aria-controls", lista.id);
  });

  it("abre com clique e com a seta para baixo (e para cima); Enter e Espaço são cliques nativos do botão", () => {
    const { cb } = montar();
    fireEvent.keyDown(cb, { key: "ArrowDown" });
    expect(cb).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(cb).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(cb, { key: "ArrowUp" });
    expect(cb).toHaveAttribute("aria-expanded", "true");
  });

  it("um segundo clique no botão fecha o painel", () => {
    const { cb } = montar();
    fireEvent.click(cb);
    fireEvent.click(cb);
    expect(cb).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("desativado: o botão não abre", () => {
    const { cb } = montar({ desativado: true });
    expect(cb).toBeDisabled();
    fireEvent.click(cb);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("com rótulo visível (id + <label for>) o nome vem do rótulo e o valor anuncia-se (aria-labelledby), sem aria-label; o chamador pode registar o botão", () => {
    const registar = vi.fn();
    render(<><label htmlFor="mc">Marca do produto</label><ComboPesquisa id="mc" rotulo="Marca" itens={ITENS} atual={ITENS[1]} onEscolher={vi.fn()} registar={registar} /></>);
    const cb = screen.getByRole("combobox", { name: "Marca do produto Roca" });
    expect(cb).toHaveAttribute("id", "mc");
    expect(cb).not.toHaveAttribute("aria-label");
    const ids = cb.getAttribute("aria-labelledby")!.split(" ");
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[0])).toBe(document.querySelector("label[for=mc]"));
    expect(document.getElementById(ids[1])).toHaveTextContent("Roca");
    expect(registar).toHaveBeenCalledWith(cb);
  });

  it("sem rótulo visível (sem id, ou id sem <label>) mantém o aria-label", () => {
    const { cb } = montar();
    expect(cb).toHaveAttribute("aria-label", "Marca");
    expect(cb).not.toHaveAttribute("aria-labelledby");
    cleanup();
    render(<ComboPesquisa id="sem-label" rotulo="Marca" itens={ITENS} atual={null} onEscolher={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Marca" })).toHaveAttribute("aria-label", "Marca");
  });

  it("clicar no <label> com o painel aberto não fecha e reabre: o mousedown no rótulo não conta como «fora»", () => {
    render(<><label htmlFor="mc2">Marca</label><ComboPesquisa id="mc2" rotulo="Marca" itens={ITENS} atual={null} onEscolher={vi.fn()} /></>);
    const cb = document.getElementById("mc2") as HTMLButtonElement;
    fireEvent.click(cb);
    fireEvent.mouseDown(document.querySelector("label[for=mc2]")!);
    expect(cb).toHaveAttribute("aria-expanded", "true"); // não foi fechado pelo «fora»; o clique que o rótulo passa ao botão é que o fecha, uma só vez
    fireEvent.click(cb);
    expect(cb).toHaveAttribute("aria-expanded", "false");
  });
});

describe("ComboPesquisa · o painel com pesquisa", () => {
  it("o campo de pesquisa é um combobox (aria-expanded, aria-haspopup, aria-autocomplete, aria-controls para a listbox)", () => {
    const { cb } = montar({ itens: LONGA });
    fireEvent.click(cb);
    const p = pesquisa();
    expect(p).toHaveAttribute("aria-expanded", "true");
    expect(p).toHaveAttribute("aria-haspopup", "listbox");
    expect(p).toHaveAttribute("aria-autocomplete", "list");
    expect(p).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
    expect(cb).toHaveAttribute("aria-label", "Marca"); // o botão continua a ser o combobox com o nome do rótulo
  });

  it("ao abrir, o campo de pesquisa aparece com foco; Esc fecha e devolve o foco ao botão", () => {
    const { cb } = montar({ itens: LONGA });
    fireEvent.click(cb);
    expect(pesquisa()).toHaveFocus();
    expect(pesquisa()).toHaveAttribute("placeholder", "Pesquisar…");
    fireEvent.keyDown(pesquisa(), { key: "Escape" });
    expect(cb).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(cb).toHaveFocus();
  });

  it("Esc fecha sem deixar o evento subir; Tab fecha", () => {
    const { cb } = montar({ itens: LONGA });
    const sobe = vi.fn();
    document.addEventListener("keydown", sobe);
    const sobeAJanela = vi.fn();
    window.addEventListener("keydown", sobeAJanela);
    fireEvent.click(cb);
    fireEvent.keyDown(pesquisa(), { key: "Escape" });
    document.removeEventListener("keydown", sobe);
    window.removeEventListener("keydown", sobeAJanela);
    expect(sobe).not.toHaveBeenCalled();
    expect(sobeAJanela).not.toHaveBeenCalled();
    fireEvent.click(cb);
    fireEvent.keyDown(pesquisa(), { key: "Tab" });
    expect(cb).toHaveAttribute("aria-expanded", "false");
  });

  it("pesquisa em texto, sem acentos nem maiúsculas", () => {
    const { cb } = montar({ itens: LONGA });
    fireEvent.click(cb);
    escrever("CERAMICA");
    expect(nomes()).toEqual(["Cerâmica Álvaro"]);
    escrever("grohe");
    expect(nomes()).toEqual(["Grohe", "Hansgrohe"]);
  });

  it("escolhe com o rato: chama onEscolher, fecha, devolve o foco ao botão e o botão mostra a escolha", () => {
    function Pai() {
      const [v, setV] = useState<ItemCombo | null>(null);
      return <ComboPesquisa rotulo="Marca" itens={LONGA} atual={v} onEscolher={setV} />;
    }
    render(<Pai />);
    const cb = screen.getByRole("combobox", { name: "Marca" });
    fireEvent.click(cb);
    escrever("roc");
    fireEvent.click(screen.getByRole("option", { name: "Roca" }));
    expect(cb).toHaveTextContent("Roca");
    expect(cb).toHaveAttribute("aria-expanded", "false");
    expect(cb).toHaveFocus();
  });

  it("escolhe com Enter a opção ativa; as setas, Home e End movem-na (aria-activedescendant no campo de pesquisa)", () => {
    const { cb, onEscolher } = montar({ itens: LONGA });
    fireEvent.click(cb);
    const ativo = () => document.getElementById(pesquisa().getAttribute("aria-activedescendant")!)?.textContent;
    expect(ativo()).toBe("Grohe");
    fireEvent.keyDown(pesquisa(), { key: "ArrowDown" });
    expect(ativo()).toBe("Roca");
    fireEvent.keyDown(pesquisa(), { key: "End", ctrlKey: true });
    expect(ativo()).toBe("Jacob Delafon");
    fireEvent.keyDown(pesquisa(), { key: "Home" }); // sem texto escrito, Home é da lista
    expect(ativo()).toBe("Grohe");
    fireEvent.keyDown(pesquisa(), { key: "ArrowUp" });
    expect(ativo()).toBe("Grohe");
    fireEvent.keyDown(pesquisa(), { key: "ArrowDown" });
    fireEvent.keyDown(pesquisa(), { key: "Enter" });
    expect(onEscolher).toHaveBeenCalledWith(ITENS[1]);
    expect(cb).toHaveAttribute("aria-expanded", "false");
    expect(cb).toHaveFocus();
  });

  it("com texto escrito, Home e End são do cursor e não da lista", () => {
    const { cb } = montar({ itens: LONGA });
    fireEvent.click(cb);
    escrever("g");
    const antes = pesquisa().getAttribute("aria-activedescendant");
    fireEvent.keyDown(pesquisa(), { key: "End" });
    expect(pesquisa().getAttribute("aria-activedescendant")).toBe(antes);
  });

  it("Enter com a pesquisa filtrada escolhe a primeira opção filtrada", () => {
    const { cb, onEscolher } = montar({ itens: LONGA });
    fireEvent.click(cb);
    escrever("duravit");
    fireEvent.keyDown(pesquisa(), { key: "Enter" });
    expect(onEscolher).toHaveBeenCalledWith(LONGA[4]);
  });

  it("estado vazio: o texto de `vazio` aparece sem resultados, também na região de estado (sempre montada)", () => {
    const { cb } = montar({ itens: LONGA, vazio: "Nenhuma marca encontrada" });
    const estado = screen.getByRole("status");
    expect(estado).toHaveTextContent("");
    fireEvent.click(cb);
    escrever("zzz");
    expect(screen.getByText("Nenhuma marca encontrada", { selector: "p" })).toBeInTheDocument();
    expect(nomes()).toEqual([]);
    expect(estado).toHaveTextContent("Nenhuma marca encontrada");
    escrever("roca");
    expect(estado).toHaveTextContent("1 opção");
    escrever("gro");
    expect(estado).toHaveTextContent("2 opções");
    fireEvent.keyDown(pesquisa(), { key: "Escape" });
    expect(estado.textContent).toBe("");
  });

  it("a pesquisa apaga-se quando o painel fecha", () => {
    const { cb } = montar({ itens: LONGA });
    fireEvent.click(cb);
    escrever("roc");
    fireEvent.keyDown(pesquisa(), { key: "Escape" });
    fireEvent.click(cb);
    expect(pesquisa()).toHaveValue("");
    expect(nomes()).toHaveLength(LONGA.length);
  });

  it("clicar fora fecha o painel; clicar dentro do painel (no campo de pesquisa) não", () => {
    const { cb } = montar({ itens: LONGA });
    fireEvent.click(cb);
    fireEvent.mouseDown(pesquisa());
    expect(cb).toHaveAttribute("aria-expanded", "true");
    fireEvent.mouseDown(document.body);
    expect(cb).toHaveAttribute("aria-expanded", "false");
  });

  it("«Nova …» é opcional: leva o que se escreveu na pesquisa e, sem onNova, não existe", () => {
    const onNova = vi.fn();
    const { cb } = montar({ itens: LONGA, onNova, textoNova: "Nova marca…" });
    fireEvent.click(cb);
    escrever("Duravi");
    expect(nomes()).toEqual(["Duravit", "Nova marca…"]);
    escrever("Kohler");
    expect(nomes()).toEqual(["Nova marca…"]);
    fireEvent.click(screen.getByRole("option", { name: "Nova marca…" }));
    expect(onNova).toHaveBeenCalledWith("Kohler");
    expect(cb).toHaveAttribute("aria-expanded", "false");
    cleanup();
    const { cb: c2 } = montar({ itens: LONGA });
    fireEvent.click(c2);
    escrever("Kohler");
    expect(nomes()).toEqual([]);
  });

  it("a região de estado conta também a «Nova …»", () => {
    const { cb } = montar({ itens: LONGA, onNova: vi.fn(), textoNova: "Nova marca…" });
    fireEvent.click(cb);
    escrever("roc");
    expect(screen.getByRole("status")).toHaveTextContent("2 opções"); // conta as opções do listbox: Roca e «Nova marca…»
    escrever("zzz");
    expect(screen.getByRole("status")).toHaveTextContent("Nenhuma opção encontrada, e Nova marca…");
  });

  it("com «semValor»: o primeiro item limpa a escolha (id vazio) e some quando se escreve para procurar", () => {
    const { cb, onEscolher } = montar({ itens: LONGA, atual: ITENS[0], semValor: "Sem marca" });
    fireEvent.click(cb);
    expect(nomes()[0]).toBe("Sem marca");
    escrever("roc");
    expect(nomes()).toEqual(["Roca"]);
    escrever("");
    fireEvent.click(screen.getByRole("option", { name: "Sem marca" }));
    expect(onEscolher).toHaveBeenCalledWith({ id: "", nome: "" });
  });

  it("com semValorComoValor, a opção «sem valor» é a marcada (aria-selected) quando não há escolha", () => {
    const { cb } = montar({ semValor: "Todas as marcas", semValorComoValor: true });
    fireEvent.click(cb);
    expect(screen.getByRole("option", { name: "Todas as marcas" })).toHaveAttribute("aria-selected", "true");
  });

  it("opção desativada atual: «X (desativada)» no botão e não se pode escolher de novo", () => {
    const { cb, onEscolher } = montar({ atual: { id: "z", nome: "Antiga", inativo: true }, itens: [...ITENS, { id: "z", nome: "Antiga", inativo: true }] });
    expect(cb).toHaveTextContent("Antiga (desativada)");
    fireEvent.click(cb);
    expect(nomes().some((t) => /Antiga/.test(t ?? ""))).toBe(false);
    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(onEscolher).toHaveBeenCalledWith(ITENS[0]);
  });

  it("aria-selected marca a ESCOLHIDA (não a ativa, que se anuncia por aria-activedescendant) e a escolhida é a ativa ao abrir", () => {
    const { cb } = montar({ atual: ITENS[1], itens: LONGA });
    fireEvent.click(cb);
    expect(document.getElementById(pesquisa().getAttribute("aria-activedescendant")!)).toHaveTextContent("Roca");
    fireEvent.keyDown(pesquisa(), { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "Roca" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Roca" })).not.toHaveTextContent("(escolhida)"); // já há aria-selected
    expect(screen.getByRole("option", { name: "Cerâmica Álvaro" })).toHaveAttribute("aria-selected", "false");
    expect(document.getElementById(pesquisa().getAttribute("aria-activedescendant")!)).toHaveTextContent("Cerâmica Álvaro");
  });

  it("o scroll da opção ativa é só por teclado: o rato por cima não rola", () => {
    const rolar = vi.fn();
    Element.prototype.scrollIntoView = rolar;
    const { cb } = montar({ itens: LONGA });
    fireEvent.click(cb);
    rolar.mockClear();
    fireEvent.mouseEnter(screen.getByRole("option", { name: "Roca" }));
    expect(rolar).not.toHaveBeenCalled();
    fireEvent.keyDown(pesquisa(), { key: "ArrowDown" });
    expect(rolar).toHaveBeenCalled();
  });

  it("o rato na lista não tira o foco (mousedown prevenido), mas no campo de pesquisa não é prevenido (para o poder focar)", () => {
    const { cb } = montar({ itens: LONGA });
    fireEvent.click(cb);
    expect(fireEvent.mouseDown(screen.getByRole("listbox"))).toBe(false);
    expect(fireEvent.mouseDown(pesquisa())).toBe(true);
  });

  it("o painel tem a pesquisa por cima e as opções por baixo, com 44 px de altura mínima", () => {
    const { cb } = montar({ itens: LONGA });
    fireEvent.click(cb);
    const lista = screen.getByRole("listbox");
    expect(pesquisa().compareDocumentPosition(lista) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("option")[0].className).toContain("min-h-11");
    expect(pesquisa().className).toContain("h-11");
    expect(cb.className).toContain("min-h-11");
    expect(lista.className).toContain("overflow-auto");
  });

  it("a opção ativa tem um indicador visível além do fundo (anel interior), e só ela", () => {
    const { cb } = montar({ itens: LONGA });
    fireEvent.click(cb);
    const [primeira, segunda] = screen.getAllByRole("option");
    expect(primeira.className).toContain("ring-2");
    expect(primeira.className).toContain("ring-inset");
    expect(primeira.className).toContain("ring-ring");
    expect(segunda.className).not.toContain("ring-2");
    fireEvent.keyDown(pesquisa(), { key: "ArrowDown" });
    expect(segunda.className).toContain("ring-2");
    expect(primeira.className).not.toContain("ring-2");
  });

  it("a opção «sem valor» ativa usa a cor do texto normal (não a suave)", () => {
    const { cb } = montar({ itens: LONGA, semValor: "Sem marca" });
    fireEvent.click(cb);
    const limpar = screen.getByRole("option", { name: "Sem marca" });
    expect(limpar.firstElementChild!.className).toContain("text-foreground");
    fireEvent.keyDown(pesquisa(), { key: "ArrowDown" });
    expect(limpar.firstElementChild!.className).toContain("text-muted-foreground");
  });

  it("o campo de pesquisa fixa-se ao abrir: se a lista crescer com o painel aberto, não aparece a meio", () => {
    const { rerender } = render(<ComboPesquisa rotulo="Marca" itens={ITENS} atual={null} onEscolher={vi.fn()} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Marca" }));
    expect(semPesquisa()).toBeNull();
    rerender(<ComboPesquisa rotulo="Marca" itens={LONGA} atual={null} onEscolher={vi.fn()} />);
    expect(semPesquisa()).toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(LONGA.length);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    fireEvent.click(screen.getByRole("combobox", { name: "Marca" }));
    expect(pesquisa()).toBeInTheDocument(); // ao reabrir, já conta
  });

  it("o teclado no listbox funciona também quando há campo de pesquisa (o handler mantém-se nos dois casos)", () => {
    const { cb, onEscolher } = montar({ itens: LONGA });
    fireEvent.click(cb);
    const lista = screen.getByRole("listbox");
    fireEvent.keyDown(lista, { key: "ArrowDown" });
    fireEvent.keyDown(lista, { key: "Enter" });
    expect(onEscolher).toHaveBeenCalledWith(ITENS[1]);
  });
});

describe("ComboPesquisa · listas curtas (7 opções ou menos) não têm campo de pesquisa", () => {
  const SETE: ItemCombo[] = Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, nome: `Opção ${i + 1}` }));
  const OITO: ItemCombo[] = [...SETE, { id: "s7", nome: "Opção 8" }];

  it("com 4 ou 7 opções não há campo de pesquisa; com 8 há", () => {
    const { cb } = montar();
    fireEvent.click(cb);
    expect(semPesquisa()).toBeNull();
    cleanup();
    const { cb: c7 } = montar({ itens: SETE });
    fireEvent.click(c7);
    expect(semPesquisa()).toBeNull();
    cleanup();
    const { cb: c8 } = montar({ itens: OITO });
    fireEvent.click(c8);
    expect(pesquisa()).toBeInTheDocument();
  });

  it("`pesquisavel` explícito força: true mostra numa lista curta e false esconde numa longa", () => {
    const { cb } = montar({ pesquisavel: true });
    fireEvent.click(cb);
    expect(pesquisa()).toBeInTheDocument();
    cleanup();
    const { cb: c2 } = montar({ itens: LONGA, pesquisavel: false });
    fireEvent.click(c2);
    expect(semPesquisa()).toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(LONGA.length);
  });

  it("a lista recebe o foco ao abrir; setas, Home e End movem a opção ativa (aria-activedescendant) e Enter escolhe", () => {
    const { cb, onEscolher } = montar({ atual: ITENS[0] });
    fireEvent.click(cb);
    const lista = screen.getByRole("listbox", { name: "Marca" });
    expect(lista).toHaveFocus();
    const ativo = () => document.getElementById(lista.getAttribute("aria-activedescendant")!)?.textContent;
    expect(ativo()).toBe("Grohe");
    fireEvent.keyDown(lista, { key: "ArrowDown" });
    expect(ativo()).toBe("Roca");
    fireEvent.keyDown(lista, { key: "End" });
    expect(ativo()).toBe("Hansgrohe");
    fireEvent.keyDown(lista, { key: "Home" });
    expect(ativo()).toBe("Grohe");
    fireEvent.keyDown(lista, { key: "ArrowDown" });
    fireEvent.keyDown(lista, { key: "Enter" });
    expect(onEscolher).toHaveBeenCalledWith(ITENS[1]);
    expect(cb).toHaveFocus();
  });

  it("type-ahead simples: a primeira letra salta para a opção (sem acentos) e volta ao princípio", () => {
    const { cb } = montar();
    fireEvent.click(cb);
    const lista = screen.getByRole("listbox");
    const ativo = () => document.getElementById(lista.getAttribute("aria-activedescendant")!)?.textContent;
    fireEvent.keyDown(lista, { key: "h" });
    expect(ativo()).toBe("Hansgrohe");
    fireEvent.keyDown(lista, { key: "c" });
    expect(ativo()).toBe("Cerâmica Álvaro");
    fireEvent.keyDown(lista, { key: "g" });
    expect(ativo()).toBe("Grohe");
    fireEvent.keyDown(lista, { key: "x" }); // nenhuma começa por x: fica
    expect(ativo()).toBe("Grohe");
  });

  it("Esc na lista fecha e devolve o foco ao botão; Tab fecha; clicar fora fecha", () => {
    const { cb } = montar();
    fireEvent.click(cb);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(cb).toHaveAttribute("aria-expanded", "false");
    expect(cb).toHaveFocus();
    fireEvent.click(cb);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Tab" });
    expect(cb).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(cb);
    fireEvent.mouseDown(document.body);
    expect(cb).toHaveAttribute("aria-expanded", "false");
  });

  it("lista vazia sem pesquisa: Esc fecha (no botão) e Tab fecha (o foco sai do botão para fora)", () => {
    const { cb } = montar({ itens: [] });
    fireEvent.click(cb);
    expect(cb).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByText("Nenhuma opção encontrada", { selector: "p" })).toBeInTheDocument();
    fireEvent.keyDown(cb, { key: "Escape" });
    expect(cb).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(cb);
    expect(cb).toHaveAttribute("aria-expanded", "true");
    const fora = document.createElement("button");
    document.body.appendChild(fora);
    fireEvent.blur(cb, { relatedTarget: fora });
    expect(cb).toHaveAttribute("aria-expanded", "false");
    fora.remove();
  });

  it("o foco passar do botão para o painel (abrir) não fecha; passar do painel para fora fecha", () => {
    const { cb } = montar({ itens: LONGA });
    fireEvent.click(cb);
    fireEvent.blur(cb, { relatedTarget: pesquisa() });
    expect(cb).toHaveAttribute("aria-expanded", "true");
    const fora = document.createElement("button");
    document.body.appendChild(fora);
    fireEvent.blur(pesquisa(), { relatedTarget: fora });
    expect(cb).toHaveAttribute("aria-expanded", "false");
    fora.remove();
  });

  it("segundo clique no botão devolve o foco ao botão quando estava dentro do painel", () => {
    const { cb } = montar({ itens: LONGA });
    fireEvent.click(cb);
    expect(pesquisa()).toHaveFocus();
    fireEvent.click(cb);
    expect(cb).toHaveAttribute("aria-expanded", "false");
    expect(cb).toHaveFocus();
  });

  it("escolher com o rato chama onEscolher; controlado por quem usa, o botão troca o valor mostrado", () => {
    function Pai() {
      const [v, setV] = useState<ItemCombo | null>(null);
      return <ComboPesquisa rotulo="Marca" itens={ITENS} atual={v} onEscolher={setV} />;
    }
    render(<Pai />);
    const cb = screen.getByRole("combobox", { name: "Marca" });
    fireEvent.click(cb);
    fireEvent.click(screen.getByRole("option", { name: "Roca" }));
    expect(cb).toHaveTextContent("Roca");
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

  it("o listbox está no <body>, fora do wrapper do botão, e é fixo com z-index acima dos cartões e dos diálogos", () => {
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

  it("tem a largura do botão e fica logo por baixo dele quando há espaço", () => {
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

  it("sem espaço por baixo, abre para cima (colada ao topo do botão)", () => {
    const { cb } = montar();
    const alturaJanela = window.innerHeight;
    comRetangulo(cb, { left: 10, top: alturaJanela - 60, width: 200, height: 44 });
    fireEvent.click(cb);
    const f = screen.getByRole("listbox").closest("[data-lista-flutuante]") as HTMLElement;
    expect(f).toHaveAttribute("data-para-cima");
    expect(f.style.top).toBe("");
    expect(f.style.bottom).toBe("64px"); // 60 + folga de 4
  });

  it("acompanha o botão quando um contentor com scroll rola e quando a janela muda de tamanho", async () => {
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
    expect(screen.getByRole("listbox")).toBeInTheDocument(); // rolar (com o botão à vista) não fecha
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

  it("M3: se o botão sai da vista (rolou para fora da janela), a lista fecha", async () => {
    const { cb } = montar();
    const caixa = comRetangulo(cb, { left: 40, top: 100, width: 300, height: 44 });
    fireEvent.click(cb);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    caixa.getBoundingClientRect = retangulo({ left: 40, top: -200, width: 300, height: 44 }); // fim do botão acima da janela
    fireEvent.scroll(document.body);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(cb).toHaveAttribute("aria-expanded", "false");
    expect(cb).toHaveFocus(); // o foco estava no painel: volta ao botão, não se perde no <body>
  });

  it("M3: com o teclado virtual aberto e o foco no painel, o campo sair da vista NÃO fecha (o teclado encolhe a área visível); sem teclado fecha", async () => {
    const vv = { height: 300, offsetTop: 0, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    try {
      const { cb } = montar({ itens: LONGA });
      const caixa = comRetangulo(cb, { left: 40, top: 100, width: 300, height: 44 });
      fireEvent.click(cb);
      expect(pesquisa()).toHaveFocus();
      caixa.getBoundingClientRect = retangulo({ left: 40, top: -200, width: 300, height: 44 });
      fireEvent.scroll(document.body);
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.getByRole("listbox")).toBeInTheDocument(); // teclado virtual (300 < innerHeight): fica
      Object.defineProperty(window, "visualViewport", { value: { ...vv, height: window.innerHeight }, configurable: true });
      fireEvent.scroll(document.body);
      await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull()); // sem teclado: fecha
    } finally {
      Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
    }
  });

  it("M3: também fecha quando o botão sai da área visível de um contentor com scroll", async () => {
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
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
      expect(vv.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    } finally {
      Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
    }
  });

  it("A11Y-M4: o painel nunca passa o espaço real do ecrã nem sai dele (320 px de largura, 400% de zoom)", () => {
    const v = { top: 0, height: 200, layoutHeight: 200, layoutWidth: 320 };
    const p = posicaoDaLista({ left: -30, top: 20, bottom: 64, width: 500 }, v);
    expect(Number(p.style.maxHeight)).toBeLessThanOrEqual(200 - 64 - 4 - 8); // o espaço por baixo
    expect(Number(p.style.left)).toBeGreaterThanOrEqual(8);
    expect(Number(p.style.left) + Number(p.style.width)).toBeLessThanOrEqual(320 - 8);
    const q = posicaoDaLista({ left: 250, top: 100, bottom: 144, width: 200 }, { ...v, height: 800, layoutHeight: 800 });
    expect(Number(q.style.left) + Number(q.style.width)).toBeLessThanOrEqual(320 - 8);
    expect(Number(q.style.maxHeight)).toBeLessThanOrEqual(288);
  });

  it("fechar tira a lista do <body> e deixa de ouvir o scroll", () => {
    const { cb } = montar();
    fireEvent.click(cb);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(document.querySelector("[data-lista-flutuante]")).toBeNull();
    expect(() => fireEvent.scroll(document.body)).not.toThrow();
  });

  it("escolher com um clique na lista (no <body>) continua a funcionar", () => {
    const { cb, onEscolher } = montar();
    fireEvent.click(cb);
    expect(fireEvent.mouseDown(screen.getByRole("listbox"))).toBe(false); // preventDefault: o foco não se perde
    fireEvent.click(screen.getByRole("option", { name: "Roca" }));
    expect(onEscolher).toHaveBeenCalledWith(ITENS[1]);
    expect(within(document.body).queryByRole("listbox")).toBeNull();
  });
});
