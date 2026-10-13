import { useState } from "react";
import { Badge, Button, Card, Modal, Skeleton, Textarea, cx } from "../ui";
import { AlertTriangle, CheckCircle, Layers } from "../icons";
import {
  ROTULO_ESTADO_ENCOMENDA,
  ROTULO_TIPO,
  acoesEncomenda,
  agruparPorTipo,
  formatarData,
  formatarQtd,
  gerarEncomenda,
  linhaDeCompra,
  porqueFornecedor,
  reabrirEncomenda,
  resumoEncomenda,
  validarEncomenda,
  type EstadoEncomenda,
  type LinhaEncomenda,
} from "../../lib/encomendas";
import { usarEncomenda } from "./usarEncomenda";

/**
 * Cartão 1 do Arranque — a Encomenda Cliente: tudo o que a obra precisa
 * (produtos, consumíveis, equipamentos, horas), mesmo o que já há em stock.
 *
 *   Gerar   → lê TODOS os orçamentos aceites do contrato (rascunho);
 *             numa encomenda validada só acrescenta o que é novo.
 *   Validar → calcula stock / em encomenda / em falta e gera as notas de
 *             encomenda a fornecedor (cartão 2).
 *   Reabrir → volta a rascunho (as notas por aprovar caem).
 */

const CORES_ESTADO: Record<EstadoEncomenda, string> = {
  rascunho: "bg-amber-50 text-amber-800 ring-amber-200",
  validada: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  anulada: "bg-slate-100 text-slate-500 ring-slate-200",
};

const un = (u: string | null) => (u && u !== "un" ? ` ${u}` : "");

export function EncomendaClienteCartao({
  contratoId,
  obraId,
  aoMudar,
}: {
  contratoId: string;
  obraId?: string | null;
  aoMudar?: () => void;
}) {
  const { dados, aCarregar, erro, porInstalar, aOcupar, agir } = usarEncomenda(contratoId, aoMudar);
  const [aReabrir, setAReabrir] = useState(false);
  const [motivo, setMotivo] = useState("");

  if (porInstalar) {
    return (
      <div data-testid="encomenda-cliente"><Card className="p-4">
        <Cabecalho />
        <p className="mt-2 text-sm text-slate-500">
          Por instalar: falta colar o SQL das encomendas pós-contrato no CRM.
        </p>
      </Card></div>
    );
  }

  if (aCarregar && !dados) {
    return (
      <div data-testid="encomenda-cliente"><Card className="space-y-2 p-4">
        <Cabecalho />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </Card></div>
    );
  }

  const enc = dados?.encomenda ?? null;
  const acoes = dados ? acoesEncomenda(dados) : null;
  const resumo = resumoEncomenda(dados?.linhas ?? []);
  const grupos = agruparPorTipo(dados?.linhas ?? []);

  return (
    <div data-testid="encomenda-cliente" data-obra={obraId ?? undefined}><Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Cabecalho />
          <p className="mt-0.5 text-xs text-slate-500">
            {enc ? (
              <>
                {enc.estado === "validada" && enc.validada_em
                  ? `Validada por ${enc.validada_por_nome ?? "—"} em ${formatarData(enc.validada_em)} · versão ${enc.versao}`
                  : enc.reaberta_motivo
                    ? `Reaberta: ${enc.reaberta_motivo}`
                    : "O que a obra precisa, mesmo o que já há em stock. Confira e valide."}
              </>
            ) : dados?.contrato.assinado ? (
              "Ainda não foi gerada a partir do contrato."
            ) : (
              "O contrato ainda não está assinado."
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {enc && <Badge className={CORES_ESTADO[enc.estado]}>{ROTULO_ESTADO_ENCOMENDA[enc.estado]}</Badge>}
        </div>
      </div>

      {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {enc && dados && dados.linhas.length > 0 && (
        <p className="mt-3 text-xs text-slate-600">
          {resumo.linhas} linhas
          {enc.estado === "validada" && (
            <>
              {" · "}
              {resumo.emFalta === 0 ? (
                <span className="text-emerald-700">nada em falta</span>
              ) : (
                <span className="text-red-700">{resumo.emFalta} com falta</span>
              )}
            </>
          )}
          {resumo.semFornecedor > 0 && (
            <span className="text-amber-700"> · {resumo.semFornecedor} sem fornecedor</span>
          )}
        </p>
      )}

      {grupos.length > 0 && (
        <div className="mt-3 space-y-4">
          {grupos.map((g) => (
            <div key={g.tipo}>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {ROTULO_TIPO[g.tipo]} <span className="font-normal normal-case">({g.linhas.length})</span>
              </h4>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Descrição</th>
                      <th className="px-2 py-1.5 text-right font-medium">Necessário</th>
                      <th className="px-2 py-1.5 text-right font-medium">Stock</th>
                      <th className="px-2 py-1.5 text-right font-medium">Em encomenda</th>
                      <th className="px-2 py-1.5 text-right font-medium">Em falta</th>
                      <th className="px-2 py-1.5 font-medium">Fornecedor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {g.linhas.map((l) => (
                      <LinhaTabela key={l.id} l={l} validada={enc?.estado === "validada"} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {enc && dados && dados.linhas.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">
          Sem linhas: o contrato não tem produtos, fichas de materiais nem tarefas com horas.
        </p>
      )}

      {acoes && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {acoes.gerar && (
            <Button
              variant="secondary"
              size="sm"
              disabled={!!aOcupar}
              onClick={() => agir("gerar", () => gerarEncomenda(contratoId))}
              title={
                enc?.estado === "validada"
                  ? "Acrescenta só o que for novo no contrato (o validado não muda) e volta a pedir validação"
                  : "Lê todos os orçamentos aceites do contrato"
              }
            >
              <Layers width={14} height={14} />
              {aOcupar === "gerar" ? "A gerar…" : enc ? "Gerar outra vez" : "Gerar"}
            </Button>
          )}
          {acoes.reabrir && (
            <Button variant="secondary" size="sm" disabled={!!aOcupar} onClick={() => setAReabrir(true)}>
              Reabrir
            </Button>
          )}
          {acoes.validar && enc && (
            <Button
              size="sm"
              disabled={!!aOcupar}
              onClick={() => agir("validar", () => validarEncomenda(enc.id))}
            >
              <CheckCircle width={14} height={14} />
              {aOcupar === "validar" ? "A validar…" : "Validar"}
            </Button>
          )}
        </div>
      )}

      {aReabrir && enc && (
        <Modal
          title="Reabrir a Encomenda Cliente"
          size="sm"
          onClose={() => setAReabrir(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAReabrir(false)}>
                Cancelar
              </Button>
              <Button
                disabled={motivo.trim().length < 3 || !!aOcupar}
                onClick={async () => {
                  const okk = await agir("reabrir", () => reabrirEncomenda(enc.id, motivo.trim()));
                  if (okk) {
                    setAReabrir(false);
                    setMotivo("");
                  }
                }}
              >
                Reabrir
              </Button>
            </>
          }
        >
          <p className="mb-2 text-sm text-slate-600">
            Volta a rascunho. As notas de encomenda ainda por aprovar ficam rejeitadas; as aprovadas mantêm-se.
          </p>
          <Textarea
            aria-label="Motivo"
            placeholder="Porque reabre (ex.: o cliente acrescentou um espelho)"
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
  return <h3 className="text-sm font-semibold text-slate-800">1 · Encomenda Cliente</h3>;
}

function LinhaTabela({ l, validada }: { l: LinhaEncomenda; validada: boolean }) {
  const compra = linhaDeCompra(l);
  const porque = porqueFornecedor(l);
  const u = un(l.unidade);
  const n = (x: number) => (compra && validada ? `${formatarQtd(x)}${u}` : "—");
  return (
    <tr className={cx(compra && validada && l.qtd_em_falta > 0 && "bg-red-50/40")}>
      <td className="px-2 py-1.5">
        <span className="font-medium text-slate-800">{l.descricao}</span>
        {(l.servico_nome || l.origem === "manual" || l.origem === "conjunto") && (
          <span className="block text-[11px] text-slate-400">
            {l.origem === "manual" ? "acrescentada à mão" : l.origem === "conjunto" ? "do conjunto" : `de ${l.servico_nome}`}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {formatarQtd(l.qtd_necessaria)}
        {u}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{n(l.qtd_stock)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{n(l.qtd_em_encomenda)}</td>
      <td className={cx("px-2 py-1.5 text-right tabular-nums", compra && validada && l.qtd_em_falta > 0 && "font-semibold text-red-700")}>
        {n(l.qtd_em_falta)}
      </td>
      <td className="px-2 py-1.5">
        {compra ? (
          <>
            <span className={cx("block", l.supplier_id ? "text-slate-700" : "text-amber-700")}>
              {l.supplier_id ? l.fornecedor_nome ?? "—" : (
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle width={12} height={12} /> sem fornecedor
                </span>
              )}
            </span>
            {porque && <span className="block text-[11px] text-slate-400">{porque}</span>}
          </>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
    </tr>
  );
}
