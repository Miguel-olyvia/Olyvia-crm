// As traduções do canal de denúncias: pt e en têm as mesmas chaves, e todas as chaves usadas no código existem.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canalDenunciasTranslations as tr } from "@/translations/canalDenuncias";
import { TRANSICOES } from "./lib/estados";
import { ESTADOS, GRAVIDADES, RESULTADOS, TIPOS, AINDA_ACONTECE } from "./lib/tipos";

const SRC = join(process.cwd(), "src");
const PASTAS = ["components/canal-denuncias", "pages/canal-denuncias"];

function ficheirosDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const c = join(pasta, nome);
    return statSync(c).isDirectory() ? ficheirosDe(c) : /\.tsx?$/.test(c) && !/\.test\.tsx?$/.test(c) ? [c] : [];
  });
}

const codigo = PASTAS.flatMap((p) => ficheirosDe(join(SRC, p))).map((f) => readFileSync(f, "utf8")).join("\n");
const literais = Array.from(codigo.matchAll(/["'](cd\.[A-Za-z0-9_.]+|sidebar\.canalDenuncias[A-Za-z]*)["']/g), (m) => m[1]);
const dinamicas = [
  ...ESTADOS.map((e) => `cd.estado.${e}`),
  ...ESTADOS.map((e) => `cd.acomp.texto.${e}`),
  ...GRAVIDADES.map((g) => `cd.gravidade.${g}`),
  ...RESULTADOS.map((r) => `cd.resultado.${r}`),
  ...TIPOS.map((t) => `cd.tipo.${t}`),
  ...AINDA_ACONTECE.map((r) => `cd.resposta.${r}`),
  ...["anonima", "identificada"].flatMap((m) => [`cd.modo.${m}.titulo`, `cd.modo.${m}.explica`]),
  ...["desconhecida", "protegida", "revelada"].map((i) => `cd.identidade.${i}`),
  ...["codigo", "tipo", "resumo", "origem", "estado", "prazo", "responsavel"].map((c) => `cd.coluna.${c}`),
  ...["denunciado", "conflito"].map((m) => `cd.conflito.${m}`),
  ...["transicao_invalida", "denunciado", "conflito", "texto_vazio", "motivo_curto", "resultado_em_falta", "fundamentacao_em_falta", "fechada"].map((e) => `cd.erroAcao.${e}`),
  ...["recebida", "rececao_confirmada", "responsavel_atribuido", "conflito_declarado", "mensagem_enviada", "informacao_pedida",
    "denunciante_respondeu", "gravidade_alterada", "nota_adicionada", "concluida", "arquivada", "reaberta", "identidade_vista"].map((a) => `cd.hist.${a}`),
];

describe("traduções do canal de denúncias", () => {
  it("pt e en têm exatamente as mesmas chaves, todas com texto", () => {
    expect(Object.keys(tr.en).sort()).toEqual(Object.keys(tr.pt).sort());
    for (const lingua of [tr.pt, tr.en]) {
      expect(Object.entries(lingua).filter(([, v]) => v.trim() === "")).toEqual([]);
    }
  });

  it("todas as chaves escritas no código existem nas duas línguas", () => {
    expect(literais.length).toBeGreaterThan(100);
    const faltam = Array.from(new Set([...literais, ...dinamicas])).filter((k) => !(k in tr.pt) || !(k in tr.en));
    expect(faltam).toEqual([]);
  });

  it("os erros de ação e os estados cobrem as transições definidas", () => {
    expect(Object.keys(TRANSICOES).sort()).toEqual([...ESTADOS].sort());
  });

  it("os marcadores {x} são os mesmos em pt e en", () => {
    const marcadores = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();
    const diferentes = Object.keys(tr.pt).filter((k) => JSON.stringify(marcadores(tr.pt[k])) !== JSON.stringify(marcadores(tr.en[k])));
    expect(diferentes).toEqual([]);
  });
});
