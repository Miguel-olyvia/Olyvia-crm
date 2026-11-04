/**
 * Chamada direta à API nativa do Gemini para pedidos com áudio e esquema JSON
 * (as funções da chamada em direto, 4/11). O aiGateway.ts fala a forma OpenAI e
 * não expõe `responseSchema` nem a ordem das partes de áudio, que aqui importam.
 * A chave é a mesma: GEMINI_API_KEY (getAiGatewayKey).
 */
import { getAiGatewayKey } from "./aiGateway.ts";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export type ParteGemini = { text: string } | { inline_data: { mime_type: string; data: string } };

export interface PedidoGeminiJson {
  modelo: string;
  partes: ParteGemini[];
  esquema: Record<string, unknown>;
  instrucaoSistema?: string;
  temperatura?: number;
}

export class ErroGemini extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Faz um generateContent com resposta JSON pelo esquema e devolve-a já analisada. */
export async function gerarJson<T>(p: PedidoGeminiJson): Promise<T> {
  const corpo: Record<string, unknown> = {
    contents: [{ role: "user", parts: p.partes }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: p.esquema,
      temperature: p.temperatura ?? 0,
    },
  };
  if (p.instrucaoSistema) corpo.systemInstruction = { parts: [{ text: p.instrucaoSistema }] };
  const r = await fetch(`${BASE}/models/${p.modelo}:generateContent?key=${getAiGatewayKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) {
    const texto = await r.text().catch(() => "");
    throw new ErroGemini(`Gemini ${r.status}: ${texto.slice(0, 300)}`, r.status);
  }
  const j = await r.json();
  const texto: string = j?.candidates?.[0]?.content?.parts?.map((x: { text?: string }) => x.text ?? "").join("") ?? "";
  if (!texto) throw new ErroGemini("Gemini sem resposta", 502);
  return JSON.parse(texto) as T;
}
