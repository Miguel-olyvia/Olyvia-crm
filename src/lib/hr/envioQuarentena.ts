/**
 * O PUT de um ficheiro para o URL assinado da quarentena de `hr-documentos`,
 * partilhado pelo convite publico e pelo RH. Extraido de `useConviteAnexos`
 * sem mudar o comportamento (salvo o tempo maximo, que e novo).
 */
const BUCKET_QUARENTENA = "hr-documentos-quarantine";

/** Tempo maximo de um PUT: passado isto o envio falha em vez de ficar a "enviar" para sempre. */
export const TEMPO_MAXIMO_ENVIO_MS = 120_000;

export interface ResultadoEnvioQuarentena {
  ok: boolean;
  /** `null` quando correu bem; `tempo_esgotado` quando o XHR passou o tempo maximo. */
  motivo: "tempo_esgotado" | "falha" | null;
}

/**
 * O PUT para o URL assinado da quarentena, por XMLHttpRequest (e o unico que
 * da progresso). Replica o `uploadToSignedUrl` do storage-js: FormData com o
 * `cacheControl` e o ficheiro na chave vazia. `ok` so com 2xx. Nunca lanca e
 * resolve sempre (ha tempo maximo).
 */
export function enviarParaQuarentenaComMotivo(
  caminho: string,
  uploadToken: string,
  file: File,
  aoProgredir: (percentagem: number) => void,
): Promise<ResultadoEnvioQuarentena> {
  return new Promise((resolve) => {
    const falha: ResultadoEnvioQuarentena = { ok: false, motivo: "falha" };
    const base = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
    const chave = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "");
    if (!base) {
      resolve(falha);
      return;
    }
    try {
      const segmentos = caminho.split("/").map(encodeURIComponent).join("/");
      const url = `${base}/storage/v1/object/upload/sign/${BUCKET_QUARENTENA}/${segmentos}?token=${encodeURIComponent(uploadToken)}`;
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.timeout = TEMPO_MAXIMO_ENVIO_MS;
      xhr.setRequestHeader("apikey", chave);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.upload.onprogress = (evento) => {
        if (evento.lengthComputable && evento.total > 0) {
          aoProgredir(Math.min(100, Math.round((evento.loaded / evento.total) * 100)));
        }
      };
      xhr.onload = () =>
        resolve(xhr.status >= 200 && xhr.status < 300 ? { ok: true, motivo: null } : falha);
      xhr.onerror = () => resolve(falha);
      xhr.onabort = () => resolve(falha);
      xhr.ontimeout = () => resolve({ ok: false, motivo: "tempo_esgotado" });
      const corpo = new FormData();
      corpo.append("cacheControl", "3600");
      corpo.append("", file);
      xhr.send(corpo);
    } catch {
      resolve(falha);
    }
  });
}

/** Como `enviarParaQuarentenaComMotivo`, so com o `true`/`false` (o convite usa esta). */
export async function enviarParaQuarentena(
  caminho: string,
  uploadToken: string,
  file: File,
  aoProgredir: (percentagem: number) => void,
): Promise<boolean> {
  return (await enviarParaQuarentenaComMotivo(caminho, uploadToken, file, aoProgredir)).ok;
}
