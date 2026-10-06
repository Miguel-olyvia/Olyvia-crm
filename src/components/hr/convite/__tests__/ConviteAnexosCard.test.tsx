/**
 * `ConviteAnexosCard`: o cartao de anexos do convite publico. Presentacional --
 * recebe o resultado do hook e a funcao `t`; aqui so se testa o que a pessoa ve
 * e o que o leitor de ecra anuncia.
 */
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { translations } from "@/translations/index";
import { ConviteAnexosCard } from "../ConviteAnexosCard";
import type { EnvioAnexo, ResultadoConviteAnexos } from "@/hooks/useConviteAnexos";
import type { AnexoConvite } from "@/lib/hr/conviteAnexos";
import { contarPorTipo } from "@/lib/hr/conviteAnexos";

const pt = (translations as unknown as Record<string, Record<string, string>>).pt;
const t = (chave: string, params?: Record<string, string | number>) => {
  let texto = pt[chave] ?? chave;
  Object.entries(params ?? {}).forEach(([k, v]) => {
    texto = texto.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
  });
  return texto;
};

function anexo(id: string, tipo: AnexoConvite["tipo"], nome: string, tamanho = 2 * 1024 * 1024): AnexoConvite {
  return { id, tipo, nome_original: nome, tamanho_bytes: tamanho, mime_type: "application/pdf" };
}

function montar(
  anexos: AnexoConvite[] = [],
  envios: Record<string, EnvioAnexo> = {},
  accoes: { adicionar?: ReturnType<typeof vi.fn>; remover?: ReturnType<typeof vi.fn> } = {},
) {
  const emVoo = Object.values(envios).filter((e) => e.fase !== "erro");
  const estado: Pick<ResultadoConviteAnexos, "anexos" | "envios" | "contagem" | "adicionar" | "remover"> = {
    anexos,
    envios,
    contagem: { total: anexos.length + emVoo.length, porTipo: contarPorTipo([...anexos, ...emVoo]) },
    adicionar: (accoes.adicionar ?? vi.fn()) as ResultadoConviteAnexos["adicionar"],
    remover: (accoes.remover ?? vi.fn()) as ResultadoConviteAnexos["remover"],
  };
  return render(<ConviteAnexosCard t={t} idioma="pt" estado={estado} />);
}

describe("ConviteAnexosCard: estrutura e etiquetas", () => {
  it("mostra o titulo, a descricao e as tres linhas, cada uma com botao de texto visivel", () => {
    montar();
    expect(screen.getByText("Anexos")).toBeInTheDocument();
    expect(screen.getByText(/Nenhum é obrigatório/)).toBeInTheDocument();
    expect(screen.getByText("Cartão de cidadão")).toBeInTheDocument();
    expect(screen.getByText("Comprovativo de IBAN")).toBeInTheDocument();
    expect(screen.getByText("Fotografia")).toBeInTheDocument();

    // O nome acessivel inclui a linha: "Adicionar ficheiro" repetido tres vezes nao diria nada.
    expect(screen.getByRole("button", { name: "Adicionar ficheiro Cartão de cidadão" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Adicionar ficheiro Comprovativo de IBAN" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Adicionar ficheiro Fotografia" })).toBeVisible();
  });

  it("cada botao aponta para a ajuda de formatos da sua linha", () => {
    montar();
    const botaoCartao = screen.getByRole("button", { name: /Cartão de cidadão/ });
    const ajuda = botaoCartao.getAttribute("aria-describedby") ?? "";
    expect(ajuda.split(" ").map((id) => document.getElementById(id)?.textContent)).toEqual(
      expect.arrayContaining([
        "Frente e verso, ou um PDF com as duas faces. Até 2 ficheiros.",
        "PDF, PNG ou JPEG, até 10 MB cada.",
      ]),
    );

    const botaoFoto = screen.getByRole("button", { name: /Fotografia/ });
    const ajudaFoto = (botaoFoto.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(ajudaFoto).toContain("Só PNG ou JPEG, até 5 MB. Será a sua fotografia na ficha.");
  });

  it("a fotografia so aceita PNG ou JPEG no seletor de ficheiros", () => {
    montar();
    expect(screen.getByTestId("anexo-input-fotografia")).toHaveAttribute("accept", "image/png,image/jpeg");
    expect(screen.getByTestId("anexo-input-cartao_cidadao")).toHaveAttribute(
      "accept",
      "application/pdf,image/png,image/jpeg",
    );
  });

  it("nao pre-visualiza imagens", () => {
    montar([anexo("1", "fotografia", "eu.png")]);
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("ConviteAnexosCard: ficheiros enviados", () => {
  it("lista nome, tamanho e o texto 'Enviado' (nao so a cor)", () => {
    montar([anexo("1", "cartao_cidadao", "frente.pdf", Math.round(1.8 * 1024 * 1024))]);
    const item = screen.getByText("frente.pdf").closest("li") as HTMLElement;
    expect(within(item).getByText("1,8 MB")).toBeInTheDocument();
    expect(within(item).getByText("Enviado")).toBeInTheDocument();
  });

  it("o botao Remover tem o nome do ficheiro no nome acessivel e chama onRemover", () => {
    const remover = vi.fn();
    montar([anexo("A1", "cartao_cidadao", "frente.pdf")], {}, { remover });
    fireEvent.click(screen.getByRole("button", { name: "Remover frente.pdf" }));
    expect(remover).toHaveBeenCalledWith("A1");
  });

  it("mostra o contador 'n de 4 ficheiros'", () => {
    montar([anexo("1", "cartao_cidadao", "a.pdf"), anexo("2", "fotografia", "f.png")]);
    expect(screen.getByText("2 de 4 ficheiros")).toBeInTheDocument();
  });

  it("mostra o contador a zero sem anexos", () => {
    montar();
    expect(screen.getByText("0 de 4 ficheiros")).toBeInTheDocument();
  });
});

describe("ConviteAnexosCard: envio em curso", () => {
  it("durante o envio mostra a barra de progresso com valor e nome acessivel", () => {
    montar([], {
      "envio-1": { tipo: "cartao_cidadao", nome: "verso.pdf", fase: "a_enviar", progresso: 40, codigoErro: null },
    });
    const barra = screen.getByRole("progressbar", { name: "Progresso do envio de verso.pdf" });
    expect(barra).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText("verso.pdf")).toBeInTheDocument();
    expect(screen.getByText("A enviar...")).toBeInTheDocument();
  });

  it("na verificacao diz 'A verificar o ficheiro...' em texto", () => {
    montar([], {
      "envio-1": { tipo: "fotografia", nome: "eu.png", fase: "a_verificar", progresso: 100, codigoErro: null },
    });
    expect(screen.getByText("A verificar o ficheiro...")).toBeInTheDocument();
  });

  it("o que esta a enviar ocupa lugar no contador e nos limites", () => {
    montar([], {
      "envio-1": { tipo: "fotografia", nome: "eu.png", fase: "a_enviar", progresso: 10, codigoErro: null },
    });
    expect(screen.getByText("1 de 4 ficheiros")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fotografia/ })).toBeDisabled();
  });
});

describe("ConviteAnexosCard: erros", () => {
  it("mostra o erro da linha com role alert e a mensagem traduzida, nunca o codigo", () => {
    montar([], {
      "envio-1": {
        tipo: "fotografia",
        nome: "grande.jpg",
        fase: "erro",
        progresso: 0,
        codigoErro: "anexo_fotografia_demasiado_grande",
      },
    });
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("grande.jpg");
    expect(alerta).toHaveTextContent("A fotografia não pode passar dos 5 MB.");
    expect(document.body.textContent).not.toContain("anexo_fotografia_demasiado_grande");
  });

  it("o erro aparece na linha do seu tipo e nao nas outras", () => {
    montar([], {
      "envio-1": { tipo: "cartao_cidadao", nome: "x.gif", fase: "erro", progresso: 0, codigoErro: "anexo_formato_invalido" },
    });
    const linhaCartao = screen.getByRole("group", { name: "Cartão de cidadão" });
    const linhaFoto = screen.getByRole("group", { name: "Fotografia" });
    expect(within(linhaCartao).getByRole("alert")).toBeInTheDocument();
    expect(within(linhaFoto).queryByRole("alert")).toBeNull();
  });

  it("um codigo sem texto proprio cai na mensagem de falha de envio", () => {
    montar([], {
      "envio-1": { tipo: "cartao_cidadao", nome: "x.pdf", fase: "erro", progresso: 0, codigoErro: "qualquer_coisa" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível enviar o ficheiro. Verifique a ligação e tente de novo.",
    );
  });

  it("um erro nao ocupa lugar nem desactiva o botao", () => {
    montar([], {
      "envio-1": { tipo: "fotografia", nome: "x.gif", fase: "erro", progresso: 0, codigoErro: "anexo_formato_invalido" },
    });
    expect(screen.getByRole("button", { name: /Fotografia/ })).toBeEnabled();
    expect(screen.getByText("0 de 4 ficheiros")).toBeInTheDocument();
  });
});

describe("ConviteAnexosCard: limites", () => {
  it("desactiva so o botao do tipo cheio", () => {
    montar([anexo("1", "fotografia", "eu.png")]);
    expect(screen.getByRole("button", { name: /Fotografia/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Cartão de cidadão/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Comprovativo de IBAN/ })).toBeEnabled();
  });

  it("o cartao de cidadao aceita dois e so depois desactiva", () => {
    const { unmount } = montar([anexo("1", "cartao_cidadao", "a.pdf")]);
    expect(screen.getByRole("button", { name: /Cartão de cidadão/ })).toBeEnabled();
    unmount();
    montar([anexo("1", "cartao_cidadao", "a.pdf"), anexo("2", "cartao_cidadao", "b.pdf")]);
    expect(screen.getByRole("button", { name: /Cartão de cidadão/ })).toBeDisabled();
  });

  it("com quatro ficheiros desactiva todos os botoes de adicionar", () => {
    montar([
      anexo("1", "cartao_cidadao", "a.pdf"),
      anexo("2", "cartao_cidadao", "b.pdf"),
      anexo("3", "comprovativo_iban", "c.pdf"),
      anexo("4", "fotografia", "d.png"),
    ]);
    for (const botao of screen.getAllByRole("button", { name: /^Adicionar ficheiro/ })) {
      expect(botao).toBeDisabled();
    }
    expect(screen.getByText("4 de 4 ficheiros")).toBeInTheDocument();
  });
});

describe("ConviteAnexosCard: escolher ficheiros", () => {
  it("chama onAdicionar com o tipo da linha e o ficheiro, e limpa o seletor", () => {
    const adicionar = vi.fn();
    montar([], {}, { adicionar });
    const entrada = screen.getByTestId("anexo-input-comprovativo_iban") as HTMLInputElement;
    const ficheiro = new File([new Uint8Array(10)], "iban.pdf", { type: "application/pdf" });
    fireEvent.change(entrada, { target: { files: [ficheiro] } });
    expect(adicionar).toHaveBeenCalledTimes(1);
    expect(adicionar).toHaveBeenCalledWith("comprovativo_iban", ficheiro);
    expect(entrada.value).toBe("");
  });

  it("o botao abre o seletor da sua linha", () => {
    montar();
    const entrada = screen.getByTestId("anexo-input-cartao_cidadao") as HTMLInputElement;
    const clique = vi.spyOn(entrada, "click");
    fireEvent.click(screen.getByRole("button", { name: /Cartão de cidadão/ }));
    expect(clique).toHaveBeenCalled();
  });

  it("nao chama onAdicionar sem ficheiros escolhidos", () => {
    const adicionar = vi.fn();
    montar([], {}, { adicionar });
    fireEvent.change(screen.getByTestId("anexo-input-fotografia"), { target: { files: [] } });
    expect(adicionar).not.toHaveBeenCalled();
  });
});

describe("ConviteAnexosCard: limite atingido", () => {
  it("explica em texto visivel porque o botao esta inerte e liga-o por aria-describedby", () => {
    montar([anexo("1", "fotografia", "eu.png")]);
    const botao = screen.getByRole("button", { name: /Fotografia/ });
    expect(botao).toBeDisabled();
    const ids = (botao.getAttribute("aria-describedby") ?? "").split(" ");
    const textos = ids.map((id) => document.getElementById(id)?.textContent);
    expect(textos).toContain("Limite atingido. Remova um ficheiro para adicionar outro.");
    const linhaFoto = screen.getByRole("group", { name: "Fotografia" });
    expect(
      within(linhaFoto).getByText("Limite atingido. Remova um ficheiro para adicionar outro."),
    ).toBeVisible();
  });

  it("sem limite atingido nao ha aviso de limite", () => {
    montar([]);
    expect(screen.queryByText(/Limite atingido/)).toBeNull();
  });
});

/** Um hook falso com estado: a remocao fica pendente ate `terminar()`. */
function Harness({ inicial, terminar }: { inicial: AnexoConvite[]; terminar: { fn: () => void } }) {
  const [anexos, setAnexos] = useState(inicial);
  const remover = (id: string) =>
    new Promise<void>((resolve) => {
      terminar.fn = () => {
        setAnexos((actuais) => actuais.filter((a) => a.id !== id));
        resolve();
      };
    });
  const estado: Pick<ResultadoConviteAnexos, "anexos" | "envios" | "contagem" | "adicionar" | "remover"> = {
    anexos,
    envios: {},
    contagem: { total: anexos.length, porTipo: contarPorTipo(anexos) },
    adicionar: vi.fn() as ResultadoConviteAnexos["adicionar"],
    remover,
  };
  return <ConviteAnexosCard t={t} idioma="pt" estado={estado} />;
}

describe("ConviteAnexosCard: remover", () => {
  it("enquanto remove, o botao fica desactivado e ocupado, e diz 'A remover...'", async () => {
    const terminar = { fn: () => {} };
    render(<Harness inicial={[anexo("A1", "cartao_cidadao", "frente.pdf")]} terminar={terminar} />);
    const botao = screen.getByRole("button", { name: "Remover frente.pdf" });
    fireEvent.click(botao);

    expect(await screen.findByText("A remover...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover frente.pdf" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remover frente.pdf" })).toHaveAttribute("aria-busy", "true");

    await act(async () => terminar.fn());
  });

  it("um segundo clique enquanto remove nao repete o pedido", async () => {
    const remover = vi.fn(() => new Promise<void>(() => {}));
    montar([anexo("A1", "cartao_cidadao", "frente.pdf")], {}, { remover });
    const botao = screen.getByRole("button", { name: "Remover frente.pdf" });
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(remover).toHaveBeenCalledTimes(1);
  });

  it("depois de removido, o foco vai para o botao Adicionar da linha e a remocao e anunciada", async () => {
    const terminar = { fn: () => {} };
    render(<Harness inicial={[anexo("A1", "cartao_cidadao", "frente.pdf")]} terminar={terminar} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover frente.pdf" }));
    await act(async () => terminar.fn());

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Adicionar ficheiro Cartão de cidadão" })).toHaveFocus(),
    );
    const anuncio = screen.getByText("Removido: frente.pdf");
    expect(anuncio.closest("[aria-live='polite']")).not.toBeNull();
    expect(screen.queryByText("frente.pdf")).toBeNull();
  });

  it("se a remocao falha, o ficheiro continua e o botao volta a ficar activo", async () => {
    const remover = vi.fn().mockResolvedValue(undefined);
    montar([anexo("A1", "cartao_cidadao", "frente.pdf")], {}, { remover });
    fireEvent.click(screen.getByRole("button", { name: "Remover frente.pdf" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Remover frente.pdf" })).toBeEnabled());
    expect(screen.getByText("frente.pdf")).toBeInTheDocument();
    expect(screen.queryByText(/^Removido:/)).toBeNull();
  });
});
