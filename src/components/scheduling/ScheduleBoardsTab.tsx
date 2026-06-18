import { useState, useEffect, useMemo, useCallback } from 'react';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, parseISO, formatDistanceToNow, format, isToday } from 'date-fns';
import { pt } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { PermissionGate } from '@/components/PermissionGate';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Plus, Trash2, Search, AlertTriangle, Calendar, Clock, Users,
  LayoutGrid, List, CheckCircle2, CircleDot, Layers, Lock
} from 'lucide-react';
import type { ScheduleBoard, ScheduleItem, ScheduleResource } from '@/types/scheduling';
import type { ScopeLevel } from '@/hooks/usePermissionScope';

interface BoardStats {
  total: number;
  today: number;
  thisWeek: number;
  pending: number;
  confirmed: number;
  nextItems: ScheduleItem[];
  todayItems: ScheduleItem[];
  todaySlots: number;
  maxSlots: number | null;
  lastCreated: string | null;
  assignedResources: { id: string; name: string; color: string; initials: string }[];
}

interface PendingTodayEntry {
  id: string;
  title: string;
  time: string;
  boardName: string;
  canConfirm: boolean;
}

interface ScheduleBoardsTabProps {
  boards: ScheduleBoard[];
  companyId?: string;
  resources?: ScheduleResource[];
  currentUserId?: string;
  scheduleScope?: 'mine' | 'team' | 'all';
  viewScope?: ScopeLevel;
  actionScope?: ScopeLevel;
  teamMemberIds?: string[];
  onConfirmItems?: (ids: string[]) => Promise<number>;
  onEditBoard: (board: ScheduleBoard) => void;
  onNewBoard: () => void;
  onDeleteBoard: (id: string) => void;
  onBoardClick?: (board: ScheduleBoard) => void;
}

type BoardFilter = 'all' | 'today' | 'pending';
type BoardViewMode = 'grid' | 'list';

const ALL_USERS = '*' as const;
type UserIdSet = typeof ALL_USERS | string[];

/**
 * Resolve effective user-id set = permission scope ∩ selector scope.
 * Returns '*' when the user can see/act on the whole organization.
 */
function resolveEffectiveUserIds(
  permScope: ScopeLevel | undefined,
  selector: 'mine' | 'team' | 'all' | undefined,
  currentUserId: string | undefined,
  teamMemberIds: string[],
): UserIdSet {
  if (!permScope || permScope === 'NONE' || !currentUserId) {
    return currentUserId ? [currentUserId] : [];
  }
  if (selector === 'mine') return [currentUserId];
  if (selector === 'team') {
    if (permScope === 'OWNED') return [currentUserId];
    return [currentUserId, ...teamMemberIds];
  }
  // selector === 'all' (or undefined)
  if (permScope === 'ORG') return ALL_USERS;
  if (permScope === 'TEAM') return [currentUserId, ...teamMemberIds];
  return [currentUserId];
}

function setIncludes(set: UserIdSet, id: string | null | undefined): boolean {
  if (!id) return false;
  if (set === ALL_USERS) return true;
  return set.includes(id);
}

export function ScheduleBoardsTab({
  boards,
  companyId,
  resources = [],
  currentUserId,
  scheduleScope = 'all',
  viewScope = 'ORG',
  actionScope = 'OWNED',
  teamMemberIds = [],
  onConfirmItems,
  onEditBoard,
  onNewBoard,
  onDeleteBoard,
  onBoardClick,
}: ScheduleBoardsTabProps) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const [boardStats, setBoardStats] = useState<Record<string, BoardStats>>({});
  const [allItemsRaw, setAllItemsRaw] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<BoardFilter>('all');
  const [viewMode, setViewMode] = useState<BoardViewMode>('grid');
  const [confirming, setConfirming] = useState(false);

  // Resolve effective user-id sets — view vs action.
  const viewableUserIds = useMemo(
    () => resolveEffectiveUserIds(viewScope, scheduleScope, currentUserId, teamMemberIds),
    [viewScope, scheduleScope, currentUserId, teamMemberIds],
  );
  const actionableUserIds = useMemo(
    () => resolveEffectiveUserIds(actionScope, scheduleScope, currentUserId, teamMemberIds),
    [actionScope, scheduleScope, currentUserId, teamMemberIds],
  );

  // Map resource_id → resource.user_id, then derive viewable/actionable resource sets.
  const resourceUserMap = useMemo(() => {
    const m = new Map<string, string | null>();
    resources.forEach(r => m.set(r.id, (r as any).user_id ?? null));
    return m;
  }, [resources]);

  const viewableResourceIds = useMemo<UserIdSet>(() => {
    if (viewableUserIds === ALL_USERS) return ALL_USERS;
    const set = new Set(viewableUserIds);
    return resources.filter(r => set.has(((r as any).user_id) || '')).map(r => r.id);
  }, [viewableUserIds, resources]);

  const actionableResourceIds = useMemo<UserIdSet>(() => {
    if (actionableUserIds === ALL_USERS) return ALL_USERS;
    const set = new Set(actionableUserIds);
    return resources.filter(r => set.has(((r as any).user_id) || '')).map(r => r.id);
  }, [actionableUserIds, resources]);

  const isVisible = useCallback((item: any): boolean => {
    if (viewableUserIds === ALL_USERS) return true;
    if (setIncludes(viewableUserIds, item.created_by)) return true;
    if (setIncludes(viewableUserIds, item.user_id)) return true;
    const assignees = (item.assignees || []) as any[];
    return assignees.some(a => setIncludes(viewableResourceIds, a.resource_id));
  }, [viewableUserIds, viewableResourceIds]);

  const canConfirm = useCallback((item: any): boolean => {
    if (actionableUserIds === ALL_USERS) return true;
    if (setIncludes(actionableUserIds, item.created_by)) return true;
    if (setIncludes(actionableUserIds, item.user_id)) return true;
    const assignees = (item.assignees || []) as any[];
    return assignees.some(a => setIncludes(actionableResourceIds, a.resource_id));
  }, [actionableUserIds, actionableResourceIds]);

  // Fetch raw items for the company (one query). Filter is applied client-side per scope.
  const loadBoardStats = useCallback(async () => {
    if (!companyId || boards.length === 0) { setLoading(false); return; }
    setLoading(true);
    try {
      const now = new Date();

      const { data: allItems, error } = await supabase
        .from('schedule_items')
        .select(`
          id, board_id, title, status, start_datetime, end_datetime, created_at, user_id, created_by,
          assignees:schedule_item_assignees(
            resource_id,
            resource:schedule_resources(id, name, color, user_id)
          )
        `)
        .eq('organization_id', companyId)
        .gte('start_datetime', new Date(now.getFullYear(), 0, 1).toISOString())
        .order('start_datetime', { ascending: true });

      if (error) throw error;
      setAllItemsRaw((allItems || []) as any[]);
    } catch (err) {
      console.error('Error loading board stats:', err);
    } finally {
      setLoading(false);
    }
  }, [companyId, boards]);

  useEffect(() => { loadBoardStats(); }, [loadBoardStats]);

  // Resolve display names (time-off helper) — kept as before, display-only.
  const [userNameMap, setUserNameMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const ids = [...new Set([
        ...allItemsRaw.map(i => i.user_id).filter(Boolean),
        ...allItemsRaw.map(i => i.created_by).filter(Boolean),
      ])] as string[];
      if (ids.length === 0) { setUserNameMap(new Map()); return; }
      const { data } = await supabase.from('anew_users').select('auth_user_id, name').in('auth_user_id', ids);
      if (cancelled) return;
      const m = new Map<string, string>();
      (data || []).forEach((u: any) => { if (u.auth_user_id && u.name) m.set(u.auth_user_id, u.name); });
      setUserNameMap(m);
    };
    run();
    return () => { cancelled = true; };
  }, [allItemsRaw]);

  // Derive viewable items + per-board stats (recomputed when scope changes — no refetch).
  useEffect(() => {
    if (allItemsRaw.length === 0 && boards.length > 0) { setBoardStats({}); return; }
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const items = allItemsRaw.filter(isVisible).map(item => {
      const enriched = { ...item } as any;
      if (item.user_id && userNameMap.has(item.user_id)) {
        enriched._userName = userNameMap.get(item.user_id);
      } else {
        const titleMatch = item.title?.match(/^.+?[\s]*[-–—][\s]*(.+)$/);
        if (titleMatch && titleMatch[1]?.trim()) enriched._userName = titleMatch[1].trim();
      }
      enriched._canConfirm = canConfirm(item);
      return enriched;
    });

    const stats: Record<string, BoardStats> = {};
    for (const board of boards) {
      const boardItems = items.filter(i => i.board_id === board.id);
      const todayItems = boardItems.filter(i => {
        const d = parseISO(i.start_datetime);
        return d >= todayStart && d <= todayEnd;
      });
      const weekItems = boardItems.filter(i => {
        const d = parseISO(i.start_datetime);
        return d >= weekStart && d <= weekEnd;
      });
      const pendingItems = boardItems.filter(i => i.status === 'draft' || i.status === 'scheduled');
      const confirmedItems = boardItems.filter(i => i.status === 'confirmed' || i.status === 'completed');
      const futureItems = boardItems.filter(i => parseISO(i.start_datetime) >= now);
      const nextItems = futureItems.slice(0, 3);

      const resourceMap = new Map<string, { id: string; name: string; color: string; initials: string }>();
      boardItems.forEach(item => {
        (item.assignees || []).forEach((a: any) => {
          if (a.resource && !resourceMap.has(a.resource.id)) {
            const name = a.resource.name || '';
            const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
            resourceMap.set(a.resource.id, { id: a.resource.id, name, color: a.resource.color || '#888', initials });
          }
        });
      });

      const maxSlots = (board.settings as any)?.max_daily_slots ?? null;
      const lastItem = boardItems.length > 0 ? boardItems[boardItems.length - 1].created_at : null;

      stats[board.id] = {
        total: boardItems.length,
        today: todayItems.length,
        thisWeek: weekItems.length,
        pending: pendingItems.length,
        confirmed: confirmedItems.length,
        nextItems: nextItems as ScheduleItem[],
        todayItems: todayItems.sort((a, b) => a.start_datetime.localeCompare(b.start_datetime)) as ScheduleItem[],
        todaySlots: todayItems.length,
        maxSlots,
        lastCreated: lastItem,
        assignedResources: Array.from(resourceMap.values()).slice(0, 5),
      };
    }
    setBoardStats(stats);
  }, [allItemsRaw, boards, isVisible, canConfirm, userNameMap]);

  // Global KPIs (already computed over viewable items via boardStats).
  const globalKpis = useMemo(() => {
    const vals = Object.values(boardStats);
    return {
      total: vals.reduce((s, v) => s + v.total, 0),
      today: vals.reduce((s, v) => s + v.today, 0),
      thisWeek: vals.reduce((s, v) => s + v.thisWeek, 0),
      pending: vals.reduce((s, v) => s + v.pending, 0),
      confirmed: vals.reduce((s, v) => s + v.confirmed, 0),
      boards: boards.length,
    };
  }, [boardStats, boards]);

  // Pending today (visible items only, with canConfirm flag).
  const pendingTodayItems = useMemo<PendingTodayEntry[]>(() => {
    const result: PendingTodayEntry[] = [];
    const visibleToday = allItemsRaw.filter(i =>
      isVisible(i)
      && (i.status === 'draft' || i.status === 'scheduled')
      && isToday(parseISO(i.start_datetime))
    );
    visibleToday.forEach(item => {
      const board = boards.find(b => b.id === item.board_id);
      if (!board) return;
      result.push({
        id: item.id,
        title: item.title,
        time: format(parseISO(item.start_datetime), 'HH:mm'),
        boardName: board.name_key ? t(board.name_key) : board.name,
        canConfirm: canConfirm(item),
      });
    });
    return result;
  }, [allItemsRaw, boards, isVisible, canConfirm, t]);

  const actionablePendingToday = useMemo(
    () => pendingTodayItems.filter(p => p.canConfirm),
    [pendingTodayItems],
  );

  const handleConfirmAll = useCallback(async () => {
    if (!onConfirmItems) return;
    const ids = actionablePendingToday.map(p => p.id);
    if (ids.length === 0) {
      toast({
        title: 'Sem permissão',
        description: 'Não tens agendamentos teus pendentes para confirmar.',
        variant: 'destructive',
      });
      return;
    }
    setConfirming(true);
    try {
      const ok = await onConfirmItems(ids);
      toast({
        title: 'Agendamentos confirmados',
        description: `${ok} de ${ids.length} confirmado${ids.length !== 1 ? 's' : ''}.`,
      });
      await loadBoardStats();
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro', description: 'Não foi possível confirmar.', variant: 'destructive' });
    } finally {
      setConfirming(false);
    }
  }, [actionablePendingToday, onConfirmItems, loadBoardStats, toast]);

  // Banner button label
  const totalPending = pendingTodayItems.length;
  const totalActionable = actionablePendingToday.length;
  const confirmAllLabel = totalActionable === 0
    ? 'Confirmar todos'
    : totalActionable === totalPending
      ? 'Confirmar todos'
      : `Confirmar os meus (${totalActionable})`;

  // Filter and sort boards
  const filteredBoards = useMemo(() => {
    let result = [...boards];
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(b => {
        const name = b.name_key ? t(b.name_key) : b.name;
        return name.toLowerCase().includes(s) || (b.description || '').toLowerCase().includes(s);
      });
    }
    if (filter === 'today') result = result.filter(b => (boardStats[b.id]?.today || 0) > 0);
    else if (filter === 'pending') result = result.filter(b => (boardStats[b.id]?.pending || 0) > 0);
    result.sort((a, b) => (boardStats[b.id]?.today || 0) - (boardStats[a.id]?.today || 0));
    return result;
  }, [boards, search, filter, boardStats, t]);

  const isTimeOffBoard = (board: ScheduleBoard) => board.board_type === 'time_off';

  return (
    <div className="space-y-4">
      {/* Pending alert banner */}
      {totalPending > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold text-amber-800 dark:text-amber-300">
              {totalPending} agendamento{totalPending !== 1 ? 's' : ''} hoje sem confirmação
            </span>
            <span className="text-amber-700 dark:text-amber-400 ml-2">
              — {pendingTodayItems.slice(0, 6).map(i => `${i.title} (${i.time})`).join(', ')}
              {pendingTodayItems.length > 6 ? '…' : '.'}
            </span>
            {totalActionable < totalPending && (
              <span className="block text-xs text-amber-700/80 dark:text-amber-400/80 mt-1">
                {totalPending - totalActionable} fora do teu âmbito de ação.
              </span>
            )}
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                    onClick={handleConfirmAll}
                    disabled={confirming || totalActionable === 0}
                  >
                    {confirmAllLabel}
                  </Button>
                </span>
              </TooltipTrigger>
              {totalActionable === 0 && (
                <TooltipContent>Não tens agendamentos teus pendentes para confirmar</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 shrink-0">
                Ver pendentes
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-h-96 overflow-y-auto" align="end">
              <p className="text-sm font-semibold mb-2">Pendentes de hoje ({totalPending})</p>
              <div className="space-y-1.5">
                {pendingTodayItems.map(p => (
                  <div key={p.id} className="flex items-center gap-2 text-sm py-1 border-b last:border-0">
                    <span className="font-medium text-primary">{p.time}</span>
                    <span className="truncate flex-1">{p.title}</span>
                    <span className="text-[10px] text-muted-foreground">{p.boardName}</span>
                    {!p.canConfirm && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>Apenas leitura — não és o responsável</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Global KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="TOTAL AGENDAMENTOS" value={globalKpis.total} subtitle={`Em ${globalKpis.boards} board${globalKpis.boards !== 1 ? 's' : ''}`} active={filter === 'all'} onClick={() => setFilter('all')} />
        <KpiCard label="HOJE" value={globalKpis.today} valueColor="text-red-600" subtitle={`${globalKpis.confirmed} confirmados · ${globalKpis.pending} pendentes`} active={filter === 'today'} onClick={() => setFilter(filter === 'today' ? 'all' : 'today')} />
        <KpiCard label="ESTA SEMANA" value={globalKpis.thisWeek} valueColor="text-blue-600" subtitle="Seg a Sex" />
        <KpiCard label="PENDENTES" value={globalKpis.pending} valueColor="text-amber-600" subtitle="Sem confirmação" active={filter === 'pending'} onClick={() => setFilter(filter === 'pending' ? 'all' : 'pending')} />
        <KpiCard label="CONFIRMADOS" value={globalKpis.confirmed} valueColor="text-green-600" subtitle={globalKpis.total > 0 ? `${Math.round((globalKpis.confirmed / globalKpis.total) * 100)}% do total` : '—'} />
        <KpiCard label="BOARDS ACTIVOS" value={boards.filter(b => b.is_active).length} />
      </div>

      {/* Search + Filters + View toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Procurar board..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')}>Todos</Button>
          <Button size="sm" variant={filter === 'today' ? 'default' : 'outline'} onClick={() => setFilter(filter === 'today' ? 'all' : 'today')} className={filter !== 'today' ? 'text-red-600 border-red-200' : ''}>
            <CircleDot className="h-3 w-3 mr-1" />Com agendamentos hoje
          </Button>
          <Button size="sm" variant={filter === 'pending' ? 'default' : 'outline'} onClick={() => setFilter(filter === 'pending' ? 'all' : 'pending')} className={filter !== 'pending' ? 'text-amber-600 border-amber-200' : ''}>
            <Users className="h-3 w-3 mr-1" />Com pendentes
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-1 border rounded-md">
          <Button size="icon" variant={viewMode === 'grid' ? 'default' : 'ghost'} className="h-8 w-8" onClick={() => setViewMode('grid')}><LayoutGrid className="h-4 w-4" /></Button>
          <Button size="icon" variant={viewMode === 'list' ? 'default' : 'ghost'} className="h-8 w-8" onClick={() => setViewMode('list')}><List className="h-4 w-4" /></Button>
        </div>
        <PermissionGate permission="scheduling.create">
          <Button onClick={onNewBoard}><Plus className="h-4 w-4 mr-2" />{t('scheduling.newBoard')}</Button>
        </PermissionGate>
      </div>

      {/* Board cards */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredBoards.map(board => (
            <BoardCard
              key={board.id}
              board={board}
              stats={boardStats[board.id]}
              isTimeOff={isTimeOffBoard(board)}
              onEdit={() => onEditBoard(board)}
              onClick={() => onBoardClick?.(board)}
              onDelete={() => onDeleteBoard(board.id)}
              canDelete={!board.is_system_board && hasPermission('scheduling.delete')}
              t={t}
            />
          ))}
          <PermissionGate permission="scheduling.create">
            <Card className="border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 cursor-pointer transition-colors flex items-center justify-center min-h-[280px]" onClick={onNewBoard}>
              <div className="text-center space-y-2">
                <Plus className="h-10 w-10 mx-auto text-muted-foreground/50" />
                <p className="font-semibold text-primary">{t('scheduling.newBoard')}</p>
                <p className="text-sm text-muted-foreground">Crie um novo quadro de agendamentos</p>
              </div>
            </Card>
          </PermissionGate>
          {filteredBoards.length === 0 && boards.length > 0 && (
            <div className="col-span-full text-center py-8 text-muted-foreground">Nenhum board corresponde aos filtros selecionados.</div>
          )}
          {boards.length === 0 && (
            <Card className="col-span-full p-8 text-center">
              <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('scheduling.noBoards')}</h3>
              <p className="text-muted-foreground mb-4">{t('scheduling.createBoardsPrompt')}</p>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredBoards.map(board => (
            <BoardListRow
              key={board.id}
              board={board}
              stats={boardStats[board.id]}
              onEdit={() => onEditBoard(board)}
              onClick={() => onBoardClick?.(board)}
              onDelete={() => onDeleteBoard(board.id)}
              canDelete={!board.is_system_board && hasPermission('scheduling.delete')}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function KpiCard({ label, value, subtitle, valueColor, active, onClick }: {
  label: string; value: number; subtitle?: string; valueColor?: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <Card className={`cursor-pointer transition-all hover:shadow-md ${active ? 'ring-2 ring-primary' : ''}`} onClick={onClick}>
      <CardContent className="p-4">
        <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
        <p className={`text-3xl font-bold ${valueColor || ''}`}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function BoardCard({ board, stats, isTimeOff, onEdit, onClick, onDelete, canDelete, t }: {
  board: ScheduleBoard; stats?: BoardStats; isTimeOff: boolean;
  onEdit: () => void; onClick: () => void; onDelete: () => void; canDelete: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [showAllToday, setShowAllToday] = useState(false);
  const boardName = board.name_key ? t(board.name_key) : board.name;
  const progressPercent = stats && stats.maxSlots ? Math.min(100, Math.round((stats.todaySlots / stats.maxSlots) * 100)) : 0;
  const displayItems = showAllToday && stats?.todayItems ? stats.todayItems : (stats?.nextItems || []);
  const hasTodayItems = (stats?.todayItems?.length ?? 0) > 3;

  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer border-t-4" style={{ borderTopColor: board.color }} onClick={onClick}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: board.color }} />
            <div className="min-w-0">
              <CardTitle className="text-lg truncate">{boardName}</CardTitle>
              <p className="text-xs text-muted-foreground truncate">{board.description || t('scheduling.noDescription')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Badge variant={board.is_active ? 'default' : 'secondary'} className="text-[10px]">
              {board.is_active ? t('common.active') : t('common.inactive')}
            </Badge>
            {canDelete && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs gap-1">
            <Calendar className="h-3 w-3" />
            {stats?.total ?? 0} agendamentos
          </Badge>
          {(stats?.today ?? 0) > 0 && (
            <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 text-xs gap-1">
              <CircleDot className="h-3 w-3" />
              {stats!.today} hoje
            </Badge>
          )}
          {(stats?.thisWeek ?? 0) > 0 && (
            <Badge variant="outline" className="text-xs gap-1 text-blue-600 border-blue-200">
              <Calendar className="h-3 w-3" />
              {stats!.thisWeek} esta semana
            </Badge>
          )}
          {(stats?.pending ?? 0) > 0 && (
            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 text-xs gap-1">
              <Users className="h-3 w-3" />
              {stats!.pending} pendentes
            </Badge>
          )}
        </div>

        {!isTimeOff && stats && (
          <div className="space-y-1">
            {stats.maxSlots ? (
              <>
                <Progress value={progressPercent} className="h-2" />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{t('scheduling.board.slotsOccupied', { current: stats.todaySlots, max: stats.maxSlots })}</span>
                  <span>{progressPercent}%</span>
                </div>
              </>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                {t('scheduling.board.slotsToday', { current: stats.todaySlots })}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {showAllToday ? `TODOS HOJE (${stats?.todayItems?.length || 0})` : (isTimeOff ? 'PRÓXIMAS AUSÊNCIAS' : 'PRÓXIMOS HOJE')}
            </p>
            {!isTimeOff && hasTodayItems && (
              <Button variant="ghost" size="sm" className="h-5 text-[10px] px-2 text-primary hover:text-primary"
                onClick={(e) => { e.stopPropagation(); setShowAllToday(!showAllToday); }}>
                {showAllToday ? 'Ver menos' : `Ver todos (${stats?.todayItems?.length})`}
              </Button>
            )}
          </div>
          {displayItems.length > 0 ? (
            <div className={`space-y-1.5 ${showAllToday && displayItems.length > 5 ? 'max-h-[200px] overflow-y-auto pr-1' : ''}`}>
              {displayItems.map((item, idx) => {
                const start = parseISO(item.start_datetime);
                const timeStr = isTimeOff ? format(start, 'dd/MM') : format(start, 'HH:mm');
                const statusColor = item.status === 'confirmed' || item.status === 'completed' ? 'bg-green-500'
                  : item.status === 'cancelled' ? 'bg-red-500' : 'bg-amber-500';
                const assigneeName = (item as any).assignees?.[0]?.resource?.name;
                const userName = (item as any)._userName;
                const itemCanConfirm = (item as any)._canConfirm !== false;
                let displayTitle = item.title;
                if (isTimeOff && userName) {
                  const titleAlreadyHasName = item.title.toLowerCase().includes(userName.toLowerCase());
                  displayTitle = titleAlreadyHasName ? item.title : `${item.title} — ${userName}`;
                } else if (!isTimeOff && assigneeName) {
                  displayTitle = `${item.title} — ${assigneeName}`;
                }
                return (
                  <div key={item.id || idx} className="flex items-center gap-2 text-sm">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
                    <span className="font-medium text-primary">{timeStr}</span>
                    <span className="truncate flex-1">{displayTitle}</span>
                    {!itemCanConfirm && (item.status === 'draft' || item.status === 'scheduled') && (
                      <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                    {!isTimeOff && assigneeName && (
                      <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                        <Users className="h-3 w-3" />{assigneeName}
                      </span>
                    )}
                    {isTimeOff && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {(() => {
                          const end = parseISO(item.end_datetime);
                          const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                          return `${days} dia${days !== 1 ? 's' : ''}`;
                        })()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Sem agendamentos próximos</p>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-1">
            <TooltipProvider>
              {stats?.assignedResources?.slice(0, 3).map(r => (
                <Tooltip key={r.id}>
                  <TooltipTrigger asChild>
                    <Avatar className="h-7 w-7 border-2 border-background">
                      <AvatarFallback className="text-[10px] font-bold text-white" style={{ backgroundColor: r.color }}>
                        {r.initials}
                      </AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{r.name}</TooltipContent>
                </Tooltip>
              ))}
            </TooltipProvider>
            {stats?.assignedResources && stats.assignedResources.length > 0 && (
              <span className="text-xs text-muted-foreground ml-1">
                {stats.assignedResources.length} {stats.assignedResources.length === 1 ? 'comercial' : 'comerciais'}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {stats?.lastCreated ? `Último: ${formatDistanceToNow(parseISO(stats.lastCreated), { addSuffix: true, locale: pt })}` : '—'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function BoardListRow({ board, stats, onEdit, onClick, onDelete, canDelete, t }: {
  board: ScheduleBoard; stats?: BoardStats;
  onEdit: () => void; onClick: () => void; onDelete: () => void; canDelete: boolean;
  t: (key: string) => string;
}) {
  const boardName = board.name_key ? t(board.name_key) : board.name;
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={onClick}>
      <CardContent className="p-3">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: board.color }} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{boardName}</p>
            <p className="text-xs text-muted-foreground truncate">{board.description || '—'}</p>
          </div>
          <div className="flex items-center gap-3 text-sm shrink-0">
            <span className="text-muted-foreground">{stats?.total ?? 0} total</span>
            <Badge className={`text-xs ${(stats?.today ?? 0) > 0 ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}`}>
              {stats?.today ?? 0} hoje
            </Badge>
            <span className="text-muted-foreground">{stats?.thisWeek ?? 0} semana</span>
            {(stats?.pending ?? 0) > 0 && (
              <Badge className="bg-amber-100 text-amber-700 text-xs">{stats!.pending} pend.</Badge>
            )}
            <Badge variant={board.is_active ? 'default' : 'secondary'} className="text-[10px]">
              {board.is_active ? t('common.active') : t('common.inactive')}
            </Badge>
            {canDelete && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
