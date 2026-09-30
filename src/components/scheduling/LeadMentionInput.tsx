import { useState, useRef, useEffect, useCallback } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Building2, User } from 'lucide-react';
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { supabase } from '@/integrations/supabase/client';
import { searchEntityIds } from '@/lib/clientSearch';
import { useTranslation } from '@/hooks/useTranslation';

interface LeadOption {
  id: string;
  entity_id: string;
  display_name: string;
  entity_type?: string;
}

interface LeadMentionInputProps {
  selectedLeadId: string;
  onLeadSelect: (leadId: string) => void;
  placeholder?: string;
  organizationId?: string;
  disabled?: boolean;
}

export function LeadMentionInput({
  selectedLeadId,
  onLeadSelect,
  placeholder,
  organizationId,
  disabled = false,
}: LeadMentionInputProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [showPopover, setShowPopover] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getLeadDisplayName = (lead: LeadOption) => {
    return lead.display_name || 'N/A';
  };

  // Load selected lead on mount
  useEffect(() => {
    const loadSelectedLead = async () => {
      if (selectedLeadId) {
        const { data } = await supabase
          .from('anew_leads')
          .select('id, entity_id, entity:anew_entities!anew_leads_entity_id_fkey(display_name, type)')
          .eq('id', selectedLeadId)
          .single();

        if (data) {
          const entity = data.entity as any;
          setSelectedLead({
            id: data.id,
            entity_id: data.entity_id,
            display_name: entity?.display_name || 'N/A',
            entity_type: entity?.type,
          });
        }
      } else {
        setSelectedLead(null);
      }
    };

    loadSelectedLead();
  }, [selectedLeadId]);

  // Search leads on-demand
  const searchLeads = useCallback(async (query: string) => {
    if (query.length < 1) {
      setLeads([]);
      return;
    }

    setIsLoading(true);
    try {
      const { ids: matchedIds } = await searchEntityIds(query);
      if (matchedIds.length === 0) { setLeads([]); return; }
      const { data: matchingEntities, error: entityError } = await supabase
        .from('anew_entities')
        .select('id, display_name, type')
        .in('id', matchedIds)
        .limit(20);

      if (entityError || !matchingEntities || matchingEntities.length === 0) {
        setLeads([]);
        return;
      }

      const entityIds = matchingEntities.map(e => e.id);

      // Only leads that have progressed enough to be scheduling-relevant
      // (qualified or in negotiation) can be mentioned in appointments.
      let leadQuery = supabase
        .from('anew_leads')
        .select('id, entity_id')
        .in('entity_id', entityIds)
        .in('status', ['qualified', 'negotiation'])
        .is('deleted_at', null)
        .limit(10);

      if (organizationId) {
        leadQuery = leadQuery.eq('organization_id', organizationId);
      }

      const { data, error } = await leadQuery;

      if (!error && data) {
        const entityMap = new Map(matchingEntities.map(e => [e.id, e]));
        const mapped = data.map((d: any) => {
          const entity = entityMap.get(d.entity_id);
          return {
            id: d.id,
            entity_id: d.entity_id,
            display_name: entity?.display_name || 'N/A',
            entity_type: entity?.type,
          };
        });
        setLeads(mapped);
      }
    } catch (error) {
      console.error('Error searching leads:', error);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (searchQuery.length >= 1) {
      debounceRef.current = setTimeout(() => {
        searchLeads(searchQuery);
      }, 300);
    } else {
      setLeads([]);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, searchLeads]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    const atIndex = value.lastIndexOf('@');
    if (atIndex !== -1) {
      const afterAt = value.substring(atIndex + 1);
      setSearchQuery(afterAt);
      setShowPopover(true);
    } else {
      setShowPopover(false);
      setSearchQuery('');
    }
  };

  const handleLeadSelect = useCallback((leadId: string) => {
    const lead = leads.find((item) => item.id === leadId) || null;
    onLeadSelect(leadId);
    setSelectedLead(lead);
    setInputValue('');
    setSearchQuery('');
    setShowPopover(false);
  }, [leads, onLeadSelect]);

  const handleRemoveLead = () => {
    onLeadSelect('');
    setSelectedLead(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowPopover(false);
      setSearchQuery('');
    }
  };

  if (selectedLead) {
    return (
      <div className="flex items-center gap-2 p-2 border rounded-md bg-background">
        <Badge variant="secondary" className="flex items-center gap-2 py-1.5 px-3">
          {selectedLead.entity_type === 'company' ? (
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <User className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span>{getLeadDisplayName(selectedLead)}</span>
          {!disabled && (
            <X
              className="h-3.5 w-3.5 cursor-pointer hover:text-destructive transition-colors"
              onClick={handleRemoveLead}
            />
          )}
        </Badge>
      </div>
    );
  }

  if (disabled) {
    return (
      <Input
        value=""
        disabled
        placeholder={placeholder || t('scheduling.item.selectContact')}
        className="w-full"
      />
    );
  }

  return (
    <Popover open={showPopover} onOpenChange={setShowPopover}>
      <PopoverAnchor asChild>
        <div ref={inputRef} className="relative">
          <Input
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || t('scheduling.item.selectContact')}
            className="w-full"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            @
          </span>
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0 z-[620]"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('scheduling.contact.searchPlaceholder') || 'Pesquisar lead...'}
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="h-9"
          />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <OlyviaLoader size={20} inline />
              </div>
            ) : searchQuery.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {t('scheduling.contact.typeToSearch') || 'Escreva @ para pesquisar...'}
              </div>
            ) : leads.length === 0 ? (
              <CommandEmpty>{t('scheduling.contact.noResults') || 'Nenhuma lead encontrada'}</CommandEmpty>
            ) : (
              <CommandGroup heading={t('scheduling.contact.heading') || 'Leads'}>
                {leads.map(lead => (
                  <CommandItem
                    key={lead.id}
                    value={getLeadDisplayName(lead)}
                    onSelect={() => handleLeadSelect(lead.id)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    {lead.entity_type === 'company' ? (
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <User className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{getLeadDisplayName(lead)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
