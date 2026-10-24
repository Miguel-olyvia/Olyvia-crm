// O painel «Visita e levantamento» (o modo `registos`) nos limites do desenho: o código postal da obra e o das visitas são validados ao guardar (com o
// foco no campo errado), uma visita que já existe na base (`visitasGravadas`) não se remove, CANCELA-SE (com confirmação), e as já feitas ou canceladas
// só se leem; e os campos de texto têm os limites da base. Uma visita que ainda não existe continua a poder remover-se, como antes.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NovoNegocioDialogo } from "./NovoNegocioDialogo";
import type { VisitaNegocio } from "./negocioMetas";
import type { PessoaOpcao, RascunhoLevantamento, ValoresIniciaisNegocio } from "./novoNegocio";

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
const MORADA = { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" };
const visita = (id: string, extra: Partial<VisitaNegocio> = {}): VisitaNegocio => ({
  id, data: "2026-10-22", hora: "10:00", feitoPor: "Bruno Costa", estado: "porFazer", tipo: "levantamento", quemVaiEstar: "", duracao: "",
  morada: MORADA, igualALead: false, nota: "", ...extra,
});
const valores = (extra: Partial<ValoresIniciaisNegocio>): ValoresIniciaisNegocio => ({ pessoaId: "p-paulo", comercial: "Bruno Costa", ...extra });

function abrir(iniciais: ValoresIniciaisNegocio, gravadas: readonly string[] = []) {
  const aoGuardar = vi.fn((_rascunho: RascunhoLevantamento, _visitas: VisitaNegocio[], _comercial: string) => true);
  render(
    <NovoNegocioDialogo
      pessoas={PESSOAS} modo="registos" aberto semBotao valoresIniciais={iniciais} visitasGravadas={new Set(gravadas)}
      guardarLevantamento={{ texto: "Guardar o levantamento", aoGuardar }}
    />,
  );
  return { aoGuardar, dialogo: screen.getByRole("dialog", { name: "Novo negócio" }) };
}
const guardar = (d: HTMLElement) => fireEvent.click(within(d).getByRole("button", { name: "Guardar o levantamento" }));
const separador = (d: HTMLElement, nome: RegExp) => within(d).getByRole("tab", { name: nome });
const irParaVisitas = (d: HTMLElement) => {
  fireEvent.mouseDown(separador(d, /^Visita/));
  fireEvent.click(within(d).getByRole("button", { name: /^Visitas/ }));
};
const abrirCartao = (d: HTMLElement, n = 1) => fireEvent.click(within(d).getByRole("button", { name: new RegExp(`^${n}\\.ª visita`) }));
const POSTAL_INVALIDO = "O código postal tem o formato 0000-000, por exemplo 1000-001.";

describe("código postal validado ao guardar", () => {
  it("o da obra fora do formato não guarda: leva à Qualificação, põe o foco no campo e diz o erro; corrigido, guarda", async () => {
    const { aoGuardar, dialogo } = abrir(valores({ moradaObra: { rua: "", codigoPostal: "12", localidade: "", andar: "" } }));
    guardar(dialogo);
    expect(aoGuardar).not.toHaveBeenCalled();
    expect(separador(dialogo, /^Qualificação/)).toHaveAttribute("aria-selected", "true");
    const campo = within(dialogo).getByLabelText("Código postal");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(within(dialogo).getByText(POSTAL_INVALIDO)).toBeInTheDocument();
    await waitFor(() => expect(campo).toHaveFocus());
    fireEvent.change(campo, { target: { value: "1000-001" } });
    guardar(dialogo);
    expect(aoGuardar).toHaveBeenCalledTimes(1);
  });

  it("o de uma visita fora do formato não guarda: abre a visita, põe o foco no campo e diz o erro", async () => {
    const { aoGuardar, dialogo } = abrir(valores({ visitas: [visita("v1", { morada: { ...MORADA, codigoPostal: "12" } })] }));
    guardar(dialogo);
    expect(aoGuardar).not.toHaveBeenCalled();
    expect(separador(dialogo, /^Visita/)).toHaveAttribute("aria-selected", "true");
    const campo = await within(dialogo).findByLabelText("Código postal");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(within(dialogo).getByText(POSTAL_INVALIDO)).toBeInTheDocument();
    await waitFor(() => expect(campo).toHaveFocus());
    fireEvent.change(campo, { target: { value: "4000-123" } });
    guardar(dialogo);
    expect(aoGuardar).toHaveBeenCalledTimes(1);
  });

  it("vazio ou no formato guarda; uma visita cancelada não conta para a validação", () => {
    const { aoGuardar, dialogo } = abrir(valores({
      moradaObra: { rua: "", codigoPostal: "", localidade: "", andar: "" },
      visitas: [visita("v1", { morada: { ...MORADA, codigoPostal: "" } }), visita("v2", { estado: "cancelada", morada: { ...MORADA, codigoPostal: "xx" } })],
    }));
    guardar(dialogo);
    expect(aoGuardar).toHaveBeenCalledTimes(1);
  });
});

describe("uma visita que já existe na base: «Remover» é cancelar", () => {
  it("não tem «Remover»: tem «Cancelar visita», que pede confirmação e só depois marca a visita como cancelada", () => {
    const { aoGuardar, dialogo } = abrir(valores({ visitas: [visita("v1")] }), ["v1"]);
    irParaVisitas(dialogo);
    expect(within(dialogo).queryByRole("button", { name: /^Remover a visita/ })).toBeNull();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar a visita de 22/10/2026" }));
    const confirmacao = screen.getByRole("alertdialog", { name: "Cancelar esta visita?" });
    fireEvent.click(within(confirmacao).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(within(dialogo).getByRole("button", { name: /^1\.ª visita/ })).toHaveTextContent("Por fazer");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar a visita de 22/10/2026" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancelar a visita" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(within(dialogo).getByRole("button", { name: /^1\.ª visita/ })).toHaveTextContent("Cancelada");
    guardar(dialogo);
    expect(aoGuardar.mock.calls[0][1]).toMatchObject([{ id: "v1", estado: "cancelada" }]);
  });

  it("confirmar o cancelamento devolve o foco ao resumo da visita (o botão que abriu a confirmação já não existe)", async () => {
    const { dialogo } = abrir(valores({ visitas: [visita("v1")] }), ["v1"]);
    irParaVisitas(dialogo);
    const abrirConfirmacao = () => {
      const botao = within(dialogo).getByRole("button", { name: "Cancelar a visita de 22/10/2026" });
      botao.focus(); // o clique do utilizador foca o botão; o `fireEvent` não
      fireEvent.click(botao);
    };
    abrirConfirmacao();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    abrirConfirmacao();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancelar a visita" }));
    await waitFor(() => expect(within(dialogo).getByRole("button", { name: /^1\.ª visita/ })).toHaveFocus());
  });

  it("uma visita que ainda não existe na base continua a poder remover-se, sem confirmação", () => {
    const { dialogo } = abrir(valores({ visitas: [visita("v1"), visita("v2", { data: "2026-10-23" })] }), ["v1"]);
    irParaVisitas(dialogo);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Remover a visita de 23/10/2026" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(within(dialogo).queryByRole("button", { name: /^2\.ª visita/ })).toBeNull();
    expect(within(dialogo).getByRole("button", { name: /^1\.ª visita/ })).toBeInTheDocument();
  });

  it("uma visita já feita (da base) só se lê: campos desativados, sem cancelar nem remover, e diz porquê", () => {
    const { dialogo } = abrir(valores({ visitas: [visita("v1", { estado: "feita" })] }), ["v1"]);
    irParaVisitas(dialogo);
    expect(within(dialogo).getByLabelText("Data da visita")).toBeDisabled();
    expect(within(dialogo).queryByRole("button", { name: /^(Remover|Cancelar) a visita/ })).toBeNull();
    expect(within(dialogo).getByText("Esta visita já está feita e fica só para ler.")).toBeInTheDocument();
  });

  it("uma visita cancelada (da base) só se lê", () => {
    const { dialogo } = abrir(valores({ visitas: [visita("v1", { estado: "cancelada" })] }), ["v1"]);
    irParaVisitas(dialogo);
    abrirCartao(dialogo);
    expect(within(dialogo).getByLabelText("Data da visita")).toBeDisabled();
    expect(within(dialogo).queryByRole("button", { name: /^(Remover|Cancelar) a visita/ })).toBeNull();
    expect(within(dialogo).getByText("Esta visita já está cancelada e fica só para ler.")).toBeInTheDocument();
  });

  it("o estado de uma visita da base por fazer não oferece voltar atrás nem Cancelada à mão (cancela-se pelo botão, com confirmação)", () => {
    const { dialogo } = abrir(valores({ visitas: [visita("v1")] }), ["v1"]);
    irParaVisitas(dialogo);
    abrirCartao(dialogo);
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: "Estado" }), { key: "Enter" });
    const opcoes = screen.getAllByRole("option").map((o) => o.textContent);
    expect(opcoes).toEqual(["Por fazer", "Feita"]);
  });
});

describe("os limites da base nos campos de texto", () => {
  it("a visita: nota até 140, rua até 300, localidade até 120 e andar até 60", () => {
    const { dialogo } = abrir(valores({ visitas: [visita("v1")] }));
    irParaVisitas(dialogo);
    abrirCartao(dialogo);
    expect(within(dialogo).getByLabelText("Nota (opcional)")).toHaveAttribute("maxlength", "140");
    expect(within(dialogo).getByLabelText("Rua e número")).toHaveAttribute("maxlength", "300");
    expect(within(dialogo).getByLabelText("Localidade")).toHaveAttribute("maxlength", "120");
    expect(within(dialogo).getByLabelText("Andar / fração")).toHaveAttribute("maxlength", "60");
  });

  it("a morada da obra: rua até 300, localidade até 120 e andar até 60", () => {
    const { dialogo } = abrir(valores({}));
    fireEvent.mouseDown(separador(dialogo, /^Qualificação/));
    expect(within(dialogo).getByLabelText("Rua e número")).toHaveAttribute("maxlength", "300");
    expect(within(dialogo).getByLabelText("Localidade")).toHaveAttribute("maxlength", "120");
    expect(within(dialogo).getByLabelText("Andar / fração")).toHaveAttribute("maxlength", "60");
  });

  it("as observações do levantamento e de cada linha: até 1000", () => {
    const { dialogo } = abrir(valores({ levantamento: { linhas: [{ id: "l1", divisao: "cozinha", trabalho: "bancada", trabalhoOutro: "", medida: "2", unidade: "m2", observacoes: "" }], observacoes: "", respostas: {} } }));
    fireEvent.mouseDown(separador(dialogo, /^Visita/));
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Medidas/ }));
    const campos = dialogo.querySelectorAll<HTMLInputElement>('input[id$="-obs"], input[id$="-observacoes"]');
    expect(campos.length).toBe(2);
    campos.forEach((c) => expect(c).toHaveAttribute("maxlength", "1000"));
  });
});
