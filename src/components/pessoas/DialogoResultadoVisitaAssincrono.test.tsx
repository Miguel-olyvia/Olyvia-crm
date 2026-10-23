// «Resultado da visita» a gravar na base: estado ocupado (aria-busy, aria-disabled), duplo clique, Escape e clique fora bloqueados enquanto grava,
// erros traduzidos dentro do diálogo (e o aviso de falha parcial), foco devolvido e o que acontece se o pai fechar a meio.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AnuncioFichaContext } from "@/components/ficha-comum/anuncioFicha";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { pessoaBase, visitaPessoaBase } from "./fabricaTestes";
import { DialogoResultadoVisita } from "./DialogoResultadoVisita";
import { idLinhaVisita } from "./focoVisita";

vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos = pessoasPaginaTranslations.pt;
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});

beforeAll(prepararRadixNoJsdom);

const ANA = pessoaBase("a", { nome: "Ana" });
const VISITA = visitaPessoaBase("rv-1", { estado: "feita", data: "2026-10-10", hora: "10:00" });

function adiada() {
  let resolver!: () => void;
  let rejeitar!: (e: unknown) => void;
  const promessa = new Promise<void>((ok, nok) => { resolver = ok; rejeitar = nok; });
  return { promessa, resolver, rejeitar };
}

function montar(aoGuardar: (id: string, d: unknown) => void | Promise<void>, anunciar = vi.fn()) {
  const props = { aoFechar: vi.fn(), aoAnunciar: vi.fn() };
  const r = render(
    <AnuncioFichaContext.Provider value={anunciar}>
      <DialogoResultadoVisita pessoa={ANA} visita={VISITA} comNegocioAberto={false} aoGuardar={aoGuardar} {...props} />
    </AnuncioFichaContext.Provider>,
  );
  return { ...props, anunciar, ...r };
}
const escolher = (nome: string) => fireEvent.click(screen.getByRole("radio", { name: nome }));
const guardar = () => screen.getByRole("button", { name: /^Guardar o resultado$|^A guardar…$/ });
const cancelar = () => screen.getByRole("button", { name: "Cancelar" });

describe("DialogoResultadoVisita a gravar", () => {
  it("enquanto grava: botão aria-busy e aria-disabled, duplo clique grava uma vez e o texto passa a «A guardar…»", async () => {
    const { promessa, resolver } = adiada();
    const aoGuardar = vi.fn(() => promessa);
    const { aoFechar } = montar(aoGuardar);
    escolher("Interessado");
    fireEvent.click(guardar());
    expect(guardar()).toHaveTextContent("A guardar…");
    expect(guardar()).toHaveAttribute("aria-busy", "true");
    expect(guardar()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(guardar());
    fireEvent.click(guardar());
    expect(aoGuardar).toHaveBeenCalledTimes(1);
    expect(aoFechar).not.toHaveBeenCalled();
    resolver();
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
  });

  it("enquanto grava os rádios ficam aria-disabled (não disabled: o foco não cai para o body) e não mudam a escolha", async () => {
    const { promessa, resolver } = adiada();
    const { aoFechar } = montar(vi.fn(() => promessa));
    escolher("Interessado");
    const interessado = screen.getByRole("radio", { name: "Interessado" });
    interessado.focus();
    fireEvent.click(guardar());
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).not.toBeDisabled();
      expect(radio).toHaveAttribute("aria-disabled", "true");
    }
    expect(interessado).toHaveFocus();
    escolher("A pensar");
    expect(interessado).toBeChecked();
    expect(screen.getByRole("radio", { name: "A pensar" })).not.toBeChecked();
    resolver();
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
  });

  it("Escape não fecha enquanto grava, nem «Cancelar»; depois de gravar fecha", async () => {
    const { promessa, resolver } = adiada();
    const { aoFechar } = montar(vi.fn(() => promessa));
    escolher("A pensar");
    fireEvent.click(guardar());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(cancelar());
    expect(cancelar()).toHaveAttribute("aria-disabled", "true");
    expect(aoFechar).not.toHaveBeenCalled();
    resolver();
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
  });

  it("fora de uma gravação, Escape continua a fechar", () => {
    const { aoFechar } = montar(vi.fn());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("não deixa escolher outro resultado a meio de uma gravação (o que se grava é o que se viu)", async () => {
    const { promessa, resolver } = adiada();
    const aoGuardar = vi.fn(() => promessa);
    montar(aoGuardar);
    escolher("Interessado");
    fireEvent.click(guardar());
    // aria-disabled (o foco não cai para o body) e a escolha não muda.
    for (const r of screen.getAllByRole("radio")) expect(r).toHaveAttribute("aria-disabled", "true");
    escolher("A pensar");
    expect(screen.getByRole("radio", { name: "Interessado" })).toBeChecked();
    expect(aoGuardar).toHaveBeenCalledExactlyOnceWith("rv-1", { resultado: "interessado" });
    resolver();
    await waitFor(() => expect(guardar()).toHaveTextContent("Guardar o resultado"));
  });

  it("um erro traduzido fica dentro do diálogo, que continua aberto; repetir volta a gravar", async () => {
    const aoGuardar = vi.fn()
      .mockRejectedValueOnce({ chave: "pessoasPagina.real.visit.err.resultado.ng018" })
      .mockResolvedValueOnce(undefined);
    const { aoFechar } = montar(aoGuardar);
    escolher("Interessado");
    fireEvent.click(guardar());
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta visita foi cancelada e não recebe resultado.");
    expect(aoFechar).not.toHaveBeenCalled();
    fireEvent.click(guardar());
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(aoGuardar).toHaveBeenCalledTimes(2);
  });

  it("falha parcial (abordagem encerrada, resultado por gravar): o alerta diz as duas coisas e repetir é possível", async () => {
    const aoGuardar = vi.fn()
      .mockRejectedValueOnce({ chave: "pessoasPagina.real.ficha.partialVisit", chaveExtra: "pessoasPagina.real.visit.err.resultado.ng009" })
      .mockResolvedValueOnce(undefined);
    const { aoFechar } = montar(aoGuardar);
    escolher("Sem interesse");
    fireEvent.change(screen.getByRole("combobox", { name: "Motivo" }), { target: { value: "preco" } });
    fireEvent.click(guardar());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("A abordagem ficou encerrada, mas o resultado da visita não foi registado.");
    expect(alerta).toHaveTextContent("Uma visita que ainda não aconteceu não se pode dar como feita.");
    expect(aoFechar).not.toHaveBeenCalled();
    fireEvent.click(guardar());
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
  });

  it("depois de gravar, o foco vai para a linha da visita quando o botão que abriu o diálogo já não existe", async () => {
    const linha = document.createElement("li");
    linha.id = idLinhaVisita("rv-1");
    linha.tabIndex = -1;
    document.body.appendChild(linha);
    const abrir = document.createElement("button");
    document.body.appendChild(abrir);
    abrir.focus();
    const { rerender, aoFechar, aoAnunciar } = montar(vi.fn().mockResolvedValue(undefined));
    escolher("Interessado");
    fireEvent.click(guardar());
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    abrir.remove();
    rerender(
      <AnuncioFichaContext.Provider value={vi.fn()}>
        <DialogoResultadoVisita pessoa={ANA} visita={null} comNegocioAberto={false} aoGuardar={vi.fn()} aoFechar={aoFechar} aoAnunciar={aoAnunciar} />
      </AnuncioFichaContext.Provider>,
    );
    await waitFor(() => expect(document.activeElement).toBe(linha));
    expect(aoAnunciar).toHaveBeenCalledTimes(1);
    linha.remove();
  });

  it("se o pai fecha a meio da gravação, a gravação não se perde nem se repete, e o resultado anuncia-se na ficha", async () => {
    const { promessa, resolver } = adiada();
    const aoGuardar = vi.fn(() => promessa);
    const anunciar = vi.fn();
    const { rerender, aoFechar, aoAnunciar } = montar(aoGuardar, anunciar);
    escolher("Interessado");
    fireEvent.click(guardar());
    rerender(
      <AnuncioFichaContext.Provider value={anunciar}>
        <DialogoResultadoVisita pessoa={ANA} visita={null} comNegocioAberto={false} aoGuardar={aoGuardar} aoFechar={aoFechar} aoAnunciar={aoAnunciar} />
      </AnuncioFichaContext.Provider>,
    );
    resolver();
    await waitFor(() => expect(anunciar).toHaveBeenLastCalledWith("Resultado da visita de Ana guardado: Interessado"));
    expect(aoGuardar).toHaveBeenCalledTimes(1);
  });

  it("o diálogo tem nome e descrição, e as opções continuam a ser um grupo de rádios com legenda", () => {
    montar(vi.fn());
    const dialogo = screen.getByRole("dialog", { name: "Resultado da visita" });
    expect(dialogo).toHaveAccessibleDescription(/Como correu a visita de/);
    expect(within(dialogo).getByRole("radiogroup", { name: "Resultado" })).toBeInTheDocument();
  });
});
