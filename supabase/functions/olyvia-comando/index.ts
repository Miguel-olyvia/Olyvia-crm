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
});

const INSTRUCAO = `És a Olyvia, a assistente por voz de uma aplicação de gestão de obras de remodelação (português de Portugal).
Quem usa a app fala contigo para fazer QUALQUER coisa no ecrã: ir a páginas, abrir negócios, carregar em botões, escrever, preencher,
escolher, mudar de separador, perguntar o que se vê. A frase vem do reconhecimento de voz: pode ter palavras mal ouvidas, repetições e
hesitações («hum», «tipo», «ok então»). Percebe o SENTIDO, como uma pessoa perceberia.

Recebes o ecrã atual:
- a página (o endereço) e o texto que se lê nela (pode vir cortado);
- os elementos que se podem tocar, numerados [n]: o tipo (botao, ligacao, separador, caixa, lista, interruptor), o texto, o valor ou o
  estado, e a zona onde estão (a janela aberta, a linha da lista, a secção). «fora de vista» = existe mais abaixo, mas carregar funciona;
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

Regras:
1. Só usas elementos, perguntas, passos e páginas que estão nas listas, pelos números dados. Nunca inventes números nem nomes.
2. O caminho mais direto: se o que se pede está num botão, ligação ou separador à vista, carrega nele. Para responder a uma pergunta do
   formulário usa "opcao"/"contador"/"texto", não "clicar".
3. Pedidos de vários passos («abre o negócio do Carlos e vai à proposta», «muda o prazo para 3 semanas e guarda»): faz SÓ o que dá para
   fazer com este ecrã e põe "continuar": true; recebes o ecrã novo e o que já fizeste, e segues. Quando o pedido estiver cumprido (ou
   não houver mais nada a fazer), "continuar": false. Não repitas o que já está feito. Depois de abrir uma janela ou um menu, continua
   (a opção que se quer aparece no ecrã seguinte).
4. O que não se desfaz (enviar, apagar, assinar, aceitar, pagar, registar, emitir, cancelar, concluir) só se a pessoa o pedir claramente;
   a app confirma com ela antes. Nunca o faças por tua iniciativa.
5. Perguntas («quanto custa a proposta?», «o que falta aqui?», «quem é o técnico?»): responde em 'resposta' com o que está no ecrã, sem
   ações. Se não estiver neste ecrã mas souberes onde está, vai lá ("continuar": true) e responde no ecrã seguinte.
6. Ambíguo (dois clientes parecidos, dois botões iguais em zonas diferentes que podem ser): pergunta em 'resposta' qual, sem ações.
7. Interpreta o sentido nas perguntas do formulário: «o cliente não tem carro» não responde ao estacionamento; «dá para estacionar à
   porta sem pagar» é «Não pago»; «três pisos» é o contador dos andares.
8. Se a frase não é para ti (a pessoa está a falar com outra pessoa, ou é conversa solta), devolve as ações vazias e a 'resposta' vazia.
9. 'resposta' é DITA EM VOZ ALTA: curta e natural (uma frase, no máximo duas), sem listas, sem símbolos, sem números de elementos.
   Com ações, diz o que fizeste («Abri a proposta do Carlos Mendes.»). Num passo intermédio (continuar), 'resposta' pode ficar vazia.`;

const ESQUEMA = {
  type: "OBJECT",
  properties: {
    acoes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          tipo: { type: "STRING", enum: ["clicar", "escrever", "escolher", "opcao", "contador", "texto", "navegar", "passo", "scroll", "pesquisar", "limpar", "abrir_negocio", "voltar"] },
          elemento: { type: "INTEGER", nullable: true },
          campo: { type: "INTEGER", nullable: true },
          opcao: { type: "INTEGER", nullable: true },
          n: { type: "NUMBER", nullable: true },
          texto: { type: "STRING", nullable: true },
          fase: { type: "STRING", nullable: true },
        },
        required: ["tipo"],
      },
    },
    resposta: { type: "STRING" },
    continuar: { type: "BOOLEAN" },
  },
  required: ["acoes", "resposta", "continuar"],
};

type AcaoIa = { tipo: string; elemento?: number | null; campo?: number | null; opcao?: number | null; n?: number | null; texto?: string | null; fase?: string | null };
type Pedido = z.infer<typeof pedido>;

/** O ecrã escrito para o modelo. */
export function ecraParaTexto(p: Pedido): string {
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
    `Frase: «${p.frase}»`,
  ].filter(Boolean).join("\n\n");
}

/** Só passa o que existe no ecrã: um número fora da lista ou uma página inventada não chega ao browser. */
export function acoesValidas(acoes: AcaoIa[], p: Pedido): AcaoIa[] {
  const { campos, elementos, destinos } = p;
  return (acoes ?? []).filter((a) => {
    const el = a.elemento != null ? elementos[a.elemento] : undefined;
    if (a.tipo === "clicar") return !!el;
    if (a.tipo === "escrever") return !!el && el.tipo === "caixa" && a.texto != null;
    if (a.tipo === "escolher") return !!el && el.tipo === "lista" && !!a.texto;
    if (a.tipo === "opcao") return a.campo != null && campos[a.campo]?.tipo === "opcoes" && a.opcao != null && a.opcao >= 0 && a.opcao < (campos[a.campo].opcoes?.length ?? 0);
    if (a.tipo === "contador") return a.campo != null && campos[a.campo]?.tipo === "contador" && typeof a.n === "number";
    if (a.tipo === "texto") return a.campo != null && campos[a.campo]?.tipo === "texto" && !!a.texto;
    if (a.tipo === "navegar") return !!a.texto && destinos.includes(a.texto);
    if (a.tipo === "scroll") return ["baixo", "cima", "topo", "fundo"].includes(a.texto ?? "");
    if (a.tipo === "limpar" || a.tipo === "voltar") return true;
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
      const r = await gerarJson<{ acoes: AcaoIa[]; resposta: string; continuar?: boolean }>({ modelo: MODELO, partes: [{ text: ecraParaTexto(p) }], esquema: ESQUEMA, instrucaoSistema: INSTRUCAO });
      const acoes = acoesValidas(r.acoes, p);
      return json({ acoes, resposta: r.resposta ?? "", continuar: !!r.continuar && acoes.length > 0, motor: `gemini:${MODELO}` });
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
