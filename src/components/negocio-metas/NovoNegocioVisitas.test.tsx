// Arranque da secção Visitas do painel "Novo negócio": a lista de visitas (adicionar, marcar como feita, remover, contador) e
// a visita concluída que vem de Pessoas, que chega como Feita.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NovoNegocioDialogo } from "./NovoNegocioDialogo";
import { HOJE_EXEMPLO } from "./negocioMetasExemplo";
import { somarDias, type PessoaOpcao, type ValoresIniciaisNegocio } from "./novoNegocio";

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

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

const PESSOAS: PessoaOpcao[] = [{ id: "p-paulo", nome: "Paulo Neves" }];
const DA_PESSOA: ValoresIniciaisNegocio = {
  pessoaId: "p-paulo", comercial: "Bruno Costa",
  visita: {
    data: "2026-10-15", quemFez: "Bruno Costa", estado: "feito", igualALead: false, hora: "10:00",
    moradaObra: { rua: "Zona Industrial, Lote 7", codigoPostal: "4700-500", localidade: "Braga", andar: "Armazém 2" },
  },
};

const abrir = (valoresIniciais?: ValoresIniciaisNegocio) => {
  const aoCriar = vi.fn();
  render(<NovoNegocioDialogo pessoas={PESSOAS} aoCriar={aoCriar} aberto semBotao valoresIniciais={valoresIniciais} />);
  const dialogo = screen.getByRole("dialog", { name: "Novo negócio" });
  fireEvent.mouseDown(within(dialogo).getByRole("tab", { name: /^Visita/ }));
  fireEvent.click(within(dialogo).getByRole("button", { name: /^Visitas/ }));
  return { aoCriar, dialogo };
};
const adicionar = (d: HTMLElement) => fireEvent.click(within(d).getByRole("button", { name: "Adicionar visita" }));
const lista = (d: HTMLElement) => within(d).getByRole("list", { name: "Visitas do negócio" });
const escolher = async (d: HTMLElement, campo: string | RegExp, opcao: string) => {
  fireEvent.keyDown(within(d).getByRole("combobox", { name: campo }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: opcao }));
};

describe("lista de visitas: adicionar, marcar como feita, remover e contar", () => {
  it("adicionar põe uma visita Por fazer (Revisita, daqui a 2 dias), abre-a com o foco na data e actualiza o contador", async () => {
    const { dialogo } = abrir();
    adicionar(dialogo);
    const cartao = within(lista(dialogo)).getAllByRole("listitem")[0];
    expect(within(cartao).getByText("1.ª visita")).toBeInTheDocument();
    expect(cartao).toHaveTextContent(`Por fazer · ${somarDias(HOJE_EXEMPLO, 2).split("-").reverse().join("/")} · Ana Ribeiro · Revisita`);
    await waitFor(() => expect(within(dialogo).getByLabelText("Data da visita")).toHaveFocus());
    expect(within(dialogo).getAllByText("1 visita · 0 feitas").length).toBeGreaterThan(0);
    adicionar(dialogo);
    expect(within(lista(dialogo)).getAllByRole("listitem")).toHaveLength(2);
    expect(within(dialogo).getAllByText("2 visitas · 0 feitas").length).toBeGreaterThan(0);
  });

  it("as visitas ficam por ordem cronológica e só há uma aberta de cada vez", () => {
    const { dialogo } = abrir();
    adicionar(dialogo);
    fireEvent.change(within(dialogo).getByLabelText("Data da visita"), { target: { value: "2026-11-20" } });
    adicionar(dialogo);
    fireEvent.change(within(dialogo).getByLabelText("Data da visita"), { target: { value: "2026-11-10" } });
    const cartoes = within(lista(dialogo)).getAllByRole("listitem");
    expect(cartoes[0]).toHaveTextContent("1.ª visita");
    expect(cartoes[0]).toHaveTextContent("10/11/2026");
    expect(cartoes[1]).toHaveTextContent("2.ª visita");
    expect(cartoes[1]).toHaveTextContent("20/11/2026");
    expect(within(dialogo).getAllByLabelText("Data da visita")).toHaveLength(1);
    const abertos = within(lista(dialogo)).getAllByRole("button", { expanded: true });
    expect(abertos).toHaveLength(1);
  });

  it("«Marcar como feita» muda a visita num clique, tem o nome com a data, e o contador conta uma feita", async () => {
    const { dialogo } = abrir();
    adicionar(dialogo);
    const dia = somarDias(HOJE_EXEMPLO, 2).split("-").reverse().join("/");
    fireEvent.click(within(dialogo).getByRole("button", { name: `Marcar como feita a visita de ${dia}` }));
    const cartao = within(lista(dialogo)).getAllByRole("listitem")[0];
    expect(cartao).toHaveTextContent("Feita ·");
    expect(within(cartao).queryByRole("button", { name: /Marcar como feita/ })).not.toBeInTheDocument();
    expect(within(dialogo).getAllByText("1 visita · 1 feita").length).toBeGreaterThan(0);
    await waitFor(() => expect(within(cartao).getByRole("button", { expanded: true })).toHaveFocus());
  });

  it("«Remover» tem o nome com a data e devolve o foco a «Adicionar visita»; sem visitas volta o estado vazio", async () => {
    const { dialogo } = abrir();
    adicionar(dialogo);
    const dia = somarDias(HOJE_EXEMPLO, 2).split("-").reverse().join("/");
    const remover = within(dialogo).getByRole("button", { name: `Remover a visita de ${dia}` });
    expect(remover).toHaveTextContent("Remover");
    fireEvent.click(remover);
    expect(within(dialogo).getByText("Ainda sem visitas. Acrescenta a primeira.")).toBeInTheDocument();
    await waitFor(() => expect(within(dialogo).getByRole("button", { name: "Adicionar visita" })).toHaveFocus());
  });

  it("os campos da visita mudam a visita (estado, tipo, quem vai estar, duração e morada) e vão para o negócio ao criar", async () => {
    const { aoCriar, dialogo } = abrir(DA_PESSOA);
    adicionar(dialogo);
    fireEvent.change(within(dialogo).getByLabelText("Hora"), { target: { value: "14:30" } });
    fireEvent.click(within(dialogo).getByRole("radio", { name: "Medição técnica" }));
    fireEvent.click(within(dialogo).getByRole("radio", { name: "O casal" }));
    fireEvent.click(within(dialogo).getByRole("radio", { name: "1 h" }));
    fireEvent.change(within(dialogo).getByLabelText("Rua e número"), { target: { value: "Rua Nova 5" } });
    await escolher(dialogo, "Feito por", "Ana Ribeiro");
    // A visita concluída que veio de Pessoas já é Feita: pede linhas de levantamento, como sempre.
    fireEvent.mouseDown(within(dialogo).getByRole("tab", { name: /^Visita/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Medidas da área/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar linha" }));
    await escolher(dialogo, /^Divisão ou zona/, "Cozinha");
    await escolher(dialogo, /^Trabalho a fazer/, "Bancada nova");
    fireEvent.change(within(dialogo).getByLabelText(/^Medida(?!s)/), { target: { value: "3" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Criar negócio" }));
    expect(aoCriar).toHaveBeenCalledTimes(1);
    const { visitas } = aoCriar.mock.calls[0][0];
    expect(visitas.map((v: { id: string }) => v.id)).toEqual(["v-pessoa", "v1"]);
    expect(visitas[1]).toMatchObject({
      estado: "porFazer", tipo: "medicao", hora: "14:30", quemVaiEstar: "casal", duracao: "h1", feitoPor: "Ana Ribeiro",
      veioDaPessoa: false, morada: { rua: "Rua Nova 5", localidade: "Braga" },
    });
  });
});

describe("a visita concluída vem de Pessoas como Feita", () => {
  it("a lista começa com UMA visita Feita, Levantamento, com data, hora, quem fez e a origem da morada, marcada «Veio da pessoa»", () => {
    const { dialogo } = abrir(DA_PESSOA);
    const cartoes = within(lista(dialogo)).getAllByRole("listitem");
    expect(cartoes).toHaveLength(1);
    expect(cartoes[0]).toHaveTextContent("Feita · 15/10/2026 · 10:00 · Bruno Costa · Levantamento");
    expect(within(cartoes[0]).getByText("Veio da pessoa")).toBeInTheDocument();
    expect(within(dialogo).getAllByText("1 visita · 1 feita").length).toBeGreaterThan(0);
    // Aberta para ver: os campos têm os valores da visita e a morada da visita diz de onde veio.
    expect(within(dialogo).getByLabelText("Data da visita")).toHaveValue("2026-10-15");
    expect(within(dialogo).getByLabelText("Hora")).toHaveValue("10:00");
    expect(within(dialogo).getByRole("combobox", { name: "Estado" })).toHaveTextContent("Feita");
    expect(within(dialogo).getByLabelText("Rua e número")).toHaveValue("Zona Industrial, Lote 7");
    expect(within(dialogo).getByText("Morada da visita · outra morada (diferente da que a lead indicou).")).toBeInTheDocument();
  });

  it("não deixa remover essa visita (só editar): não há «Remover», e diz porquê", () => {
    const { dialogo } = abrir(DA_PESSOA);
    expect(within(dialogo).queryByRole("button", { name: /^Remover a visita/ })).not.toBeInTheDocument();
    expect(within(dialogo).getByText(/podes editá-la, mas não removê-la/)).toBeInTheDocument();
  });

  it("escrever na morada da visita deixa de dizer de onde veio", () => {
    const { dialogo } = abrir({ ...DA_PESSOA, visita: { ...DA_PESSOA.visita!, igualALead: true } });
    expect(within(dialogo).getByText("Morada da visita · igual à da lead.")).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText("Rua e número"), { target: { value: "Rua Nova 5" } });
    expect(within(dialogo).queryByText(/^Morada da visita · /)).not.toBeInTheDocument();
  });
});
