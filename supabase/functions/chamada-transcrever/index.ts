// 4/11 (Rúben): a chamada em direto sem motor próprio. O browser corta o microfone em falas e manda cada
// uma aqui (WAV 16 kHz mono em base64); o Gemini transcreve-a em frases com tempos e, se vier a amostra da
// voz da comercial, diz em cada frase quem fala. A chave do Gemini é a mesma das outras funções de IA.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";
import { getCorsHeaders } from "../_shared/cors.ts";
import { AuthError, resolveCallerIdentity, authErrorResponse } from "../_shared/auth.ts";
import { checkRateLimit, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { ErroGemini, gerarJson, type ParteGemini } from "../_shared/gemini.ts";
import { ESQUEMA_BLOCO, INSTRUCAO_BLOCO, comContexto, frasesDoBloco } from "../_shared/conversa.ts";

// Uma chamada dá uma fala a cada poucos segundos: 240 por minuto por pessoa chega para várias chamadas.
const RATE_LIMIT = { bucket: "chamada-transcrever", maxAttempts: 240, windowMinutes: 1 };
const MODELO = Deno.env.get("CHAMADAS_GEMINI_MODELO") ?? "gemini-3.1-flash-lite";
const CONFIANCA_MIN = 0.5;
// 20 s de WAV a 16 kHz são 640 KB; em base64 ~860 KB. Mais do que isso não é uma fala.
const MAX_B64 = 1_200_000;
const MAX_B64_VISITA = 1_800_000; // 9/11: na visita juntam-se falas seguidas até ~20 s
// 11/11: a segunda passagem manda o som contínuo em blocos de 35 a 55 s (o último de um ficheiro pode ir até 65 s): ~2,8 MB em base64
const MAX_B64_BLOCO = 3_000_000;
// 11/11: os blocos vão ao modelo maior; nos testes com a chamada e a visita reais, quase sem erros e com quem fala certo
const MODELO_BLOCO = Deno.env.get("CHAMADAS_GEMINI_MODELO_BLOCO") ?? "gemini-3.8-flash";
const MODELO_BLOCO_RESERVA = "gemini-3.5-flash";

const pedido = z.object({
  audio_b64: z.string().min(100).max(MAX_B64_BLOCO),
  // 11/11: «fala» é a pré-visualização em direto (uma fala curta); «bloco» é o som contínuo de ~50 s, transcrito com quem fala
  modo: z.enum(["fala", "bloco"]).default("fala"),
  // 9/11: «visita» (o telemóvel na mesa, em casa do cliente) ou «chamada» (o telemóvel em alta voz junto ao microfone)
  tipo: z.enum(["chamada", "visita"]).default("chamada"),
  // 9/11: o fim do que já se transcreveu, só para o modelo perceber o assunto (não se transcreve)
  contexto: z.string().max(1500).optional(),
  deslocamento_s: z.number().min(0).default(0),
  // amostra da voz da comercial (WAV 16 kHz mono, base64), gravada uma vez no painel, e o que ela diz
  referencia_b64: z.string().max(MAX_B64).optional(),
  referencia_texto: z.string().max(2000).optional(),
});

const INSTRUCAO_BASE =
  "Transcreve literalmente este áudio, em português de Portugal, dividido em frases com início e fim em segundos " +
  "dentro do áudio. É o microfone de um computador numa sala: ouve-se a pessoa da sala e, pelo altifalante de um " +
  "telemóvel, a pessoa do outro lado da chamada. Regras: só escreves fala humana que se ouve com clareza. Toques, " +
  "música de espera, mensagens gravadas da operadora, ruído de fundo e troços em que as palavras não se distinguem " +
  "ficam de fora por completo: nunca inventes uma frase plausível para os preencher. Se uma frase só se percebe em " +
  "parte, escreve só a parte clara. Se não se perceber nada, devolve uma lista vazia. Nunca completes, resumas, " +
  "traduzas ou corrijas. Em cada frase dá a tua confiança de 0 a 1 de que foi mesmo isso que se disse; uma frase que " +
  "não faz sentido em português, ou que não tens a certeza de ter ouvido, fica abaixo de 0,5.";
// 9/11: a visita. Duas ou mais pessoas na mesma divisão, o telemóvel ou o tablet em cima da mesa ou na mão; fala-se de obras.
const INSTRUCAO_VISITA =
  "Transcreve literalmente este áudio, em português de Portugal, dividido em frases com início e fim em segundos dentro do áudio. " +
  "É uma visita a casa de um cliente para uma obra de remodelação (casa de banho, cozinha ou outra divisão): o comercial e o " +
  "cliente falam na mesma divisão, perto de um telemóvel ou tablet que grava. Pode haver eco da divisão, passos, água ou obras ao " +
  "lado. Fala-se de medidas (em centímetros e metros), de peças (base de duche, banheira, sanita suspensa, autoclismo, móvel, " +
  "coluna, resguardo, torneira, misturadora, revestimento, pavimento, azulejo, tijoleira, teto falso, canalização, esgoto, " +
  "impermeabilização), de cores, de prazos e de preços. Escreve os números com algarismos (\"80 por 60\", \"2,5 metros\"). " +
  "Regras: só escreves fala humana que se ouve; ruído e troços em que as palavras não se distinguem ficam de fora, e nunca " +
  "inventes uma frase plausível para os preencher. Se uma frase só se percebe em parte, escreve a parte clara. Nunca completes, " +
  "resumas, traduzas ou corrijas o que a pessoa disse. Em cada frase dá a tua confiança de 0 a 1.";
const INSTRUCAO_VOZ_VISITA =
  "O primeiro áudio é uma amostra da voz de uma pessoa (o comercial). O segundo áudio é uma fala gravada numa visita a casa de um " +
  "cliente, com o comercial e o cliente na mesma divisão. Diz se a voz que mais fala no segundo áudio é a mesma pessoa do primeiro " +
  "(o comercial), só pelo timbre, o tom e a maneira de falar. Responde só com JSON: comercial true se for a mesma voz, false se " +
  "for outra pessoa, e a confiança de 0 a 1.";
// Quem fala decide-se num pedido À PARTE, sem transcrição: com a amostra no mesmo pedido o modelo
// transcrevia a amostra em vez da fala (visto em chamadas reais a 4 e 5/11).
const INSTRUCAO_VOZ =
  "O primeiro áudio é uma amostra da voz de uma pessoa (o comercial), gravada ao microfone do computador. O segundo " +
  "áudio é uma fala de uma chamada, captada pelo mesmo microfone: o comercial está na sala e ouve-se perto e nítido; " +
  "o cliente fala pelo altifalante de um telemóvel e ouve-se mais abafado, metálico e distante. Diz se a voz que " +
  "mais fala no segundo áudio é a mesma pessoa do primeiro (o comercial). Pesa o timbre da voz e também a " +
  "acústica (na sala ou pelo telemóvel). Responde só com JSON: comercial true se for a mesma voz, false se for " +
  "outra pessoa, e a confiança de 0 a 1.";
const ESQUEMA_VOZ = { type: "OBJECT", properties: { comercial: { type: "BOOLEAN" }, confianca: { type: "NUMBER" } }, required: ["comercial", "confianca"] };

const ESQUEMA_FRASES = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: { inicio: { type: "NUMBER" }, fim: { type: "NUMBER" }, texto: { type: "STRING" }, confianca: { type: "NUMBER" } },
    required: ["inicio", "fim", "texto", "confianca"],
  },
};

// Nomes da casa: corrigem-se depois, em vez de os dar ao modelo (com áudio abafado ele decalcava-os).
const CORRECOES: [RegExp, string][] = [
  [/\bMudoar\b|\bModular\b/gi, "Mudelar"],
  [/\bwalking shower\b|\bwalk in shower\b/gi, "walk-in shower"],
  [/\bS\.P\.C\.?/g, "SPC"],
];
const ALUCINACOES = new Set(["obrigado", "obrigada", "legendas pela comunidade amara.org", "amara.org", "tchau"]);
const corrigir = (t: string) => CORRECOES.reduce((s, [rx, r]) => s.replace(rx, r), t);

interface Frase { inicio: number; fim: number; texto: string; confianca: number; falante?: "comercial" | "cliente"; confianca_falante?: number }

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
    const { audio_b64, deslocamento_s, referencia_b64, referencia_texto, tipo, contexto, modo: modoPedido } = parsed.data;
    const visita = tipo === "visita";
    if (modoPedido === "bloco") {
      const limiteB = await checkRateLimit(supabaseAdmin, { ...RATE_LIMIT, identifier: caller.anewUserId });
      if (!limiteB.allowed) return rateLimitResponse(limiteB, corsHeaders);
      await recordRateLimitAttempt(supabaseAdmin, RATE_LIMIT.bucket, caller.anewUserId);
      // a duração do bloco (WAV de 16 bits a 16 kHz: 32 000 bytes por segundo), para os tempos não passarem do fim
      const duracao = Math.max(0, (audio_b64.length * 3) / 4 - 44) / 32000;
      const partes: ParteGemini[] = [{ inline_data: { mime_type: "audio/wav", data: audio_b64 } }, { text: comContexto(INSTRUCAO_BLOCO[tipo], contexto) }];
      let bruto: unknown, modeloUsado = MODELO_BLOCO;
      try {
        bruto = await gerarJson({ modelo: MODELO_BLOCO, partes, esquema: ESQUEMA_BLOCO }).catch((e) => {
          if (e instanceof ErroGemini && e.status >= 400 && e.status < 500 && e.status !== 429) {
            modeloUsado = MODELO_BLOCO_RESERVA;
            return gerarJson({ modelo: MODELO_BLOCO_RESERVA, partes, esquema: ESQUEMA_BLOCO });
          }
          throw e;
        });
      } catch (e) {
        if (e instanceof ErroGemini && (e.status === 429 || e.status >= 500)) return json({ error: "Gemini indisponível", retry: true }, 503);
        throw e;
      }
      return json({ frases: frasesDoBloco(bruto, deslocamento_s, duracao), modelo: modeloUsado, modo: "bloco" });
    }
    if (!visita && audio_b64.length > MAX_B64) return json({ error: "Fala longa demais" }, 400);
    if (audio_b64.length > MAX_B64_VISITA) return json({ error: "Fala longa demais" }, 400);
    // 13/11: o provisório ao vivo (modo "fala") vai sempre ao modelo rápido, também na visita: tem de ser imediato. A segunda
    // passagem, em blocos de ~50 s (modo "bloco", acima), usa o modelo maior e corrige o que este deixar tosco.
    const modelo = MODELO;
    const instrucao = (visita ? INSTRUCAO_VISITA : INSTRUCAO_BASE) +
      (visita && contexto ? `

O que se disse imediatamente antes (só para perceberes o assunto; NÃO o transcrevas nem o repitas): «${contexto}»` : "");

    const limite = await checkRateLimit(supabaseAdmin, { ...RATE_LIMIT, identifier: caller.anewUserId });
    if (!limite.allowed) return rateLimitResponse(limite, corsHeaders);
    await recordRateLimitAttempt(supabaseAdmin, RATE_LIMIT.bucket, caller.anewUserId);

    const comFalante = !!referencia_b64;
    const fala: ParteGemini = { inline_data: { mime_type: "audio/wav", data: audio_b64 } };
    const palavrasAmostra = new Set((referencia_texto ?? "").toLowerCase().match(/\p{L}{4,}/gu) ?? []);
    // decalque da amostra (rede de segurança): quase todas as palavras da frase estão no que a amostra diz
    const ecoDaAmostra = (t: string) => {
      if (palavrasAmostra.size === 0) return false;
      const ps = t.toLowerCase().match(/\p{L}{4,}/gu) ?? [];
      return ps.length >= 4 && ps.filter((w) => palavrasAmostra.has(w)).length / ps.length >= 0.7;
    };

    let brutas: Frase[] = [];
    let voz: { comercial: boolean; confianca: number } | null = null;
    try {
      // os dois pedidos em paralelo: a transcrição só vê a fala; a comparação de vozes não transcreve nada
      [brutas, voz] = await Promise.all([
        // 9/11: se o modelo da visita recusar o pedido (não existe, não aceita áudio), vai ao de sempre
        gerarJson<Frase[]>({ modelo, partes: [fala, { text: instrucao }], esquema: ESQUEMA_FRASES })
          .catch((e) => {
            if (modelo !== MODELO && e instanceof ErroGemini && e.status >= 400 && e.status < 500 && e.status !== 429) {
              return gerarJson<Frase[]>({ modelo: MODELO, partes: [fala, { text: instrucao }], esquema: ESQUEMA_FRASES });
            }
            throw e;
          }),
        comFalante
          ? gerarJson<{ comercial: boolean; confianca: number }>({ modelo: MODELO, esquema: ESQUEMA_VOZ,
              partes: [{ inline_data: { mime_type: "audio/wav", data: referencia_b64! } }, fala, { text: visita ? INSTRUCAO_VOZ_VISITA : INSTRUCAO_VOZ }] })
            .catch(() => null)  // sem comparação, a fala fica como do cliente
          : Promise.resolve(null),
      ]);
    } catch (e) {
      if (e instanceof ErroGemini && (e.status === 429 || e.status >= 500)) return json({ error: "Gemini indisponível", retry: true }, 503);
      throw e;
    }
    const frases = (Array.isArray(brutas) ? brutas : [])
      .map((f) => ({ ...f, texto: corrigir(String(f.texto ?? "").trim()), confianca: Number(f.confianca ?? 0) }))
      // 9/11: na visita guarda-se também o que tem confiança média (vai marcado com «(?)»): perder frases é pior do que rever
      .filter((f) => f.texto && f.confianca >= (visita ? 0.3 : CONFIANCA_MIN) && !ALUCINACOES.has(f.texto.toLowerCase().replace(/[.!?… ]+$/g, "")) && !ecoDaAmostra(f.texto))
      .map((f) => ({
        inicio: Math.round((deslocamento_s + Math.max(0, Number(f.inicio) || 0)) * 100) / 100,
        fim: Math.round((deslocamento_s + Math.max(Number(f.inicio) || 0, Number(f.fim) || 0)) * 100) / 100,
        texto: f.texto,
        confianca: Math.round(f.confianca * 100) / 100,
        ...(comFalante ? { falante: voz?.comercial ? "comercial" : "cliente", confianca_falante: voz ? Math.round(Number(voz.confianca ?? 0.5) * 100) / 100 : 0.3 } : {}),
      }));
    return json({ frases, modelo });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error, corsHeaders);
    // qualquer outro erro vai com cabeçalhos CORS e a mensagem: sem isto o browser só diz
    // «Failed to send a request to the Edge Function» e não se percebe o que falhou
    console.error("[chamada-transcrever]", error);
    const mensagem = error instanceof Error ? error.message : String(error);
    return json({ error: mensagem }, error instanceof ErroGemini ? 502 : 500);
  }
});
