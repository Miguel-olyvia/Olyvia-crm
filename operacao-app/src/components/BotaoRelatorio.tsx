import { useState } from "react";
import {
  ErroDeEscrita,
  destinoDoRelatorio,
  enviarRelatorio,
  type DestinoDoRelatorio,
} from "../lib/dados";
import { Button, Modal, Spinner } from "./ui";
import { AlertTriangle, Mail } from "./icons";
import { dataHora } from "../lib/formatar";

/**
 * Mandar o relatório ao cliente agora.
 *
 * O automático manda quando a ordem é confirmada — e só se a empresa o tiver
 * ligado. Isto é para o resto: o cliente ligou a pedir, a ficha dele não tinha
 * email na altura, ou a empresa não quer isto automático mas quer poder
 * mandar.
 *
 * Duas decisões:
 *
 *  · **Pergunta antes.** Mostra o endereço a que vai, e se já foi algum. Um
 *    email não se chama de volta, e a diferença entre "vai para geral@" e "vai
 *    para o Sr. Costa" decide-se antes e não depois.
 *
 *  · **Não há campo para escrever um email.** Vai para o endereço da ficha do
 *    cliente e mais nenhum — ver `db/relatorio-manual.sql`.
 */

export default function BotaoRelatorio({
  ordemId,
  podeMandar,
}: {
  ordemId: string;
  /** Só quem gere. O técnico faz o trabalho; quem responde pelo que sai da empresa é outro. */
  podeMandar: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [destino, setDestino] = useState<DestinoDoRelatorio | null>(null);
  const [aEnviar, setAEnviar] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (!podeMandar) return null;

  const abrir = async () => {
    setAberto(true);
    setDestino(null);
    setEnviado(null);
    setErro(null);
    try {
      setDestino(await destinoDoRelatorio(ordemId));
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível saber para quem ia.");
    }
  };

  const mandar = async () => {
    setAEnviar(true);
    setErro(null);
    try {
      const r = await enviarRelatorio(ordemId);
      setEnviado(r.para);
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível enviar o relatório.");
    } finally {
      setAEnviar(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => void abrir()}>
        <Mail width={14} height={14} />
        Enviar ao cliente
      </Button>

      {aberto && (
        <Modal
          title="Enviar o relatório ao cliente"
          onClose={() => setAberto(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAberto(false)}>
                {enviado ? "Fechar" : "Agora não"}
              </Button>
              {!enviado && (
                <Button
                  onClick={() => void mandar()}
                  disabled={aEnviar || !destino?.email}
                >
                  {aEnviar ? <Spinner /> : null}
                  Enviar agora
                </Button>
              )}
            </>
          }
        >
          {enviado ? (
            <p className="rounded-lg bg-green-50 px-3 py-2.5 text-sm leading-relaxed text-green-800">
              O relatório vai a caminho de <strong>{enviado}</strong>. Sai na próxima passagem da
              fila de emails — dentro de minutos, não de dias.
            </p>
          ) : destino === null && !erro ? (
            <p className="flex items-center gap-2 py-4 text-sm text-slate-400">
              <Spinner /> A ver para quem ia…
            </p>
          ) : (
            <div className="space-y-3">
              {destino?.email ? (
                <p className="text-sm leading-relaxed text-slate-700">
                  Vai para <strong className="break-all">{destino.email}</strong>, o endereço da
                  ficha deste cliente. Leva o que se fez, quando, por quem, as medições e as
                  fotos.
                </p>
              ) : (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
                  <AlertTriangle width={14} height={14} className="mt-0.5 shrink-0" />
                  <span>
                    A ficha deste cliente não tem email. Põe-lhe um no CRM e volta aqui — não há
                    onde escrever o endereço à mão, de propósito.
                  </span>
                </p>
              )}

              {destino?.ja_enviado && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-600">
                  Já foi mandado um a {dataHora(destino.ja_enviado)}. Mandar outra vez manda o
                  relatório de novo — o cliente recebe dois.
                </p>
              )}

              <p className="text-xs leading-relaxed text-slate-500">
                Fica registado no histórico da ordem: quem mandou, para onde e quando.
              </p>
            </div>
          )}

          {erro && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm leading-relaxed text-red-700">
              {erro}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
