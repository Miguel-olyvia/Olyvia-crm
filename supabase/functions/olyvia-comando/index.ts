// 17/11 (Rúben, depois de gravar um teste: «não segue bem as ordens, não preenche campos ou ajusta, nada»): quando as regras da
// Olyvia (src/emylia/comandoOlyvia.ts e preencherOlyvia.ts) não percebem uma frase, o browser manda-a para aqui com o que está no
// ecrã — as perguntas à vista (rótulo, tipo, respostas possíveis, valor atual) e a página — e o Gemini devolve as ações a fazer.
// O browser faz as ações (carregar nos botões, escrever, navegar); aqui não se lê nem se grava nada na base de dados.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";
import { getCorsHeaders } from "../_shared/cors.ts";
import { AuthError, resolveCallerIdentity, authErrorResponse } from "../_shared/auth.ts";
import { checkRateLimit, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { ErroGemini, gerarJson } from "../_shared/gemini.ts";

const RATE_LIMIT = { bucket: "olyvia-comando", maxAttempts: 40, windowMinutes: 1 };
// tem de responder num segundo ou dois: o modelo rápido
const MODELO = Deno.env.get("OLYVIA_COMANDO_MODELO") ?? "gemini-3.1-flash-lite";

const pedido = z.object({
  frase: z.string().min(1).max(600),
  pagina: z.string().max(300).default(""),
  campos: z.array(z.object({
    rotulo: z.string().min(1).max(200),
    tipo: z.enum(["opcoes", "contador", "texto"]),
    opcoes: z.array(z.string().max(120)).max(60).optional(),
    valor: z.string().max(300).optional(),
  })).max(120).default([]),
  passos: z.array(z.string().max(120)).max(40).default([]),
  destinos: z.array(z.string().max(60)).max(20).default([]),
});

const INSTRUCAO = `És a Olyvia, a assistente por voz de uma aplicação de gestão de obras de remodelação (português de Portugal).
O utilizador disse uma frase (vem do reconhecimento de voz: pode ter palavras mal ouvidas). Recebes o que está no ecrã: as perguntas
à vista, numeradas, com o tipo e as respostas possíveis; os passos do negócio aberto; e as páginas para onde se pode ir.
Devolve as ações que cumprem a frase, pela ordem:
- "opcao": escolher a resposta 'opcao' (o número da resposta, a contar de 0) da pergunta 'campo'.
- "contador": pôr o número 'n' na pergunta 'campo' (contadores: andares, quantidades).
- "texto": escrever 'texto' na pergunta 'campo'.
- "navegar": ir à página 'texto' (exatamente um dos nomes das páginas).
- "passo": ir ao passo 'texto' (exatamente um dos nomes dos passos), ou "fim", "proximo", "anterior".
- "scroll": 'texto' = "baixo", "cima", "topo" ou "fundo".
- "pesquisar": procurar 'texto' (um nome de cliente, um telefone).
- "limpar": limpar a pesquisa.
- "abrir_negocio": abrir o negócio do cliente 'texto'.
Regras: só usas perguntas, respostas, passos e páginas que existem na lista. Interpreta o sentido: «o cliente não tem carro» não é
uma resposta ao estacionamento; «dá para estacionar à porta sem pagar» é «Não pago»; «três pisos» é o contador dos andares.
Se a frase não pede nada que dê para fazer aqui, devolve as ações vazias. Em 'resposta', diz em poucas palavras o que fizeste
(ex.: «Acesso fácil e estacionamento pago.») ou, sem ações, porque não deu (ex.: «Não há essa pergunta neste passo.»).`;

const ESQUEMA = {
  type: "OBJECT",
  properties: {
    acoes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          tipo: { type: "STRING", enum: ["opcao", "contador", "texto", "navegar", "passo", "scroll", "pesquisar", "limpar", "abrir_negocio"] },
          campo: { type: "INTEGER", nullable: true },
          opcao: { type: "INTEGER", nullable: true },
          n: { type: "NUMBER", nullable: true },
          texto: { type: "STRING", nullable: true },
        },
        required: ["tipo"],
      },
    },
    resposta: { type: "STRING" },
  },
  required: ["acoes", "resposta"],
};

type AcaoIa = { tipo: string; campo?: number | null; opcao?: number | null; n?: number | null; texto?: string | null };

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
    const { frase, pagina, campos, passos, destinos } = parsed.data;

    const limite = await checkRateLimit(supabaseAdmin, { ...RATE_LIMIT, identifier: caller.anewUserId });
    if (!limite.allowed) return rateLimitResponse(limite, corsHeaders);
    await recordRateLimitAttempt(supabaseAdmin, RATE_LIMIT.bucket, caller.anewUserId);

    const ecra = [
      `Página: ${pagina || "(sem nome)"}`,
      campos.length ? "Perguntas à vista:\n" + campos.map((c, i) =>
        `[${i}] ${c.rotulo} (${c.tipo})` + (c.opcoes?.length ? ` — respostas: ${c.opcoes.map((o, k) => `${k}=${o}`).join("; ")}` : "")
        + (c.valor ? ` — agora: ${c.valor}` : "")).join("\n") : "Sem perguntas à vista.",
      passos.length ? `Passos do negócio aberto: ${passos.join("; ")}` : "",
      destinos.length ? `Páginas: ${destinos.join("; ")}` : "",
      `Frase: «${frase}»`,
    ].filter(Boolean).join("\n\n");

    try {
      const r = await gerarJson<{ acoes: AcaoIa[]; resposta: string }>({ modelo: MODELO, partes: [{ text: ecra }], esquema: ESQUEMA, instrucaoSistema: INSTRUCAO });
      // só o que existe no ecrã: um índice fora da lista ou uma página inventada não passa
      const acoes = (r.acoes ?? []).filter((a) => {
        if (a.tipo === "opcao") return a.campo != null && campos[a.campo]?.tipo === "opcoes" && a.opcao != null && a.opcao >= 0 && a.opcao < (campos[a.campo].opcoes?.length ?? 0);
        if (a.tipo === "contador") return a.campo != null && campos[a.campo]?.tipo === "contador" && typeof a.n === "number";
        if (a.tipo === "texto") return a.campo != null && campos[a.campo]?.tipo === "texto" && !!a.texto;
        if (a.tipo === "navegar") return !!a.texto && destinos.includes(a.texto);
        if (a.tipo === "scroll") return ["baixo", "cima", "topo", "fundo"].includes(a.texto ?? "");
        if (a.tipo === "limpar") return true;
        return !!a.texto;
      });
      return json({ acoes, resposta: r.resposta ?? "", motor: `gemini:${MODELO}` });
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
