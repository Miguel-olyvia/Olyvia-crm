/**
 * `ZonaAnexosNovaPessoa`: a zona de anexos do dialogo "Nova pessoa". So desenha
 * os tipos que quem cria pode escrever, mostra os ficheiros escolhidos (com
 * pre-visualizacao das imagens e Retirar), o progresso e os erros, e fica
 * desactivada durante a criacao.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", async () => {
  const { translations } = await import("@/translations/index");
  const pt = (translations as unknown as Record<string, Record<string, string>>).pt;
  return {
    useTranslation: () => ({
      language: "pt",
      t: (chave: string, params?: Record<string, string | number>) => {
        let texto = pt[chave] ?? chave;
        Object.entries(params ?? {}).forEach(([k, v]) => {
          texto = texto.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
        });
        return texto;
      },
    }),
  };
});

import { ZonaAnexosNovaPessoa } from "../ZonaAnexosNovaPessoa";

const NADA = { identificacaoEdit: false, bancariosEdit: false, pessoaisEdit: false };
const TUDO = { identificacaoEdit: true, bancariosEdit: true, pessoaisEdit: true };

const escolher = vi.fn();
const retirar = vi.fn();

type Estado = Parameters<typeof ZonaAnexosNovaPessoa>[0]["estado"];

function item(id: string, nome: string, tipo = "image/png", codigoErro: string | null = null) {
  return { id, file: new File(["x"], nome, { type: tipo }), codigoErro };
}

function estadoCom(parcial: Partial<Estado> = {}): Estado {
  return {
    ficheiros: { cartao_cidadao: [], comprovativo_iban: [], fotografia: [] },
    erroEscolha: null,
    aEnviar: false,
    envios: {},
    escolher,
    retirar,
    ...parcial,
  } as Estado;
}

function montar(estado: Estado, permissoes = TUDO, desactivado = false) {
  return render(<ZonaAnexosNovaPessoa estado={estado} permissoes={permissoes} desactivado={desactivado} />);
}

describe("ZonaAnexosNovaPessoa", () => {
  const original = { criar: URL.createObjectURL, revogar: URL.revokeObjectURL };
  const criarUrl = vi.fn();
  const revogarUrl = vi.fn();

  beforeEach(() => {
    escolher.mockReset().mockReturnValue(null);
    retirar.mockReset();
    criarUrl.mockReset().mockImplementation(() => `blob:p-${criarUrl.mock.calls.length}`);
    revogarUrl.mockReset();
    URL.createObjectURL = criarUrl as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revogarUrl as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    URL.createObjectURL = original.criar;
    URL.revokeObjectURL = original.revogar;
  });

  it("quem nao tem nenhuma das tres permissoes de escrita nao ve a zona", () => {
    const { container } = montar(estadoCom(), NADA);
    expect(container).toBeEmptyDOMElement();
  });

  it("com as tres permissoes mostra os tres tipos, o titulo e o texto de que so seguem depois de criar a ficha", () => {
    montar(estadoCom());
    expect(screen.getByRole("heading", { name: "Anexos" })).toBeInTheDocument();
    expect(screen.getByText(/enviados depois de a ficha ser criada/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anexar: Cartão de cidadão" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anexar: Comprovativo de IBAN" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anexar: Fotografia" })).toBeInTheDocument();
  });

  it("so desenha os tipos que quem cria pode escrever", () => {
    montar(estadoCom(), { ...NADA, bancariosEdit: true });
    expect(screen.getByRole("button", { name: "Anexar: Comprovativo de IBAN" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anexar: Cartão de cidadão" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Anexar: Fotografia" })).toBeNull();
  });

  it("escolher um ficheiro chama escolher(tipo, ficheiro)", () => {
    montar(estadoCom());
    const file = new File(["x"], "cc.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByTestId("ficheiro-anexar-cartao_cidadao"), { target: { files: [file] } });
    expect(escolher).toHaveBeenCalledWith("cartao_cidadao", file);
  });

  it("mostra os ficheiros escolhidos com nome e Retirar, e Retirar chama retirar(tipo, indice)", () => {
    montar(
      estadoCom({
        ficheiros: {
          cartao_cidadao: [item("n1", "frente.pdf", "application/pdf"), item("n2", "verso.pdf", "application/pdf")],
          comprovativo_iban: [],
          fotografia: [],
        },
      }),
    );
    expect(screen.getByText("frente.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retirar da lista: verso.pdf" }));
    expect(retirar).toHaveBeenCalledWith("cartao_cidadao", 1);
  });

  it("uma imagem escolhida tem pre-visualizacao local (URL de objecto revogado ao desmontar); um PDF nao", () => {
    const { unmount } = montar(
      estadoCom({
        ficheiros: {
          cartao_cidadao: [item("n1", "frente.pdf", "application/pdf")],
          comprovativo_iban: [],
          fotografia: [item("n2", "eu.png")],
        },
      }),
    );
    const previews = screen.getAllByTestId("preview-local");
    expect(previews).toHaveLength(1);
    expect(previews[0]).toHaveAttribute("src", "blob:p-1");
    expect(revogarUrl).not.toHaveBeenCalled();
    unmount();
    expect(revogarUrl).toHaveBeenCalledWith("blob:p-1");
  });

  it("tipo cheio (fotografia 1/1) desactiva o seu Anexar; o cartao com 1 de 2 continua activo", () => {
    montar(
      estadoCom({
        ficheiros: {
          cartao_cidadao: [item("n1", "frente.pdf", "application/pdf")],
          comprovativo_iban: [],
          fotografia: [item("n2", "eu.png")],
        },
      }),
    );
    expect(screen.getByRole("button", { name: "Anexar: Fotografia" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Anexar: Cartão de cidadão" })).toBeEnabled();
  });

  it("com 4 ficheiros no total todos os Anexar ficam desactivados", () => {
    montar(
      estadoCom({
        ficheiros: {
          cartao_cidadao: [item("n1", "a.pdf", "application/pdf"), item("n2", "b.pdf", "application/pdf")],
          comprovativo_iban: [item("n3", "c.pdf", "application/pdf")],
          fotografia: [item("n4", "d.png")],
        },
      }),
    );
    for (const nome of ["Anexar: Cartão de cidadão", "Anexar: Comprovativo de IBAN", "Anexar: Fotografia"]) {
      expect(screen.getByRole("button", { name: nome })).toBeDisabled();
    }
  });

  it("desactivada durante a criacao: nem anexar nem retirar", () => {
    montar(
      estadoCom({
        ficheiros: { cartao_cidadao: [item("n1", "frente.pdf", "application/pdf")], comprovativo_iban: [], fotografia: [] },
      }),
      TUDO,
      true,
    );
    expect(screen.getByRole("button", { name: "Anexar: Cartão de cidadão" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Anexar: Fotografia" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retirar da lista: frente.pdf" })).toBeDisabled();
  });

  it("uma recusa ao escolher aparece em role alert na linha do tipo, traduzida", () => {
    montar(estadoCom({ erroEscolha: { tipo: "fotografia", codigo: "anexo_fotografia_formato" } }));
    const linha = screen.getByText("Fotografia", { selector: "span.font-medium" }).closest("li") as HTMLElement;
    const alerta = within(linha).getByRole("alert");
    expect(alerta).not.toHaveTextContent("anexo_fotografia_formato");
    expect(alerta.textContent?.length).toBeGreaterThan(10);
  });

  it("um ficheiro cujo envio falhou depois de criar mostra o erro traduzido", () => {
    montar(
      estadoCom({
        ficheiros: {
          cartao_cidadao: [],
          comprovativo_iban: [],
          fotografia: [item("n1", "eu.png", "image/png", "sem_permissao")],
        },
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Não tem permissão para alterar este tipo de anexo.");
  });

  it("durante o envio mostra o progresso com valor e o estado em texto", () => {
    montar(
      estadoCom({
        aEnviar: true,
        envios: { e1: { tipo: "fotografia", nome: "eu.png", fase: "a_enviar", progresso: 55, codigoErro: null } },
      }),
    );
    const barra = screen.getByRole("progressbar", { name: "Progresso do envio de eu.png" });
    expect(barra).toHaveAttribute("aria-valuenow", "55");
    expect(screen.getByText("A enviar...")).toBeInTheDocument();
  });
});
