/**
 * Faltas e justificacoes (fluxo 7). As FALTAS vem da base real: a lista e a vista `v_hr_faltas_em_vigor` do mes que o
 * ecra de tras ja carregou, e marcar, anular, justificar e decidir sao RPCs. O sistema so SUGERE a falta (uma linha na
 * lista do RH, que nao desconta nada); o RH MARCA (dia, hora de inicio e de fim). Cada falta abre o detalhe.
 *
 * As SUGESTOES vem dos desvios reais (`hr_assiduidade_desvios`, tipo «turno planeado sem horas»), lidos pelo ecra de
 * tras. O PRAZO para justificar e da organizacao (`hr_regras_assiduidade`, 5 por omissao): le-se e grava-se pelo wrapper
 * `usePrazoJustificacao`, so com a permissao de configurar, de 1 a 30 dias uteis. Ja nao ha prazo em memoria.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { AvisoDeLeitura, leituraFalhou, type EstadoDeLeitura } from "@/components/rh-exemplo/AvisoDeLeitura";
import { AvisoDoPrazo } from "@/components/rh-exemplo/AvisoDoPrazo";
import { PRAZO_JUSTIFICACAO_MAX, PRAZO_JUSTIFICACAO_MIN, prazoJustificacaoValido } from "@/components/rh-exemplo/hooks/prazoJustificacao";
import { usePrazoJustificacao } from "@/components/rh-exemplo/hooks/usePrazoJustificacao";
import { FaltaDetalhe } from "@/components/rh-exemplo/fluxosB/faltas/FaltaDetalhe";
import { MarcarFaltaForm, type FaltaPreenchida, type PessoaDaLista } from "@/components/rh-exemplo/fluxosB/faltas/MarcarFaltaForm";
import { formatarData, formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { sugestoesDeFaltaDosDesvios } from "@/components/rh-exemplo/lib/alertasFimDia";
import { rotuloDaJustificacao } from "@/components/rh-exemplo/lib/faltasB";
import type { Desvio, Falta, PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";

interface FaltasPainelProps {
  /** As faltas em vigor da janela que o ecra de tras mostra (`v_hr_faltas_em_vigor`). */
  faltas: readonly Falta[];
  /** Os desvios da mesma janela (`hr_assiduidade_desvios`): daqui saem as sugestoes. */
  desvios: readonly Desvio[];
  pessoas: readonly PessoaDaLista[];
  permissoes: PermissoesAssiduidade;
  /** Para o ecra de tras reler a lista depois de marcar, anular, justificar ou decidir. */
  onAlterado: () => void;
  /** Se a leitura das faltas / dos desvios foi recusada ou falhou: uma lista vazia nao prova que nao ha nada. */
  leituraFaltas?: EstadoDeLeitura;
  leituraDesvios?: EstadoDeLeitura;
  onTentarDeNovo?: () => void;
}

export function FaltasPainel({
  faltas,
  desvios,
  pessoas,
  permissoes,
  onAlterado,
  leituraFaltas,
  leituraDesvios,
  onTentarDeNovo,
}: FaltasPainelProps) {
  const { t } = useTranslation();
  const prazo = usePrazoJustificacao();
  // O que se escreveu no campo e ainda nao se gravou (`null`: o campo mostra o prazo da organizacao).
  const [rascunho, setRascunho] = useState<string | null>(null);
  const [erroDoPrazo, setErroDoPrazo] = useState<string | null>(null);
  const valorDoCampo = rascunho ?? String(prazo.dias);
  const alterado = rascunho !== null && rascunho !== String(prazo.dias);

  const guardarPrazo = async () => {
    const valor = rascunho === null || rascunho.trim() === "" ? Number.NaN : Number(rascunho);
    if (!prazoJustificacaoValido(valor)) return setErroDoPrazo(t("rhRegrasAssid.erro.prazoInvalido"));
    const { erro } = await prazo.gravar(valor);
    if (erro) return setErroDoPrazo(t(erro));
    setErroDoPrazo(null);
    setRascunho(null);
    toast.success(t("rhExemplo.fal.prazoGuardado", { dias: String(valor) }));
  };
  const [marcar, setMarcar] = useState<{ inicial: FaltaPreenchida | null; chave: string } | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  const nomePorId = useMemo(() => new Map(pessoas.map((p) => [p.id, p.nome])), [pessoas]);
  const nomeDe = (pessoaId: string): string => nomePorId.get(pessoaId) ?? pessoaId;
  const sugestoes = useMemo(() => sugestoesDeFaltaDosDesvios(desvios, faltas), [desvios, faltas]);
  const ordenadas = useMemo(
    () => [...faltas].sort((a, b) => b.data.localeCompare(a.data) || b.hora_inicio.localeCompare(a.hora_inicio)),
    [faltas],
  );
  const falta = aberta ? ordenadas.find((f) => f.id === aberta) ?? null : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("rhExemplo.fal.titulo")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("rhExemplo.fal.ajuda")}</p>
          <div className="flex flex-wrap items-end gap-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="rhb-prazo-falta">{t("rhExemplo.fal.prazoConfig")}</Label>
              <Input
                id="rhb-prazo-falta"
                type="number"
                min={PRAZO_JUSTIFICACAO_MIN}
                max={PRAZO_JUSTIFICACAO_MAX}
                step={1}
                className="min-h-11 w-28"
                value={valorDoCampo}
                disabled={!prazo.podeAlterar || prazo.aGravar}
                aria-describedby="rhb-prazo-ajuda"
                onChange={(e) => {
                  setRascunho(e.target.value);
                  setErroDoPrazo(null);
                }}
              />
            </div>
            {prazo.podeAlterar && (
              <Button type="button" variant="outline" className="min-h-11" disabled={!alterado || prazo.aGravar} onClick={() => void guardarPrazo()}>
                {t("rhExemplo.fal.prazoGuardar")}
              </Button>
            )}
            {marcar === null && permissoes.faltasEdit && (
              <Button type="button" className="min-h-11" onClick={() => setMarcar({ inicial: null, chave: "livre" })}>
                {t("rhExemplo.fal.marcarTitulo")}
              </Button>
            )}
          </div>
          <p id="rhb-prazo-ajuda" className="text-xs text-muted-foreground">
            {`${t("rhExemplo.fal.prazoLimites", { min: String(PRAZO_JUSTIFICACAO_MIN), max: String(PRAZO_JUSTIFICACAO_MAX) })} ${t("rhExemplo.fal.prazoAplicaSe")}`}
            {!prazo.podeAlterar && !prazo.leitura.falhou && ` ${t("rhExemplo.fal.prazoSemPermissao")}`}
          </p>
          {erroDoPrazo && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {erroDoPrazo}
            </p>
          )}
          <AvisoDoPrazo leitura={prazo.leitura} dias={prazo.dias} onTentarDeNovo={prazo.recarregar} />
        </CardHeader>
        <CardContent className="space-y-4">
          {leituraFaltas && <AvisoDeLeitura estado={leituraFaltas} onTentarDeNovo={onTentarDeNovo} />}
          {leituraDesvios && <AvisoDeLeitura estado={leituraDesvios} onTentarDeNovo={onTentarDeNovo} />}
          {marcar && (
            <MarcarFaltaForm
              key={marcar.chave}
              inicial={marcar.inicial}
              pessoas={pessoas}
              onFechar={() => setMarcar(null)}
              onMarcada={onAlterado}
            />
          )}

          <section aria-label={t("rhExemplo.fal.sugestoesTitulo")} className="space-y-2">
            <h3 className="text-sm font-semibold">{t("rhExemplo.fal.sugestoesTitulo")}</h3>
            <p className="text-xs text-muted-foreground">{t("rhExemplo.fal.sugestoesAjuda")}</p>
            {sugestoes.length === 0 ? (
              leituraFalhou(leituraDesvios) ? null : (
                <p className="text-sm text-muted-foreground">{t("rhExemplo.fal.semSugestoes")}</p>
              )
            ) : (
              <ul className="divide-y">
                {sugestoes.map((s) => (
                  <li key={s.chave} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <span className="min-w-40 font-medium">{nomeDe(s.pessoaId)}</span>
                    <span className="tabular-nums">{formatarData(s.data)}</span>
                    <span className="tabular-nums text-muted-foreground">{`${s.inicio}–${s.fim} · ${formatarHorasMinutos(s.minutos)}`}</span>
                    {permissoes.faltasEdit && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="ml-auto min-h-11"
                        onClick={() => setMarcar({ inicial: { pessoaId: s.pessoaId, data: s.data, inicio: s.inicio, fim: s.fim, alertaId: null }, chave: s.chave })}
                      >
                        {t("rhExemplo.fal.marcarEsta")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label={t("rhExemplo.fal.listaTitulo")} className="space-y-2">
            <h3 className="text-sm font-semibold">{t("rhExemplo.fal.listaTitulo")}</h3>
            {ordenadas.length === 0 ? (
              leituraFalhou(leituraFaltas) ? null : (
                <p className="text-sm text-muted-foreground">{t("rhExemplo.fal.semFaltas")}</p>
              )
            ) : (
              <ul className="divide-y">
                {ordenadas.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <span className="min-w-40 font-medium">{nomeDe(f.pessoa_id)}</span>
                    <span className="tabular-nums">{formatarData(f.data)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {`${f.hora_inicio.slice(0, 5)}–${f.hora_fim.slice(0, 5)} · ${formatarHorasMinutos(f.minutos)}`}
                    </span>
                    <Badge variant="outline" className="font-normal">
                      {f.estado === "activa" ? t(`rhExemplo.fal.estado.${rotuloDaJustificacao(f)}`) : t(`rhExemplo.fal.estadoFalta.${f.estado}`)}
                    </Badge>
                    <Button type="button" size="sm" variant="ghost" className="ml-auto min-h-11" onClick={() => setAberta(f.id)}>
                      {t("rhExemplo.fal.verDetalhe")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </CardContent>
      </Card>

      {falta && (
        <FaltaDetalhe
          falta={falta}
          nome={nomeDe(falta.pessoa_id)}
          permissoes={permissoes}
          onFechar={() => setAberta(null)}
          onAlterado={onAlterado}
        />
      )}
    </div>
  );
}
