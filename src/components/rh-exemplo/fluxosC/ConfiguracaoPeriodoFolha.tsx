/**
 * Processamento salarial > Configuração > «Período da folha»: o dia em que a folha começa (1 a 28), por organização, com histórico.
 *
 * Mostra em linguagem simples a regra em vigor («A folha começa no dia 22 de cada mês e acaba no dia anterior ao do mês seguinte»), um
 * exemplo vivo da próxima folha, o histórico das regras com a data de efeito e, ANTES de gravar, o que acontece ao mudar o dia: a primeira
 * folha depois da mudança é de transição (começa no dia a seguir ao fim da anterior) e não se muda uma folha já aberta ou fechada.
 * A base é quem decide (`rpc_hr_periodo_folha_regra_guardar`); os avisos só poupam um pedido que se sabe recusado, e o erro volta traduzido.
 *
 * Ler pede `hr.processamento.periodo.view` (a página só mostra o separador a quem a tem); gravar, `hr.processamento.periodo.gerir` (`podeGerir`): sem ela só se mostra a regra, com o motivo.
 * Sem as RPCs na base diz-o numa linha calma, sem erro vermelho e sem valores inventados.
 */
import { useMemo, useRef, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { useTranslation } from "@/hooks/useTranslation";
import {
  DIA_INICIO_MAX,
  DIA_INICIO_MIN,
  hojeEmLisboa,
  localeDaLingua,
  nomeDaFolha,
  periodoDaFolhaPorRegras,
  periodoDoDia,
  somarMeses,
  usePeriodoFolhaRegras,
} from "@/components/rh-exemplo/hooks/periodoFolha";

const MESES_A_OFERECER = 12;
const AVISOS = ["avisoTransicao", "avisoNaoAltera", "avisoPrazo"] as const;
const CLASSE_SELECT =
  "flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
const DIAS = Array.from({ length: DIA_INICIO_MAX - DIA_INICIO_MIN + 1 }, (_, i) => DIA_INICIO_MIN + i);

const doisDigitos = (n: number): string => String(n).padStart(2, "0");
const anoDe = (isoMes: string): number => Number(isoMes.slice(0, 4));
const mesDe = (isoMes: string): number => Number(isoMes.slice(5, 7));

interface Props {
  podeGerir: boolean;
}

export function ConfiguracaoPeriodoFolha({ podeGerir }: Props) {
  const { t, language } = useTranslation();
  const locale = localeDaLingua(language);
  const { regras, estado, isLoading, isSaving, guardar, recarregar, diaInicioDoMes } = usePeriodoFolhaRegras();
  // `null` = ainda não editado (mostra a regra em vigor).
  const [dia, setDia] = useState<string | null>(null);
  const [validoDe, setValidoDe] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // O mês (ISO, dia 1) da regra acabada de gravar, para dizer a partir de que folha vale; `null` = nada gravado.
  const [guardado, setGuardado] = useState<string | null>(null);
  // Trava contra duplo clique: o estado `isSaving` só chega depois do render, dois cliques no mesmo instante passam ambos.
  const aGravar = useRef(false);

  // O mês de partida mais cedo que tem sentido: o seguinte ao de hoje, em Lisboa como a base (a folha do mês corrente já existe ou vai existir).
  const hoje = hojeEmLisboa();
  const opcoesDeMes = useMemo(() => {
    return Array.from({ length: MESES_A_OFERECER }, (_, i) => {
      const { ano, mes } = somarMeses(anoDe(hoje), mesDe(hoje), i + 1);
      return `${ano}-${doisDigitos(mes)}-01`;
    });
  }, [hoje]);

  // A ordem é a da base (`valido_de` e criação, da mais recente para a mais antiga): não se reordena aqui.
  const historico = regras;
  // Uma regra por entrar em vigor: não substituída, com início depois do mês de hoje (as antigas não levam etiqueta).
  const primeiroDoMesDeHoje = `${hoje.slice(0, 7)}-01`;
  const estaAgendada = (regra: { em_vigor: boolean; substituida_em: string | null; valido_de: string }): boolean =>
    !regra.em_vigor && !regra.substituida_em && regra.valido_de > primeiroDoMesDeHoje;

  const formatoData = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const data = (iso: string): string => formatoData.format(new Date(`${iso}T00:00:00Z`));
  const folha = (ano: number, mes: number): string => nomeDaFolha(ano, mes, locale);
  const mesDaRegra = (isoMes: string): string => folha(anoDe(isoMes), mesDe(isoMes));

  const emVigor = regras.find((regra) => regra.em_vigor && !regra.substituida_em) ?? null;
  const diaEmVigor = emVigor?.dia_inicio ?? 1;
  const diaMostrado = dia ?? String(diaEmVigor);
  const validoDeMostrado = validoDe ?? opcoesDeMes[0];
  const diaEscolhido = Number(diaMostrado);
  const anoPartida = anoDe(validoDeMostrado);
  const mesPartida = mesDe(validoDeMostrado);
  // Compara com o que as regras dizem PARA O MÊS ESCOLHIDO (não com o de hoje): assim uma regra agendada pode ser desfeita.
  const mudou = diaEscolhido !== diaInicioDoMes(anoPartida, mesPartida);

  // O exemplo vivo: a folha em curso e a seguinte, pelas regras.
  const emCurso = emVigor ? periodoDoDia(hoje, regras) : null;
  const seguinte = emCurso ? somarMeses(emCurso.ano, emCurso.mes, 1) : null;
  const exemplos =
    emCurso && seguinte
      ? [
          { chave: "rotuloEmCurso", ano: emCurso.ano, mes: emCurso.mes, intervalo: emCurso },
          { chave: "rotuloProxima", ano: seguinte.ano, mes: seguinte.mes, intervalo: periodoDaFolhaPorRegras(seguinte.ano, seguinte.mes, regras) },
        ]
      : [];
  // Só é de transição se o dia escolhido difere do da folha anterior (pelas regras).
  const anterior = somarMeses(anoPartida, mesPartida, -1);
  const eTransicao = mudou && diaEscolhido !== diaInicioDoMes(anterior.ano, anterior.mes);
  const transicao = eTransicao
    ? periodoDaFolhaPorRegras(anoPartida, mesPartida, [...regras, { dia_inicio: diaEscolhido, valido_de: validoDeMostrado }])
    : null;

  const frase = (diaDaRegra: number): string =>
    diaDaRegra === 1 ? t("rhPeriodo.cfg.fraseDia1") : t("rhPeriodo.cfg.frase", { dia: String(diaDaRegra), fecha: String(diaDaRegra - 1) });

  const submeter = async () => {
    if (aGravar.current) return;
    aGravar.current = true;
    setErro(null);
    setGuardado(null);
    try {
      const resultado = await guardar(diaEscolhido, validoDeMostrado);
      if (resultado.erro) {
        // Uma chave de tradução, ou já uma mensagem escrita (`t` devolve a própria cadeia se a chave não existir).
        setErro(t(resultado.erro));
        return;
      }
      setGuardado(validoDeMostrado);
      setDia(null);
      setValidoDe(null);
    } finally {
      aGravar.current = false;
    }
  };

  const aoEditar = (efeito: () => void) => {
    efeito();
    setErro(null);
    setGuardado(null);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("hr.periodoFolha.titulo")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("hr.periodoFolha.subtitulo")}</p>
        <p className="text-sm text-muted-foreground">{t("rhPeriodo.cfg.mesSubsidios")}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <OlyviaLoader size={28} text={t("rhPeriodo.cfg.aCarregar")} />
        ) : estado === "indisponivel" ? (
          <p className="text-sm text-muted-foreground" data-testid="periodo-folha-indisponivel">
            {t("hr.periodoFolha.indisponivel")}
          </p>
        ) : estado === "recusado" ? (
          <p className="text-sm text-muted-foreground">{t("hr.periodoFolha.recusado")}</p>
        ) : estado === "erro" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-sm font-medium text-destructive">
              {t("hr.periodoFolha.erroLeitura")}
            </p>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void recarregar()}>
              {t("rhExemplo.leitura.tentarDeNovo")}
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2" data-testid="periodo-folha-em-vigor">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{t("hr.periodoFolha.emVigor")}</Badge>
                <span className="text-sm font-medium">{emVigor ? frase(diaEmVigor) : t("hr.periodoFolha.semRegra")}</span>
              </div>
              {exemplos.map(({ chave, ano, mes, intervalo }) => (
                <p key={chave} className="text-sm text-muted-foreground">
                  <span className="font-medium">{t(`rhPeriodo.cfg.${chave}`)}</span>{" "}
                  {t("rhPeriodo.cfg.exemplo", { folha: folha(ano, mes), de: data(intervalo.de), ate: data(intervalo.ate) })}
                </p>
              ))}
            </div>

            {podeGerir ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="periodo-folha-dia">{t("rhPeriodo.cfg.campoDia")}</Label>
                    <select
                      id="periodo-folha-dia"
                      className={CLASSE_SELECT}
                      value={diaMostrado}
                      disabled={isSaving}
                      aria-describedby="periodo-folha-dia-ajuda"
                      onChange={(e) => aoEditar(() => setDia(e.target.value))}
                    >
                      {DIAS.map((d) => (
                        <option key={d} value={String(d)}>
                          {d === 1 ? t("rhPeriodo.cfg.opcaoDia1") : String(d)}
                        </option>
                      ))}
                    </select>
                    <p id="periodo-folha-dia-ajuda" className="text-xs text-muted-foreground">
                      {t("hr.periodoFolha.ajudaDia")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="periodo-folha-valido-de">{t("hr.periodoFolha.campoValidoDe")}</Label>
                    <select
                      id="periodo-folha-valido-de"
                      className={CLASSE_SELECT}
                      value={validoDeMostrado}
                      disabled={isSaving}
                      onChange={(e) => aoEditar(() => setValidoDe(e.target.value))}
                    >
                      {opcoesDeMes.map((opcao) => (
                        <option key={opcao} value={opcao}>
                          {mesDaRegra(opcao)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <ul className="space-y-2 text-sm" data-testid="periodo-folha-avisos">
                  {AVISOS.map((chave) => (
                    <li key={chave} className="flex items-start gap-2 text-muted-foreground">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{t(`hr.periodoFolha.${chave}`)}</span>
                    </li>
                  ))}
                </ul>

                {transicao && (
                  <p className="text-sm font-medium" data-testid="periodo-folha-previsao">
                    {t("rhPeriodo.cfg.previsaoTransicao", {
                      folha: mesDaRegra(validoDeMostrado),
                      de: data(transicao.de),
                      ate: data(transicao.ate),
                    })}
                  </p>
                )}

                {erro && (
                  <p role="alert" className="text-sm font-medium text-destructive">
                    {erro}
                  </p>
                )}
                <p role="status" className="text-sm font-medium">
                  {guardado ? t("rhPeriodo.cfg.guardarSucesso", { mes: mesDaRegra(guardado) }) : null}
                </p>

                <div className="flex justify-end">
                  <Button className="min-h-11" onClick={() => void submeter()} disabled={isSaving || !mudou}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                    {t("hr.periodoFolha.guardar")}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("hr.periodoFolha.semPermissaoGerir")}</p>
            )}

            {historico.length > 0 && (
              <section aria-labelledby="periodo-folha-historico" className="space-y-2">
                <h3 id="periodo-folha-historico" className="text-sm font-medium">
                  {t("rhPeriodo.cfg.historico")}
                </h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {historico.map((regra) => (
                    <li key={regra.id}>
                      {regra.dia_inicio === 1
                        ? t("hr.periodoFolha.historicoLinhaDia1", { mes: mesDaRegra(regra.valido_de) })
                        : t("hr.periodoFolha.historicoLinha", { mes: mesDaRegra(regra.valido_de), dia: String(regra.dia_inicio) })}
                      {regra.criada_por_nome ? ` (${t("hr.periodoFolha.historicoPor", { nome: regra.criada_por_nome })})` : ""}
                      {regra.substituida_em
                        ? ` - ${t("hr.periodoFolha.historicoSubstituida")}`
                        : regra.em_vigor
                          ? ` - ${t("hr.periodoFolha.emVigor")}`
                          : estaAgendada(regra)
                            ? ` - ${t("rhPeriodo.cfg.historicoAgendada")}`
                            : ""}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
