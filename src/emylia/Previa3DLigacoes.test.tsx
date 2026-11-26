// 25/11: o painel das regras do 3D do produto: que atributo pinta que zona, e se «pinta» ou «não pinta». Controlado: quem o usa guarda o rascunho (aoMudar).
// 26/11: passou a «Regras do produto» (RegrasDoProduto), dentro do painel «Aspeto 3D», que tem o único «Guardar» (os testes de guardar e herdar estão em PainelAspeto3D.test.tsx).
// Aqui só o ecrã das regras: linhas agrupadas por atributo (com «Todas as zonas» à cabeça e as excepções recuadas), «sem efeito aqui», acrescentar e remover, o máximo de 60, o aviso de
// regra repetida, só leitura, regras órfãs, «Atributos que o 3D lê» e o realce no 3D ao apontar uma regra.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ligacao } from "./config3dDados";
import { RegrasDoProduto } from "./Previa3DLigacoes";

afterEach(cleanup);

const A_FRENTE = "aaaaaaaa-0000-4000-a000-000000000001", A_CORPO = "aaaaaaaa-0000-4000-a000-000000000002", A_BRILHO = "aaaaaaaa-0000-4000-a000-000000000003";
const ATRIBUTOS = [{ id: A_FRENTE, nome: "Cor da frente" }, { id: A_CORPO, nome: "Cor do corpo" }, { id: A_BRILHO, nome: "Brilho" }];
const ZONAS = ["frente", "corpo", "tampo"] as const;

type Props = React.ComponentProps<typeof RegrasDoProduto>;
const montar = (p: Partial<Props> = {}) => {
  const aoMudar = vi.fn();
  const props: Props = { valor: [], origem: "automatico", atributos: ATRIBUTOS, zonas: ZONAS, orfas: 0, ignoradas: 0, podeEditar: true, aoMudar, idErro: "erro-regras", ...p };
  const r = render(<RegrasDoProduto {...props} />);
  return { aoMudar, props, ...r };
};
const L = (atributo: string, zona: Ligacao["zona"], aplicar = true): Ligacao => ({ atributo, zona, aplicar });

describe("o painel «Regras do produto»", () => {
  it("sem regras explica a regra automática (pelo nome do atributo) e oferece «Acrescentar regra»", () => {
    montar();
    expect(screen.getByRole("heading", { name: "Regras do produto" })).toBeTruthy();
    expect(screen.getByText(/pelo nome do atributo/i)).toBeTruthy();
    expect(screen.getByText("Sem regras: o 3D pinta cada zona pelo nome dos atributos.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Acrescentar regra" })).toBeTruthy();
  });
  it("cada linha tem o atributo, a zona e «Pinta», todos com rótulo, e o botão de remover diz qual linha", () => {
    montar({ valor: [L(A_FRENTE, "frente"), L(A_BRILHO, "tudo", false)] });
    const um = screen.getByRole("group", { name: "Regra 1" });
    expect((within(um).getByLabelText("Atributo") as HTMLSelectElement).value).toBe(A_FRENTE);
    expect((within(um).getByLabelText("Zona") as HTMLSelectElement).value).toBe("frente");
    expect(within(um).getByRole("switch", { name: "Pinta" }).getAttribute("aria-checked")).toBe("true");
    expect(within(um).getByText("Pinta")).toBeTruthy();
    const dois = screen.getByRole("group", { name: "Regra 2" });
    expect((within(dois).getByLabelText("Zona") as HTMLSelectElement).value).toBe("tudo");
    expect(within(dois).getByRole("switch", { name: "Pinta" }).getAttribute("aria-checked")).toBe("false");
    expect(within(dois).getByText("Não pinta")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remover a regra 2" })).toBeTruthy();
  });
  it("a zona tem «Todas as zonas» e as zonas do modelo (mais uma zona já usada que o modelo não tenha, para não a perder)", () => {
    montar({ valor: [L(A_FRENTE, "estofo")] });
    const opcoes = within(screen.getByLabelText("Zona")).getAllByRole("option").map((o) => o.textContent);
    expect(opcoes).toEqual(["Todas as zonas", "Frente", "Corpo", "Tampo", "Estofo"]);
  });
  it("mudar o atributo, a zona e «Pinta» chama aoMudar com a lista nova (sem mexer na antiga)", () => {
    const valor = [L(A_FRENTE, "frente")];
    const { aoMudar } = montar({ valor });
    fireEvent.change(screen.getByLabelText("Atributo"), { target: { value: A_CORPO } });
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_CORPO, "frente")]);
    fireEvent.change(screen.getByLabelText("Zona"), { target: { value: "tampo" } });
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_FRENTE, "tampo")]);
    fireEvent.click(screen.getByRole("switch", { name: "Pinta" }));
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_FRENTE, "frente", false)]);
    expect(valor).toEqual([L(A_FRENTE, "frente")]);
  });
  it("«Acrescentar regra» junta um par atributo/zona ainda livre; «Remover» tira a linha", () => {
    const { aoMudar } = montar({ valor: [L(A_FRENTE, "tudo")] });
    fireEvent.click(screen.getByRole("button", { name: "Acrescentar regra" }));
    const lista = aoMudar.mock.calls[0][0] as Ligacao[];
    expect(lista).toHaveLength(2);
    expect(`${lista[1].atributo}|${lista[1].zona}`).not.toBe(`${A_FRENTE}|tudo`);
    fireEvent.click(screen.getByRole("button", { name: "Remover a regra 1" }));
    expect(aoMudar).toHaveBeenLastCalledWith([]);
  });
  it("sem atributos de lista, não há como ligar: explica-o em vez de oferecer o botão", () => {
    montar({ atributos: [] });
    expect(screen.queryByRole("button", { name: "Acrescentar regra" })).toBeNull();
    // 25/11: «atributos» aqui são os que têm cor, foto ou aspeto (os que o 3D pode ler), e não «de lista»: o texto diz isso
    expect(screen.getByText(/nenhum atributo deste produto tem cor, foto ou aspeto/i)).toBeTruthy();
    expect(screen.queryByText(/atributos de lista/i)).toBeNull();
  });
  it("no máximo de 60 regras «Acrescentar regra» fica desactivado (aria-disabled: o foco fica) e di-lo em texto", () => {
    const sessenta = Array.from({ length: 60 }, (_, i) => L(`bbbbbbbb-0000-4000-a000-${String(i).padStart(12, "0")}`, "tudo"));
    const { aoMudar } = montar({ valor: sessenta });
    const b = screen.getByRole("button", { name: "Acrescentar regra" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect((b as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(b);
    expect(aoMudar).not.toHaveBeenCalled();
    expect(screen.getByText("Máximo de 60 regras.")).toBeTruthy();
  });
  it("«Esconder» fecha a lista (aria-expanded) e «Mostrar» volta a abri-la; começa aberta", () => {
    montar({ valor: [L(A_FRENTE, "frente")] });
    const b = screen.getByRole("button", { name: "Esconder" });
    expect(b.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(b);
    expect(screen.queryByRole("group", { name: "Regra 1" })).toBeNull();
    const mostrar = screen.getByRole("button", { name: "Mostrar (1)" });
    expect(mostrar.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(mostrar);
    expect(screen.getByRole("group", { name: "Regra 1" })).toBeTruthy();
  });
});

describe("agrupar por atributo: «Todas as zonas» à cabeça e as excepções recuadas", () => {
  const VALOR = [L(A_FRENTE, "frente", false), L(A_CORPO, "tudo"), L(A_FRENTE, "tudo")];
  it("as regras do mesmo atributo ficam juntas, com «Todas as zonas» primeiro (a numeração é a da lista)", () => {
    montar({ valor: VALOR });
    const ordem = screen.getAllByRole("group").map((g) => g.getAttribute("aria-label")).filter((n) => /^Regra \d+$/.test(n ?? ""));
    expect(ordem).toEqual(["Regra 3", "Regra 1", "Regra 2"]);
  });
  it("uma regra de uma zona sob a «Todas as zonas» do mesmo atributo é uma excepção: diz-se no rótulo e fica recuada", () => {
    montar({ valor: VALOR });
    const excecao = screen.getByRole("group", { name: "Regra 1" });
    expect(within(excecao).getByText("Zona (excepção)")).toBeTruthy();
    expect(excecao.className).toContain("ml-4");
    const cabeca = screen.getByRole("group", { name: "Regra 3" });
    expect(within(cabeca).getByText("Zona")).toBeTruthy();
    expect(cabeca.className).not.toContain("ml-4");
  });
  it("mudar a regra de uma linha agrupada muda a posição certa da lista (não a da ordem mostrada)", () => {
    const { aoMudar } = montar({ valor: VALOR });
    fireEvent.click(within(screen.getByRole("group", { name: "Regra 3" })).getByRole("switch", { name: "Pinta" }));
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_FRENTE, "frente", false), L(A_CORPO, "tudo"), L(A_FRENTE, "tudo", false)]);
  });
});

describe("«sem efeito aqui»: onde uma regra não chega a pintar", () => {
  it("diz as zonas em texto, com ícone, e só nas regras que perdem", () => {
    const semEfeito = (r: Ligacao) => (r.atributo === A_FRENTE && r.zona === "tudo" ? (["frente"] as const) : []);
    montar({ valor: [L(A_FRENTE, "tudo"), L(A_CORPO, "tudo")], semEfeito });
    expect(within(screen.getByRole("group", { name: "Regra 1" })).getByText("sem efeito aqui: Frente")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Regra 2" })).queryByText(/sem efeito aqui/)).toBeNull();
  });
});

describe("apontar ou focar uma regra realça no 3D só as zonas que ela pinta de facto", () => {
  it("o rato e o foco dão as zonas (as da regra menos as sem efeito); sair dá null", () => {
    const aoApontar = vi.fn();
    const semEfeito = () => ["frente"] as const;
    montar({ valor: [L(A_FRENTE, "tudo")], semEfeito, aoApontar });
    const linha = screen.getByRole("group", { name: "Regra 1" });
    fireEvent.mouseEnter(linha);
    expect(aoApontar).toHaveBeenLastCalledWith(["corpo", "tampo"]);
    fireEvent.mouseLeave(linha);
    expect(aoApontar).toHaveBeenLastCalledWith(null);
    fireEvent.focus(within(linha).getByLabelText("Atributo"));
    expect(aoApontar).toHaveBeenLastCalledWith(["corpo", "tampo"]);
  });
  it("uma regra de uma zona realça essa zona; uma regra «não pinta» não realça nenhuma", () => {
    const aoApontar = vi.fn();
    montar({ valor: [L(A_FRENTE, "corpo"), L(A_CORPO, "tudo", false)], aoApontar });
    fireEvent.mouseEnter(screen.getByRole("group", { name: "Regra 1" }));
    expect(aoApontar).toHaveBeenLastCalledWith(["corpo"]);
    fireEvent.mouseEnter(screen.getByRole("group", { name: "Regra 2" }));
    expect(aoApontar).toHaveBeenLastCalledWith([]);
  });
});

describe("foco ao acrescentar e ao remover", () => {
  function Guardado({ inicial = [] as Ligacao[] }) {
    const [valor, setValor] = useState<Ligacao[]>(inicial);
    return <RegrasDoProduto valor={valor} origem="automatico" atributos={ATRIBUTOS} zonas={ZONAS} orfas={0} ignoradas={0} podeEditar aoMudar={setValor} idErro="e" />;
  }
  it("ao acrescentar, o foco vai para o campo «Atributo» da regra nova", () => {
    render(<Guardado inicial={[L(A_FRENTE, "tudo")]} />);
    fireEvent.click(screen.getByRole("button", { name: "Acrescentar regra" }));
    const nova = screen.getByRole("group", { name: "Regra 2" });
    expect(document.activeElement).toBe(within(nova).getByLabelText("Atributo"));
  });
  it("ao remover, o foco vai para «Acrescentar regra» (que continua lá)", () => {
    render(<Guardado inicial={[L(A_FRENTE, "tudo")]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover a regra 1" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Acrescentar regra" }));
  });
});

describe("regra repetida", () => {
  it("o aviso é um alerta (não uma região de estado) com o id que o «Guardar» do painel aponta", () => {
    montar({ valor: [L(A_FRENTE, "frente"), L(A_FRENTE, "frente", false)] });
    const aviso = screen.getByText(/repetida/i);
    expect(aviso.getAttribute("role")).toBe("alert");
    expect(aviso.id).toBe("erro-regras");
  });
});

describe("origem das regras, só leitura e avisos", () => {
  it("diz de onde vêm as regras em vigor", () => {
    montar({ valor: [L(A_FRENTE, "frente")], origem: "categoria" });
    expect(screen.getByText(/herdadas da categoria/i)).toBeTruthy();
    cleanup();
    montar({ valor: [L(A_FRENTE, "frente")], origem: "produto" });
    expect(screen.getByText(/guardadas neste produto/i)).toBeTruthy();
  });
  it("sem permissão para editar: as regras lêem-se em texto e não há selectores nem botões de editar", () => {
    montar({ valor: [L(A_FRENTE, "frente"), L(A_BRILHO, "tudo", false)], podeEditar: false, origem: "produto" });
    expect(screen.queryByLabelText("Atributo")).toBeNull();
    expect(screen.queryByRole("button", { name: /Acrescentar|Remover|Ligar|Desligar/ })).toBeNull();
    expect(screen.getByText(/Cor da frente → Frente: pinta/)).toBeTruthy();
    expect(screen.getByText(/Brilho → Todas as zonas: não pinta/)).toBeTruthy();
    expect(screen.getByText(/permissão de editar produtos/i)).toBeTruthy();
  });
  it("regras a atributos que já não existem (órfãs) e regras inválidas largadas: aviso numa região viva", () => {
    montar({ valor: [L(A_FRENTE, "frente")], orfas: 2, ignoradas: 1 });
    expect(screen.getByText(/2 regras a atributos que já não existem/i)).toBeTruthy();
    expect(screen.getByText(/1 regra inválida/i)).toBeTruthy();
  });
  it("uma regra a um atributo que a lista já não tem aparece com o rótulo «atributo desconhecido», sem rebentar", () => {
    montar({ valor: [L("aaaaaaaa-0000-4000-a000-0000000000aa", "corpo")] });
    expect(within(screen.getByLabelText("Atributo")).getByRole("option", { name: "Atributo desconhecido" })).toBeTruthy();
  });
});

describe("«Atributos que o 3D lê»: todos os atributos com hex, foto ou aspeto, com o estado por omissão", () => {
  const A_PUXADOR = "aaaaaaaa-0000-4000-a000-000000000004";
  const OMISSOES = [
    { id: A_FRENTE, nome: "Cor da frente", aplicado: true, onde: "pinta a frente" },
    { id: A_PUXADOR, nome: "Puxador", aplicado: false, onde: "" },
  ];
  it("sem `omissoes` a lista não aparece (o painel é o de antes)", () => {
    montar();
    expect(screen.queryByRole("heading", { name: "Atributos que o 3D lê" })).toBeNull();
  });
  it("mostra cada atributo, também o de nome desconhecido, com «aplicado por omissão» ou «desligado por omissão»", () => {
    montar({ omissoes: OMISSOES });
    expect(screen.getByRole("heading", { name: "Atributos que o 3D lê" })).toBeTruthy();
    expect(screen.getByText("Cor da frente", { selector: "strong" }).closest("li")?.textContent).toContain("aplicado por omissão (pinta a frente)");
    expect(screen.getByText("Puxador", { selector: "strong" }).closest("li")?.textContent).toContain("desligado por omissão");
  });
  it("«Ligar» o Puxador acrescenta uma regra, «Pinta»; «Desligar» um nome conhecido acrescenta «Todas as zonas, não pinta»", () => {
    const { aoMudar } = montar({ omissoes: OMISSOES, atributos: [...ATRIBUTOS, { id: A_PUXADOR, nome: "Puxador" }] });
    fireEvent.click(screen.getByRole("button", { name: "Ligar Puxador" }));
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_PUXADOR, "tudo")]); // este modelo não tem a zona «Puxadores»: «Todas as zonas»
    fireEvent.click(screen.getByRole("button", { name: "Desligar Cor da frente" }));
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_FRENTE, "tudo", false)]);
  });
  it("com uma regra, o estado mostra a regra em vez da omissão e já não oferece «Ligar»", () => {
    montar({ omissoes: OMISSOES, valor: [L(A_PUXADOR, "tampo")], atributos: [...ATRIBUTOS, { id: A_PUXADOR, nome: "Puxador" }] });
    expect(screen.getByText("Puxador", { selector: "strong" }).closest("li")?.textContent).toContain("ligado: Tampo sim");
    expect(screen.queryByRole("button", { name: "Ligar Puxador" })).toBeNull();
  });
  it("só leitura: o estado vê-se, sem botões de ligar nem desligar", () => {
    montar({ omissoes: OMISSOES, podeEditar: false });
    expect(screen.getByText("Puxador", { selector: "strong" }).closest("li")?.textContent).toContain("desligado por omissão");
    expect(screen.queryByRole("button", { name: /^(Ligar|Desligar) / })).toBeNull();
  });
});

describe("«Ligar»/«Desligar» mantêm o botão e o foco, e anunciam o resultado", () => {
  const A_PUXADOR = "aaaaaaaa-0000-4000-a000-000000000004", A_ACAB_CORPO = "aaaaaaaa-0000-4000-a000-000000000005";
  const ATRS = [...ATRIBUTOS, { id: A_PUXADOR, nome: "Puxador" }, { id: A_ACAB_CORPO, nome: "Acabamento do corpo" }];
  const OMISSOES = [
    { id: A_PUXADOR, nome: "Puxador", aplicado: false, onde: "" },
    { id: A_ACAB_CORPO, nome: "Acabamento do corpo", aplicado: false, onde: "" },
    { id: A_FRENTE, nome: "Cor da frente", aplicado: false, onde: "" },
    { id: A_BRILHO, nome: "Brilho", aplicado: false, onde: "" },
  ];
  const COM_PUXADORES = ["frente", "corpo", "puxadores"] as const;
  /** Quem usa o painel: guarda o rascunho (como o ecrã faz) para o painel se redesenhar. */
  function Guardado({ zonas = ZONAS }: { zonas?: readonly ("frente" | "corpo" | "tampo" | "puxadores")[] }) {
    const [valor, setValor] = useState<Ligacao[]>([]);
    return <RegrasDoProduto valor={valor} origem="automatico" atributos={ATRS} omissoes={OMISSOES} zonas={zonas} orfas={0} ignoradas={0} podeEditar aoMudar={setValor} idErro="e" />;
  }
  it("depois de «Ligar», o botão continua lá (agora «Desligar»), com o foco, e uma região viva diz a que zona ficou ligado", () => {
    render(<Guardado zonas={COM_PUXADORES} />);
    const botao = screen.getByRole("button", { name: "Ligar Puxador" });
    botao.focus();
    fireEvent.click(botao);
    const depois = screen.getByRole("button", { name: "Desligar Puxador" });
    expect(document.activeElement).toBe(depois);
    expect(screen.getByText("Puxador ligado à zona Puxadores").getAttribute("aria-live")).toBe("polite");
  });
  it("«Desligar» volta atrás (sem a regra), mantém o foco e anuncia «desligado»", () => {
    render(<Guardado zonas={COM_PUXADORES} />);
    fireEvent.click(screen.getByRole("button", { name: "Ligar Puxador" }));
    const desligar = screen.getByRole("button", { name: "Desligar Puxador" });
    desligar.focus();
    fireEvent.click(desligar);
    expect(screen.getByRole("button", { name: "Ligar Puxador" })).toBe(desligar);
    expect(document.activeElement).toBe(desligar);
    expect(screen.getByText("Puxador desligado").getAttribute("aria-live")).toBe("polite");
  });
  it("propõe a zona pelo nome: Puxador → Puxadores (se o modelo a tem), corpo → Corpo, frente → Frente, o resto → Todas as zonas", () => {
    const { aoMudar } = montar({ omissoes: OMISSOES, atributos: ATRS, zonas: COM_PUXADORES });
    fireEvent.click(screen.getByRole("button", { name: "Ligar Puxador" }));
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_PUXADOR, "puxadores")]);
    fireEvent.click(screen.getByRole("button", { name: "Ligar Acabamento do corpo" }));
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_ACAB_CORPO, "corpo")]);
    fireEvent.click(screen.getByRole("button", { name: "Ligar Cor da frente" }));
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_FRENTE, "frente")]);
    fireEvent.click(screen.getByRole("button", { name: "Ligar Brilho" }));
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_BRILHO, "tudo")]);
  });
  it("um Puxador num modelo sem a zona «Puxadores» fica em «Todas as zonas» (nunca na primeira zona, a frente)", () => {
    const { aoMudar } = montar({ omissoes: OMISSOES, atributos: ATRS, zonas: ["frente", "corpo"] });
    fireEvent.click(screen.getByRole("button", { name: "Ligar Puxador" }));
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_PUXADOR, "tudo")]);
  });
});

describe("só os atributos do produto, e as regras a atributos que o produto já não tem", () => {
  const A_PUXADOR = "aaaaaaaa-0000-4000-a000-000000000004";
  const FORA = { id: A_PUXADOR, nome: "Puxador", fora: true };
  it("sem nenhum atributo do produto que pinte (lista vazia), o painel di-lo em texto simples e não mostra a lista nem «Ligar»", () => {
    montar({ omissoes: [], atributos: [] });
    expect(screen.getByText(/este produto não tem nenhum atributo que pinte o 3D/i)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Atributos que o 3D lê" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Acrescentar regra" })).toBeNull();
  });
  it("com atributos do produto, essa frase não aparece", () => {
    montar({ omissoes: [{ id: A_FRENTE, nome: "Cor da frente", aplicado: true, onde: "pinta a frente" }] });
    expect(screen.queryByText(/este produto não tem nenhum atributo que pinte o 3D/i)).toBeNull();
  });
  it("uma regra gravada a um atributo que o produto já não tem continua a aparecer, marcada, e pode-se remover", () => {
    const { aoMudar } = montar({ valor: [L(A_PUXADOR, "tampo"), L(A_FRENTE, "frente")], atributos: [{ id: A_FRENTE, nome: "Cor da frente" }, FORA], omissoes: [] });
    const linha = screen.getByRole("group", { name: "Regra 1" });
    expect(within(linha).getByText(/o produto já não tem este atributo: remova a regra/i)).toBeTruthy();
    expect(within(linha).getByRole("option", { name: /Puxador.*o produto já não tem este atributo/i })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Regra 2" })).queryByText(/já não tem este atributo/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remover a regra 1" }));
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_FRENTE, "frente")]);
  });
  it("o atributo que o produto já não tem não se oferece nas outras linhas nem em «Acrescentar regra»", () => {
    const { aoMudar } = montar({
      valor: [L(A_FRENTE, "tudo"), L(A_FRENTE, "frente"), L(A_FRENTE, "tampo"), L(A_PUXADOR, "tampo")], atributos: [{ id: A_FRENTE, nome: "Cor da frente" }, FORA], zonas: ["frente", "tampo"], omissoes: [],
    });
    const primeira = screen.getAllByLabelText("Atributo")[0] as HTMLSelectElement;
    expect(within(primeira).queryByRole("option", { name: /Puxador/ })).toBeNull();
    // a «Cor da frente» já está em todas as zonas: só o Puxador (que o produto já não tem) estaria livre, e esse não se oferece
    fireEvent.click(screen.getByRole("button", { name: "Acrescentar regra" }));
    expect(aoMudar).not.toHaveBeenCalled();
  });
  it("só leitura: a regra a um atributo que o produto já não tem lê-se marcada", () => {
    montar({ valor: [L(A_PUXADOR, "tampo")], atributos: [FORA], podeEditar: false, omissoes: [] });
    expect(screen.getByText(/Puxador → Tampo.*o produto já não tem este atributo/i)).toBeTruthy();
  });
});
