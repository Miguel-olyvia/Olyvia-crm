// As fotografias da obra no ecrã (auditoria de 19/11, Lote 3, dados): mostrar uma fotografia que pode ser uma referência à base
// («obrafoto:<id>», real/obraFotosReal.ts) ou um data URL antigo, e escolher fotografias para um envio (o registo do técnico, «dar por
// feita», os imprevistos), sem limite escondido: o que passa do máximo diz-se, nunca se deita fora uma fotografia já escolhida.
import { useCallback, useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { apagarFotoObra, guardarFotoObra, idDaFotoObra, imagemDaFotoObra } from "./real/obraFotosReal";

/** Quantas fotografias de cada vez num envio (o registo do dia, dar por feita). Dito no ecrã, não escondido. */
export const MAX_FOTOS_POR_ENVIO = 12;

/** O endereço para o <img>: a referência resolve-se (uma vez por sessão); o resto fica como está. `null` enquanto lê; `erro` se falhou. */
export function useImagemFotoObra(src: string | null | undefined): { url: string | null; erro: boolean } {
  const direto = !!src && !idDaFotoObra(src);
  const [lida, setLida] = useState<{ src: string; url: string | null; erro: boolean } | null>(null);
  useEffect(() => {
    if (!src || direto) return;
    let vivo = true;
    imagemDaFotoObra(src).then((url) => { if (vivo) setLida({ src, url, erro: false }); }, () => { if (vivo) setLida({ src, url: null, erro: true }); });
    return () => { vivo = false; };
  }, [src, direto]);
  if (!src) return { url: null, erro: false };
  if (direto) return { url: src, erro: false };
  return lida?.src === src ? { url: lida.url, erro: lida.erro } : { url: null, erro: false };
}

/** Uma fotografia da obra. Enquanto lê, um rectângulo do mesmo tamanho; se não se conseguir ler, diz-se. */
export function FotoObra({ src, alt, className, ...resto }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string | null | undefined }) {
  const { url, erro } = useImagemFotoObra(src);
  if (url) return <img src={url} alt={alt} className={className} {...resto} />;
  return (
    <span role="img" aria-label={erro ? `${alt ? alt + ": " : ""}fotografia indisponível` : alt || "Fotografia a carregar"}
      className={cn("inline-grid place-items-center bg-muted text-muted-foreground", !erro && "motion-safe:animate-pulse", className)}>
      {erro && <ImageOff className="h-4 w-4" aria-hidden="true" />}
    </span>
  );
}

/**
 * As fotografias escolhidas para um envio de um negócio (`numero`: o número do negócio). Com a base ligada cada uma guarda-se logo ao
 * escolher (fica a referência); sem a base, um data URL pequeno, como antes. `max`: o limite deste envio, dito no ecrã.
 * `limpar` depois de enviar (as fotografias ficam na obra); `descartar` ao cancelar (as guardadas e não enviadas apagam-se da base).
 */
export function useFotosAJuntar(numero: number, max = MAX_FOTOS_POR_ENVIO) {
  const [fotos, setFotos] = useState<string[]>([]);
  const [aGuardar, setAGuardar] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  // as que estão a ser guardadas contam para o limite (escolher 3 de seguida não passa do máximo)
  const ocupadas = useRef(0);
  const atuais = useRef<string[]>([]);
  atuais.current = fotos;

  const juntar = useCallback(async (L: Iterable<Blob | string> | null | undefined) => {
    if (!L) return;
    const lista = Array.from(L);
    const livres = Math.max(0, max - atuais.current.length - ocupadas.current);
    const vao = lista.slice(0, livres);
    if (lista.length > vao.length) setErro(livres === 0 ? `Já tem ${max} fotografias neste envio: tire uma para juntar outra.`
      : `Até ${max} fotografias por envio: ${lista.length - vao.length === 1 ? "ficou de fora 1" : `ficaram de fora ${lista.length - vao.length}`}.`);
    else setErro(null);
    if (!vao.length) return;
    ocupadas.current += vao.length;
    setAGuardar((n) => n + vao.length);
    for (const f of vao) {
      try {
        const ref = await guardarFotoObra(numero, f);
        setFotos((x) => [...x, ref]);
      } catch (e) {
        setErro(e instanceof Error && e.message ? `A fotografia não ficou guardada: ${e.message}` : "A fotografia não ficou guardada.");
      } finally {
        ocupadas.current -= 1;
        setAGuardar((n) => Math.max(0, n - 1));
      }
    }
  }, [numero, max]);

  /** Uma fotografia já pronta (a de exemplo): entra como está, se couber. */
  const juntarPronta = useCallback((u: string) => {
    if (atuais.current.length + ocupadas.current >= max) { setErro(`Já tem ${max} fotografias neste envio: tire uma para juntar outra.`); return; }
    setErro(null);
    setFotos((x) => [...x, u]);
  }, [max]);

  const tirar = useCallback((k: number) => {
    const f = atuais.current[k];
    setFotos((x) => x.filter((_, i) => i !== k));
    setErro(null);
    if (f) void apagarFotoObra(f);
  }, []);

  const limpar = useCallback(() => { setFotos([]); setErro(null); }, []);
  const descartar = useCallback(() => { for (const f of atuais.current) void apagarFotoObra(f); setFotos([]); setErro(null); }, []);

  return { fotos, aGuardar, erro, cheio: fotos.length + aGuardar >= max, max, juntar, juntarPronta, tirar, limpar, descartar };
}

/** O que se passa com as fotografias do envio: a guardar, ou o erro. Nada quando está tudo bem. */
export function EstadoFotos({ aGuardar, erro, className }: { aGuardar: number; erro: string | null; className?: string }) {
  if (!aGuardar && !erro) return null;
  return (
    <p role={erro ? "alert" : "status"} className={cn("text-sm", erro ? "text-destructive" : "text-muted-foreground", className)}>
      {erro ?? (aGuardar === 1 ? "A guardar a fotografia…" : `A guardar ${aGuardar} fotografias…`)}
    </p>
  );
}
