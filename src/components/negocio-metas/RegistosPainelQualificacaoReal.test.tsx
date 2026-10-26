// A aba Qualificação do painel «Visita e levantamento» na ficha real: com um negócio tem «O que o cliente pediu» (campo próprio) e as perguntas; sem
// negócio diz que a qualificação se faz no negócio (não há onde a gravar); a «Morada da obra» começa vazia, com os atalhos, e o rascunho leva a origem.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
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
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

beforeAll(prepararRadixNoJsdom);

const PESSOAS: PessoaOpcao[] = [{ id: "p-paulo", nome: "Paulo Neves" }];
const HOJE = "2026-10-13";
const DA_VISITA = { rua: "Rua da Visita 9", codigoPostal: "2000-002", localidade: "Santarém", andar: "" };
const ENTIDADE = { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "2.º Dto." };
const visita = (): VisitaNegocio => ({
  id: "v1", data: "2026-10-22", hora: "10:00", feitoPor: "Bruno Costa", estado: "porFazer", tipo: "levantamento", quemVaiEstar: "", duracao: "",
  morada: DA_VISITA, igualALead: false, nota: "",
});
const comNegocio = (pedido = ""): ValoresIniciaisNegocio => ({
  pessoaId: "p-paulo", comercial: "Bruno Costa", visitas: [visita()], real: { moradaEntidade: ENTIDADE, negocio: { pedidoCliente: pedido } },
});
const semNegocio = (): ValoresIniciaisNegocio => ({ pessoaId: "p-paulo", comercial: "Bruno Costa", visitas: [visita()], real: { moradaEntidade: ENTIDADE } });

function abrir(iniciais: ValoresIniciaisNegocio) {
  const aoGuardar = vi.fn((_r: RascunhoLevantamento, _v: VisitaNegocio[], _c: string) => true);
  render(
    <NovoNegocioDialogo
      pessoas={PESSOAS} modo="registos" aberto semBotao hoje={HOJE} abaInicial="qualificacao" pessoaInicialId="p-paulo" valoresIniciais={iniciais}
      guardarLevantamento={{ texto: "Guardar o levantamento", aoGuardar }}
    />,
  );
  return { aoGuardar, dialogo: screen.getByRole("dialog", { name: "Novo negócio" }) };
}
const guardar = (d: HTMLElement) => fireEvent.click(within(d).getByRole("button", { name: "Guardar o levantamento" }));
const pedido = (d: HTMLElement) => within(d).getByLabelText(/O que o cliente pediu/);

describe("Qualificação com negócio: «O que o cliente pediu»", () => {
  it("é um campo próprio, abre com o pedido gravado e tem o limite de 2000 caracteres", () => {
    const { dialogo } = abrir(comNegocio("Remodelar a casa de banho"));
    expect(pedido(dialogo)).toHaveValue("Remodelar a casa de banho");
    expect(pedido(dialogo)).toHaveAttribute("maxlength", "2000");
  });

  it("o que se escreve segue no rascunho; apagar tudo segue vazio (limpa)", () => {
    const { aoGuardar, dialogo } = abrir(comNegocio("antigo"));
    fireEvent.change(pedido(dialogo), { target: { value: "  Cozinha nova  " } });
    guardar(dialogo);
    expect(aoGuardar.mock.calls[0][0].pedidoCliente).toBe("  Cozinha nova  ");
    fireEvent.change(pedido(dialogo), { target: { value: "" } });
    guardar(dialogo);
    expect(aoGuardar.mock.calls[1][0].pedidoCliente).toBe("");
  });
});

describe("Qualificação sem negócio", () => {
  it("diz que a qualificação se faz no negócio e não mostra pedido nem perguntas", () => {
    const { dialogo } = abrir(semNegocio());
    expect(within(dialogo).getByText(/A qualificação grava-se no negócio/)).toBeInTheDocument();
    expect(within(dialogo).queryByLabelText(/O que o cliente pediu/)).toBeNull();
    expect(within(dialogo).queryByText(/respondidas/)).toBeNull();
  });

  it("o rascunho não leva pedido", () => {
    const { aoGuardar, dialogo } = abrir(semNegocio());
    guardar(dialogo);
    expect(aoGuardar.mock.calls[0][0].pedidoCliente).toBeUndefined();
  });
});

describe("Morada da obra no painel real", () => {
  it("começa vazia, mesmo com uma visita com morada, e sem origem", () => {
    const { aoGuardar, dialogo } = abrir(comNegocio());
    expect(within(dialogo).getByLabelText("Rua e número")).toHaveValue("");
    expect(within(dialogo).queryByText(/Preenchida a partir da visita/)).toBeNull();
    guardar(dialogo);
    expect(aoGuardar.mock.calls[0][0].moradaOrigem ?? null).toBeNull();
  });

  it("«Preencher com os dados da entidade» copia os quatro campos e o rascunho leva a origem 'entidade'", () => {
    const { aoGuardar, dialogo } = abrir(comNegocio());
    fireEvent.click(within(dialogo).getByRole("button", { name: "Preencher com os dados da entidade" }));
    expect(within(dialogo).getByLabelText("Rua e número")).toHaveValue("Rua A 1");
    expect(within(dialogo).getByLabelText("Andar / fração")).toHaveValue("2.º Dto.");
    guardar(dialogo);
    expect(aoGuardar.mock.calls[0][0]).toMatchObject({ moradaObra: ENTIDADE, moradaOrigem: "entidade" });
  });

  it("escrever depois de copiar passa a 'manual'", () => {
    const { aoGuardar, dialogo } = abrir(comNegocio());
    fireEvent.click(within(dialogo).getByRole("button", { name: "Preencher com os dados da entidade" }));
    fireEvent.change(within(dialogo).getByLabelText("Rua e número"), { target: { value: "Rua A 1, Loja" } });
    guardar(dialogo);
    expect(aoGuardar.mock.calls[0][0].moradaOrigem).toBe("manual");
  });

  it("há «Estou no local» e o atalho antigo da morada do contacto não aparece", () => {
    const { dialogo } = abrir(comNegocio());
    expect(within(dialogo).getByRole("button", { name: "Estou no local" })).toBeInTheDocument();
    expect(within(dialogo).queryByRole("button", { name: "Usar a morada do contacto" })).toBeNull();
  });
});

describe("Sem o contexto real (o exemplo)", () => {
  it("não há pedido do cliente nem atalhos reais; a morada continua a acompanhar a visita", () => {
    const { dialogo } = abrir({ pessoaId: "p-paulo", comercial: "Bruno Costa", visitas: [visita()] });
    expect(within(dialogo).queryByLabelText(/O que o cliente pediu/)).toBeNull();
    expect(within(dialogo).queryByRole("button", { name: "Estou no local" })).toBeNull();
    expect(within(dialogo).getByLabelText("Rua e número")).toHaveValue("Rua da Visita 9");
  });
});
