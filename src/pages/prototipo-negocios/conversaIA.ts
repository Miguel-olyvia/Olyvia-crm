// O levantamento por conversa (21/10/2026): o primeiro passo das Necessidades. O comercial conta o que o cliente quer
// (por voz, por escrito ou com fotografias) e a Olyvia, o assistente, liga ao Catálogo: propõe serviços, produtos e
// medidas, pergunta o que falta (uma coisa de cada vez) e mostra os produtos para escolher ali mesmo. Nada entra na
// visita sem o comercial validar: o que a Olyvia propõe fica num rascunho, e "Validar" junta-o à visita.
// Aqui está a parte sem React: o que se manda ao Claude (o Catálogo no system, as ferramentas), o que se faz com as
// ferramentas que ele chama (procurar no Catálogo, atualizar o rascunho), passar o rascunho para a visita, e o modo de
// demonstração (sem chave no servidor): uma leitura por palavras do mesmo Catálogo, para o ecrã funcionar sem IA.
import type Anthropic from "@anthropic-ai/sdk";
import { CATALOGO_TODO, itemCatalogo, normal } from "./catalogo";
import { LINHAS, camposMedida, garantirServico, porMedida, type CampoMedida, type Estado, type Negocio, type SvcId, type acoes } from "./motor";
import { caminho, type Catalogo, type Produto } from "./v2/catalogoModelo";
import { CONSUMIVEIS } from "./equipamentosCliente";
import { precoUnitario, qtdSugerida } from "./produtosVisita";
import { nomeCurto } from "./necessidades";

export type MensagemApi = Anthropic.Beta.BetaMessageParam;
export type RespostaApi = Anthropic.Beta.BetaMessage;
type Bloco = Anthropic.Beta.BetaContentBlock;

/* ------------------------------------------------------------------ o rascunho */
/** O que a Olyvia propõe e ainda não entrou na visita. */
export interface Rascunho {
  servicos: Record<SvcId, { q: number; motivo: string }>;
  produtos: Record<string, { q: number; motivo: string }>;
  medidas: Partial<Record<CampoMedida, number>>;
  manter: Record<SvcId, "sim" | "nao">;
  notas: string[];
}
export const rascunhoVazio = (): Rascunho => ({ servicos: {}, produtos: {}, medidas: {}, manter: {}, notas: [] });
export const rascunhoTemAlgo = (r: Rascunho) =>
  Object.keys(r.servicos).length + Object.keys(r.produtos).length + Object.keys(r.medidas).length + Object.keys(r.manter).length + r.notas.length > 0;

/** Uma ação do assistente que o ecrã mostra na conversa. */
export type Cartao =
  | { k: "produtos"; pergunta: string; para: SvcId | null; ids: string[] }
  | { k: "respostas"; opcoes: string[] };

/* ------------------------------------------------------------------ o system */
const fmt = (x: number) => x.toLocaleString("pt-PT", { maximumFractionDigits: 2 });

/** O Catálogo de serviços em linhas curtas: "c13 | Sanita compacta | Canalização | un | 65 €". */
export function linhasServicos(S: Estado, d: Negocio): string[] {
  const L = LINHAS[d.linha];
  const pacote = new Map(L.map);
  const out: string[] = [];
  for (const [sid, k] of L.map) {
    const s = S.svc[sid];
    if (s) out.push(`${sid} | ${s.n} | pacote: a quantidade é a medida "${k}" | ${s.un} | ${fmt(s.preco)} €`);
  }
  for (const c of CATALOGO_TODO) {
    if (pacote.has(c.id)) continue;
    const preco = S.svc[c.id]?.preco ?? c.pvp ?? 0;
    out.push(`${c.id} | ${nomeCurto(c.n)} | ${c.cat}${c.sub ? " › " + c.sub : ""} | ${c.un} | ${fmt(preco)} €${c.usos ? ` | pedido em ${c.usos} orçamentos` : ""}`);
  }
  return out;
}

/** O system: quem é, como fala, as regras e o Catálogo (estável entre voltas, para ficar em cache). */
export function sistema(S: Estado, K: Catalogo, d: Negocio): string {
  const L = LINHAS[d.linha];
  const medidas = camposMedida(L).map(([k, l]) => `- ${k}: ${l}`).join("\n");
  const perguntas = Object.entries(K.perguntaManter ?? {}).map(([sid, p]) => `- ${sid}: ${p}`).join("\n");
  const ramos = K.arvore.filter((n) => n.pai).map((n) => caminho(K.arvore, n.id)).join("; ");
  return `És a Olyvia, a assistente de levantamento de obra da Mudelar (remodelações de casas de banho e cozinhas, em Portugal).
Estás no telemóvel do comercial, em casa do cliente. Ele conta-te o que o cliente quer, por voz (o texto vem de um ditado, pode ter erros), por escrito ou com fotografias.
O teu trabalho: transformar isso no levantamento: os serviços do Catálogo, os produtos do Catálogo e as medidas.

Como falas:
- Português europeu, tratamento por "você" ao comercial, frases curtas. 1 a 3 frases por resposta, sem listas longas: o ecrã já mostra o que propuseste.
- Uma pergunta de cada vez, a que mais muda o orçamento. Quando a pergunta tem respostas óbvias, chama sugerir_respostas (2 a 4 respostas curtas).
- Simpática e prática, como uma colega experiente de obra. Sem emojis.

Como trabalhas:
- Sempre que percebes algo novo, chama atualizar_levantamento com o que juntar ou mudar (quantidade 0 tira). Usa só ids que existem no Catálogo abaixo ou que vieram de procurar_produtos; nunca inventes ids.
- Os serviços do pacote (marcados "pacote") têm a quantidade pelas medidas: em vez de os pôr à mão, dá as medidas. Paredes (par) = perímetro × altura, menos portas e janelas; pavimento (pav) = comprimento × largura. Se só tens parte, estima e diz que é estimativa.
- Produtos: procura com procurar_produtos (por nome, tipo, marca, medida). Quando o cliente tem de escolher (a base de duche, a sanita, o móvel), chama mostrar_produtos com 3 a 6 opções boas e diferentes entre si (preço, tamanho, marca). Quando a escolha é clara (ex.: "a sanita suspensa mais barata"), junta-a diretamente.
- Perguntas do Catálogo "O cliente mantém…?": quando a resposta for clara, regista-a em manter (sim = mantém, não entra produto; nao = troca).
- Coisas que não são do Catálogo (estilo, cores, prazos, acesso, condomínio) vão para notas, curtas.
- Fotografias: descreve em meia frase o que vês de útil (estado, louças, dimensões aparentes) e tira daí serviços e perguntas. Não inventes medidas a partir de fotografias: pede-as.
- No fim de cada volta, se ainda falta algo importante (medidas, uma escolha), pergunta. Se está completo, diz que pode validar.

Esta visita: ${d.nome} · ${L.n} · ${d.local || "sem morada"}.

Medidas desta linha (chaves para atualizar_levantamento):
${medidas}

Perguntas "o cliente mantém?" do Catálogo (serviço: pergunta):
${perguntas || "- (nenhuma)"}

Ramos de produtos do Catálogo: ${ramos}

Catálogo de serviços (id | nome | ofício | unidade | preço de tabela s/IVA):
${linhasServicos(S, d).join("\n")}`;
}

/* ------------------------------------------------------------------ as ferramentas */
const obj = (props: Record<string, unknown>) => ({ type: "object" as const, properties: props, required: Object.keys(props), additionalProperties: false });
const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });

export function ferramentas(d: Negocio): Anthropic.Beta.BetaToolUnion[] {
  const chaves = camposMedida(LINHAS[d.linha]).map(([k]) => k);
  return [
    {
      name: "procurar_produtos",
      description: "Procura produtos no Catálogo (≈2100 produtos: louças, bases de duche, móveis, revestimentos, torneiras, eletrodomésticos…). Devolve até 'max' produtos com id, nome, marca, ramo e preço de venda por unidade. Usa palavras simples (\"base duche 120\", \"sanita suspensa\", \"móvel 80\").",
      strict: true,
      input_schema: obj({ texto: str("O que procurar."), max: num("Quantos devolver (1 a 20).") }),
    },
    {
      name: "atualizar_levantamento",
      description: "Junta ou muda o que propões para o levantamento. O comercial vê-o como proposta e valida. Quantidade 0 tira. Listas vazias quando não há nada desse tipo.",
      strict: true,
      input_schema: obj({
        servicos: { type: "array", items: obj({ id: str("Id do serviço no Catálogo."), quantidade: num("Na unidade do serviço."), motivo: str("Meia frase: porquê.") }) },
        produtos: { type: "array", items: obj({ id: str("Id do produto (de procurar_produtos)."), quantidade: num("Na unidade do produto."), motivo: str("Meia frase: porquê.") }) },
        medidas: { type: "array", items: obj({ chave: { type: "string", enum: chaves }, valor: num("O valor da medida.") }) },
        manter: { type: "array", items: obj({ servico: str("Id do serviço da pergunta."), resposta: { type: "string", enum: ["sim", "nao"] } }) },
        notas: { type: "array", items: str("Uma nota curta (estilo, cores, acesso, prazos).") },
      }),
    },
    {
      name: "mostrar_produtos",
      description: "Mostra ao comercial cartões de produtos para o cliente escolher (3 a 6). A escolha volta como mensagem do comercial.",
      strict: true,
      input_schema: obj({
        pergunta: str("A pergunta curta por cima dos cartões, ex.: \"Qual base de duche?\""),
        para_servico: str("Id do serviço a que a escolha responde, ou \"\"."),
        produtos: { type: "array", items: str("Id do produto.") },
      }),
    },
    {
      name: "sugerir_respostas",
      description: "Mostra 2 a 4 respostas rápidas por baixo da tua pergunta (o comercial toca em vez de escrever).",
      strict: true,
      input_schema: obj({ opcoes: { type: "array", items: str("Resposta curta, até 5 palavras.") } }),
    },
  ];
}

/* ------------------------------------------------------------------ procurar no Catálogo */
const VAZIAS = new Set(["a", "o", "as", "os", "e", "de", "do", "da", "dos", "das", "com", "em", "para", "por", "um", "uma", "no", "na"]);
const palavras = (t: string) => normal(t).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !VAZIAS.has(w));
/** "duches" → "duche", "loiças" → "loica": o suficiente para o plural não falhar. */
const raiz = (w: string) => (w.length > 4 ? w.replace(/(oes|aes|es|s)$/, "") : w);

/** Os produtos que batem com o texto: mais palavras no nome primeiro, depois no ramo e na marca; os mais baratos a desempatar. */
export function procurarProdutos(K: Catalogo, texto: string, max = 8): Produto[] {
  const pal = palavras(texto).map(raiz);
  if (!pal.length) return [];
  const notas: { p: Produto; s: number }[] = [];
  for (const p of K.produtos) {
    if (CONSUMIVEIS.has(p.n)) continue;
    const nome = normal(p.n + " " + (p.sub ?? "")), resto = normal([p.marca, p.desc, caminho(K.arvore, p.no)].filter(Boolean).join(" "));
    let s = 0;
    for (const w of pal) s += nome.includes(w) ? 2 : resto.includes(w) ? 1 : 0;
    if (s > 0) notas.push({ p, s });
  }
  const melhor = Math.max(0, ...notas.map((x) => x.s));
  return notas
    .filter((x) => x.s >= Math.max(1, melhor - 1))
    .sort((a, b) => b.s - a.s || precoUnitario(a.p) - precoUnitario(b.p))
    .slice(0, Math.max(1, Math.min(300, max)))
    .map((x) => x.p);
}

export const linhaProduto = (K: Catalogo, p: Produto) =>
  `${p.id} | ${p.n}${p.marca ? " | " + p.marca : ""} | ${caminho(K.arvore, p.no)} | ${fmt(precoUnitario(p))} €/${p.un}${p.servico ? " | traz a instalação" : ""}`;

/* ------------------------------------------------------------------ executar as ferramentas */
export interface Volta {
  rascunho: Rascunho;
  cartoes: Cartao[];
  /** Os tool_result a mandar na próxima chamada. */
  resultados: Anthropic.Beta.BetaToolResultBlockParam[];
  /** O que mudou no rascunho nesta volta (para animar a entrada). */
  novos: string[];
}

interface EntradaAtualizar {
  servicos?: { id: string; quantidade: number; motivo?: string }[];
  produtos?: { id: string; quantidade: number; motivo?: string }[];
  medidas?: { chave: string; valor: number }[];
  manter?: { servico: string; resposta: "sim" | "nao" }[];
  notas?: string[];
}

/** Junta ao rascunho; o que tem id desconhecido fica de fora e volta dito ao assistente. */
export function atualizar(r0: Rascunho, e: EntradaAtualizar, S: Estado, K: Catalogo, d: Negocio): { r: Rascunho; ignorados: string[]; novos: string[] } {
  const r: Rascunho = { servicos: { ...r0.servicos }, produtos: { ...r0.produtos }, medidas: { ...r0.medidas }, manter: { ...r0.manter }, notas: [...r0.notas] };
  const ignorados: string[] = [], novos: string[] = [];
  const chaves = new Set(camposMedida(LINHAS[d.linha]).map(([k]) => k as string));
  const q = (x: unknown) => (typeof x === "number" && isFinite(x) ? Math.max(0, Math.round(x * 100) / 100) : 0);
  for (const s of e.servicos ?? []) {
    if (!S.svc[s.id] && !itemCatalogo(s.id)) { ignorados.push(`serviço ${s.id}`); continue; }
    if (q(s.quantidade) > 0) { if (!r.servicos[s.id]) novos.push("s:" + s.id); r.servicos[s.id] = { q: q(s.quantidade), motivo: s.motivo ?? "" }; } else delete r.servicos[s.id];
  }
  for (const p of e.produtos ?? []) {
    if (!K.produtos.some((x) => x.id === p.id)) { ignorados.push(`produto ${p.id}`); continue; }
    if (q(p.quantidade) > 0) { if (!r.produtos[p.id]) novos.push("p:" + p.id); r.produtos[p.id] = { q: q(p.quantidade), motivo: p.motivo ?? "" }; } else delete r.produtos[p.id];
  }
  for (const m of e.medidas ?? []) {
    if (!chaves.has(m.chave)) { ignorados.push(`medida ${m.chave}`); continue; }
    if (r.medidas[m.chave as CampoMedida] !== q(m.valor)) novos.push("m:" + m.chave);
    r.medidas[m.chave as CampoMedida] = q(m.valor);
  }
  for (const m of e.manter ?? []) {
    if (!K.perguntaManter?.[m.servico]) { ignorados.push(`pergunta ${m.servico}`); continue; }
    r.manter[m.servico] = m.resposta;
    novos.push("k:" + m.servico);
  }
  for (const n of e.notas ?? []) { const t = n.trim(); if (t && !r.notas.includes(t)) { r.notas.push(t); novos.push("n:" + t); } }
  return { r, ignorados, novos };
}

/** Executa as ferramentas que o assistente chamou numa resposta. */
export function executar(blocos: Bloco[], r0: Rascunho, S: Estado, K: Catalogo, d: Negocio): Volta {
  let r = r0;
  const cartoes: Cartao[] = [], resultados: Volta["resultados"] = [], novos: string[] = [];
  const ok = (id: string, content: string, is_error = false) => resultados.push({ type: "tool_result", tool_use_id: id, content, ...(is_error ? { is_error } : {}) });
  for (const b of blocos) {
    if (b.type !== "tool_use") continue;
    const e = (b.input ?? {}) as Record<string, unknown>;
    if (b.name === "procurar_produtos") {
      const ps = procurarProdutos(K, String(e.texto ?? ""), Math.min(20, Number(e.max) || 8));
      ok(b.id, ps.length ? ps.map((p) => linhaProduto(K, p)).join("\n") : "Nada no Catálogo com essas palavras. Tente outras (mais simples).");
    } else if (b.name === "atualizar_levantamento") {
      const x = atualizar(r, e as EntradaAtualizar, S, K, d);
      r = x.r;
      novos.push(...x.novos);
      ok(b.id, x.ignorados.length ? `Feito, menos: ${x.ignorados.join(", ")} (ids que não existem).` : "Feito. O comercial vê a proposta para validar.", x.ignorados.length > 0 && !x.novos.length);
    } else if (b.name === "mostrar_produtos") {
      const ids = (Array.isArray(e.produtos) ? e.produtos : []).map(String).filter((id) => K.produtos.some((p) => p.id === id)).slice(0, 6);
      const para = typeof e.para_servico === "string" && e.para_servico && (S.svc[e.para_servico] || itemCatalogo(e.para_servico)) ? e.para_servico : null;
      if (ids.length) cartoes.push({ k: "produtos", pergunta: String(e.pergunta ?? "Qual prefere?"), para, ids });
      ok(b.id, ids.length ? "Mostrado. Espere pela escolha do comercial." : "Nenhum desses ids existe: procure primeiro com procurar_produtos.", !ids.length);
    } else if (b.name === "sugerir_respostas") {
      const opcoes = (Array.isArray(e.opcoes) ? e.opcoes : []).map(String).filter(Boolean).slice(0, 4);
      if (opcoes.length) cartoes.push({ k: "respostas", opcoes });
      ok(b.id, "Mostrado.");
    } else ok(b.id, `Ferramenta desconhecida: ${b.name}`, true);
  }
  return { rascunho: r, cartoes, resultados, novos };
}

/* ------------------------------------------------------------------ o contexto da volta */
/** O que já está na visita e no rascunho, em texto (vai no início de cada mensagem do comercial, para a Olyvia não repetir). */
export function contextoVisita(d: Negocio, r: Rascunho): string {
  const v = d.visita, L = LINHAS[d.linha];
  const med = camposMedida(L).map(([k, l]) => {
    const x = r.medidas[k] ?? (k === "ptf" ? v.med.ptf ?? v.med.pts : k === "ptq" ? v.med.ptq : v.med[k]);
    return `${l}: ${x ? fmt(x) : "?"}`;
  }).join("; ");
  const extra = Object.entries(v.extra).filter(([, q]) => (q || 0) > 0).map(([sid, q]) => `${sid} ×${fmt(q!)}`);
  const prod = (v.prod ?? []).map((p) => `${p.id} ×${fmt(p.q)}`);
  const ras = [
    ...Object.entries(r.servicos).map(([sid, x]) => `${sid} ×${fmt(x.q)}`),
    ...Object.entries(r.produtos).map(([id, x]) => `${id} ×${fmt(x.q)}`),
  ];
  return `[Estado: medidas — ${med}. Na visita: ${[...extra, ...prod].join(", ") || "nada ainda"}. Proposto por validar: ${ras.join(", ") || "nada"}.${v.nec.length ? " Notas: " + v.nec.join("; ") + "." : ""}]`;
}

/** Junta a mensagem do comercial (texto e fotografias em base64) com o contexto. */
export function mensagemComercial(texto: string, fotos: { tipo: string; base64: string }[], contexto: string): MensagemApi {
  return {
    role: "user",
    content: [
      ...fotos.map((f) => ({ type: "image" as const, source: { type: "base64" as const, media_type: f.tipo as "image/jpeg", data: f.base64 } })),
      { type: "text" as const, text: `${contexto}\n\n${texto || (fotos.length ? "Fotografias da área." : "")}` },
    ],
  };
}

/** O texto de uma resposta (os blocos de texto juntos). */
export const textoDe = (blocos: Bloco[]) => blocos.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("").trim();

/* ------------------------------------------------------------------ validar: o rascunho entra na visita */
type AcoesConversa = Pick<ReturnType<typeof acoes>, "extra" | "produto" | "manter">;

export interface Validado { servicos: number; produtos: number; medidas: number }
/**
 * Passa o rascunho para a visita: as medidas (os serviços do pacote seguem-nas), os serviços à mão, os produtos com a
 * quantidade proposta (ou a sugerida pelas medidas), as respostas "mantém" e as notas. Os que o comercial desligou ficam.
 */
export function validarNaVisita(A: AcoesConversa, S: Estado, K: Catalogo, d: Negocio, r: Rascunho, fora: Set<string> = new Set()): Validado {
  const v = d.visita, L = LINHAS[d.linha];
  const doPacote = new Map(L.map);
  let medidas = 0, servicos = 0, produtos = 0;
  for (const [k, x] of Object.entries(r.medidas) as [CampoMedida, number][]) {
    if (fora.has("m:" + k)) continue;
    porMedida(v.med, k, x);
    medidas++;
  }
  for (const [sid, x] of Object.entries(r.servicos)) {
    if (fora.has("s:" + sid)) continue;
    const k = doPacote.get(sid);
    if (k) {
      // do pacote: a quantidade é a medida (só se ainda não há); e volta a contar se estava desligado
      if (!(v.med[k] > 0)) porMedida(v.med, k, x.q);
      const i = v.off.indexOf(sid);
      if (i >= 0) v.off.splice(i, 1);
    } else {
      garantirServico(S, sid);
      A.extra(d.id, sid, x.q);
    }
    servicos++;
  }
  for (const [id, x] of Object.entries(r.produtos)) {
    if (fora.has("p:" + id)) continue;
    const p = K.produtos.find((y) => y.id === id);
    if (!p) continue;
    A.produto(d.id, p, x.q || qtdSugerida(K, p, Object.keys(r.servicos), v.med));
    produtos++;
  }
  for (const [sid, resp] of Object.entries(r.manter)) if (!fora.has("k:" + sid)) A.manter(d.id, sid, resp);
  for (const n of r.notas) if (!fora.has("n:" + n) && !v.nec.includes(n)) v.nec.push(n);
  return { servicos, produtos, medidas };
}

/* ------------------------------------------------------------------ o modo de demonstração */
// Sem chave no servidor, a Olyvia lê por palavras: os serviços cujo nome curto bate com o que se disse, os produtos
// das peças que se nomearam (com cartões para escolher), as medidas ditas ("chão de 2 por 2,5", "paredes 18 m²",
// "3 pontos de água"). Responde como a IA responderia (as mesmas ferramentas), para o ecrã ser o mesmo.
const PECAS: { re: RegExp; procura: string; pergunta: string }[] = [
  { re: /base(s)? de duche|duche/, procura: "base duche", pergunta: "Qual base de duche?" },
  { re: /sanita/, procura: "sanita", pergunta: "Qual sanita?" },
  { re: /lavat[oó]rio/, procura: "lavatorio", pergunta: "Qual lavatório?" },
  { re: /m[oó]vel|m[oó]veis/, procura: "movel casa banho", pergunta: "Qual móvel?" },
  { re: /banheira/, procura: "banheira", pergunta: "Qual banheira?" },
  { re: /resguardo/, procura: "resguardo", pergunta: "Qual resguardo?" },
  { re: /espelho/, procura: "espelho", pergunta: "Qual espelho?" },
  { re: /toalheiro/, procura: "toalheiro", pergunta: "Qual toalheiro?" },
  { re: /coluna de duche|coluna/, procura: "coluna duche", pergunta: "Qual coluna de duche?" },
  { re: /lava.?loi[çc]a/, procura: "lava loica", pergunta: "Qual lava-loiça?" },
  { re: /bancada/, procura: "bancada", pergunta: "Qual bancada?" },
  { re: /exaustor/, procura: "exaustor", pergunta: "Qual exaustor?" },
];
const num2 = (s: string) => Number(s.replace(",", "."));

/** As medidas ditas: "2 por 2,5" / "2x2.5" (pavimento), "paredes 18 m²", "pé direito 2,5", "3 pontos de água". */
export function medidasDoTexto(t: string, linha: Negocio["linha"]): Partial<Record<CampoMedida, number>> {
  const n = normal(t), m: Partial<Record<CampoMedida, number>> = {};
  const dims = /(\d+(?:[.,]\d+)?)\s*(?:m\s*)?(?:x|por)\s*(\d+(?:[.,]\d+)?)/.exec(n);
  const alt = /(?:pe direito|altura|alto)\D{0,12}(\d+(?:[.,]\d+)?)/.exec(n);
  // só medidas de divisão (em metros, até 15): "80x80" de uma base de duche não é o chão
  if (dims && [dims[1], dims[2]].every((x) => num2(x) >= 0.5 && num2(x) <= 15)) {
    const a = num2(dims[1]), b = num2(dims[2]);
    m.pav = Math.round(a * b * 100) / 100;
    if (alt) m.par = Math.round(2 * (a + b) * num2(alt[1]) * 0.9 * 100) / 100; // menos ~10% de porta e janela
  }
  const pav = /(\d+(?:[.,]\d+)?)\s*(?:m2|m²|metros quadrados)\s*(?:de\s*)?(?:chao|pavimento)|(?:chao|pavimento)\D{0,15}(\d+(?:[.,]\d+)?)\s*(?:m2|m²)/.exec(n);
  if (pav) m.pav = num2(pav[1] ?? pav[2]);
  const par = /(\d+(?:[.,]\d+)?)\s*(?:m2|m²)\s*(?:de\s*)?parede|parede?s?\D{0,15}(\d+(?:[.,]\d+)?)\s*(?:m2|m²)/.exec(n);
  if (par) m.par = num2(par[1] ?? par[2]);
  const pts = /(\d+)\s*pontos? de agua/.exec(n);
  if (pts) { m.ptf = Number(pts[1]); m.ptq = 0; }
  if (linha === "wc") { const pcs = /(\d+)\s*(?:loucas|pecas|vasos)/.exec(n); if (pcs) m.pcs = Number(pcs[1]); }
  return m;
}

/** Os serviços do Catálogo cujo nome curto está quase todo no texto ("demolição de parede", "teto falso"). */
export function servicosDoTexto(S: Estado, d: Negocio, t: string): SvcId[] {
  const n = " " + palavras(t).map(raiz).join(" ") + " ";
  const achados: { sid: SvcId; s: number; usos: number }[] = [];
  const ver = (sid: SvcId, nome: string, usos: number) => {
    const pal = palavras(nomeCurto(nome)).map(raiz).filter((w) => w.length > 3);
    if (!pal.length) return;
    const bate = pal.filter((w) => n.includes(" " + w)).length;
    if (bate >= Math.min(2, pal.length) && bate / pal.length >= 0.6) achados.push({ sid, s: bate / pal.length, usos });
  };
  for (const [sid] of LINHAS[d.linha].map) if (S.svc[sid]) ver(sid, S.svc[sid].n, 999);
  for (const c of CATALOGO_TODO) if (c.linhas.includes(d.linha) || !c.linhas.length) ver(c.id, c.n, c.usos);
  // um só por nome curto (o Catálogo tem variantes com o mesmo nome: "Teto falso em pladur" por m² e por unidade)
  const vistos = new Set<string>();
  return achados.sort((a, b) => b.s - a.s || b.usos - a.usos)
    .filter((x) => { const k = normal(nomeCurto(S.svc[x.sid]?.n ?? itemCatalogo(x.sid)?.n ?? x.sid)).replace(/\s*c\/.*$/, ""); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .slice(0, 6).map((x) => x.sid);
}

/** A resposta do modo de demonstração, com os mesmos blocos que a API devolveria (texto e tool_use). */
export function simular(S: Estado, K: Catalogo, d: Negocio, r: Rascunho, texto: string, nFotos: number): Bloco[] {
  // a escolha de um cartão ("Escolhido: Base de duche 80x80 (id)") não traz medidas nem serviços novos
  const escolha = /^escolhido:/i.test(texto.trim());
  const n = escolha ? "" : normal(texto);
  const blocos: Bloco[] = [];
  let i = 0;
  const usar = (name: string, input: unknown) => blocos.push({ type: "tool_use", id: `demo_${Date.now()}_${i++}`, name, input, caller: { type: "direct" } } as unknown as Bloco);
  const medidas = escolha ? {} : medidasDoTexto(texto, d.linha);
  const svcs = escolha ? [] : servicosDoTexto(S, d, texto).filter((sid) => !r.servicos[sid]);
  // quem tira algo de lá dentro: o levantamento de sanitários
  if (/(tirar|remover|retirar|arrancar|demolir|partir)/.test(n) && LINHAS[d.linha].map.some(([s]) => s === "demol") && !svcs.includes("demol")) svcs.unshift("demol");
  if (/(tirar|remover|retirar|arrancar)\b.*\b(banheira|sanita|bide|lavatorio)/.test(n) && itemCatalogo("c1") && !svcs.includes("c1")) svcs.push("c1");
  const pecas = PECAS.filter((p) => p.re.test(n));
  const linhaSvc = (sid: SvcId) => { const k = new Map(LINHAS[d.linha].map).get(sid); return { id: sid, quantidade: (k && (medidas[k] ?? d.visita.med[k])) || itemCatalogo(sid)?.qm || 1, motivo: "Do que disse" }; };
  const atual = { servicos: svcs.map(linhaSvc), produtos: [] as { id: string; quantidade: number; motivo: string }[],
    medidas: (Object.entries(medidas) as [string, number][]).map(([chave, valor]) => ({ chave, valor })), manter: [], notas: [] as string[] };
  const estilo = /(moderno|classico|rustico|minimalista|industrial|branco|cinza|preto|madeira)/.exec(n);
  if (estilo) atual.notas.push(`Estilo: ${estilo[1]}`);
  const mudou = atual.servicos.length + atual.medidas.length + atual.notas.length > 0;
  const partes: string[] = [];
  if (nFotos) partes.push(nFotos === 1 ? "Recebi a fotografia (no modo de demonstração não a consigo ver; diga-me o que mostra)." : `Recebi ${nFotos} fotografias (no modo de demonstração não as consigo ver; diga-me o que mostram).`);
  if (atual.servicos.length) partes.push(`Juntei ${atual.servicos.length === 1 ? "1 serviço" : atual.servicos.length + " serviços"} à proposta.`);
  if (atual.medidas.length) partes.push("Registei as medidas.");
  const peca = pecas.find((p) => !Object.keys(r.produtos).some((id) => procurarProdutos(K, p.procura, 30).some((x) => x.id === id)));
  if (mudou) usar("atualizar_levantamento", atual);
  if (peca) {
    const ps = procurarProdutos(K, peca.procura, 300);
    // opções diferentes: a mais barata, a do meio e a mais cara entre as que batem
    const ordem = [...ps].sort((a, b) => precoUnitario(a) - precoUnitario(b));
    const escolha = [...new Set([0, Math.floor(ordem.length / 3), Math.floor((2 * ordem.length) / 3), ordem.length - 1].filter((x) => x >= 0))].map((x) => ordem[x]).filter(Boolean);
    if (escolha.length) {
      partes.push(`${peca.pergunta} Deixei algumas opções para o cliente ver.`);
      usar("mostrar_produtos", { pergunta: peca.pergunta, para_servico: "", produtos: escolha.map((p) => p.id) });
    }
  } else if (!medidasCompletas(d, { ...r.medidas, ...medidas })) {
    partes.push("Quais são as medidas do espaço? Pode dizer, por exemplo, \"2 por 2,5 e pé direito de 2,4\".");
    usar("sugerir_respostas", { opcoes: ["2 por 2,5, pé direito 2,4", "3 pontos de água"] });
  } else if (!partes.length) {
    partes.push("Não encontrei isso no Catálogo. Pode dizer por outras palavras? (Com a IA ligada, percebo frases livres e fotografias.)");
  } else partes.push("Parece-me completo: pode validar.");
  blocos.unshift({ type: "text", text: partes.join(" "), citations: null } as unknown as Bloco);
  return blocos;
}

/** Se as medidas da linha estão todas (com o rascunho por cima da visita). */
export function medidasCompletas(d: Negocio, ras: Partial<Record<CampoMedida, number>>): boolean {
  const v = d.visita.med;
  return camposMedida(LINHAS[d.linha]).every(([k]) => {
    if (k === "ptq") return true;
    const x = ras[k] ?? (k === "ptf" ? v.ptf ?? v.pts : v[k]);
    return (x ?? 0) > 0;
  });
}
