// 20/11 (auditoria de 19/11, lote 3): o relógio da releitura das obras na página dos negócios. Relê de `intervalo` em `intervalo` só com o
// separador à vista: escondido, o relógio pára (nem acorda); ao voltar a ficar à vista, lê logo e volta a contar.
import type { LeituraObras } from "./releituraObras";

export interface OpcoesReleitura {
  /** A leitura (só o que mudou: criarReleituraObras().ler). null: não se leu (tenta-se na volta seguinte). */
  ler: () => Promise<LeituraObras | null>;
  /** Junta o que se leu. false: não se juntou (ex.: começou a gravar entretanto) e a leitura não conta. */
  aplicar: (l: LeituraObras) => boolean;
  /** Depois de juntar: a próxima leitura passa a ser a partir desta. */
  confirmar: (l: LeituraObras) => void;
  /** Pode ler agora? (nada a gravar, há obras com plano…) */
  podeLer: () => boolean;
  intervalo?: number;
  doc?: Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;
}

/** Começa a releitura; devolve a função que a pára. */
export function iniciarReleituraPeriodica({ ler, aplicar, confirmar, podeLer, intervalo = 20000, doc = document }: OpcoesReleitura): () => void {
  let vivo = true, aLer = false;
  let t: ReturnType<typeof setInterval> | null = null;
  const umaVez = async () => {
    if (!vivo || aLer || doc.hidden || !podeLer()) return;
    aLer = true;
    try {
      const l = await ler();
      if (!vivo || !l) return;
      if (aplicar(l)) confirmar(l);
    } catch { /* tenta-se na próxima volta */ } finally { aLer = false; }
  };
  const parar = () => { if (t !== null) { clearInterval(t); t = null; } };
  const arrancar = () => { if (t === null) t = setInterval(() => void umaVez(), intervalo); };
  const aoMudar = () => {
    if (doc.hidden) { parar(); return; }
    void umaVez();
    arrancar();
  };
  if (!doc.hidden) arrancar();
  doc.addEventListener("visibilitychange", aoMudar);
  return () => { vivo = false; parar(); doc.removeEventListener("visibilitychange", aoMudar); };
}
