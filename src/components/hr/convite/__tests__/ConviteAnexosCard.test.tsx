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
import { TIPOS_ANEXO_CONVITE, contarPorTipo, type TipoAnexoConvite } from "@/lib/hr/conviteAnexos";

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
  /** Por omissao os tres tipos, para exercitar o cartao por inteiro; o que o portal mostra esta em "tipos abertos". */
  extra: { tipos?: readonly TipoAnexoConvite[]; obrigatorios?: readonly string[] } = { tipos: TIPOS_ANEXO_CONVITE },
) {
  const emVoo = Object.values(envios).filter((e) => e.fase !== "erro");
  const estado: Pick<ResultadoConviteAnexos, "anexos" | "envios" | "contagem" | "adicionar" | "remover"> = {
    anexos,
    envios,
    contagem: { total: anexos.length + emVoo.length, porTipo: contarPorTipo([...anexos, ...emVoo]) },
    adicionar: (accoes.adicionar ?? vi.fn()) as ResultadoConviteAnexos["adicionar"],
    remover: (accoes.remover ?? vi.fn()) as ResultadoConviteAnexos["remover"],
  };
  return render(<ConviteAnexosCard t={t} idioma="pt" estado={estado} tipos={extra.tipos} obrigatorios={extra.obrigatorios} />);
}

describe("ConviteAnexosCard: o que o portal mostra (so o comprovativo de IBAN)", () => {
  it("por omissao so ha a linha do comprovativo: sem cartao de cidadao nem fotografia, e sem contador 'n de 4'", () => {
    montar([], {}, {}, {});
    expect(screen.getByRole("group", { name: "Comprovativo de IBAN" })).toBeInTheDocument();
    expect(screen.queryByText("Cartão de cidadão")).toBeNull();
    expect(screen.queryByText("Fotografia")).toBeNull();
    expect(screen.queryByTestId("anexo-input-cartao_cidadao")).toBeNull();
    expect(screen.queryByTestId("anexo-input-fotografia")).toBeNull();
    expect(screen.queryByText(/de 4 ficheiros/)).toBeNull();
    expect(screen.getByText(/obrigatório quando indica um IBAN/)).toBeInTheDocument();
  });

  it("diz «Obrigatório» em texto na legenda quando o servidor o exige, e so entao", () => {
    const { unmount } = montar([], {}, {}, { obrigatorios: ["comprovativo_iban"] });
    const grupo = screen.getByRole("group", { name: /Comprovativo de IBAN/ });
    expect(within(grupo).getByText("(Obrigatório)")).toBeInTheDocument();
    // esta na legenda do grupo (que da o nome ao grupo): o leitor de ecra di-lo-a, nao so a cor
    expect(grupo.querySelector("legend")).toHaveTextContent("Comprovativo de IBAN (Obrigatório)");
    unmount();
    montar([], {}, {}, { obrigatorios: [] });
    expect(screen.queryByText("(Obrigatório)")).toBeNull();
  });

  it("alvos de 44 px no telemovel: botao de adicionar e de remover; sem capture no seletor", () => {
    montar([anexo("1", "comprovativo_iban", "iban.pdf")], {}, {}, {});
    expect(screen.getByRole("button", { name: "Remover iban.pdf" }).className).toMatch(/h-11/);
    expect(screen.getByRole("button", { name: "Remover iban.pdf" }).className).toMatch(/w-11/);
    const adicionar = screen.getByRole("button", { name: /Adicionar ficheiro/ });
    expect(adicionar.className).toMatch(/min-h-11/);
    expect(adicionar).toHaveAttribute("data-anexo-adicionar", "comprovativo_iban");
    expect(screen.getByTestId("anexo-input-comprovativo_iban")).not.toHaveAttribute("capture");
  });

  it("o nome do ficheiro corta com reticencias e entra sempre como texto, nunca como HTML", () => {
    const nome = '<img src=x onerror="alert(1)">muito-comprido-muito-comprido-muito-comprido.pdf';
    montar([anexo("1", "comprovativo_iban", nome)], {}, {}, {});
    const item = screen.getByText(nome);
    expect(item.className).toMatch(/truncate/);
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("ConviteAnexosCard: acessibilidade (regiao de estado, descricoes, bloqueio)", () => {
  const estadoCom = (anexos: AnexoConvite[], envios: Record<string, EnvioAnexo> = {}) => ({
    anexos,
    envios,
    contagem: { total: anexos.length, porTipo: contarPorTipo(anexos) },
    adicionar: vi.fn() as ResultadoConviteAnexos["adicionar"],
    remover: vi.fn() as ResultadoConviteAnexos["remover"],
  });
  const card = (estado: ReturnType<typeof estadoCom>, extra: Record<string, unknown> = {}) => (
    <ConviteAnexosCard t={t} idioma="pt" estado={estado} {...extra} />
  );

  it("a lista nao e regiao viva; ha UMA regiao role=status por linha, sempre no DOM, com aria-atomic", () => {
    const { container } = render(card(estadoCom([anexo("1", "comprovativo_iban", "iban.pdf")])));
    expect(container.querySelector("ul")).not.toHaveAttribute("aria-live");
    const estados = screen.getAllByRole("status");
    expect(estados).toHaveLength(1);
    expect(estados[0]).toHaveAttribute("aria-atomic", "true");
    expect(estados[0]).toHaveTextContent("");
  });

  it("uma frase curta por transicao: A enviar, Enviado, Erro", async () => {
    const { rerender } = render(card(estadoCom([])));
    const envio = (fase: EnvioAnexo["fase"], codigoErro: string | null = null): Record<string, EnvioAnexo> => ({
      "envio-1": { tipo: "comprovativo_iban", nome: "iban.pdf", fase, progresso: 0, codigoErro },
    });
    rerender(card(estadoCom([], envio("a_enviar"))));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("A enviar iban.pdf"));
    rerender(card(estadoCom([anexo("A1", "comprovativo_iban", "iban.pdf")])));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Enviado: iban.pdf"));
    rerender(card(estadoCom([anexo("A1", "comprovativo_iban", "iban.pdf")], envio("erro", "anexo_formato_invalido"))));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Erro: iban.pdf"));
  });

  it("o nome comprido leva title (o texto cortado le-se por inteiro)", () => {
    const nome = "comprovativo-muito-comprido-do-banco-2027.pdf";
    render(card(estadoCom([anexo("1", "comprovativo_iban", nome)])));
    expect(screen.getByText(nome)).toHaveAttribute("title", nome);
  });

  it("o botao liga-se ao erro da sua linha e ao resumo do formulario por aria-describedby", () => {
    const envios: Record<string, EnvioAnexo> = {
      "envio-1": { tipo: "comprovativo_iban", nome: "x.gif", fase: "erro", progresso: 0, codigoErro: "anexo_formato_invalido" },
    };
    render(card(estadoCom([], envios), { obrigatorios: ["comprovativo_iban"], idAlerta: "resumo-falta" }));
    const botao = screen.getByRole("button", { name: /Adicionar ficheiro/ });
    const ids = (botao.getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids).toContain("resumo-falta");
    const erro = screen.getByRole("alert");
    expect(ids).toContain(erro.id);
    expect(erro.id).not.toBe("");
  });

  it("sem obrigatoriedade o resumo do formulario nao se liga a linha", () => {
    render(card(estadoCom([]), { obrigatorios: [], idAlerta: "resumo-falta" }));
    expect(screen.getByRole("button", { name: /Adicionar ficheiro/ }).getAttribute("aria-describedby") ?? "").not.toContain("resumo-falta");
  });

  it("bloqueado (a submeter): nao se adiciona nem se remove", () => {
    render(card(estadoCom([anexo("1", "comprovativo_iban", "iban.pdf")]), { bloqueado: true }));
    expect(screen.getByRole("button", { name: /Adicionar ficheiro/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remover iban.pdf" })).toBeDisabled();
  });

  it("o spinner de envio para com 'reduzir movimento' e o «Obrigatório» tem tamanho de corpo (text-sm)", () => {
    const envios: Record<string, EnvioAnexo> = {
      "envio-1": { tipo: "comprovativo_iban", nome: "a.pdf", fase: "a_enviar", progresso: 5, codigoErro: null },
    };
    const { container } = render(card(estadoCom([], envios), { obrigatorios: ["comprovativo_iban"] }));
    expect(container.querySelector("svg.animate-spin")?.getAttribute("class")).toMatch(/motion-reduce:animate-none/);
    expect(screen.getByText("(Obrigatório)").className).toMatch(/text-sm/);
  });
});

describe("ConviteAnexosCard: estrutura e etiquetas", () => {
  it("mostra o titulo, a descricao e as tres linhas, cada uma com botao de texto visivel", () => {
    montar();
    expect(screen.getByText("Anexos")).toBeInTheDocument();
    expect(screen.getByText(/obrigatório quando indica um IBAN/)).toBeInTheDocument();
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
  return <ConviteAnexosCard t={t} idioma="pt" estado={estado} tipos={TIPOS_ANEXO_CONVITE} />;
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
    expect(anuncio.closest("[role='status']")).not.toBeNull();
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
