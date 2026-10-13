import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Skeleton, cx } from "../ui";
import { AlertTriangle, CheckCircle, Clock } from "../icons";
import { aprovarPlano, obterArranque, sincronizarMaterial, type Arranque } from "../../lib/arranque";
import { ErroDeDados, ErroDeEscrita } from "../../lib/dados";
import {
  mensagemFalta,
  podeAprovarPlano,
  rotuloEncomendaCliente,
  rotuloFornecedor,
  rotuloPlano,
  validacoesFeitas,
  type RotuloEstado,
} from "../../domain/arranque";
import { data as formatarData } from "../../lib/formatar";

/**
 * Separador "Arranque" da obra: as 3 validações do Planeador (fluxo-encomendas.md
 * 1.1) — Encomenda Cliente, encomenda a fornecedor, plano — e se a obra já pode
 * arrancar. Lê `rpc_ops_obra_arranque` (db/obra-arranque.sql).
 *
 * Os cartões 1 e 2 são da Frente A (EncomendaClienteCartao / NotaEncomendaCartao).
 * Até à junção, um cartão provisório mostra só o estado que vem da base.
 */
export default function ArranqueObra({
  obraId,
  contratoId,
  podePlanear,
  recarga = 0,
  aoMudar,
}: {
  obraId: string;
  contratoId: string | null;
  /** Gestor/admin: aprova o plano e atualiza as datas do material. */
  podePlanear: boolean;
  recarga?: number;
  aoMudar?: () => void;
}) {
  const [a, setA] = useState<Arranque | null>(null);
  const [instalado, setInstalado] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [aGravar, setAGravar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [n, setN] = useState(0);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await obterArranque(obraId);
      setInstalado(r != null);
      setA(r);
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Não foi possível carregar o checklist de arranque.");
    } finally {
      setACarregar(false);
    }
  }, [obraId]);

  useEffect(() => {
    void carregar();
  }, [carregar, recarga, n]);

  const mudou = () => {
    setN((x) => x + 1);
    aoMudar?.();
  };

  const aprovar = async () => {
    setAGravar(true);
    setAviso(null);
    try {
      const r = await aprovarPlano(obraId);
      setAviso(r.avisos?.length ? `Plano aprovado. Atenção: ${r.avisos.join("; ")}.` : "Plano aprovado.");
      mudou();
    } catch (e) {
      setAviso(e instanceof ErroDeEscrita ? e.message : "Não foi possível aprovar o plano.");
    } finally {
      setAGravar(false);
    }
  };

  const material = async () => {
    setAGravar(true);
    setAviso(null);
    try {
      const r = await sincronizarMaterial(obraId);
      setAviso(
        r.tarefas
          ? `Datas do material atualizadas em ${r.tarefas} tarefa${r.tarefas === 1 ? "" : "s"}.`
          : "As datas do material já estavam em dia."
      );
      mudou();
    } catch (e) {
      setAviso(e instanceof ErroDeEscrita ? e.message : "Não foi possível atualizar as datas do material.");
    } finally {
      setAGravar(false);
    }
  };

  if (aCarregar) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (erro) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>;
  if (!instalado || !a) {
    return (
      <div data-testid="arranque-por-instalar">
        <Card className="p-4 text-sm text-slate-600">
          O checklist de arranque ainda não está instalado nesta base (falta correr <code>db/obra-arranque.sql</code>).
          A obra arranca como sempre.
        </Card>
      </div>
    );
  }

  const feitas = validacoesFeitas(a);
  const falta = mensagemFalta(a);
  const ec = a.encomenda_cliente;
  const fo = a.fornecedor;

  return (
    <div className="space-y-3" data-testid="arranque">
      <div
        className={cx(
          "flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm",
          a.arrancou
            ? "border border-slate-200 bg-slate-50 text-slate-700"
            : a.pode_arrancar
              ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border border-amber-200 bg-amber-50 text-amber-900"
        )}
      >
        <p className="flex items-center gap-1.5 font-medium">
          {a.arrancou ? (
            <>A obra já arrancou.</>
          ) : a.pode_arrancar ? (
            <>
              <CheckCircle width={14} height={14} /> Pronta a arrancar.
            </>
          ) : (
            <>
              <AlertTriangle width={14} height={14} /> {falta}
            </>
          )}
        </p>
        <span className="text-xs">{feitas} de 3 validações</span>
      </div>

      {aviso && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          <span>{aviso}</span>
          <button type="button" className="text-xs underline" onClick={() => setAviso(null)}>
            fechar
          </button>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        {/* JUNÇÃO: trocar por <EncomendaClienteCartao contratoId={contratoId} obraId={obraId} aoMudar={mudou} />
            (Frente A, ./EncomendaClienteCartao.tsx). */}
        <ArranqueCartaoProvisorio
          numero={1}
          titulo="Encomenda Cliente"
          estado={rotuloEncomendaCliente(ec.estado)}
          detalhe={
            ec.estado === "validada"
              ? `Validada${ec.validada_por_nome ? ` por ${ec.validada_por_nome}` : ""}${ec.validada_em ? ` a ${formatarData(ec.validada_em)}` : ""}.`
              : ec.estado === "por_instalar"
                ? "A Encomenda Cliente ainda não está instalada: não impede o arranque."
                : ec.estado === "nao_aplicavel"
                  ? "Obra sem contrato: não há Encomenda Cliente."
                  : ec.estado === "por_gerar"
                    ? "Ainda não foi gerada a partir do contrato."
                    : "Em rascunho: falta validar o que tem de estar pronto no armazém."
          }
          contratoId={contratoId}
        />
        {/* JUNÇÃO: trocar por <NotaEncomendaCartao contratoId={contratoId} obraId={obraId} aoMudar={mudou} />
            (Frente A, ./NotaEncomendaCartao.tsx). */}
        <ArranqueCartaoProvisorio
          numero={2}
          titulo="Encomenda a fornecedor"
          estado={rotuloFornecedor(fo.estado)}
          detalhe={
            fo.notas && fo.notas.total > 0
              ? `${fo.notas.aprovadas} aprovada(s), ${fo.notas.propostas} por aprovar` +
                (fo.notas.sem_fornecedor ? ` (${fo.notas.sem_fornecedor} sem fornecedor)` : "") +
                (fo.notas.prazo_previsto ? ` · chega até ${formatarData(fo.notas.prazo_previsto)}` : "") +
                "."
              : fo.estado === "nao_necessaria"
                ? "Há tudo em stock: não é preciso encomendar."
                : fo.estado === "por_instalar"
                  ? "As notas de encomenda ainda não estão instaladas: não impedem o arranque."
                  : fo.estado === "por_validar"
                    ? "Gera-se ao validar a Encomenda Cliente."
                    : null
          }
          contratoId={contratoId}
        />
        <ArranqueCartaoPlano
          arranque={a}
          podePlanear={podePlanear}
          aGravar={aGravar}
          aoAprovar={() => void aprovar()}
          aoAtualizarMaterial={() => void material()}
        />
      </div>
    </div>
  );
}

const TOM: Record<RotuloEstado["tom"], string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pendente: "bg-amber-50 text-amber-800 ring-amber-200",
  neutro: "bg-slate-50 text-slate-600 ring-slate-200",
};

export function EstadoValidacao({ estado }: { estado: RotuloEstado }) {
  return <Badge className={TOM[estado.tom]}>{estado.texto}</Badge>;
}

/** Só o estado (vindo de rpc_ops_obra_arranque). Sai na junção com a Frente A. */
export function ArranqueCartaoProvisorio({
  numero,
  titulo,
  estado,
  detalhe,
}: {
  numero: number;
  titulo: string;
  estado: RotuloEstado;
  detalhe: string | null;
  contratoId: string | null;
}) {
  return (
    <section aria-label={titulo}>
      <Card className="h-full p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">
            {numero}. {titulo}
          </h3>
          <EstadoValidacao estado={estado} />
        </div>
        {detalhe && <p className="mt-2 text-xs text-slate-600">{detalhe}</p>}
      </Card>
    </section>
  );
}

export function ArranqueCartaoPlano({
  arranque,
  podePlanear,
  aGravar,
  aoAprovar,
  aoAtualizarMaterial,
}: {
  arranque: Arranque;
  podePlanear: boolean;
  aGravar: boolean;
  aoAprovar: () => void;
  aoAtualizarMaterial: () => void;
}) {
  const p = arranque.plano;
  const pode = podePlanear && podeAprovarPlano(arranque);
  return (
    <section aria-label="Plano da obra">
      <Card className="h-full p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">3. Plano da obra</h3>
          <EstadoValidacao estado={rotuloPlano(p.estado)} />
        </div>
        <p className="mt-2 text-xs text-slate-600">
          {p.tarefas} tarefa{p.tarefas === 1 ? "" : "s"}
          {p.estado === "aprovado" && (
            <>
              {" · "}aprovado
              {p.aprovado_por_nome ? ` por ${p.aprovado_por_nome}` : ""}
              {p.aprovado_em ? ` a ${formatarData(p.aprovado_em)}` : ""}
            </>
          )}
        </p>
        {p.motivo && <p className="mt-1 text-xs font-medium text-amber-800">Volta a aprovar: {p.motivo}.</p>}
        {p.avisos.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-amber-800">
            {p.avisos.map((x) => (
              <li key={x} className="flex items-start gap-1">
                <AlertTriangle width={11} height={11} className="mt-0.5 shrink-0" /> {x}
              </li>
            ))}
          </ul>
        )}
        {p.material_antes.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-slate-600" aria-label="Tarefas antes do material">
            {p.material_antes.slice(0, 5).map((m) => (
              <li key={m.tarefa_id} className="flex items-start gap-1">
                <Clock width={11} height={11} className="mt-0.5 shrink-0 text-slate-400" />
                <span>
                  {m.nome}: começa a {formatarData(m.inicio)}, o material chega a {formatarData(m.material_chega_em)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {podePlanear && !arranque.arrancou && (
          <div className="mt-3 flex flex-wrap gap-2">
            {p.estado !== "aprovado" && (
              <Button size="sm" onClick={aoAprovar} disabled={!pode || aGravar}>
                {aGravar ? "A gravar…" : "Aprovar plano"}
              </Button>
            )}
            {arranque.frente_a_instalada && (
              <Button size="sm" variant="secondary" onClick={aoAtualizarMaterial} disabled={aGravar}>
                Atualizar datas do material
              </Button>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
