// Aba «Histórico»: quem fez o quê e quando, do mais recente para o mais antigo.
import { useTranslation } from "@/hooks/useTranslation";
import { QUEM_DENUNCIANTE } from "../lib/acoes";
import { dataHora } from "../lib/datas";
import { QUEM_SISTEMA } from "../lib/formulario";
import type { Denuncia, EventoHistorico } from "../lib/tipos";

/** Os detalhes que são códigos (gravidade, resultado) traduzem-se; o resto (nomes, motivos) mostra-se tal como está. */
function textoDoDetalhe(e: EventoHistorico, t: (k: string) => string): string {
  if (!e.detalhe) return "";
  if (e.acao === "gravidade_alterada") return t(`cd.gravidade.${e.detalhe}`);
  if (e.acao === "concluida") return t(`cd.resultado.${e.detalhe}`);
  return e.detalhe;
}

export function AbaHistorico({ d }: { d: Denuncia }) {
  const { t } = useTranslation();
  const quem = (q: string): string => (q === QUEM_DENUNCIANTE ? t("cd.conversa.denunciante") : q === QUEM_SISTEMA ? t("cd.historico.sistema") : q);
  const eventos = [...d.historico].reverse();
  return (
    <ol aria-label={t("cd.historico.titulo")} className="space-y-0 divide-y rounded-lg border bg-card">
      {eventos.map((e) => {
        const detalhe = textoDoDetalhe(e, t);
        return (
          <li key={e.id} className="px-3 py-2 text-sm">
            <p>
              <span className="font-medium">{t(`cd.hist.${e.acao}`)}</span>
              {detalhe && <span className="text-muted-foreground"> · {detalhe}</span>}
            </p>
            <p className="text-xs text-muted-foreground">{quem(e.quem)} · {dataHora(e.em)}</p>
          </li>
        );
      })}
    </ol>
  );
}
