// O último passo da admissão na ficha: o contrato está assinado e só falta dar o acesso («Enviar acesso», que abre o diálogo de
// criar acesso que já existe) e concluir. Com a conta já criada, «Concluir admissão». Só aparece em assinaturas_concluidas e
// a_aguardar_ativacao; com a admissão concluída o passo «Acesso» da faixa já está feito e não há botão.
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { podeConcluirAdmissao } from "@/components/rh-exemplo/hooks/estadoAdmissaoReal";
import type { ResumoConvite } from "@/components/rh-exemplo/hooks/useConviteAdmissaoResumo";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

const ID_TITULO = "hr-acesso-passo-titulo";

interface PassoAcessoAdmissaoProps {
  resumo: ResumoConvite | null;
  temConta: boolean;
  /** `hr.pessoas.conta.criar`: sem ela não há «Enviar acesso». */
  podeCriarAcesso: boolean;
  /** `hr.onboarding.approve`: a RPC que conclui exige-a, por isso sem ela não há botão em nenhum dos casos. */
  podeAprovar: boolean;
  aoEnviarAcesso: () => void;
  aoConcluir: () => void;
  aConcluir: boolean;
  /** O texto traduzido da última tentativa de concluir que falhou. */
  erro: string | null;
  /** A conta foi criada mas o e-mail das credenciais não saiu: conclui-se depois de reenviar. */
  emailNaoSaiu?: boolean;
}

/** A frase de qual permissão falta; `null` quando há tudo o que o passo atual precisa. */
function permissaoEmFalta(temConta: boolean, podeCriarAcesso: boolean, podeAprovar: boolean): string | null {
  if (!podeAprovar) return "hr.acesso.passo.semPermissaoAprovar";
  if (!temConta && !podeCriarAcesso) return "hr.acesso.passo.semPermissaoCriar";
  return null;
}

export function PassoAcessoAdmissao({
  resumo, temConta, podeCriarAcesso, podeAprovar, aoEnviarAcesso, aoConcluir, aConcluir, erro, emailNaoSaiu = false,
}: PassoAcessoAdmissaoProps) {
  const { t } = useTranslation();
  if (!resumo || resumo.conviteId === null || !podeConcluirAdmissao(resumo.estado)) return null;

  const chaveSemPermissao = permissaoEmFalta(temConta, podeCriarAcesso, podeAprovar);
  const mostrarEnviar = !temConta && chaveSemPermissao === null;
  const mostrarConcluir = temConta && podeAprovar;

  return (
    <section aria-labelledby={ID_TITULO}>
      <Card className="border-emerald-500/40">
        <CardHeader className="pb-3">
          <h2 id={ID_TITULO} className="flex items-center gap-2 text-base font-semibold leading-none tracking-tight">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            {t("hr.acesso.passo.titulo")}
          </h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t(temConta ? "hr.acesso.passo.comConta" : "hr.acesso.passo.semConta")}
          </p>
          {temConta && emailNaoSaiu && (
            <p role="status" className="text-sm text-amber-700 dark:text-amber-400">{t("hr.acesso.passo.emailNaoSaiu")}</p>
          )}
          {chaveSemPermissao && <p className="text-sm text-muted-foreground">{t(chaveSemPermissao)}</p>}
          {mostrarEnviar && (
            <Button type="button" className={cn("min-h-11 gap-2", FOCO)} onClick={aoEnviarAcesso} disabled={aConcluir}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {t("hr.acesso.passo.enviar")}
            </Button>
          )}
          {mostrarConcluir && (
            <Button type="button" className={cn("min-h-11 gap-2", FOCO)} onClick={aoConcluir} disabled={aConcluir}>
              {aConcluir && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {t("hr.acesso.passo.concluir")}
            </Button>
          )}
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
