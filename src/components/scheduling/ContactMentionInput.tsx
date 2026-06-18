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

interface Contact {
  id: string;
  entity_id: string;
  display_name: string;
  entity_type?: string;
}

interface ContactMentionInputProps {
  selectedContactId: string;
  onContactSelect: (contactId: string) => void;
  placeholder?: string;
  organizationId?: string;
  disabled?: boolean;
}

export function ContactMentionInput({
  selectedContactId,
  onContactSelect,
  placeholder,
  organizationId,
  disabled = false,
}: ContactMentionInputProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [showPopover, setShowPopover] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getContactDisplayName = (contact: Contact) => {
    return contact.display_name || 'N/A';
  };

  // Load selected contact on mount
  useEffect(() => {
    const loadSelectedContact = async () => {
      if (selectedContactId) {
        const { data } = await supabase
          .from('anew_contacts')
          .select('id, entity_id, entity:anew_entities!anew_contacts_entity_id_fkey(display_name, type)')
          .eq('id', selectedContactId)
          .single();

        if (data) {
          const entity = data.entity as any;
          setSelectedContact({
            id: data.id,
            entity_id: data.entity_id,
            display_name: entity?.display_name || 'N/A',
            entity_type: entity?.type,
          });
        }
      } else {
        setSelectedContact(null);
      }
    };

    loadSelectedContact();
  }, [selectedContactId]);

  // Search contacts on-demand
  const searchContacts = useCallback(async (query: string) => {
    if (query.length < 1) {
      setContacts([]);
      return;
    }

    setIsLoading(true);
    try {
      const { ids: matchedIds } = await searchEntityIds(query);
      if (matchedIds.length === 0) { setContacts([]); return; }
      const { data: matchingEntities, error: entityError } = await supabase
        .from('anew_entities')
        .select('id, display_name, type')
        .in('id', matchedIds)
        .limit(20);

      if (entityError || !matchingEntities || matchingEntities.length === 0) {
        setContacts([]);
        return;
      }

      const entityIds = matchingEntities.map(e => e.id);

      let contactQuery = supabase
        .from('anew_contacts')
        .select('id, entity_id')
        .in('entity_id', entityIds)
        .limit(10);

      if (organizationId) {
        contactQuery = contactQuery.eq('organization_id', organizationId);
      }

      const { data, error } = await contactQuery;

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
        setContacts(mapped);
      }
    } catch (error) {
      console.error('Error searching contacts:', error);
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
        searchContacts(searchQuery);
      }, 300);
    } else {
      setContacts([]);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, searchContacts]);

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

  const handleContactSelect = useCallback((contactId: string) => {
    const contact = contacts.find((item) => item.id === contactId) || null;
    onContactSelect(contactId);
    setSelectedContact(contact);
    setInputValue('');
    setSearchQuery('');
    setShowPopover(false);
  }, [contacts, onContactSelect]);

  const handleRemoveContact = () => {
    onContactSelect('');
    setSelectedContact(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowPopover(false);
      setSearchQuery('');
    }
  };

  if (selectedContact) {
    return (
      <div className="flex items-center gap-2 p-2 border rounded-md bg-background">
        <Badge variant="secondary" className="flex items-center gap-2 py-1.5 px-3">
          {selectedContact.entity_type === 'company' ? (
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <User className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span>{getContactDisplayName(selectedContact)}</span>
          {!disabled && (
            <X
              className="h-3.5 w-3.5 cursor-pointer hover:text-destructive transition-colors"
              onClick={handleRemoveContact}
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
            placeholder={t('scheduling.contact.searchPlaceholder') || 'Pesquisar contacto...'}
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
            ) : contacts.length === 0 ? (
              <CommandEmpty>{t('scheduling.contact.noResults') || 'Nenhum contacto encontrado'}</CommandEmpty>
            ) : (
              <CommandGroup heading={t('scheduling.contact.heading') || 'Contactos'}>
                {contacts.map(contact => (
                  <CommandItem
                    key={contact.id}
                    value={getContactDisplayName(contact)}
                    onSelect={() => handleContactSelect(contact.id)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    {contact.entity_type === 'company' ? (
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <User className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{getContactDisplayName(contact)}</span>
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
