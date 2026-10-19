// O foco ao fechar os diálogos que gravam contra a base (perder, anular, ganhar). O diálogo não tem `DialogTrigger`, por isso o Radix não
// devolve o foco a lado nenhum e ele caía no corpo da página: cancelar (ou Esc, ou Fechar) passa a devolvê-lo a quem abriu o diálogo.
// Depois de gravar, o botão que o abriu já não faz sentido (o negócio mudou de estado e o botão desaparece): o foco não volta para ele,
// fica onde quem monta o pôs (o título do detalhe).
import { useRef, useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { negocioBase } from "@/components/pessoas/fabricaTestes";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ComCostura, erroNegFalso, mutacoesFalsas, pendente } from "./costuraTestUtil";
import { PerderNegocioDialogo } from "./PerderNegocioDialogo";
import { MOTIVOS_PREDEFINIDOS } from "./workflowNegocio";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

beforeAll(prepararRadixNoJsdom);
afterEach(cleanup);

const negocio = negocioBase("n1", { pessoa: "Ana", servico: "Cozinha", estadoReal: "aberto" });

function Harness({ perder }: { perder?: () => Promise<{ mudou: boolean }> }) {
  const [aberto, setAberto] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  return (
    <ComCostura mutacoes={mutacoesFalsas(perder ? { perder } : {})}>
      <button type="button" onClick={() => setAberto(true)}>Abrir</button>
      <h3 ref={titulo} tabIndex={-1}>Título do negócio</h3>
      <PerderNegocioDialogo
        negocio={aberto ? negocio : null} hoje="2026-10-19" motivos={MOTIVOS_PREDEFINIDOS} aoFechar={() => setAberto(false)}
        // O detalhe (que muda de estado depois de a ficha se refazer) leva o foco ao título, já com o diálogo fechado.
        aoPerder={() => { setTimeout(() => titulo.current?.focus(), 30); }}
      />
    </ComCostura>
  );
}

function abrir() {
  const botao = screen.getByRole("button", { name: "Abrir" });
  botao.focus();
  fireEvent.click(botao);
  return botao;
}

describe("foco ao fechar um diálogo de envio", () => {
  it("cancelar devolve o foco ao botão que abriu o diálogo", async () => {
    render(<Harness />);
    const botao = abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(botao));
  });

  it("depois de gravar o foco fica no título e não volta ao botão que abriu o diálogo", async () => {
    render(<Harness />);
    const botao = abrir();
    fireEvent.change(await screen.findByRole("combobox", { name: "Motivo da perda" }), { target: { value: "Preço" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar a perda" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await new Promise((r) => setTimeout(r, 120));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Título do negócio" }));
    expect(document.activeElement).not.toBe(botao);
  });

  it("se a gravação falha o diálogo não fecha e o foco não se mexe do diálogo", async () => {
    render(<Harness perder={async () => { throw erroNegFalso("pessoasPagina.erroNeg.ng002", "NG002"); }} />);
    abrir();
    fireEvent.change(await screen.findByRole("combobox", { name: "Motivo da perda" }), { target: { value: "Preço" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar a perda" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("o botão de fechar dos diálogos de envio", () => {
  it("é o nosso (traduzido, de 44 px) e não o «Close» em inglês de 16 px do componente partilhado", async () => {
    render(<Harness />);
    abrir();
    const fechar = await screen.findByRole("button", { name: "Fechar" });
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(fechar.className).toMatch(/\bh-11\b/);
    expect(fechar.className).toMatch(/\bw-11\b/);
  });

  it("fecha o diálogo quando não há nada a guardar", async () => {
    render(<Harness />);
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("a guardar fica aria-disabled e não fecha (a gravação já seguiu)", async () => {
    const acao = pendente<{ mudou: boolean }>();
    render(<Harness perder={() => acao.promessa} />);
    abrir();
    fireEvent.change(await screen.findByRole("combobox", { name: "Motivo da perda" }), { target: { value: "Preço" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar a perda" }));
    const fechar = await screen.findByRole("button", { name: "Fechar" });
    await waitFor(() => expect(fechar).toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(fechar);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await acao.terminar({ mudou: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
