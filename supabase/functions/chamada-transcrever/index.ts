// 4/11 (Rúben): a chamada em direto sem motor próprio. O browser corta o microfone em falas e manda cada
// uma aqui (WAV 16 kHz mono em base64); o Gemini transcreve-a em frases com tempos e, se vier a amostra da
// voz da comercial, diz em cada frase quem fala. A chave do Gemini é a mesma das outras funções de IA.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";
import { getCorsHeaders } from "../_shared/cors.ts";
import { resolveCallerIdentity, authErrorResponse } from "../_shared/auth.ts";
import { checkRateLimit, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { ErroGemini, gerarJson, type ParteGemini } from "../_shared/gemini.ts";

// Uma chamada dá uma fala a cada poucos segundos: 240 por minuto por pessoa chega para várias chamadas.
const RATE_LIMIT = { bucket: "chamada-transcrever", maxAttempts: 240, windowMinutes: 1 };
const MODELO = Deno.env.get("CHAMADAS_GEMINI_MODELO") ?? "gemini-3.1-flash-lite";
const CONFIANCA_MIN = 0.5;
// 20 s de WAV a 16 kHz são 640 KB; em base64 ~860 KB. Mais do que isso não é uma fala.
const MAX_B64 = 1_200_000;

const pedido = z.object({
  audio_b64: z.string().min(100).max(MAX_B64),
  deslocamento_s: z.number().min(0).default(0),
  // amostra da voz da comercial (WAV 16 kHz mono, base64), gravada uma vez no painel
  referencia_b64: z.string().max(MAX_B64).optional(),
});

const INSTRUCAO_BASE =
  "Transcreve literalmente este áudio, em português de Portugal, dividido em frases com início e fim em segundos " +
  "dentro do áudio. Regras: só escreves o que se ouve com clareza; se um troço for ruído, silêncio ou impercetível, " +
  "omite-o; se não se perceber nada, devolve uma lista vazia. Nunca completes, resumas, traduzas ou corrijas. " +
  "Em cada frase dá a tua confiança de 0 a 1 de que foi mesmo isso que se disse.";
const INSTRUCAO_FALANTE =
  " O primeiro áudio é uma amostra da voz do comercial; o segundo é a fala a transcrever. Em cada frase diz " +
  "quem fala: 'comercial' se for a voz da amostra, 'cliente' se for outra pessoa.";

const esquema = (comFalante: boolean) => ({
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      inicio: { type: "NUMBER" },
      fim: { type: "NUMBER" },
      texto: { type: "STRING" },
      confianca: { type: "NUMBER" },
      ...(comFalante ? { falante: { type: "STRING", enum: ["comercial", "cliente"] } } : {}),
    },
    required: ["inicio", "fim", "texto", "confianca", ...(comFalante ? ["falante"] : [])],
  },
});

// Nomes da casa: corrigem-se depois, em vez de os dar ao modelo (com áudio abafado ele decalcava-os).
const CORRECOES: [RegExp, string][] = [
  [/\bMudoar\b|\bModular\b/gi, "Mudelar"],
  [/\bwalking shower\b|\bwalk in shower\b/gi, "walk-in shower"],
  [/\bS\.P\.C\.?/g, "SPC"],
];
const ALUCINACOES = new Set(["obrigado", "obrigada", "legendas pela comunidade amara.org", "amara.org", "tchau"]);
const corrigir = (t: string) => CORRECOES.reduce((s, [rx, r]) => s.replace(rx, r), t);

interface Frase { inicio: number; fim: number; texto: string; confianca: number; falante?: "comercial" | "cliente" }

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
    const { audio_b64, deslocamento_s, referencia_b64 } = parsed.data;

    const limite = await checkRateLimit(supabaseAdmin, { ...RATE_LIMIT, identifier: caller.anewUserId });
    if (!limite.allowed) return rateLimitResponse(limite, corsHeaders);
    await recordRateLimitAttempt(supabaseAdmin, RATE_LIMIT.bucket, caller.anewUserId);

    const comFalante = !!referencia_b64;
    const partes: ParteGemini[] = [];
    if (referencia_b64) partes.push({ inline_data: { mime_type: "audio/wav", data: referencia_b64 } });
    partes.push({ inline_data: { mime_type: "audio/wav", data: audio_b64 } });
    partes.push({ text: INSTRUCAO_BASE + (comFalante ? INSTRUCAO_FALANTE : "") });

    let brutas: Frase[] = [];
    try {
      brutas = await gerarJson<Frase[]>({ modelo: MODELO, partes, esquema: esquema(comFalante) });
    } catch (e) {
      if (e instanceof ErroGemini && (e.status === 429 || e.status >= 500)) return json({ error: "Gemini indisponível", retry: true }, 503);
      throw e;
    }
    const frases = (Array.isArray(brutas) ? brutas : [])
      .map((f) => ({ ...f, texto: corrigir(String(f.texto ?? "").trim()), confianca: Number(f.confianca ?? 0) }))
      .filter((f) => f.texto && f.confianca >= CONFIANCA_MIN && !ALUCINACOES.has(f.texto.toLowerCase().replace(/[.!?… ]+$/g, "")))
      .map((f) => ({
        inicio: Math.round((deslocamento_s + Math.max(0, Number(f.inicio) || 0)) * 100) / 100,
        fim: Math.round((deslocamento_s + Math.max(Number(f.inicio) || 0, Number(f.fim) || 0)) * 100) / 100,
        texto: f.texto,
        confianca: Math.round(f.confianca * 100) / 100,
        ...(comFalante ? { falante: f.falante === "comercial" ? "comercial" : "cliente" } : {}),
      }));
    return json({ frases, modelo: MODELO });
  } catch (error) {
    return authErrorResponse(error, corsHeaders);
  }
});
