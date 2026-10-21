// Os erros de campo dos diálogos do negócio na ficha real dizem-se em role="alert": quem usa um leitor de ecrã ouve o erro no momento em que
// o envio é recusado (antes, só o encontrava se voltasse ao campo). O erro continua em texto, junto ao campo.
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnularPerdaDialogo } from "@/components/negocio-metas/AnularPerdaDialogo";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { PerderNegocioDialogo } from "@/components/negocio-metas/PerderNegocioDialogo";
import { MOTIVOS_PREDEFINIDOS } from "@/components/negocio-metas/workflowNegocio";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { negocioBase } from "./fabricaTestes";
import { fichaDb } from "@/hooks/pessoas/fichaFabrica";
import { NovoNegocioReal } from "./NovoNegocioReal";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

beforeAll(prepararRadixNoJsdom);
afterEach(cleanup);

const aberto = negocioBase("n1", { pessoa: "Ana", servico: "Cozinha", estadoReal: "aberto" });
const perdido = negocioBase("n2", { pessoa: "Ana", servico: "Sala", estadoReal: "perdido" });

describe("erros de campo em role=alert", () => {
  it("perder sem escolher o motivo", () => {
    render(<ComCostura><PerderNegocioDialogo negocio={aberto} hoje="2026-10-19" motivos={MOTIVOS_PREDEFINIDOS} aoFechar={vi.fn()} /></ComCostura>);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar a perda" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escolha o motivo da perda.");
  });

  it("perder com «Outro» sem escrever o motivo", () => {
    render(<ComCostura><PerderNegocioDialogo negocio={aberto} hoje="2026-10-19" motivos={MOTIVOS_PREDEFINIDOS} aoFechar={vi.fn()} /></ComCostura>);
    fireEvent.change(screen.getByRole("combobox", { name: "Motivo da perda" }), { target: { value: "__outro__" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar a perda" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("anular a perda sem a razão", () => {
    render(<ComCostura><AnularPerdaDialogo negocio={perdido} aoFechar={vi.fn()} /></ComCostura>);
    fireEvent.click(screen.getByRole("button", { name: "Anular a perda" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escreva a razão para anular a perda.");
  });

  it("criar um negócio sem título", () => {
    function Caso() {
      const [aberta, setAberta] = useState(true);
      return <NovoNegocioReal pessoaId="a" pessoaNome="Ana" ficha={fichaDb()} aberto={aberta} aoCriado={vi.fn()} aoMudarAberto={setAberta} />;
    }
    render(<ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos()}><Caso /></ComCostura>);
    fireEvent.click(screen.getByRole("button", { name: "Criar o negócio" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escreva o título do negócio");
  });
});
