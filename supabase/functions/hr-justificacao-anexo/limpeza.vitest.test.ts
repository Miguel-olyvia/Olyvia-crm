/**
 * @vitest-environment node
 *
 * A limpeza dos anexos de justificacoes, com um cliente falso.
 */
import { describe, expect, it } from "vitest";
import {
  BUCKET_JUSTIFICACOES,
  BUCKET_QUARENTENA,
  limparAnexosJustificacoes,
  mensagemDeAlarme,
  respostaDaVolta,
  type ClienteLimpeza,
} from "./limpeza.ts";

const A = "9f8e7d6c-aaaa-4bbb-8ccc-ddddeeeeffff";
const B = "12345678-aaaa-4bbb-8ccc-ddddeeeeffff";

function falso(linhas: unknown, opcoes: { falharEm?: string; falharMarcar?: boolean } = {}) {
  const remocoes: Array<{ bucket: string; caminhos: string[] }> = [];
  const marcados: string[][] = [];
  const chamadas: Array<{ nome: string; args?: Record<string, unknown> }> = [];
  const svc: ClienteLimpeza = {
    rpc: async (nome, args) => {
      chamadas.push({ nome, args });
      if (nome === "hr_justificacao_anexos_limpar") return { data: linhas, error: null };
      if (nome === "rpc_hr_justificacao_anexo_objecto_removido") {
        if (opcoes.falharMarcar) return { data: null, error: { message: "boom" } };
        marcados.push(args!.p_ids as string[]);
        return { data: (args!.p_ids as string[]).length, error: null };
      }
      return { data: null, error: { message: "inesperada" } };
    },
    storage: {
      from: (bucket) => ({
        remove: async (caminhos) => {
          remocoes.push({ bucket, caminhos });
          return bucket === opcoes.falharEm ? { data: null, error: { message: "boom" } } : { data: [], error: null };
        },
      }),
    },
  };
  return { svc, remocoes, marcados, chamadas };
}

describe("limparAnexosJustificacoes", () => {
  it("apaga o objecto, a copia da quarentena e os tres finais possiveis, e so depois marca", async () => {
    const finais = ["o/p/j/a.pdf", "o/p/j/a.png", "o/p/j/a.jpg"];
    const f = falso([
      { anexo_id: A, bucket: BUCKET_QUARENTENA, caminho: `justificacoes/${A}.pdf`, caminho_quarentena: null, caminhos_finais: finais, tentativas: 1 },
      { anexo_id: B, bucket: BUCKET_JUSTIFICACOES, caminho: "o/p/j/b.pdf", caminho_quarentena: `justificacoes/${B}.pdf`, caminhos_finais: null, tentativas: 1 },
    ]);
    const r = await limparAnexosJustificacoes(f.svc);
    expect(r).toEqual({ linhas: 2, apagados: 2, falhados: 0, alarmes: [] });
    expect(f.chamadas[0]).toEqual({ nome: "hr_justificacao_anexos_limpar", args: { p_limite: 200 } });
    const finaisRemovidos = f.remocoes.filter((x) => x.bucket === BUCKET_JUSTIFICACOES).flatMap((x) => x.caminhos);
    expect(finaisRemovidos).toEqual(expect.arrayContaining([...finais, "o/p/j/b.pdf"]));
    const quarentena = f.remocoes.filter((x) => x.bucket === BUCKET_QUARENTENA).flatMap((x) => x.caminhos);
    expect(quarentena).toEqual(expect.arrayContaining([`justificacoes/${A}.pdf`, `justificacoes/${B}.pdf`]));
    expect(f.marcados).toEqual([[A, B]]);
    expect(respostaDaVolta(r).status).toBe(200);
  });

  it("uma remocao que falha deixa a linha por marcar e levanta alarme (500)", async () => {
    const f = falso(
      [{ anexo_id: A, bucket: BUCKET_JUSTIFICACOES, caminho: "o/p/j/a.pdf", caminho_quarentena: null, caminhos_finais: null, tentativas: 1 }],
      { falharEm: BUCKET_JUSTIFICACOES },
    );
    const r = await limparAnexosJustificacoes(f.svc);
    expect(r.alarmes).toEqual(["remocoes_falhadas"]);
    expect(f.marcados).toHaveLength(0);
    expect(respostaDaVolta(r).status).toBe(500);
  });

  it("um bucket fora destes anexos nunca se toca, e alarma", async () => {
    const f = falso([{ anexo_id: A, bucket: "hr-documentos", caminho: "x/y.pdf", caminho_quarentena: null, caminhos_finais: null, tentativas: 1 }]);
    const r = await limparAnexosJustificacoes(f.svc);
    expect(f.remocoes).toHaveLength(0);
    expect(r.alarmes).toEqual(["remocoes_falhadas"]);
  });

  it("linhas invalidas alarmam; nada a limpar e 200", async () => {
    expect((await limparAnexosJustificacoes(falso([{ foo: 1 }, null]).svc)).alarmes).toEqual(["linhas_invalidas"]);
    const vazio = await limparAnexosJustificacoes(falso([]).svc);
    expect(vazio).toEqual({ linhas: 0, apagados: 0, falhados: 0, alarmes: [] });
    expect(respostaDaVolta(vazio).status).toBe(200);
  });

  it("uma linha que volta pela 5.a vez alarma", async () => {
    const f = falso([{ anexo_id: A, bucket: BUCKET_JUSTIFICACOES, caminho: "o/p/j/a.pdf", caminho_quarentena: null, caminhos_finais: null, tentativas: 5 }]);
    expect((await limparAnexosJustificacoes(f.svc)).alarmes).toEqual(["reincidentes"]);
  });

  it("falha a marcar: conta como falhada para voltar na proxima volta", async () => {
    const f = falso(
      [{ anexo_id: A, bucket: BUCKET_JUSTIFICACOES, caminho: "o/p/j/a.pdf", caminho_quarentena: null, caminhos_finais: null, tentativas: 1 }],
      { falharMarcar: true },
    );
    const r = await limparAnexosJustificacoes(f.svc);
    expect(r.apagados).toBe(0);
    expect(r.alarmes).toEqual(["remocoes_falhadas"]);
  });

  it("lanca se a base recusar a escolha das linhas", async () => {
    const svc: ClienteLimpeza = {
      rpc: async () => ({ data: null, error: { message: "HR911" } }),
      storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) },
    };
    await expect(limparAnexosJustificacoes(svc)).rejects.toBeTruthy();
  });

  it("a resposta e o alarme nao trazem caminhos nem ids", async () => {
    const f = falso(
      [{ anexo_id: A, bucket: BUCKET_JUSTIFICACOES, caminho: "o/p/j/a.pdf", caminho_quarentena: null, caminhos_finais: null, tentativas: 1 }],
      { falharEm: BUCKET_JUSTIFICACOES },
    );
    const r = await limparAnexosJustificacoes(f.svc);
    const texto = JSON.stringify(respostaDaVolta(r)) + mensagemDeAlarme(r);
    expect(texto).not.toContain(A);
    expect(texto).not.toContain("o/p/j");
  });
});
