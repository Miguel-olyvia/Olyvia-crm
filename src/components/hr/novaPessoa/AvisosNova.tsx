// Os avisos do painel «Nova pessoa», acima das abas (visíveis em todas): a configuração da admissão que não chegou e os
// duplicados. É só apresentação: o estado e as decisões ficam no formulário.
//
// DUPLICADOS (`hr_pessoa_duplicados_candidatos`): um NIF ou NISS igual ao de outra ficha TRAVA (dois documentos oficiais iguais
// só podem ser a mesma pessoa) e há como abrir a ficha que já existe; um sinal (e-mail pessoal, documento, nome e nascimento)
// podia ser acaso e pede uma confirmação explícita.
//
// UMA FICHA APAGADA com o mesmo NIF ou NISS também trava, mas NÃO se pode abrir (a ficha já não existe para quem a abre): em
// vez do botão «Abrir ficha existente» diz-se, por escrito, que a ficha está apagada e o que fazer.
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/hooks/useTranslation";
import type { CandidatoDuplicado } from "@/hooks/usePessoaDuplicados";
import { cn } from "@/lib/utils";

export interface AvisosNovaProps {
  /** A configuração da admissão não chegou (a ler, a falhar...) e é o RH a preencher: não se sabe o que é obrigatório. */
  configuracaoNaoCarregada: boolean;
  /** A base recusou ler a configuração por permissão: não há obrigatórios a aplicar, e di-se (não é uma falha). */
  configuracaoSemAcesso: boolean;
  duplicadosTravao: readonly CandidatoDuplicado[];
  duplicadosSinal: readonly CandidatoDuplicado[];
  confirmouSinal: boolean;
  aoConfirmarSinal: (confirmou: boolean) => void;
  aoAbrirFichaExistente: (pessoaId: string) => void;
  duplicadosSemAcesso: boolean;
  duplicadosDemasiadasTentativas: boolean;
}

export function AvisosNova({
  configuracaoNaoCarregada, configuracaoSemAcesso, duplicadosTravao, duplicadosSinal, confirmouSinal, aoConfirmarSinal,
  aoAbrirFichaExistente, duplicadosSemAcesso, duplicadosDemasiadasTentativas,
}: AvisosNovaProps) {
  const { t } = useTranslation();
  const temTravao = duplicadosTravao.length > 0;
  return (
    <>
      {configuracaoNaoCarregada && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-400/50 bg-amber-50/50 p-3 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{t("hr.form.configuracaoNaoCarregada")}</p>
        </div>
      )}

      {configuracaoSemAcesso && (
        <p role="note" className="rounded-md border p-3 text-sm text-muted-foreground">
          {t("hr.form.configuracaoSemAcesso")}
        </p>
      )}

      {(temTravao || duplicadosSinal.length > 0) && (
        <div
          className={cn(
            "space-y-2 rounded-md border p-3",
            temTravao ? "border-destructive/40 bg-destructive/5" : "border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20",
          )}
        >
          {duplicadosTravao.map((c) => {
            const apagada = c.estado === "apagada";
            return (
              <div key={`travao-${c.pessoaId}-${c.campoCoincidente}`} className="space-y-1">
                <p className="text-sm font-medium text-destructive">
                  {t(`hr.duplicados.campo.${c.campoCoincidente}`)} — {t(apagada ? "hr.duplicados.apagada.titulo" : "hr.duplicados.travao.titulo")}
                </p>
                <p className="text-xs text-muted-foreground">{t(apagada ? "hr.duplicados.apagada.travao" : "hr.duplicados.travao.descricao")}</p>
                {!apagada && (
                  <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => aoAbrirFichaExistente(c.pessoaId)}>
                    {t("hr.duplicados.abrirFicha")}
                  </Button>
                )}
              </div>
            );
          })}

          {!temTravao && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{t("hr.duplicados.sinal.titulo")}</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {duplicadosSinal.map((c) => (
                  <li key={`sinal-${c.pessoaId}-${c.campoCoincidente}`}>
                    {t(`hr.duplicados.campo.${c.campoCoincidente}`)} —{" "}
                    {c.estado === "apagada" ? t("hr.duplicados.apagada.descricao") : t("hr.duplicados.sinal.descricao")}
                  </li>
                ))}
              </ul>
              <label className="flex min-h-11 items-center gap-2 text-xs">
                <Checkbox checked={confirmouSinal} onCheckedChange={(v) => aoConfirmarSinal(v === true)} />
                {t("hr.duplicados.sinal.confirmar")}
              </label>
            </div>
          )}
        </div>
      )}

      {duplicadosSemAcesso && <p className="text-xs text-muted-foreground">{t("hr.duplicados.semAcesso")}</p>}

      {/* Travão de tentativas: lista vazia AQUI não é «sem duplicado», é a verificação temporariamente indisponível. A criação
          continua a poder gravar: a unicidade real vem dos índices únicos por organização, não desta verificação de conforto. */}
      {duplicadosDemasiadasTentativas && <p className="text-xs text-muted-foreground">{t("hr.duplicados.demasiadasTentativas")}</p>}
    </>
  );
}
