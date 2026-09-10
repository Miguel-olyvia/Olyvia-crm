/**
 * A fila de trabalho: o que a base PROPOE que alguem trate.
 *
 * `hr_assiduidade_desvios` devolve quatro tipos e mais nada: turno planeado
 * sem horas, horas sem turno planeado, picagem por emparelhar, e falta que
 * passou a estar coberta por uma ausencia aprovada. Propoe, nao escreve, e
 * NAO FILTRA TOLERANCIAS.
 *
 * O FILTRO DE MINUTOS E DESTE ECRA, E TEM DE SE VER
 * -------------------------------------------------
 * Sem o filtro escrito por cima da lista, uma fila vazia por causa dele passa
 * por uma fila vazia por nao haver nada -- e isso e a diferenca entre "esta
 * tudo em ordem" e "nao estas a ver metade". Por isso o controlo esta sempre
 * visivel e a contagem diz o filtro em vigor.
 *
 * A picagem por emparelhar nunca e filtrada: nao tem duracao nenhuma, e nao ha
 * tolerancia que a torne irrelevante.
 *
 * Cada linha abre o dia dessa pessoa, que e onde vivem as accoes. Repetir aqui
 * os botoes de marcar falta, corrigir e consolidar dava dois sitios para o
 * mesmo gesto e duas maneiras de ele ficar diferente.
 *
 * AGRUPADO POR DIA, MAIS RECENTE PRIMEIRO
 * ----------------------------------------
 * Uma lista plana ordenada por pessoa obriga quem trabalha a fila a saltar de
 * data em data para cada pessoa -- com dezenas de desvios torna-se impossivel
 * responder "o que aconteceu no dia 9". Agrupar por dia, do mais recente para
 * o mais antigo, poe o trabalho de ontem a frente do de ha dois meses, que e
 * o que se trata primeiro. O filtro por pessoa existe para o caso inverso:
 * quem quer acompanhar so uma pessoa.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/hooks/useTranslation";
import { formatarDuracao, horaCurta } from "@/lib/hr/assiduidade";
import type { Desvio } from "@/types/hrAssiduidade";

const TOLERANCIAS = ["0", "5", "10", "15", "30"] as const;
const TODAS_AS_PESSOAS = "todas";

interface FilaDesviosProps {
  desvios: Desvio[];
  nomePorPessoaId: Map<string, string>;
  onAbrirDia: (pessoaId: string, data: string) => void;
  idPrefixo?: string;
}

interface GrupoPorDia {
  data: string;
  desvios: Desvio[];
}

export function FilaDesvios({
  desvios,
  nomePorPessoaId,
  onAbrirDia,
  idPrefixo = "hr-desvios",
}: FilaDesviosProps) {
  const { t, language } = useTranslation();
  const [tolerancia, setTolerancia] = useState<string>("10");
  const [pessoaId, setPessoaId] = useState<string>(TODAS_AS_PESSOAS);

  const minutosMinimos = Number(tolerancia);

  const opcoesPessoas = useMemo(() => {
    const idsComDesvio = new Set(desvios.map((desvio) => desvio.pessoa_id));
    return Array.from(idsComDesvio)
      .map((id) => ({ id, nome: nomePorPessoaId.get(id) ?? id }))
      .sort((a, b) => a.nome.localeCompare(b.nome, language));
  }, [desvios, nomePorPessoaId, language]);

  const visiveis = useMemo(
    () =>
      desvios.filter((desvio) => {
        if (pessoaId !== TODAS_AS_PESSOAS && desvio.pessoa_id !== pessoaId) return false;
        if (desvio.tipo === "pendente_par") return true;
        if (minutosMinimos <= 0) return true;
        return (desvio.minutos ?? 0) >= minutosMinimos;
      }),
    [desvios, minutosMinimos, pessoaId],
  );

  const grupos = useMemo<GrupoPorDia[]>(() => {
    const porData = new Map<string, Desvio[]>();
    for (const desvio of visiveis) {
      const grupo = porData.get(desvio.data);
      if (grupo) {
        grupo.push(desvio);
      } else {
        porData.set(desvio.data, [desvio]);
      }
    }
    return Array.from(porData.entries())
      .sort(([dataA], [dataB]) => dataB.localeCompare(dataA))
      .map(([data, itens]) => ({ data, desvios: itens }));
  }, [visiveis]);

  const formatarData = useMemo(() => {
    const formatador = new Intl.DateTimeFormat(language, {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    return (data: string) => formatador.format(new Date(`${data}T00:00:00`));
  }, [language]);

  const idTolerancia = `${idPrefixo}-tolerancia`;
  const idPessoa = `${idPrefixo}-pessoa`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("hr.assiduidade.desvios.titulo")}</CardTitle>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor={idTolerancia}>{t("hr.assiduidade.desvios.tolerancia")}</Label>
            <Select value={tolerancia} onValueChange={setTolerancia}>
              <SelectTrigger id={idTolerancia} className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TOLERANCIAS.map((valor) => (
                  <SelectItem key={valor} value={valor}>
                    {valor === "0"
                      ? t("hr.assiduidade.desvios.semTolerancia")
                      : t("hr.assiduidade.desvios.ignorarAbaixoDe", { minutos: valor })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={idPessoa}>{t("hr.assiduidade.mapa.pessoa")}</Label>
            <Select value={pessoaId} onValueChange={setPessoaId}>
              <SelectTrigger id={idPessoa} className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS_AS_PESSOAS}>{t("common.all")}</SelectItem>
                {opcoesPessoas.map((opcao) => (
                  <SelectItem key={opcao.id} value={opcao.id}>
                    {opcao.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p aria-live="polite" className="pb-2 text-sm text-muted-foreground">
            {minutosMinimos > 0
              ? t("hr.assiduidade.desvios.contagemFiltrada", {
                  quantos: String(visiveis.length),
                  minutos: tolerancia,
                })
              : t("hr.assiduidade.desvios.contagem", { quantos: String(visiveis.length) })}
          </p>
        </div>
      </CardHeader>

      <CardContent>
        {visiveis.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {minutosMinimos > 0
              ? t("hr.assiduidade.desvios.vazioFiltrado", { minutos: tolerancia })
              : t("hr.assiduidade.desvios.vazio")}
          </p>
        ) : (
          <div className="space-y-4">
            {grupos.map((grupo) => (
              <section key={grupo.data} aria-labelledby={`${idPrefixo}-dia-${grupo.data}`}>
                <h3
                  id={`${idPrefixo}-dia-${grupo.data}`}
                  className="flex items-baseline gap-2 pb-1 text-sm font-semibold"
                >
                  <span className="capitalize">{formatarData(grupo.data)}</span>
                  <span className="font-normal text-muted-foreground">
                    {t("hr.assiduidade.desvios.contagem", {
                      quantos: String(grupo.desvios.length),
                    })}
                  </span>
                </h3>
                <ul className="divide-y">
                  {grupo.desvios.map((desvio, indice) => (
                    <li key={`${desvio.pessoa_id}-${desvio.data}-${desvio.tipo}-${indice}`}>
                      <button
                        type="button"
                        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left text-sm hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        onClick={() => onAbrirDia(desvio.pessoa_id, desvio.data)}
                      >
                        <span className="min-w-40 font-medium">
                          {nomePorPessoaId.get(desvio.pessoa_id) ?? desvio.pessoa_id}
                        </span>
                        <Badge variant="outline" className="font-normal">
                          {t(`hr.assiduidade.desvios.tipo.${desvio.tipo}`)}
                        </Badge>
                        {desvio.hora_inicio && (
                          <span className="tabular-nums text-muted-foreground">
                            {horaCurta(desvio.hora_inicio)} — {horaCurta(desvio.hora_fim)}
                          </span>
                        )}
                        {desvio.minutos !== null && desvio.minutos > 0 && (
                          <span className="tabular-nums text-muted-foreground">
                            {formatarDuracao(desvio.minutos)}
                          </span>
                        )}
                        {desvio.detalhe && (
                          <span className="text-xs text-muted-foreground">{desvio.detalhe}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
