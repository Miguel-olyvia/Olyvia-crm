// 5/11 (Rúben, a visita real: «ler a foto da folha»). A comercial fotografa a folha em papel da visita (o croqui da divisão com as paredes
// em cm e uma caixa por peça: base, coluna, resguardo, revestimento, pavimento, torneiras, móvel, espelho, sanita, opções, extras). O
// Gemini lê a foto e devolve, como chamada-campos, por campo o valor, a confiança e o que está escrito; mais a planta (as paredes à volta,
// por ordem, com o comprimento e a viragem, e as peças desenhadas) e um resumo. Nada se grava aqui: a comercial confirma no painel.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";
import { getCorsHeaders } from "../_shared/cors.ts";
import { AuthError, resolveCallerIdentity, authErrorResponse } from "../_shared/auth.ts";
import { checkRateLimit, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { ErroGemini, gerarJson } from "../_shared/gemini.ts";

const RATE_LIMIT = { bucket: "visita-folha", maxAttempts: 20, windowMinutes: 1 };
const MODELO = Deno.env.get("VISITA_FOLHA_GEMINI_MODELO") ?? "gemini-3.8-flash";
const MAX_B64 = 8_000_000; // uma foto de telemóvel reduzida a 2000 px fica muito abaixo

const campoDef = z.object({
  k: z.string().min(1).max(60),
  l: z.string().min(1).max(200),
  t: z.enum(["sim_nao", "escolha", "varios", "numero", "contador", "texto", "texto_longo", "data"]),
  op: z.array(z.string().max(120)).max(400).optional(),
  ajuda: z.string().max(400).optional(),
  un: z.string().max(20).optional(),
  bloco: z.string().max(120).optional(),
});
const pedido = z.object({
  imagem_b64: z.string().min(100).max(MAX_B64),
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
  campos: z.array(campoDef).min(1).max(200),
  divisao: z.string().max(60).optional(),
});

const INSTRUCAO = `És um assistente de uma empresa de remodelações em Portugal. Recebes a fotografia de uma folha em papel que o comercial
preenche à mão numa visita a casa do cliente (pode vir rodada, torta ou com sombras). A folha tem:
- um croqui (planta) da divisão desenhado em papel quadriculado, com o comprimento de cada parede em centímetros escrito ao lado;
- caixas por peça (base de duche, coluna de duche, resguardo, revestimento, pavimento, torneiras, móvel, espelho, sanita, bidé), com
  linhas impressas (Mod, Medida, Cor, Mate/Brilho, Tipo…) e o que o comercial escreveu à mão a verde, azul ou preto;
- opções, extras (às vezes com um valor em euros) e uma zona de logística (elevador, parquímetro, proteções).

Regras:
- Só preenches o que está escrito à mão. O texto impresso da folha (os rótulos) não é uma resposta.
- Se não consegues ler com segurança, valor é null ou confiança baixa (0,3). Nunca inventes.
- Para campos de escolha, usa exatamente uma das opções (o texto da opção) que corresponda ao que está escrito; para sim/não, "Sim" ou
  "Não". Para números, só o número. Para textos, escreve o que está escrito (ex.: "Axis Oak", "c/ LED"). Abreviaturas comuns: "c/" = com,
  "s/" = sem, "susp." = suspenso.
- O excerto é o que está escrito à mão nessa linha, tal como se lê.
- A planta: lê o croqui como polígono de cantos retos. Começa no canto de cima à esquerda do desenho, como está orientado na folha, e anda no
  sentido dos ponteiros do relógio. Para cada parede dá o comprimento em cm (os números escritos junto às paredes) e para onde se vira no
  fim dela ("dir" ou "esq"; num retângulo é sempre "dir"). Se um comprimento não está escrito, deduz-o das outras paredes para a planta
  fechar, e baixa a confiança. Peças desenhadas (base de duche, banheira, sanita, bidé, móvel, porta, janela): o tipo e, se der para estimar
  pelo desenho, a posição (x, y do canto de cima à esquerda) e o tamanho (w, h) em cm, no mesmo referencial (x para a direita, y para baixo,
  a partir do canto de partida).
- O resumo: 2 a 5 frases, em português de Portugal, com o que a folha diz (as escolhas principais, os extras, o valor, se houver).`;

const descrever = (c: z.infer<typeof campoDef>) => {
  const extra = c.t === "escolha" || c.t === "varios" ? ` opções: ${(c.op ?? []).join(", ")}` : c.t === "sim_nao" ? " valores: Sim, Não" :
    c.t === "numero" || c.t === "contador" ? ` número${c.un ? " em " + c.un : ""}` : c.t === "data" ? " data AAAA-MM-DD" : "";
  return `- ${c.k}: ${c.bloco ? c.bloco + " · " : ""}${c.l} [${c.t}]${extra}${c.ajuda ? " — " + c.ajuda : ""}`;
};

interface CampoBruto { chave?: string; valor: string | null; confianca: number; excerto: string }
interface PecaBruta { tipo: string; x?: number; y?: number; w?: number; h?: number }
interface Resposta {
  campos: CampoBruto[];
  resumo: string;
  planta: { paredes: { c: number; vira: string }[]; pecas: PecaBruta[]; confianca: number };
}
const TIPOS_PECA = ["base", "banheira", "sanita", "bide", "movel", "coluna", "porta", "janela"];

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
    const { imagem_b64, mime, campos, divisao } = parsed.data;

    const limite = await checkRateLimit(supabaseAdmin, { ...RATE_LIMIT, identifier: caller.anewUserId });
    if (!limite.allowed) return rateLimitResponse(limite, corsHeaders);
    await recordRateLimitAttempt(supabaseAdmin, RATE_LIMIT.bucket, caller.anewUserId);

    const chaves = campos.map((c) => c.k);
    // 5/11: uma lista (chave, valor, confiança, excerto) em vez de um objeto com uma propriedade por campo: com os ~100 campos da visita, o
    // esquema por propriedades dava «Gemini 400: Request contains an invalid argument»
    const campoEsq = { type: "OBJECT", properties: { chave: { type: "STRING" }, valor: { type: "STRING", nullable: true }, confianca: { type: "NUMBER" }, excerto: { type: "STRING" } },
      required: ["chave", "valor", "confianca", "excerto"] };
    const esquema = {
      type: "OBJECT",
      properties: {
        campos: { type: "ARRAY", items: campoEsq },
        resumo: { type: "STRING" },
        planta: { type: "OBJECT", properties: {
          paredes: { type: "ARRAY", items: { type: "OBJECT", properties: { c: { type: "NUMBER" }, vira: { type: "STRING", enum: ["dir", "esq"] } }, required: ["c", "vira"] } },
          pecas: { type: "ARRAY", items: { type: "OBJECT", properties: { tipo: { type: "STRING", enum: TIPOS_PECA }, x: { type: "NUMBER" }, y: { type: "NUMBER" }, w: { type: "NUMBER" }, h: { type: "NUMBER" } }, required: ["tipo"] } },
          confianca: { type: "NUMBER" },
        }, required: ["paredes", "pecas", "confianca"] },
      },
      required: ["campos", "resumo", "planta"],
    };
    const texto = (divisao ? `A divisão da visita é: ${divisao}.\n\n` : "") + "# Campos a preencher\n" + campos.map(descrever).join("\n") +
      "\n\nLê a folha da fotografia e preenche o JSON com 'campos' (uma lista: um objeto por campo que está escrito na folha, com chave, valor, confianca e excerto; os que não estão ficam de fora), 'planta' e 'resumo'.";

    let r: Resposta;
    try {
      r = await gerarJson<Resposta>({ modelo: MODELO, partes: [{ inline_data: { mime_type: mime, data: imagem_b64 } }, { text: texto }], esquema, instrucaoSistema: INSTRUCAO });
    } catch (e) {
      if (e instanceof ErroGemini && (e.status === 429 || e.status >= 500)) return json({ error: "Gemini indisponível", retry: true }, 503);
      throw e;
    }
    const pedidas = new Set(chaves);
    const porChave = new Map((Array.isArray(r.campos) ? r.campos : []).filter((x) => x && pedidas.has(String(x.chave))).map((x) => [String(x.chave), x] as const));
    const saida = campos.map((c) => {
      const b = porChave.get(c.k) ?? { valor: null, confianca: 0, excerto: "" };
      const conf = Number(b.confianca ?? 0);
      const vazio = b.valor === null || b.valor === undefined || String(b.valor).trim() === "" || ["null", "none"].includes(String(b.valor).toLowerCase());
      const estado = vazio || conf < 0.25 ? "em_falta" : conf >= 0.75 ? "preenchido" : "rever";
      return { chave: c.k, rotulo: c.l, tipo: c.t, valor: estado === "em_falta" ? null : String(b.valor).trim(), valor_rotulo: null,
        confianca: Math.round(conf * 100) / 100, excerto: String(b.excerto ?? "").trim(), estado };
    });
    // a planta só vai se tiver pelo menos 3 paredes com comprimento; as peças só com tipo conhecido
    const paredes = (r.planta?.paredes ?? []).filter((p) => Number(p.c) > 0 && (p.vira === "dir" || p.vira === "esq")).map((p) => ({ c: Math.round(Number(p.c)), vira: p.vira }));
    const pecas = (r.planta?.pecas ?? []).filter((p) => TIPOS_PECA.includes(p.tipo));
    const planta = paredes.length >= 3 ? { paredes, pecas, confianca: Math.round(Number(r.planta?.confianca ?? 0.5) * 100) / 100 } : null;
    return json({ resumo: String(r.resumo ?? "").trim(), motor: `gemini:${MODELO}`, fichas: [{ campos: saida }], planta });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error, corsHeaders);
    console.error("[visita-folha]", error);
    const mensagem = error instanceof Error ? error.message : String(error);
    return json({ error: mensagem }, error instanceof ErroGemini ? 502 : 500);
  }
});
