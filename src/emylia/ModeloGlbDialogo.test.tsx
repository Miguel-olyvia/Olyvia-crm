// 27/11: o diálogo do GLB PRÓPRIO (ModeloGlbDialogo.tsx), igual para uma categoria, uma subcategoria e um Modelo: escolher o ficheiro (botão ou arrastar), validar logo, ver em 3D só se
// se pedir, e carregar, substituir ou remover com uma confirmação que diz quantos produtos mudam. A gravação (modeloGlbDados.ts) e a validação (glbValidar.ts) estão simuladas: aqui
// confere-se o que o ecrã mostra, o que liga a quê e o que chama. O 3D também (o jsdom não tem WebGL).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const dados = vi.hoisted(() => ({
  guardar: vi.fn(),
  remover: vi.fn(),
  analisar: vi.fn(),
  semear: vi.fn(),
  soltar: vi.fn(),
}));
vi.mock("./modeloGlbDados", async (original) => ({
  ...(await original<typeof import("./modeloGlbDados")>()),
  guardarGlbProprio: dados.guardar,
  removerGlbProprio: dados.remover,
  urlDoGlbProprio: (c: string | null) => (c ? `https://cdn.teste/${c}` : null),
}));
vi.mock("./planta3d/glbValidar", async (original) => ({ ...(await original<typeof import("./planta3d/glbValidar")>()), analisarGlb: dados.analisar }));
vi.mock("./planta3d/modelosHtml/glb", () => ({ semearGlb: dados.semear, soltarGlb: dados.soltar }));
vi.mock("./Previa3DProduto", () => ({
  Previa3DProduto: (p: { nome: string; glbProprio?: string | null }) => <div data-testid="previa3d" data-nome={p.nome} data-glb={p.glbProprio ?? ""} />,
}));

import { ModeloGlbDialogo, type ModeloGlbDialogoProps } from "./ModeloGlbDialogo";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const ID = "c0000000-0000-4000-a000-000000000001";
const CAMINHO = `${ORG}/aaaaaaaa-bbbb-4ccc-8ddd-000000000001.glb`;
const relatorio = (extra: Record<string, unknown> = {}) => ({ ok: true, erros: [], avisos: [], triangulos: 12_345, malhas: 2, materiais: ["corpo", "metal"], bytes: 1_258_291, abriu: true, ...extra });
const ficheiro = (nome = "armario.glb", bytes = 2048) => new File([new Uint8Array(bytes)], nome, { type: "model/gltf-binary" });

let aoTerminar: Mock<(mensagem: string | null) => Promise<void> | void>, aoFechar: Mock<() => void>;
beforeEach(() => {
  aoTerminar = vi.fn(async (_mensagem: string | null) => undefined);
  aoFechar = vi.fn();
  dados.guardar.mockReset(); dados.remover.mockReset(); dados.analisar.mockReset(); dados.semear.mockReset(); dados.soltar.mockReset();
  dados.analisar.mockResolvedValue(relatorio());
  dados.guardar.mockResolvedValue({ ok: true, v: { alvo: "categoria", id: ID, caminho: CAMINHO, anterior: null, anteriorOrfao: false, avisos: [], bytes: 1_258_291, triangulos: 12_345 } });
  dados.remover.mockResolvedValue({ ok: true, v: { alvo: "categoria", id: ID, caminho: null, anterior: CAMINHO, anteriorOrfao: true } });
});
afterEach(cleanup);

const montar = (p: Partial<ModeloGlbDialogoProps> = {}) => render(
  <ModeloGlbDialogo org={ORG} nivel="categoria" id={ID} nome="Casa de banho" atual={{ caminho: null, bytes: null }} usados={3} aoTerminar={aoTerminar} aoFechar={aoFechar} {...p} />,
);
const campo = () => screen.getByLabelText("Ficheiro GLB") as HTMLInputElement;
const escolher = async (f: File = ficheiro()) => { fireEvent.change(campo(), { target: { files: [f] } }); await waitFor(() => expect(dados.analisar).toHaveBeenCalled()); };
const razao = (b: HTMLElement) => (b.getAttribute("aria-describedby") ?? "").split(" ").map((i) => document.getElementById(i)?.textContent ?? "").join(" ").trim();
const botao = (nome: string | RegExp) => screen.getByRole("button", { name: nome });
const descritoPor = (el: HTMLElement) => (el.getAttribute("aria-describedby") ?? "").split(" ").map((i) => document.getElementById(i)?.textContent ?? "").join(" ");

describe("ModeloGlbDialogo: a estrutura", () => {
  it("é um diálogo com título e descrição, o foco entra no campo do ficheiro e o campo tem rótulo visível e só aceita .glb", () => {
    montar();
    const d = screen.getByRole("dialog", { name: "Modelo 3D próprio" });
    expect(d).toHaveAccessibleDescription(/Casa de banho/);
    expect(d).toHaveAccessibleDescription(/as medidas, a cor e a textura vêm sempre do produto/);
    expect(campo()).toHaveAttribute("type", "file");
    expect(campo().getAttribute("accept")).toMatch(/\.glb/);
    expect(screen.getByText("Ficheiro GLB", { selector: "label" })).toBeVisible();
    expect(d).toContainElement(document.activeElement as HTMLElement);
    expect(document.activeElement).toBe(campo());
  });

  it("a ajuda do campo diz o formato, o limite e a orientação (Y para cima, frente a +Z), e está ligada ao campo", () => {
    montar();
    const ajuda = descritoPor(campo());
    expect(ajuda).toMatch(/\.glb/);
    expect(ajuda).toMatch(/5 MB/);
    expect(ajuda).toMatch(/Y para cima/);
    expect(ajuda).toMatch(/\+Z/);
  });

  it("sem ficheiro escolhido, Carregar está bloqueado (aria-disabled, com a razão) e não faz nada ao clicar", () => {
    montar();
    const b = botao("Carregar");
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(razao(b)).toMatch(/Escolha um ficheiro/);
    fireEvent.click(b);
    expect(screen.queryByRole("group", { name: /Carregar este modelo/ })).toBeNull();
    expect(dados.guardar).not.toHaveBeenCalled();
  });

  it("mostra o que está guardado («GLB · 1,2 MB») e passa a chamar-se Substituir; Remover só existe com um GLB", () => {
    const { unmount } = montar();
    expect(screen.queryByRole("button", { name: /Remover/ })).toBeNull();
    expect(screen.queryByText(/Modelo atual/)).toBeNull();
    unmount();
    montar({ atual: { caminho: CAMINHO, bytes: 1_258_291 } });
    expect(botao("Substituir")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Carregar" })).toBeNull();
    expect(screen.getByRole("dialog")).toHaveTextContent("Modelo atual: GLB · 1,2 MB");
    expect(botao(/Remover/)).toBeInTheDocument();
  });
});

describe("ModeloGlbDialogo: validar o ficheiro logo ao escolher", () => {
  it("um ficheiro que não é .glb é recusado na hora, sem o ler, com o erro ligado ao campo", async () => {
    montar();
    fireEvent.change(campo(), { target: { files: [ficheiro("armario.gltf")] } });
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/tem de ser um ficheiro \.glb/i);
    expect(descritoPor(campo())).toMatch(/tem de ser um ficheiro \.glb/i);
    expect(campo()).toHaveAttribute("aria-invalid", "true");
    expect(dados.analisar).not.toHaveBeenCalled();
    expect(botao("Carregar")).toHaveAttribute("aria-disabled", "true");
  });

  it("acima de 5 MB é recusado sem o ler, com o tamanho dito", async () => {
    montar();
    fireEvent.change(campo(), { target: { files: [ficheiro("grande.glb", 6 * 1024 * 1024)] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/6 MB: o limite é 5 MB/);
    expect(dados.analisar).not.toHaveBeenCalled();
  });

  it("enquanto valida há uma região de estado, e a seguir diz que o ficheiro é válido com os números", async () => {
    let resolver: (v: unknown) => void = () => undefined;
    dados.analisar.mockReturnValue(new Promise((r) => { resolver = r; }));
    montar();
    fireEvent.change(campo(), { target: { files: [ficheiro()] } });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("A validar o ficheiro…"));
    expect(botao("Carregar")).toHaveAttribute("aria-disabled", "true");
    await act(async () => { resolver(relatorio()); });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Ficheiro válido: 12 345 triângulos, 1,2 MB/));
    expect(botao("Carregar")).not.toHaveAttribute("aria-disabled");
  });

  it("os erros da validação (Draco, externo…) aparecem todos, num alerta ligado ao campo, e o botão fica bloqueado", async () => {
    dados.analisar.mockResolvedValue(relatorio({ ok: false, abriu: false, erros: ["O modelo usa compressão Draco, que não é suportada.", "O GLB depende de um ficheiro externo (buffer 0)."] }));
    montar();
    await escolher();
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("compressão Draco");
    expect(alerta).toHaveTextContent("ficheiro externo");
    expect(descritoPor(campo())).toMatch(/Draco/);
    expect(campo()).toHaveAttribute("aria-invalid", "true");
    expect(botao("Carregar")).toHaveAttribute("aria-disabled", "true");
  });

  it("os avisos (muitos triângulos) não impedem: ficam numa lista ligada ao campo e Carregar fica livre", async () => {
    dados.analisar.mockResolvedValue(relatorio({ avisos: ["O modelo tem 60 000 triângulos (a partir de 50 000 pode ficar pesado no telemóvel)."], triangulos: 60_000 }));
    montar();
    await escolher();
    const aviso = await screen.findByText(/60 000 triângulos \(a partir de/);
    expect(aviso.closest("[role=alert]")).toBeNull();
    expect(descritoPor(campo())).toMatch(/pode ficar pesado/);
    expect(campo()).not.toHaveAttribute("aria-invalid", "true");
    expect(botao("Carregar")).not.toHaveAttribute("aria-disabled");
  });

  it("arrastar e largar o ficheiro valida-o como escolhê-lo, e o destino realça-se ao arrastar por cima", async () => {
    montar();
    const zona = screen.getByTestId("zona-glb");
    fireEvent.dragOver(zona, { dataTransfer: { files: [], types: ["Files"] } });
    expect(zona).toHaveAttribute("data-a-arrastar", "true");
    fireEvent.drop(zona, { dataTransfer: { files: [ficheiro("largado.glb")], types: ["Files"] } });
    await waitFor(() => expect(dados.analisar).toHaveBeenCalled());
    expect(zona).toHaveAttribute("data-a-arrastar", "false");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Ficheiro válido/));
    expect(screen.getByText(/largado\.glb/)).toBeInTheDocument();
  });

  it("escolher um segundo ficheiro vale mais do que a validação lenta do primeiro", async () => {
    const resolvers: ((v: unknown) => void)[] = [];
    dados.analisar.mockImplementation(() => new Promise((r) => { resolvers.push(r); }));
    montar();
    fireEvent.change(campo(), { target: { files: [ficheiro("a.glb")] } });
    await waitFor(() => expect(resolvers).toHaveLength(1));
    fireEvent.change(campo(), { target: { files: [ficheiro("b.glb")] } });
    await waitFor(() => expect(resolvers).toHaveLength(2));
    await act(async () => { resolvers[1](relatorio({ triangulos: 222 })); });
    await act(async () => { resolvers[0](relatorio({ triangulos: 111 })); });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/222 triângulos/));
    expect(screen.getByRole("status")).not.toHaveTextContent(/111/);
  });
});

describe("ModeloGlbDialogo: carregar com confirmação", () => {
  it("Carregar pede a confirmação, que diz quantos produtos usam o nível; só grava ao confirmar, e o foco vai para a confirmação", async () => {
    montar();
    const f = ficheiro();
    await escolher(f);
    await waitFor(() => expect(botao("Carregar")).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(botao("Carregar"));
    const conf = await screen.findByRole("group", { name: /Carregar este modelo 3D em «Casa de banho»/ });
    expect(conf).toHaveTextContent("3 produtos");
    expect(document.activeElement).toBe(conf);
    expect(dados.guardar).not.toHaveBeenCalled();
    fireEvent.click(within(conf).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(dados.guardar).toHaveBeenCalledTimes(1));
    expect(dados.guardar).toHaveBeenCalledWith(ORG, "categoria", ID, f);
  });

  it("enquanto grava, uma região de estado diz «A carregar…» e os botões ficam bloqueados; ao acabar, anuncia, relê e fecha", async () => {
    let acabar: (v: unknown) => void = () => undefined;
    dados.guardar.mockReturnValue(new Promise((r) => { acabar = r; }));
    montar();
    await escolher();
    await waitFor(() => expect(botao("Carregar")).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(botao("Carregar"));
    fireEvent.click(within(await screen.findByRole("group", { name: /Carregar este modelo/ })).getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText("A carregar o modelo 3D…")).toBeInTheDocument();
    expect(screen.getByText("A carregar o modelo 3D…").closest("[role=status]")).not.toBeNull();
    expect(aoFechar).not.toHaveBeenCalled();
    await act(async () => { acabar({ ok: true, v: { alvo: "categoria", id: ID, caminho: CAMINHO, anterior: null, anteriorOrfao: false, avisos: [], bytes: 1_258_291, triangulos: 12_345 } }); });
    await waitFor(() => expect(aoTerminar).toHaveBeenCalledTimes(1));
    expect(aoTerminar.mock.calls[0][0]).toBe("Modelo 3D próprio de «Casa de banho» carregado (1,2 MB).");
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
  });

  it("só fecha depois de a página reler: o diálogo espera pelo que aoTerminar devolve", async () => {
    let reler: () => void = () => undefined;
    aoTerminar.mockReturnValue(new Promise<void>((r) => { reler = r; }));
    montar();
    await escolher();
    await waitFor(() => expect(botao("Carregar")).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(botao("Carregar"));
    fireEvent.click(within(await screen.findByRole("group", { name: /Carregar este modelo/ })).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(aoTerminar).toHaveBeenCalled());
    expect(aoFechar).not.toHaveBeenCalled();
    await act(async () => { reler(); });
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
  });

  it("Substituir diz «substituído» na mensagem", async () => {
    montar({ atual: { caminho: CAMINHO, bytes: 1_000_000 } });
    await escolher();
    await waitFor(() => expect(botao("Substituir")).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(botao("Substituir"));
    const conf = await screen.findByRole("group", { name: /Substituir o modelo 3D próprio de «Casa de banho»/ });
    fireEvent.click(within(conf).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(aoTerminar).toHaveBeenCalled());
    expect(aoTerminar.mock.calls[0][0]).toBe("Modelo 3D próprio de «Casa de banho» substituído (1,2 MB).");
  });

  it("Voltar na confirmação regressa ao formulário, com o ficheiro ainda escolhido, e não grava", async () => {
    montar();
    await escolher();
    await waitFor(() => expect(botao("Carregar")).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(botao("Carregar"));
    const conf = await screen.findByRole("group", { name: /Carregar este modelo/ });
    fireEvent.click(within(conf).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("group", { name: /Carregar este modelo/ })).toBeNull();
    expect(botao("Carregar")).not.toHaveAttribute("aria-disabled");
    expect(dados.guardar).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(botao("Carregar")));
  });

  it("sem saber quantos produtos usam o nível, a confirmação não inventa um número", async () => {
    montar({ usados: null });
    await escolher();
    await waitFor(() => expect(botao("Carregar")).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(botao("Carregar"));
    const conf = await screen.findByRole("group", { name: /Carregar este modelo/ });
    expect(conf).toHaveTextContent(/pode estar a ser usada por produtos/);
    expect(conf.textContent).not.toMatch(/\d+ produto/);
  });

  it("uma falha da base (ex.: CT001) fica no diálogo, em português, num alerta; o diálogo não fecha e a página relê sem anunciar", async () => {
    dados.guardar.mockResolvedValue({ ok: false, erro: "Não tem permissão para alterar os produtos.", codigo: "CT001" });
    montar();
    await escolher();
    await waitFor(() => expect(botao("Carregar")).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(botao("Carregar"));
    fireEvent.click(within(await screen.findByRole("group", { name: /Carregar este modelo/ })).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(aoTerminar).toHaveBeenCalledWith(null));
    expect(screen.getAllByRole("alert").map((a) => a.textContent).join(" ")).toContain("Não tem permissão para alterar os produtos.");
    expect(aoFechar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it.each([
    ["categoria", "categoria"],
    ["subcategoria", "categoria"],
    ["modelo", "modelo"],
  ] as const)("o nível «%s» grava com o alvo «%s» da base", async (nivel, alvo) => {
    montar({ nivel });
    await escolher();
    await waitFor(() => expect(botao("Carregar")).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(botao("Carregar"));
    fireEvent.click(within(await screen.findByRole("group", { name: /Carregar este modelo/ })).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(dados.guardar).toHaveBeenCalled());
    expect(dados.guardar.mock.calls[0].slice(0, 3)).toEqual([ORG, alvo, ID]);
  });
});

describe("ModeloGlbDialogo: remover com confirmação", () => {
  it("Remover pede a confirmação (diz o que acontece ao 3D e quantos produtos) e só remove ao confirmar", async () => {
    montar({ atual: { caminho: CAMINHO, bytes: 1_258_291 }, nivel: "modelo", nome: "SORTY", usados: 1 });
    fireEvent.click(botao(/Remover/));
    const conf = await screen.findByRole("group", { name: /Remover o modelo 3D próprio de «SORTY»/ });
    expect(conf).toHaveTextContent("1 produto");
    expect(conf).toHaveTextContent(/volta ao modelo escolhido/);
    expect(dados.remover).not.toHaveBeenCalled();
    fireEvent.click(within(conf).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(dados.remover).toHaveBeenCalledWith(ORG, "modelo", ID));
    await waitFor(() => expect(aoTerminar).toHaveBeenCalledWith("Modelo 3D próprio de «SORTY» removido: o 3D volta ao modelo escolhido ou ao automático."));
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
  });

  it("uma falha ao remover fica no diálogo, em alerta", async () => {
    dados.remover.mockResolvedValue({ ok: false, erro: "Não foi possível guardar o modelo 3D próprio." });
    montar({ atual: { caminho: CAMINHO, bytes: 1_258_291 } });
    fireEvent.click(botao(/Remover/));
    fireEvent.click(within(await screen.findByRole("group", { name: /Remover o modelo 3D próprio/ })).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(aoTerminar).toHaveBeenCalledWith(null));
    expect(screen.getAllByRole("alert").map((a) => a.textContent).join(" ")).toContain("Não foi possível guardar o modelo 3D próprio.");
    expect(aoFechar).not.toHaveBeenCalled();
  });
});

describe("ModeloGlbDialogo: o 3D só abre se se pedir", () => {
  it("não monta o 3D antes de «Ver em 3D»; o texto alternativo diz os triângulos, os MB e os materiais do ficheiro escolhido", async () => {
    montar();
    await escolher();
    const ver = await screen.findByRole("button", { name: "Ver em 3D" });
    expect(ver).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("previa3d")).toBeNull();
    expect(dados.semear).not.toHaveBeenCalled();
    fireEvent.click(ver);
    const previa = await screen.findByTestId("previa3d");
    expect(ver).toHaveAttribute("aria-expanded", "true");
    // o ficheiro escolhido lê-se da memória (semeado na cache dos GLB por uma chave própria), nunca por um endereço blob: (a CSP da aplicação bloqueia-o)
    expect(previa.getAttribute("data-glb")).toMatch(/^glb-local:/);
    expect(previa.getAttribute("data-glb")).not.toMatch(/^blob:/);
    expect(dados.semear).toHaveBeenCalledTimes(1);
    expect(dados.semear.mock.calls[0][0]).toBe(previa.getAttribute("data-glb"));
    expect((dados.semear.mock.calls[0][1] as ArrayBuffer).byteLength).toBe(2048);
    expect(previa).toHaveAttribute("data-nome", "Casa de banho");
    const regiao = screen.getByRole("region", { name: "Pré-visualização do modelo 3D" });
    expect(regiao).toHaveAccessibleDescription("Pré-visualização do modelo 3D próprio de «Casa de banho»: 12 345 triângulos, 1,2 MB, materiais: corpo, metal.");
  });

  it("sem ficheiro escolhido, pré-visualiza o GLB que já está guardado (pelo URL público) e diz só o tamanho", async () => {
    montar({ atual: { caminho: CAMINHO, bytes: 1_258_291 } });
    fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
    expect(await screen.findByTestId("previa3d")).toHaveAttribute("data-glb", `https://cdn.teste/${CAMINHO}`);
    expect(screen.getByRole("region", { name: "Pré-visualização do modelo 3D" })).toHaveAccessibleDescription("Pré-visualização do modelo 3D próprio de «Casa de banho»: 1,2 MB.");
  });

  it("sem ficheiro escolhido nem guardado não há nada para ver: o botão não aparece", () => {
    montar();
    expect(screen.queryByRole("button", { name: "Ver em 3D" })).toBeNull();
  });

  it("o ficheiro semeado liberta-se da cache ao fechar a pré-visualização, e um GLB já guardado não se semeia", async () => {
    const { unmount } = montar();
    await escolher();
    fireEvent.click(await screen.findByRole("button", { name: "Ver em 3D" }));
    const chave = (await screen.findByTestId("previa3d")).getAttribute("data-glb");
    expect(dados.soltar).not.toHaveBeenCalled();
    unmount();
    expect(dados.soltar).toHaveBeenCalledWith(chave);
    cleanup();
    dados.semear.mockReset();
    montar({ atual: { caminho: CAMINHO, bytes: 1_258_291 } });
    fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
    await screen.findByTestId("previa3d");
    expect(dados.semear).not.toHaveBeenCalled();
  });
});

describe("ModeloGlbDialogo: teclado e fecho", () => {
  it("Esc fecha o diálogo", () => {
    montar();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("o botão Fechar (e o X) fecham o diálogo", () => {
    montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Fechar" })[0]);
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("Esc na confirmação só volta atrás: o diálogo fica", async () => {
    montar({ atual: { caminho: CAMINHO, bytes: 1_258_291 } });
    fireEvent.click(botao(/Remover/));
    const conf = await screen.findByRole("group", { name: /Remover o modelo 3D próprio/ });
    fireEvent.keyDown(conf, { key: "Escape" });
    expect(screen.queryByRole("group", { name: /Remover o modelo 3D próprio/ })).toBeNull();
    expect(aoFechar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("durante a gravação, Esc não fecha", async () => {
    dados.remover.mockReturnValue(new Promise(() => undefined));
    montar({ atual: { caminho: CAMINHO, bytes: 1_258_291 } });
    fireEvent.click(botao(/Remover/));
    fireEvent.click(within(await screen.findByRole("group", { name: /Remover o modelo 3D próprio/ })).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(dados.remover).toHaveBeenCalled());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(aoFechar).not.toHaveBeenCalled();
  });
});
