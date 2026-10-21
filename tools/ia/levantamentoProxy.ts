// O levantamento por conversa (21/10/2026): o proxy do Claude para o protótipo, dentro do servidor do Vite (dev e preview).
// · A chave fica no servidor: ANTHROPIC_API_KEY no .env.local (ou no ambiente). O browser nunca a vê.
// · GET  /api/ia/levantamento → { ligada } (o ecrã diz se a IA está ligada ou se responde o modo de demonstração).
// · POST /api/ia/levantamento { system, tools, messages } → NDJSON: { t: "texto", d } a cada pedaço de texto,
//   { t: "fim", msg } com a mensagem inteira (o browser executa as ferramentas e volta a chamar), ou { t: "erro", msg }.
// O modelo, o esforço e o máximo de tokens decidem-se aqui, não no browser.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import Anthropic from "@anthropic-ai/sdk";

const ROTA = "/api/ia/levantamento";
const MODELO = "claude-opus-5-5";
/** O corpo máximo (fotografias incluídas, já reduzidas no browser). */
const MAX_CORPO = 24 * 1024 * 1024;

function lerCorpo(req: IncomingMessage): Promise<string> {
  return new Promise((ok, falha) => {
    let n = 0;
    const partes: Buffer[] = [];
    req.on("data", (b: Buffer) => {
      n += b.length;
      if (n > MAX_CORPO) { falha(new Error("O pedido é grande demais (fotografias a mais?)")); req.destroy(); return; }
      partes.push(b);
    });
    req.on("end", () => ok(Buffer.concat(partes).toString("utf8")));
    req.on("error", falha);
  });
}

function mensagemDeErro(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "A chave da Anthropic não foi aceite (ANTHROPIC_API_KEY).";
  if (e instanceof Anthropic.RateLimitError) return "Muitos pedidos seguidos: tente daqui a uns segundos.";
  if (e instanceof Anthropic.BadRequestError) return `Pedido recusado pela API: ${e.message}`;
  if (e instanceof Anthropic.APIError) return `Erro da API (${e.status ?? "?"}): ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

export function levantamentoProxy(chave: string | undefined): Plugin {
  const ligada = !!chave;
  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ligada, modelo: ligada ? MODELO : null }));
      return;
    }
    if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
    if (!ligada) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ erro: "Sem ANTHROPIC_API_KEY no servidor" }));
      return;
    }
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    const escrever = (o: unknown) => res.write(JSON.stringify(o) + "\n");
    try {
      const corpo = JSON.parse(await lerCorpo(req)) as {
        system: string;
        tools: Anthropic.Beta.BetaToolUnion[];
        messages: Anthropic.Beta.BetaMessageParam[];
      };
      const client = new Anthropic({ apiKey: chave });
      const stream = client.beta.messages.stream({
        model: MODELO,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        // o catálogo inteiro está no system: fica em cache entre as voltas da conversa
        system: [{ type: "text", text: corpo.system, cache_control: { type: "ephemeral" } }],
        tools: corpo.tools,
        messages: corpo.messages,
        // se um classificador recusar, a API volta a correr o pedido no modelo recomendado
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      } as Anthropic.Beta.MessageCreateParamsStreaming);
      stream.on("text", (d) => escrever({ t: "texto", d }));
      const msg = await stream.finalMessage();
      escrever({ t: "fim", msg });
    } catch (e) {
      escrever({ t: "erro", msg: mensagemDeErro(e) });
    }
    res.end();
  };
  return {
    name: "olyvia-ia-levantamento",
    configureServer(server) { server.middlewares.use(ROTA, (req, res) => { void handler(req, res); }); },
    configurePreviewServer(server) { server.middlewares.use(ROTA, (req, res) => { void handler(req, res); }); },
  };
}
