// 27/11 (Rúben: «e também ter botão para usar voz» no chat da Olyvia): ditar a pergunta pelo microfone, com o reconhecimento de voz
// do browser (Web Speech API, pt-PT). O texto vai aparecendo enquanto se fala; quando se cala (ou se carrega outra vez), entrega o texto
// final. Sem suporte no browser (Firefox, por exemplo), `suportado` é falso e o botão não aparece.
import { useCallback, useEffect, useRef, useState } from "react";

interface ResultadoVoz { resultIndex?: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }
interface Reconhecedor {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: ResultadoVoz) => void) | null; onerror: ((e: { error?: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort?(): void;
}
type ConstrutorVoz = new () => Reconhecedor;
const classeVoz = (): ConstrutorVoz | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: ConstrutorVoz; webkitSpeechRecognition?: ConstrutorVoz };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export function useDitado({ aoFalar, aoAcabar }: { aoFalar: (texto: string) => void; aoAcabar: (texto: string) => void }) {
  const [aOuvir, setAOuvir] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const rec = useRef<Reconhecedor | null>(null);
  const texto = useRef("");
  const cb = useRef({ aoFalar, aoAcabar });
  cb.current = { aoFalar, aoAcabar };
  const suportado = !!classeVoz();

  const parar = useCallback(() => { rec.current?.stop(); }, []);
  const comecar = useCallback(() => {
    const C = classeVoz();
    if (!C || rec.current) return;
    const r = new C();
    r.lang = "pt-PT"; r.continuous = false; r.interimResults = true;
    texto.current = ""; setErro(null);
    r.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0]?.transcript ?? "";
      texto.current = t.trim();
      cb.current.aoFalar(texto.current);
    };
    r.onerror = (e) => { if (e.error && e.error !== "no-speech" && e.error !== "aborted") setErro(e.error === "not-allowed" ? "O microfone não está autorizado neste browser." : "Não deu para ouvir. Tente outra vez."); };
    r.onend = () => { rec.current = null; setAOuvir(false); if (texto.current) cb.current.aoAcabar(texto.current); };
    rec.current = r;
    try { r.start(); setAOuvir(true); } catch { rec.current = null; setAOuvir(false); }
  }, []);
  useEffect(() => () => { rec.current?.abort?.(); }, []);
  return { suportado, aOuvir, erro, comecar, parar };
}
