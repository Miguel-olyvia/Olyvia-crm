// O guia do passo seguinte (só apresentação): um só botão primário, o título é um h2, a fase atual leva aria-current, a razão de um botão desativado
// está ligada a ele, «Anterior» só lê e o clique chama o callback certo. Os callbacks são simulados: nada fala com a base.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { GuiaDoPasso, type GuiaDoPassoProps } from "./GuiaDoPasso";
import { calcularPassoGuiado, fasesDaPessoa, type PassoGuiado } from "./processo/passoGuiado";
import type { ItemProcesso, PassoProcesso } from "./processo/tiposProcesso";
import { PASSOS_PROCESSO } from "./processo/tiposProcesso";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));
afterEach(cleanup);

const item = (extra: Partial<ItemProcesso> = {}): ItemProcesso => ({
  id: "pessoa-a", pessoaId: "a", tipo: "pessoa", fase: "porContactar", trabalho: null, valor: null, prazo: null, atrasado: false, orcamentos: 0,
  verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false, ...extra,
});
const DADOS = { nome: "Pedro Lopes", temContacto: true, temOrigem: true, chamadas: 0, visitasAtivas: 0, levantamentos: 0 };
const TODOS: ReadonlySet<PassoProcesso> = new Set(PASSOS_PROCESSO);

function passo(i: ItemProcesso = item(), extra: Partial<Parameters<typeof calcularPassoGuiado>[1]> = {}): PassoGuiado {
  return calcularPassoGuiado(i, { dados: DADOS, fases: fasesDaPessoa(i.fase), podeEditar: true, podeCriar: true, pessoaFechada: false, ligados: TODOS, ...extra });
}

function guia(extra: Partial<GuiaDoPassoProps> = {}, p: PassoGuiado | null = passo()) {
  const props: GuiaDoPassoProps = {
    passo: p, fases: fasesDaPessoa("porContactar"),
    cabecalho: { nome: "Pedro Lopes", linha: "WC social", telefone: "927 118 300", local: "Amadora" },
    cliente: { telefone: "927 118 300", email: "pedro.lopes@exemplo.pt", morada: "Amadora", linha: "WC social" },
    acontecimentos: [{ id: "e1", texto: "Pedido pelo site", quando: "06/10/2026" }], aoAcao: vi.fn(), ...extra,
  };
  render(<GuiaDoPasso {...props} />);
  return props;
}

describe("GuiaDoPasso: o ecrã do passo", () => {
  it("mostra o cabeçalho, o título como h2, o subtítulo e o cartão do cliente com os últimos acontecimentos", () => {
    guia();
    expect(screen.getByRole("heading", { level: 3, name: "Pedro Lopes" })).toBeInTheDocument();
    expect(screen.getByText("WC social", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Está tudo. Registar a chamada." })).toBeInTheDocument();
    expect(screen.getByText("Ligar ao cliente e anotar o resultado.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Cliente" })).toBeInTheDocument();
    expect(screen.getByText("pedro.lopes@exemplo.pt")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Últimos acontecimentos" })).toBeInTheDocument();
    expect(screen.getByText("Pedido pelo site")).toBeInTheDocument();
    expect(screen.getByText("06/10/2026")).toBeInTheDocument();
  });

  it("tem um único botão primário: o do passo (Anterior é discreto)", () => {
    guia();
    expect(screen.getByRole("button", { name: /^Registar a chamada/ })).toBeInTheDocument();
    // Só um botão em cheio no corpo do passo: os outros (Anterior, mostrar a lista) são ghost ou outline.
    const cheios = screen.getAllByRole("button").filter((b) => /(^|\s)bg-primary(\s|$)/.test(b.className));
    expect(cheios).toHaveLength(1);
  });

  it("a fase atual leva aria-current=step e o estado diz-se por texto", () => {
    guia({ fases: fasesDaPessoa("contactado") }, passo(item({ fase: "contactado" })));
    const fases = screen.getByRole("list", { name: "Fases" });
    const atual = within(fases).getAllByRole("listitem").filter((li) => li.getAttribute("aria-current") === "step");
    expect(atual).toHaveLength(1);
    expect(atual[0]).toHaveTextContent("Contactado");
    expect(atual[0]).toHaveTextContent("atual");
    expect(within(fases).getAllByRole("listitem")).toHaveLength(4);
    expect(fases).not.toHaveTextContent(/financeiro|obra/i);
  });

  it("a lista da fase diz «feito» ou «por fazer» por texto", () => {
    guia({}, passo(item(), { dados: { ...DADOS, temContacto: false } }));
    const quem = screen.getByText("Quem pede").closest("li")!;
    const contacto = screen.getByText("Contacto", { selector: "span:not(.sr-only)" }).closest("li")!;
    expect(quem).toHaveTextContent("feito");
    expect(contacto).toHaveTextContent("por fazer");
  });

  it("o clique no botão primário chama o callback do passo, uma vez", () => {
    const p = guia();
    fireEvent.click(screen.getByRole("button", { name: /^Registar a chamada/ }));
    expect(p.aoAcao).toHaveBeenCalledTimes(1);
  });

  it("«Marcar como perdido» e o prazo aparecem nos sítios que se lhes dão, e só se se derem", () => {
    guia({ acaoPerder: <button type="button">Marcar como perdido</button>, extra: <p>Prazo: amanhã</p> });
    expect(screen.getByRole("button", { name: "Marcar como perdido" })).toBeInTheDocument();
    expect(screen.getByText("Prazo: amanhã")).toBeInTheDocument();
    cleanup();
    guia();
    expect(screen.queryByRole("button", { name: "Marcar como perdido" })).toBeNull();
  });
});

describe("GuiaDoPasso: o botão desativado, sem passo e sem ação", () => {
  it("desativado: aria-disabled, a razão está no ecrã e o botão liga-se a ela; o clique não chama nada", () => {
    const p = guia({}, passo(item({ fase: "contactado" }), { podeEditar: false }));
    const botao = screen.getByRole("button", { name: /^Marcar a visita/ });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    const razao = screen.getByText("Não tem permissão para fazer este passo.");
    expect(botao.getAttribute("aria-describedby")).toBe(razao.id);
    fireEvent.click(botao);
    expect(p.aoAcao).not.toHaveBeenCalled();
  });

  it("uma explicação do portão (que travou o botão) fica ligada ao botão pronto", () => {
    guia({ explicacao: { id: "explicacao-x", texto: "Esta pessoa ainda não tem visita marcada." } });
    expect(screen.getByRole("button", { name: /^Registar a chamada/ }).getAttribute("aria-describedby")).toBe("explicacao-x");
    expect(document.getElementById("explicacao-x")).toHaveTextContent("ainda não tem visita");
  });

  it("um passo sem ação (só texto) não tem botão primário", () => {
    // Os passos que não existem em modo real (verificar o orçamento, a Direção) são só texto; os de documento têm botão (ou o desativado com a razão).
    const i = item({ id: "n1", tipo: "negocio", fase: "orcamento", orcamentos: 1, verificacao: "porVerificar" });
    guia({ fases: [] }, passo(i, { ligados: new Set<PassoProcesso>() }));
    expect(screen.queryByRole("button", { name: /^Verificar o orçamento/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Verificar o orçamento." })).toBeInTheDocument();
  });

  it("sem passo (um negócio fechado) fica o cabeçalho e a barra, sem título de passo nem botão", () => {
    guia({}, null);
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Registar a chamada/ })).toBeNull();
    expect(screen.getByRole("list", { name: "Fases" })).toBeInTheDocument();
  });

  it("ocupado: o botão fica aria-busy e o clique não repete a ação", () => {
    const p = guia({ ocupado: true });
    const botao = screen.getByRole("button", { name: /^Registar a chamada/ });
    expect(botao).toHaveAttribute("aria-busy", "true");
    fireEvent.click(botao);
    expect(p.aoAcao).not.toHaveBeenCalled();
  });
});

describe("GuiaDoPasso: «Anterior» só lê", () => {
  it("na primeira fase «Anterior» está desativado", () => {
    guia();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
  });

  it("noutra fase mostra a fase anterior, o aviso de que nada se grava e um botão para voltar; não chama o callback do passo", () => {
    const i = item({ fase: "contactado" });
    const p = guia({ fases: fasesDaPessoa("contactado") }, passo(i));
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByRole("heading", { level: 2, name: "Por contactar" })).toBeInTheDocument();
    expect(screen.getByText(/aqui não se grava nada/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Marcar a visita/ })).toBeNull();
    expect(p.aoAcao).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao passo atual" }));
    expect(screen.getByRole("heading", { level: 2, name: "Marcar a visita." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Marcar a visita/ })).toBeInTheDocument();
  });
});

describe("GuiaDoPasso: o cabeçalho único da ficha", () => {
  it("o nome vem do chamador (o título da ficha) e não se repete num h3; a linha do negócio passa a h3", () => {
    guia({ cabecalho: { nome: "Pedro Lopes", linha: "WC social", telefone: null, local: null }, nomeEl: <h2 data-ficha-nome>Pedro Lopes</h2>, descricaoEl: <p>Lead · Por contactar</p> });
    expect(screen.getAllByRole("heading", { name: "Pedro Lopes" })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 3, name: "WC social" })).toBeInTheDocument();
    expect(screen.getByText("Lead · Por contactar")).toBeInTheDocument();
  });

  it("sem linha de negócio a descrição vê-se por baixo do nome", () => {
    guia({ cabecalho: { nome: "Pedro Lopes", telefone: null, local: null }, nomeEl: <h2>Pedro Lopes</h2>, descricaoEl: <p>Lead · Por contactar</p> });
    // Sem linha de negócio não há h3 do serviço (os h3 que restam são o passo e as secções, um nível abaixo do nome).
    expect(screen.queryByRole("heading", { level: 3, name: "Pedro Lopes" })).toBeNull();
    expect(screen.getAllByRole("heading", { name: "Pedro Lopes" })).toHaveLength(1);
    expect(screen.getByText("Lead · Por contactar")).toBeVisible();
  });

  it("leva os selos, o aviso de estado, a navegação e as ações secundárias", () => {
    guia({
      selos: <span>Empresa</span>, aviso: <p>Perdida em preço</p>, navegacao: <nav aria-label="Pessoas">1 de 8</nav>,
      acoesSecundarias: <button type="button">Mais</button>, acaoPerder: <button type="button">Marcar como perdido</button>,
    });
    expect(screen.getByText("Empresa")).toBeInTheDocument();
    expect(screen.getByText("Perdida em preço")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Pessoas" })).toHaveTextContent("1 de 8");
    expect(screen.getByRole("button", { name: "Mais" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar como perdido" })).toBeInTheDocument();
  });

  it("o telefone do cabeçalho é uma ligação tel:", () => {
    guia();
    expect(screen.getAllByRole("link", { name: /927 118 300/ })[0]).toHaveAttribute("href", "tel:927118300");
  });

  it("o cartão do cliente leva os campos que o contacto antigo tinha (NIF, distrito) e o email como ligação", () => {
    guia({ cliente: { telefone: "927 118 300", email: "pedro.lopes@exemplo.pt", morada: null, linha: null, extras: [{ chave: "nif", valor: "123456789" }, { chave: "distrito", valor: "Lisboa" }] } });
    expect(screen.getByText("123456789")).toBeInTheDocument();
    expect(screen.getByText("Lisboa")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "pedro.lopes@exemplo.pt" })).toHaveAttribute("href", "mailto:pedro.lopes@exemplo.pt");
  });

  it("sem passo (cliente, perdida) mostra o cabeçalho, a barra e o cartão do cliente", () => {
    guia({}, null);
    expect(screen.getByRole("heading", { level: 4, name: "Cliente" })).toBeInTheDocument();
  });
});

describe("GuiaDoPasso: a ordem do DOM é a visual", () => {
  it("o passo (e o botão primário) vem antes do botão «Mostrar lista» no DOM, para o Tab e o leitor de ecrã", () => {
    guia();
    const primario = screen.getByRole("button", { name: /^Registar a chamada/ });
    const lista = screen.getByRole("button", { name: /lista/i });
    expect(primario.compareDocumentPosition(lista) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("GuiaDoPasso: a estrutura do desenho (cartão do cabeçalho, barra grossa, três colunas)", () => {
  it("a barra de fases tem a fase atual preenchida num tom mais claro que as feitas (revisão: não só pela cor), as por fazer vazias, e a atual diz-se por aria-current e por texto", () => {
    guia({ fases: fasesDaPessoa("contactado") }, passo(item({ fase: "contactado" })));
    const itens = within(screen.getByRole("list", { name: "Fases" })).getAllByRole("listitem");
    const segmento = (li: HTMLElement) => li.querySelector<HTMLElement>("div[aria-hidden]")!;
    expect(segmento(itens[0]).className).toMatch(/(^|\s)bg-primary(\s|$)/);
    expect(segmento(itens[1]).className).toMatch(/(^|\s)bg-primary\/60(\s|$)/);
    expect(segmento(itens[2]).className).toMatch(/(^|\s)bg-muted(\s|$)/);
    expect(itens[1]).toHaveAttribute("aria-current", "step");
    expect(itens[1]).toHaveTextContent("atual");
  });

  it("a lista da fase é um cartão com círculos preenchidos nos feitos e vazios nos por fazer (e diz-se por texto)", () => {
    guia({}, passo(item(), { dados: { ...DADOS, temContacto: false } }));
    const feito = screen.getByText("Quem pede").closest("li")!;
    const porFazer = screen.getByText("Contacto", { selector: "span:not(.sr-only)" }).closest("li")!;
    expect(feito.querySelector("[aria-hidden]")!.className).toMatch(/(^|\s)bg-primary(\s|$)/);
    expect(porFazer.querySelector("[aria-hidden]")!.className).toMatch(/border-2/);
    expect(porFazer.querySelector("[aria-hidden]")!.className).not.toMatch(/(^|\s)bg-primary(\s|$)/);
    expect(feito).toHaveTextContent("feito");
    expect(porFazer).toHaveTextContent("por fazer");
    expect(feito.closest("div[class*='rounded-xl']")).not.toBeNull();
  });

  it("o título do passo é grande e a negrito, e o rótulo da fase (pequeno) vem por cima", () => {
    guia();
    const titulo = screen.getByRole("heading", { level: 2, name: "Está tudo. Registar a chamada." });
    expect(titulo.className).toMatch(/font-bold/);
    expect(titulo.className).toMatch(/text-2xl/);
    const rotulo = screen.getAllByText("Por contactar", { selector: "p" })[0];
    expect(rotulo.compareDocumentPosition(titulo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a grelha do passo tem três colunas a partir de lg (lista | passo | cliente) e o cliente já não espera pelos ecrãs enormes", () => {
    guia();
    const grelha = screen.getByRole("heading", { level: 2, name: "Está tudo. Registar a chamada." }).closest("div[class*='grid']")!;
    expect(grelha.className).toMatch(/lg:grid-cols-\[210px_minmax\(0,1fr\)_270px\]/);
    expect(grelha.className).not.toMatch(/min-\[1800px\]/);
  });

  it("há um único botão primário e «Anterior» é discreto (ghost), à esquerda", () => {
    guia();
    const cheios = screen.getAllByRole("button").filter((b) => /(^|\s)bg-primary(\s|$)/.test(b.className));
    expect(cheios).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Anterior" }).className).not.toMatch(/(^|\s)bg-primary(\s|$)/);
  });

  it("a faixa de alertas vai logo por baixo do cabeçalho, antes da barra de fases; sem faixa não há nada", () => {
    guia({ faixa: <p>Faixa de teste</p> });
    const faixa = screen.getByText("Faixa de teste");
    const fases = screen.getByRole("list", { name: "Fases" });
    expect(faixa.compareDocumentPosition(fases) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();
    guia();
    expect(screen.queryByText("Faixa de teste")).toBeNull();
  });

  it("«Ver toda a atividade» no cartão do cliente só existe com o callback e chama-o", () => {
    const aoVerAtividade = vi.fn();
    guia({ aoVerAtividade });
    fireEvent.click(screen.getByRole("button", { name: "Ver toda a atividade" }));
    expect(aoVerAtividade).toHaveBeenCalledTimes(1);
    cleanup();
    guia();
    expect(screen.queryByRole("button", { name: "Ver toda a atividade" })).toBeNull();
  });
});
