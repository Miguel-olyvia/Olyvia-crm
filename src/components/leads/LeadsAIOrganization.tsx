import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, 
  MapPin, 
  Clock, 
  TrendingUp,
  X,
  ChevronRight,
  Settings,
  Lightbulb,
  Phone,
  Calendar
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Lead {
  id: string;
  name: string;
  postal_code?: string;
  city?: string;
  district?: string;
  last_contacted_at?: string;
  callback_scheduled_at?: string;
  status?: string;
  created_at?: string;
  value?: number;
}

interface AIConfig {
  days_without_contact_alert: number;
  days_without_contact_enabled: boolean;
  group_by_location_enabled: boolean;
  min_leads_for_location_group: number;
  callback_reminder_enabled: boolean;
  priority_leads_enabled: boolean;
  new_leads_alert_enabled: boolean;
  new_leads_check_hours: number;
  follow_up_reminder_enabled: boolean;
  follow_up_days: number;
}

interface AISuggestion {
  id: string;
  type: 'location_group' | 'no_contact' | 'callback' | 'new_leads' | 'follow_up' | 'priority';
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  leads: Lead[];
  action?: string;
}

interface LeadsAIOrganizationProps {
  leads: Lead[];
  onSelectLeads: (leadIds: string[]) => void;
  onOpenConfig: () => void;
  companyId?: string;
}

const defaultConfig: AIConfig = {
  days_without_contact_alert: 7,
  days_without_contact_enabled: true,
  group_by_location_enabled: true,
  min_leads_for_location_group: 3,
  callback_reminder_enabled: true,
  priority_leads_enabled: true,
  new_leads_alert_enabled: true,
  new_leads_check_hours: 24,
  follow_up_reminder_enabled: true,
  follow_up_days: 3
};

export const LeadsAIOrganization: React.FC<LeadsAIOrganizationProps> = ({
  leads,
  onSelectLeads,
  onOpenConfig,
  companyId
}) => {
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<string[]>([]);
  const [config, setConfig] = useState<AIConfig>(defaultConfig);
  const [isMinimized, setIsMinimized] = useState(false);
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, [companyId]);

  useEffect(() => {
    if (leads.length > 0) {
      generateSuggestions();
    }
  }, [leads, config]);

  const loadConfig = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('leads_ai_config')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setConfig({
          days_without_contact_alert: data.days_without_contact_alert ?? 7,
          days_without_contact_enabled: data.days_without_contact_enabled ?? true,
          group_by_location_enabled: data.group_by_location_enabled ?? true,
          min_leads_for_location_group: data.min_leads_for_location_group ?? 3,
          callback_reminder_enabled: data.callback_reminder_enabled ?? true,
          priority_leads_enabled: data.priority_leads_enabled ?? true,
          new_leads_alert_enabled: data.new_leads_alert_enabled ?? true,
          new_leads_check_hours: data.new_leads_check_hours ?? 24,
          follow_up_reminder_enabled: data.follow_up_reminder_enabled ?? true,
          follow_up_days: data.follow_up_days ?? 3
        });
      }
    } catch (error) {
      console.error('Error loading AI config:', error);
    }
  };

  const generateSuggestions = () => {
    const newSuggestions: AISuggestion[] = [];
    const now = new Date();

    // 1. Group by location (postal code prefix)
    if (config.group_by_location_enabled) {
      const locationGroups: Record<string, Lead[]> = {};
      
      leads.forEach(lead => {
        const location = lead.postal_code?.substring(0, 4) || lead.city || lead.district;
        if (location) {
          if (!locationGroups[location]) {
            locationGroups[location] = [];
          }
          locationGroups[location].push(lead);
        }
      });

      Object.entries(locationGroups).forEach(([location, groupLeads]) => {
        if (groupLeads.length >= config.min_leads_for_location_group) {
          newSuggestions.push({
            id: `location-${location}`,
            type: 'location_group',
            title: `${groupLeads.length} leads na zona ${location}`,
            description: `Agrupe estas visitas para otimizar deslocações. Leads: ${groupLeads.slice(0, 3).map(l => l.name).join(', ')}${groupLeads.length > 3 ? '...' : ''}`,
            icon: <MapPin className="h-4 w-4" />,
            color: 'bg-blue-500/10 text-blue-600 border-blue-200',
            leads: groupLeads,
            action: 'Agrupar visitas'
          });
        }
      });
    }

    // 2. Leads without contact for X days
    if (config.days_without_contact_enabled) {
      const oldLeads = leads.filter(lead => {
        // Skip leads that already have a visit scheduled or are converted
        if (lead.status === 'visit_scheduled' || lead.status === 'converted' || lead.status === 'contacted') return false;

        if (!lead.last_contacted_at) {
          const createdAt = new Date(lead.created_at || now);
          const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
          return daysSinceCreation >= config.days_without_contact_alert;
        }
        const lastContact = new Date(lead.last_contacted_at);
        const daysSinceContact = Math.floor((now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24));
        return daysSinceContact >= config.days_without_contact_alert;
      });

      if (oldLeads.length > 0) {
        newSuggestions.push({
          id: 'no-contact',
          type: 'no_contact',
          title: `${oldLeads.length} leads sem contacto há +${config.days_without_contact_alert} dias`,
          description: `Estas leads precisam de atenção urgente. Considere contactá-las hoje.`,
          icon: <Clock className="h-4 w-4" />,
          color: 'bg-orange-500/10 text-orange-600 border-orange-200',
          leads: oldLeads,
          action: 'Contactar agora'
        });
      }
    }

    // 3. Callbacks scheduled
    if (config.callback_reminder_enabled) {
      const todayCallbacks = leads.filter(lead => {
        if (!lead.callback_scheduled_at) return false;
        const callbackDate = new Date(lead.callback_scheduled_at);
        return callbackDate.toDateString() === now.toDateString();
      });

      if (todayCallbacks.length > 0) {
        newSuggestions.push({
          id: 'callbacks',
          type: 'callback',
          title: `${todayCallbacks.length} callbacks para hoje`,
          description: `Tem chamadas agendadas para retornar hoje. Não se esqueça!`,
          icon: <Phone className="h-4 w-4" />,
          color: 'bg-purple-500/10 text-purple-600 border-purple-200',
          leads: todayCallbacks,
          action: 'Ver callbacks'
        });
      }
    }

    // 4. New leads in last X hours
    if (config.new_leads_alert_enabled) {
      const newLeads = leads.filter(lead => {
        const createdAt = new Date(lead.created_at || now);
        const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        return hoursSinceCreation <= config.new_leads_check_hours && lead.status === 'new';
      });

      if (newLeads.length > 0) {
        newSuggestions.push({
          id: 'new-leads',
          type: 'new_leads',
          title: `${newLeads.length} novas leads nas últimas ${config.new_leads_check_hours}h`,
          description: `Leads recentes que ainda não foram contactadas. Aproveite enquanto estão "quentes"!`,
          icon: <TrendingUp className="h-4 w-4" />,
          color: 'bg-green-500/10 text-green-600 border-green-200',
          leads: newLeads,
          action: 'Priorizar contacto'
        });
      }
    }

    // 5. Follow-up needed
    if (config.follow_up_reminder_enabled) {
      const needFollowUp = leads.filter(lead => {
        if (lead.status !== 'contacted' && lead.status !== 'qualified') return false;
        if (!lead.last_contacted_at) return false;
        const lastContact = new Date(lead.last_contacted_at);
        const daysSinceContact = Math.floor((now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24));
        return daysSinceContact >= config.follow_up_days && daysSinceContact < config.days_without_contact_alert;
      });

      if (needFollowUp.length > 0) {
        newSuggestions.push({
          id: 'follow-up',
          type: 'follow_up',
          title: `${needFollowUp.length} leads precisam de follow-up`,
          description: `Leads contactadas há ${config.follow_up_days}+ dias que podem beneficiar de um novo contacto.`,
          icon: <Calendar className="h-4 w-4" />,
          color: 'bg-yellow-500/10 text-yellow-600 border-yellow-200',
          leads: needFollowUp,
          action: 'Fazer follow-up'
        });
      }
    }

    // Filter out dismissed suggestions
    const filteredSuggestions = newSuggestions.filter(s => !dismissedSuggestions.includes(s.id));
    setSuggestions(filteredSuggestions);
  };

  const handleDismiss = (suggestionId: string) => {
    setDismissedSuggestions(prev => [...prev, suggestionId]);
    setExpandedSuggestion(null);
  };

  const handleAction = (suggestion: AISuggestion) => {
    const leadIds = suggestion.leads.map(l => l.id);
    onSelectLeads(leadIds);
    // Dismiss this suggestion after action
    handleDismiss(suggestion.id);
  };

  const handleIgnore = (suggestionId: string) => {
    handleDismiss(suggestionId);
  };

  // Get current suggestion to display (first one)
  const currentSuggestion = suggestions[0];

  if (suggestions.length === 0) {
    return null;
  }

  if (isMinimized) {
    return (
      <div className="mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsMinimized(false)}
          className="gap-2"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          <span>{suggestions.length} sugestões AI</span>
          <Badge variant="secondary" className="ml-1">{suggestions.length}</Badge>
        </Button>
      </div>
    );
  }

  return (
    <Card className="mb-4 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <span className="font-medium text-sm">Organização AI</span>
            <Badge variant="secondary" className="text-xs">{suggestions.length} sugestões</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onOpenConfig}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsMinimized(true)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Show only current suggestion */}
        {currentSuggestion && (
          <div
            className={`rounded-lg border p-3 transition-all ${currentSuggestion.color} ${
              expandedSuggestion === currentSuggestion.id ? 'ring-2 ring-primary/20' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <div className="mt-0.5">{currentSuggestion.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{currentSuggestion.title}</span>
                    <Lightbulb className="h-3 w-3 opacity-50" />
                  </div>
                  {expandedSuggestion === currentSuggestion.id && (
                    <p className="text-xs opacity-80 mt-1">{currentSuggestion.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setExpandedSuggestion(
                    expandedSuggestion === currentSuggestion.id ? null : currentSuggestion.id
                  )}
                >
                  {expandedSuggestion === currentSuggestion.id ? 'Menos' : 'Mais'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleIgnore(currentSuggestion.id)}
                >
                  Ignorar
                </Button>
                {currentSuggestion.action && (
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleAction(currentSuggestion)}
                  >
                    {currentSuggestion.action}
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            
            {expandedSuggestion === currentSuggestion.id && currentSuggestion.leads.length > 0 && (
              <div className="mt-2 pt-2 border-t border-current/10">
                <div className="flex flex-wrap gap-1">
                  {currentSuggestion.leads.slice(0, 5).map(lead => (
                    <Badge key={lead.id} variant="outline" className="text-xs">
                      {lead.name}
                    </Badge>
                  ))}
                  {currentSuggestion.leads.length > 5 && (
                    <Badge variant="outline" className="text-xs">
                      +{currentSuggestion.leads.length - 5} mais
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Show remaining count if more than 1 */}
        {suggestions.length > 1 && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            +{suggestions.length - 1} mais sugestões a seguir
          </p>
        )}
      </CardContent>
    </Card>
  );
};
