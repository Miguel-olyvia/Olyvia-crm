/**
 * AI gateway helper — single point of configuration for the model provider.
 *
 * Google's "OpenAI-compatibility" endpoint
 * (`/v1beta/openai/chat/completions`) was tried first (it lets callers speak
 * plain OpenAI shape) but returns a mysterious HTTP 404 for real, valid,
 * enabled API keys — a known rough edge of that beta compatibility layer,
 * confirmed live (malformed keys get a clean 400 "Please pass a valid API
 * key" from the same endpoint, so the 404 is specific to the compat shim,
 * not an auth problem).
 *
 * This file now talks to Google's native, stable Gemini REST API
 * (`generateContent` / `streamGenerateContent`) instead, but keeps the exact
 * same OpenAI-shaped request/response contract for every caller in this repo
 * (7 Edge Functions). All translation lives here — callers are unchanged.
 *
 * Translation notes (the fiddly parts):
 *  - `messages` (OpenAI) -> `contents` + `systemInstruction` (Gemini).
 *    - role "system" -> pulled out into `systemInstruction` (Gemini has no
 *      system role in `contents`).
 *    - role "user"/"assistant" -> "user"/"model" (Gemini has no "assistant").
 *    - OpenAI tool-calling round trip: a synthetic
 *      `{role: "assistant", content: null, tool_calls: [...]}` becomes a
 *      "model" turn with `functionCall` parts; a paired
 *      `{role: "tool", tool_call_id, content}` becomes a "user" turn with a
 *      `functionResponse` part (Gemini has no "tool" role — function
 *      results are sent back as a user turn per Gemini convention).
 *    - `content` as an OpenAI content-block array (text/file blocks, used by
 *      import-contract-pdf for inline PDFs) is translated into Gemini
 *      `parts` (`{text}` / `{inline_data: {mime_type, data}}`).
 *  - `tools` (OpenAI function-schema array) -> Gemini
 *    `tools: [{ functionDeclarations: [...] }]`.
 *  - `response_format: { type: "json_object" }` -> Gemini
 *    `generationConfig.responseMimeType: "application/json"`.
 *  - Auth: native Gemini REST uses the `?key=` query param (confirmed against
 *    Google's own docs as the primary/simplest auth method for this API),
 *    NOT the `Authorization: Bearer` header the OpenAI-compat shim used.
 *  - Non-streaming response: Gemini's `candidates[0].content.parts` is
 *    reassembled into an OpenAI-shape
 *    `{choices: [{message: {content, tool_calls}, finish_reason}]}` so
 *    `response.json()` callers don't change at all.
 *  - Streaming response: Gemini's SSE (`alt=sse`) emits partial
 *    `GenerateContentResponse` objects; each is re-emitted as an
 *    OpenAI-style `data: {"choices":[{"delta":{"content":"..."}}]}\n\n`
 *    chunk, terminated with `data: [DONE]\n\n`, matching exactly what
 *    src/components/AIAssistant.tsx's SSE parser expects.
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export function getAiGatewayKey(): string {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return key;
}

// ---------------------------------------------------------------------------
// OpenAI-shape types (only the fields these 7 callers actually use)
// ---------------------------------------------------------------------------

interface OpenAiTextBlock {
  type: "text";
  text: string;
}

interface OpenAiFileBlock {
  type: "file";
  file: { filename?: string; file_data: string };
}

type OpenAiContentBlock = OpenAiTextBlock | OpenAiFileBlock | Record<string, unknown>;

interface OpenAiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  /**
   * Gemini 3 models attach a `thoughtSignature` to functionCall parts and
   * REQUIRE it echoed back on the same call in the next turn's request, or
   * they reject the follow-up with "Function call is missing a
   * thought_signature" (confirmed live). OpenAI's tool_call shape has no
   * slot for this, so it rides along here purely as an internal round-trip
   * field - callers just forward `choice.message`/tool_calls untouched, so
   * it survives without needing any caller-side changes.
   */
  thought_signature?: string;
}

interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | OpenAiContentBlock[] | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}

interface OpenAiTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

interface AiGatewayRequestBody {
  model: string;
  messages: OpenAiMessage[];
  tools?: OpenAiTool[];
  tool_choice?: string;
  stream?: boolean;
  temperature?: number;
  response_format?: { type?: string; json_schema?: unknown };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Gemini native types (subset)
// ---------------------------------------------------------------------------

interface GeminiInlineData {
  mime_type: string;
  data: string;
}

// NOTE: `inline_data`/`mime_type` are intentionally snake_case on the wire —
// that's the literal shape Google's docs show for inline file parts, unlike
// the rest of the API surface which is camelCase (systemInstruction,
// generationConfig, functionCall, ...). Do not "fix" this to camelCase.
interface GeminiPart {
  text?: string;
  inline_data?: GeminiInlineData;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  // See OpenAiToolCall.thought_signature - required by Gemini 3 on the
  // functionCall part when it's echoed back in a later turn.
  thoughtSignature?: string;
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

// ---------------------------------------------------------------------------
// Request translation: OpenAI -> Gemini
// ---------------------------------------------------------------------------

/** Splits a `data:<mime>;base64,<payload>` URL into its parts. Falls back to a generic mime type if the prefix is missing/unrecognized. */
function parseDataUrl(fileData: string): GeminiInlineData {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(fileData);
  if (match) {
    return { mime_type: match[1], data: match[2] };
  }
  // Already-bare base64 (no data: prefix) — assume PDF, the only file type
  // any current caller (import-contract-pdf) sends.
  return { mime_type: "application/pdf", data: fileData };
}

function openAiContentToParts(content: string | OpenAiContentBlock[] | null | undefined): GeminiPart[] {
  if (content == null) return [];
  if (typeof content === "string") {
    return content.length > 0 ? [{ text: content }] : [];
  }
  const parts: GeminiPart[] = [];
  for (const block of content) {
    const b = block as OpenAiContentBlock;
    if ((b as OpenAiTextBlock).type === "text" && typeof (b as OpenAiTextBlock).text === "string") {
      parts.push({ text: (b as OpenAiTextBlock).text });
    } else if ((b as OpenAiFileBlock).type === "file" && (b as OpenAiFileBlock).file?.file_data) {
      parts.push({ inline_data: parseDataUrl((b as OpenAiFileBlock).file.file_data) });
    }
    // Unknown block shapes are silently skipped — none of the 7 callers send
    // anything else today (no image_url blocks in use).
  }
  return parts;
}

/**
 * Converts OpenAI-shape `messages` into Gemini's `{ systemInstruction, contents }`.
 *
 * Tool-calling round trip handled here:
 *  - `{role: "assistant", tool_calls: [...]}` -> one "model" turn whose parts
 *    are `functionCall` parts (one per tool call).
 *  - `{role: "tool", tool_call_id, content}` -> one "user" turn with a single
 *    `functionResponse` part. The tool name isn't carried on the OpenAI
 *    "tool" message itself, so it's recovered by looking back at the most
 *    recent assistant tool_calls entry with a matching id.
 */
function messagesToGeminiContents(messages: OpenAiMessage[]): {
  systemInstruction: GeminiContent | undefined;
  contents: GeminiContent[];
} {
  const systemParts: GeminiPart[] = [];
  const contents: GeminiContent[] = [];
  // tool_call_id -> function name, so a later {role:"tool"} message can be
  // translated into a Gemini functionResponse with the right name.
  const toolCallNameById = new Map<string, string>();

  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push(...openAiContentToParts(msg.content));
      continue;
    }

    if (msg.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const parts: GeminiPart[] = [];
      // Gemini can emit text alongside a functionCall in the same turn; keep
      // it (OpenAI-shape assistant messages with tool_calls usually have
      // content: null, but preserve it if present so nothing is dropped).
      if (typeof msg.content === "string" && msg.content.length > 0) {
        parts.push({ text: msg.content });
      }
      for (const tc of msg.tool_calls) {
        toolCallNameById.set(tc.id, tc.function.name);
        let args: Record<string, unknown> = {};
        try {
          args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          args = {};
        }
        parts.push({
          functionCall: { name: tc.function.name, args },
          ...(tc.thought_signature ? { thoughtSignature: tc.thought_signature } : {}),
        });
      }
      contents.push({ role: "model", parts });
      continue;
    }

    if (msg.role === "tool") {
      const name = (msg.tool_call_id && toolCallNameById.get(msg.tool_call_id)) || "unknown_tool";
      let response: Record<string, unknown>;
      try {
        response = typeof msg.content === "string" ? JSON.parse(msg.content) : { result: msg.content };
      } catch {
        response = { result: msg.content };
      }
      // Gemini has no "tool" role — function results travel back as a user turn.
      contents.push({ role: "user", parts: [{ functionResponse: { name, response } }] });
      continue;
    }

    const role: "user" | "model" = msg.role === "assistant" ? "model" : "user";
    const parts = openAiContentToParts(msg.content);
    if (parts.length === 0) continue;
    contents.push({ role, parts });
  }

  return {
    systemInstruction: systemParts.length > 0 ? { role: "user", parts: systemParts } : undefined,
    contents,
  };
}

/**
 * Gemini's tool-parameter schema is proto-based and only accepts a single
 * string `type` per property - it rejects the JSON-Schema union form
 * `type: ["string", "null"]` that some of ai-assistant's TOOLS declarations
 * use for nullable fields (confirmed live: "Proto field is not repeating,
 * cannot start list"). Recursively sanitizes any such array `type` down to
 * its first non-"null" member, adding `nullable: true` when "null" was
 * present, so schema authors don't need to special-case Gemini.
 */
function sanitizeSchemaForGemini(schema: unknown): unknown {
  if (Array.isArray(schema) || schema === null || typeof schema !== "object") return schema;
  const obj = schema as Record<string, unknown>;
  const result: Record<string, unknown> = { ...obj };

  if (Array.isArray(result.type)) {
    const types = result.type as unknown[];
    const hasNull = types.includes("null");
    const nonNull = types.find((t) => t !== "null");
    if (typeof nonNull === "string") result.type = nonNull;
    else delete result.type;
    if (hasNull) result.nullable = true;
  }

  if (result.properties && typeof result.properties === "object") {
    const props = result.properties as Record<string, unknown>;
    result.properties = Object.fromEntries(
      Object.entries(props).map(([k, v]) => [k, sanitizeSchemaForGemini(v)]),
    );
  }
  if (result.items) result.items = sanitizeSchemaForGemini(result.items);
  if (Array.isArray(result.anyOf)) result.anyOf = result.anyOf.map(sanitizeSchemaForGemini);

  return result;
}

function openAiToolsToGemini(tools: OpenAiTool[] | undefined): Array<{ functionDeclarations: unknown[] }> | undefined {
  if (!tools || tools.length === 0) return undefined;
  const functionDeclarations = tools
    .filter((t) => t.type === "function" && t.function?.name)
    .map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: sanitizeSchemaForGemini(t.function.parameters),
    }));
  if (functionDeclarations.length === 0) return undefined;
  return [{ functionDeclarations }];
}

function buildGenerationConfig(body: AiGatewayRequestBody): Record<string, unknown> | undefined {
  const config: Record<string, unknown> = {};
  if (typeof body.temperature === "number") config.temperature = body.temperature;
  if (body.response_format?.type === "json_object") {
    config.responseMimeType = "application/json";
  }
  return Object.keys(config).length > 0 ? config : undefined;
}

function buildGeminiRequestBody(body: AiGatewayRequestBody): Record<string, unknown> {
  const { systemInstruction, contents } = messagesToGeminiContents(body.messages ?? []);
  const tools = openAiToolsToGemini(body.tools);
  const generationConfig = buildGenerationConfig(body);

  const geminiBody: Record<string, unknown> = { contents };
  if (systemInstruction) geminiBody.systemInstruction = systemInstruction;
  if (tools) {
    geminiBody.tools = tools;
    geminiBody.toolConfig = { functionCallingConfig: { mode: body.tool_choice === "none" ? "NONE" : "AUTO" } };
  }
  if (generationConfig) geminiBody.generationConfig = generationConfig;
  return geminiBody;
}

// ---------------------------------------------------------------------------
// Response translation: Gemini -> OpenAI (non-streaming)
// ---------------------------------------------------------------------------

let toolCallCounter = 0;
function nextToolCallId(): string {
  toolCallCounter += 1;
  return `call_${Date.now()}_${toolCallCounter}`;
}

function geminiCandidateToOpenAiMessage(parts: GeminiPart[]): {
  content: string | null;
  tool_calls?: OpenAiToolCall[];
} {
  const textParts: string[] = [];
  const toolCalls: OpenAiToolCall[] = [];
  for (const part of parts) {
    if (typeof part.text === "string") textParts.push(part.text);
    if (part.functionCall) {
      toolCalls.push({
        id: nextToolCallId(),
        type: "function",
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args ?? {}),
        },
        ...(part.thoughtSignature ? { thought_signature: part.thoughtSignature } : {}),
      });
    }
  }
  const content = textParts.length > 0 ? textParts.join("") : null;
  return toolCalls.length > 0 ? { content, tool_calls: toolCalls } : { content };
}

function geminiFinishReasonToOpenAi(reason: string | undefined): string {
  switch (reason) {
    case "STOP": return "stop";
    case "MAX_TOKENS": return "length";
    default: return reason ? reason.toLowerCase() : "stop";
  }
}

function geminiJsonToOpenAiResponse(gemini: any): Record<string, unknown> {
  const candidate = gemini?.candidates?.[0];
  const message = geminiCandidateToOpenAiMessage(candidate?.content?.parts ?? []);
  return {
    choices: [
      {
        index: 0,
        message: { role: "assistant", ...message },
        finish_reason: geminiFinishReasonToOpenAi(candidate?.finishReason),
      },
    ],
    usage: gemini?.usageMetadata
      ? {
        prompt_tokens: gemini.usageMetadata.promptTokenCount,
        completion_tokens: gemini.usageMetadata.candidatesTokenCount,
        total_tokens: gemini.usageMetadata.totalTokenCount,
      }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Response translation: Gemini -> OpenAI (streaming, SSE)
// ---------------------------------------------------------------------------

/**
 * Wraps a Gemini `streamGenerateContent?alt=sse` byte stream into an
 * OpenAI-style SSE byte stream. Each upstream `data: {...}` line carries a
 * partial GenerateContentResponse (same `candidates[0].content.parts` shape
 * as non-streaming); every text part found is re-emitted as
 * `data: {"choices":[{"delta":{"content":"..."}}]}\n\n`, matching exactly
 * what src/components/AIAssistant.tsx's SSE reader expects. Function-call
 * parts arriving mid-stream are also forwarded (as an OpenAI-shape
 * `delta.tool_calls` chunk) for forward-compatibility, though none of the
 * current callers read tool calls out of the streaming path.
 */
function geminiSseToOpenAiSse(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      const emit = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");

          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const dataLines = block
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trimStart());
            if (dataLines.length === 0) continue;
            const dataStr = dataLines.join("\n");
            if (dataStr === "[DONE]") continue;

            let parsed: any;
            try {
              parsed = JSON.parse(dataStr);
            } catch {
              continue;
            }
            const candidate = parsed?.candidates?.[0];
            const parts: GeminiPart[] = candidate?.content?.parts ?? [];
            const { content, tool_calls } = geminiCandidateToOpenAiMessage(parts);
            if (content) {
              emit({ choices: [{ index: 0, delta: { content } }] });
            }
            if (tool_calls && tool_calls.length > 0) {
              emit({ choices: [{ index: 0, delta: { tool_calls } }] });
            }
          }
        }
      } catch (e) {
        controller.error(e);
        return;
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

// ---------------------------------------------------------------------------
// Public entry point — unchanged signature, callers untouched.
// ---------------------------------------------------------------------------

/**
 * Builds a `Response`-like object exposing `.ok`, `.status`, `.text()`,
 * `.json()` and (for streaming) `.body`, so every existing caller's
 * `response.ok` / `await response.json()` / piping `response.body` keeps
 * working unchanged, while the actual wire request/response underneath now
 * speaks native Gemini instead of the OpenAI-compat shim.
 */
export async function callAiGateway(body: AiGatewayRequestBody): Promise<Response> {
  const apiKey = getAiGatewayKey();
  const isStreaming = body.stream === true;
  const endpoint = isStreaming ? "streamGenerateContent" : "generateContent";
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(body.model)}:${endpoint}${
    isStreaming ? "?alt=sse&" : "?"
  }key=${apiKey}`;

  const geminiBody = buildGeminiRequestBody(body);

  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(geminiBody),
  });

  if (!upstream.ok) {
    // Pass the real upstream status/body through untouched — callers branch
    // on response.status (429/402/etc.) and read response.text() on error.
    return upstream;
  }

  if (isStreaming) {
    if (!upstream.body) return upstream;
    return new Response(geminiSseToOpenAiSse(upstream.body), {
      status: upstream.status,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const geminiJson = await upstream.json();
  const openAiJson = geminiJsonToOpenAiResponse(geminiJson);
  return new Response(JSON.stringify(openAiJson), {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
