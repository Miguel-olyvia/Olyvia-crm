// O que cada resposta do levantamento CONFIGURÁVEL faz ao orçamento, em funções puras (sem React, sem rede). Os efeitos têm a forma dos da Emylia
// (src/emylia/efeitosLevantamento.ts, só lida): a mesma nota ao vivo («+ X € no orçamento · motivo») e as mesmas linhas «Levantamento · …».
//
// Onde está a resposta: numa pergunta LIGADA a um campo da Emylia, no próprio campo (d.f[campo], valor literal da Emylia); numa pergunta sem campo,
// em d.f["cfg_<chave da pergunta>"] (a chave da opção, ou as chaves separadas por «, » nas de escolha múltipla). Uma só fonte por resposta.
// Modos (por pergunta, escolhidos na configuração): nenhum, emylia (o efeito que o campo da Emylia já tem) e próprio (os efeitos definidos por opção,
// ou por unidade nas numéricas). Exclusivos: nunca contam duas vezes. Sem valores por omissão: um efeito por definir não conta.
import { CAMPOS_COM_EFEITO, type Efeito } from "@/emylia/efeitosLevantamento";
import { chaveBase, listaVarios } from "@/emylia/campos";
import type { ItemEfeitoCfg, PerguntaDef } from "@/components/negocio-metas/perguntasTipos";
import type { QuestionarioForm } from "@/components/negocio-metas/questionarioForm";

export type ModoResolvido = "nenhum" | "emylia" | "proprio";

const r2 = (x: number): number => Math.round(x * 100) / 100;

/** A chave onde fica a resposta a uma pergunta sem campo da Emylia. */
export const chaveCfg = (chave: string): string => `cfg_${chave}`;

/** A chave da resposta no negócio: o campo da Emylia, se a pergunta está ligada a um; senão a chave «cfg_». */
export const chaveDaResposta = (p: PerguntaDef): string => (p.efeitoCfg?.campoEmylia ? p.efeitoCfg.campoEmylia : chaveCfg(p.id));

/** O modo que vale: o escolhido; sem escolha, o da Emylia se o campo ligado já mexe no orçamento, senão nenhum. */
export function modoResolvido(p: PerguntaDef): ModoResolvido {
  const cfg = p.efeitoCfg;
  if (!cfg) return "nenhum";
  if (cfg.modo !== "") return cfg.modo;
  return cfg.campoEmylia !== "" && CAMPOS_COM_EFEITO.has(chaveBase(cfg.campoEmylia)) ? "emylia" : "nenhum";
}

/** As chaves das opções escolhidas numa pergunta de escolha, a partir do que está em d.f. */
export function opcoesEscolhidas(p: PerguntaDef, f: Record<string, string>): string[] {
  const valor = f[chaveDaResposta(p)] ?? "";
  if (valor === "") return [];
  const cfg = p.efeitoCfg;
  const valores = p.tipo === "escolha_multipla" ? listaVarios(valor) : [valor];
  if (!cfg || cfg.campoEmylia === "") return valores;
  // ligada a um campo da Emylia: o valor é o da Emylia, e cada opção diz qual é o seu
  return p.opcoes.map(([chave]) => chave).filter((chave) => {
    const v = cfg.porOpcao[chave]?.valorEmylia ?? "";
    return v !== "" && valores.includes(v);
  });
}

/** O valor que uma opção tem de ficar em d.f: o da Emylia (se ligada) ou a sua chave. */
export const valorDaOpcao = (p: PerguntaDef, chave: string): string => {
  const v = p.efeitoCfg?.porOpcao[chave]?.valorEmylia ?? "";
  return p.efeitoCfg?.campoEmylia && v !== "" ? v : chave;
};

function deItem(k: string, i: ItemEfeitoCfg, vezes: number): Efeito | null {
  const d = vezes === 1 ? i.descricao : `${i.descricao} (× ${String(vezes).replace(".", ",")})`;
  if (i.tipo === "valor") return i.custo === undefined || i.preco === undefined ? null : { k, t: "linha", d, custo: r2(i.custo * vezes), preco: r2(i.preco * vezes) };
  if (i.tipo === "horas") {
    if (i.horas === undefined || i.custo_hora === undefined || i.preco_hora === undefined) return null;
    return { k, t: "linha", d, custo: r2(i.horas * i.custo_hora * vezes), preco: r2(i.horas * i.preco_hora * vezes) };
  }
  return i.pct === undefined ? null : { k, t: "percent", d, custo: 0, preco: 0, pct: (i.pct * vezes) / 100 };
}

/** Os efeitos próprios de UMA pergunta com o que está respondido (vazio se o modo não é «próprio» ou não há resposta). */
export function efeitosDaPergunta(p: PerguntaDef, f: Record<string, string>): Efeito[] {
  const cfg = p.efeitoCfg;
  if (!cfg || modoResolvido(p) !== "proprio") return [];
  const k = chaveDaResposta(p);
  if (p.tipo === "numero") {
    const n = Number(String(f[k] ?? "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return [];
    return cfg.itens.flatMap((i) => deItem(k, i, n) ?? []);
  }
  if (p.tipo === "escolha_unica" || p.tipo === "escolha_multipla") {
    return opcoesEscolhidas(p, f).flatMap((chave) => (cfg.porOpcao[chave]?.itens ?? []).flatMap((i) => deItem(k, i, 1) ?? []));
  }
  return [];
}

/** A pergunta vê-se quando a condição (a resposta a outra pergunta de escolha) se cumpre; sem a pergunta de que depende, vê-se. */
export function perguntaVisivel(p: PerguntaDef, todas: readonly PerguntaDef[], f: Record<string, string>): boolean {
  if (!p.se) return true;
  const alvo = todas.find((x) => x.id === p.se?.pergunta);
  if (!alvo) return true;
  const escolhidas = opcoesEscolhidas(alvo, f);
  const valores = escolhidas.length === 0 ? [""] : escolhidas;
  return valores.some((v) => p.se?.valores.includes(v));
}

const todasAsPerguntas = (q: QuestionarioForm): PerguntaDef[] => q.seccoes.filter((s) => s.aba !== "qualificacao").flatMap((s) => s.blocos.flatMap((b) => b.perguntas));

/** Os efeitos próprios das perguntas da visita que se veem: uma pergunta escondida pela condição «depende» não mexe no orçamento, mesmo com resposta guardada. */
export const efeitosConfigurados = (q: QuestionarioForm, f: Record<string, string>): Efeito[] => {
  const todas = todasAsPerguntas(q);
  return todas.filter((p) => perguntaVisivel(p, todas, f)).flatMap((p) => efeitosDaPergunta(p, f));
};

/** Os campos da Emylia cujo efeito nativo a organização desligou (a pergunta ligada a eles está em «nenhum» ou «próprio»). */
export function camposNativosDesligados(q: QuestionarioForm): Set<string> {
  const out = new Set<string>();
  for (const p of todasAsPerguntas(q)) {
    const campo = p.efeitoCfg?.campoEmylia ?? "";
    if (campo !== "" && modoResolvido(p) !== "emylia") out.add(chaveBase(campo));
  }
  return out;
}

// LIMITAÇÃO CONHECIDA: o campo da Emylia ligado a uma pergunta em «Não afeta» ou «próprio» continua a mostrar a sua nota nativa («+ X € no orçamento · …»), porque
// essa nota vive em src/emylia/CamposFase.tsx (que não se altera aqui) e não sabe da configuração. O orçamento obedece à configuração (aplicarEfeitos.ts tira a
// linha nativa); só a nota do campo pode discordar até CamposFase aceitar um filtro.
