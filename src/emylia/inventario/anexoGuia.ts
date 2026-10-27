// SÓ PROTÓTIPO (21/10): o ficheiro da guia de remessa que o fornecedor anexa ao expedir no portal. Lê-se para dataURL (viaja com a
// sincronização entre aparelhos) e abre-se num separador novo como blob: (os browsers bloqueiam abrir um data: diretamente).
import { ANEXO_GUIA_MAX, anexoGuiaAceite } from "./po";
import type { AnexoGuia } from "./tipos";

/** "guia.pdf · 312 KB" */
export function tamanhoAnexo(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Lê o ficheiro escolhido; recusa (com a mensagem para o utilizador) o que não é PDF/imagem ou passa de 2 MB. */
export function lerAnexoGuia(f: File): Promise<AnexoGuia> {
  if (!anexoGuiaAceite(f.type)) return Promise.reject(new Error("Escolha um PDF ou uma imagem (foto da guia)."));
  if (f.size > ANEXO_GUIA_MAX) return Promise.reject(new Error(`O ficheiro tem ${tamanhoAnexo(f.size)}: o máximo é 2 MB. Reduza-o ou tire uma foto mais leve.`));
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok({ nome: f.name, tipo: f.type, tamanho: f.size, url: String(r.result) });
    r.onerror = () => falha(new Error("Não foi possível ler o ficheiro. Tente outra vez."));
    r.readAsDataURL(f);
  });
}

/** Abre o ficheiro num separador novo (dataURL → blob:, de forma síncrona para o browser não bloquear a janela). */
export function abrirAnexoGuia(a: AnexoGuia): void {
  let url = a.url;
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(a.url);
  if (m) {
    const dados = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const bytes = new Uint8Array(dados.length);
    for (let i = 0; i < dados.length; i++) bytes[i] = dados.charCodeAt(i);
    url = URL.createObjectURL(new Blob([bytes], { type: m[1] || a.tipo }));
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  window.open(url, "_blank", "noopener");
}
