/**
 * Os avisos do assistente de criacao de pessoa, acima do passo aberto: o que
 * fica como pendencia, o resumo de problemas, os duplicados e a configuracao da
 * admissao que nao chegou.
 *
 * Extraido de `PessoaFormDialog` (que passava das 800 linhas) sem mudar o que
 * mostra: e so apresentacao, o estado e as decisoes ficam no assistente.
 */
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/hooks/useTranslation";
import { rotuloDeCampoAdmissao } from "@/components/hr/rotuloCampoAdmissao";
import { cn } from "@/lib/utils";
import type { ProblemaCampo } from "@/lib/hr/novaPessoa";
import type { CandidatoDuplicado } from "@/hooks/usePessoaDuplicados";

interface PessoaFormAvisosProps {
  /** Campos que a organizacao pos no convite e que o formulario nao tem (modo "RH, agora"). */
  camposForaDoFormulario: readonly string[];
  /** O aviso dos campos fora do formulario so aparece no passo 1 ou no resumo. */
  mostrarForaDoFormulario: boolean;
  mostrarResumo: boolean;
  problemas: readonly ProblemaCampo[];
  /** Quantos problemas tem o horario variavel (so contam no resumo). */
  problemasHorario: number;
  onIrParaProblema: (problema: ProblemaCampo) => void;
  duplicadosTravao: readonly CandidatoDuplicado[];
  duplicadosSinal: readonly CandidatoDuplicado[];
  temDuplicadoTravao: boolean;
  confirmouSinal: boolean;
  onConfirmarSinal: (confirmou: boolean) => void;
  onAbrirFichaExistente: (pessoaId: string) => void;
  duplicadosSemAcesso: boolean;
  duplicadosDemasiadasTentativas: boolean;
  /** "RH, agora" e a configuracao da admissao falhou a carregar. */
  configuracaoNaoCarregada: boolean;
}

export function PessoaFormAvisos({
  camposForaDoFormulario,
  mostrarForaDoFormulario,
  mostrarResumo,
  problemas,
  problemasHorario,
  onIrParaProblema,
  duplicadosTravao,
  duplicadosSinal,
  temDuplicadoTravao,
  confirmouSinal,
  onConfirmarSinal,
  onAbrirFichaExistente,
  duplicadosSemAcesso,
  duplicadosDemasiadasTentativas,
  configuracaoNaoCarregada,
}: PessoaFormAvisosProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* A configuracao nao chegou: nao se sabe que campos ficam como
          pendencia, e a ficha pode sair incompleta sem ninguem o dizer. */}
      {configuracaoNaoCarregada && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-400/50 bg-amber-50/50 p-3 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{t("hr.form.configuracaoNaoCarregada")}</p>
        </div>
      )}

      {camposForaDoFormulario.length > 0 && mostrarForaDoFormulario && (
        <div
          role="note"
          className="space-y-1 rounded-md border border-amber-400/50 bg-amber-50/50 p-3 dark:bg-amber-950/20"
        >
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {t("hr.form.camposFicamPendencia")}
          </p>
          <ul className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
            {camposForaDoFormulario.map((codigo) => (
              <li key={codigo}>{rotuloDeCampoAdmissao(t, codigo)}</li>
            ))}
          </ul>
        </div>
      )}

      {mostrarResumo && (problemas.length > 0 || problemasHorario > 0) && (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">
            {t("hr.form.resumoProblemas").replace("{n}", String(problemas.length + problemasHorario))}
          </p>
          <ul className="space-y-1">
            {problemas.map((problema) => (
              <li key={`${problema.seccao}-${problema.campoId}`}>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => onIrParaProblema(problema)}
                >
                  {t(`hr.form.seccoes.${problema.seccao}`)} → {t(problema.rotuloKey)}
                </Button>
              </li>
            ))}
            {problemasHorario > 0 && (
              <li className="text-xs text-destructive">
                {t("hr.form.seccoes.contrato")} → {t("hr.horario.titulo")} ({problemasHorario})
              </li>
            )}
          </ul>
        </div>
      )}

      {(duplicadosTravao.length > 0 || duplicadosSinal.length > 0) && (
        <div
          className={cn(
            "space-y-2 rounded-md border p-3",
            temDuplicadoTravao
              ? "border-destructive/40 bg-destructive/5"
              : "border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20",
          )}
        >
          {duplicadosTravao.map((c) => (
            <div key={`travao-${c.pessoaId}-${c.campoCoincidente}`} className="space-y-1">
              <p className="text-sm font-medium text-destructive">
                {t(`hr.duplicados.campo.${c.campoCoincidente}`)} — {t("hr.duplicados.travao.titulo")}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.estado === "apagada"
                  ? t("hr.duplicados.apagada.descricao")
                  : t("hr.duplicados.travao.descricao")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAbrirFichaExistente(c.pessoaId)}
              >
                {t("hr.duplicados.abrirFicha")}
              </Button>
            </div>
          ))}

          {!temDuplicadoTravao && duplicadosSinal.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                {t("hr.duplicados.sinal.titulo")}
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {duplicadosSinal.map((c) => (
                  <li key={`sinal-${c.pessoaId}-${c.campoCoincidente}`}>
                    {t(`hr.duplicados.campo.${c.campoCoincidente}`)} —{" "}
                    {c.estado === "apagada"
                      ? t("hr.duplicados.apagada.descricao")
                      : t("hr.duplicados.sinal.descricao")}
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={confirmouSinal}
                  onCheckedChange={(v) => onConfirmarSinal(v === true)}
                />
                {t("hr.duplicados.sinal.confirmar")}
              </label>
            </div>
          )}
        </div>
      )}

      {duplicadosSemAcesso && (
        <p className="text-xs text-muted-foreground">{t("hr.duplicados.semAcesso")}</p>
      )}

      {/* Travao de tentativas (20261201030000): lista vazia AQUI nao e "sem
          duplicado" -- e a verificacao temporariamente indisponivel. O
          formulario continua a deixar gravar: a unicidade real vem dos indices
          unicos por organizacao (idx_pessoas_identificacao_nif_org /
          ..._niss_org, 20261130040000), nao desta verificacao de conforto. */}
      {duplicadosDemasiadasTentativas && (
        <p className="text-xs text-muted-foreground">{t("hr.duplicados.demasiadasTentativas")}</p>
      )}
    </>
  );
}
