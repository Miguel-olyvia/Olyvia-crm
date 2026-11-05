// 4/11 (Rúben): no fim da chamada em direto, a transcrição e a definição dos campos da Lead e do Contacto
// (os Def de src/emylia/campos.ts: k, l, t, op, ajuda) vêm aqui; o Gemini devolve, por campo, o valor, a
// confiança e o excerto que o justifica, mais um resumo para quem vai à visita. Só preenche o que foi dito.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";
import { getCorsHeaders } from "../_shared/cors.ts";
import { AuthError, resolveCallerIdentity, authErrorResponse } from "../_shared/auth.ts";
import { checkRateLimit, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { ErroGemini, gerarJson } from "../_shared/gemini.ts";

const RATE_LIMIT = { bucket: "chamada-campos", maxAttempts: 30, windowMinutes: 1 };
const MODELO = Deno.env.get("CHAMADAS_GEMINI_MODELO_CAMPOS") ?? "gemini-3.8-flash";

const campoDef = z.object({
  k: z.string().min(1).max(60),
  l: z.string().min(1).max(200),
  t: z.enum(["sim_nao", "escolha", "varios", "numero", "contador", "texto", "texto_longo", "data"]),
  op: z.array(z.string().max(120)).max(400).optional(),  // os serviços do Catálogo são muitos
  ajuda: z.string().max(400).optional(),
  un: z.string().max(20).optional(),
});
const pedido = z.object({
  segmentos: z.array(z.object({ inicio: z.number(), texto: z.string().max(2000), falante: z.enum(["comercial", "cliente", "desconhecido"]) })).max(2000),
  campos: z.array(campoDef).min(1).max(200),  // a visita tem muitos campos (o local, a área, as peças)
  // a data de hoje no fuso da comercial (AAAA-MM-DD), para «dia 10» e «amanhã» virarem datas
  hoje: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // 5/11: «visita» é a conversa da visita a casa do cliente (a comercial mede, mostra amostras e o cliente escolhe as peças)
  tipo: z.enum(["chamada", "visita"]).optional(),
});

const SOBRE_A_VISITA = `ESTA TRANSCRIÇÃO É DE UMA VISITA, NÃO DE UMA CHAMADA. O comercial está em casa do cliente: vê o espaço, mede,
mostra amostras e o cliente escolhe as peças; muitas vezes o comercial faz o orçamento ali. A ficha a preencher é a da visita (o local, a
área de intervenção, as medidas, as peças escolhidas e o prazo). Regras próprias da visita:
- As peças escolhidas: preenche cada caixa (cor, acabamento, forma, abertura…) só com o que o cliente escolheu no fim; se mudou de ideias,
  vale a última escolha.
- Medidas: comprimentos de paredes ditos em metros ou centímetros não são áreas. Só preenches um campo em m² se a área foi dita.
- O resumo é para quem faz o orçamento e para o supervisor da obra: 5 a 10 frases com o que se vai fazer, as escolhas peça a peça, as
  medidas ditas, o que ficou combinado (prazo, vaga, duração, valor, pagamento) e o que ficou por decidir.`;

const INSTRUCAO = `És um assistente de uma empresa de remodelações em Portugal. Recebes a transcrição de uma chamada entre
um comercial e um cliente e preenches uma ficha para preparar a visita.

Quem é quem: cada linha vem etiquetada "Comercial:" ou "Cliente:" por uma comparação de vozes que ERRA muitas vezes.
Antes de preencheres, decide tu quem disse cada linha pelo sentido da conversa: o comercial é da empresa, apresenta-se,
faz as perguntas, explica a visita e marca o dia; o cliente fala da casa dele, do que quer fazer, das dúvidas, da
disponibilidade e responde às perguntas. Uma linha como "eu ainda estou interessado em fazer a casa de banho" é do
cliente, mesmo que venha como "Comercial:". Devolve essa decisão em 'falantes': uma entrada por linha, pela ordem dos
números entre parênteses retos, "comercial" ou "cliente". Preenche os campos já com essa correção.
O nome do cliente é o nome por que o comercial o trata (por exemplo "Dona Inês"), nunca o nome com que o comercial se
apresenta.

Regras:
- Só preenches o que foi dito na chamada. Se não foi dito, valor é null e confianca é 0.
- Uma pergunta do comercial não é uma resposta. "É uma moradia ou é um andar?" não diz nada; só a resposta do
  cliente conta. Se a resposta não se percebe, fica null.
- Nunca deduzes para além do razoável. "Sexto direito" diz que é um andar; não diz nada sobre elevador.
- A transcrição do lado do cliente vem do altifalante do telemóvel e tem frases sem sentido. Ignora-as.
- Para campos de escolha, usa exatamente uma das opções (o texto da opção). Para sim/não, "Sim" ou "Não".
- Para números, só o número. Para listas (varios), as opções ditas separadas por vírgulas. Para datas, AAAA-MM-DD.
- Numa lista de serviços do Catálogo (varios com muitas opções), inclui TODAS as opções que correspondem a algo que o
  cliente disse que quer fazer, trocar, pôr ou instalar, mesmo que o diga com outras palavras ("trocar a sanita, o
  pavimento e o espelho" dá a opção da sanita, a do pavimento e a do espelho; "banheira" dá a opção da banheira ou
  da base de duche se for isso que existe). Se o cliente disse que quer trocar tudo ou uma remodelação geral de uma
  divisão, inclui todas as opções típicas dessa divisão (demolição e entulho, canalização, pavimento, revestimentos,
  sanita, duche ou banheira, mobiliário, espelho, toalheiro, elétrica, pintura), com confiança 0.5. Usa exatamente o
  texto de cada opção.
- Nos campos de texto longo escreve TUDO o que foi dito sobre esse tema, com detalhe e frases completas, nas
  palavras do cliente: o que quer, dúvidas e indecisões, o que já fez ou tem, referências e exemplos que pediu,
  restrições. Nunca resumas a uma linha; um campo de texto longo pode ter várias frases.
- O excerto é uma citação curta e literal da transcrição que justifica o valor.
- A confianca é 1 quando o cliente o disse claramente, 0.5 quando é uma dedução razoável, 0 quando não há informação.
- O resumo é para o comercial que vai à visita: 4 a 8 frases, em português de Portugal, com o que o cliente quer,
  as dúvidas dele, o que já fez, orçamento, prazos e disponibilidade, o que ficou combinado e o que ficou por perguntar.`;

const descrever = (c: z.infer<typeof campoDef>) => {
  const extra = c.t === "escolha" || c.t === "varios" ? ` opções: ${(c.op ?? []).join(", ")}` : c.t === "sim_nao" ? " valores: Sim, Não" :
    c.t === "numero" || c.t === "contador" ? ` número${c.un ? " em " + c.un : ""}` : c.t === "data" ? " data AAAA-MM-DD" : "";
  return `- ${c.k}: ${c.l} [${c.t}]${extra}${c.ajuda ? " — " + c.ajuda : ""}`;
};

interface CampoBruto { valor: string | null; confianca: number; excerto: string }
interface Resposta { campos: Record<string, CampoBruto>; resumo: string; falantes?: string[] }

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
    const { segmentos, campos, hoje, tipo } = parsed.data;

    const limite = await checkRateLimit(supabaseAdmin, { ...RATE_LIMIT, identifier: caller.anewUserId });
    if (!limite.allowed) return rateLimitResponse(limite, corsHeaders);
    await recordRateLimitAttempt(supabaseAdmin, RATE_LIMIT.bucket, caller.anewUserId);

    const chaves = campos.map((c) => c.k);
    const campoEsq = { type: "OBJECT", properties: { valor: { type: "STRING", nullable: true }, confianca: { type: "NUMBER" }, excerto: { type: "STRING" } },
      required: ["valor", "confianca", "excerto"] };
    const esquema = { type: "OBJECT", properties: { campos: { type: "OBJECT", properties: Object.fromEntries(chaves.map((k) => [k, campoEsq])), required: chaves },
      resumo: { type: "STRING" }, falantes: { type: "ARRAY", items: { type: "STRING", enum: ["comercial", "cliente"] } } },
      required: ["campos", "resumo", "falantes"] };
    const texto = (hoje ? `Hoje é ${hoje}. Datas ditas de forma relativa («dia 10», «amanhã», «para a semana») ` +
      "convertem-se para AAAA-MM-DD, assumindo a próxima ocorrência a partir de hoje.\n\n" : "") +
      "# Campos a preencher\n" + campos.map(descrever).join("\n") +
      "\n\n# Transcrição da chamada\n" + segmentos.map((s, i) => `[${i}] ${s.falante === "comercial" ? "Comercial" : s.falante === "cliente" ? "Cliente" : "Alguém"}: ${s.texto}`).join("\n") +
      "\n\nPreenche o JSON com 'falantes' (uma entrada por linha), 'campos' (um objeto por chave, com valor, confianca e excerto) e 'resumo'.";

    let r: Resposta;
    try {
      r = await gerarJson<Resposta>({ modelo: MODELO, partes: [{ text: texto }], esquema, instrucaoSistema: tipo === "visita" ? `${INSTRUCAO}\n\n${SOBRE_A_VISITA}` : INSTRUCAO });
    } catch (e) {
      if (e instanceof ErroGemini && (e.status === 429 || e.status >= 500)) return json({ error: "Gemini indisponível", retry: true }, 503);
      throw e;
    }
    const saida = campos.map((c) => {
      const b = r.campos?.[c.k] ?? { valor: null, confianca: 0, excerto: "" };
      const excerto = String(b.excerto ?? "").trim();
      let conf = Number(b.confianca ?? 0);
      const vazio = b.valor === null || b.valor === undefined || String(b.valor).trim() === "" || ["null", "none"].includes(String(b.valor).toLowerCase());
      // guarda: uma pergunta do comercial não é prova
      if (excerto.toLowerCase().startsWith("comercial:") && excerto.includes("?") && ["escolha", "sim_nao", "numero", "contador"].includes(c.t)) conf = Math.min(conf, 0.3);
      const estado = vazio || conf < 0.25 ? "em_falta" : conf >= 0.75 ? "preenchido" : "rever";
      return { chave: c.k, rotulo: c.l, tipo: c.t, valor: estado === "em_falta" ? null : String(b.valor).trim(), valor_rotulo: null,
        confianca: Math.round(conf * 100) / 100, excerto, estado };
    });
    // quem disse cada linha, revisto pelo sentido; só se vier uma entrada por linha (senão fica o que a comparação de vozes deu)
    const falantes = Array.isArray(r.falantes) && r.falantes.length === segmentos.length && r.falantes.every((f) => f === "comercial" || f === "cliente")
      ? r.falantes : undefined;
    return json({ resumo: String(r.resumo ?? "").trim(), motor: `gemini:${MODELO}`, fichas: [{ campos: saida }], ...(falantes ? { falantes } : {}) });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error, corsHeaders);
    // qualquer outro erro vai com cabeçalhos CORS e a mensagem: sem isto o browser só diz
    // «Failed to send a request to the Edge Function» e não se percebe o que falhou
    console.error("[chamada-campos]", error);
    const mensagem = error instanceof Error ? error.message : String(error);
    return json({ error: mensagem }, error instanceof ErroGemini ? 502 : 500);
  }
});
