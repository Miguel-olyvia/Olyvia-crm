/**
 * Os avisos das horas extra APROVADAS no processamento: «N horas extra por decidir» (com ligacao para a fila de trabalho da
 * assiduidade), «excesso por detetar» (dias com tempo a mais e nenhuma hora extra registada, com o botao que corre a deteccao do
 * periodo), horas extra confirmadas em dias de ausencia (nao se pagam), as que nao se leram (bloqueia o fecho) e as que nao se
 * leram por falta de permissao (nao bloqueia, mas a base pode recusar o fecho). So em texto, nunca so por cor; nada aparece
 * quando nao ha nada a avisar (interruptor desligado: nunca aparece).
 *
 * O ESTADO DA DETECCAO VIVE FORA DO BOTAO: enquanto o calculo se refaz os totais ficam a zero e os avisos somem; a resposta da
 * deteccao (e o foco, que passa para ela) tem de sobreviver a isso, por isso a regiao da resposta e permanente enquanto existir.
 */
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHorasExtraAcoes, hojeLisboa } from "@/components/rh-exemplo/hooks/horasExtraReal";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

/** A fila de trabalho do mapa de assiduidade, filtrada nas horas extra (o filtro abre o separador «Fila»). */
export const HREF_FILA_HORAS_EXTRA = "/rh-exemplo/assiduidade-e-ausencias?dominio=assiduidade&fila_tipo=hora_extra";

interface Props {
  /** Horas extra pendentes (de pessoas obrigatorias, qualquer origem) em dias de modo aprovadas, somadas em todas as pessoas. */
  horasExtraPendentes: number;
  /** Dias com excesso e sem hora extra, somados em todas as pessoas. */
  excessoPorDetetar: number;
  /** Pessoas cujas horas extra nao se leram por erro (bloqueia o fecho). */
  pessoasSemHorasExtra: number;
  /** Pessoas cujas horas extra nao se leram por falta de permissao (nao bloqueia; a base pode recusar o fecho). */
  pessoasSemPermissaoHorasExtra?: number;
  /** Minutos de horas extra confirmadas em dias de ausencia de dia inteiro: nao se pagam. */
  horasExtraNaoContadasMin?: number;
  /** O periodo da folha: a deteccao corre sobre ele (ate hoje). */
  de: string;
  ate: string;
  /** Depois de uma deteccao que criou horas extra (mesmo parcial): o calculo do ecra tem de se refazer. */
  aoDetetar?: () => void;
  className?: string;
}

interface Resposta {
  ok: boolean;
  texto: string;
}

const ligacao =
  "min-h-11 content-center font-medium underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function AvisosDeHorasExtra({
  horasExtraPendentes,
  excessoPorDetetar,
  pessoasSemHorasExtra,
  pessoasSemPermissaoHorasExtra = 0,
  horasExtraNaoContadasMin = 0,
  de,
  ate,
  aoDetetar,
  className,
}: Props) {
  const { t } = useTranslation();
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [aCorrer, setACorrer] = useState(false);
  const respostaRef = useRef<HTMLParagraphElement>(null);

  const haAvisos =
    horasExtraPendentes > 0 || excessoPorDetetar > 0 || pessoasSemHorasExtra > 0 || pessoasSemPermissaoHorasExtra > 0 || horasExtraNaoContadasMin > 0;
  // O botao fica enquanto houver excesso ou a deteccao estiver a correr (nao some a meio).
  const mostraBotao = excessoPorDetetar > 0 || aCorrer;
  if (!haAvisos && !resposta && !aCorrer) return null;

  const aoTerminar = (r: Resposta) => {
    setResposta(r);
    // O botao pode desaparecer (o excesso foi tratado): o foco passa para a resposta, que fica.
    requestAnimationFrame(() => respostaRef.current?.focus());
  };

  return (
    <div className={cn("space-y-1", className)} data-testid="avisos-horas-extra">
      {pessoasSemHorasExtra > 0 && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("rhProcReal.aviso.horasExtraNaoLidas", { n: String(pessoasSemHorasExtra) })}
        </p>
      )}
      {pessoasSemPermissaoHorasExtra > 0 && (
        <p role="status" className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("rhProcReal.aviso.horasExtraSemPermissao", { n: String(pessoasSemPermissaoHorasExtra) })}
        </p>
      )}
      {horasExtraPendentes > 0 && (
        <p role="status" className="flex flex-wrap items-center gap-x-2 text-sm text-amber-800 dark:text-amber-300">
          <span>{t("rhProcReal.aviso.horasExtraPendentes", { n: String(horasExtraPendentes) })}</span>
          <Link to={HREF_FILA_HORAS_EXTRA} className={ligacao}>
            {t("rhProcReal.aviso.horasExtraPendentesLigacao")}
          </Link>
        </p>
      )}
      {horasExtraNaoContadasMin > 0 && (
        <p role="status" className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("rhProcReal.aviso.horasExtraEmAusencia", { n: String(horasExtraNaoContadasMin) })}
        </p>
      )}
      {excessoPorDetetar > 0 && (
        <p role="status" className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("rhProcReal.aviso.excessoPorDetetar", { n: String(excessoPorDetetar) })}
        </p>
      )}
      {mostraBotao && <BotaoDetetar de={de} ate={ate} aCorrer={aCorrer} aoCorrer={setACorrer} aoTerminar={aoTerminar} aoDetetar={aoDetetar} />}
      {/* Regiao permanente da resposta (enquanto existir): nao some quando o calculo se refaz. */}
      <p
        ref={respostaRef}
        tabIndex={-1}
        role={resposta?.ok === false ? "alert" : "status"}
        className={cn(
          "text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
          resposta?.ok === false ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {resposta?.texto ?? ""}
      </p>
    </div>
  );
}

interface BotaoProps {
  de: string;
  ate: string;
  aCorrer: boolean;
  aoCorrer: (valor: boolean) => void;
  aoTerminar: (resposta: Resposta) => void;
  aoDetetar?: () => void;
}

/** O botao (e o hook da deteccao, que precisa do react-query): so existe enquanto ha excesso por detetar ou a deteccao corre. */
function BotaoDetetar({ de, ate, aCorrer, aoCorrer, aoTerminar, aoDetetar }: BotaoProps) {
  const { t } = useTranslation();
  const { detetar, aExecutar } = useHorasExtraAcoes();

  const correr = async () => {
    aoCorrer(true);
    try {
      const hoje = hojeLisboa();
      const resultado = await detetar(de, ate > hoje ? hoje : ate);
      const criadas = resultado.resumo?.criadas ?? 0;
      if (!resultado.ok) {
        const janela = resultado.janelaFalhada
          ? ` ${t("rhProcReal.aviso.excessoPorDetetarJanela", { de: resultado.janelaFalhada.de, ate: resultado.janelaFalhada.ate })}`
          : "";
        aoTerminar({ ok: false, texto: `${resultado.erro ?? ""}${janela}`.trim() });
      } else {
        aoTerminar({
          ok: true,
          texto: criadas > 0 ? t("rhProcReal.aviso.excessoPorDetetarFeito", { n: String(criadas) }) : t("rhProcReal.aviso.excessoPorDetetarNenhuma"),
        });
      }
      // Mesmo numa deteccao parcial: o que ja se criou entra no calculo.
      if (criadas > 0) aoDetetar?.();
    } finally {
      aoCorrer(false);
    }
  };

  const ocupado = aCorrer || aExecutar;
  return (
    <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={ocupado} aria-busy={ocupado} onClick={() => void correr()}>
      {ocupado ? t("rhProcReal.aviso.excessoPorDetetarA") : t("rhProcReal.aviso.excessoPorDetetarBotao")}
    </Button>
  );
}
