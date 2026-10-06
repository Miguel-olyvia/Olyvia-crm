/**
 * `ConviteAdmissao` e os anexos: a pagina so orquestra. O hook de anexos e
 * simulado (o seu comportamento tem teste proprio); aqui verifica-se o que a
 * pagina faz com ele -- onde poe o cartao, quando trava o Submeter, o que
 * acontece com um motivo de convite e que os ficheiros NUNCA entram nos dados
 * submetidos.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ResultadoConviteAnexos } from "@/hooks/useConviteAnexos";
import type { AnexoConvite } from "@/lib/hr/conviteAnexos";

const MOTIVO_EXPIRADO = "Este link expirou. Peça um novo link ao RH.";

vi.mock("@/hooks/useTranslation", async () => {
  const { translations } = await import("@/translations/index");
  const pt = (translations as unknown as Record<string, Record<string, string>>).pt;
  return {
    useTranslation: (idioma?: string) => ({
      language: idioma ?? "pt",
      t: (chave: string, params?: Record<string, string | number>) => {
        let texto =
          chave === "hr.convite.motivo.expirado" ? MOTIVO_EXPIRADO : (pt[chave] ?? chave);
        Object.entries(params ?? {}).forEach(([k, v]) => {
          texto = texto.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
        });
        return texto;
      },
    }),
  };
});

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const argumentosDoHook: unknown[][] = [];
let resultadoDoHook: ResultadoConviteAnexos;
vi.mock("@/hooks/useConviteAnexos", () => ({
  useConviteAnexos: (...args: unknown[]) => {
    argumentosDoHook.push(args);
    return resultadoDoHook;
  },
}));

import ConviteAdmissao from "../ConviteAdmissao";

const ANEXO: AnexoConvite = {
  id: "A1",
  tipo: "cartao_cidadao",
  nome_original: "frente.pdf",
  tamanho_bytes: 1000,
  mime_type: "application/pdf",
};

function resultado(extra: Partial<ResultadoConviteAnexos> = {}): ResultadoConviteAnexos {
  return {
    anexos: [],
    envios: {},
    emCurso: false,
    removendo: new Set<string>(),
    contagem: { total: 0, porTipo: {} },
    erroConvite: null,
    adicionar: vi.fn(),
    remover: vi.fn(),
    ...extra,
  };
}

function estadoOk(extra: Record<string, unknown> = {}) {
  return {
    data: {
      convite: {
        pessoa_nome: null,
        email_pessoal: null,
        nif: null,
        niss_ultimos4: null,
        conta_ultimos4: null,
        formato_conta: null,
        rascunho: null,
        valid_until: "2026-10-20T12:00:00Z",
        campos_obrigatorios: [],
        ...extra,
      },
    },
    error: null,
  };
}

let estado: unknown;

function renderConvite() {
  return render(
    <MemoryRouter initialEntries={["/admissao/token-de-teste"]}>
      <Routes>
        <Route path="/admissao/:token" element={<ConviteAdmissao />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function irParaPagina2() {
  await screen.findByText("Os seus dados");
  fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
  await screen.findByText("Assinatura");
}

function assinarEAceitar() {
  fireEvent.change(document.getElementById("convite-assinatura-nome") as HTMLInputElement, {
    target: { value: "Joana Pires" },
  });
  fireEvent.click(document.getElementById("convite-aceite") as HTMLElement);
}

describe("ConviteAdmissao: anexos", () => {
  beforeEach(() => {
    invoke.mockReset();
    argumentosDoHook.length = 0;
    estado = estadoOk({ anexos: [ANEXO] });
    resultadoDoHook = resultado({ anexos: [ANEXO], contagem: { total: 1, porTipo: { cartao_cidadao: 1 } } });
    invoke.mockImplementation(async (_nome: string, opcoes: { body: { action: string } }) => {
      if (opcoes.body.action === "estado") return estado;
      return { data: { ok: true, avisos: [] }, error: null };
    });
  });

  it("chama o hook com o token da URL e os anexos que o estado trouxe", async () => {
    renderConvite();
    await irParaPagina2();
    const comAnexos = argumentosDoHook.filter(([, iniciais]) => Array.isArray(iniciais));
    expect(comAnexos.length).toBeGreaterThan(0);
    expect(comAnexos[0][0]).toBe("token-de-teste");
    expect(comAnexos[0][1]).toEqual([ANEXO]);
    // Antes do estado chegar o hook ja foi chamado (nunca depois de um return antecipado).
    expect(argumentosDoHook[0][0]).toBe("token-de-teste");
  });

  it("mostra o cartao de anexos na pagina 2, entre o fardamento e a assinatura", async () => {
    renderConvite();
    await irParaPagina2();
    const fardamento = screen.getByText("Fardamento");
    const anexos = screen.getByText("Anexos");
    const assinatura = screen.getByText("Assinatura");
    expect(screen.getByText("frente.pdf")).toBeInTheDocument();
    expect(fardamento.compareDocumentPosition(anexos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(anexos.compareDocumentPosition(assinatura) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("nao mostra o cartao de anexos na pagina 1", async () => {
    renderConvite();
    await screen.findByText("Os seus dados");
    expect(screen.queryByText("Anexos")).toBeNull();
  });

  it("com um envio em curso o Submeter fica desactivado e diz porque", async () => {
    resultadoDoHook = resultado({
      emCurso: true,
      envios: {
        "envio-1": { tipo: "fotografia", nome: "eu.png", fase: "a_enviar", progresso: 30, codigoErro: null },
      },
      contagem: { total: 1, porTipo: { fotografia: 1 } },
    });
    renderConvite();
    await irParaPagina2();
    const submeter = screen.getByRole("button", { name: "Submeter" });
    expect(submeter).toBeDisabled();
    expect(screen.getByText("Aguarde que os ficheiros terminem de ser enviados.")).toBeInTheDocument();
    fireEvent.click(submeter);
    expect(invoke.mock.calls.some(([, o]) => (o as { body: { action: string } }).body.action === "submeter")).toBe(false);
  });

  it("enquanto um ficheiro esta a ser removido o Submeter fica desactivado, e volta quando termina", async () => {
    let terminar!: () => void;
    const remover = vi.fn(() => new Promise<void>((resolve) => (terminar = resolve)));
    resultadoDoHook = resultado({
      anexos: [ANEXO],
      contagem: { total: 1, porTipo: { cartao_cidadao: 1 } },
      remover,
    });
    renderConvite();
    await irParaPagina2();
    expect(screen.getByRole("button", { name: "Submeter" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Remover frente.pdf" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Submeter" })).toBeDisabled());
    expect(screen.getByText("Aguarde que os ficheiros terminem de ser enviados.")).toBeInTheDocument();
    expect(remover).toHaveBeenCalledWith("A1");
    fireEvent.click(screen.getByRole("button", { name: "Submeter" }));
    expect(invoke.mock.calls.some(([, o]) => (o as { body: { action: string } }).body.action === "submeter")).toBe(false);

    terminar();
    await waitFor(() => expect(screen.getByRole("button", { name: "Submeter" })).toBeEnabled());
  });

  it("sem envios em curso o Submeter esta activo e nao ha aviso", async () => {
    renderConvite();
    await irParaPagina2();
    expect(screen.getByRole("button", { name: "Submeter" })).toBeEnabled();
    expect(screen.queryByText("Aguarde que os ficheiros terminem de ser enviados.")).toBeNull();
  });

  it("os ficheiros nunca entram nos dados submetidos", async () => {
    renderConvite();
    await irParaPagina2();
    assinarEAceitar();
    fireEvent.click(screen.getByRole("button", { name: "Submeter" }));
    await waitFor(() =>
      expect(invoke.mock.calls.some(([, o]) => (o as { body: { action: string } }).body.action === "submeter")).toBe(true),
    );
    const submissao = invoke.mock.calls.find(
      ([, o]) => (o as { body: { action: string } }).body.action === "submeter",
    )![1] as { body: { dados: Record<string, unknown> } };
    const chaves = Object.keys(submissao.body.dados);
    expect(chaves.filter((c) => /anexo|fotografia|ficheiro/i.test(c))).toEqual([]);
    expect(JSON.stringify(submissao.body)).not.toContain("frente.pdf");
  });

  it("um motivo convite_* vindo dos anexos leva ao cartao de link invalido", async () => {
    renderConvite();
    await irParaPagina2();
    expect(screen.queryByText(MOTIVO_EXPIRADO)).toBeNull();

    resultadoDoHook = resultado({ erroConvite: "convite_expirado" });
    // Um novo render da pagina (o hook devolve agora o motivo).
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(await screen.findByText(MOTIVO_EXPIRADO)).toBeInTheDocument();
  });
});
