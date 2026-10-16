// O rodapé fixo do painel "Nova pessoa": o aviso dos erros que faltam corrigir, "Cancelar", "Criar e enviar convite"
// (secundária: a pessoa preenche o resto; o link vale 7 dias) e "Criar pessoa" (o único botão primário).
//
// Um botão travado sem explicação é só um enigma: quando algo trava a criação (a configuração da admissão ainda a carregar,
// uma verificação de duplicados em curso, um NIF ou NISS de outra ficha, um sinal de duplicado por confirmar) o motivo está
// escrito, em texto visível, ligado aos botões por `aria-describedby`.
//
// OS BOTÕES TRAVADOS NÃO ESTÃO `disabled` (mesmo padrão de `BotaoCriarAcesso`): um botão desativado sai da ordem do teclado e
// o leitor de ecrã passa-lhe ao lado, e um formulário com o botão de envio desativado ignora o Enter em silêncio. Ficam
// focáveis com `aria-disabled`, e quem decide o que fazer ao clique (ou ao Enter) é o formulário, que diz o motivo em
// `role="status"` (`anuncio`) em vez de não fazer nada.
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { DIAS_DO_CONVITE } from "./tiposNova";

interface RodapeNovaProps {
  erros: number;
  /** A ficha está a ser criada. */
  aCriar: boolean;
  /** A chave do que trava a criação agora (verificação, duplicado, sinal, configuração a carregar), ou `null`. */
  motivoCriar: string | null;
  /** Um duplicado (travão, ou sinal por confirmar) trava também o convite; a configuração a carregar não (o convite não depende dela). */
  conviteTravado: boolean;
  /** Quem cria não pode enviar convites (`hr.pessoas.convite.enviar`): o botão fica travado, com a explicação. */
  semPermissaoConvite: boolean;
  /** O motivo de a última tentativa não ter criado nada (já traduzido), ou `null`: lê-se em `role="status"`. */
  anuncio: string | null;
  aoCancelar: () => void;
  aoCriarEConvidar: () => void;
}

const ID_MOTIVO = "rh-nova-motivo";
const ID_NOTA = "rh-nova-convite-nota";
const TRAVADO = "cursor-not-allowed opacity-50";

export function RodapeNova({ erros, aCriar, motivoCriar, conviteTravado, semPermissaoConvite, anuncio, aoCancelar, aoCriarEConvidar }: RodapeNovaProps) {
  const { t } = useTranslation();
  const criarBloqueado = aCriar || motivoCriar !== null;
  const conviteBloqueado = aCriar || semPermissaoConvite || conviteTravado;
  const criarDescrito = motivoCriar !== null ? ID_MOTIVO : undefined;
  const textoDeEstado = anuncio ?? (erros === 0 ? "" : t(erros === 1 ? "rhNova.erros.um" : "rhNova.erros.varios", { n: erros }));
  return (
    <footer className="space-y-2 border-t border-border p-4 px-6">
      <p role="status" className="min-h-5 text-sm text-destructive">{textoDeEstado}</p>
      {motivoCriar !== null && <p id={ID_MOTIVO} className="text-sm text-muted-foreground">{t(motivoCriar)}</p>}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          type="button" variant="ghost" aria-disabled={aCriar || undefined} onClick={() => { if (!aCriar) aoCancelar(); }}
          className={cn("min-h-11", aCriar && TRAVADO, FOCO)}
        >
          {t("rhForm.nova.cancel")}
        </Button>
        <Button
          type="button" variant="outline" onClick={() => { if (!aCriar) aoCriarEConvidar(); }}
          aria-disabled={conviteBloqueado || undefined}
          aria-describedby={semPermissaoConvite ? ID_NOTA : conviteTravado ? ID_MOTIVO : ID_NOTA}
          className={cn("min-h-11", conviteBloqueado && TRAVADO, FOCO)}
        >
          {t("rhNova.criarEConvidar")}
        </Button>
        <Button
          type="submit" aria-disabled={criarBloqueado || undefined} aria-describedby={criarDescrito}
          className={cn("min-h-11 gap-2", criarBloqueado && TRAVADO, FOCO)}
        >
          {aCriar && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {t("rhForm.nova.create")}
        </Button>
      </div>
      <p id={ID_NOTA} className="text-right text-xs text-muted-foreground">
        {semPermissaoConvite ? t("hr.form.conviteSemPermissao") : t("rhNova.convite.nota", { dias: DIAS_DO_CONVITE })}
      </p>
    </footer>
  );
}
