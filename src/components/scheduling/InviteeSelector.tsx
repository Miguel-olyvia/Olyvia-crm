import { useState, useEffect } from 'react';
import { Check, Users, Building2, Briefcase, User, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useScheduleInvitations, InviteeOption } from '@/hooks/useScheduleInvitations';
import { useTranslation } from '@/hooks/useTranslation';

interface InviteeSelectorProps {
  companyId?: string;
  selectedInvitees: Array<{ type: string; id: string; name: string }>;
  onSelectionChange: (invitees: Array<{ type: string; id: string; name: string }>) => void;
}

export function InviteeSelector({ companyId, selectedInvitees, onSelectionChange }: InviteeSelectorProps) {
  const { t } = useTranslation();
  const { fetchInviteOptions, loading } = useScheduleInvitations(companyId);
  const [options, setOptions] = useState<{
    users: InviteeOption[];
    groups: InviteeOption[];
    companies: InviteeOption[];
    businessUnits: InviteeOption[];
    businessAreas: InviteeOption[];
  }>({ users: [], groups: [], companies: [], businessUnits: [], businessAreas: [] });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchInviteOptions().then(setOptions);
  }, [fetchInviteOptions]);

  const isSelected = (type: string, id: string) => {
    return selectedInvitees.some(i => i.type === type && i.id === id);
  };

  const toggleSelection = (option: InviteeOption) => {
    if (isSelected(option.type, option.id)) {
      onSelectionChange(selectedInvitees.filter(i => !(i.type === option.type && i.id === option.id)));
    } else {
      onSelectionChange([...selectedInvitees, { type: option.type, id: option.id, name: option.name }]);
    }
  };

  const removeInvitee = (type: string, id: string) => {
    onSelectionChange(selectedInvitees.filter(i => !(i.type === type && i.id === id)));
  };

  const filterOptions = (items: InviteeOption[]) => {
    if (!searchTerm) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(item => 
      item.name.toLowerCase().includes(term) || 
      item.subtext?.toLowerCase().includes(term)
    );
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'user': return <User className="w-4 h-4" />;
      case 'user_group': return <Users className="w-4 h-4" />;
      case 'company': return <Building2 className="w-4 h-4" />;
      case 'business_unit': return <Briefcase className="w-4 h-4" />;
      case 'business_area': return <Briefcase className="w-4 h-4" />;
      default: return null;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'user': return t('scheduling.invitees.user');
      case 'user_group': return t('scheduling.invitees.group');
      case 'company': return t('scheduling.invitees.company');
      case 'business_unit': return t('scheduling.invitees.unit');
      case 'business_area': return t('scheduling.invitees.area');
      default: return type;
    }
  };

  const renderOptionsList = (items: InviteeOption[]) => {
    const filtered = filterOptions(items);
    if (filtered.length === 0) {
      return <p className="text-sm text-muted-foreground p-4 text-center">{t('scheduling.invitees.noResults')}</p>;
    }

    return (
      <div className="space-y-1">
        {filtered.map(option => (
          <button
            key={`${option.type}-${option.id}`}
            type="button"
            className={`w-full flex items-center gap-3 p-2 rounded-md text-left hover:bg-accent transition-colors ${
              isSelected(option.type, option.id) ? 'bg-accent' : ''
            }`}
            onClick={() => toggleSelection(option)}
          >
            <div className="flex-shrink-0 text-muted-foreground">
              {getTypeIcon(option.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{option.name}</p>
              {option.subtext && (
                <p className="text-xs text-muted-foreground truncate">{option.subtext}</p>
              )}
            </div>
            {isSelected(option.type, option.id) && (
              <Check className="w-4 h-4 text-primary flex-shrink-0" />
            )}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Selected invitees */}
      {selectedInvitees.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-muted/50">
          {selectedInvitees.map(invitee => (
            <Badge
              key={`${invitee.type}-${invitee.id}`}
              variant="secondary"
              className="flex items-center gap-1 pr-1"
            >
              {getTypeIcon(invitee.type)}
              <span className="max-w-[150px] truncate">{invitee.name}</span>
              <span className="text-xs text-muted-foreground">({getTypeLabel(invitee.type)})</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-4 w-4 ml-1 hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => removeInvitee(invitee.type, invitee.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('scheduling.invitees.search')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabs for different types */}
      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="users" className="text-xs">
            <User className="w-3 h-3 mr-1" />
            {t('scheduling.invitees.users')}
          </TabsTrigger>
          <TabsTrigger value="groups" className="text-xs">
            <Users className="w-3 h-3 mr-1" />
            {t('scheduling.invitees.groups')}
          </TabsTrigger>
          <TabsTrigger value="companies" className="text-xs">
            <Building2 className="w-3 h-3 mr-1" />
            {t('scheduling.invitees.companies')}
          </TabsTrigger>
          <TabsTrigger value="units" className="text-xs">
            <Briefcase className="w-3 h-3 mr-1" />
            {t('scheduling.invitees.units')}
          </TabsTrigger>
          <TabsTrigger value="areas" className="text-xs">
            <Briefcase className="w-3 h-3 mr-1" />
            {t('scheduling.invitees.areas')}
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="h-[200px] mt-2 border rounded-md p-2">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">{t('scheduling.invitees.loading')}</p>
            </div>
          ) : (
            <>
              <TabsContent value="users" className="m-0">
                {renderOptionsList(options.users)}
              </TabsContent>
              <TabsContent value="groups" className="m-0">
                {renderOptionsList(options.groups)}
              </TabsContent>
              <TabsContent value="companies" className="m-0">
                {renderOptionsList(options.companies)}
              </TabsContent>
              <TabsContent value="units" className="m-0">
                {renderOptionsList(options.businessUnits)}
              </TabsContent>
              <TabsContent value="areas" className="m-0">
                {renderOptionsList(options.businessAreas)}
              </TabsContent>
            </>
          )}
        </ScrollArea>
      </Tabs>
    </div>
  );
}
