import { useState, useRef, useEffect, useCallback } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Building2, User, Loader2 } from 'lucide-react';
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { supabase } from '@/integrations/supabase/client';
import { searchEntityIds } from '@/lib/clientSearch';
import { useTranslation } from '@/hooks/useTranslation';

interface Client {
  id: string;
  entity_id: string;
  display_name: string;
  entity_type?: string;
}

interface ClientMentionInputProps {
  selectedClientId: string;
  onClientSelect: (clientId: string) => void;
  placeholder?: string;
  organizationId?: string;
  disabled?: boolean;
}

export function ClientMentionInput({
  selectedClientId,
  onClientSelect,
  placeholder,
  organizationId,
  disabled = false,
}: ClientMentionInputProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [showPopover, setShowPopover] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getClientDisplayName = (client: Client) => {
    return client.display_name || 'N/A';
  };

  // Load selected client on mount if there's a selectedClientId
  useEffect(() => {
    const loadSelectedClient = async () => {
      if (selectedClientId) {
        const { data } = await supabase
          .from('anew_clients')
          .select('id, entity_id, entity:anew_entities!anew_clients_entity_id_fkey(display_name, type)')
          .eq('id', selectedClientId)
          .single();
        
        if (data) {
          const entity = data.entity as any;
          setSelectedClient({
            id: data.id,
            entity_id: data.entity_id,
            display_name: entity?.display_name || 'N/A',
            entity_type: entity?.type,
          });
        }
      } else {
        setSelectedClient(null);
      }
    };

    loadSelectedClient();
  }, [selectedClientId]);

  // Search clients on-demand
  const searchClients = useCallback(async (query: string) => {
    if (query.length < 1) {
      setClients([]);
      return;
    }

    setIsLoading(true);
    try {
      // First find matching entity IDs by name/email/phone/NIF
      const { ids: matchedIds } = await searchEntityIds(query);
      if (matchedIds.length === 0) { setClients([]); return; }
      const { data: matchingEntities, error: entityError } = await supabase
        .from('anew_entities')
        .select('id, display_name, type')
        .in('id', matchedIds)
        .limit(20);

      if (entityError || !matchingEntities || matchingEntities.length === 0) {
        setClients([]);
        return;
      }

      const entityIds = matchingEntities.map(e => e.id);

      let clientQuery = supabase
        .from('anew_clients')
        .select('id, entity_id')
        .in('entity_id', entityIds)
        .limit(10);

      if (organizationId) {
        clientQuery = clientQuery.eq('organization_id', organizationId);
      }

      const { data, error } = await clientQuery;

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
        setClients(mapped);
      }
    } catch (error) {
      console.error('Error searching clients:', error);
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
        searchClients(searchQuery);
      }, 300);
    } else {
      setClients([]);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, searchClients]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Check for @ trigger
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

  const handleClientSelect = useCallback((clientId: string) => {
    const client = clients.find((item) => item.id === clientId) || null;
    onClientSelect(clientId);
    setSelectedClient(client);
    setInputValue('');
    setSearchQuery('');
    setShowPopover(false);
  }, [clients, onClientSelect]);

  const handleRemoveClient = () => {
    onClientSelect('');
    setSelectedClient(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowPopover(false);
      setSearchQuery('');
    }
  };

  if (selectedClient) {
    return (
      <div className="flex items-center gap-2 p-2 border rounded-md bg-background">
        <Badge variant="secondary" className="flex items-center gap-2 py-1.5 px-3">
          {selectedClient.entity_type === 'company' ? (
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <User className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span>{getClientDisplayName(selectedClient)}</span>
          {!disabled && (
            <X
              className="h-3.5 w-3.5 cursor-pointer hover:text-destructive transition-colors"
              onClick={handleRemoveClient}
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
        placeholder={placeholder || t('scheduling.item.clientPlaceholder')}
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
            placeholder={placeholder || t('scheduling.item.clientPlaceholder')}
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
            placeholder={t('scheduling.client.searchPlaceholder')} 
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
                {t('scheduling.client.typeToSearch')}
              </div>
            ) : clients.length === 0 ? (
              <CommandEmpty>{t('scheduling.client.noResults')}</CommandEmpty>
            ) : (
              <CommandGroup heading={t('scheduling.client.heading')}>
                {clients.map(client => (
                  <CommandItem
                    key={client.id}
                    value={getClientDisplayName(client)}
                    onSelect={() => handleClientSelect(client.id)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    {client.entity_type === 'company' ? (
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <User className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{getClientDisplayName(client)}</span>
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
