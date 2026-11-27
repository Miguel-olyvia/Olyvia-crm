// O GLB próprio: o que corre na base (cat_definir_glb) e no storage (bucket catalogo-modelos3d). A base e o storage são simulados (a migration está por aplicar).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { glbDeTeste } from "./planta3d/__fixtures__/glbDeTeste";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => { data: unknown; error: unknown },
  uploads: [] as { bucket: string; caminho: string; tipo: unknown; opcoes: Record<string, unknown> }[],
  remocoes: [] as { bucket: string; caminhos: string[] }[],
  erroUpload: null as string | null,
  lancarUpload: false,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }),
    storage: {
      from: (bucket: string) => ({
        upload: async (caminho: string, ficheiro: Blob, opcoes: Record<string, unknown>) => {
          if (base.lancarUpload) throw new Error("rede em baixo");
          base.uploads.push({ bucket, caminho, tipo: opcoes.contentType, opcoes });
          return base.erroUpload ? { data: null, error: { message: base.erroUpload } } : { data: { path: caminho }, error: null };
        },
        remove: async (caminhos: string[]) => { base.remocoes.push({ bucket, caminhos }); return { data: [], error: null }; },
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.teste/${bucket}/${p}` } }),
      }),
    },
  },
}));

import {
  BUCKET_MODELOS_3D, bytesDeGlbDeLeitura, definirGlbProprio, glbDeLeitura, guardarGlbProprio, removerGlbProprio, urlDoGlbProprio,
} from "./modeloGlbDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const ALVO = "11111111-2222-4333-8444-555555555555";
const ANTIGO = `${ORG}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.glb`;
const NOVO = /^b6ffce4f-f630-4933-833a-008649757a33\/[0-9a-f-]{36}\.glb$/;
const blob = (o?: Parameters<typeof glbDeTeste>[0]) => new Blob([glbDeTeste(o)], { type: "model/gltf-binary" });

beforeEach(() => {
  base.chamadas = []; base.uploads = []; base.remocoes = []; base.erroUpload = null; base.lancarUpload = false;
  base.responder = (_f, a) => ({ data: { alvo: a.p_alvo, id: a.p_id, caminho: a.p_caminho, anterior: ANTIGO, anterior_orfao: true }, error: null });
});

describe("leituras tolerantes", () => {
  it("glbDeLeitura só aceita o formato {org}/{uuid}.glb; o resto é null", () => {
    expect(glbDeLeitura(ANTIGO)).toBe(ANTIGO);
    for (const x of [null, undefined, "", 3, "a/b.glb", `${ORG}/x.glb`, `${ORG}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.webp`]) expect(glbDeLeitura(x), String(x)).toBeNull();
  });
  it("bytesDeGlbDeLeitura: inteiros de 12 B a 5 MB; o resto é null", () => {
    expect(bytesDeGlbDeLeitura(1234)).toBe(1234);
    for (const x of [null, "12", 11, 5242881, 1.5, Number.NaN]) expect(bytesDeGlbDeLeitura(x), String(x)).toBeNull();
    expect(bytesDeGlbDeLeitura(12)).toBe(12);
    expect(bytesDeGlbDeLeitura(5242880)).toBe(5242880);
  });
  it("urlDoGlbProprio devolve o URL público do bucket", () => {
    expect(urlDoGlbProprio(ANTIGO)).toBe(`https://cdn.teste/${BUCKET_MODELOS_3D}/${ANTIGO}`);
    expect(BUCKET_MODELOS_3D).toBe("catalogo-modelos3d");
  });
});

describe("definirGlbProprio: cat_definir_glb", () => {
  it("chama a função com a organização, o alvo, o id e o caminho, e traduz a resposta", async () => {
    const r = await definirGlbProprio(ORG, "categoria", ALVO, `${ORG}/bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee.glb`);
    expect(base.chamadas).toEqual([{ f: "cat_definir_glb", a: { p_org: ORG, p_alvo: "categoria", p_id: ALVO, p_caminho: `${ORG}/bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee.glb` } }]);
    expect(r).toEqual({ ok: true, v: { alvo: "categoria", id: ALVO, caminho: `${ORG}/bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee.glb`, anterior: ANTIGO, anteriorOrfao: true } });
  });
  it("o Modelo tem o alvo 'modelo' (a subcategoria é uma categoria)", async () => {
    await definirGlbProprio(ORG, "modelo", ALVO, null);
    expect(base.chamadas[0]!.a.p_alvo).toBe("modelo");
  });
  it("null e '' removem a ligação: vai null à base", async () => {
    base.responder = () => ({ data: { alvo: "modelo", id: ALVO, caminho: null, anterior: ANTIGO, anterior_orfao: false }, error: null });
    const r = await definirGlbProprio(ORG, "modelo", ALVO, "");
    expect(base.chamadas[0]!.a.p_caminho).toBeNull();
    expect(r).toEqual({ ok: true, v: { alvo: "modelo", id: ALVO, caminho: null, anterior: ANTIGO, anteriorOrfao: false } });
  });
  it("um caminho que não é {org}/{uuid}.glb nem chega à base", async () => {
    const r = await definirGlbProprio(ORG, "modelo", ALVO, "../outra/coisa.glb");
    expect(r.ok).toBe(false);
    expect(base.chamadas).toHaveLength(0);
  });
  it("as recusas da base (CT001, CT002, CT006, CT007) mostram-se tal e qual, em português", async () => {
    for (const [codigo, msg] of [["CT001", "Sem permissão."], ["CT002", "Ficheiro de outra organização."], ["CT006", "O ficheiro não está no armazenamento: envie-o de novo."], ["CT007", "O ficheiro tem de ser um GLB."]]) {
      base.responder = () => ({ data: null, error: { code: codigo, message: msg } });
      expect(await definirGlbProprio(ORG, "modelo", ALVO, ANTIGO)).toEqual({ ok: false, erro: msg, codigo });
    }
  });
  it("a função ainda não existir na base dá uma frase sua, e um erro estranho uma frase de reserva (nunca inglês em bruto)", async () => {
    base.responder = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_definir_glb" } });
    const a = await definirGlbProprio(ORG, "modelo", ALVO, ANTIGO);
    expect(a.ok === false && a.erro).toMatch(/ainda não está disponível/);
    base.responder = () => ({ data: null, error: { code: "XX000", message: "boom internal" } });
    const b = await definirGlbProprio(ORG, "modelo", ALVO, ANTIGO);
    expect(b.ok === false && b.erro).toBe("Não foi possível guardar o modelo 3D próprio.");
  });
});

describe("guardarGlbProprio: ficheiro novo, ligar, e só depois apagar o antigo", () => {
  it("valida, envia com o tipo certo e sem upsert, liga e apaga o antigo se ficou órfão", async () => {
    const r = await guardarGlbProprio(ORG, "modelo", ALVO, blob());
    expect(r.ok).toBe(true);
    expect(base.uploads).toHaveLength(1);
    const u = base.uploads[0]!;
    expect(u.bucket).toBe("catalogo-modelos3d");
    expect(u.caminho).toMatch(NOVO);
    expect(u.tipo).toBe("model/gltf-binary");
    expect(u.opcoes.upsert).toBe(false);
    expect(base.chamadas).toEqual([{ f: "cat_definir_glb", a: { p_org: ORG, p_alvo: "modelo", p_id: ALVO, p_caminho: u.caminho } }]);
    expect(base.remocoes).toEqual([{ bucket: "catalogo-modelos3d", caminhos: [ANTIGO] }]);
    if (r.ok) { expect(r.v.caminho).toBe(u.caminho); expect(r.v.avisos).toEqual([]); expect(r.v.triangulos).toBe(12); }
  });

  it("o antigo NÃO se apaga se ainda o usa outra categoria ou Modelo (anterior_orfao falso)", async () => {
    base.responder = (_f, a) => ({ data: { alvo: a.p_alvo, id: a.p_id, caminho: a.p_caminho, anterior: ANTIGO, anterior_orfao: false }, error: null });
    await guardarGlbProprio(ORG, "categoria", ALVO, blob());
    expect(base.remocoes).toEqual([]);
  });

  it("sem ficheiro anterior não há nada a apagar", async () => {
    base.responder = (_f, a) => ({ data: { alvo: a.p_alvo, id: a.p_id, caminho: a.p_caminho, anterior: null, anterior_orfao: false }, error: null });
    await guardarGlbProprio(ORG, "categoria", ALVO, blob());
    expect(base.remocoes).toEqual([]);
  });

  it("se a base recusar, apaga-se o ficheiro novo (e só ele) e a mensagem é a da base", async () => {
    base.responder = () => ({ data: null, error: { code: "CT007", message: "Tamanho fora do limite." } });
    const r = await guardarGlbProprio(ORG, "modelo", ALVO, blob());
    expect(r).toEqual({ ok: false, erro: "Tamanho fora do limite.", codigo: "CT007" });
    expect(base.remocoes).toEqual([{ bucket: "catalogo-modelos3d", caminhos: [base.uploads[0]!.caminho] }]);
  });

  it("se o envio falhar (rede, permissão, tamanho), diz-se em português e nem se chama a base", async () => {
    base.erroUpload = "new row violates row-level security policy";
    const sem = await guardarGlbProprio(ORG, "modelo", ALVO, blob());
    expect(sem.ok === false && sem.erro).toMatch(/permissão/);
    base.erroUpload = "The object exceeded the maximum allowed size";
    const grande = await guardarGlbProprio(ORG, "modelo", ALVO, blob());
    expect(grande.ok === false && grande.erro).toMatch(/5 MB/);
    base.erroUpload = "Bucket not found";
    const bucket = await guardarGlbProprio(ORG, "modelo", ALVO, blob());
    expect(bucket.ok === false && bucket.erro).toMatch(/ainda não está disponível/);
    base.erroUpload = null; base.lancarUpload = true;
    const rede = await guardarGlbProprio(ORG, "modelo", ALVO, blob());
    expect(rede.ok === false && rede.erro).toMatch(/enviar/);
    expect(base.chamadas).toHaveLength(0);
    expect(base.remocoes).toEqual([]);
  });

  it("um GLB inválido nem sobe ao storage: a recusa diz porquê", async () => {
    for (const [o, txt] of [[{ versao: 1 }, /versão 1/], [{ draco: true }, /Draco/], [{ uriExterno: true }, /externo/], [{ triangulos: 200_002 }, /200 000/]] as const) {
      const r = await guardarGlbProprio(ORG, "modelo", ALVO, blob(o));
      expect(r.ok === false && r.erro).toMatch(txt);
    }
    expect(base.uploads).toHaveLength(0);
    expect(base.chamadas).toHaveLength(0);
  });

  it("um GLB com aviso (50 000 triângulos) sobe e devolve o aviso para o ecrã mostrar", async () => {
    const r = await guardarGlbProprio(ORG, "modelo", ALVO, blob({ triangulos: 50_000 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.v.avisos.join(" ")).toMatch(/50 000/);
  });

  it("depois de ligar, a leitura da organização invalida-se: o 3D lê de novo (e antes disso lê uma vez só)", async () => {
    const { invalidarGlbsDoCatalogo, lerGlbsDoCatalogo } = await import("./glbCatalogoCache");
    invalidarGlbsDoCatalogo(ORG);
    const antes = base.responder;
    base.responder = (f, a) => (f === "cat_definir_glb" ? antes(f, a) : { data: f === "cat_ler_categorias_gestao" ? { categorias: [] } : { modelos: [] }, error: null });
    const lidas = () => base.chamadas.filter((c) => c.f.startsWith("cat_ler_")).length;
    await lerGlbsDoCatalogo(ORG);
    await lerGlbsDoCatalogo(ORG);
    expect(lidas()).toBe(2); // as duas leituras, uma vez
    await guardarGlbProprio(ORG, "modelo", ALVO, blob());
    await lerGlbsDoCatalogo(ORG);
    expect(lidas()).toBe(4);
  });
});

describe("removerGlbProprio", () => {
  it("manda null, e apaga o ficheiro que ficou sem uso", async () => {
    base.responder = (_f, a) => ({ data: { alvo: a.p_alvo, id: a.p_id, caminho: null, anterior: ANTIGO, anterior_orfao: true }, error: null });
    const r = await removerGlbProprio(ORG, "categoria", ALVO);
    expect(base.chamadas[0]!.a).toEqual({ p_org: ORG, p_alvo: "categoria", p_id: ALVO, p_caminho: null });
    expect(base.remocoes).toEqual([{ bucket: "catalogo-modelos3d", caminhos: [ANTIGO] }]);
    expect(r.ok).toBe(true);
  });
  it("se o ficheiro ainda é usado por outro nível, fica no storage", async () => {
    base.responder = (_f, a) => ({ data: { alvo: a.p_alvo, id: a.p_id, caminho: null, anterior: ANTIGO, anterior_orfao: false }, error: null });
    await removerGlbProprio(ORG, "modelo", ALVO);
    expect(base.remocoes).toEqual([]);
  });
  it("a recusa da base não apaga nada", async () => {
    base.responder = () => ({ data: null, error: { code: "CT001", message: "Sem permissão." } });
    const r = await removerGlbProprio(ORG, "modelo", ALVO);
    expect(r).toEqual({ ok: false, erro: "Sem permissão.", codigo: "CT001" });
    expect(base.remocoes).toEqual([]);
  });
});
