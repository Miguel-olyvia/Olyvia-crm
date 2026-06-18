import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { usePermissions } from '@/hooks/usePermissions';
import { usePermissionScope } from '@/hooks/usePermissionScope';
import { PermissionGate } from '@/components/PermissionGate';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, Plus, Calendar, LayoutGrid, List, Settings2, Users, Layers, HelpCircle, Settings, Trash2 } from 'lucide-react';
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { useScheduling } from '@/hooks/useScheduling';
import { useScheduleSettings } from '@/hooks/useScheduleSettings';
import { useTranslation } from '@/hooks/useTranslation';
import { ScheduleCalendarView } from '@/components/scheduling/ScheduleCalendarView';
import { ScheduleItemDialog } from '@/components/scheduling/ScheduleItemDialog';
import { ScheduleBoardDialog } from '@/components/scheduling/ScheduleBoardDialog';
import { ScheduleResourceDialog } from '@/components/scheduling/ScheduleResourceDialog';
import { AutoScheduleRulesTab } from '@/components/scheduling/AutoScheduleRulesTab';
import { ScheduleSettingsDialog } from '@/components/scheduling/ScheduleSettingsDialog';
import { ScheduleBoardsTab } from '@/components/scheduling/ScheduleBoardsTab';
import type { ScheduleItem, ScheduleBoard, ScheduleResource, ScheduleFilters } from '@/types/scheduling';
import { PageFAQSheet } from "@/components/PageFAQSheet";

type ViewMode = 'month' | 'week' | 'day';
type TabType = 'calendar' | 'boards' | 'resources' | 'rules';

export default function Scheduling() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeCompany, userType } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const { getPermissionScope, authUserId, teamMemberIds, anewUserId, loading: scopeLoading } = usePermissionScope();

  const schedulingScope = getPermissionScope('scheduling.items.view');
  const schedulingEditScope = getPermissionScope('scheduling.items.edit');
  const isSuperAdmin = userType === 'system_admin';
  const canSeeAll = schedulingScope === 'ORG' || isSuperAdmin;
  const isTeamScope = schedulingScope === 'TEAM';
  const showScopeSelector = canSeeAll || isTeamScope;

  const canViewScheduling = hasPermission('scheduling.view') || hasPermission('scheduling') || hasPermission('scheduling.items.view') || hasPermission('scheduling.boards.view') || hasPermission('scheduling.resources.view');
  const hasAnyViewPermission = canViewScheduling;

  useEffect(() => {
    if (!permissionsLoading && activeCompany && !hasAnyViewPermission) navigate('/dashboard');
  }, [permissionsLoading, hasAnyViewPermission, navigate, activeCompany]);

  const initialTabSet = useRef(false);
  useEffect(() => {
    if (!permissionsLoading && hasAnyViewPermission && !initialTabSet.current) {
      initialTabSet.current = true;
      setActiveTab('calendar');
    }
  }, [permissionsLoading, hasAnyViewPermission]);

  const {
    loading, fetchBoards, createBoard, updateBoard, deleteBoard,
    fetchResources, createResource, updateResource, deleteResource,
    fetchItems, createItem, updateItem, deleteItem,
    rescheduleItem, updateAssignees, ensureTimeOffBoard,
  } = useScheduling(activeCompany?.id);

  // Stabilize callback refs to prevent useEffect re-runs from unstable dependencies (e.g. `t`)
  const fetchBoardsRef = useRef(fetchBoards);
  fetchBoardsRef.current = fetchBoards;
  const fetchResourcesRef = useRef(fetchResources);
  fetchResourcesRef.current = fetchResources;
  const ensureTimeOffBoardRef = useRef(ensureTimeOffBoard);
  ensureTimeOffBoardRef.current = ensureTimeOffBoard;
  const fetchItemsRef = useRef(fetchItems);
  fetchItemsRef.current = fetchItems;

  const [boards, setBoards] = useState<ScheduleBoard[]>([]);
  const [resources, setResources] = useState<ScheduleResource[]>([]);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [dataReady, setDataReady] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [activeTab, setActiveTab] = useState<TabType>('calendar');
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([]);
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const [scheduleScope, setScheduleScope] = useState<'mine' | 'team' | 'all'>('mine');
  const [teamAuthUserIds, setTeamAuthUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (isSuperAdmin) setScheduleScope('all');
    else if (canSeeAll) setScheduleScope('all');
    else if (isTeamScope) setScheduleScope('team');
    else setScheduleScope('mine');
  }, [canSeeAll, isSuperAdmin, isTeamScope]);

  // Team member IDs are already anew_users.id — use them directly for schedule filtering
  // since schedule_resources.user_id now references anew_users.id
  useEffect(() => {
    if (!isTeamScope || teamMemberIds.length === 0) { setTeamAuthUserIds([]); return; }
    setTeamAuthUserIds(teamMemberIds);
  }, [isTeamScope, teamMemberIds]);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [boardDialogOpen, setBoardDialogOpen] = useState(false);
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ScheduleItem | null>(null);
  const [selectedBoard, setSelectedBoard] = useState<ScheduleBoard | null>(null);
  const [selectedResource, setSelectedResource] = useState<ScheduleResource | null>(null);
  const [defaultDate, setDefaultDate] = useState<Date | undefined>();
  const [boardToDelete, setBoardToDelete] = useState<string | null>(null);
  const [resourceToDelete, setResourceToDelete] = useState<string | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  const { settings, holidays } = useScheduleSettings(activeCompany?.id);

  useEffect(() => {
    if (!activeCompany?.id) return;
    let cancelled = false;
    setDataReady(false);
    const loadData = async () => {
      setBoards([]); setResources([]);
      setSelectedBoardIds([]); setSelectedResourceIds([]);
      setSelectedItem(null); setSelectedBoard(null); setSelectedResource(null);
      setScheduleScope(canSeeAll ? 'all' : 'mine');
      await ensureTimeOffBoardRef.current();
      const [boardsData, resourcesData] = await Promise.all([fetchBoardsRef.current(), fetchResourcesRef.current()]);
      if (cancelled) return;
      setBoards(boardsData); setResources(resourcesData);
      const [contactsRes, userRes] = await Promise.all([
        supabase.from('anew_contacts').select('id, entity:anew_entities(id, first_name, last_name)').eq('organization_id', activeCompany.id).order('created_at', { ascending: false }),
        supabase.auth.getUser(),
      ]);
      // Load users via separate queries (no FK between anew_memberships and anew_users)
      const { data: memberships } = await supabase.from('anew_memberships').select('user_id').eq('organization_id', activeCompany.id).eq('status', 'active');
      let usersData: any[] = [];
      if (memberships && memberships.length > 0) {
        const userIds = memberships.map((m: any) => m.user_id).filter(Boolean);
        if (userIds.length > 0) {
          const { data: anewUsers } = await supabase.from('anew_users').select('id, name').in('id', userIds);
          usersData = (anewUsers || []).map((u: any) => ({ id: u.id, name: u.name })).filter((u: any) => u.id);
        }
      }
      if (cancelled) return;
      setContacts((contactsRes.data || []).map((c: any) => ({
        id: c.id,
        first_name: c.entity?.first_name || '',
        last_name: c.entity?.last_name || '',
      })));
      setEmployees([]);
      setUsers(usersData);
      if (userRes.data.user) {
        const { data: anewUser } = await (supabase as any).from('anew_users').select('id').eq('auth_user_id', userRes.data.user.id).maybeSingle();
        setCurrentUserId(anewUser?.id || undefined);
      }
      if (!cancelled) setDataReady(true);
    };
    loadData();
    return () => { cancelled = true; };
  }, [activeCompany?.id]);

  useEffect(() => {
    if (!dataReady) return;
    if (scheduleScope === 'mine' && !currentUserId) return;
    if (scheduleScope === 'team' && !currentUserId) return;
    const loadItems = async () => {
      let dateFrom: Date, dateTo: Date;
      if (viewMode === 'month') {
        dateFrom = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
        dateTo = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
      } else if (viewMode === 'week') {
        dateFrom = startOfWeek(currentDate, { weekStartsOn: 1 });
        dateTo = endOfWeek(currentDate, { weekStartsOn: 1 });
      } else {
        dateFrom = new Date(currentDate); dateFrom.setHours(0, 0, 0, 0);
        dateTo = new Date(currentDate); dateTo.setHours(23, 59, 59, 999);
      }

      // Build scope-aware filter
      let scopeFilter: Partial<ScheduleFilters> = {};
      if (scheduleScope === 'mine' && currentUserId) {
        scopeFilter = { assigneeId: currentUserId };
      } else if (scheduleScope === 'team' && currentUserId) {
        // Include self + all team members
        const allTeamIds = [currentUserId, ...teamAuthUserIds];
        scopeFilter = { assigneeIds: allTeamIds };
      }
      // 'all' → no filter

      const filters: ScheduleFilters = {
        dateFrom, dateTo,
        boardIds: selectedBoardIds.length > 0 ? selectedBoardIds : undefined,
        resourceIds: selectedResourceIds.length > 0 ? selectedResourceIds : undefined,
        ...scopeFilter,
      };
      setItems(await fetchItemsRef.current(filters));
    };
    loadItems();
  }, [currentDate, viewMode, selectedBoardIds, selectedResourceIds, scheduleScope, currentUserId, dataReady, teamAuthUserIds]);

  const handleItemClick = (item: ScheduleItem) => { setSelectedItem(item); setDefaultDate(undefined); setItemDialogOpen(true); };
  const handleAddClick = (date?: Date) => { setSelectedItem(null); setDefaultDate(date); setItemDialogOpen(true); };
  const handleItemDrop = async (itemId: string, newStart: Date, newEnd: Date) => {
    if (await rescheduleItem(itemId, newStart, newEnd)) {
      setItems(prev => prev.map(item => item.id === itemId ? { ...item, start_datetime: newStart.toISOString(), end_datetime: newEnd.toISOString() } : item));
    }
  };
  const handleSaveItem = async (data: Partial<ScheduleItem>, assigneeIds: string[]) => {
    // Build scope-aware filter (same logic as the useEffect that loads items)
    let scopeFilter: Partial<ScheduleFilters> = {};
    if (scheduleScope === 'mine' && currentUserId) {
      scopeFilter = { assigneeId: currentUserId };
    } else if (scheduleScope === 'team' && currentUserId) {
      scopeFilter = { assigneeIds: [currentUserId, ...teamAuthUserIds] };
    }

    let dateFrom: Date, dateTo: Date;
    if (viewMode === 'month') {
      dateFrom = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
      dateTo = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    } else if (viewMode === 'week') {
      dateFrom = startOfWeek(currentDate, { weekStartsOn: 1 });
      dateTo = endOfWeek(currentDate, { weekStartsOn: 1 });
    } else {
      dateFrom = new Date(currentDate); dateFrom.setHours(0, 0, 0, 0);
      dateTo = new Date(currentDate); dateTo.setHours(23, 59, 59, 999);
    }

    const filters: ScheduleFilters = {
      dateFrom, dateTo,
      boardIds: selectedBoardIds.length > 0 ? selectedBoardIds : undefined,
      resourceIds: selectedResourceIds.length > 0 ? selectedResourceIds : undefined,
      ...scopeFilter,
    };

    if (data.id) {
      if (await updateItem(data.id, data)) {
        await updateAssignees(data.id, assigneeIds);
        setItems(await fetchItemsRef.current(filters));
      }
    } else {
      const newItem = await createItem(data, assigneeIds);
      if (newItem) setItems(prev => [...prev, newItem]);
    }
  };
  const handleDeleteItem = async (id: string) => { if (await deleteItem(id)) setItems(prev => prev.filter(item => item.id !== id)); };
  const handleSaveBoard = async (data: Partial<ScheduleBoard>) => {
    if (data.id) { if (await updateBoard(data.id, data)) setBoards(prev => prev.map(b => b.id === data.id ? { ...b, ...data } : b)); }
    else { const nb = await createBoard(data); if (nb) setBoards(prev => [...prev, nb]); }
  };
  const handleSaveResource = async (data: Partial<ScheduleResource>) => {
    // Resolve user name for display
    const resolveUserName = (resource: Partial<ScheduleResource>): Partial<ScheduleResource> => {
      if (resource.user_id) {
        const user = users.find(u => u.id === resource.user_id);
        if (user) return { ...resource, user: { name: user.name } };
      } else {
        return { ...resource, user: undefined };
      }
      return resource;
    };

    if (data.id) {
      if (await updateResource(data.id, data)) {
        const resolved = resolveUserName(data);
        setResources(prev => prev.map(r => r.id === data.id ? { ...r, ...resolved } : r));
      }
    } else {
      const nr = await createResource(data);
      if (nr) {
        const resolved = resolveUserName(nr);
        setResources(prev => [...prev, resolved as ScheduleResource]);
      }
    }
  };
  const handleDeleteResource = async (rid: string) => { if (await deleteResource(rid)) { setResources(prev => prev.filter(r => r.id !== rid)); setResourceDialogOpen(false); } };
  const handleDeleteBoard = async (bid: string) => { if (await deleteBoard(bid)) { setBoards(prev => prev.filter(b => b.id !== bid)); setBoardDialogOpen(false); } };
  const toggleBoardFilter = (id: string) => setSelectedBoardIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleResourceFilter = (id: string) => setSelectedResourceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  if (loading && boards.length === 0) return <><div className="flex justify-center items-center h-64"><OlyviaLoader size={40} /></div></>;

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">{t('scheduling.title')}</h1>
            <p className="text-muted-foreground">{t('scheduling.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <PermissionGate permission="scheduling.settings">
              <Button variant="ghost" size="icon" onClick={() => setSettingsDialogOpen(true)}><Settings className="h-5 w-5" /></Button>
            </PermissionGate>
            <Button variant="ghost" size="icon" asChild><Link to="/docs/auto-scheduling"><HelpCircle className="h-5 w-5" /></Link></Button>
            <PageFAQSheet pageKey="operations.scheduling" />
            <PermissionGate permission="scheduling.create">
              <Button variant="outline" onClick={() => handleAddClick()}><Plus className="h-4 w-4 mr-2" />{t('scheduling.newSchedule')}</Button>
            </PermissionGate>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
          <TabsList>
            <TabsTrigger value="calendar" className="flex items-center gap-2"><Calendar className="h-4 w-4" />{t('scheduling.calendar')}</TabsTrigger>
            <TabsTrigger value="boards" className="flex items-center gap-2"><Layers className="h-4 w-4" />{t('scheduling.boards')}</TabsTrigger>
            <TabsTrigger value="resources" className="flex items-center gap-2"><Users className="h-4 w-4" />{t('scheduling.resources')}</TabsTrigger>
            <TabsTrigger value="rules" className="flex items-center gap-2"><Settings2 className="h-4 w-4" />{t('scheduling.rules')}</TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="space-y-4">
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-4 flex-wrap">
                  {showScopeSelector && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{t('scheduling.scope') || 'Ver'}:</span>
                      <Select value={scheduleScope} onValueChange={(v) => setScheduleScope(v as 'mine' | 'team' | 'all')}>
                        <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mine">{t('scheduling.scopeMine') || 'Só a minha'}</SelectItem>
                          {isTeamScope && <SelectItem value="team">{t('scheduling.scopeTeam') || 'A minha equipa'}</SelectItem>}
                          {canSeeAll && <SelectItem value="all">{t('scheduling.scopeAll') || 'Toda a organização'}</SelectItem>}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t('scheduling.view')}:</span>
                    <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                      <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="month">{t('scheduling.month')}</SelectItem>
                        <SelectItem value="week">{t('scheduling.week')}</SelectItem>
                        <SelectItem value="day">{t('scheduling.day')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground">{t('scheduling.boards')}:</span>
                    {boards.slice(0, 3).map(board => (
                      <Badge key={board.id} variant={selectedBoardIds.includes(board.id) ? 'default' : 'outline'} className="cursor-pointer transition-colors"
                        style={{ backgroundColor: selectedBoardIds.includes(board.id) ? board.color : undefined, borderColor: board.color }}
                        onClick={() => toggleBoardFilter(board.id)}>
                        {board.name_key ? t(board.name_key) : board.name}
                      </Badge>
                    ))}
                    {boards.length > 3 && (
                      <Popover>
                        <PopoverTrigger asChild><Button type="button" variant="secondary" size="sm" className="h-6 px-2 rounded-full">+{boards.length - 3}</Button></PopoverTrigger>
                        <PopoverContent className="w-56 p-2 z-50" align="start" sideOffset={5}>
                          <div className="space-y-2">
                            <p className="text-sm font-medium px-2 py-1">{t('scheduling.boards')}</p>
                            {boards.map(board => (
                              <div key={board.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer" onClick={() => toggleBoardFilter(board.id)}>
                                <Checkbox checked={selectedBoardIds.includes(board.id)} />
                                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: board.color }} />
                                <span className="text-sm truncate">{board.name_key ? t(board.name_key) : board.name}</span>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                    {selectedBoardIds.length > 0 && <Button variant="ghost" size="sm" onClick={() => setSelectedBoardIds([])}>{t('scheduling.clear')}</Button>}
                  </div>
                  {resources.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-muted-foreground">{t('scheduling.resources')}:</span>
                      {resources.slice(0, 3).map(resource => (
                        <Badge key={resource.id} variant={selectedResourceIds.includes(resource.id) ? 'default' : 'outline'} className="cursor-pointer transition-colors"
                          style={{ backgroundColor: selectedResourceIds.includes(resource.id) ? resource.color : undefined, borderColor: resource.color }}
                          onClick={() => toggleResourceFilter(resource.id)}>
                          {resource.name}
                        </Badge>
                      ))}
                      {resources.length > 3 && (
                        <Popover>
                          <PopoverTrigger asChild><Button type="button" variant="secondary" size="sm" className="h-6 px-2 rounded-full">+{resources.length - 3}</Button></PopoverTrigger>
                          <PopoverContent className="w-56 p-2 z-50" align="start" sideOffset={5}>
                            <div className="space-y-2">
                              <p className="text-sm font-medium px-2 py-1">{t('scheduling.resources')}</p>
                              {resources.map(resource => (
                                <div key={resource.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer" onClick={() => toggleResourceFilter(resource.id)}>
                                  <Checkbox checked={selectedResourceIds.includes(resource.id)} />
                                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: resource.color }} />
                                  <span className="text-sm truncate">{resource.name}</span>
                                </div>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                      {selectedResourceIds.length > 0 && <Button variant="ghost" size="sm" onClick={() => setSelectedResourceIds([])}>{t('scheduling.clear')}</Button>}
                    </div>
                  )}
                  {scheduleScope === 'mine' && <div className="flex items-center gap-2"><Badge variant="secondary">{t('scheduling.scopeMine') || 'Só os meus'}</Badge></div>}
                </div>
              </CardContent>
            </Card>
            <Card className="min-h-[600px]">
              <CardContent className="p-4">
                <ScheduleCalendarView items={items} boards={boards} currentDate={currentDate} onDateChange={setCurrentDate}
                  onItemClick={handleItemClick} onItemDrop={handleItemDrop} onAddClick={handleAddClick} viewMode={viewMode}
                  settings={settings} holidays={holidays} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="boards" className="space-y-4">
            <ScheduleBoardsTab
              boards={boards}
              companyId={activeCompany?.id}
              resources={resources}
              currentUserId={currentUserId}
              scheduleScope={scheduleScope}
              viewScope={isSuperAdmin ? 'ORG' : schedulingScope}
              actionScope={isSuperAdmin ? 'ORG' : schedulingEditScope}
              teamMemberIds={teamMemberIds}
              onConfirmItems={async (ids) => {
                if (!ids || ids.length === 0) return 0;
                let ok = 0;
                for (const id of ids) {
                  if (await updateItem(id, { status: 'confirmed' })) ok++;
                }
                return ok;
              }}
              onEditBoard={(board) => { setSelectedBoard(board); setBoardDialogOpen(true); }}
              onNewBoard={() => { setSelectedBoard(null); setBoardDialogOpen(true); }}
              onDeleteBoard={(id) => setBoardToDelete(id)}
              onBoardClick={(board) => { setSelectedBoard(board); setBoardDialogOpen(true); }}
            />
          </TabsContent>

          <TabsContent value="resources" className="space-y-4">
            <div className="flex justify-end">
              <PermissionGate permission="scheduling.create"><Button onClick={() => { setSelectedResource(null); setResourceDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />{t('scheduling.newResource')}</Button></PermissionGate>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {resources.map(resource => (
                <Card key={resource.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSelectedResource(resource); setResourceDialogOpen(true); }}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: resource.color }} />
                        <CardTitle className="text-lg">{resource.name}</CardTitle>
                      </div>
                      {hasPermission('scheduling.delete') && (
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive shrink-0" onClick={(e) => { e.stopPropagation(); setResourceToDelete(resource.id); }}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">
                        {resource.resource_type === 'user' && t('scheduling.resourceType.user')}
                        {resource.resource_type === 'equipment' && t('scheduling.resourceType.equipment')}
                        {resource.resource_type === 'room' && t('scheduling.resourceType.room')}
                        {resource.resource_type === 'vehicle' && t('scheduling.resourceType.vehicle')}
                        {(resource.resource_type as string) === 'tool' && (t('scheduling.resourceType.tool') || 'Ferramenta')}
                        {(resource.resource_type as string) === 'other' && (t('scheduling.resourceType.other') || 'Outro')}
                      </Badge>
                      <Badge variant="secondary">{resource.max_daily_capacity}h{t('scheduling.perDay')}</Badge>
                    </div>
                    {resource.user?.name ? (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Users className="h-3 w-3" />
                        <span>{resource.user.name}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 italic">
                        <Users className="h-3 w-3" />
                        <span>Sem utilizador associado</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {resources.length === 0 && (
                <Card className="col-span-full p-8 text-center">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">{t('scheduling.noResources')}</h3>
                  <p className="text-muted-foreground mb-4">{t('scheduling.createResourcesPrompt')}</p>
                  <PermissionGate permission="scheduling.create"><Button onClick={() => { setSelectedResource(null); setResourceDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />{t('scheduling.createResource')}</Button></PermissionGate>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="rules" className="space-y-4">
            <AutoScheduleRulesTab companyId={activeCompany?.id} boards={boards} resources={resources} />
          </TabsContent>
        </Tabs>
      </div>

      <ScheduleItemDialog open={itemDialogOpen} onOpenChange={setItemDialogOpen} item={selectedItem} boards={boards} resources={resources}
        contacts={contacts} employees={employees} companyUsers={users} currentUserId={currentUserId} currentEmployeeId={undefined}
        defaultDate={defaultDate} companyId={activeCompany?.id} onSave={handleSaveItem} onDelete={handleDeleteItem} />
      <ScheduleBoardDialog open={boardDialogOpen} onOpenChange={setBoardDialogOpen} board={selectedBoard} onSave={handleSaveBoard} />
      <ScheduleResourceDialog open={resourceDialogOpen} onOpenChange={setResourceDialogOpen} resource={selectedResource} employees={employees} users={users} onSave={handleSaveResource} />
      <ScheduleSettingsDialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen} companyId={activeCompany?.id} />

      <AlertDialog open={!!boardToDelete} onOpenChange={(open) => !open && setBoardToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('scheduling.board.deleteConfirmTitle')}</AlertDialogTitle><AlertDialogDescription>{t('scheduling.board.deleteConfirmMessage')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (boardToDelete) handleDeleteBoard(boardToDelete); setBoardToDelete(null); }} className="bg-primary text-primary-foreground hover:bg-primary/90">{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!resourceToDelete} onOpenChange={(open) => !open && setResourceToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('scheduling.resource.deleteConfirmTitle')}</AlertDialogTitle><AlertDialogDescription>{t('scheduling.resource.deleteConfirmMessage')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (resourceToDelete) handleDeleteResource(resourceToDelete); setResourceToDelete(null); }} className="bg-primary text-primary-foreground hover:bg-primary/90">{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
