import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';

const MIN_CHARS = 2;
const MAX_RESULTS = 20;
const DEBOUNCE_MS = 300;

interface PessoaOpcao {
  id: string;
  nome: string;
}

interface PessoaPickerProps {
  /** entity_id da pessoa ligada, ou '' / null quando não há. */
  value: string | null | undefined;
  onChange: (entityId: string | null) => void;
  /** Organização activa: toda a pesquisa é filtrada por ela. */
  organizationId?: string;
  disabled?: boolean;
}

type EntityRow = { id: string; display_name: string | null; first_name: string | null; last_name: string | null };

const nomeDe = (e: EntityRow): string =>
  e.display_name || [e.first_name, e.last_name].filter(Boolean).join(' ').trim() || e.id.slice(0, 8);

/** Tira os caracteres que têm significado nos filtros do PostgREST e no LIKE. */
const limparTermo = (s: string): string => s.replace(/[,()%_*\\]/g, ' ').trim();

/**
 * Selector simples de pessoa (anew_entities) para ligar um agendamento a uma entidade.
 * Pesquisa por nome, email e telefone (mínimo 2 letras), só da organização activa e sem apagadas.
 */
export function PessoaPicker({ value, onChange, organizationId, disabled = false }: PessoaPickerProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const listId = `${baseId}-lista`;
  const hintId = `${baseId}-dica`;
  const [query, setQuery] = useState('');
  const [opcoes, setOpcoes] = useState<PessoaOpcao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [aPesquisar, setAPesquisar] = useState(false);
  const [erroPesquisa, setErroPesquisa] = useState(false);
  const [activo, setActivo] = useState(-1);
  const [nomeActual, setNomeActual] = useState<string | null>(null);
  const [aCarregarNome, setACarregarNome] = useState(false);
  const [erroNome, setErroNome] = useState(false);
  const pedidoRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Nome da pessoa já ligada (ao editar um agendamento existente).
  useEffect(() => {
    if (!value) {
      setNomeActual(null);
      setErroNome(false);
      return;
    }
    let cancelado = false;
    setACarregarNome(true);
    setErroNome(false);
    (async () => {
      let q = supabase
        .from('anew_entities')
        .select('id, display_name, first_name, last_name')
        .eq('id', value);
      if (organizationId) q = q.eq('organization_id', organizationId);
      const { data, error } = await q.maybeSingle();
      if (cancelado) return;
      if (error) {
        console.error('Erro ao carregar a pessoa do agendamento:', error);
        setErroNome(true);
        setNomeActual(null);
      } else {
        setNomeActual(data ? nomeDe(data as EntityRow) : null);
      }
      setACarregarNome(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [value, organizationId]);

  // Fecha a lista ao clicar fora.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Pesquisa com debounce.
  useEffect(() => {
    const termo = limparTermo(query);
    if (termo.length < MIN_CHARS || !organizationId) {
      pedidoRef.current++;
      setOpcoes([]);
      setAPesquisar(false);
      setErroPesquisa(false);
      return;
    }
    const pedido = ++pedidoRef.current;
    setAPesquisar(true);
    setErroPesquisa(false);
    const timer = setTimeout(async () => {
      try {
        const like = `%${termo}%`;
        const [porNome, porEmail, porTelefone] = await Promise.all([
          supabase
            .from('anew_entities')
            .select('id, display_name, first_name, last_name')
            .eq('organization_id', organizationId)
            .is('deleted_at', null)
            .or(`display_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`)
            .limit(MAX_RESULTS),
          supabase.from('anew_entity_emails').select('entity_id').ilike('email', like).limit(MAX_RESULTS),
          supabase.from('anew_entity_phones').select('entity_id').ilike('phone_number', like).limit(MAX_RESULTS),
        ]);
        const erro = porNome.error || porEmail.error || porTelefone.error;
        if (erro) throw erro;

        const porContacto = Array.from(new Set([
          ...(porEmail.data || []).map(r => r.entity_id),
          ...(porTelefone.data || []).map(r => r.entity_id),
        ].filter((id): id is string => !!id)));

        let extra: EntityRow[] = [];
        if (porContacto.length > 0) {
          const { data, error } = await supabase
            .from('anew_entities')
            .select('id, display_name, first_name, last_name')
            .in('id', porContacto)
            .eq('organization_id', organizationId)
            .is('deleted_at', null)
            .limit(MAX_RESULTS);
          if (error) throw error;
          extra = (data || []) as EntityRow[];
        }

        if (pedido !== pedidoRef.current) return;
        const vistos = new Set<string>();
        const lista: PessoaOpcao[] = [];
        for (const e of [...((porNome.data || []) as EntityRow[]), ...extra]) {
          if (vistos.has(e.id)) continue;
          vistos.add(e.id);
          lista.push({ id: e.id, nome: nomeDe(e) });
        }
        setOpcoes(lista.slice(0, MAX_RESULTS));
        setActivo(-1);
        setAberto(true);
      } catch (err) {
        if (pedido !== pedidoRef.current) return;
        console.error('Erro ao pesquisar pessoas:', err);
        setOpcoes([]);
        setErroPesquisa(true);
        setAberto(true);
      } finally {
        if (pedido === pedidoRef.current) setAPesquisar(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, organizationId]);

  const escolher = (op: PessoaOpcao) => {
    onChange(op.id);
    setNomeActual(op.nome);
    setErroNome(false);
    setQuery('');
    setOpcoes([]);
    setAberto(false);
  };

  const limpar = () => {
    onChange(null);
    setNomeActual(null);
    setQuery('');
    setOpcoes([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setAberto(false);
      return;
    }
    if (!aberto || opcoes.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo(i => (i + 1) % opcoes.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo(i => (i <= 0 ? opcoes.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activo >= 0) {
      e.preventDefault();
      escolher(opcoes[activo]!);
    }
  };

  const termoValido = limparTermo(query).length >= MIN_CHARS;
  const semResultados = aberto && termoValido && !aPesquisar && !erroPesquisa && opcoes.length === 0;
  const anuncio = aPesquisar
    ? t('scheduling.item.pessoaCarregar')
    : erroPesquisa
      ? t('scheduling.item.pessoaErro')
      : semResultados
        ? t('scheduling.item.pessoaSemResultados')
        : opcoes.length > 0
          ? `${t('scheduling.item.pessoaResultados')}: ${opcoes.length}`
          : '';

  // Pessoa já escolhida (ou a carregar o nome dela).
  if (value) {
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-md border bg-muted/20 px-3">
        <div className="min-w-0 flex-1 text-sm" role="status">
          {aCarregarNome ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t('scheduling.item.pessoaCarregar')}
            </span>
          ) : erroNome ? (
            <span className="text-destructive">{t('scheduling.item.pessoaErro')}</span>
          ) : (
            <span className="block truncate font-medium">{nomeActual ?? value.slice(0, 8)}</span>
          )}
        </div>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={limpar}
            aria-label={t('scheduling.item.pessoaLimpar')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        {aPesquisar && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
        )}
        <Input
          role="combobox"
          aria-expanded={aberto}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-describedby={hintId}
          aria-activedescendant={activo >= 0 ? `${baseId}-op-${activo}` : undefined}
          aria-invalid={erroPesquisa || undefined}
          autoComplete="off"
          className={cn('h-11 pl-9 pr-9', erroPesquisa && 'border-destructive')}
          placeholder={t('scheduling.item.pessoaPlaceholder')}
          value={query}
          disabled={disabled}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => (opcoes.length > 0 || erroPesquisa) && setAberto(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      <p id={hintId} className="mt-1 text-xs text-muted-foreground">{t('scheduling.item.pessoaHint')}</p>
      <div className="sr-only" role="status" aria-live="polite">{anuncio}</div>

      {aberto && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover shadow-lg">
          {erroPesquisa && (
            <p className="p-3 text-sm text-destructive" role="alert">{t('scheduling.item.pessoaErro')}</p>
          )}
          {semResultados && (
            <p className="p-3 text-center text-sm text-muted-foreground">{t('scheduling.item.pessoaSemResultados')}</p>
          )}
          {opcoes.length > 0 && (
            <ul id={listId} role="listbox" aria-label={t('scheduling.item.pessoa')}>
              {opcoes.map((op, i) => (
                <li
                  key={op.id}
                  id={`${baseId}-op-${i}`}
                  role="option"
                  aria-selected={i === activo}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center px-3 py-2 text-sm hover:bg-accent/60',
                    i === activo && 'bg-accent',
                  )}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => escolher(op)}
                >
                  <span className="truncate">{op.nome}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
