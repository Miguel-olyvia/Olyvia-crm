// Arranque do botão e do painel lateral "Novo negócio" (o negócio cria-se à mão): abre com as três abas (Geral, Qualificação e Registos), valida
// por campo (e aponta a aba com erros) e devolve os dados ao confirmar. O painel «Visita e levantamento» de uma pessoa (modo `registos`) guarda
// as visitas e o levantamento nos registos da pessoa e nunca cria um negócio. As abas Qualificação e Visita têm o seu ficheiro:
// `NovoNegocioAbas.test.tsx`; ligar registos está em `NovoNegocioRegistos.test.tsx`.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NovoNegocioDialogo } from "./NovoNegocioDialogo";
import { repor as reporRegistos } from "./registosPessoa";
import { HOJE_EXEMPLO } from "./negocioMetasExemplo";
import type { VisitaNegocio } from "./negocioMetas";
import { somarDias, type PessoaOpcao, type RascunhoLevantamento } from "./novoNegocio";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) => {
        let texto = negocioMetasTranslations.pt[key] ?? key;
        Object.entries(params ?? {}).forEach(([k, v]) => { texto = texto.replace(`{${k}}`, String(v)); });
        return texto;
      },
    }),
  };
});

// O jsdom não tem estas funções, que o Select do Radix usa ao abrir a lista.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

const PESSOAS: PessoaOpcao[] = [
  {
    id: "p-marta", nome: "Marta Silveira", contacto: { telefone: "912 345 601", email: null }, email: "marta@exemplo.pt",
    morada: "Rua A, 1000-001 Lisboa", distrito: "Lisboa", nif: "123456789", empresa: "Marta Lda", nifEmpresa: "987654321",
  },
  { id: "p-rui", nome: "Rui Figueiredo" },
];

afterEach(() => { cleanup(); reporRegistos(); });

const abrir = () => {
  const aoCriar = vi.fn();
  render(<NovoNegocioDialogo pessoas={PESSOAS} aoCriar={aoCriar} />);
  fireEvent.click(screen.getByRole("button", { name: "Novo negócio" }));
  return { aoCriar, dialogo: screen.getByRole("dialog", { name: "Novo negócio" }) };
};

/** O painel «Visita e levantamento» da pessoa (modo `registos`): guarda nos registos, nunca cria um negócio. */
const abrirRegistos = (extra: Partial<Parameters<typeof NovoNegocioDialogo>[0]> = {}) => {
  const aoGuardar = vi.fn((_rascunho: RascunhoLevantamento, _visitas: VisitaNegocio[], _comercial: string) => true);
  render(<NovoNegocioDialogo pessoas={PESSOAS} modo="registos" guardarLevantamento={{ texto: "Guardar o levantamento", aoGuardar }} {...extra} />);
  fireEvent.click(screen.getByRole("button", { name: "Novo negócio" }));
  return { aoGuardar, dialogo: screen.getByRole("dialog", { name: "Novo negócio" }) };
};
const guardar = (dialogo: HTMLElement) => fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar o levantamento" }));

type Dialogo = HTMLElement;
const escolher = async (dialogo: Dialogo, campo: RegExp | string, opcao: string) => {
  fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: campo }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: opcao }));
};
const irParaVisita = (dialogo: Dialogo, seccao: RegExp = /^Medidas da área/) => {
  fireEvent.mouseDown(within(dialogo).getByRole("tab", { name: /^Visita/ }));
  fireEvent.click(within(dialogo).getByRole("button", { name: seccao }));
};
/** Na secção Visitas: acrescenta uma visita (abre já para editar). */
const adicionarVisita = (dialogo: Dialogo) => fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar visita" }));
const irParaGeral = (dialogo: Dialogo) => fireEvent.mouseDown(within(dialogo).getByRole("tab", { name: /^Geral/ }));
const criar = (dialogo: Dialogo) => fireEvent.click(within(dialogo).getByRole("button", { name: "Criar negócio" }));
const preencherGeral = async (dialogo: Dialogo) => {
  await escolher(dialogo, /^Pessoa/, "Marta Silveira");
};

describe("NovoNegocioDialogo: a pessoa já escolhida (a da ficha de onde se veio) não se muda", () => {
  const abrirDaFicha = () => {
    const aoCriar = vi.fn();
    render(<NovoNegocioDialogo pessoas={PESSOAS} aoCriar={aoCriar} semBotao aberto pessoaInicialId="p-rui" />);
    return { aoCriar, dialogo: screen.getByRole("dialog", { name: "Novo negócio" }) };
  };

  it("o seletor mostra a pessoa, fica desativado e diz porquê (em texto, ligado ao campo)", () => {
    const { dialogo } = abrirDaFicha();
    const campo = within(dialogo).getByRole("combobox", { name: /^Pessoa/ });
    expect(campo).toHaveTextContent("Rui Figueiredo");
    expect(campo).toBeDisabled();
    const motivo = within(dialogo).getByText("A pessoa é a da ficha de onde veio: não se pode mudar aqui.");
    expect(campo).toHaveAccessibleDescription(motivo.textContent ?? "");
  });

  it("criar o negócio leva a pessoa da ficha, e só ela", () => {
    const { aoCriar, dialogo } = abrirDaFicha();
    criar(dialogo);
    expect(aoCriar).toHaveBeenCalledTimes(1);
    expect(aoCriar.mock.calls[0][0].pessoa).toMatchObject({ id: "p-rui" });
  });

  it("sem pessoa inicial (o botão do Negócio e metas) o seletor continua a deixar escolher", () => {
    const { dialogo } = abrir();
    expect(within(dialogo).getByRole("combobox", { name: /^Pessoa/ })).not.toBeDisabled();
    expect(within(dialogo).queryByText(/não se pode mudar aqui/)).not.toBeInTheDocument();
  });

  it("o foco abre no separador quando o primeiro campo está desativado (nada de foco perdido)", async () => {
    const { dialogo } = abrirDaFicha();
    await waitFor(() => expect(within(dialogo).getByRole("tab", { name: /^Geral/ })).toHaveFocus());
  });
});

describe("NovoNegocioDialogo: painel e aba Geral", () => {
  it("fechado só tem o botão; abre num painel com cabeçalho, selo, três abas e rodapé com Cancelar e Criar", () => {
    render(<NovoNegocioDialogo pessoas={PESSOAS} aoCriar={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Novo negócio" }));
    const dialogo = screen.getByRole("dialog", { name: "Novo negócio" });
    expect(within(dialogo).getByRole("heading", { name: "Novo negócio" })).toBeInTheDocument();
    expect(within(dialogo).getByText("Negócio e metas")).toBeInTheDocument();
    expect(within(dialogo).getByText("Novo · por gravar")).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Fechar" })).toBeInTheDocument();
    const abas = within(dialogo).getAllByRole("tab");
    expect(abas.map((a) => a.textContent)).toEqual(["Geral", "Qualificação0, 0 respostas", "Registos0, 0 a ligar"]);
    expect(within(dialogo).getByRole("tab", { name: /^Geral/ })).toHaveAttribute("aria-selected", "true");
    expect(within(dialogo).getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Criar negócio" })).toHaveAttribute("type", "submit");
  });

  it("a aba Geral tem pessoa, comercial, contacto e o primeiro passo, e não tem serviço", () => {
    const { dialogo } = abrir();
    expect(within(dialogo).getByRole("combobox", { name: /^Pessoa/ })).toBeInTheDocument();
    expect(within(dialogo).queryByRole("combobox", { name: /Serviço/ })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole("textbox", { name: /Serviço|Qual\?/ })).not.toBeInTheDocument();
    expect(within(dialogo).queryByText(/Serviço/)).not.toBeInTheDocument();
    expect(within(dialogo).getByRole("combobox", { name: "Comercial" })).toHaveTextContent("Ana Ribeiro");
    const contacto = within(dialogo).getByRole("group", { name: "Contacto" });
    ["Email", "Morada", "Distrito", "NIF", "Empresa", "NIF da empresa"].forEach((r) => {
      expect(within(contacto).getByLabelText(r)).toHaveValue("");
    });
    expect(within(dialogo).getByText("O negócio começa em Levantamento ou em Orçamento, conforme escolheres na aba Registos.")).toBeInTheDocument();
  });

  it("ao escolher a pessoa pré-preenche o contacto; o campo editado resiste a uma nova escolha", async () => {
    const { dialogo } = abrir();
    await escolher(dialogo, /^Pessoa/, "Marta Silveira");
    expect(within(dialogo).getByLabelText("Email")).toHaveValue("marta@exemplo.pt");
    expect(within(dialogo).getByLabelText("NIF da empresa")).toHaveValue("987654321");
    fireEvent.change(within(dialogo).getByLabelText("Distrito"), { target: { value: "Porto" } });
    await escolher(dialogo, /^Pessoa/, "Rui Figueiredo");
    expect(within(dialogo).getByLabelText("Email")).toHaveValue("");
    expect(within(dialogo).getByLabelText("Distrito")).toHaveValue("Porto");
  });

  it("email e NIF inválidos mostram erro ligado ao campo e não criam", async () => {
    const { aoCriar, dialogo } = abrir();
    await preencherGeral(dialogo);
    fireEvent.change(within(dialogo).getByLabelText("Email"), { target: { value: "marta@" } });
    fireEvent.change(within(dialogo).getByLabelText("NIF"), { target: { value: "123" } });
    criar(dialogo);
    expect(within(dialogo).getByLabelText("Email")).toHaveAccessibleDescription(/email válido/);
    expect(within(dialogo).getByLabelText("NIF")).toHaveAccessibleDescription("O NIF tem 9 dígitos.");
    await waitFor(() => expect(within(dialogo).getByLabelText("Email")).toHaveFocus());
    expect(aoCriar).not.toHaveBeenCalled();
  });

  it("o foco inicial vai para o primeiro campo e Cancelar devolve-o ao botão", async () => {
    const { dialogo } = abrir();
    await waitFor(() => expect(within(dialogo).getByRole("combobox", { name: /^Pessoa/ })).toHaveFocus());
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Novo negócio" })).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Esc fecha o painel e devolve o foco ao botão, mesmo com alterações", async () => {
    const { dialogo } = abrir();
    fireEvent.change(within(dialogo).getByLabelText("Distrito"), { target: { value: "Porto" } });
    fireEvent.keyDown(dialogo, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Novo negócio" })).toHaveFocus());
  });

  it("sem nada preenchido mostra o erro da pessoa, ligado ao campo, avisa na aba Geral e não cria", async () => {
    const { aoCriar, dialogo } = abrir();
    criar(dialogo);
    const pessoa = within(dialogo).getByRole("combobox", { name: /^Pessoa/ });
    expect(pessoa).toHaveAttribute("aria-invalid", "true");
    expect(pessoa).toHaveAccessibleDescription("Escolhe a pessoa do negócio.");
    expect(within(dialogo).queryByText(/serviço/i)).not.toBeInTheDocument();
    await waitFor(() => expect(pessoa).toHaveFocus());
    expect(within(dialogo).getByRole("tab", { name: /^Geral.*com erros/ })).toBeInTheDocument();
    expect(within(dialogo).getByRole("tab", { name: /^Registos(?!.*com erros)/ })).toBeInTheDocument();
    expect(aoCriar).not.toHaveBeenCalled();
  });

  it("só com a pessoa, sem registos por ligar, devolve os dados (sem serviço, sem visitas nem levantamento copiados) e fecha", async () => {
    const { aoCriar, dialogo } = abrir();
    await preencherGeral(dialogo);
    criar(dialogo);
    expect(aoCriar).toHaveBeenCalledWith({
      pessoa: PESSOAS[0], comercial: "Ana Ribeiro",
      contacto: {
        email: "marta@exemplo.pt", morada: "Rua A, 1000-001 Lisboa", distrito: "Lisboa", nif: "123456789",
        empresa: "Marta Lda", nifEmpresa: "987654321",
      },
      qualificacao: [],
      moradaObra: { rua: "", codigoPostal: "", localidade: "", andar: "" },
      // Sem nenhum registo por ligar, o levantamento por omissão é fazer um novo (o negócio começa em Levantamento).
      ligar: { registos: [], levantamento: { tipo: "novo" } },
    });
    const dados = aoCriar.mock.calls[0][0];
    for (const campo of ["levantamento", "visitas", "visita"]) expect(dados, campo).not.toHaveProperty(campo);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("NovoNegocioDialogo (visita e levantamento da pessoa): levantamento dentro da aba Visita", () => {
  it("a secção Visitas começa sem visitas; Adicionar visita traz uma Por fazer, Revisita, daqui a 2 dias, com o comercial; as Medidas da área o aviso, o total e nenhuma linha", () => {
    const { dialogo } = abrirRegistos();
    irParaVisita(dialogo, /^Visitas/);
    expect(within(dialogo).getByText("Ainda sem visitas. Acrescenta a primeira.")).toBeInTheDocument();
    adicionarVisita(dialogo);
    expect(within(dialogo).queryByText("Ainda sem visitas. Acrescenta a primeira.")).not.toBeInTheDocument();
    expect(within(dialogo).getByLabelText("Data da visita")).toHaveValue(somarDias(HOJE_EXEMPLO, 2));
    expect(within(dialogo).getByRole("combobox", { name: "Feito por" })).toHaveTextContent("Ana Ribeiro");
    expect(within(dialogo).getByRole("combobox", { name: "Estado" })).toHaveTextContent("Por fazer");
    expect(within(dialogo).getByRole("radio", { name: "Revisita" })).toHaveAttribute("aria-checked", "true");
    irParaVisita(dialogo);
    expect(within(dialogo).getByText(/O levantamento é opcional: se o preencheres, as medidas passam para o orçamento\./)).toBeInTheDocument();
    expect(within(dialogo).getByText("Total: 0 linhas")).toBeInTheDocument();
    expect(within(dialogo).getByLabelText("Observações gerais")).toHaveValue("");
    expect(within(dialogo).getByRole("button", { name: "Adicionar linha" })).toBeInTheDocument();
  });

  it("Adicionar linha acrescenta uma linha e o contador da aba; Remover tira-a e devolve o foco a Adicionar", async () => {
    const { dialogo } = abrirRegistos();
    irParaVisita(dialogo);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar linha" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar linha" }));
    expect(within(dialogo).getByText("Total: 2 linhas")).toBeInTheDocument();
    expect(within(dialogo).getByRole("tab", { name: /^Visita.*2 respostas/ })).toHaveTextContent("2");
    expect(within(dialogo).getAllByRole("group", { name: /^Linha \d/ })).toHaveLength(2);
    const remover = within(dialogo).getByRole("button", { name: "Remover a linha 2" });
    expect(remover).toHaveTextContent("Remover");
    fireEvent.click(remover);
    expect(within(dialogo).getByText("Total: 1 linha")).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Adicionar linha" })).toHaveFocus();
  });

  it("os trabalhos sugeridos dependem só da divisão da linha", async () => {
    const { dialogo } = abrirRegistos();
    irParaVisita(dialogo);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar linha" }));
    expect(within(dialogo).getByRole("combobox", { name: /^Divisão ou zona/ })).toHaveTextContent("Escolhe a divisão");
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /^Trabalho a fazer/ }), { key: "Enter" });
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Outro (escrever)"]);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    await escolher(dialogo, /^Divisão ou zona/, "Casa de banho");
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /^Trabalho a fazer/ }), { key: "Enter" });
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual([
      "Substituir banheira por base de duche", "Trocar sanita", "Mudar azulejos", "Trocar canalização", "Outro (escrever)",
    ]);
    fireEvent.click(screen.getByRole("option", { name: "Trocar sanita" }));
    // Mudar a divisão limpa o trabalho que já não faz parte das sugestões.
    await escolher(dialogo, /^Divisão ou zona/, "Exterior");
    expect(within(dialogo).getByRole("combobox", { name: /^Trabalho a fazer/ })).toHaveTextContent("Escolhe o trabalho");
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /^Trabalho a fazer/ }), { key: "Enter" });
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Trocar caixilharia", "Estores", "Paredes", "Teto", "Outro (escrever)"]);
  });

  it("Feito sem linhas guarda na mesma: o levantamento é opcional, nada é recusado nem avisado", async () => {
    const { aoGuardar, dialogo } = abrirRegistos();
    irParaVisita(dialogo, /^Visitas/);
    adicionarVisita(dialogo);
    await escolher(dialogo, "Estado", "Feita");
    irParaGeral(dialogo);
    guardar(dialogo);
    expect(aoGuardar).toHaveBeenCalledTimes(1);
    const [rascunho, visitas] = aoGuardar.mock.calls[0];
    expect(visitas.map((v) => v.estado)).toEqual(["feita"]);
    expect(rascunho.linhas).toEqual([]);
  });

  it("uma linha incompleta mostra erros por campo; medida 0 é recusada", async () => {
    const { aoGuardar, dialogo } = abrirRegistos();
    irParaVisita(dialogo);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar linha" }));
    fireEvent.change(within(dialogo).getByLabelText(/^Medida(?!s)/), { target: { value: "0" } });
    guardar(dialogo);
    expect(within(dialogo).getByRole("combobox", { name: /^Divisão ou zona/ })).toHaveAccessibleDescription("Escolhe a divisão.");
    expect(within(dialogo).getByRole("combobox", { name: /^Trabalho a fazer/ })).toHaveAccessibleDescription("Escolhe o trabalho.");
    expect(within(dialogo).getByLabelText(/^Medida(?!s)/)).toHaveAccessibleDescription("A medida tem de ser um número maior que 0.");
    expect(aoGuardar).not.toHaveBeenCalled();
  });

  it("guarda o levantamento: as linhas do formulário, a medida e as observações, e as visitas, nos registos da pessoa", async () => {
    const { aoGuardar, dialogo } = abrirRegistos();
    irParaVisita(dialogo, /^Visitas/);
    adicionarVisita(dialogo);
    await escolher(dialogo, "Estado", "Feita");
    irParaVisita(dialogo);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar linha" }));
    await escolher(dialogo, /^Divisão ou zona/, "Cozinha");
    await escolher(dialogo, /^Trabalho a fazer/, "Bancada nova");
    fireEvent.change(within(dialogo).getByLabelText(/^Medida(?!s)/), { target: { value: "3.5" } });
    await escolher(dialogo, /^Unidade/, "m");
    fireEvent.change(within(dialogo).getByLabelText("Observações"), { target: { value: "Ver canos" } });
    fireEvent.change(within(dialogo).getByLabelText("Observações gerais"), { target: { value: "Cliente em casa de manhã" } });
    guardar(dialogo);
    expect(aoGuardar).toHaveBeenCalledTimes(1);
    const [rascunho, visitas] = aoGuardar.mock.calls[0];
    expect(rascunho.observacoes).toBe("Cliente em casa de manhã");
    expect(rascunho.linhas).toHaveLength(1);
    expect(rascunho.linhas[0]).toMatchObject({ medida: "3.5", unidade: "m", observacoes: "Ver canos" });
    expect(visitas.map((v) => [v.estado, v.data, v.feitoPor])).toEqual([["feita", somarDias(HOJE_EXEMPLO, 2), "Ana Ribeiro"]]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("NovoNegocioDialogo: título, descrição e «Guardar o levantamento» quando o abre um passo", () => {
  const abrirComoPasso = (extra: Partial<Parameters<typeof NovoNegocioDialogo>[0]> = {}) => {
    const aoGuardar = vi.fn((_rascunho: RascunhoLevantamento, _visitas: VisitaNegocio[]) => true);
    render(
      <NovoNegocioDialogo
        pessoas={PESSOAS} modo="registos" semBotao aberto abaInicial="visita" guardarLevantamento={{ texto: "Guardar o levantamento", aoGuardar }} {...extra}
      />,
    );
    return { aoGuardar, dialogo: screen.getByRole("dialog") };
  };

  it("a aba Visita abre nas Medidas da área; com seccaoInicial abre na secção pedida (as Visitas, no passo de marcar a visita como feita)", () => {
    const { dialogo } = abrirComoPasso();
    expect(within(dialogo).getByRole("button", { name: /^Medidas da área/ })).toHaveAttribute("aria-current", "step");
    cleanup();
    const { dialogo: comSeccao } = abrirComoPasso({ seccaoInicial: "visitas" });
    expect(within(comSeccao).getByRole("button", { name: /^Visitas/ })).toHaveAttribute("aria-current", "step");
    expect(within(comSeccao).getByRole("button", { name: /^Medidas da área/ })).not.toHaveAttribute("aria-current");
  });

  it("sem título nem descrição próprios, o painel diz «Novo negócio» e a descrição de sempre", () => {
    const { dialogo } = abrirComoPasso();
    expect(dialogo).toHaveAccessibleName("Novo negócio");
    expect(dialogo).toHaveAccessibleDescription("Só exemplo: o negócio fica nesta página e perde-se ao recarregar.");
  });

  it("com título e descrição próprios (o passo), o painel chama-se como o passo", () => {
    const { dialogo } = abrirComoPasso({ titulo: "Levantamento de Marta Silveira", descricao: "Faça as medidas e guarde." });
    expect(dialogo).toHaveAccessibleName("Levantamento de Marta Silveira");
    expect(dialogo).toHaveAccessibleDescription("Faça as medidas e guarde.");
    expect(within(dialogo).getByRole("heading", { name: "Levantamento de Marta Silveira" })).toBeInTheDocument();
  });

  it("«Guardar o levantamento» só mostra os erros do levantamento: sem pessoa escolhida, a aba Geral não leva aviso de erros", () => {
    const { aoGuardar, dialogo } = abrirComoPasso();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar o levantamento" }));
    expect(aoGuardar).toHaveBeenCalledTimes(1);
    expect(within(dialogo).getByRole("tab", { name: /^Geral/ })).not.toHaveTextContent("com erros");
    expect(within(dialogo).getByRole("tab", { name: /^Qualificação/ })).not.toHaveTextContent("com erros");
  });

  it("«Guardar o levantamento» entrega o rascunho (com a morada da obra) e as visitas do painel", () => {
    const morada = { rua: "Rua B 2", codigoPostal: "4700-010", localidade: "Braga", andar: "" };
    const visita: VisitaNegocio = {
      id: "pd-1-v1", data: "2026-10-15", hora: "10:00", feitoPor: "Bruno Costa", estado: "feita", tipo: "levantamento", quemVaiEstar: "", duracao: "",
      morada, igualALead: true, nota: "  portão azul  ",
    };
    const linha = { id: "l1", divisao: "cozinha", trabalho: "outro", trabalhoOutro: "Bancada", medida: "3,5", unidade: "m2", observacoes: "" };
    const { aoGuardar, dialogo } = abrirComoPasso({
      valoresIniciais: { visitas: [visita], moradaObra: morada, levantamento: { linhas: [linha], observacoes: "Ver canos", respostas: {} } },
    });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar o levantamento" }));
    expect(aoGuardar).toHaveBeenCalledTimes(1);
    const [rascunho, visitas] = aoGuardar.mock.calls[0];
    expect(rascunho).toEqual({ linhas: [linha], observacoes: "Ver canos", respostas: {}, moradaObra: morada });
    expect(visitas).toEqual([{ ...visita, nota: "portão azul" }]);
  });

  it("«Guardar o levantamento» entrega também o comercial escolhido no painel (o da aba Geral, mesmo mudado)", async () => {
    const aoGuardar = vi.fn((_rascunho: RascunhoLevantamento, _visitas: VisitaNegocio[], _comercial: string) => true);
    render(
      <NovoNegocioDialogo
        pessoas={PESSOAS} modo="registos" semBotao aberto abaInicial="visita" guardarLevantamento={{ texto: "Guardar o levantamento", aoGuardar }}
        valoresIniciais={{ pessoaId: "p-marta", comercial: "Bruno Costa" }}
      />,
    );
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar o levantamento" }));
    expect(aoGuardar.mock.calls[0][2]).toBe("Bruno Costa");
    irParaGeral(dialogo);
    await escolher(dialogo, /^Comercial/, "Carla Mendes");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar o levantamento" }));
    expect(aoGuardar.mock.calls[1][2]).toBe("Carla Mendes");
  });

  it("o motivo de uma recusa é um alerta ligado ao botão «Guardar» por aria-describedby; a mesma recusa outra vez remonta o alerta; mexer no rascunho tira-o", () => {
    const aoGuardar = vi.fn(() => false);
    const montar = (tentativa: number) => (
      <NovoNegocioDialogo
        pessoas={PESSOAS} modo="registos" semBotao aberto abaInicial="visita" seccaoInicial="visitas"
        guardarLevantamento={{ texto: "Guardar o levantamento", aoGuardar, motivo: "Falta a visita.", tentativa }}
      />
    );
    const { rerender } = render(montar(1));
    const dialogo = screen.getByRole("dialog");
    const primeiro = within(dialogo).getByRole("alert");
    expect(primeiro).toHaveTextContent("Falta a visita.");
    expect(within(dialogo).getByRole("button", { name: "Guardar o levantamento" })).toHaveAttribute("aria-describedby", primeiro.id);
    rerender(montar(2));
    const segundo = within(dialogo).getByRole("alert");
    expect(segundo).not.toBe(primeiro);
    expect(segundo.textContent).toBe("Falta a visita.");
    adicionarVisita(dialogo);
    expect(within(dialogo).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Guardar o levantamento" })).not.toHaveAttribute("aria-describedby");
    rerender(montar(3));
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("Falta a visita.");
  });

  it("com secção inicial (um passo do «A fazer»), o foco abre no título da secção; sem ela, no separador", async () => {
    const { dialogo } = abrirComoPasso({ seccaoInicial: "visitas" });
    await waitFor(() => expect(within(dialogo).getByRole("heading", { name: /^Visitas/, level: 3 })).toHaveFocus());
    cleanup();
    const { dialogo: semSeccao } = abrirComoPasso();
    await waitFor(() => expect(within(semSeccao).getByRole("tab", { name: /^Visita/ })).toHaveFocus());
  });

  it("a lista de secções da aba Visita quebra linha (flex-wrap) em vez de rolar na horizontal", () => {
    const { dialogo } = abrirComoPasso();
    const lista = within(dialogo).getByRole("navigation", { name: "Secções da visita" }).querySelector("ul")!;
    expect(lista.className).toContain("flex-wrap");
    expect(lista.className).not.toContain("overflow-x-auto");
  });

  it("«Guardar o levantamento» com linhas por acabar leva a aba Visita (só essa) a dizer que tem erros", () => {
    const { aoGuardar, dialogo } = abrirComoPasso();
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Medidas da área/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar linha" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar o levantamento" }));
    expect(aoGuardar).not.toHaveBeenCalled();
    expect(within(dialogo).getByRole("tab", { name: /^Visita/ })).toHaveTextContent("com erros");
    expect(within(dialogo).getByRole("tab", { name: /^Geral/ })).not.toHaveTextContent("com erros");
  });

  it("no painel da pessoa não há «Criar negócio»: nunca se cria um negócio daqui, e Enter num campo guarda", () => {
    const { aoGuardar, dialogo } = abrirComoPasso();
    expect(within(dialogo).queryByRole("button", { name: "Criar negócio" })).not.toBeInTheDocument();
    fireEvent.submit(within(dialogo).getByLabelText("Observações gerais").closest("form")!);
    expect(aoGuardar).toHaveBeenCalledTimes(1);
  });

  it("o motivo que o passo devolve aparece dentro do painel, como alerta, e o painel fica aberto", () => {
    const { dialogo } = abrirComoPasso({
      guardarLevantamento: { texto: "Guardar o levantamento", aoGuardar: () => false, motivo: "Falta pelo menos uma linha de medidas." },
    });
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("Falta pelo menos uma linha de medidas.");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar o levantamento" }));
    expect(screen.getByRole("dialog")).toBe(dialogo);
  });

  it("sem motivo não há alerta no painel", () => {
    const { dialogo } = abrirComoPasso();
    expect(within(dialogo).queryByRole("alert")).not.toBeInTheDocument();
  });
});
