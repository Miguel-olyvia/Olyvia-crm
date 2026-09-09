/**
 * O mapa do mes: uma linha por pessoa, uma coluna por dia.
 *
 * A CELULA NAO TEM TEXTO, E POR ISSO TEM DOIS CANAIS
 * --------------------------------------------------
 * Nao cabe la nada escrito. O vocabulario e de preenchimento -- cheio para um
 * dia coberto, contorno para um dia com desvio por resolver, marca para as
 * faltas -- e a cor NUNCA vai sozinha: cada celula tem uma `aria-label`
 * completa ("Maria Silva, 14 de Outubro, oito horas em dois locais, Sede e
 * Armazem, uma falta de duas horas") e a legenda vem ANTES da grelha na ordem
 * do documento. Uma legenda depois de trezentas celulas nunca e ouvida.
 *
 * Um dia com mais do que um local mostra-se em faixas verticais, uma por
 * local. A partir de tres locais mostram-se duas faixas e um indicador de
 * "mais": quatro faixas numa celula de dez pixeis nao sao legiveis nem quando
 * o sao, e o detalhe pertence ao painel do dia.
 *
 * O TECLADO, QUE E ONDE ISTO COSTUMA FALHAR
 * -----------------------------------------
 * A grelha tem UMA unica paragem de tabulacao. Entra-se na celula visitada (ou
 * na primeira) e anda-se com as setas: esquerda e direita mudam de dia, cima e
 * baixo mudam de pessoa, `Home` e `End` vao aos extremos da linha. `Enter` ou
 * `Espaco` abrem o dia. Sem isto, chegar a ultima celula de uma grelha de
 * trezentas linhas sao milhares de tabulacoes.
 *
 * NAO VIRA NEM PAGINA: com algumas centenas de pessoas fica pesado. Fica dito
 * aqui em vez de ser descoberto em producao.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { corDoLocal } from "@/components/hr/HorarioEditor";
import { formatarDuracao } from "@/lib/hr/assiduidade";
import { chaveCelula, type CelulaDoDia } from "@/hooks/useAssiduidadeDaOrganizacao";
import { nomeDoLocal } from "@/components/hr/assiduidade/LocalEtiqueta";
import type { LocalTrabalho } from "@/types/hr";

export interface PessoaDoMapa {
  id: string;
  nome: string;
}

interface MapaAssiduidadeMesProps {
  pessoas: PessoaDoMapa[];
  /** Os dias do mes em ISO, ja por ordem. */
  dias: string[];
  celulas: Map<string, CelulaDoDia>;
  locais: LocalTrabalho[];
  onAbrirDia: (pessoaId: string, data: string) => void;
}

export function MapaAssiduidadeMes({
  pessoas,
  dias,
  celulas,
  locais,
  onAbrirDia,
}: MapaAssiduidadeMesProps) {
  const { t } = useTranslation();
  const [focada, setFocada] = useState<{ linha: number; coluna: number }>({ linha: 0, coluna: 0 });
  const grelhaRef = useRef<HTMLDivElement>(null);

  /** Os locais presentes no mes: e a legenda, e vem antes da grelha. */
  const locaisPresentes = useMemo(() => {
    const ids = new Set<string | null>();
    for (const celula of celulas.values()) {
      for (const local of celula.locais) ids.add(local);
    }
    return [...ids];
  }, [celulas]);

  const mover = (evento: React.KeyboardEvent, linha: number, coluna: number) => {
    const limites = (l: number, c: number) => ({
      linha: Math.max(0, Math.min(pessoas.length - 1, l)),
      coluna: Math.max(0, Math.min(dias.length - 1, c)),
    });

    let proxima: { linha: number; coluna: number } | null = null;
    switch (evento.key) {
      case "ArrowLeft":
        proxima = limites(linha, coluna - 1);
        break;
      case "ArrowRight":
        proxima = limites(linha, coluna + 1);
        break;
      case "ArrowUp":
        proxima = limites(linha - 1, coluna);
        break;
      case "ArrowDown":
        proxima = limites(linha + 1, coluna);
        break;
      case "Home":
        proxima = evento.ctrlKey ? limites(0, 0) : limites(linha, 0);
        break;
      case "End":
        proxima = evento.ctrlKey
          ? limites(pessoas.length - 1, dias.length - 1)
          : limites(linha, dias.length - 1);
        break;
      case "Enter":
      case " ":
        evento.preventDefault();
        onAbrirDia(pessoas[linha].id, dias[coluna]);
        return;
      default:
        return;
    }

    evento.preventDefault();
    setFocada(proxima);
    const alvo = grelhaRef.current?.querySelector<HTMLElement>(
      `[data-celula="${proxima.linha}-${proxima.coluna}"]`,
    );
    alvo?.focus();
  };

  if (pessoas.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {t("hr.assiduidade.mapa.semPessoas")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* A legenda vem ANTES da grelha, de proposito. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {locaisPresentes.map((localId) => (
          <li key={localId ?? "sem-local"} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: corDoLocal(locais, localId) }}
            />
            {nomeDoLocal(locais, localId, t("hr.assiduidade.semLocal"))}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full border-2 border-amber-500"
          />
          {t("hr.assiduidade.mapa.legendaDesvio")}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-destructive" />
          {t("hr.assiduidade.mapa.legendaFalta")}
        </li>
      </ul>

      <div className="overflow-x-auto">
        <div
          ref={grelhaRef}
          role="grid"
          aria-label={t("hr.assiduidade.mapa.titulo")}
          aria-rowcount={pessoas.length + 1}
          aria-colcount={dias.length + 1}
          className="min-w-max"
        >
          <div role="row" className="flex">
            <div role="columnheader" className="w-44 shrink-0 px-2 py-1 text-xs font-medium">
              {t("hr.assiduidade.mapa.pessoa")}
            </div>
            {dias.map((dia) => (
              <div
                key={dia}
                role="columnheader"
                className="w-6 shrink-0 text-center text-[10px] text-muted-foreground tabular-nums"
              >
                {dia.slice(8, 10)}
              </div>
            ))}
          </div>

          {pessoas.map((pessoa, linha) => (
            <div key={pessoa.id} role="row" className="flex items-center">
              <div role="rowheader" className="w-44 shrink-0 truncate px-2 py-1 text-sm">
                {pessoa.nome}
              </div>
              {dias.map((dia, coluna) => {
                const celula = celulas.get(chaveCelula(pessoa.id, dia));
                const activa = focada.linha === linha && focada.coluna === coluna;
                return (
                  <div
                    key={dia}
                    role="gridcell"
                    data-celula={`${linha}-${coluna}`}
                    tabIndex={activa ? 0 : -1}
                    aria-label={etiquetaDaCelula(celula, {
                      pessoa: pessoa.nome,
                      dia,
                      locais,
                      semRegisto: t("hr.assiduidade.mapa.semRegisto"),
                      semLocal: t("hr.assiduidade.semLocal"),
                      comFalta: t("hr.assiduidade.mapa.comFalta"),
                      comDesvio: t("hr.assiduidade.mapa.comDesvio"),
                    })}
                    className={cn(
                      "m-px flex h-6 w-6 shrink-0 cursor-pointer overflow-hidden rounded-sm",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1",
                      !celula && "bg-muted/40",
                      celula?.temDesvio && "ring-2 ring-amber-500",
                    )}
                    onFocus={() => setFocada({ linha, coluna })}
                    onKeyDown={(evento) => mover(evento, linha, coluna)}
                    onClick={() => onAbrirDia(pessoa.id, dia)}
                  >
                    {celula && <Faixas celula={celula} locais={locais} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** As faixas verticais de uma celula: uma por local, no maximo duas mais "+". */
function Faixas({ celula, locais }: { celula: CelulaDoDia; locais: LocalTrabalho[] }) {
  const visiveis = celula.locais.slice(0, 2);
  const escondidos = celula.locais.length - visiveis.length;

  return (
    <>
      {visiveis.map((localId) => (
        <span
          key={localId ?? "sem-local"}
          aria-hidden="true"
          className="h-full flex-1"
          style={{ backgroundColor: corDoLocal(locais, localId) }}
        />
      ))}
      {escondidos > 0 && (
        <span
          aria-hidden="true"
          className="h-full w-1.5 bg-foreground/60"
          title={`+${escondidos}`}
        />
      )}
      {celula.faltas > 0 && (
        <span aria-hidden="true" className="h-full w-1.5 shrink-0 bg-destructive" />
      )}
    </>
  );
}

/**
 * O leitor de ecra nao pode ouvir "14". A etiqueta diz, por esta ordem:
 * pessoa, dia, o que se passou, e onde.
 */
function etiquetaDaCelula(
  celula: CelulaDoDia | undefined,
  contexto: {
    pessoa: string;
    dia: string;
    locais: LocalTrabalho[];
    semRegisto: string;
    semLocal: string;
    comFalta: string;
    comDesvio: string;
  },
): string {
  const partes = [contexto.pessoa, contexto.dia];
  if (!celula) {
    partes.push(contexto.semRegisto);
    return partes.join(", ");
  }
  if (celula.minutosRealizados > 0) {
    partes.push(formatarDuracao(celula.minutosRealizados));
    partes.push(
      celula.locais
        .map((localId) => nomeDoLocal(contexto.locais, localId, contexto.semLocal))
        .join(", "),
    );
  } else {
    partes.push(contexto.semRegisto);
  }
  if (celula.faltas > 0) partes.push(`${contexto.comFalta} ${formatarDuracao(celula.minutosEmFalta)}`);
  if (celula.temDesvio) partes.push(contexto.comDesvio);
  return partes.join(", ");
}
