/**
 * O cartao de anexos do convite de admissao publico. Mostra os tipos abertos
 * (hoje so o comprovativo de IBAN; o cartao de cidadao e a fotografia estao
 * fechados) e marca com a palavra «Obrigatorio» os que a submissao exige. A regra
 * e do servidor; aqui so se mostra e, quem monta o cartao, decide o que fazer.
 *
 * PRESENTACIONAL: recebe o resultado de `useConviteAnexos` e a funcao `t` (ja
 * na lingua do ecra publico), como as paginas do convite. Quem envia, confirma
 * e remove e o hook; aqui so se mostra e se aciona.
 *
 * ACESSIBILIDADE: o seletor de ficheiros nativo fica escondido e e accionado
 * por um botao com TEXTO visivel; o nome acessivel do botao junta o texto a
 * etiqueta da linha (tres botoes "Adicionar ficheiro" iguais nao diriam a que
 * linha pertencem). O progresso e uma `progressbar` com valor e nome; o que ja
 * foi enviado diz-o em texto ("Enviado"), nao so por cor ou icone; os erros de
 * cada linha sao `role="alert"`. Nao ha pre-visualizacao de imagens.
 *
 * TELEMOVEL: todos os alvos tem 44 px (`min-h-11`, `h-11 w-11`); o nome do
 * ficheiro corta com reticencias (`truncate`) sem empurrar os botoes para fora;
 * o seletor nativo nao leva `capture` (abre a galeria e os ficheiros, nao so a
 * camara). O nome do ficheiro e SEMPRE texto (nunca HTML).
 */
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { CheckCircle2, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ResultadoConviteAnexos } from "@/hooks/useConviteAnexos";
import type { IdiomaConvite } from "@/lib/hr/conviteAdmissaoEcra";
import type { TraduzirFn } from "@/lib/hr/errosAdmissao";
import {
  LIMITES_ANEXOS,
  TIPOS_ANEXO_CONVITE_ABERTOS,
  chaveDeErroAnexo,
  formatarTamanho,
  type TipoAnexoConvite,
} from "@/lib/hr/conviteAnexos";

type EstadoAnexos = Pick<
  ResultadoConviteAnexos,
  "anexos" | "envios" | "contagem" | "adicionar" | "remover"
>;

interface ConviteAnexosCardProps {
  t: TraduzirFn;
  idioma?: IdiomaConvite;
  estado: EstadoAnexos;
  /** Os tipos que se mostram; por omissao os abertos (so o comprovativo de IBAN). */
  tipos?: readonly TipoAnexoConvite[];
  /** Os tipos sem os quais nao se submete: a linha diz «Obrigatorio» em texto. */
  obrigatorios?: readonly string[];
  /** O id do alerta («Falta enviar...») que fala destes tipos: o botao de adicionar liga-se a ele (aria-describedby). */
  idAlerta?: string;
  /** Durante a submissao nao se adiciona nem se remove nada. */
  bloqueado?: boolean;
}

interface DefinicaoLinha {
  rotulo: string;
  /** Ajuda propria da linha, se a houver. */
  ajuda: string | null;
  /** A ajuda comum de formatos e tamanho; a fotografia tem a sua. */
  formatos: boolean;
  accept: string;
}

const LINHAS: Readonly<Record<TipoAnexoConvite, DefinicaoLinha>> = {
  cartao_cidadao: {
    rotulo: "hr.convite.anexos.cartaoCidadao",
    ajuda: "hr.convite.anexos.cartaoCidadaoAjuda",
    formatos: true,
    accept: LIMITES_ANEXOS.mimesAceites.join(","),
  },
  comprovativo_iban: {
    rotulo: "hr.convite.anexos.comprovativoIban",
    ajuda: null,
    formatos: true,
    accept: LIMITES_ANEXOS.mimesAceites.join(","),
  },
  fotografia: {
    rotulo: "hr.convite.anexos.fotografia",
    ajuda: "hr.convite.anexos.fotografiaAjuda",
    formatos: false,
    accept: LIMITES_ANEXOS.mimesFotografia.join(","),
  },
};

export function ConviteAnexosCard({
  t,
  idioma = "pt",
  estado,
  tipos = TIPOS_ANEXO_CONVITE_ABERTOS,
  obrigatorios = [],
  idAlerta,
  bloqueado = false,
}: ConviteAnexosCardProps) {
  const base = useId();
  const { anexos, envios, contagem, adicionar, remover } = estado;
  const totalCheio = contagem.total >= LIMITES_ANEXOS.maxActivos;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("hr.convite.anexos.titulo")}</CardTitle>
        <CardDescription>{t("hr.convite.anexos.descricao")}</CardDescription>
        {/* "n de 4" so diz alguma coisa quando ha mais de um tipo aberto. */}
        {tipos.length > 1 && (
          <p className="text-sm font-medium" aria-live="polite">
            {t("hr.convite.anexos.contador", { n: contagem.total })}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {tipos.map((tipo) => (
          <LinhaAnexo
            key={tipo}
            idBase={`${base}-${tipo}`}
            tipo={tipo}
            obrigatorio={obrigatorios.includes(tipo)}
            idAlerta={obrigatorios.includes(tipo) ? idAlerta : undefined}
            bloqueado={bloqueado}
            t={t}
            idioma={idioma}
            anexosDoTipo={anexos.filter((a) => a.tipo === tipo)}
            enviosDoTipo={Object.entries(envios).filter(([, e]) => e.tipo === tipo)}
            desactivado={totalCheio || (contagem.porTipo[tipo] ?? 0) >= LIMITES_ANEXOS.porTipo[tipo]}
            onAdicionar={adicionar}
            onRemover={remover}
          />
        ))}
      </CardContent>
    </Card>
  );
}

interface LinhaAnexoProps {
  idBase: string;
  tipo: TipoAnexoConvite;
  obrigatorio: boolean;
  idAlerta?: string;
  bloqueado: boolean;
  t: TraduzirFn;
  idioma: IdiomaConvite;
  anexosDoTipo: EstadoAnexos["anexos"];
  enviosDoTipo: Array<[string, EstadoAnexos["envios"][string]]>;
  desactivado: boolean;
  onAdicionar: EstadoAnexos["adicionar"];
  onRemover: EstadoAnexos["remover"];
}

function LinhaAnexo({
  idBase,
  tipo,
  obrigatorio,
  idAlerta,
  bloqueado,
  t,
  idioma,
  anexosDoTipo,
  enviosDoTipo,
  desactivado,
  onAdicionar,
  onRemover,
}: LinhaAnexoProps) {
  const definicao = LINHAS[tipo];
  const entradaRef = useRef<HTMLInputElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const idLegenda = `${idBase}-legenda`;
  const idBotao = `${idBase}-botao`;
  const idAjuda = `${idBase}-ajuda`;
  const idFormatos = `${idBase}-formatos`;
  const idLimite = `${idBase}-limite`;
  const descritoPor = [
    definicao.ajuda ? idAjuda : null,
    definicao.formatos ? idFormatos : null,
    desactivado ? idLimite : null,
    // O erro de cada ficheiro desta linha e o resumo do que falta (do formulario) leem-se junto ao botao.
    ...enviosDoTipo.filter(([, e]) => e.fase === "erro").map(([id]) => `${idBase}-erro-${id}`),
    idAlerta ?? null,
  ]
    .filter(Boolean)
    .join(" ");

  // Remocao: o botao X sai do DOM e levava o foco consigo. Marca-se o que se
  // pediu para remover; quando o ficheiro deixa a lista, anuncia-se e o foco
  // vai para "Adicionar ficheiro" desta linha. Se a remocao falhar o ficheiro
  // fica na lista e nada se anuncia.
  const [aRemover, setARemover] = useState<ReadonlySet<string>>(() => new Set());
  const [removido, setRemovido] = useState<{ id: string; nome: string } | null>(null);
  const [anuncio, setAnuncio] = useState("");

  const aoRemover = async (anexo: EstadoAnexos["anexos"][number]): Promise<void> => {
    if (aRemover.has(anexo.id)) return;
    setARemover((actuais) => new Set(actuais).add(anexo.id));
    setRemovido({ id: anexo.id, nome: anexo.nome_original });
    setAnuncio("");
    try {
      await onRemover(anexo.id);
    } finally {
      setARemover((actuais) => {
        const proximos = new Set(actuais);
        proximos.delete(anexo.id);
        return proximos;
      });
    }
  };

  // UMA regiao de estado sempre no DOM (o leitor de ecra so anuncia o que muda numa regiao que ja existia):
  // uma frase curta por transicao. A lista nao e regiao viva (anunciava tudo de cada vez que mudava).
  const antes = useRef<{ anexos: Set<string>; envios: Map<string, string> } | null>(null);
  useEffect(() => {
    const agora = {
      anexos: new Set(anexosDoTipo.map((a) => a.id)),
      envios: new Map(enviosDoTipo.map(([id, e]) => [id, e.fase] as [string, string])),
    };
    const anterior = antes.current;
    antes.current = agora;
    if (!anterior) return;
    let frase: string | null = null;
    for (const [id, e] of enviosDoTipo) {
      const faseAnterior = anterior.envios.get(id);
      if (e.fase === "erro" && faseAnterior !== "erro") frase = t("hr.convite.anexos.anunciaErro", { nome: e.nome });
      else if (e.fase !== "erro" && faseAnterior === undefined) frase = t("hr.convite.anexos.anunciaEnviar", { nome: e.nome });
    }
    for (const a of anexosDoTipo) {
      if (!anterior.anexos.has(a.id)) frase = t("hr.convite.anexos.anunciaEnviado", { nome: a.nome_original });
    }
    if (frase) setAnuncio(frase);
  }, [anexosDoTipo, enviosDoTipo, t]);

  useEffect(() => {
    if (!removido || anexosDoTipo.some((a) => a.id === removido.id)) return;
    setAnuncio(t("hr.convite.anexos.removido", { nome: removido.nome }));
    setRemovido(null);
    botaoRef.current?.focus();
  }, [anexosDoTipo, removido, t]);

  const aoEscolher = (evento: ChangeEvent<HTMLInputElement>) => {
    const ficheiro = evento.target.files?.[0];
    // Limpa o seletor: escolher o mesmo ficheiro outra vez tem de voltar a disparar.
    evento.target.value = "";
    if (ficheiro) void onAdicionar(tipo, ficheiro);
  };

  const enviosEmCurso = enviosDoTipo.filter(([, e]) => e.fase !== "erro");
  const erros = enviosDoTipo.filter(([, e]) => e.fase === "erro");

  return (
    <fieldset className="m-0 min-w-0 space-y-2 border-0 p-0">
      <legend id={idLegenda} className="text-sm font-medium">
        {t(definicao.rotulo)}
        {obrigatorio && (
          // Em texto, nao so por cor ou asterisco: o leitor de ecra le-o na legenda do grupo.
          // O espaco e texto (nao so margem): sem ele o nome acessivel seria "Comprovativo de IBAN(Obrigatorio)".
          <>
            {" "}
            <span className="text-sm font-semibold text-destructive">({t("hr.convite.anexos.obrigatorio")})</span>
          </>
        )}
      </legend>
      {definicao.ajuda && (
        <p id={idAjuda} className="text-xs text-muted-foreground">
          {t(definicao.ajuda)}
        </p>
      )}
      {definicao.formatos && (
        <p id={idFormatos} className="text-xs text-muted-foreground">
          {t("hr.convite.anexos.formatosAjuda")}
        </p>
      )}

      <input
        ref={entradaRef}
        type="file"
        className="hidden"
        tabIndex={-1}
        accept={definicao.accept}
        data-testid={`anexo-input-${tipo}`}
        aria-hidden="true"
        onChange={aoEscolher}
      />
      <Button
        ref={botaoRef}
        id={idBotao}
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11"
        data-anexo-adicionar={tipo}
        disabled={desactivado || bloqueado}
        aria-labelledby={`${idBotao} ${idLegenda}`}
        aria-describedby={descritoPor || undefined}
        onClick={() => entradaRef.current?.click()}
      >
        <Paperclip className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        {t("hr.convite.anexos.adicionar")}
      </Button>
      {desactivado && (
        <p id={idLimite} className="text-xs text-muted-foreground">
          {t("hr.convite.anexos.limiteAtingido")}
        </p>
      )}
      {/* Anuncia o envio, o fim, o erro e a remocao: uma frase por transicao, a regiao nunca sai do DOM. */}
      <p role="status" aria-atomic="true" className="sr-only">
        {anuncio}
      </p>

      {(anexosDoTipo.length > 0 || enviosEmCurso.length > 0) && (
        <ul className="space-y-2">
          {anexosDoTipo.map((anexo) => (
            <li key={anexo.id} className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate" title={anexo.nome_original}>
                {anexo.nome_original}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatarTamanho(anexo.tamanho_bytes, idioma)}
              </span>
              <span className="shrink-0 text-xs font-medium">
                {aRemover.has(anexo.id) ? t("hr.convite.anexos.aRemover") : t("hr.convite.anexos.enviado")}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0"
                disabled={aRemover.has(anexo.id) || bloqueado}
                aria-busy={aRemover.has(anexo.id) ? true : undefined}
                aria-label={t("hr.convite.anexos.remover", { nome: anexo.nome_original })}
                onClick={() => void aoRemover(anexo)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
          {enviosEmCurso.map(([id, envio]) => (
            <li key={id} className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate" title={envio.nome}>
                  {envio.nome}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {envio.fase === "a_verificar"
                    ? t("hr.convite.anexos.aVerificar")
                    : t("hr.convite.anexos.aEnviar")}
                </span>
              </div>
              {envio.fase === "a_enviar" && (
                <Progress
                  value={envio.progresso}
                  className="h-2"
                  aria-label={t("hr.convite.anexos.progresso", { nome: envio.nome })}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {erros.map(([id, envio]) => (
        <p key={id} id={`${idBase}-erro-${id}`} role="alert" className="text-xs text-destructive">
          <span className="font-medium">{envio.nome}</span>: {t(chaveDeErroAnexo(envio.codigoErro))}
        </p>
      ))}
    </fieldset>
  );
}
