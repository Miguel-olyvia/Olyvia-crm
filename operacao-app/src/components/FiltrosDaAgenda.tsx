import { Select, cx } from "./ui";
import { X } from "./icons";
import { FILTRO_VAZIO, quantosFiltros, type FiltroDaAgenda } from "../domain/agenda";
import type { Cliente, MembroEquipa } from "../lib/dados";
import type { Especialidade, Fornecedor, TipoTrabalho } from "../lib/config";

/**
 * As cinco perguntas que se fazem a olhar para uma agenda cheia.
 *
 * Numa linha só, e sempre visíveis — um filtro escondido atrás de um botão é
 * um filtro que ninguém usa. Uma lista sem opções nenhumas não aparece, para
 * não ocupar espaço a oferecer nada.
 */
export default function FiltrosDaAgenda({
  filtro,
  aoMudar,
  clientes,
  tipos,
  equipa,
  especialidades,
  fornecedores,
}: {
  filtro: FiltroDaAgenda;
  aoMudar: (f: FiltroDaAgenda) => void;
  clientes: readonly Cliente[];
  tipos: readonly TipoTrabalho[];
  equipa: readonly MembroEquipa[];
  especialidades: readonly Especialidade[];
  fornecedores: readonly Fornecedor[];
}) {
  const n = quantosFiltros(filtro);
  const mudar = (campo: keyof FiltroDaAgenda) => (v: string) =>
    aoMudar({ ...filtro, [campo]: v || null });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Lista
        rotulo="Cliente"
        valor={filtro.clienteId}
        aoMudar={mudar("clienteId")}
        opcoes={clientes.map((c) => ({ v: c.id, t: c.nome }))}
      />
      <Lista
        rotulo="Tipo de trabalho"
        valor={filtro.tipoTrabalhoId}
        aoMudar={mudar("tipoTrabalhoId")}
        opcoes={tipos.filter((t) => t.ativo).map((t) => ({ v: t.id, t: t.nome }))}
      />
      <Lista
        rotulo="Quem"
        valor={filtro.responsavelId}
        aoMudar={mudar("responsavelId")}
        opcoes={equipa.map((p) => ({ v: p.utilizador_id, t: p.nome }))}
      />
      <Lista
        rotulo="Especialidade"
        valor={filtro.especialidadeId}
        aoMudar={mudar("especialidadeId")}
        opcoes={especialidades.map((e) => ({ v: e.id, t: e.nome }))}
      />
      <Lista
        rotulo="Fornecedor"
        valor={filtro.fornecedorId}
        aoMudar={mudar("fornecedorId")}
        opcoes={fornecedores.map((f) => ({ v: f.id, t: f.nome }))}
      />

      {/* Só aparece quando há o que limpar. Um botão permanentemente inútil
          ensina a ignorar aquele canto do ecrã. */}
      {n > 0 && (
        <button
          type="button"
          onClick={() => aoMudar(FILTRO_VAZIO)}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200"
        >
          <X width={12} height={12} />
          Limpar {n === 1 ? "o filtro" : `os ${n} filtros`}
        </button>
      )}
    </div>
  );
}

function Lista({
  rotulo,
  valor,
  aoMudar,
  opcoes,
}: {
  rotulo: string;
  valor: string | null | undefined;
  aoMudar: (v: string) => void;
  opcoes: readonly { v: string; t: string }[];
}) {
  // Uma lista vazia não é um filtro — é uma caixa a ocupar espaço.
  if (opcoes.length === 0) return null;

  return (
    <Select
      value={valor ?? ""}
      onChange={(e) => aoMudar(e.target.value)}
      aria-label={rotulo}
      className={cx(
        "w-auto min-w-0 max-w-[13rem] text-xs sm:text-sm",
        valor && "ring-1 ring-brand/40"
      )}
    >
      {/* Só o rótulo. "Cliente: todos" ficava cortado a meio da palavra, que é
          pior do que não dizer nada — e escolhido, o campo mostra o valor. */}
      <option value="">{rotulo}</option>
      {opcoes.map((o) => (
        <option key={o.v} value={o.v}>
          {o.t}
        </option>
      ))}
    </Select>
  );
}
