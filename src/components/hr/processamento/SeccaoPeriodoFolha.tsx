/**
 * Configuracao > "Periodo da folha": o dia em que a folha abre (1 a 28), versionado. O nome da folha e o mes do fecho.
 *
 * Ver quem tem `hr.processamento.periodo.view` (decidido pela pagina); gravar so quem tem `.gerir`.
 * Enquanto a migration 20270107200000 nao estiver aplicada as RPCs nao existem: diz-se numa linha calma
 * («Disponivel depois da proxima atualizacao da base»), sem erro vermelho, e o resto do ecra nao e afectado.
 */
import { useMemo, useRef, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { useTranslation } from "@/hooks/useTranslation";
import { usePeriodoFolhaRegras } from "@/hooks/usePeriodoFolhaRegras";
import { DIA_INICIO_MAX, DIA_INICIO_MIN, hojeEmLisboa, localeDaLingua, nomeDaFolha, somarMeses } from "@/lib/hr/periodoFolha";
import { toast } from "@/lib/toast";

const MESES_A_OFERECER = 12;

const doisDigitos = (n: number): string => String(n).padStart(2, "0");

/** A folha de AAAA-MM-01 por extenso, com maiuscula inicial. */
function rotuloDaFolha(validoDe: string, locale: string): string {
  const texto = nomeDaFolha(Number(validoDe.slice(0, 4)), Number(validoDe.slice(5, 7)), locale);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function SeccaoPeriodoFolha({ podeGerir }: { podeGerir: boolean }) {
  const { t, language } = useTranslation();
  const locale = localeDaLingua(language);
  const { regras, estado, isLoading, isSaving, guardar, recarregar } = usePeriodoFolhaRegras();
  const campoDia = useRef<HTMLInputElement>(null);
  const [erroDia, setErroDia] = useState<string | null>(null);

  // O mes de partida mais cedo que tem sentido: o seguinte ao de hoje (as folhas do mes corrente ja existem ou vao existir).
  const opcoesDeMes = useMemo(() => {
    const hoje = hojeEmLisboa(); // Lisboa, como a base, e nao o fuso do navegador
    return Array.from({ length: MESES_A_OFERECER }, (_, i) => {
      const { ano, mes } = somarMeses(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), i + 1);
      return `${ano}-${doisDigitos(mes)}-01`;
    });
  }, []);

  const emVigor = regras.find((regra) => regra.em_vigor && !regra.substituida_em) ?? null;
  const diaEmVigor = emVigor?.dia_inicio ?? 1;

  // `null` = ainda nao editado (mostra a regra em vigor); "" e um campo que a pessoa esvaziou, e fica vazio.
  const [dia, setDia] = useState<string | null>(null);
  const [validoDe, setValidoDe] = useState<string>("");
  const diaMostrado = dia ?? String(diaEmVigor);
  const validoDeMostrado = validoDe === "" ? opcoesDeMes[0] : validoDe;

  /** O dia de inicio e um inteiro de 1 a 28: a mesma regra no onBlur e ao gravar. `null` = valido. */
  const erroDoDia = (texto: string): string | null => {
    const numero = Number(texto);
    const valido = texto.trim() !== "" && Number.isInteger(numero) && numero >= DIA_INICIO_MIN && numero <= DIA_INICIO_MAX;
    return valido ? null : t("hr.periodoFolha.erro.diaInvalido");
  };

  const submeter = async () => {
    const erro = erroDoDia(diaMostrado);
    if (erro) {
      setErroDia(erro);
      campoDia.current?.focus();
      return;
    }
    const { erro: erroBase } = await guardar(Number(diaMostrado), validoDeMostrado);
    if (erroBase) {
      // Uma chave de traducao, ou ja uma mensagem escrita (t devolve a propria cadeia se a chave nao existir).
      toast.error(t(erroBase));
      return;
    }
    toast.success(t("hr.periodoFolha.guardarSucesso"));
    setDia(null);
    setValidoDe("");
    setErroDia(null);
  };
  const textoDaRegra = (diaDaRegra: number) =>
    diaDaRegra === 1
      ? t("hr.periodoFolha.regraDia1")
      : t("hr.periodoFolha.regraDiaN", { dia: String(diaDaRegra), fecha: String(diaDaRegra - 1) });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("hr.periodoFolha.titulo")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("hr.periodoFolha.subtitulo")}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <OlyviaLoader size={28} />
          </div>
        ) : estado === "indisponivel" ? (
          <p role="status" className="text-sm text-muted-foreground" data-testid="periodo-folha-indisponivel">
            {t("hr.periodoFolha.indisponivel")}
          </p>
        ) : estado === "recusado" ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t("hr.periodoFolha.recusado")}
          </p>
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
            <div className="space-y-1" data-testid="periodo-folha-em-vigor">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{t("hr.periodoFolha.emVigor")}</Badge>
                <span className="text-sm font-medium">{emVigor ? textoDaRegra(diaEmVigor) : t("hr.periodoFolha.semRegra")}</span>
              </div>
            </div>

            {podeGerir ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="periodo-folha-dia">{t("hr.periodoFolha.campoDia")}</Label>
                    <Input
                      id="periodo-folha-dia"
                      ref={campoDia}
                      type="number"
                      inputMode="numeric"
                      min={DIA_INICIO_MIN}
                      max={DIA_INICIO_MAX}
                      step={1}
                      className="h-11"
                      value={diaMostrado}
                      aria-invalid={erroDia ? true : undefined}
                      aria-describedby={erroDia ? "periodo-folha-dia-ajuda periodo-folha-dia-erro" : "periodo-folha-dia-ajuda"}
                      onChange={(e) => {
                        setDia(e.target.value);
                        setErroDia(null);
                      }}
                      onBlur={(e) => setErroDia(erroDoDia(e.target.value))}
                    />
                    <p id="periodo-folha-dia-ajuda" className="text-xs text-muted-foreground">
                      {t("hr.periodoFolha.ajudaDia")}
                    </p>
                    {erroDia && (
                      <p id="periodo-folha-dia-erro" role="alert" className="text-sm font-medium text-destructive">
                        {erroDia}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="periodo-folha-valido-de">{t("hr.periodoFolha.campoValidoDe")}</Label>
                    <Select value={validoDeMostrado} onValueChange={setValidoDe}>
                      <SelectTrigger id="periodo-folha-valido-de" className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {opcoesDeMes.map((opcao) => (
                          <SelectItem key={opcao} value={opcao}>
                            {rotuloDaFolha(opcao, locale)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <ul className="space-y-2 text-sm" data-testid="periodo-folha-avisos">
                  {(["avisoTransicao", "avisoNaoAltera", "avisoPrazo"] as const).map((chave) => (
                    <li key={chave} className="flex items-start gap-2 text-muted-foreground">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{t(`hr.periodoFolha.${chave}`)}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex justify-end">
                  <Button className="min-h-11" onClick={submeter} disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                    {t("hr.periodoFolha.guardar")}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("hr.periodoFolha.semPermissaoGerir")}</p>
            )}

            {regras.length > 0 && (
              <section aria-labelledby="periodo-folha-historico" className="space-y-2">
                <h3 id="periodo-folha-historico" className="text-sm font-medium">
                  {t("hr.periodoFolha.historico")}
                </h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {regras.map((regra) => (
                    <li key={regra.id}>
                      {regra.dia_inicio === 1
                        ? t("hr.periodoFolha.historicoLinhaDia1", { mes: rotuloDaFolha(regra.valido_de, locale) })
                        : t("hr.periodoFolha.historicoLinha", {
                            mes: rotuloDaFolha(regra.valido_de, locale),
                            dia: String(regra.dia_inicio),
                          })}
                      {regra.criada_por_nome ? ` (${t("hr.periodoFolha.historicoPor", { nome: regra.criada_por_nome })})` : ""}
                      {regra.substituida_em
                        ? ` - ${t("hr.periodoFolha.historicoSubstituida")}`
                        : regra.em_vigor
                          ? ` - ${t("hr.periodoFolha.emVigor")}`
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
