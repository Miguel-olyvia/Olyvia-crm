// 25/11: o painel «Ligações» do 3D do produto: que atributo pinta que zona, e se «aplica» ou não. Controlado: quem o usa guarda o rascunho (aoMudar) e grava (gravar, herdar).
// Aqui só o ecrã: linhas com rótulos, acrescentar e remover, validação das repetidas, gravar com mensagem numa região viva, voltar a herdar, só leitura e ligações órfãs.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ligacao } from "./config3dDados";
import { Previa3DLigacoes } from "./Previa3DLigacoes";

afterEach(cleanup);

const A_FRENTE = "aaaaaaaa-0000-4000-a000-000000000001", A_CORPO = "aaaaaaaa-0000-4000-a000-000000000002", A_BRILHO = "aaaaaaaa-0000-4000-a000-000000000003";
const ATRIBUTOS = [{ id: A_FRENTE, nome: "Cor da frente" }, { id: A_CORPO, nome: "Cor do corpo" }, { id: A_BRILHO, nome: "Brilho" }];
const ZONAS = ["frente", "corpo", "tampo"] as const;

const montar = (p: Partial<React.ComponentProps<typeof Previa3DLigacoes>> = {}) => {
  const aoMudar = vi.fn(), gravar = vi.fn(async () => null as string | null), herdar = vi.fn(async () => null as string | null);
  const props: React.ComponentProps<typeof Previa3DLigacoes> = {
    valor: [], alterado: false, origem: "automatico", proprio: false, atributos: ATRIBUTOS, zonas: ZONAS, orfas: 0, ignoradas: 0, podeEditar: true, aoMudar, gravar, herdar, ...p,
  };
  const r = render(<Previa3DLigacoes {...props} />);
  return { aoMudar, gravar, herdar, props, ...r };
};
const L = (atributo: string, zona: Ligacao["zona"], aplicar = true): Ligacao => ({ atributo, zona, aplicar });

describe("o painel «Ligações»", () => {
  it("sem ligações explica a regra automática (pelo nome do atributo) e oferece «Acrescentar ligação»", () => {
    montar();
    expect(screen.getByRole("heading", { name: "Ligações" })).toBeTruthy();
    expect(screen.getByText(/pelo nome do atributo/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Acrescentar ligação" })).toBeTruthy();
  });
  it("cada linha tem o atributo, a zona e «Aplicar», todos com rótulo, e o botão de remover diz qual linha", () => {
    montar({ valor: [L(A_FRENTE, "frente"), L(A_BRILHO, "tudo", false)] });
    const um = screen.getByRole("group", { name: "Ligação 1" });
    expect((within(um).getByLabelText("Atributo") as HTMLSelectElement).value).toBe(A_FRENTE);
    expect((within(um).getByLabelText("Zona") as HTMLSelectElement).value).toBe("frente");
    expect((within(um).getByRole("switch", { name: "Aplicar" }) as HTMLElement).getAttribute("aria-checked")).toBe("true");
    const dois = screen.getByRole("group", { name: "Ligação 2" });
    expect((within(dois).getByLabelText("Zona") as HTMLSelectElement).value).toBe("tudo");
    expect(within(dois).getByRole("switch", { name: "Aplicar" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("button", { name: "Remover a ligação 2" })).toBeTruthy();
  });
  it("a zona tem «Tudo» e as zonas do modelo (mais uma zona já usada que o modelo não tenha, para não a perder)", () => {
    montar({ valor: [L(A_FRENTE, "estofo")] });
    const opcoes = within(screen.getByLabelText("Zona")).getAllByRole("option").map((o) => o.textContent);
    expect(opcoes).toEqual(["Tudo", "Frente", "Corpo", "Tampo", "Estofo"]);
  });
  it("mudar o atributo, a zona e «Aplicar» chama aoMudar com a lista nova (sem mexer na antiga)", () => {
    const valor = [L(A_FRENTE, "frente")];
    const { aoMudar } = montar({ valor });
    fireEvent.change(screen.getByLabelText("Atributo"), { target: { value: A_CORPO } });
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_CORPO, "frente")]);
    fireEvent.change(screen.getByLabelText("Zona"), { target: { value: "tampo" } });
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_FRENTE, "tampo")]);
    fireEvent.click(screen.getByRole("switch", { name: "Aplicar" }));
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_FRENTE, "frente", false)]);
    expect(valor).toEqual([L(A_FRENTE, "frente")]);
  });
  it("«Acrescentar ligação» junta um par atributo/zona ainda livre; «Remover» tira a linha", () => {
    const { aoMudar } = montar({ valor: [L(A_FRENTE, "tudo")] });
    fireEvent.click(screen.getByRole("button", { name: "Acrescentar ligação" }));
    const lista = aoMudar.mock.calls[0][0] as Ligacao[];
    expect(lista).toHaveLength(2);
    expect(`${lista[1].atributo}|${lista[1].zona}`).not.toBe(`${A_FRENTE}|tudo`);
    fireEvent.click(screen.getByRole("button", { name: "Remover a ligação 1" }));
    expect(aoMudar).toHaveBeenLastCalledWith([]);
  });
  it("sem atributos de lista, não há como ligar: explica-o em vez de oferecer o botão", () => {
    montar({ atributos: [] });
    expect(screen.queryByRole("button", { name: "Acrescentar ligação" })).toBeNull();
    // 25/11: «atributos» aqui são os que têm cor, foto ou aspeto (os que o 3D pode ler), e não «de lista»: o texto diz isso
    expect(screen.getByText(/nenhum atributo deste produto tem cor, foto ou aspeto/i)).toBeTruthy();
    expect(screen.queryByText(/atributos de lista/i)).toBeNull();
  });
});

describe("guardar e voltar a herdar", () => {
  it("«Guardar ligações» só está activo com alterações (aria-disabled: o foco fica); o clique ignorado não grava", () => {
    const { gravar } = montar({ valor: [L(A_FRENTE, "frente")], alterado: false });
    const b = screen.getByRole("button", { name: "Guardar ligações" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect((b as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(b);
    expect(gravar).not.toHaveBeenCalled();
  });
  it("com alterações grava uma vez e diz-o numa região viva; o erro vem com role=alert", async () => {
    const { gravar } = montar({ valor: [L(A_FRENTE, "frente")], alterado: true });
    fireEvent.click(screen.getByRole("button", { name: "Guardar ligações" }));
    await waitFor(() => expect(gravar).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Ligações guardadas.")).toBeTruthy();
    cleanup();
    const falha = vi.fn(async () => "Sem permissão para gravar a configuração 3D.");
    montar({ valor: [L(A_FRENTE, "frente")], alterado: true, gravar: falha });
    fireEvent.click(screen.getByRole("button", { name: "Guardar ligações" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Sem permissão");
    expect(falha).toHaveBeenCalledTimes(1);
  });
  it("uma ligação repetida (mesmo atributo e zona) é avisada e não se grava", () => {
    const { gravar } = montar({ valor: [L(A_FRENTE, "frente"), L(A_FRENTE, "frente", false)], alterado: true });
    expect(screen.getByText(/repetida/i)).toBeTruthy();
    const b = screen.getByRole("button", { name: "Guardar ligações" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(b);
    expect(gravar).not.toHaveBeenCalled();
  });
  it("o aviso de ligação repetida é um alerta (não uma região de estado) e «Guardar ligações» desactivado aponta para ele", () => {
    montar({ valor: [L(A_FRENTE, "frente"), L(A_FRENTE, "frente", false)], alterado: true });
    const aviso = screen.getByText(/repetida/i);
    expect(aviso.getAttribute("role")).toBe("alert");
    expect(screen.getByRole("button", { name: "Guardar ligações" }).getAttribute("aria-describedby")).toBe(aviso.id);
  });
  it("sem alterações, «Guardar ligações» desactivado diz porquê (aria-describedby para um texto)", () => {
    montar({ valor: [L(A_FRENTE, "frente")], alterado: false });
    const b = screen.getByRole("button", { name: "Guardar ligações" });
    const razao = document.getElementById(b.getAttribute("aria-describedby") ?? "");
    expect(razao?.textContent).toBe("Sem alterações para guardar.");
  });
  it("com alterações válidas, «Guardar ligações» activo não aponta para nenhuma razão", () => {
    montar({ valor: [L(A_FRENTE, "frente")], alterado: true });
    const b = screen.getByRole("button", { name: "Guardar ligações" });
    expect(b.getAttribute("aria-disabled")).toBe("false");
    expect(b.hasAttribute("aria-describedby")).toBe(false);
    expect(screen.queryByText("Sem alterações para guardar.")).toBeNull();
  });
  it("«Voltar a herdar» só actua quando este produto tem ligações próprias", async () => {
    const sem = montar({ valor: [L(A_FRENTE, "frente")], origem: "categoria", proprio: false });
    const b = screen.getByRole("button", { name: "Voltar a herdar as ligações" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(b);
    expect(sem.herdar).not.toHaveBeenCalled();
    cleanup();
    const com = montar({ valor: [L(A_FRENTE, "frente")], origem: "produto", proprio: true });
    fireEvent.click(screen.getByRole("button", { name: "Voltar a herdar as ligações" }));
    await waitFor(() => expect(com.herdar).toHaveBeenCalledTimes(1));
  });
  it("diz de onde vêm as ligações em vigor", () => {
    montar({ valor: [L(A_FRENTE, "frente")], origem: "categoria" });
    expect(screen.getByText(/herdadas da categoria/i)).toBeTruthy();
    cleanup();
    montar({ valor: [L(A_FRENTE, "frente")], origem: "produto", proprio: true });
    expect(screen.getByText(/guardadas neste produto/i)).toBeTruthy();
  });
});

describe("só leitura e avisos", () => {
  it("sem permissão para editar: as ligações lêem-se em texto e não há selectores nem botões de gravar", () => {
    montar({ valor: [L(A_FRENTE, "frente"), L(A_BRILHO, "tudo", false)], podeEditar: false, origem: "produto" });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByLabelText("Atributo")).toBeNull();
    expect(screen.getByText(/Cor da frente/)).toBeTruthy();
    expect(screen.getByText(/Brilho/)).toBeTruthy();
    expect(screen.getByText(/permissão de editar produtos/i)).toBeTruthy();
  });
  it("ligações a atributos que já não existem (órfãs) e ligações inválidas largadas: aviso numa região viva", () => {
    montar({ valor: [L(A_FRENTE, "frente")], orfas: 2, ignoradas: 1 });
    expect(screen.getByText(/2 ligações a atributos que já não existem/i)).toBeTruthy();
    expect(screen.getByText(/1 ligação inválida/i)).toBeTruthy();
  });
  it("uma ligação a um atributo que a lista já não tem aparece com o rótulo «atributo desconhecido», sem rebentar", () => {
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
  it("«Ligar» o Puxador acrescenta uma ligação, «Aplicar: sim»; «Desligar» um nome conhecido acrescenta «Tudo, não»", () => {
    const { aoMudar } = montar({ omissoes: OMISSOES, atributos: [...ATRIBUTOS, { id: A_PUXADOR, nome: "Puxador" }] });
    fireEvent.click(screen.getByRole("button", { name: "Ligar Puxador" }));
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_PUXADOR, "tudo")]); // este modelo não tem a zona «Puxadores»: «Tudo»
    fireEvent.click(screen.getByRole("button", { name: "Desligar Cor da frente" }));
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_FRENTE, "tudo", false)]);
  });
  it("com uma ligação, o estado mostra a ligação em vez da omissão e já não oferece «Ligar»", () => {
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
    return <Previa3DLigacoes valor={valor} alterado origem="automatico" proprio={false} atributos={ATRS} omissoes={OMISSOES} zonas={zonas} orfas={0} ignoradas={0} podeEditar
      aoMudar={setValor} gravar={async () => null} herdar={async () => null} />;
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
  it("«Desligar» volta atrás (sem a ligação), mantém o foco e anuncia «desligado»", () => {
    render(<Guardado zonas={COM_PUXADORES} />);
    fireEvent.click(screen.getByRole("button", { name: "Ligar Puxador" }));
    const desligar = screen.getByRole("button", { name: "Desligar Puxador" });
    desligar.focus();
    fireEvent.click(desligar);
    expect(screen.getByRole("button", { name: "Ligar Puxador" })).toBe(desligar);
    expect(document.activeElement).toBe(desligar);
    expect(screen.getByText("Puxador desligado").getAttribute("aria-live")).toBe("polite");
  });
  it("propõe a zona pelo nome: Puxador → Puxadores (se o modelo a tem), corpo → Corpo, frente → Frente, o resto → Tudo", () => {
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
  it("um Puxador num modelo sem a zona «Puxadores» fica em «Tudo» (nunca na primeira zona, a frente)", () => {
    const { aoMudar } = montar({ omissoes: OMISSOES, atributos: ATRS, zonas: ["frente", "corpo"] });
    fireEvent.click(screen.getByRole("button", { name: "Ligar Puxador" }));
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_PUXADOR, "tudo")]);
  });
});

describe("só os atributos do produto, e as ligações a atributos que o produto já não tem", () => {
  const A_PUXADOR = "aaaaaaaa-0000-4000-a000-000000000004";
  const FORA = { id: A_PUXADOR, nome: "Puxador", fora: true };
  it("sem nenhum atributo do produto que pinte (lista vazia), o painel di-lo em texto simples e não mostra a lista nem «Ligar»", () => {
    montar({ omissoes: [], atributos: [] });
    expect(screen.getByText(/este produto não tem nenhum atributo que pinte o 3D/i)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Atributos que o 3D lê" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Acrescentar ligação" })).toBeNull();
  });
  it("com atributos do produto, essa frase não aparece", () => {
    montar({ omissoes: [{ id: A_FRENTE, nome: "Cor da frente", aplicado: true, onde: "pinta a frente" }] });
    expect(screen.queryByText(/este produto não tem nenhum atributo que pinte o 3D/i)).toBeNull();
  });
  it("uma ligação gravada a um atributo que o produto já não tem continua a aparecer, marcada, e pode-se remover", () => {
    const { aoMudar } = montar({ valor: [L(A_PUXADOR, "tampo"), L(A_FRENTE, "frente")], atributos: [{ id: A_FRENTE, nome: "Cor da frente" }, FORA], omissoes: [] });
    const linha = screen.getByRole("group", { name: "Ligação 1" });
    expect(within(linha).getByText(/o produto já não tem este atributo: remova a ligação/i)).toBeTruthy();
    expect(within(linha).getByRole("option", { name: /Puxador.*o produto já não tem este atributo/i })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Ligação 2" })).queryByText(/já não tem este atributo/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remover a ligação 1" }));
    expect(aoMudar).toHaveBeenLastCalledWith([L(A_FRENTE, "frente")]);
  });
  it("o atributo que o produto já não tem não se oferece nas outras linhas nem em «Acrescentar ligação»", () => {
    const { aoMudar } = montar({
      valor: [L(A_FRENTE, "tudo"), L(A_FRENTE, "frente"), L(A_FRENTE, "tampo"), L(A_PUXADOR, "tampo")], atributos: [{ id: A_FRENTE, nome: "Cor da frente" }, FORA], zonas: ["frente", "tampo"], omissoes: [],
    });
    const primeira = screen.getAllByLabelText("Atributo")[0] as HTMLSelectElement;
    expect(within(primeira).queryByRole("option", { name: /Puxador/ })).toBeNull();
    // a «Cor da frente» já está em todas as zonas: só o Puxador (que o produto já não tem) estaria livre, e esse não se oferece
    fireEvent.click(screen.getByRole("button", { name: "Acrescentar ligação" }));
    expect(aoMudar).not.toHaveBeenCalled();
  });
  it("só leitura: a ligação a um atributo que o produto já não tem lê-se marcada", () => {
    montar({ valor: [L(A_PUXADOR, "tampo")], atributos: [FORA], podeEditar: false, omissoes: [] });
    expect(screen.getByText(/Puxador → Tampo.*o produto já não tem este atributo/i)).toBeTruthy();
  });
});
