/**
 * @vitest-environment node
 *
 * A volta de limpeza dos ficheiros de convites, com um cliente falso.
 */
import { describe, expect, it } from "vitest";
import {
  BUCKET_FINAL,
  BUCKET_QUARENTENA,
  TAMANHO_DO_LOTE,
  limparAnexosExpirados,
  mensagemDeAlarme,
  respostaDaVolta,
  type ClienteLimpeza,
  type EstadoLimpeza,
} from "./limpeza.ts";

type Linha = Record<string, unknown>;

/** Linha apagada com o objecto por remover (a forma mais comum). */
function linha(n: number, bucket: string | null = BUCKET_FINAL): Linha {
  return {
    anexo_id: `id-${n}`,
    bucket,
    caminho: bucket === null ? null : `org/pessoa/admissao/${n}.pdf`,
    caminho_quarentena: null,
    caminhos_finais: null,
    tentativas: 1,
  };
}

const ESTADO_LIMPO: EstadoLimpeza = {
  por_remover: 0,
  por_remover_antigos: 0,
  quarentena_por_remover: 0,
  promocoes_pendentes: 0,
  max_tentativas: 0,
  job_agendado: true,
};

function criar(opcoes: {
  linhas?: unknown;
  erroLimpar?: boolean;
  falharBucket?: string;
  falharCaminho?: string;
  falharMarcar?: boolean;
  estado?: unknown;
  erroEstado?: boolean;
}) {
  const remocoes: Array<{ bucket: string; caminhos: string[] }> = [];
  const marcacoes: string[][] = [];
  const chamadas: Array<{ nome: string; args?: Record<string, unknown> }> = [];
  const svc: ClienteLimpeza = {
    rpc: async (nome, args) => {
      chamadas.push({ nome, args });
      if (nome === "hr_convite_anexos_limpar") {
        if (opcoes.erroLimpar) return { data: null, error: { message: "permission denied", code: "42501" } };
        return { data: opcoes.linhas ?? [], error: null };
      }
      if (nome === "hr_convite_anexos_objecto_removido") {
        marcacoes.push((args as { p_ids: string[] }).p_ids);
        return opcoes.falharMarcar ? { data: null, error: { message: "boom" } } : { data: 1, error: null };
      }
      if (nome === "hr_convite_anexos_limpeza_estado") {
        if (opcoes.erroEstado) return { data: null, error: { message: "boom" } };
        return { data: "estado" in opcoes ? opcoes.estado : ESTADO_LIMPO, error: null };
      }
      throw new Error(`rpc inesperada ${nome}`);
    },
    storage: {
      from: (bucket) => ({
        remove: async (caminhos) => {
          remocoes.push({ bucket, caminhos });
          const falha =
            opcoes.falharBucket === bucket || (opcoes.falharCaminho !== undefined && caminhos.includes(opcoes.falharCaminho));
          return falha ? { data: null, error: { message: "boom" } } : { data: [], error: null };
        },
      }),
    },
  };
  return { svc, remocoes, marcacoes, chamadas };
}

describe("limparAnexosExpirados", () => {
  it("pede as linhas com a tolerancia e o limite explicitos", async () => {
    const c = criar({ linhas: [] });
    await limparAnexosExpirados(c.svc);
    expect(c.chamadas[0]).toEqual({ nome: "hr_convite_anexos_limpar", args: { p_dias_tolerancia: 7, p_limite: 200 } });
  });

  it("sem nada a limpar nao toca no Storage e o estado limpo nao alarma", async () => {
    const c = criar({ linhas: [] });
    expect(await limparAnexosExpirados(c.svc)).toEqual({ apagados: 0, falhados: 0, estado: ESTADO_LIMPO, alarmes: [] });
    expect(c.remocoes).toHaveLength(0);
    expect(c.marcacoes).toHaveLength(0);
  });

  it("resposta da base que nao e uma lista e tratada como vazia", async () => {
    const c = criar({ linhas: { erro: "x" } });
    expect(await limparAnexosExpirados(c.svc)).toMatchObject({ apagados: 0, falhados: 0, alarmes: [] });
  });

  it("agrupa por bucket, remove e marca so os removidos", async () => {
    const c = criar({ linhas: [linha(1), linha(2, BUCKET_QUARENTENA), linha(3)] });
    const r = await limparAnexosExpirados(c.svc);

    expect(r).toMatchObject({ apagados: 3, falhados: 0, alarmes: [] });
    expect(c.remocoes).toEqual([
      { bucket: BUCKET_FINAL, caminhos: ["org/pessoa/admissao/1.pdf", "org/pessoa/admissao/3.pdf"] },
      { bucket: BUCKET_QUARENTENA, caminhos: ["org/pessoa/admissao/2.pdf"] },
    ]);
    expect(c.marcacoes.flat().sort()).toEqual(["id-1", "id-2", "id-3"]);
  });

  it("remove em lotes de 100", async () => {
    const muitas = Array.from({ length: 250 }, (_, i) => linha(i));
    const c = criar({ linhas: muitas });
    const r = await limparAnexosExpirados(c.svc);
    expect(r).toMatchObject({ apagados: 250, falhados: 0 });
    expect(c.remocoes.map((x) => x.caminhos.length)).toEqual([TAMANHO_DO_LOTE, TAMANHO_DO_LOTE, 50]);
    expect(c.marcacoes.map((x) => x.length)).toEqual([TAMANHO_DO_LOTE, TAMANHO_DO_LOTE, 50]);
  });

  it("um bucket que falha conta como falhado, NAO e marcado e levanta alarme; o outro segue", async () => {
    const erros: unknown[] = [];
    const c = criar({ linhas: [linha(1), linha(2, BUCKET_QUARENTENA)], falharBucket: BUCKET_FINAL });
    const r = await limparAnexosExpirados(c.svc, (e) => erros.push(e));
    expect(r).toMatchObject({ apagados: 1, falhados: 1, alarmes: ["remocoes_falhadas"] });
    expect(c.marcacoes.flat()).toEqual(["id-2"]);
    expect(erros.length).toBeGreaterThan(0);
  });

  it("se marcar falha, os objectos contam como falhados e alarmam (voltam na proxima volta)", async () => {
    const c = criar({ linhas: [linha(1), linha(2)], falharMarcar: true });
    expect(await limparAnexosExpirados(c.svc)).toMatchObject({
      apagados: 0,
      falhados: 2,
      alarmes: ["remocoes_falhadas"],
    });
  });

  it("nunca toca num bucket que nao e dos anexos: conta como falhado, regista e alarma", async () => {
    const erros: unknown[] = [];
    const c = criar({ linhas: [linha(1, "documents"), linha(2)] });
    const r = await limparAnexosExpirados(c.svc, (e) => erros.push(e));
    expect(r).toMatchObject({ apagados: 1, falhados: 1, alarmes: ["remocoes_falhadas"] });
    expect(c.remocoes.every((x) => x.bucket === BUCKET_FINAL)).toBe(true);
    expect(c.marcacoes.flat()).toEqual(["id-2"]);
    expect(erros).toHaveLength(1);
  });

  it("linhas mal formadas contam, sao registadas e alarmam (nao desaparecem em silencio)", async () => {
    const erros: unknown[] = [];
    const c = criar({
      linhas: [null, "x", { anexo_id: 1 }, { anexo_id: "a", bucket: BUCKET_FINAL, caminho: "" }, { anexo_id: "b" }, linha(7)],
    });
    const r = await limparAnexosExpirados(c.svc, (e) => erros.push(e));
    expect(r).toMatchObject({ apagados: 1, falhados: 5, alarmes: ["linhas_invalidas"] });
    expect(c.marcacoes.flat()).toEqual(["id-7"]);
    expect(erros).toHaveLength(1);
  });

  it("se a base recusa a escolha das linhas, lanca e nao apaga nada", async () => {
    const c = criar({ erroLimpar: true });
    await expect(limparAnexosExpirados(c.svc)).rejects.toMatchObject({ code: "42501" });
    expect(c.remocoes).toHaveLength(0);
  });

  it("uma excepcao do Storage nao deita a volta abaixo e e registada", async () => {
    const erros: unknown[] = [];
    const svc: ClienteLimpeza = {
      rpc: async (nome) =>
        nome === "hr_convite_anexos_limpar"
          ? { data: [linha(1)], error: null }
          : nome === "hr_convite_anexos_limpeza_estado"
            ? { data: ESTADO_LIMPO, error: null }
            : { data: 1, error: null },
      storage: {
        from: () => ({
          remove: () => {
            throw new Error("socket fechado");
          },
        }),
      },
    };
    const r = await limparAnexosExpirados(svc, (e) => erros.push(e));
    expect(r).toMatchObject({ apagados: 0, falhados: 1, alarmes: ["remocoes_falhadas"] });
    expect(erros).toHaveLength(1);
  });
});

describe("tudo o que a linha traz", () => {
  it("remove o objecto, a copia da quarentena e os caminhos finais, e so marca com tudo removido", async () => {
    const c = criar({
      linhas: [
        {
          anexo_id: "id-1",
          bucket: BUCKET_FINAL,
          caminho: "org/p/admissao/1.pdf",
          caminho_quarentena: "admissao/convite/1.pdf",
          caminhos_finais: null,
          tentativas: 2,
        },
      ],
    });
    const r = await limparAnexosExpirados(c.svc);
    expect(r).toMatchObject({ apagados: 1, falhados: 0, alarmes: [] });
    expect(c.remocoes).toEqual([
      { bucket: BUCKET_FINAL, caminhos: ["org/p/admissao/1.pdf"] },
      { bucket: BUCKET_QUARENTENA, caminhos: ["admissao/convite/1.pdf"] },
    ]);
    expect(c.marcacoes).toEqual([["id-1"]]);
  });

  it("linha ligada ou promovida traz so a copia da quarentena (bucket e caminho nulos)", async () => {
    const c = criar({
      linhas: [{ anexo_id: "id-9", bucket: null, caminho: null, caminho_quarentena: "admissao/c/9.pdf", caminhos_finais: null, tentativas: 1 }],
    });
    const r = await limparAnexosExpirados(c.svc);
    expect(r).toMatchObject({ apagados: 1, falhados: 0 });
    expect(c.remocoes).toEqual([{ bucket: BUCKET_QUARENTENA, caminhos: ["admissao/c/9.pdf"] }]);
  });

  it("linha apagada nunca ligada: remove os tres caminhos finais possiveis (o objecto orfao de um desfazer falhado)", async () => {
    const finais = ["org/p/admissao/4.pdf", "org/p/admissao/4.png", "org/p/admissao/4.jpg"];
    const c = criar({
      linhas: [
        { anexo_id: "id-4", bucket: BUCKET_QUARENTENA, caminho: "admissao/c/4.pdf", caminho_quarentena: null, caminhos_finais: finais, tentativas: 1 },
      ],
    });
    const r = await limparAnexosExpirados(c.svc);
    expect(r).toMatchObject({ apagados: 1, falhados: 0 });
    expect(c.remocoes).toContainEqual({ bucket: BUCKET_FINAL, caminhos: finais });
    expect(c.remocoes).toContainEqual({ bucket: BUCKET_QUARENTENA, caminhos: ["admissao/c/4.pdf"] });
    expect(c.marcacoes).toEqual([["id-4"]]);
  });

  it("deduplica o mesmo caminho dentro da linha e entre linhas", async () => {
    const c = criar({
      linhas: [
        { anexo_id: "id-1", bucket: BUCKET_QUARENTENA, caminho: "q/1.pdf", caminho_quarentena: "q/1.pdf", caminhos_finais: null, tentativas: 1 },
      ],
    });
    await limparAnexosExpirados(c.svc);
    expect(c.remocoes).toEqual([{ bucket: BUCKET_QUARENTENA, caminhos: ["q/1.pdf"] }]);
  });

  it("se UMA das remocoes da linha falha, a linha NAO e marcada (nem as outras ficam por saber)", async () => {
    const c = criar({
      linhas: [
        { anexo_id: "id-1", bucket: BUCKET_FINAL, caminho: "org/p/admissao/1.pdf", caminho_quarentena: "q/1.pdf", caminhos_finais: null, tentativas: 1 },
        linha(2),
      ],
      falharBucket: BUCKET_QUARENTENA,
    });
    const r = await limparAnexosExpirados(c.svc);
    expect(r).toMatchObject({ apagados: 1, falhados: 1, alarmes: ["remocoes_falhadas"] });
    expect(c.marcacoes.flat()).toEqual(["id-2"]);
  });

  it("caminhos_finais com um valor que nao e texto invalida a linha inteira", async () => {
    const c = criar({
      linhas: [{ anexo_id: "id-1", bucket: BUCKET_FINAL, caminho: "x.pdf", caminho_quarentena: null, caminhos_finais: ["a", 3], tentativas: 1 }],
    });
    const r = await limparAnexosExpirados(c.svc);
    expect(r).toMatchObject({ apagados: 0, falhados: 1, alarmes: ["linhas_invalidas"] });
    expect(c.remocoes).toHaveLength(0);
  });
});

describe("linhas teimosas (head-of-line)", () => {
  it("mais linhas a falhar do que o limite de um lote: todas sao tentadas, ficam por marcar e alarmam", async () => {
    const teimosas = Array.from({ length: 250 }, (_, i) => linha(i, "bucket-estranho"));
    const c = criar({ linhas: [...teimosas, linha(1000)] });
    const r = await limparAnexosExpirados(c.svc);
    expect(r).toMatchObject({ apagados: 1, falhados: 250, alarmes: ["remocoes_falhadas"] });
    expect(c.marcacoes.flat()).toEqual(["id-1000"]);
  });

  it("remocoes que falham em lotes inteiros nao impedem as outras linhas de serem limpas", async () => {
    const c = criar({
      linhas: [...Array.from({ length: 150 }, (_, i) => linha(i)), ...Array.from({ length: 5 }, (_, i) => linha(500 + i, BUCKET_QUARENTENA))],
      falharBucket: BUCKET_FINAL,
    });
    const r = await limparAnexosExpirados(c.svc);
    expect(r).toMatchObject({ apagados: 5, falhados: 150 });
  });
});

describe("alarme no fim da volta", () => {
  it("le o estado depois de marcar", async () => {
    const c = criar({ linhas: [linha(1)] });
    await limparAnexosExpirados(c.svc);
    expect(c.chamadas.map((x) => x.nome)).toEqual([
      "hr_convite_anexos_limpar",
      "hr_convite_anexos_objecto_removido",
      "hr_convite_anexos_limpeza_estado",
    ]);
  });

  it("linhas apagadas ha mais de 2 dias por remover: alarme, mesmo sem falhas nesta volta", async () => {
    const c = criar({ linhas: [], estado: { ...ESTADO_LIMPO, por_remover: 3, por_remover_antigos: 1, max_tentativas: 9 } });
    const r = await limparAnexosExpirados(c.svc);
    expect(r.alarmes).toEqual(["por_remover_antigos"]);
    expect(r.falhados).toBe(0);
  });

  it("promocoes pendentes: alarme", async () => {
    const c = criar({ linhas: [], estado: { ...ESTADO_LIMPO, promocoes_pendentes: 2 } });
    expect((await limparAnexosExpirados(c.svc)).alarmes).toEqual(["promocoes_pendentes"]);
  });

  it("copias da quarentena ainda por remover e job por agendar nao alarmam sozinhos (so informam)", async () => {
    const c = criar({ linhas: [], estado: { ...ESTADO_LIMPO, quarentena_por_remover: 4, job_agendado: false } });
    const r = await limparAnexosExpirados(c.svc);
    expect(r.alarmes).toEqual([]);
    expect(r.estado).toMatchObject({ quarentena_por_remover: 4, job_agendado: false });
  });

  it.each([
    ["a base devolve erro", { erroEstado: true }],
    ["devolve null", { estado: null }],
    ["devolve uma forma errada", { estado: { por_remover: "muitos" } }],
    ["devolve uma lista", { estado: [] }],
  ])("estado ilegivel (%s): alarme em vez de silencio", async (_nome, opcoes) => {
    const erros: unknown[] = [];
    const c = criar({ linhas: [], ...opcoes });
    const r = await limparAnexosExpirados(c.svc, (e) => erros.push(e));
    expect(r.estado).toBeNull();
    expect(r.alarmes).toEqual(["estado_ilegivel"]);
  });

  it("uma excepcao ao ler o estado nao deita a volta abaixo", async () => {
    const svc: ClienteLimpeza = {
      rpc: async (nome) => {
        if (nome === "hr_convite_anexos_limpeza_estado") throw new Error("rede");
        return { data: [], error: null };
      },
      storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) },
    };
    const r = await limparAnexosExpirados(svc);
    expect(r.alarmes).toEqual(["estado_ilegivel"]);
  });
});

describe("respostaDaVolta e mensagemDeAlarme", () => {
  const limpo = { apagados: 2, falhados: 0, estado: ESTADO_LIMPO, alarmes: [] };

  it("volta limpa: 200 e ok", () => {
    expect(respostaDaVolta(limpo)).toEqual({
      status: 200,
      body: { ok: true, apagados: 2, falhados: 0, alarmes: [], estado: ESTADO_LIMPO },
    });
  });

  it("com alarme: 500 e ok falso, com os codigos", () => {
    const r = respostaDaVolta({ ...limpo, falhados: 3, alarmes: ["remocoes_falhadas"] });
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ ok: false, falhados: 3, alarmes: ["remocoes_falhadas"] });
  });

  it("a mensagem leva so codigos e contagens, nunca caminhos", () => {
    const m = mensagemDeAlarme({
      apagados: 0,
      falhados: 2,
      estado: { ...ESTADO_LIMPO, por_remover_antigos: 5, promocoes_pendentes: 1 },
      alarmes: ["remocoes_falhadas", "por_remover_antigos", "promocoes_pendentes"],
    });
    expect(m).toBe(
      "convite-admissao-limpeza: alarme [remocoes_falhadas,por_remover_antigos,promocoes_pendentes] falhados=2 antigos=5 promocoes_pendentes=1",
    );
  });

  it("sem estado, a mensagem usa zeros", () => {
    expect(mensagemDeAlarme({ apagados: 0, falhados: 0, estado: null, alarmes: ["estado_ilegivel"] })).toContain("antigos=0");
  });
});
