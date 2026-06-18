import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, ListPlus, Trash2, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";

interface ClientListsDialogProps {
  client: { id: string; company_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MarketingList {
  id: string;
  name: string;
}

interface ClientList {
  id: string;
  list_id: string;
  marketing_lists: { name: string } | null;
}

export const ClientListsDialog = ({ client, open, onOpenChange }: ClientListsDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [clientLists, setClientLists] = useState<ClientList[]>([]);
  const [availableLists, setAvailableLists] = useState<MarketingList[]>([]);
  const [selectedNewListIds, setSelectedNewListIds] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany, userType } = useCompany();

  useEffect(() => {
    if (open && client) {
      loadClientLists();
      loadAvailableLists();
      setSelectedNewListIds(new Set());
      setShowAddForm(false);
    }
  }, [open, client, activeCompany]);

  if (!client) return null;

  const clientName = client.company_name || `${client.first_name} ${client.last_name}`;

  const loadClientLists = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("client_marketing_lists")
        .select("id, list_id, marketing_lists:list_id(name)")
        .eq("client_id", client.id);
      
      if (error) throw error;
      setClientLists(data || []);
    } catch (error: any) {
      console.error("Error loading client lists:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableLists = async () => {
    try {
      // System Admin sees all lists
      if (userType === 'system_admin') {
        const { data, error } = await supabase
          .from("marketing_lists")
          .select("id, name")
          .order("name");
        
        if (error) throw error;
        setAvailableLists(data || []);
        return;
      }

      // Other users see only lists associated with their accessible companies
      if (!activeCompany?.id) {
        setAvailableLists([]);
        return;
      }

      // Get lists linked to the active company via marketing_list_companies
      const { data, error } = await supabase
        .from("marketing_list_companies")
        .select("marketing_lists!inner(id, name)")
        .eq("company_id", activeCompany.id);
      
      if (error) throw error;
      
      const lists = (data || [])
        .map(item => item.marketing_lists)
        .filter((list): list is MarketingList => list !== null)
        .sort((a, b) => a.name.localeCompare(b.name));
      
      setAvailableLists(lists);
    } catch (error: any) {
      console.error("Error loading available lists:", error);
    }
  };

  const handleAddToLists = async () => {
    if (selectedNewListIds.size === 0) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const insertData = Array.from(selectedNewListIds).map(listId => ({
        client_id: client.id,
        list_id: listId,
        created_by: user.id,
      }));

      const { error } = await supabase
        .from("client_marketing_lists")
        .upsert(insertData, { onConflict: 'client_id,list_id' });

      if (error) throw error;

      toast({ title: t('clientLists.toast.listsAdded') });
      setSelectedNewListIds(new Set());
      setShowAddForm(false);
      loadClientLists();
    } catch (error: any) {
      toast({
        title: t('clientLists.toast.addError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRemoveFromList = async (associationId: string) => {
    try {
      const { error } = await supabase
        .from("client_marketing_lists")
        .delete()
        .eq("id", associationId);

      if (error) throw error;

      toast({ title: t('clientLists.toast.listRemoved') });
      loadClientLists();
    } catch (error: any) {
      toast({
        title: t('clientLists.toast.removeError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getListsNotYetAdded = () => {
    const addedListIds = new Set(clientLists.map(cl => cl.list_id));
    return availableLists.filter(list => !addedListIds.has(list.id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListPlus className="w-5 h-5" />
            {t('clientLists.title', { name: clientName })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!showAddForm ? (
            <>
              <Button onClick={() => setShowAddForm(true)} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                {t('clientLists.addToLists')}
              </Button>

              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : clientLists.length === 0 ? (
                <div className="text-center py-8">
                  <ListPlus className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">{t('clientLists.notAssociated')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {clientLists.map((cl) => (
                    <Card key={cl.id}>
                      <CardContent className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-2">
                          <ListPlus className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{cl.marketing_lists?.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveFromList(cl.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('clientLists.addToListsHeader')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {getListsNotYetAdded().length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">{t('clientLists.allListsAdded')}</p>
                ) : (
                  <ScrollArea className="h-[200px] pr-4">
                    <div className="space-y-2">
                      {getListsNotYetAdded().map((list) => (
                        <div key={list.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`client-list-${list.id}`}
                            checked={selectedNewListIds.has(list.id)}
                            onCheckedChange={(checked) => {
                              const newSet = new Set(selectedNewListIds);
                              if (checked) {
                                newSet.add(list.id);
                              } else {
                                newSet.delete(list.id);
                              }
                              setSelectedNewListIds(newSet);
                            }}
                          />
                          <label htmlFor={`client-list-${list.id}`} className="text-sm cursor-pointer">
                            {list.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => {
                    setShowAddForm(false);
                    setSelectedNewListIds(new Set());
                  }}>
                    {t('clientLists.cancel')}
                  </Button>
                  <Button 
                    onClick={handleAddToLists} 
                    disabled={selectedNewListIds.size === 0}
                  >
                    {t('clientLists.add')} ({selectedNewListIds.size})
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
