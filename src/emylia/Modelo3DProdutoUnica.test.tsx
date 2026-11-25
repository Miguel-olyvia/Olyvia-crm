// 25/11: a cor e a foto ÚNICAS de um modelo que não lê zonas (revestimento/azulejo: só a cor e a textura únicas). Com configuração e zonas diferentes, a única NÃO fica vazia: valem os nomes,
// como antes; só um «Aplicar: não» a um atributo de cor a tira (da cor e da foto). O Visualizador3D está simulado (jsdom não tem WebGL): mostra o que recebeu.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";

const base = vi.hoisted(() => ({
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => { data: unknown; error: unknown },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (f: string, a: Record<string, unknown>) => base.responder(f, a)),
    storage: { from: (bucket: string) => ({ getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://cdn.teste/${bucket}/${caminho}` } }) }) },
  },
}));
vi.mock("./planta3d/Visualizador3D", () => ({
  default: (p: { descricao: string; revestimento?: { cor: string; textura?: { url: string } } | null }) => (
    <div data-testid="canvas3d" role="img" aria-label={p.descricao} data-textura={p.revestimento?.textura?.url ?? ""} data-cor={p.revestimento?.cor ?? ""} />
  ),
}));

import { Modelo3DProduto } from "./Modelo3DProduto";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33", PID = "11111111-2222-4333-8444-555555555555";
const A_COR = "aaaaaaaa-0000-4000-a000-000000000031", A_PUX = "aaaaaaaa-0000-4000-a000-000000000032";
const opcao = (id: string, hex: string, foto?: string) => ({ id: `${id}-1`, valor: id, nome: id, hex, ...(foto ? { foto } : {}), ordem: 1 });
const DEFS: AtributoDef[] = [
  { id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", temHex: true, temFoto: true, ordem: 1, opcoes: [opcao(A_COR, "#8b5a2b", `${ORG}/nogal.webp`)] },
  { id: A_PUX, codigo: "puxador", nome: "Puxador", tipo: "lista", temHex: true, ordem: 2, opcoes: [opcao(A_PUX, "#111111")] },
];
const ATTRS: AtributoProduto[] = [{ atributoId: A_COR, opcaoId: `${A_COR}-1`, valor: "x" }, { atributoId: A_PUX, opcaoId: `${A_PUX}-1`, valor: "y" }];
const SEM = { proprio: null, subcategoria: null, categoria: null, efectiva: { eixos: null, eixos_origem: "automatico", ligacoes: null, ligacoes_origem: "automatico" } };
type Lig = { atributo: string; zona: string; aplicar: boolean };
const com = (lig: Lig[]) => ({ ...SEM, proprio: { eixos: null, ligacoes: lig, orfas: 0 }, efectiva: { eixos: null, eixos_origem: "automatico", ligacoes: lig, ligacoes_origem: "produto" } });
const FOTO = `https://cdn.teste/catalogo-opcoes/${ORG}/nogal.webp`;

beforeEach(() => { base.responder = (f) => (f === "cat_ler_config_3d" ? { data: SEM, error: null } : { data: null, error: null }); });
afterEach(cleanup);

const abrir = async (lig: Lig[] | null) => {
  if (lig) base.responder = (f) => (f === "cat_ler_config_3d" ? { data: com(lig), error: null } : { data: null, error: null });
  render(<Modelo3DProduto nome="Revestimento PORCELÂNICO NOGAL 19,5x120" sub={null} no={null} arvore={[]} attrs={ATTRS} defs={DEFS} modelo3d="revestimento_chao"
    alvoConfig3d={{ org: ORG, produtoId: PID, podeEditar: true }} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
  return screen.findByTestId("canvas3d");
};

describe("a cor e a textura únicas de um modelo sem zonas (azulejo)", () => {
  it("sem configuração: a textura e a cor da «Cor» (como sempre)", async () => {
    const c = await abrir(null);
    await waitFor(() => expect(c.getAttribute("data-textura")).toBe(FOTO));
    expect(c.getAttribute("data-cor")).toBe("#8b5a2b");
  });
  it("ligação parcial (o Puxador só ao tampo, as zonas diferem): o azulejo MANTÉM a textura e a cor da «Cor»", async () => {
    const c = await abrir([{ atributo: A_PUX, zona: "tampo", aplicar: true }]);
    await waitFor(() => expect(c.getAttribute("data-textura")).toBe(FOTO));
    expect(c.getAttribute("data-cor")).toBe("#8b5a2b");
  });
  it("«Aplicar: não» na «Cor» (Tudo): o azulejo perde a textura e a cor dela", async () => {
    const c = await abrir([{ atributo: A_COR, zona: "tudo", aplicar: false }, { atributo: A_PUX, zona: "tampo", aplicar: true }]);
    await waitFor(() => expect(c.getAttribute("data-textura")).toBe(""));
    expect(c.getAttribute("data-cor")).not.toBe("#8b5a2b");
  });
});
