/**
 * Processamento salarial > Configuração > «Subsídios»: o pagamento dos subsídios de férias e de Natal da organização.
 *
 * Um interruptor («Pagar os subsídios de férias e de Natal», desligado por omissão) com a data de início (a configuração cobre as folhas que
 * TERMINAM nessa data ou depois) e o MÊS DE PAGAMENTO de cada subsídio (omissão: junho e novembro). Segue o padrão de `ContagemHorasExtraAprovadas`: mostra o
 * estado lido da base, avisa ANTES de gravar o que a base vai recusar (data até ao fim de uma folha fechada; antecipar, adiar ou
 * desligar depois de uma folha fechada com o pagamento ligado), e mostra o erro da base já traduzido (HRA81, HRA88, HRA89).
 * A base é quem decide; os avisos só poupam um pedido que se sabe recusado. Mudar o mês depois de pago no ano (HRA89) só a base
 * o sabe: o ecrã avisa que pode ser recusado.
 *
 * Ler pede `hr.vencimento.codigos.view`, `.gerir` ou `hr.vencimento.subsidio.view` (a página já filtra); alterar, `codigos.gerir`
 * (`podeGerir`): sem ela mostra só o estado, com o motivo. Se a base ainda não tem a RPC, diz «Ainda não disponível».
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/hooks/useTranslation";
import { dataHaMeses, hojeLisboa } from "@/lib/hr/horasExtraBase";
import { useSubsidiosConfig } from "@/components/rh-exemplo/hooks/useSubsidiosConfig";
import { cn } from "@/lib/utils";
import { dataCurta } from "./formatosC";

const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const CLASSE_SELECT = "flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

/** O que o RH mexeu e ainda não gravou; `undefined` = o que está guardado. */
interface Edicao { ligado?: boolean; desde?: string; ferias?: number; natal?: number }
type Resultado = "guardada" | "semAlteracao";

function dataValida(v: string): boolean {
  if (!FORMATO_DATA.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** A base recusa datas fora do intervalo (HRA81); o campo avisa antes. */
const DATA_MINIMA = "2000-01-01";
const ANOS_A_FRENTE = 5;
/** O aspecto de um controlo que não responde: só `aria-disabled`/`readOnly` não se vê, e o controlo parece activo. */
const CLASSE_DESACTIVADO = "opacity-50 cursor-not-allowed";

/** O dia a seguir a `iso` (AAAA-MM-DD). */
function diaSeguinte(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

interface Props { podeGerir: boolean }

export function ConfiguracaoSubsidios({ podeGerir }: Props) {
  const { t } = useTranslation();
  const { estado, config, aGuardar, semOrganizacao, guardar } = useSubsidiosConfig();
  const [edicao, setEdicao] = useState<Edicao>({});
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const estadoRef = useRef<HTMLParagraphElement>(null);

  const mes = (n: number) => t(`rhSubs.cfg.mes.${n}`);
  const mudar = (parte: Edicao) => {
    setEdicao((e) => ({ ...e, ...parte }));
    setErro(null);
    setResultado(null);
  };

  const corpo = () => {
    if (semOrganizacao) return <p role="note" className="text-sm text-muted-foreground" data-testid="subs-cfg-sem-organizacao">{t("rhSubs.cfg.semOrganizacao")}</p>;
    if (estado === "recusado") return <p role="note" className="text-sm text-muted-foreground" data-testid="subs-cfg-sem-ver">{t("rhSubs.cfg.semVer")}</p>;
    if (estado === "indisponivel") return <p role="note" className="text-sm text-muted-foreground" data-testid="subs-cfg-indisponivel">{t("rhSubs.cfg.indisponivel")}</p>;
    if (estado === "erro") return <p role="alert" className="text-sm text-destructive" data-testid="subs-cfg-erro-leitura">{t("rhSubs.cfg.erroLeitura")}</p>;
    if (estado !== "ok" || !config) return <p role="status" className="text-sm text-muted-foreground">{t("rhSubs.cfg.aCarregar")}</p>;

    const actual = config.ativoDesde;
    const ligadaActual = actual !== null;
    const ultima = config.ultimaFolhaFechadaAte;
    const folhas = config.folhasFechadasDesde;
    /** Com uma folha já fechada com o pagamento ligado, a base recusa antecipar, adiar e desligar. */
    const bloqueada = ligadaActual && ultima !== null && actual <= ultima;

    const ligado = edicao.ligado ?? ligadaActual;
    // Ao ligar, a omissão é o dia a seguir à última folha fechada (uma data até aí já abria com erro); sem folhas fechadas, hoje.
    const desde = edicao.desde ?? actual ?? (ultima !== null ? diaSeguinte(ultima) : hojeLisboa());
    const feriasMes = edicao.ferias ?? config.feriasMes;
    const natalMes = edicao.natal ?? config.natalMes;
    const alvo = ligado ? desde : null;
    const congelada = bloqueada || aGuardar;

    const anteriorAFolha = ligado && !bloqueada && ultima !== null && dataValida(desde) && desde <= ultima;
    const dataErrada = ligado && !dataValida(desde);
    const invalida = dataErrada || anteriorAFolha;
    const mesesMudaram = feriasMes !== config.feriasMes || natalMes !== config.natalMes;
    const mudou = alvo !== actual || mesesMudaram;
    const podeGuardar = mudou && !invalida && !aGuardar;

    const confirmar = async () => {
      if (!podeGuardar) return;
      setErro(null);
      setResultado(null);
      const res = await guardar({ ativoDesde: alvo, feriasMes, natalMes });
      if (!res.ok) {
        setErro(res.erro);
        return;
      }
      setEdicao({});
      setResultado(res.alterada === false ? "semAlteracao" : "guardada");
      estadoRef.current?.focus();
    };

    const idErroData = "subs-cfg-data-erro";
    return (
      <>
        <p ref={estadoRef} tabIndex={-1} role="status" className="text-sm font-medium outline-none" data-testid="subs-cfg-estado">
          {ligadaActual
            ? t("rhSubs.cfg.estadoLigado", { data: dataCurta(actual), ferias: mes(config.feriasMes), natal: mes(config.natalMes) })
            : t("rhSubs.cfg.estadoDesligado", { ferias: mes(config.feriasMes), natal: mes(config.natalMes) })}
        </p>
        {folhas !== null && (
          <p role="note" className="text-sm text-muted-foreground" data-testid="subs-cfg-folhas">
            {t("rhSubs.cfg.folhasFechadas", { data: dataCurta(folhas), ultima: dataCurta(ultima ?? folhas) })}
          </p>
        )}
        {!podeGerir && <p role="note" className="text-xs text-muted-foreground" data-testid="subs-cfg-so-leitura">{t("rhSubs.cfg.soLeitura")}</p>}
        {podeGerir && (
          <>
            <div className="flex min-h-11 items-center gap-3">
              <Switch id="subs-cfg-ligado" checked={ligado} aria-disabled={congelada || undefined} className={cn(congelada && CLASSE_DESACTIVADO)}
                aria-describedby={bloqueada ? "subs-cfg-bloqueio" : undefined}
                onCheckedChange={(v) => { if (!bloqueada && !aGuardar) mudar({ ligado: v }); }} />
              <Label htmlFor="subs-cfg-ligado" className={cn("flex min-h-11 flex-1 items-center", congelada ? "cursor-not-allowed" : "cursor-pointer")}>{t("rhSubs.cfg.interruptor")}</Label>
            </div>
            {bloqueada && <p id="subs-cfg-bloqueio" role="note" className="text-sm text-muted-foreground" data-testid="subs-cfg-bloqueio">{t("rhSubs.cfg.bloqueio")}</p>}
            {ligado && (
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="subs-cfg-data">{t("rhSubs.cfg.data")}</Label>
                <Input id="subs-cfg-data" type="date" className={cn("min-h-11", congelada && CLASSE_DESACTIVADO)} value={desde} aria-invalid={invalida}
                  min={DATA_MINIMA} max={dataHaMeses(hojeLisboa(), -12 * ANOS_A_FRENTE)}
                  aria-describedby={invalida ? idErroData : undefined} readOnly={congelada}
                  onChange={(e) => { if (!bloqueada && !aGuardar) mudar({ desde: e.target.value }); }} />
                <p className="text-xs text-muted-foreground">{t("rhSubs.cfg.dataAjuda")}</p>
                {invalida && (
                  <p id={idErroData} role="alert" className="text-sm text-destructive">
                    {anteriorAFolha && ultima ? t("rhSubs.cfg.dataAnteriorFolha", { data: dataCurta(ultima) }) : t("rhSubs.cfg.dataInvalida")}
                  </p>
                )}
              </div>
            )}
            <div className="grid max-w-xl gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="subs-cfg-ferias">{t("rhSubs.cfg.mesFerias")}</Label>
                <select id="subs-cfg-ferias" className={CLASSE_SELECT} value={feriasMes} disabled={aGuardar}
                  onChange={(e) => mudar({ ferias: Number(e.target.value) })}>
                  {MESES.map((n) => <option key={n} value={n}>{mes(n)}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subs-cfg-natal">{t("rhSubs.cfg.mesNatal")}</Label>
                <select id="subs-cfg-natal" className={CLASSE_SELECT} value={natalMes} disabled={aGuardar}
                  onChange={(e) => mudar({ natal: Number(e.target.value) })}>
                  {MESES.map((n) => <option key={n} value={n}>{mes(n)}</option>)}
                </select>
              </div>
            </div>
            {mesesMudaram && ligadaActual && ultima !== null && (
              <p role="note" className="text-sm text-muted-foreground" data-testid="subs-cfg-aviso-meses">{t("rhSubs.cfg.avisoMeses")}</p>
            )}
            <Button type="button" className={cn("min-h-11", !podeGuardar && CLASSE_DESACTIVADO)} aria-disabled={!podeGuardar || undefined}
              onClick={() => void confirmar()}>{aGuardar ? t("rhSubs.cfg.aGuardar") : t("rhSubs.cfg.guardar")}</Button>
          </>
        )}
        {resultado && <p role="status" className="text-sm text-muted-foreground" data-testid="subs-cfg-resultado">{t(resultado === "guardada" ? "rhSubs.cfg.guardada" : "rhSubs.cfg.semAlteracao")}</p>}
        {erro && <p role="alert" className="text-sm text-destructive" data-testid="subs-cfg-erro">{erro}</p>}
      </>
    );
  };

  return (
    <Card data-testid="subs-cfg">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("rhSubs.cfg.titulo")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("rhSubs.cfg.ajuda")}</p>
      </CardHeader>
      <CardContent className="space-y-4">{corpo()}</CardContent>
    </Card>
  );
}
