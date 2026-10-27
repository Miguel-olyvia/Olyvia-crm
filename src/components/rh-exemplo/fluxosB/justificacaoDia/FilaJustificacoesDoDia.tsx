/**
 * As justificações de dias com falta sugerida ou atraso, por decidir, como linhas da fila de trabalho do RH (separador
 * «Fila de trabalho» do mapa de assiduidade): chip de texto, pessoa, dia, tipo, motivo resumido, há quanto tempo e os
 * botões Aceitar e Recusar. Decidida, a linha sai daqui; o calendário da pessoa, o mapa e o cálculo do mês acompanham.
 * Um motivo de consulta médica é dado de saúde: não se mostra na fila, só no dia da pessoa com «Ver texto».
 *
 * As pendentes vêm da base e são lidas por quem monta o ecrã (o contador do separador usa as mesmas): esta fila não lê
 * nada por si. Uma lista vazia só diz «não há nada por decidir» quando a leitura correu bem; enquanto lê, quando falha, quando
 * a base recusa ou quando a migration ainda não foi aplicada, diz-se isso mesmo.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import { diasDesdeEnvio, resumoDoMotivo, textoEhSensivel, type JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import { useTranslation } from "@/hooks/useTranslation";
import { DialogosDecisaoDia, type PedidoDecisaoDia } from "./DialogosDecisaoDia";
import type { PendentesJustificacaoDia } from "./usePendentesJustificacaoDia";
import { useDecisaoDoDia } from "./useDecisaoDoDia";

interface LinhaProps {
  j: JustificacaoDia;
  nome: string;
  hoje: string;
  /** É a justificação de quem está a ver: ninguém decide a sua (a base recusa-o); não se oferecem os botões. */
  propria: boolean;
  aoPedir: (j: JustificacaoDia, tipo: "aceitar" | "recusar") => void;
}

function Linha({ j, nome, hoje, propria, aoPedir }: LinhaProps) {
  const { t } = useTranslation();
  const dias = diasDesdeEnvio(j.enviadaEm, hoje);
  const dia = formatarData(j.data);
  return (
    <li data-testid={`rhjd-fila-${j.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm">
      <span className="min-w-40 font-medium">{nome}</span>
      <span className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
        {t("rhJust.fila.chip")}
      </span>
      <span className="tabular-nums text-muted-foreground">{dia}</span>
      <span>{t(`rhJust.tipo.${j.tipo}`)}</span>
      <span className="min-w-0 flex-1 basis-60 text-muted-foreground">{textoEhSensivel(j) ? t("rhJust.rh.textoReservado") : resumoDoMotivo(j.motivo)}</span>
      <span className="text-xs text-muted-foreground">{dias === 0 ? t("rhJust.fila.hoje") : t("rhJust.fila.haDias", { n: String(dias) })}</span>
      {propria ? (
        <span className="ml-auto text-xs text-muted-foreground" data-testid={`rhjd-fila-propria-${j.id}`}>{t("rhJust.rh.propriaSemDecisao")}</span>
      ) : (
        <div className="ml-auto flex flex-wrap gap-2">
          <Button type="button" size="sm" className="min-h-11" aria-label={t("rhJust.rh.ariaAceitar", { pessoa: nome, dia })} onClick={() => aoPedir(j, "aceitar")}>
            {t("rhJust.rh.aceitar")}
          </Button>
          <Button type="button" size="sm" variant="outline" className="min-h-11" aria-label={t("rhJust.rh.ariaRecusar", { pessoa: nome, dia })} onClick={() => aoPedir(j, "recusar")}>
            {t("rhJust.rh.recusar")}
          </Button>
        </div>
      )}
    </li>
  );
}

interface FilaProps {
  /** As pendentes da base, lidas uma vez por quem monta o ecrã (o contador do separador usa as mesmas). */
  pendentes: PendentesJustificacaoDia;
  nomePorPessoaId: ReadonlyMap<string, string>;
  /** Chamado quando a aceitação deixou uma falta nova na base: o mapa da organização relê o mês para a mostrar. */
  aoCriarFalta?: () => void;
  /** A ficha de quem está a ver (`useMinhaPessoa`): a linha dela fica sem botões de decidir. */
  minhaPessoaId?: string | null;
}

export function FilaJustificacoesDoDia({ pendentes: leitura, nomePorPessoaId, aoCriarFalta, minhaPessoaId = null }: FilaProps) {
  const { t } = useTranslation();
  const [pedido, setPedido] = useState<PedidoDecisaoDia | null>(null);
  const { decidir, mensagem: aviso, executor } = useDecisaoDoDia(aoCriarFalta);
  const { loading, erro, indisponivel, recusado, recarregar } = leitura;
  const pendentes = useMemo(() => [...leitura.justificacoes].sort((a, b) => b.data.localeCompare(a.data)), [leitura.justificacoes]);
  const nome = (id: string): string => nomePorPessoaId.get(id) ?? t("rhJust.fila.pessoaSemNome");
  // Uma lista vazia só quer dizer «nada por decidir» se a leitura correu bem.
  const leituraBoa = !loading && !erro && !indisponivel && !recusado;

  return (
    <Card aria-labelledby="rhjd-fila-titulo" data-testid="rhjd-fila">
      <CardHeader className="pb-3">
        <CardTitle id="rhjd-fila-titulo" className="text-base">{t("rhJust.fila.titulo")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("rhJust.fila.ajuda")}</p>
        {leituraBoa && (
          <p aria-live="polite" className="text-sm text-muted-foreground">{t("rhJust.fila.contagem", { n: String(pendentes.length) })}</p>
        )}
        {aviso && (
          <p role={aviso.erro ? "alert" : "status"} className={`text-sm font-medium ${aviso.erro ? "text-destructive" : ""}`} data-testid="rhjd-fila-aviso">
            {aviso.texto}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {loading && <p role="status" className="py-6 text-center text-sm text-muted-foreground">{t("rhJust.carregando")}</p>}
        {indisponivel && (
          <p role="status" className="py-6 text-center text-sm text-muted-foreground" data-testid="rhjd-fila-indisponivel">{t("rhJust.erro.indisponivel")}</p>
        )}
        {recusado && (
          <p role="alert" className="py-6 text-center text-sm font-medium text-destructive" data-testid="rhjd-fila-recusado">{t("rhJust.erro.semPermissao")}</p>
        )}
        {erro && (
          <div className="flex flex-col items-center gap-2 py-6" data-testid="rhjd-fila-erro">
            <p role="alert" className="text-center text-sm font-medium text-destructive">{t("rhJust.erro.leitura")}</p>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void recarregar()}>{t("rhJust.tentarDeNovo")}</Button>
          </div>
        )}
        {leituraBoa && pendentes.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("rhJust.fila.vazia")}</p>
        )}
        {leituraBoa && pendentes.length > 0 && (
          <ul className="divide-y">
            {pendentes.map((j) => (
              <Linha
                key={j.id} j={j} nome={nome(j.pessoaId)} hoje={hojeIso()} propria={minhaPessoaId !== null && j.pessoaId === minhaPessoaId}
                aoPedir={(x, tipo) => setPedido({ justificacao: x, tipo, pessoaNome: nome(x.pessoaId) })}
              />
            ))}
          </ul>
        )}
      </CardContent>
      <DialogosDecisaoDia pedido={pedido} aoFechar={() => setPedido(null)} aoDecidir={decidir} />
      {executor}
    </Card>
  );
}
