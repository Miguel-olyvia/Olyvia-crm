/**
 * O rodape do assistente de criacao de pessoa: o interruptor "enviar convite" e
 * os botoes (cancelar, anterior, seguinte, criar).
 *
 * O convite e uma ACCAO, nao um modo: o formulario e o mesmo. Ligado, a ficha
 * cria-se e o convite abre a seguir (so se exige o e-mail pessoal); desligado, o
 * RH preenche. Extraido de `PessoaFormDialog` (que passava das 800 linhas): so
 * apresentacao, as decisoes ficam no assistente.
 *
 * "Criar" fica activo a partir dos dois nomes, em QUALQUER passo: quem tem uma
 * admissao as pressas nunca ve um bloqueio antes de clicar.
 */
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { CampoInterruptor } from "@/components/hr/form/Campos";
import { useTranslation } from "@/hooks/useTranslation";

interface PessoaFormRodapeProps {
  enviarConvite: boolean;
  onEnviarConvite: (ligado: boolean) => void;
  /**
   * Sem `hr.pessoas.convite.enviar` o interruptor fica desactivado, com a
   * explicacao, e o formulario segue o regime sem convite.
   */
  podeEnviarConvite: boolean;
  /**
   * Porque e que Criar esta desactivado, JA traduzido, ou `null` se nao esta.
   * Fica visivel no rodape e ligado ao botao por `aria-describedby`: um botao
   * cinzento sem frase nao diz a ninguem o que falta.
   */
  motivoCriarDesactivado: string | null;
  aCriar: boolean;
  primeiroPasso: boolean;
  ultimoPasso: boolean;
  criarDesactivado: boolean;
  onCancelar: () => void;
  onAnterior: () => void;
  onSeguinte: () => void;
  onCriar: () => void;
}

export function PessoaFormRodape({
  enviarConvite,
  onEnviarConvite,
  podeEnviarConvite,
  motivoCriarDesactivado,
  aCriar,
  primeiroPasso,
  ultimoPasso,
  criarDesactivado,
  onCancelar,
  onAnterior,
  onSeguinte,
  onCriar,
}: PessoaFormRodapeProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="border-t px-4 pt-3">
        <CampoInterruptor
          id="hr-novo-enviar-convite"
          label={t("hr.form.enviarConvite")}
          descricao={t(
            !podeEnviarConvite
              ? "hr.form.conviteSemPermissao"
              : enviarConvite
                ? "hr.form.enviarConviteAjudaLigado"
                : "hr.form.enviarConviteAjudaDesligado",
          )}
          checked={enviarConvite && podeEnviarConvite}
          disabled={aCriar || !podeEnviarConvite}
          onChange={onEnviarConvite}
        />
      </div>

      {motivoCriarDesactivado && (
        <p id="hr-novo-criar-motivo" className="px-4 pt-3 text-xs text-muted-foreground">
          {motivoCriarDesactivado}
        </p>
      )}

      <DialogFooter className="flex-row items-center justify-between gap-2 p-4">
        <Button variant="ghost" onClick={onCancelar} disabled={aCriar} className="mr-auto">
          {t("common.cancel")}
        </Button>
        <Button variant="outline" disabled={primeiroPasso || aCriar} onClick={onAnterior}>
          {t("common.previous")}
        </Button>
        <Button variant="outline" disabled={ultimoPasso || aCriar} onClick={onSeguinte}>
          {t("common.next")}
        </Button>
        <Button
          onClick={onCriar}
          disabled={criarDesactivado}
          aria-describedby={motivoCriarDesactivado ? "hr-novo-criar-motivo" : undefined}
        >
          {aCriar && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {t(enviarConvite ? "hr.form.criarEEnviarConvite" : "hr.form.criarFicha")}
        </Button>
      </DialogFooter>
    </>
  );
}
