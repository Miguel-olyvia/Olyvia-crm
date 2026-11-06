/**
 * A lista da fila de trabalho: SO as pessoas com problemas a resolver, uma linha por pessoa. Abrir uma pessoa abre o painel
 * onde se resolve tudo dela (`PainelFilaPessoa`). O filtro por tipo e a pesquisa por nome ficam no endereco da pagina
 * (`?fila_tipo=` e `?fila_q=`) e sobrevivem a recarregar.
 *
 * UMA LISTA VAZIA NUNCA PROVA QUE NAO HA NADA: cada fonte (horas extra, justificacoes, alertas) diz como foi lida e uma que
 * falhou, foi recusada ou nao esta disponivel aparece escrita no topo; so se diz «ninguem tem nada por tratar» quando
 * as tres leram bem.
 *
 * A LISTA E GENERICA (`ListaFila`): o mapa de assiduidade (`ListaFilaPessoas`, no fim deste ficheiro) e o ecra de Ausencias
 * usam a mesma, cada um com as suas fontes, os seus tipos, o seu painel e os seus textos.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/hooks/useTranslation";
import { DetetarHorasExtraDialog } from "@/components/rh-exemplo/fluxosC/DetetarHorasExtraDialog";
import {
  FONTES_FILA,
  TIPOS_ASSIDUIDADE,
  ehTipoFila,
  filtrarPessoas,
  type FilaDeTrabalho,
  type PessoaNaFila,
  type TipoFila,
} from "@/components/rh-exemplo/hooks/useFilaDeTrabalho";
import type { PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";
import type { LocalTrabalho } from "@/components/rh-exemplo/tipos";
import { textoDasPendencias } from "./aspectoTipoFila";
import { LinhaFilaPessoa } from "./LinhaFilaPessoa";
import type { PessoaAberta } from "./PainelFilaBase";
import { PainelFilaPessoa } from "./PainelFilaPessoa";

const PARAM_TIPO = "fila_tipo";
const PARAM_TEXTO = "fila_q";
const TODOS = "";
const LINHAS_DE_ESQUELETO = 5;
const MAX_PESQUISA = 80;
/** A pesquisa escreve no endereco so depois de a pessoa parar de escrever. */
const ESPERA_ENDERECO_MS = 300;
/** O leitor de ecra so ouve a contagem filtrada depois de a pessoa parar de escrever. */
const ESPERA_ANUNCIO_MS = 500;

/** O que o painel de uma pessoa recebe da lista. */
export interface PropsDoPainel<F extends string> {
  aberta: PessoaAberta;
  pessoa: PessoaNaFila | null;
  fontesComProblema: readonly F[];
  aoFechar: () => void;
  aoDevolverFoco: (evento: Event) => void;
}

/** Os textos que mudam de ecra para ecra (chaves de traducao). */
interface TextosDaLista {
  titulo: string;
  ajuda: string;
  vazia: string;
  /** A nota por baixo dos filtros quando HA periodo da folha; `null` para nao a mostrar. */
  notaComPeriodo: string | null;
}

const TEXTOS_DE_ASSIDUIDADE: TextosDaLista = { titulo: "rhFila.titulo", ajuda: "rhFila.ajuda", vazia: "rhFila.vazia", notaComPeriodo: "rhFila.inclueAnterior" };

interface ListaFilaProps<F extends string> {
  fila: FilaDeTrabalho<F>;
  /** As fontes que esta fila le: cada uma que nao leu bem aparece escrita no topo. */
  fontes: readonly F[];
  /** Os tipos que o filtro oferece; com um so, o filtro nao aparece. */
  tipos: readonly TipoFila[];
  textos?: TextosDaLista;
  /** Junto aos filtros (por exemplo o botao «Detetar»). */
  topoExtra?: ReactNode;
  renderPainel: (props: PropsDoPainel<F>) => ReactNode;
}

function AvisoDeFonte({ fonte, estado, aoTentar }: { fonte: string; estado: "recusado" | "erro" | "indisponivel"; aoTentar: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      data-testid={`rhd-fila-aviso-${fonte}`}
      className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
    >
      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{t(`rhFila.aviso.${estado}`, { fonte: t(`rhFila.fonte.${fonte}`) })}</span>
      {estado === "erro" && (
        <Button type="button" variant="outline" className="min-h-11" onClick={aoTentar}>
          {t("rhFila.aviso.tentar")}
        </Button>
      )}
    </div>
  );
}

export function ListaFila<F extends string>({ fila, fontes, tipos, textos = TEXTOS_DE_ASSIDUIDADE, topoExtra, renderPainel }: ListaFilaProps<F>) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tipoDoUrl = params.get(PARAM_TIPO);
  const tipo = ehTipoFila(tipoDoUrl) ? tipoDoUrl : null;
  const textoDoUrl = params.get(PARAM_TEXTO) ?? "";
  // O que se escreve filtra logo; o endereco acompanha com atraso (cada tecla nao enche o historico de escritas).
  const [texto, setTexto] = useState(textoDoUrl.slice(0, MAX_PESQUISA));
  const [aberta, setAberta] = useState<PessoaAberta | null>(null);
  const raizRef = useRef<HTMLElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const indiceAoAbrir = useRef(0);
  const ultimaAberta = useRef<string | null>(null);

  const mudarParametro = (chave: string, valor: string): void =>
    setParams(
      (anterior) => {
        const proximos = new URLSearchParams(anterior);
        if (valor === "") proximos.delete(chave);
        else proximos.set(chave, valor);
        return proximos;
      },
      { replace: true },
    );

  useEffect(() => {
    if (texto === textoDoUrl) return;
    const espera = setTimeout(() => mudarParametro(PARAM_TEXTO, texto), ESPERA_ENDERECO_MS);
    return () => clearTimeout(espera);
    // `mudarParametro` so depende de `setParams`, estavel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, textoDoUrl]);

  const filtrado = tipo !== null || texto.trim() !== "";
  const visiveis = useMemo(() => filtrarPessoas(fila.pessoas, { tipo, texto }), [fila.pessoas, tipo, texto]);
  const pessoaAberta = aberta ? (fila.pessoas.find((pessoa) => pessoa.pessoaId === aberta.id) ?? null) : null;
  const fontesComProblema = fontes.filter((fonte) => fila.fontes[fonte] !== "ok");

  const mensagemFiltro = filtrado && !fila.aCarregar ? t("rhFila.contagemFiltrada", { n: String(visiveis.length), total: String(fila.pessoas.length) }) : "";
  const [anunciado, setAnunciado] = useState(mensagemFiltro);
  useEffect(() => {
    const espera = setTimeout(() => setAnunciado(mensagemFiltro), ESPERA_ANUNCIO_MS);
    return () => clearTimeout(espera);
  }, [mensagemFiltro]);

  // A regiao de estado nasce vazia e so depois ganha o texto: assim os leitores de ecra anunciam-no.
  const [textoDeCarregar, setTextoDeCarregar] = useState("");
  useEffect(() => {
    setTextoDeCarregar(fila.aCarregar ? t("rhFila.carregando") : "");
  }, [fila.aCarregar, t]);

  const abrir = (pessoa: PessoaNaFila): void => {
    indiceAoAbrir.current = Math.max(0, visiveis.findIndex((candidata) => candidata.pessoaId === pessoa.pessoaId));
    ultimaAberta.current = pessoa.pessoaId;
    setAberta({ id: pessoa.pessoaId, nome: pessoa.nome });
  };

  /** Ao fechar o painel o foco volta a linha da pessoa; se ela ja saiu da lista, a linha que ficou no seu lugar, ou o titulo. */
  const devolverFoco = (evento: Event): void => {
    evento.preventDefault();
    const linhas = Array.from(raizRef.current?.querySelectorAll<HTMLElement>("[data-fila-pessoa]") ?? []);
    const dela = linhas.find((linha) => linha.getAttribute("data-fila-pessoa") === ultimaAberta.current);
    const alvo = dela ?? linhas[Math.min(indiceAoAbrir.current, linhas.length - 1)] ?? tituloRef.current;
    alvo?.focus();
  };

  const limparFiltros = (): void => {
    setTexto("");
    setParams(
      (anterior) => {
        const proximos = new URLSearchParams(anterior);
        proximos.delete(PARAM_TIPO);
        proximos.delete(PARAM_TEXTO);
        return proximos;
      },
      { replace: true },
    );
  };

  return (
    <section ref={raizRef} aria-labelledby="fila-titulo" aria-busy={fila.aCarregar} className="space-y-4" data-testid="rhd-fila-pessoas">
      <div className="space-y-1">
        <h2 id="fila-titulo" ref={tituloRef} tabIndex={-1} className="text-base font-semibold outline-none">
          {t(textos.titulo)}
        </h2>
        <p className="text-sm text-muted-foreground">{t(textos.ajuda)}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div role="search" className="space-y-1.5">
          <Label htmlFor="fila-pesquisa">{t("rhFila.pesquisa.rotulo")}</Label>
          <Input
            id="fila-pesquisa"
            type="search"
            className="min-h-11 w-64"
            placeholder={t("rhFila.pesquisa.placeholder")}
            value={texto}
            maxLength={MAX_PESQUISA}
            onChange={(evento) => setTexto(evento.target.value)}
          />
        </div>
        {tipos.length > 1 && (
          <div className="space-y-1.5">
            <Label htmlFor="fila-tipo">{t("rhFila.filtro.rotulo")}</Label>
            <NativeSelect
              id="fila-tipo"
              className="h-11 w-56"
              value={tipo ?? TODOS}
              onValueChange={(valor) => mudarParametro(PARAM_TIPO, valor)}
              options={[
                { value: TODOS, label: t("rhFila.filtro.todos") },
                ...tipos.map((valor) => ({ value: valor, label: t(`rhFila.tipoPlural.${valor}`) })),
              ]}
            />
          </div>
        )}
        {topoExtra}
      </div>

      {/* Anuncia so quando o filtro muda: as releituras silenciosas nao dizem nada. */}
      <p aria-live="polite" aria-atomic="true" data-testid="rhd-fila-contagem-filtrada" className="min-h-5 text-sm text-muted-foreground">
        {anunciado}
      </p>

      {fila.horasExtraCortadas && (
        <p data-testid="rhd-fila-cortada" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
          {t("rhFila.notaCortada", { n: String(fila.horasExtra.lidas), total: String(fila.horasExtra.total) })}
        </p>
      )}
      {!fila.aCarregar && (
        <p data-testid="rhd-fila-periodo" className="text-xs text-muted-foreground">
          {fila.periodo === null ? t("rhFila.semPeriodo") : textos.notaComPeriodo ? t(textos.notaComPeriodo) : ""}
        </p>
      )}

      {!fila.aCarregar &&
        fontesComProblema.map((fonte) => (
          <AvisoDeFonte key={fonte} fonte={fonte} estado={fila.fontes[fonte] as unknown as "recusado" | "erro" | "indisponivel"} aoTentar={() => void fila.recarregar()} />
        ))}

      {fila.aCarregar ? (
        <div className="space-y-2" data-testid="rhd-fila-a-carregar">
          <p role="status" className="sr-only">{textoDeCarregar}</p>
          {Array.from({ length: LINHAS_DE_ESQUELETO }, (_, indice) => (
            <Skeleton key={indice} className="h-14 w-full" />
          ))}
        </div>
      ) : visiveis.length > 0 ? (
        <>
          <p className="text-sm tabular-nums text-muted-foreground" data-testid="rhd-fila-totais">
            {t(`rhFila.pessoas.${visiveis.length === 1 ? "um" : "varios"}`, { n: String(visiveis.length) })} · {textoDasPendencias(t, visiveis.reduce((soma, pessoa) => soma + pessoa.total, 0))}
          </p>
          <ul role="list" aria-labelledby="fila-titulo" className="divide-y rounded-md border">
            {visiveis.map((pessoa) => (
              <LinhaFilaPessoa key={pessoa.pessoaId} pessoa={pessoa} hoje={fila.hoje} aoAbrir={abrir} />
            ))}
          </ul>
        </>
      ) : fila.pessoas.length > 0 ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <p className="text-center text-sm text-muted-foreground">{t("rhFila.vazioFiltrado")}</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={limparFiltros}>
            {t("rhFila.limparFiltros")}
          </Button>
        </div>
      ) : fila.lidaComSucesso ? (
        <p className="py-8 text-center text-sm text-muted-foreground" data-testid="rhd-fila-vazia">{t(textos.vazia)}</p>
      ) : null}

      {aberta && renderPainel({ aberta, pessoa: pessoaAberta, fontesComProblema, aoFechar: () => setAberta(null), aoDevolverFoco: devolverFoco })}
    </section>
  );
}

interface ListaFilaPessoasProps {
  fila: FilaDeTrabalho;
  permissoes: PermissoesAssiduidade;
  locais: LocalTrabalho[];
  minhaPessoaId: string | null;
  /** Depois de gravar algo que mexe no mapa do mes (faltas, horas corrigidas), para o mapa reler. */
  aoAlterarMapa: () => void;
}

/** A fila do mapa de assiduidade: horas extra, justificacoes e alertas do fim do dia. */
export function ListaFilaPessoas({ fila, permissoes, locais, minhaPessoaId, aoAlterarMapa }: ListaFilaPessoasProps) {
  const { t } = useTranslation();
  const [detetarAberto, setDetetarAberto] = useState(false);
  return (
    <>
      <ListaFila
        fila={fila}
        fontes={FONTES_FILA}
        tipos={TIPOS_ASSIDUIDADE}
        topoExtra={
          permissoes.gerir && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setDetetarAberto(true)}>
              {t("rhHeReal.detetar.abrir")}
            </Button>
          )
        }
        renderPainel={(painel) => (
          <PainelFilaPessoa
            aberta={painel.aberta}
            pessoa={painel.pessoa}
            hoje={fila.hoje}
            lidaComSucesso={fila.lidaComSucesso}
            fontesComProblema={painel.fontesComProblema}
            permissoes={permissoes}
            locais={locais}
            minhaPessoaId={minhaPessoaId}
            aoRecarregar={fila.recarregar}
            aoAlterarMapa={aoAlterarMapa}
            aoFechar={painel.aoFechar}
            aoDevolverFoco={painel.aoDevolverFoco}
          />
        )}
      />
      <DetetarHorasExtraDialog aberto={detetarAberto} aoFechar={() => setDetetarAberto(false)} />
    </>
  );
}