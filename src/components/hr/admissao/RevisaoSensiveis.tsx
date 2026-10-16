/**
 * NISS e IBAN na revisao: por omissao so se diz se estao preenchidos. «Revelar» pede o valor a base (segunda leitura, com
 * `hr.onboarding.sensitive`, registada em cada vez) e mostra-o.
 *
 * O valor vive SO neste componente e SO enquanto esta visivel: apaga-se ao ocultar, ao fim de um minuto, ao fechar a
 * janela e ao mudar de processo (quem monta tem de usar `key` com o processo). Nunca vai para toast, armazenamento do
 * browser, consola nem URL. Sem a permissao o botao fica `aria-disabled`, com a razao a vista.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { chaveDoErro } from "@/lib/hr/admissaoPipeline";
import { CAMPOS_SENSIVEIS, revelouComSucesso, type CampoSensivel, type ResultadoRevelar } from "@/lib/hr/admissaoRevisao";
import { cn } from "@/lib/utils";

/** Quanto tempo o valor fica visivel antes de voltar a esconder-se. */
export const REVELAR_MS = 60_000;

interface RevisaoSensiveisProps {
  niss: { preenchido: boolean };
  iban: { preenchido: boolean };
  /** `hr.onboarding.sensitive`. */
  podeRevelar: boolean;
  revelar: (campo: CampoSensivel) => Promise<ResultadoRevelar>;
}

type Valores = Partial<Record<CampoSensivel, string>>;

export function RevisaoSensiveis({ niss, iban, podeRevelar, revelar }: RevisaoSensiveisProps) {
  const { t } = useTranslation();
  const idRazao = useId();
  const [valores, setValores] = useState<Valores>({});
  const [aObter, setAObter] = useState<CampoSensivel | null>(null);
  const [erros, setErros] = useState<Partial<Record<CampoSensivel, string>>>({});
  const temporizadores = useRef<Partial<Record<CampoSensivel, ReturnType<typeof setTimeout>>>>({});
  const montado = useRef(true);

  const ocultar = useCallback((campo: CampoSensivel) => {
    clearTimeout(temporizadores.current[campo]);
    delete temporizadores.current[campo];
    setValores((atuais) => {
      const resto = { ...atuais };
      delete resto[campo];
      return resto;
    });
  }, []);

  useEffect(() => {
    montado.current = true;
    const guardados = temporizadores.current;
    return () => {
      montado.current = false;
      Object.values(guardados).forEach((id) => clearTimeout(id));
    };
  }, []);

  const pedir = async (campo: CampoSensivel) => {
    if (!podeRevelar || aObter !== null) return;
    setAObter(campo);
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
    const resultado = await revelar(campo);
    if (!montado.current) return;
    setAObter(null);
    if (!revelouComSucesso(resultado)) {
      setErros((atuais) => ({ ...atuais, [campo]: t(chaveDoErro(resultado.codigo, "rhAdm.erro.revelarGenerico")) }));
      return;
    }
    setValores((atuais) => ({ ...atuais, [campo]: resultado.valor }));
    temporizadores.current[campo] = setTimeout(() => ocultar(campo), REVELAR_MS);
  };

  const dados: Record<CampoSensivel, { rotulo: string; preenchido: boolean }> = {
    niss: { rotulo: t("hr.campos.niss"), preenchido: niss.preenchido },
    iban: { rotulo: t("hr.pendencias.campo.conta_numero"), preenchido: iban.preenchido },
  };

  return (
    <section aria-labelledby={`${idRazao}-titulo`} className="space-y-2">
      <h3 id={`${idRazao}-titulo`} className="text-sm font-semibold">
        {t("rhAdm.revisao.sensiveis")}
      </h3>
      <p className="text-xs text-muted-foreground">{t("rhAdm.revisao.sensiveisAjuda")}</p>
      <ul className="divide-y rounded-md border px-3">
        {CAMPOS_SENSIVEIS.map((campo) => {
          const { rotulo, preenchido } = dados[campo];
          const valor = valores[campo];
          const aTrabalhar = aObter === campo;
          const bloqueado = !podeRevelar || aObter !== null;
          return (
            <li key={campo} className="space-y-1 py-2">
              <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-xs text-muted-foreground">{rotulo}</span>
                  <p className="text-sm">{preenchido ? t("rhAdm.revisao.preenchido") : t("rhAdm.revisao.valorVazio")}</p>
                </div>
                {preenchido && valor === undefined && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn("min-h-11 gap-1.5", FOCO, bloqueado && "cursor-not-allowed opacity-50")}
                    aria-label={t("rhAdm.revisao.revelarRotulo", { campo: rotulo })}
                    aria-disabled={bloqueado || undefined}
                    aria-describedby={!podeRevelar ? idRazao : undefined}
                    onClick={() => void pedir(campo)}
                  >
                    {aTrabalhar ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                    {aTrabalhar ? t("rhAdm.revisao.aObter") : t("rhAdm.revisao.revelar")}
                  </Button>
                )}
                {valor !== undefined && (
                  <div className="flex items-center gap-3">
                    <span className="break-all font-mono text-sm tabular-nums">{valor}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn("min-h-11 gap-1.5", FOCO)}
                      aria-label={t("rhAdm.revisao.ocultarRotulo", { campo: rotulo })}
                      onClick={() => ocultar(campo)}
                    >
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                      {t("rhAdm.revisao.ocultar")}
                    </Button>
                  </div>
                )}
              </div>
              <span role="status" className="sr-only">
                {valor !== undefined ? t("rhAdm.revisao.revelado", { campo: rotulo }) : ""}
              </span>
              {erros[campo] && (
                <p role="alert" className="text-xs text-destructive">
                  {erros[campo]}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {!podeRevelar && (
        <p id={idRazao} className="text-xs text-muted-foreground">
          {t("rhAdm.revisao.semPermissao")}
        </p>
      )}
    </section>
  );
}
