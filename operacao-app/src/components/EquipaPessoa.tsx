/**
 * Uma pessoa da equipa, com cada dado ao lado da sua origem.
 *
 * O que vem do CRM e do RH é só de leitura aqui — muda-se lá, não em
 * Operações. O que é de Operações (função, ativo, especialidades, zona-base,
 * custo/hora) é o que o botão "Editar" muda.
 */
import type { ReactNode } from "react";
import { Badge, cx } from "./ui";
import { euros } from "../lib/formatar";
import {
  ROTULO_CATEGORIA_FUNCAO,
  ROTULO_ESTADO_CONTRATO,
  ROTULO_REGIME,
  ROTULO_TIPO_CONTRATO,
  type PessoaEquipa,
} from "../lib/equipaCrm";
import { ROTULO_FUNCAO, type Funcao } from "../domain/tipos";

export function EquipaOrigem({ de }: { de: "crm" | "rh" | "ops" }) {
  const t = { crm: "do CRM", rh: "do RH", ops: "de Operações" }[de];
  const cor = {
    crm: "bg-sky-50 text-sky-700 ring-sky-200",
    rh: "bg-violet-50 text-violet-700 ring-violet-200",
    ops: "bg-brand-50 text-brand-800 ring-brand-200",
  }[de];
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset",
        cor
      )}
    >
      {t}
    </span>
  );
}

/** "12/10" — o ano só quando não é este. */
function data(iso: string | null): string {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a === String(new Date().getFullYear()) ? `${d}/${m}` : `${d}/${m}/${a}`;
}

function hojeIso(): string {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
}

export function textoAusencia(p: PessoaEquipa): string | null {
  if (!p.ausencia_inicio) return null;
  const tipo = p.ausencia_tipo ?? "Ausência";
  if (p.ausencia_inicio <= hojeIso()) return `${tipo} — ausente até ${data(p.ausencia_fim)}`;
  return p.ausencia_inicio === p.ausencia_fim
    ? `${tipo} a ${data(p.ausencia_inicio)}`
    : `${tipo} de ${data(p.ausencia_inicio)} a ${data(p.ausencia_fim)}`;
}

/** Os pares "rótulo: valor" que vêm do CRM, sem os vazios. */
export function camposCrm(p: PessoaEquipa): [string, string][] {
  const xs: [string, string | null][] = [
    ["Papel", p.papel_crm],
    ["Equipa", p.equipa_crm],
    ["Cargo", p.cargo_crm],
    ["Distritos na agenda", p.distritos?.length ? p.distritos.join(", ") : null],
    ["Códigos postais", p.codigos_postais?.length ? p.codigos_postais.join(", ") : null],
    ["Telefone", p.telefone],
  ];
  return xs.filter((x): x is [string, string] => !!x[1]);
}

/** Os pares que vêm do RH. Os contratuais só chegam a quem gere a equipa. */
export function camposRh(p: PessoaEquipa): [string, string][] {
  const r = (m: Record<string, string>, v: string | null) => (v ? (m[v] ?? v) : null);
  const xs: [string, string | null][] = [
    ["N.º interno", p.numero_interno],
    ["Cargo", p.cargo],
    ["Local de trabalho", p.local_trabalho],
    ["Contrato", r(ROTULO_TIPO_CONTRATO, p.tipo_contrato)],
    ["Regime", r(ROTULO_REGIME, p.regime)],
    ["Categoria", r(ROTULO_CATEGORIA_FUNCAO, p.categoria_funcao)],
    ["Estado", r(ROTULO_ESTADO_CONTRATO, p.estado_contrato)],
    ["Admissão", p.data_admissao ? data(p.data_admissao) : null],
  ];
  return xs.filter((x): x is [string, string] => !!x[1]);
}

function Linha({ de, children }: { de: "crm" | "rh" | "ops"; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-600">
      <EquipaOrigem de={de} />
      {children}
    </div>
  );
}

function Pares({ xs }: { xs: [string, string][] }) {
  return (
    <>
      {xs.map(([k, v]) => (
        <span key={k}>
          <span className="text-slate-400">{k}:</span> {v}
        </span>
      ))}
    </>
  );
}

export function EquipaPessoaCartao({
  pessoa: p,
  eu,
  rhDisponivel,
  acao,
}: {
  pessoa: PessoaEquipa;
  eu: boolean;
  rhDisponivel: boolean;
  acao?: ReactNode;
}) {
  const crm = camposCrm(p);
  const rh = camposRh(p);
  const ausencia = textoAusencia(p);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 p-4" data-testid={`pessoa-${p.utilizador_id}`}>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2.5">
          {p.avatar_url ? (
            <img src={p.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
              {p.nome.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800">
              {p.nome}
              {eu && <span className="ml-2 text-xs font-normal text-slate-400">(tu)</span>}
            </p>
            <p className="truncate text-xs text-slate-500">{p.email}</p>
          </div>
        </div>

        {crm.length > 0 && (
          <Linha de="crm">
            <Pares xs={crm} />
          </Linha>
        )}

        {rhDisponivel &&
          (p.rh_ligado ? (
            rh.length > 0 && (
              <Linha de="rh">
                <Pares xs={rh} />
              </Linha>
            )
          ) : (
            <Linha de="rh">
              <span className="text-slate-400">Sem ficha de RH ligada a esta conta.</span>
            </Linha>
          ))}

        {ausencia && (
          <Linha de={p.ausencia_origem ?? "crm"}>
            <span className="font-medium text-amber-700">{ausencia}</span>
          </Linha>
        )}

        {p.em_operacoes && (p.skills_nomes.length > 0 || p.zona_base) && (
          <Linha de="ops">
            {p.skills_nomes.length > 0 && (
              <span>
                <span className="text-slate-400">Especialidades:</span> {p.skills_nomes.join(", ")}
              </span>
            )}
            {p.zona_base && (
              <span>
                <span className="text-slate-400">Zona (override):</span> {p.zona_base}
              </span>
            )}
          </Linha>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {p.em_operacoes && (
          <>
            <Badge
              className={
                p.ativo ? "bg-brand-50 text-brand-800 ring-brand-200" : "bg-slate-100 text-slate-500 ring-slate-200"
              }
            >
              {ROTULO_FUNCAO[p.funcao as Funcao] ?? p.funcao}
              {!p.ativo && " · inativo"}
            </Badge>
            {p.pode_ver_custos && (
              <span className="font-mono text-xs tabular text-slate-500">
                {p.custo_hora != null ? `${euros(p.custo_hora)}/h` : "sem custo/h"}
              </span>
            )}
          </>
        )}
        {acao}
      </div>
    </div>
  );
}
