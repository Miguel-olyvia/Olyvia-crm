/**
 * O mes da organizacao inteira: uma linha por pessoa, uma coluna por dia.
 *
 * E o MESMO vocabulario visual do calendario anual -- cor do tipo, riscas para
 * pendente, cinzento para fim de semana e feriado -- porque quem aprende a ler
 * um nao pode ter de aprender o outro. O que muda e o eixo: no anual sao doze
 * meses de uma pessoa; aqui e um mes de toda a gente.
 *
 * Nao ha cabecalho fixo nem virtualizacao: com trezentas pessoas isto fica
 * pesado, e quando chegar la a resposta e paginar as pessoas, nao pintar menos
 * dias. Fica dito para nao passar em silencio.
 *
 * O TECLADO, NO MESMO PADRAO DO MAPA DE ASSIDUIDADE
 * ---------------------------------------------------
 * A grelha tem UMA unica paragem de tabulacao (roving tabindex). Entra-se na
 * celula visitada (ou na primeira) e anda-se com as setas: esquerda e direita
 * mudam de dia, cima e baixo mudam de pessoa, `Home` e `End` vao aos extremos
 * da linha (com Ctrl, aos extremos da grelha inteira). `Enter` ou `Espaco`
 * abrem o pedido, quando a celula tem marcacao. Sem isto, com trinta dias e
 * trinta pessoas, chegar a ultima celula eram novecentas tabulacoes.
 */
import { useMemo, useRef, useState } from "react";
import { eachDayOfInterval, endOfMonth, format, startOfMonth } from "date-fns";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { corDoTipo } from "@/components/hr/ausencias/TipoEtiqueta";
import { eFeriado, eFimDeSemana, nomeTipoAusencia, type IndiceFeriados } from "@/lib/hr/ausencias";
import type { AusenciaDia, AusenciaTipo } from "@/types/hrAusencias";

interface MapaMensalProps {
  /** Primeiro dia do mes, em `YYYY-MM-01`. */
  mes: string;
  dias: AusenciaDia[];
  tiposPorId: Map<string, AusenciaTipo>;
  nomePorPessoaId: Map<string, string>;
  feriados: IndiceFeriados;
  onAbrirPedido?: (pedidoId: string) => void;
}

export function MapaMensal({
  mes,
  dias,
  tiposPorId,
  nomePorPessoaId,
  feriados,
  onAbrirPedido,
}: MapaMensalProps) {
  const { t } = useTranslation();
  const [focada, setFocada] = useState<{ linha: number; coluna: number }>({ linha: 0, coluna: 0 });
  const grelhaRef = useRef<HTMLDivElement>(null);

  const datas = useMemo(() => {
    const base = new Date(`${mes}T12:00:00Z`);
    return eachDayOfInterval({ start: startOfMonth(base), end: endOfMonth(base) }).map((data) =>
      format(data, "yyyy-MM-dd"),
    );
  }, [mes]);

  const porPessoa = useMemo(() => {
    const mapa = new Map<string, Map<string, AusenciaDia>>();
    for (const dia of dias) {
      if (dia.estado === "recusado" || dia.estado === "cancelado") continue;
      if (!dia.data.startsWith(mes.slice(0, 7))) continue;
      const linha = mapa.get(dia.pessoa_id) ?? new Map<string, AusenciaDia>();
      const actual = linha.get(dia.data);
      if (!actual || (actual.estado !== "aprovado" && dia.estado === "aprovado")) {
        linha.set(dia.data, dia);
      }
      mapa.set(dia.pessoa_id, linha);
    }
    return mapa;
  }, [dias, mes]);

  const pessoas = useMemo(
    () =>
      [...porPessoa.keys()].sort((a, b) =>
        (nomePorPessoaId.get(a) ?? "").localeCompare(nomePorPessoaId.get(b) ?? ""),
      ),
    [porPessoa, nomePorPessoaId],
  );

  const mover = (
    evento: React.KeyboardEvent,
    linha: number,
    coluna: number,
    marca: AusenciaDia | undefined,
  ) => {
    const limites = (l: number, c: number) => ({
      linha: Math.max(0, Math.min(pessoas.length - 1, l)),
      coluna: Math.max(0, Math.min(datas.length - 1, c)),
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
          ? limites(pessoas.length - 1, datas.length - 1)
          : limites(linha, datas.length - 1);
        break;
      case "Enter":
      case " ":
        evento.preventDefault();
        if (marca && onAbrirPedido) onAbrirPedido(marca.pedido_id);
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

  if (porPessoa.size === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("hr.ausencias.organizacao.semMarcacoes")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div
        ref={grelhaRef}
        role="grid"
        aria-label={t("hr.ausencias.organizacao.mapaLegenda")}
        aria-rowcount={pessoas.length + 1}
        aria-colcount={datas.length + 1}
        className="w-max text-xs"
      >
        <div role="row" className="flex">
          <div
            role="columnheader"
            className="sticky left-0 z-10 bg-background pr-2 text-left font-medium"
          >
            {t("hr.ausencias.lista.pessoa")}
          </div>
          {datas.map((data) => (
            <div
              key={data}
              role="columnheader"
              className="w-5 shrink-0 text-center font-normal tabular-nums"
            >
              {data.slice(8)}
            </div>
          ))}
        </div>

        {pessoas.map((pessoaId, linha) => {
          const linhaMapa = porPessoa.get(pessoaId);
          return (
            <div key={pessoaId} role="row" className="flex items-center">
              <div
                role="rowheader"
                className="sticky left-0 z-10 whitespace-nowrap bg-background pr-2 text-left font-normal"
              >
                {nomePorPessoaId.get(pessoaId) ?? "—"}
              </div>
              {datas.map((data, coluna) => {
                const marca = linhaMapa?.get(data);
                const naoUtil = eFimDeSemana(data) || eFeriado(data, feriados);
                const tipo = marca ? (tiposPorId.get(marca.tipo_id) ?? null) : null;
                const cor = corDoTipo(tipo);
                const pintar = Boolean(marca) && !naoUtil;
                const accionavel = Boolean(marca) && Boolean(onAbrirPedido);
                const descricao = marca
                  ? `${nomePorPessoaId.get(pessoaId) ?? ""} · ${data} · ${tipo ? nomeTipoAusencia(tipo, t) : t("hr.ausencias.tipoDesconhecido")} · ${t(`hr.ausencias.estadoDia.${marca.estado}`)}`
                  : `${nomePorPessoaId.get(pessoaId) ?? ""} · ${data}`;
                const activa = focada.linha === linha && focada.coluna === coluna;
                return (
                  <div
                    key={data}
                    role="gridcell"
                    data-celula={`${linha}-${coluna}`}
                    tabIndex={activa ? 0 : -1}
                    aria-label={descricao}
                    aria-disabled={!accionavel}
                    title={descricao}
                    onFocus={() => setFocada({ linha, coluna })}
                    onKeyDown={(evento) => mover(evento, linha, coluna, marca)}
                    onClick={() => accionavel && onAbrirPedido?.(marca!.pedido_id)}
                    className={cn(
                      "m-px h-5 w-5 shrink-0 rounded-[2px]",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1",
                      accionavel && "cursor-pointer",
                      naoUtil && "bg-muted",
                      !naoUtil && !pintar && "bg-accent/40",
                    )}
                    style={
                      pintar
                        ? marca?.estado === "pendente"
                          ? {
                              backgroundImage: `repeating-linear-gradient(45deg, ${cor}, ${cor} 3px, transparent 3px, transparent 6px)`,
                              boxShadow: `inset 0 0 0 1px ${cor}`,
                            }
                          : { backgroundColor: cor }
                        : undefined
                    }
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
