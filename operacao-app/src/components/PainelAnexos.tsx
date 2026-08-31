import { useEffect, useRef, useState } from "react";
import {
  ErroDeEscrita,
  anexarFicheiro,
  removerAnexo,
  urlsDosAnexos,
  type Anexo,
  type MembroEquipa,
} from "../lib/dados";
import { Badge, Button, Card, Spinner, Toggle, cx } from "./ui";
import { Plus, X } from "./icons";
import { dataHora } from "../lib/formatar";

/**
 * Fotos e ficheiros da ordem.
 *
 * A coisa que os técnicos mais fazem no Infraspeak, e a que faz o relatório
 * ao cliente deixar de ser texto sem prova.
 *
 * Três decisões:
 *
 *  · O botão diz "Tirar foto" no telemóvel e "Anexar" no computador — é o
 *    mesmo input, com `capture`, mas a palavra certa poupa uma hesitação a
 *    quem está de pé em frente a um quadro elétrico.
 *
 *  · A legenda escreve-se DEPOIS de a foto subir, não antes. Quem está no
 *    local carrega no botão e continua a trabalhar; escrever primeiro faria
 *    perder o momento.
 *
 *  · Os URLs são assinados e duram uma hora. Um ficheiro de obra pode ter a
 *    matrícula de um carro ou a cara de alguém, e um link permanente a
 *    circular por email é a maneira mais fácil de isso sair da empresa sem
 *    ninguém ter decidido nada.
 */

/**
 * O que o campo de ficheiros oferece.
 *
 * A mesma lista está na base, em `db/documentos-e-ativos.sql`, e é a de lá que
 * manda: esta é só para o diálogo do sistema não mostrar ficheiros que o
 * servidor vai recusar.
 */
const ACEITA = [
  "image/*",
  "audio/*",
  ".pdf",
  ".doc", ".docx",
  ".xls", ".xlsx",
  ".odt", ".ods",
  ".csv", ".txt",
].join(",");

/** A extensão, para o quadradinho: DOCX, XLSX, PDF. */
function extensao(nome: string): string {
  const p = nome.split(".").pop();
  return p && p.length <= 4 ? p.toUpperCase() : "FIC";
}

/** O tamanho como se diz. Nulo acontece em ficheiros antigos. */
function comoTamanho(bytes: number | null): string {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export default function PainelAnexos({
  ordemId,
  organizationId,
  estado,
  anexos,
  equipa,
  podeAnexar,
  aoMudar,
}: {
  ordemId: string;
  organizationId: string;
  estado: string;
  anexos: readonly Anexo[];
  equipa: ReadonlyMap<string, MembroEquipa>;
  podeAnexar: boolean;
  aoMudar: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputFicheiroRef = useRef<HTMLInputElement>(null);
  // Uma foto vê-se; um documento lê-se pelo nome. São duas listas diferentes.
  const fotos = anexos.filter((a) => (a.mime ?? "").startsWith("image/"));
  const documentos = anexos.filter((a) => !(a.mime ?? "").startsWith("image/"));
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [aSubir, setASubir] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [privado, setPrivado] = useState(false);
  const [aVer, setAVer] = useState<Anexo | null>(null);

  const encerrada = ["confirmada", "cancelada"].includes(estado);
  const ativo = podeAnexar && !encerrada;

  // Os URLs assinados expiram. Pedem-se de cada vez que a lista muda, em vez
  // de se guardarem — guardá-los daria imagens partidas ao fim de uma hora
  // com o separador aberto, que é exatamente o que acontece numa obra.
  useEffect(() => {
    const caminhos = anexos.map((a) => a.caminho);
    if (caminhos.length === 0) {
      setUrls(new Map());
      return;
    }
    let vivo = true;
    void urlsDosAnexos(caminhos).then((m) => {
      if (vivo) setUrls(m);
    });
    return () => {
      vivo = false;
    };
  }, [anexos]);

  const enviar = async (ficheiros: FileList | null) => {
    if (!ficheiros?.length) return;
    setASubir(true);
    setErro(null);
    try {
      // Um de cada vez. Em paralelo, um erro a meio deixava metade subida e
      // metade não, e ninguém saberia quais.
      for (const f of Array.from(ficheiros)) {
        await anexarFicheiro({ ordemId, organizationId, ficheiro: f, privado });
      }
      aoMudar();
    } catch (e) {
      setErro(
        e instanceof ErroDeEscrita
          ? e.message
          : "Não foi possível enviar o ficheiro. Tenta outra vez."
      );
    } finally {
      setASubir(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const apagar = async (a: Anexo) => {
    setErro(null);
    try {
      await removerAnexo(a.id);
      setAVer(null);
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível apagar o ficheiro.");
    }
  };

  if (anexos.length === 0 && !ativo) return null;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">
          Fotos e ficheiros
          {anexos.length > 0 && (
            <span className="ml-2 font-mono text-xs font-normal tabular text-slate-400">
              {anexos.length}
            </span>
          )}
        </h2>

        {ativo && (
          <div className="flex flex-wrap items-center gap-3">
            <Toggle
              checked={privado}
              onChange={setPrivado}
              label="Só para nós"
              hint="Não sai no relatório do cliente"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={aSubir}
              onClick={() => inputFicheiroRef.current?.click()}
            >
              <Plus width={14} height={14} />
              Ficheiro
            </Button>
            <Button size="sm" disabled={aSubir} onClick={() => inputRef.current?.click()}>
              <Plus width={14} height={14} />
              {aSubir ? "A enviar…" : "Foto"}
            </Button>
          </div>
        )}
      </div>

      {/* Dois caminhos, e de propósito. `capture` faz o telemóvel abrir a
          câmara direto — ótimo para quem está no local, inútil para quem quer
          anexar um auto de medição em Word. */}
      <input
        ref={inputRef}
        type="file"
        multiple
        capture="environment"
        accept="image/*"
        className="hidden"
        onChange={(e) => void enviar(e.target.files)}
      />
      <input
        ref={inputFicheiroRef}
        type="file"
        multiple
        accept={ACEITA}
        className="hidden"
        onChange={(e) => void enviar(e.target.files)}
      />

      {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {anexos.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          Sem fotos nem ficheiros. Uma foto do sítio antes de mexer poupa muita discussão
          depois.
        </p>
      ) : (
        <>
        {/* Os documentos primeiro e em lista: um Word numa grelha de miniaturas
            é um quadrado cinzento com um nome cortado ao meio. */}
        {documentos.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100">
            {documentos.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setAVer(a)}
                  className="flex w-full items-center gap-3 py-2 text-left"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-semibold uppercase text-slate-500">
                    {extensao(a.nome)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-800">
                      {a.legenda ?? a.nome}
                    </span>
                    <span className="block text-xs text-slate-400">{comoTamanho(a.tamanho)}</span>
                  </span>
                  {a.privado && <Badge>só para nós</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {fotos.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {fotos.map((a) => {
            const url = urls.get(a.caminho);
            const imagem = (a.mime ?? "").startsWith("image/");
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setAVer(a)}
                  className={cx(
                    "group block w-full overflow-hidden rounded-lg ring-1 ring-slate-200",
                    "transition-all hover:ring-brand/40 focus-visible:outline-none",
                    "focus-visible:ring-2 focus-visible:ring-brand/40"
                  )}
                >
                  <span className="relative block aspect-[4/3] bg-slate-50">
                    {imagem && url ? (
                      <img
                        src={url}
                        alt={a.legenda ?? a.nome}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-slate-400">
                        {url ? a.nome : "a carregar…"}
                      </span>
                    )}
                    {a.privado && (
                      <Badge className="absolute left-1.5 top-1.5 bg-slate-900/70 text-white ring-0">
                        só para nós
                      </Badge>
                    )}
                  </span>
                </button>

                <p className="mt-1 truncate text-xs text-slate-500" title={a.legenda ?? a.nome}>
                  {a.legenda ?? a.nome}
                </p>
              </li>
            );
          })}
        </ul>
        )}
        </>
      )}

      {aSubir && (
        <div className="mt-3">
          <Spinner label="A enviar" />
        </div>
      )}

      {/* Ver em grande, com o que se sabe sobre o ficheiro */}
      {aVer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setAVer(null)}
        >
          <div
            className="max-h-full w-full max-w-3xl overflow-auto rounded-xl bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{aVer.nome}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {dataHora(aVer.carregado_em)}
                  {aVer.carregado_por && ` · ${equipa.get(aVer.carregado_por)?.nome ?? "—"}`}
                  {aVer.tamanho != null && ` · ${(aVer.tamanho / 1024 / 1024).toFixed(1)} MB`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAVer(null)}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="Fechar"
              >
                <X width={18} height={18} />
              </button>
            </div>

            {(aVer.mime ?? "").startsWith("image/") && urls.get(aVer.caminho) && (
              <img
                src={urls.get(aVer.caminho)}
                alt={aVer.legenda ?? aVer.nome}
                className="mt-3 w-full rounded-lg"
              />
            )}

            {(aVer.mime ?? "").startsWith("audio/") && urls.get(aVer.caminho) && (
              <audio src={urls.get(aVer.caminho)} controls className="mt-3 w-full" />
            )}

            {aVer.legenda && <p className="mt-3 text-sm text-slate-600">{aVer.legenda}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              {urls.get(aVer.caminho) && (
                <a
                  href={urls.get(aVer.caminho)}
                  target="_blank"
                  rel="noreferrer"
                  className={cx(
                    "inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5",
                    "text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                  )}
                >
                  Abrir noutro separador
                </a>
              )}
              {ativo && (
                <Button size="sm" variant="danger" onClick={() => void apagar(aVer)}>
                  Apagar
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
