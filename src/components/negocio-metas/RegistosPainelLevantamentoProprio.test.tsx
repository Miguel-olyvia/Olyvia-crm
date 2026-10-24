// O painel «Visita e levantamento» (modo `registos`): um levantamento sem visita ligada tem data, estado e comercial próprios (já preenchidos, corrigíveis,
// validados ao guardar e entregues no rascunho); com uma visita a representá-lo herda os dela e o painel não os entrega.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

beforeAll(prepararRadixNoJsdom);

const PESSOAS: PessoaOpcao[] = [{ id: "p-paulo", nome: "Paulo Neves" }];
const HOJE = "2026-10-13";
const MORADA = { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" };
const visita = (id: string, extra: Partial<VisitaNegocio> = {}): VisitaNegocio => ({
  id, data: "2026-10-22", hora: "10:00", feitoPor: "Bruno Costa", estado: "porFazer", tipo: "levantamento", quemVaiEstar: "", duracao: "",
  morada: MORADA, igualALead: false, nota: "", ...extra,
});
const valores = (extra: Partial<ValoresIniciaisNegocio> = {}): ValoresIniciaisNegocio => ({ pessoaId: "p-paulo", comercial: "Bruno Costa", ...extra });

function abrir(iniciais: ValoresIniciaisNegocio) {
  const aoGuardar = vi.fn((_rascunho: RascunhoLevantamento, _visitas: VisitaNegocio[], _comercial: string) => true);
  render(
    <NovoNegocioDialogo
      pessoas={PESSOAS} modo="registos" aberto semBotao hoje={HOJE} abaInicial="visita" valoresIniciais={iniciais}
      guardarLevantamento={{ texto: "Guardar o levantamento", aoGuardar }}
    />,
  );
  return { aoGuardar, dialogo: screen.getByRole("dialog", { name: "Novo negócio" }) };
}
const guardar = (d: HTMLElement) => fireEvent.click(within(d).getByRole("button", { name: "Guardar o levantamento" }));
const campoData = (d: HTMLElement) => within(d).getByLabelText("Data do levantamento");
const rascunhoGuardado = (aoGuardar: ReturnType<typeof abrir>["aoGuardar"]): RascunhoLevantamento => aoGuardar.mock.calls[0][0];

describe("sem visita: o levantamento tem os seus dados", () => {
  it("abre com hoje, por fazer e o comercial, e entrega-os no rascunho ao guardar", () => {
    const { aoGuardar, dialogo } = abrir(valores());
    expect(campoData(dialogo)).toHaveValue(HOJE);
    expect(within(dialogo).getByRole("combobox", { name: "Estado" })).toHaveTextContent("Por fazer");
    expect(within(dialogo).getByRole("combobox", { name: "Comercial" })).toHaveTextContent("Bruno Costa");
    guardar(dialogo);
    expect(aoGuardar).toHaveBeenCalledTimes(1);
    expect(rascunhoGuardado(aoGuardar).dados).toEqual({ data: HOJE, estado: "porFazer", feitoPor: "Bruno Costa" });
  });

  it("corrigir a data e o estado muda o que se entrega", async () => {
    const { aoGuardar, dialogo } = abrir(valores());
    fireEvent.change(campoData(dialogo), { target: { value: "2026-10-05" } });
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: "Estado" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Feito" }));
    guardar(dialogo);
    expect(rascunhoGuardado(aoGuardar).dados).toMatchObject({ data: "2026-10-05", estado: "feito" });
  });

  it("um levantamento já gravado abre com a data, o estado e o comercial que tem", () => {
    const levantamento: RascunhoLevantamento = {
      linhas: [], observacoes: "x", respostas: {}, dados: { data: "2026-10-02", estado: "feito", feitoPor: "Tomás Reis" },
    };
    const { dialogo } = abrir(valores({ levantamento }));
    expect(campoData(dialogo)).toHaveValue("2026-10-02");
    expect(within(dialogo).getByRole("combobox", { name: "Estado" })).toHaveTextContent("Feito");
    expect(within(dialogo).getByRole("combobox", { name: "Comercial" })).toHaveTextContent("Tomás Reis");
  });

  it("uma data inválida não guarda: diz o erro no campo e leva-lhe o foco; corrigida, guarda", async () => {
    const { aoGuardar, dialogo } = abrir(valores());
    fireEvent.change(campoData(dialogo), { target: { value: "1999-12-31" } });
    guardar(dialogo);
    expect(aoGuardar).not.toHaveBeenCalled();
    expect(campoData(dialogo)).toHaveAttribute("aria-invalid", "true");
    expect(within(dialogo).getByText("Indique um dia válido (a partir de 2000).")).toBeInTheDocument();
    await waitFor(() => expect(campoData(dialogo)).toHaveFocus());
    fireEvent.change(campoData(dialogo), { target: { value: "2026-10-05" } });
    guardar(dialogo);
    expect(aoGuardar).toHaveBeenCalledTimes(1);
  });

  it("a data limpa conta como hoje só ao guardar: enquanto se escreve o campo fica como está, sem erro", () => {
    const { aoGuardar, dialogo } = abrir(valores());
    fireEvent.change(campoData(dialogo), { target: { value: "" } });
    // Escrever uma data aos bocados passa por um campo vazio: não salta de volta para hoje.
    expect(campoData(dialogo)).toHaveValue("");
    guardar(dialogo);
    expect(rascunhoGuardado(aoGuardar).dados).toMatchObject({ data: HOJE });
  });
});

describe("com visita ligada: os dados vêm da visita", () => {
  it("os campos só se leem, mostram os da visita, e o rascunho não leva dados próprios", () => {
    const { aoGuardar, dialogo } = abrir(valores({ visitas: [visita("v1", { estado: "feita", data: "2026-10-09", feitoPor: "Tomás Reis" })] }));
    expect(campoData(dialogo)).toBeDisabled();
    expect(campoData(dialogo)).toHaveValue("2026-10-09");
    expect(within(dialogo).getByRole("combobox", { name: "Estado" })).toHaveTextContent("Feito");
    expect(within(dialogo).getByRole("combobox", { name: "Comercial" })).toHaveTextContent("Tomás Reis");
    guardar(dialogo);
    expect(rascunhoGuardado(aoGuardar)).not.toHaveProperty("dados");
  });

  it("uma visita cancelada não conta: os dados voltam a ser do levantamento", () => {
    const { aoGuardar, dialogo } = abrir(valores({ visitas: [visita("v1", { estado: "cancelada" })] }));
    expect(campoData(dialogo)).not.toBeDisabled();
    guardar(dialogo);
    expect(rascunhoGuardado(aoGuardar).dados).toMatchObject({ data: HOJE, estado: "porFazer" });
  });
});
