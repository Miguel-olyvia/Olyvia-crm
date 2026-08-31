import { useCallback, useEffect, useRef, useState } from "react";
import {
  ErroDeEscrita,
  escreverMensagem,
  mensagensDaOrdem,
  type MembroEquipa,
  type Mensagem,
} from "../lib/dados";
import { Button, Card, Spinner } from "./ui";
import { Mensagens as IconeMensagens } from "./icons";
import { dataHora } from "../lib/formatar";

/**
 * A conversa desta ordem.
 *
 * Hoje esta conversa existe — acontece no WhatsApp pessoal de quem está no
 * local, e desaparece com ele. Quando o cliente pergunta, três meses depois,
 * porque é que se trocou a peça toda em vez do vedante, a resposta estava
 * escrita e ninguém a consegue encontrar.
 *
 * Três decisões:
 *
 *  · É **entre colegas**. Não é o cliente que lê isto, nem sai daqui para
 *    lado nenhum. Ver `db/mensagens.sql` para o porquê de o canal `cliente`
 *    ser recusado pela própria base.
 *
 *  · **Não se apaga nem se reescreve.** Uma conversa que muda depois de lida
 *    não esclarece nada — e "quem disse o quê" é precisamente o que isto vem
 *    resolver.
 *
 *  · Quem escreve **toca o sino** ao responsável e à equipa da ordem. Uma
 *    mensagem que ninguém vê não serve para nada.
 */

const LIMITE = 2000;

export default function PainelMensagens({
  ordemId,
  equipa,
  euId,
}: {
  ordemId: string;
  /** Para dar nome ao autor — o id sozinho não diz nada a ninguém. */
  equipa: Map<string, MembroEquipa>;
  /** Quem está a ver. As minhas mensagens encostam à direita. */
  euId: string | null;
}) {
  const [mensagens, setMensagens] = useState<Mensagem[] | null>(null);
  const [texto, setTexto] = useState("");
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement | null>(null);

  const carregar = useCallback(async () => {
    try {
      setMensagens(await mensagensDaOrdem(ordemId));
    } catch {
      setErro("Não foi possível carregar a conversa.");
      setMensagens([]);
    }
  }, [ordemId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const enviar = async () => {
    const limpo = texto.trim();
    if (!limpo || aEnviar) return;
    setAEnviar(true);
    setErro(null);
    try {
      await escreverMensagem(ordemId, limpo.slice(0, LIMITE));
      setTexto("");
      await carregar();
      // Depois de escrever, o que interessa é o fim da conversa.
      fim.current?.scrollIntoView({ block: "nearest" });
    } catch (e) {
      setErro(
        e instanceof ErroDeEscrita ? e.message : "Não foi possível enviar a mensagem."
      );
    } finally {
      setAEnviar(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <IconeMensagens width={16} height={16} className="text-brand-600" />
        <h2 className="text-sm font-semibold text-slate-800">Conversa</h2>
        {mensagens && mensagens.length > 0 && (
          <span className="text-xs text-slate-400">
            {mensagens.length === 1 ? "1 mensagem" : `${mensagens.length} mensagens`}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
        Entre colegas, sobre este trabalho. O cliente não vê isto. Fica guardado com a ordem —
        e não se apaga.
      </p>

      {mensagens === null ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-400">
          <Spinner /> A carregar a conversa…
        </p>
      ) : mensagens.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-500">
          Ainda ninguém escreveu nada. Isto é para o que hoje se manda por WhatsApp e se perde:
          &ldquo;o quadro está diferente da checklist&rdquo;, &ldquo;a peça só chega
          quinta&rdquo;, &ldquo;o cliente pediu para não mexer no piso 2&rdquo;.
        </p>
      ) : (
        <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
          {mensagens.map((m) => {
            const meu = !!euId && m.autor_id === euId;
            const nome = m.autor_id ? equipa.get(m.autor_id)?.nome ?? "Alguém" : "Alguém";
            return (
              <li key={m.id} className={meu ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    meu
                      ? "max-w-[85%] rounded-2xl rounded-br-sm bg-brand-50 px-3 py-2 ring-1 ring-inset ring-brand-100"
                      : "max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200"
                  }
                >
                  <p className="text-[11px] font-medium text-slate-500">
                    {meu ? "Eu" : nome}
                    <span className="ml-2 font-normal tabular text-slate-400">
                      {dataHora(m.criada_em)}
                    </span>
                  </p>
                  {/* `whitespace-pre-wrap`: quem escreve em linhas quer as linhas. */}
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
                    {m.texto}
                  </p>
                </div>
              </li>
            );
          })}
          <div ref={fim} />
        </ul>
      )}

      {erro && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
      )}

      <div className="mt-3 border-t border-slate-100 pt-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, LIMITE))}
          // Enter envia; Shift+Enter muda de linha. É o que os dedos já sabem
          // de qualquer outra conversa.
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          rows={2}
          placeholder="Escrever para a equipa desta ordem…"
          className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[11px] leading-relaxed text-slate-400">
            Enter envia · Shift+Enter muda de linha. Quem está na ordem recebe aviso no sino.
          </p>
          <Button size="sm" onClick={() => void enviar()} disabled={!texto.trim() || aEnviar}>
            {aEnviar ? <Spinner /> : null}
            Enviar
          </Button>
        </div>
      </div>
    </Card>
  );
}
