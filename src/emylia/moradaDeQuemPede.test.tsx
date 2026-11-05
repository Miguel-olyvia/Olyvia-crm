// 4/11: «Morada de quem pede» no passo «Quem pede»: mostra a morada da ficha, só grava por ação de quem edita, só dá por gravada a decisão
// da RPC que ligou mesmo a morada, e não toca na morada da obra
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { acoes, seed } from "./motor";
import { MoradaDeQuemPede, definirMoradaDaEntidade } from "./MoradaDeQuemPede";
import type { Ctx } from "./pecas";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/addresses/procurarCodigoPostal", async (orig) => ({ ...(await orig<object>()), procurarCodigoPostal: async () => null }));

let desligar: (() => void) | null = null;
afterEach(() => { desligar?.(); desligar = null; });

const LEAD_X = { entityId: "p1", primeiro: "Inês", apelido: "Lopes", empresa: "", notas: "", fonteId: "", fonte: "", campanha: "",
  comercialId: "u1", comercial: "Catarina", respostas: [], extra: {} };

function montar(entityId = "p1", obra = true) {
  const S = seed();
  const d = S.deals.find((x) => x.fase === 0)!;
  d.dadosLead = { ...LEAD_X, entityId };
  if (obra) { d.f.morada = "Rua da Obra 5"; d.f.cp = "2000-001"; d.f.localidade = "Santarém"; }
  const run = (fn: () => void) => fn();
  const ctx = { S, A: acoes(S, () => {}, run), run, go: (fn: () => void) => () => fn() } as unknown as Ctx;
  return { d, ctx };
}
const DA_FICHA = { rua: "Rua do Cliente 1", cp: "1000-100", localidade: "Lisboa" };

describe("Morada de quem pede", () => {
  it("fora da página real (sem quem grave) não aparece", () => {
    const { d, ctx } = montar();
    render(<MoradaDeQuemPede ctx={ctx} d={d} />);
    expect(screen.queryByText("Morada de quem pede")).toBeNull();
  });

  it("mostra a morada da ficha e NÃO grava ao abrir nem ao passar o foco sem mudar nada", async () => {
    const gravar = vi.fn(async () => "inserted");
    desligar = definirMoradaDaEntidade({ ler: async () => DA_FICHA, gravar });
    const { d, ctx } = montar();
    render(<MoradaDeQuemPede ctx={ctx} d={d} />);
    const rua = await screen.findByLabelText("Rua e número");
    await waitFor(() => expect(rua).toHaveValue("Rua do Cliente 1"));
    expect(screen.getByLabelText("Código postal")).toHaveValue("1000-100");
    expect(screen.getByText(/Se for diferente da morada da obra/)).toBeInTheDocument();
    fireEvent.blur(rua);
    await new Promise((r) => setTimeout(r, 30));
    expect(gravar).not.toHaveBeenCalled();
  });

  it("grava ao sair do bloco e não mexe na morada da obra", async () => {
    const gravar = vi.fn(async () => "repointed");
    desligar = definirMoradaDaEntidade({ ler: async () => DA_FICHA, gravar });
    const { d, ctx } = montar();
    render(<MoradaDeQuemPede ctx={ctx} d={d} />);
    const rua = await screen.findByLabelText("Rua e número");
    await waitFor(() => expect(rua).toHaveValue("Rua do Cliente 1"));
    fireEvent.change(rua, { target: { value: "Rua Nova 7" } });
    fireEvent.blur(rua);
    await waitFor(() => expect(gravar).toHaveBeenCalledWith("p1", { rua: "Rua Nova 7", cp: "1000-100", localidade: "Lisboa" }));
    expect(await screen.findByRole("status")).toHaveTextContent("gravada na ficha do cliente");
    expect([d.f.morada, d.f.cp, d.f.localidade]).toEqual(["Rua da Obra 5", "2000-001", "Santarém"]);
  });

  it("a RPC recusa (skip_filler): erro em texto, não diz «gravada» e não mexe na sugestão da morada da obra", async () => {
    const gravar = vi.fn(async () => "skip_filler");
    desligar = definirMoradaDaEntidade({ ler: async () => null, gravar });
    const { d, ctx } = montar("p1", false);
    d.moradaLead = { morada: "Antiga 1", cp: "1000-001", localidade: "Lisboa", fracao: "", de: "ficha" };
    render(<MoradaDeQuemPede ctx={ctx} d={d} />);
    const rua = await screen.findByLabelText("Rua e número");
    fireEvent.change(rua, { target: { value: "Rua Nova 7" } });
    fireEvent.change(screen.getByLabelText("Código postal"), { target: { value: "1000-100" } });
    fireEvent.blur(rua);
    expect(await screen.findByRole("alert")).toHaveTextContent("Morada não aceite");
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(rua).toHaveAttribute("aria-invalid", "true");
    expect(d.moradaLead?.morada).toBe("Antiga 1");
  });

  it("código postal incompleto ou 0000-000: avisa em texto e não grava", async () => {
    const gravar = vi.fn(async () => "inserted");
    desligar = definirMoradaDaEntidade({ ler: async () => null, gravar });
    const { d, ctx } = montar();
    render(<MoradaDeQuemPede ctx={ctx} d={d} />);
    const rua = await screen.findByLabelText("Rua e número"), cp = screen.getByLabelText("Código postal");
    fireEvent.change(rua, { target: { value: "Rua Nova 7" } });
    fireEvent.change(cp, { target: { value: "1000" } });
    fireEvent.blur(rua);
    expect(await screen.findByRole("alert")).toHaveTextContent("7 dígitos");
    fireEvent.change(cp, { target: { value: "0000-000" } });
    fireEvent.blur(rua);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("0000-000 não é válido"));
    expect(gravar).not.toHaveBeenCalled();
  });

  it("ao trocar de pessoa, o que ficou por gravar vai para a anterior e nunca para a seguinte", async () => {
    const gravar = vi.fn(async () => "inserted");
    const fichas: Record<string, typeof DA_FICHA> = { p1: DA_FICHA, p2: { rua: "Rua do Outro 9", cp: "4000-400", localidade: "Porto" } };
    desligar = definirMoradaDaEntidade({ ler: async (e) => fichas[e] ?? null, gravar });
    const um = montar("p1"), dois = montar("p2");
    const { rerender } = render(<MoradaDeQuemPede ctx={um.ctx} d={um.d} />);
    const rua = await screen.findByLabelText("Rua e número");
    await waitFor(() => expect(rua).toHaveValue("Rua do Cliente 1"));
    fireEvent.change(rua, { target: { value: "Editada da P1" } });
    rerender(<MoradaDeQuemPede ctx={dois.ctx} d={dois.d} />);
    await waitFor(() => expect(screen.getByLabelText("Rua e número")).toHaveValue("Rua do Outro 9"));
    fireEvent.blur(screen.getByLabelText("Rua e número"));
    await new Promise((r) => setTimeout(r, 30));
    expect(gravar).toHaveBeenCalledTimes(1);
    expect(gravar).toHaveBeenCalledWith("p1", { rua: "Editada da P1", cp: "1000-100", localidade: "Lisboa" });
  });

  it("sem permissão de registar o contacto o bloco é só de leitura e não grava", async () => {
    const gravar = vi.fn(async () => "inserted");
    desligar = definirMoradaDaEntidade({ ler: async () => DA_FICHA, gravar });
    const { d, ctx } = montar();
    ctx.S.role = "tecnico";
    render(<MoradaDeQuemPede ctx={ctx} d={d} />);
    const rua = await screen.findByLabelText("Rua e número");
    await waitFor(() => expect(rua).toHaveValue("Rua do Cliente 1"));
    expect(rua).toHaveAttribute("readonly");
    expect(screen.getByText(/Só de leitura/)).toBeInTheDocument();
    fireEvent.blur(rua);
    expect(gravar).not.toHaveBeenCalled();
  });
});
