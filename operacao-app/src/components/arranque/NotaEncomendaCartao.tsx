import { useState } from "react";
import { Badge, Button, Card, Modal, Select, Skeleton, Textarea, cx } from "../ui";
import { AlertTriangle, Check, X } from "../icons";
import { euros } from "../../lib/formatar";
import {
  ROTULO_ESTADO_FORNECEDOR,
  ROTULO_ESTADO_NOTA,
  aprovarNota,
  bloqueioAprovar,
  formatarData,
  formatarQtd,
  mudarFornecedor,
  rejeitarNota,
  type EstadoFornecedor,
  type EstadoNota,
  type NotaEncomenda,
} from "../../lib/encomendas";
import { usarEncomenda } from "./usarEncomenda";

/**
 * Cartão 2 do Arranque — a Encomenda a Fornecedor: uma nota por fornecedor
 * com o que falta (necessário − stock − já encomendado), preço e prazo.
 *
 *   Aprovar          → cria a encomenda ao fornecedor (pendente) no CRM;
 *   Rejeitar         → com motivo;
 *   Mudar fornecedor → por linha (é a única forma de aprovar o que veio
 *                      "sem fornecedor").
 * Se nada falta, o passo fica "Não necessária".
 */

const CORES_FORNECEDOR: Record<EstadoFornecedor, string> = {
  por_gerar: "bg-slate-100 text-slate-600 ring-slate-200",
  nao_necessaria: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  por_aprovar: "bg-amber-50 text-amber-800 ring-amber-200",
  parcial: "bg-sky-50 text-sky-800 ring-sky-200",
  aprovada: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

const CORES_NOTA: Record<EstadoNota, string> = {
  proposta: "bg-amber-50 text-amber-800 ring-amber-200",
  aprovada: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  rejeitada: "bg-slate-100 text-slate-500 ring-slate-200",
};

export function NotaEncomendaCartao({
  contratoId,
  obraId,
  aoMudar,
}: {
  contratoId: string;
  obraId?: string | null;
  aoMudar?: () => void;
}) {
  const { dados, aCarregar, erro, porInstalar, aOcupar, agir } = usarEncomenda(contratoId, aoMudar);
  const [aRejeitar, setARejeitar] = useState<NotaEncomenda | null>(null);
  const [motivo, setMotivo] = useState("");
  const [verRejeitadas, setVerRejeitadas] = useState(false);

  if (porInstalar) {
    return (
      <div data-testid="nota-encomenda"><Card className="p-4">
        <Cabecalho />
        <p className="mt-2 text-sm text-slate-500">Por instalar: falta colar o SQL das encomendas pós-contrato no CRM.</p>
      </Card></div>
    );
  }
  if (aCarregar && !dados) {
    return (
      <div data-testid="nota-encomenda"><Card className="space-y-2 p-4">
        <Cabecalho />
        <Skeleton className="h-16 w-full" />
      </Card></div>
    );
  }

  const enc = dados?.encomenda ?? null;
  const estado: EstadoFornecedor = enc?.fornecedor_estado ?? "por_gerar";
  const notas = dados?.notas ?? [];
  const visiveis = notas.filter((n) => verRejeitadas || n.estado !== "rejeitada");
  const rejeitadas = notas.length - notas.filter((n) => n.estado !== "rejeitada").length;

  return (
    <div data-testid="nota-encomenda" data-obra={obraId ?? undefined}><Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Cabecalho />
          <p className="mt-0.5 text-xs text-slate-500">
            {estado === "por_gerar"
              ? "As notas nascem quando a Encomenda Cliente for validada."
              : estado === "nao_necessaria"
                ? "Não falta nada: o stock e o que já está encomendado chegam."
                : "Só o que falta, agrupado por fornecedor. Ao aprovar, a encomenda segue para o fornecedor."}
          </p>
        </div>
        <Badge className={CORES_FORNECEDOR[estado]}>{ROTULO_ESTADO_FORNECEDOR[estado]}</Badge>
      </div>

      {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {visiveis.length > 0 && (
        <ul className="mt-3 space-y-3">
          {visiveis.map((n) => (
            <NotaItem
              key={n.id}
              n={n}
              fornecedores={dados?.fornecedores ?? []}
              podeAprovar={!!dados?.pode.aprovar}
              podeMudar={!!dados?.pode.mudar_fornecedor}
              aOcupar={aOcupar}
              aoAprovar={() => agir(`aprovar:${n.id}`, () => aprovarNota(n.id))}
              aoRejeitar={() => {
                setMotivo("");
                setARejeitar(n);
              }}
              aoMudarFornecedor={(linhaId, fornecedorId) =>
                agir(`mudar:${linhaId}`, () => mudarFornecedor(linhaId, fornecedorId))
              }
            />
          ))}
        </ul>
      )}

      {rejeitadas > 0 && (
        <button
          type="button"
          className="mt-2 text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700"
          onClick={() => setVerRejeitadas((v) => !v)}
        >
          {verRejeitadas ? "Esconder" : "Ver"} {rejeitadas === 1 ? "1 nota rejeitada" : `${rejeitadas} notas rejeitadas`}
        </button>
      )}

      {aRejeitar && (
        <Modal
          title={`Rejeitar a nota de ${aRejeitar.fornecedor_nome ?? "sem fornecedor"}`}
          size="sm"
          onClose={() => setARejeitar(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setARejeitar(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={motivo.trim().length < 3 || !!aOcupar}
                onClick={async () => {
                  const okk = await agir(`rejeitar:${aRejeitar.id}`, () => rejeitarNota(aRejeitar.id, motivo.trim()));
                  if (okk) setARejeitar(null);
                }}
              >
                Rejeitar
              </Button>
            </>
          }
        >
          <Textarea
            aria-label="Motivo da rejeição"
            placeholder="Porque rejeita (ex.: pedir orçamento a outro fornecedor)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
          />
        </Modal>
      )}
    </Card></div>
  );
}

function Cabecalho() {
  return <h3 className="text-sm font-semibold text-slate-800">2 · Encomenda a Fornecedor</h3>;
}

function NotaItem({
  n,
  fornecedores,
  podeAprovar,
  podeMudar,
  aOcupar,
  aoAprovar,
  aoRejeitar,
  aoMudarFornecedor,
}: {
  n: NotaEncomenda;
  fornecedores: { id: string; nome: string }[];
  podeAprovar: boolean;
  podeMudar: boolean;
  aOcupar: string | null;
  aoAprovar: () => void;
  aoRejeitar: () => void;
  aoMudarFornecedor: (linhaId: string, fornecedorId: string) => void;
}) {
  const bloqueio = bloqueioAprovar(n);
  const proposta = n.estado === "proposta";
  return (
    <li
      className={cx("rounded-lg border p-3", n.supplier_id ? "border-slate-200" : "border-amber-300 bg-amber-50/30")}
      data-testid="nota"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">
            {n.supplier_id ? (
              n.fornecedor_nome
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-800">
                <AlertTriangle width={14} height={14} /> Sem fornecedor
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500">
            {n.linhas.length} {n.linhas.length === 1 ? "linha" : "linhas"} · {euros(n.total)}
            {" · "}chega a {formatarData(n.prazo_previsto)}
            {n.estado === "aprovada" && n.purchase_order_numero && <> · encomenda {n.purchase_order_numero}</>}
            {n.estado === "aprovada" && n.aprovada_por_nome && <> · aprovada por {n.aprovada_por_nome}</>}
          </p>
          {n.estado === "rejeitada" && n.motivo_rejeicao && (
            <p className="text-xs text-slate-500">Motivo: {n.motivo_rejeicao}</p>
          )}
        </div>
        <Badge className={CORES_NOTA[n.estado]}>{ROTULO_ESTADO_NOTA[n.estado]}</Badge>
      </div>

      <table className="mt-2 w-full text-xs">
        <tbody className="divide-y divide-slate-100">
          {n.linhas.map((l) => (
            <tr key={l.id}>
              <td className="py-1 pr-2 text-slate-700">{l.descricao}</td>
              <td className="py-1 pr-2 text-right tabular-nums">
                {formatarQtd(l.qtd)}
                {l.unidade && l.unidade !== "un" ? ` ${l.unidade}` : ""}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums text-slate-500">
                {l.preco_compra == null ? "sem preço" : euros(l.preco_compra)}
              </td>
              {proposta && podeMudar && (
                <td className="py-1 text-right">
                  <Select
                    aria-label={`Mudar o fornecedor de ${l.descricao}`}
                    className="max-w-[11rem] px-2 py-1 text-xs"
                    value=""
                    disabled={!!aOcupar}
                    onChange={(e) => e.target.value && aoMudarFornecedor(l.id, e.target.value)}
                  >
                    <option value="">{n.supplier_id ? "Mudar fornecedor…" : "Escolher fornecedor…"}</option>
                    {fornecedores
                      .filter((f) => f.id !== n.supplier_id)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                        </option>
                      ))}
                  </Select>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {proposta && podeAprovar && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {bloqueio && <span className="text-xs text-amber-700">{bloqueio}</span>}
          <Button variant="ghost" size="sm" disabled={!!aOcupar} onClick={aoRejeitar}>
            <X width={14} height={14} /> Rejeitar
          </Button>
          <Button size="sm" disabled={!!aOcupar || !!bloqueio} onClick={aoAprovar} title={bloqueio ?? undefined}>
            <Check width={14} height={14} />
            {aOcupar === `aprovar:${n.id}` ? "A aprovar…" : "Aprovar"}
          </Button>
        </div>
      )}
    </li>
  );
}
