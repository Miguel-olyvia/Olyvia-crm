// 17/11 (Rúben, depois de gravar um teste: «não segue bem as ordens, não preenche campos ou ajusta, nada»): quando as regras da
// Olyvia (src/emylia/comandoOlyvia.ts e preencherOlyvia.ts) não percebem uma frase, o browser manda-a para aqui com o que está no
// ecrã — as perguntas à vista (rótulo, tipo, respostas possíveis, valor atual) e a página — e o Gemini devolve as ações a fazer.
// O browser faz as ações (carregar nos botões, escrever, navegar); aqui não se lê nem se grava nada na base de dados.
//
// 18/11 (Rúben: «precisamos que entenda linguagem natural… quero controlar tudo por voz»): a IA vê o ECRÃ INTEIRO — todos os elementos
// que se podem tocar, numerados, com a zona onde estão (src/emylia/ecraOlyvia.ts), e o texto da página — e trabalha em vários passos
// («abre o negócio do Carlos e vai à proposta»: faz o que dá com este ecrã, diz `continuar`, recebe o ecrã novo e o que já fez, e segue).
// Responde a perguntas sobre o que se vê e lembra-se da conversa. O que não se desfaz, o browser confirma com a pessoa antes de fazer.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";
import { getCorsHeaders } from "../_shared/cors.ts";
import { AuthError, resolveCallerIdentity, authErrorResponse } from "../_shared/auth.ts";
import { checkRateLimit, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { ErroGemini, gerarJson } from "../_shared/gemini.ts";

// 18/11: um pedido de vários passos faz várias chamadas (uma por ecrã)
const RATE_LIMIT = { bucket: "olyvia-comando", maxAttempts: 120, windowMinutes: 1 };
// tem de responder num segundo ou dois: o modelo rápido
const MODELO = Deno.env.get("OLYVIA_COMANDO_MODELO") ?? "gemini-3.1-flash-lite";

const pedido = z.object({
  frase: z.string().min(1).max(1500),
  pagina: z.string().max(300).default(""),
  campos: z.array(z.object({
    rotulo: z.string().min(1).max(200),
    tipo: z.enum(["opcoes", "contador", "texto"]),
    opcoes: z.array(z.string().max(120)).max(60).optional(),
    valor: z.string().max(300).optional(),
  })).max(120).default([]),
  passos: z.array(z.string().max(120)).max(40).default([]),
  destinos: z.array(z.string().max(60)).max(20).default([]),
  // 18/11: o ecrã inteiro, a conversa e o que já se fez neste pedido
  elementos: z.array(z.object({
    tipo: z.string().max(20),
    texto: z.string().max(160),
    valor: z.string().max(200).optional(),
    opcoes: z.array(z.string().max(100)).max(40).optional(),
    estado: z.string().max(60).optional(),
    zona: z.string().max(140).optional(),
    fora: z.boolean().optional(),
  })).max(260).default([]),
  textoPagina: z.string().max(8000).default(""),
  conversa: z.array(z.object({ eu: z.string().max(1500), olyvia: z.string().max(600) })).max(8).default([]),
  feito: z.array(z.string().max(240)).max(40).default([]),
  hoje: z.string().max(60).default(""),
  // 26/11 (plano «Obra Viva», etapa 6: falar com a obra): o que os agentes veem em cada obra em curso ou aprovada, e o que fizeram hoje
  obras: z.array(z.object({
    id: z.number().int(),
    nome: z.string().max(80),
    estado: z.string().max(30),
    fim: z.string().max(60).nullable().optional(),
    propostas: z.array(z.object({
      ref: z.string().max(120), agente: z.string().max(30), titulo: z.string().max(200), sub: z.string().max(300),
      modo: z.enum(["ver", "pede", "prazo", "ja"]), aceitar: z.boolean(),
    })).max(12).default([]),
    feitos: z.array(z.object({ ref: z.string().max(120), texto: z.string().max(200), quem: z.string().max(80), quando: z.string().max(10) })).max(8).default([]),
  })).max(30).default([]),
  // 26/11 (base de conhecimento): a organização ativa, para ler a base quando a página não tem as obras (qualquer página)
  org: z.string().uuid().nullable().optional(),
});

const INSTRUCAO = `És a Olyvia, a assistente por voz de uma aplicação de gestão de obras de remodelação (português de Portugal).
Quem usa a app fala contigo para fazer QUALQUER coisa no ecrã: ir a páginas, abrir negócios, carregar em botões, escrever, preencher,
escolher, mudar de separador, perguntar o que se vê. A frase vem do reconhecimento de voz: pode ter palavras mal ouvidas, repetições e
hesitações («hum», «tipo», «ok então»). Percebe o SENTIDO, como uma pessoa perceberia.

Recebes o ecrã atual:
- a página (o endereço) e o texto que se lê nela (pode vir cortado);
- os elementos que se podem tocar, numerados [n]: o tipo (botao, ligacao, separador, caixa, lista, interruptor), o texto, o valor ou o
  estado, e a zona onde estão (a janela aberta, a linha da lista, a secção). «fora de vista» = existe mais abaixo, mas carregar funciona;
  «inativo» = ainda não se pode carregar: falta escrever ou escolher alguma coisa antes (ex.: o «Enviar» acende depois de escrever a
  mensagem; escreve e põe "continuar": true, e carrega no ecrã seguinte);
- as perguntas do formulário, numeradas à parte {n}, com as respostas possíveis;
- os passos do negócio aberto e as páginas principais da app;
- a conversa até aqui (para perceberes «e o outro?», «abre esse», «volta a pôr como estava») e o que já fizeste neste pedido.

Ações, pela ordem em que se fazem:
- "clicar": carregar no elemento 'elemento' (o número [n]).
- "escrever": escrever 'texto' na caixa 'elemento' (substitui o que lá está).
- "escolher": escolher a opção 'texto' na lista 'elemento' (com opções dadas; uma lista sem opções abre-se com "clicar").
- "opcao": responder à pergunta 'campo' {n} com a resposta número 'opcao' (a contar de 0).
- "contador": pôr o número 'n' na pergunta 'campo' (contadores: andares, quantidades).
- "texto": escrever 'texto' na pergunta 'campo'.
- "navegar": ir à página principal 'texto' (exatamente um dos nomes das páginas).
- "passo": ir ao passo 'texto' do negócio aberto (exatamente um dos nomes, ou "fim", "proximo", "anterior").
- "abrir_negocio": abrir o negócio do cliente 'texto'; se a pessoa disser a fase, 'fase' = Contacto, Visita, Negócio, Financeiro ou Obra.
- "pesquisar": procurar 'texto' (um nome, um telefone) na pesquisa da página. "limpar": limpar a pesquisa.
- "scroll": 'texto' = "baixo", "cima", "topo" ou "fundo".
- "voltar": a página anterior.
- "abrir_obra": abrir o Estúdio da obra número 'texto' (o número do negócio, das «Obras e agentes»).
- "decidir": decidir uma proposta dos agentes: 'texto' = a referência exata (ref) e 'op' = "aceitar", "recusar" ou "desfazer"
  (desfazer leva a ref de uma coisa que os agentes fizeram hoje).

Regras:
1. Só usas elementos, perguntas, passos e páginas que estão nas listas, pelos números dados. Nunca inventes números nem nomes.
2. O caminho mais direto: se o que se pede está num botão, ligação ou separador à vista, carrega nele. Para responder a uma pergunta do
   formulário usa "opcao"/"contador"/"texto", não "clicar".
3. Pedidos de vários passos («abre o negócio do Carlos e vai à proposta», «muda o prazo para 3 semanas e guarda»): faz SÓ o que dá para
   fazer com este ecrã e põe "continuar": true; recebes o ecrã novo e o que já fizeste, e segues. Quando o pedido estiver cumprido (ou
   não houver mais nada a fazer), "continuar": false. Não repitas o que já está feito. Depois de abrir uma janela ou um menu, continua
   (a opção que se quer aparece no ecrã seguinte).
4. O que não se desfaz (enviar, apagar, assinar, aceitar, pagar, registar, emitir, cancelar, concluir, arrancar a obra) só se a pessoa
   o pedir claramente («manda», «envia», «apaga» são pedidos claros: faz até ao fim); a app confirma com ela antes de carregar. Nunca o
   faças por tua iniciativa.
5. Perguntas («quanto custa a proposta?», «o que falta aqui?», «quem é o técnico?»): responde em 'resposta' com o que está no ecrã, sem
   ações. Se não estiver neste ecrã mas souberes onde está, vai lá ("continuar": true) e responde no ecrã seguinte.
6. Ambíguo (dois clientes parecidos, dois botões iguais em zonas diferentes que podem ser): pergunta em 'resposta' qual, sem ações.
7. Interpreta o sentido nas perguntas do formulário: «o cliente não tem carro» não responde ao estacionamento; «dá para estacionar à
   porta sem pagar» é «Não pago»; «três pisos» é o contador dos andares.
8. Se a frase não é para ti (a pessoa está a falar com outra pessoa, ou é conversa solta), devolve as ações vazias e a 'resposta' vazia.
9. 'resposta' é DITA EM VOZ ALTA: curta e natural (uma frase, no máximo duas), sem listas, sem símbolos, sem números de elementos.
   Com ações, diz o que fizeste («Abri a proposta do Carlos Mendes.»). Num passo intermédio (continuar), 'resposta' pode ficar vazia.
10. Ir a uma página já cumpre os pedidos de «ver», «mostrar», «abrir» essa página: «quero ver as obras a decorrer» é navegar a Operações
   com "continuar": false. Nunca andes de página em página à procura de alguma coisa, e nunca voltes a fazer o que já está em «já fiz».
   Se o ecrã diz «Sem permissão», está vazio ou não tem o que se pede, pára ("continuar": false) e diz isso em 'resposta'.
11. «Abre o negócio X» é "abrir_negocio" (com 'fase' se a disser), mesmo que se veja um cartão da obra com o mesmo nome: a obra e o
   negócio são páginas diferentes, e os passos (Proposta, Contrato, …) só existem dentro do negócio. "passo" só com passos na lista.
   Em 'resposta' nunca digas que fizeste o que ainda não está feito: num passo intermédio deixa-a vazia.
12. Os passos da lista são só os da FASE aberta do negócio. Um passo de outra fase (por exemplo, a Proposta é da fase Negócio)
   pode pedir-se na mesma com "passo" (a app muda de fase sozinha).
13. «Obras e agentes» é o que os agentes da Olyvia veem em cada obra (Plano, Equipa, Materiais, Cliente, Margem, Aprendizagem): as
   propostas (com o modo: «pede» espera decisão, «prazo» aplica-se sozinha ao fim do dia se ninguém recusar, «ja» aplica-se já, «ver» só
   observa) e o que fizeram hoje. Perguntas sobre uma obra («o que se passa na 1048?», «como vai a obra do Tiago?»): responde com o que
   pede decisão primeiro e o que os agentes fizeram hoje, e abre a obra ("abrir_obra") se não está aberta. A obra diz-se pelo número
   ou pelo nome do cliente.
14. «Resumo do dia», «como estão as obras», «o que há para decidir»: responde com as obras que pedem decisões (quantas e a mais
   importante de cada), o que os agentes fizeram hoje e as obras sem nada. Aqui a 'resposta' pode ter até quatro frases. Sem ações.
   O que os agentes fizeram hoje é só o que vem como «feito»; sem nenhum, diz que hoje ainda não fizeram nada sozinhos. Nunca inventes.
15. Decisões por voz («aceita a do Luís», «sim, aplica essa», «recusa a da folga», «desfaz o que o agente fez na 1048»): "decidir" com
   a ref da proposta de que se fala (pela conversa, pelo nome do técnico, da tarefa ou do agente). "aceitar" só nas propostas com
   «aceitar: sim»; nas outras, diz que essa se decide no cartão e abre a obra. Ambíguo entre duas propostas: pergunta qual. Em 'resposta'
   diz o que vais fazer numa frase («Aceito: passar a Eletricidade para o Luís.»); a app diz se não deu.
16. Sem «Obras e agentes» nem «Base de conhecimento» e a pessoa pergunta pelas obras ou quer decidir: "navegar" para Operações com
   "continuar": true.
17. «Base de conhecimento» é o que a Olyvia sabe da empresa em qualquer página: o guia de como a plataforma funciona, o resumo do dia
   das obras, os negócios e as obras (atualizada de minutos a minutos; diz a hora). Responde por ela a perguntas sobre negócios, obras,
   agentes e como se faz alguma coisa, mesmo que não estejam no ecrã. Para decidir uma proposta fora das Operações, "abrir_obra" com
   "continuar": true (decides no ecrã seguinte, com as «Obras e agentes»). Nunca inventes o que a base não diz.`;

const ESQUEMA = {
  type: "OBJECT",
  properties: {
    acoes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          tipo: { type: "STRING", enum: ["clicar", "escrever", "escolher", "opcao", "contador", "texto", "navegar", "passo", "scroll", "pesquisar", "limpar", "abrir_negocio", "voltar", "abrir_obra", "decidir"] },
          elemento: { type: "INTEGER", nullable: true },
          campo: { type: "INTEGER", nullable: true },
          opcao: { type: "INTEGER", nullable: true },
          n: { type: "NUMBER", nullable: true },
          texto: { type: "STRING", nullable: true },
          fase: { type: "STRING", nullable: true },
          op: { type: "STRING", nullable: true },
        },
        required: ["tipo"],
      },
    },
    resposta: { type: "STRING" },
    continuar: { type: "BOOLEAN" },
  },
  required: ["acoes", "resposta", "continuar"],
};

type AcaoIa = { tipo: string; elemento?: number | null; campo?: number | null; opcao?: number | null; n?: number | null; texto?: string | null; fase?: string | null; op?: string | null };
type Pedido = z.infer<typeof pedido>;

/** O ecrã escrito para o modelo. */
export function ecraParaTexto(p: Pedido, conhecimento: Conhecimento | null = null): string {
  const el = p.elementos.map((e, i) => {
    const extra = [
      e.valor ? `valor: ${e.valor}` : "",
      e.opcoes?.length ? `opções: ${e.opcoes.join(" | ")}` : "",
      e.estado ? e.estado : "",
      e.zona ? `em: ${e.zona}` : "",
      e.fora ? "fora de vista" : "",
    ].filter(Boolean).join(" — ");
    return `[${i}] ${e.tipo} «${e.texto}»${extra ? ` — ${extra}` : ""}`;
  });
  const campos = p.campos.map((c, i) =>
    `{${i}} ${c.rotulo} (${c.tipo})` + (c.opcoes?.length ? ` — respostas: ${c.opcoes.map((o, k) => `${k}=${o}`).join("; ")}` : "")
    + (c.valor ? ` — agora: ${c.valor}` : ""));
  return [
    `Página: ${p.pagina || "(sem nome)"}${p.hoje ? ` · hoje: ${p.hoje}` : ""}`,
    p.textoPagina ? `Texto da página:\n${p.textoPagina}` : "",
    el.length ? `Elementos:\n${el.join("\n")}` : "Sem elementos à vista.",
    campos.length ? `Perguntas do formulário:\n${campos.join("\n")}` : "",
    p.passos.length ? `Passos do negócio aberto: ${p.passos.join("; ")}` : "",
    p.destinos.length ? `Páginas principais: ${p.destinos.join("; ")}` : "",
    p.conversa.length ? `Conversa até aqui:\n${p.conversa.map((c) => `- Pessoa: ${c.eu}\n  Olyvia: ${c.olyvia || "(fez sem dizer nada)"}`).join("\n")}` : "",
    p.feito.length ? `Já fizeste neste pedido:\n${p.feito.map((f) => `- ${f}`).join("\n")}` : "",
    p.obras.length ? `Obras e agentes:\n${p.obras.map(obraParaTexto).join("\n")}` : "",
    conhecimento ? `Base de conhecimento${conhecimento.hora ? ` (atualizada às ${conhecimento.hora})` : ""}:\n${conhecimento.texto}` : "",
    `Frase: «${p.frase}»`,
  ].filter(Boolean).join("\n\n");
}

/** 26/11 (base de conhecimento): o que a Olyvia sabe da empresa (tabela olyvia_conhecimento, com a RLS de quem pergunta). */
export interface Conhecimento { texto: string; hora: string | null; obras: number[] }
type LinhaConhecimento = { tipo: string; numero: number | null; titulo: string; texto: string; atualizado_em: string };
/** As palavras da frase que servem para procurar negócios (nomes, números). */
export function palavrasDaProcura(frase: string): string[] {
  // 26/11 (teste ao vivo): sem tirar os acentos (os nomes na base têm-nos: «goncalves» não encontrava «Gonçalves»)
  return [...new Set(frase.toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 || /^\d{3,}$/.test(w)))].slice(0, 6);
}
export function conhecimentoParaTexto(L: LinhaConhecimento[]): Conhecimento | null {
  if (!L.length) return null;
  const ordem: Record<string, number> = { resumo: 0, obra: 1, negocio: 2, orcamento: 3, custos: 4, guia: 5 };
  const s = [...L].sort((a, b) => (ordem[a.tipo] ?? 9) - (ordem[b.tipo] ?? 9));
  const recente = s.map((x) => x.atualizado_em).filter((x) => x).sort().pop() ?? null;
  const hora = recente ? new Date(recente).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" }) : null;
  return { texto: s.map((x) => `- [${x.tipo}] ${x.titulo}: ${x.texto}`).join("\n").slice(0, 14000), hora, obras: s.filter((x) => x.tipo === "obra" && x.numero != null).map((x) => x.numero!) };
}
async function lerConhecimento(sb: ReturnType<typeof createClient>, org: string, frase: string): Promise<Conhecimento | null> {
  const base = sb.from("olyvia_conhecimento").select("tipo, numero, titulo, texto, atualizado_em").eq("organization_id", org);
  const { data: fixos } = await base.in("tipo", ["resumo", "obra", "guia"]).limit(60);
  const palavras = palavrasDaProcura(frase);
  let negocios: LinhaConhecimento[] = [];
  if (palavras.length) {
    const ou = palavras.map((w) => `titulo.ilike.%${w}%`).join(",");
    // 26/11: também o orçamento ao detalhe e os custos do negócio de que se fala (a RLS só dá os custos a quem os vê)
    const { data } = await sb.from("olyvia_conhecimento").select("tipo, numero, titulo, texto, atualizado_em").eq("organization_id", org).in("tipo", ["negocio", "orcamento", "custos"]).or(ou).limit(18);
    negocios = (data ?? []) as LinhaConhecimento[];
  }
  return conhecimentoParaTexto([...((fixos ?? []) as LinhaConhecimento[]), ...negocios]);
}

/** 26/11 (etapa 6): uma obra e o que os agentes veem nela, para o modelo. */
export function obraParaTexto(o: Pedido["obras"][number]): string {
  const P = o.propostas.map((x) => `  - [${x.ref}] ${x.agente}, ${x.modo}${x.aceitar ? ", aceitar: sim" : ""}: ${x.titulo}${x.sub ? `. ${x.sub}` : ""}`);
  const F = o.feitos.map((x) => `  - feito [${x.ref}] ${x.quando}, ${x.quem}: ${x.texto}`);
  return [`Obra ${o.id} · ${o.nome} · ${o.estado}${o.fim ? ` · acaba a ${o.fim}` : ""}${P.length || F.length ? "" : " · nada a decidir"}`, ...P, ...F].join("\n");
}

/** Só passa o que existe no ecrã: um número fora da lista ou uma página inventada não chega ao browser. */
/** Escreveu numa caixa que tem, na mesma zona, um botão ainda inativo (o «Enviar» da conversa). */
export function esperaBotao(acoes: AcaoIa[], p: Pedido): boolean {
  return acoes.some((a) => {
    if (a.tipo !== "escrever" || a.elemento == null) return false;
    const zona = p.elementos[a.elemento]?.zona;
    return !!zona && p.elementos.some((e) => e.tipo === "botao" && e.zona === zona && (e.estado ?? "").includes("inativo"));
  });
}

export function acoesValidas(acoes: AcaoIa[], p: Pedido, conhecimento: Conhecimento | null = null): AcaoIa[] {
  const { campos, elementos, destinos } = p;
  return (acoes ?? []).filter((a) => {
    const el = a.elemento != null ? elementos[a.elemento] : undefined;
    if (a.tipo === "clicar") return !!el && !(el.estado ?? "").includes("inativo");
    if (a.tipo === "escrever") return !!el && el.tipo === "caixa" && a.texto != null;
    if (a.tipo === "escolher") return !!el && el.tipo === "lista" && !!a.texto;
    if (a.tipo === "opcao") return a.campo != null && campos[a.campo]?.tipo === "opcoes" && a.opcao != null && a.opcao >= 0 && a.opcao < (campos[a.campo].opcoes?.length ?? 0);
    if (a.tipo === "contador") return a.campo != null && campos[a.campo]?.tipo === "contador" && typeof a.n === "number";
    if (a.tipo === "texto") return a.campo != null && campos[a.campo]?.tipo === "texto" && !!a.texto;
    if (a.tipo === "navegar") return !!a.texto && destinos.includes(a.texto);
    if (a.tipo === "scroll") return ["baixo", "cima", "topo", "fundo"].includes(a.texto ?? "");
    if (a.tipo === "limpar" || a.tipo === "voltar") return true;
    // os passos só existem com um negócio aberto (18/11: na página da obra pedia «Proposta» e não acontecia nada); um passo de outra
    // fase vale (a app procura a fase que o tem)
    if (a.tipo === "passo") return (p.passos ?? []).length > 0 && !!a.texto;
    // 26/11 (etapa 6): só obras e propostas que vieram no pedido; aceitar só o que se pode aceitar
    if (a.tipo === "abrir_obra") return p.obras.some((o) => String(o.id) === String(a.texto ?? "").trim()) || !!conhecimento?.obras.some((n) => String(n) === String(a.texto ?? "").trim());
    if (a.tipo === "decidir") {
      const ref = a.texto ?? "";
      if (a.op === "desfazer") return p.obras.some((o) => o.feitos.some((f) => f.ref === ref));
      const x = p.obras.flatMap((o) => o.propostas).find((y) => y.ref === ref);
      return !!x && (a.op === "recusar" || (a.op === "aceitar" && x.aceitar));
    }
    return !!a.texto;
  });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const caller = await resolveCallerIdentity(req, supabase);
    const parsed = pedido.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Pedido inválido", details: parsed.error.issues }, 400);
    const p = parsed.data;

    const limite = await checkRateLimit(supabaseAdmin, { ...RATE_LIMIT, identifier: caller.anewUserId });
    if (!limite.allowed) return rateLimitResponse(limite, corsHeaders);
    await recordRateLimitAttempt(supabaseAdmin, RATE_LIMIT.bucket, caller.anewUserId);

    try {
      // 26/11: sem as obras da página (outra página), a base de conhecimento da organização (a RLS de quem pergunta)
      let conhecimento: Conhecimento | null = null;
      if (!p.obras.length && p.org) { try { conhecimento = await lerConhecimento(supabase, p.org, p.frase); } catch (e) { console.warn("olyvia-comando: base de conhecimento", e); } }
      const r = await gerarJson<{ acoes: AcaoIa[]; resposta: string; continuar?: boolean }>({ modelo: MODELO, partes: [{ text: ecraParaTexto(p, conhecimento) }], esquema: ESQUEMA, instrucaoSistema: INSTRUCAO });
      const acoes = acoesValidas(r.acoes, p, conhecimento);
      // se nada do que a IA quis fazer é possível, não se diz que se fez
      let resposta = (r.acoes ?? []).length > 0 && acoes.length === 0 ? "Isso não consigo fazer a partir deste ecrã." : r.resposta ?? "";
      let continuar = !!r.continuar && acoes.length > 0;
      // 18/11 (testarh): escreveu a mensagem e disse «Enviei» sem carregar. Se ao lado da caixa há um botão que só acende depois de
      // escrever, segue-se sempre para o ecrã seguinte (aí a IA carrega, ou pára se só se pediu para escrever), e não se diz que se fez.
      if (!continuar && esperaBotao(acoes, p)) { continuar = true; resposta = ""; }
      return json({ acoes, resposta, continuar, motor: `gemini:${MODELO}` });
    } catch (e) {
      if (e instanceof ErroGemini && (e.status === 429 || e.status >= 500)) return json({ error: "Gemini indisponível", retry: true }, 503);
      throw e;
    }
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error, corsHeaders);
    console.error("olyvia-comando", error);
    return json({ error: error instanceof Error ? error.message : "Erro" }, 500);
  }
});
