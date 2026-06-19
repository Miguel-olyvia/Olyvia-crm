import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Radio, Mail, MessageSquare, Facebook, Instagram, Linkedin, Smartphone, Globe, Pencil, Trash2, Monitor, Bell, Video, Twitter, Youtube, Search, X } from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useSearchParams, useNavigate } from "react-router-dom";
import { PermissionGate } from "@/components/PermissionGate";
import { useTranslation } from "@/hooks/useTranslation";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Channel {
  id: string;
  campaign_id: string;
  name: string;
  type: string;
  description: string | null;
  is_active: boolean;
  campaigns: { name: string };
  metrics: any;
}

interface ChannelType {
  id: string;
  name: string;
  label: string;
  icon: string | null;
}

const Channels = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [channelTypes, setChannelTypes] = useState<ChannelType[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [channelToDelete, setChannelToDelete] = useState<Channel | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const campaignIdParam = searchParams.get("campaign");

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");

  const [formData, setFormData] = useState({
    campaign_id: campaignIdParam || "",
    name: "",
    type: "email",
    description: "",
    is_active: true,
  });

  const [editFormData, setEditFormData] = useState({
    campaign_id: "",
    name: "",
    type: "email",
    description: "",
    is_active: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [channelsRes, campaignsRes, channelTypesRes] = await Promise.all([
        supabase
          .from("channels")
          .select("*, campaigns(name)")
          .order("created_at", { ascending: false }),
        supabase.from("campaigns").select("id, name, status").order("name"),
        supabase.from("channel_types").select("*").eq("is_active", true).order("label"),
      ]);

      if (channelsRes.error) throw channelsRes.error;
      if (campaignsRes.error) throw campaignsRes.error;
      if (channelTypesRes.error) throw channelTypesRes.error;

      setChannels(channelsRes.data || []);
      setCampaigns(campaignsRes.data || []);
      setChannelTypes(channelTypesRes.data || []);

      if (campaignIdParam) {
        setFormData(prev => ({ ...prev, campaign_id: campaignIdParam }));
      }
    } catch (error: any) {
      toast({
        title: t('channels.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.campaign_id) {
      toast({
        title: t('channels.toast.validationError'),
        description: t('channels.toast.required'),
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      const { error } = await supabase.from("channels").insert({
        campaign_id: formData.campaign_id,
        name: formData.name,
        type: formData.type,
        description: formData.description || null,
        is_active: formData.is_active,
        created_by: businessUserId,
      });

      if (error) throw error;

      toast({
        title: t('channels.toast.createSuccess'),
      });

      setOpen(false);
      setFormData({
        campaign_id: campaignIdParam || "",
        name: "",
        type: "email",
        description: "",
        is_active: true,
      });
      loadData();
    } catch (error: any) {
      toast({
        title: t('channels.toast.createError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (channel: Channel) => {
    setEditingChannel(channel);
    setEditFormData({
      campaign_id: channel.campaign_id,
      name: channel.name,
      type: channel.type,
      description: channel.description || "",
      is_active: channel.is_active,
    });
    setEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChannel) return;

    if (!editFormData.name || !editFormData.campaign_id) {
      toast({
        title: t('channels.toast.validationError'),
        description: t('channels.toast.required'),
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("channels")
        .update({
          campaign_id: editFormData.campaign_id,
          name: editFormData.name,
          type: editFormData.type,
          description: editFormData.description || null,
          is_active: editFormData.is_active,
        })
        .eq("id", editingChannel.id);

      if (error) throw error;

      toast({
        title: t('channels.toast.updateSuccess'),
      });

      setEditOpen(false);
      setEditingChannel(null);
      loadData();
    } catch (error: any) {
      toast({
        title: t('channels.toast.updateError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (channel: Channel) => {
    setChannelToDelete(channel);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!channelToDelete) return;

    try {
      const { error } = await supabase
        .from("channels")
        .delete()
        .eq("id", channelToDelete.id);

      if (error) throw error;

      toast({
        title: t('channels.toast.deleteSuccess'),
      });

      loadData();
    } catch (error: any) {
      toast({
        title: t('channels.toast.deleteError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setChannelToDelete(null);
    }
  };

  const getChannelIcon = (type: string) => {
    const icons: Record<string, any> = {
      email: Mail,
      sms: MessageSquare,
      whatsapp: Smartphone,
      facebook: Facebook,
      instagram: Instagram,
      linkedin: Linkedin,
      google_ads: Globe,
      meta: Globe,
      tiktok: Video,
      youtube: Youtube,
      twitter: Twitter,
      display: Monitor,
      push: Bell,
    };
    return icons[type] || Radio;
  };

  // Filter logic
  const filteredChannels = channels.filter((channel) => {
    const matchesSearch = !searchQuery || 
      channel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      channel.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "active" ? channel.is_active : !channel.is_active);
    
    const matchesType = typeFilter === "all" || channel.type === typeFilter;
    
    const matchesCampaign = campaignFilter === "all" || 
      channel.campaign_id === campaignFilter;

    return matchesSearch && matchesStatus && matchesType && matchesCampaign;
  });

  const hasActiveFilters = searchQuery || statusFilter !== "all" || typeFilter !== "all" || campaignFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setTypeFilter("all");
    setCampaignFilter("all");
  };

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      </>
    );
  }

  if (companyLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      </>
    );
  }

  if (!activeCompany) {
    return (
      <>
        <div className="space-y-6 p-6">
          <div><h1 className="text-3xl font-bold">{t('channels.title')}</h1><p className="text-muted-foreground">{t('channels.subtitle')}</p></div>
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">{t('channels.title')}</h1>
            <p className="text-muted-foreground">{t('channels.subtitle')}</p>
          </div>
          <PermissionGate permission="channels.create">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('channels.newChannel')}
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t('channels.newChannel')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="campaign_id">{t('channels.form.campaign')} *</Label>
                    <Select
                      value={formData.campaign_id}
                      onValueChange={(value) => setFormData({ ...formData, campaign_id: value })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('channels.form.campaignPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {campaigns.map((campaign) => (
                          <SelectItem key={campaign.id} value={campaign.id}>
                            {campaign.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">{t('channels.form.name')} *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder={t('channels.form.namePlaceholder')}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="type">{t('channels.form.type')}</Label>
                      <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {channelTypes.map((type) => (
                            <SelectItem key={type.id} value={type.name}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">{t('channels.form.description')}</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      placeholder={t('channels.form.descriptionPlaceholder')}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                    <Label htmlFor="is_active" className="cursor-pointer">
                      {t('channels.form.active')}
                    </Label>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    {t('channels.form.cancel')}
                  </Button>
                  <Button type="submit">{t('channels.form.create')}</Button>
                </div>
              </form>
              </DialogContent>
            </Dialog>
          </PermissionGate>
        </div>

        {/* Filters Bar */}
        <Card>
          <CardContent className="py-4">
            <div className="flex gap-4 items-center flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('channels.filter.search')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={t('channels.filter.status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('channels.filter.allStatus')}</SelectItem>
                  <SelectItem value="active">{t('channels.filter.active')}</SelectItem>
                  <SelectItem value="inactive">{t('channels.filter.inactive')}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder={t('channels.filter.type')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('channels.filter.allTypes')}</SelectItem>
                  {channelTypes.map((type) => (
                    <SelectItem key={type.id} value={type.name}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t('channels.filter.campaign')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('channels.filter.allCampaigns')}</SelectItem>
                  {campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  {t('channels.filter.clear')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results count */}
        <div className="text-sm text-muted-foreground">
          {t('channels.results', { shown: filteredChannels.length, total: channels.length })}
        </div>

        {channels.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Radio className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">{t('channels.empty.title')}</p>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('channels.empty.create')}
                  </Button>
                </DialogTrigger>
              </Dialog>
            </CardContent>
          </Card>
        ) : filteredChannels.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Search className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">{t('channels.noMatch.title')}</p>
              <Button variant="outline" onClick={clearFilters}>
                {t('channels.noMatch.clear')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('channels.table.channel')}</TableHead>
                  <TableHead>{t('channels.table.type')}</TableHead>
                  <TableHead>{t('channels.table.campaign')}</TableHead>
                  <TableHead>{t('channels.table.status')}</TableHead>
                  <TableHead className="text-right">{t('channels.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredChannels.map((channel) => {
                  const Icon = getChannelIcon(channel.type);
                  const channelType = channelTypes.find(t => t.name === channel.type);
                  
                  return (
                    <TableRow
                      key={channel.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/channels/${channel.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-md bg-primary/10">
                            <Icon className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <div className="font-medium">{channel.name}</div>
                            {channel.description && (
                              <div className="text-sm text-muted-foreground line-clamp-1 max-w-[300px]">
                                {channel.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{channelType?.label || channel.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">{channel.campaigns.name}</span>
                      </TableCell>
                      <TableCell>
                        {channel.is_active ? (
                          <Badge className="bg-success/10 text-success border-0">{t('channels.status.active')}</Badge>
                        ) : (
                          <Badge variant="secondary">{t('channels.status.inactive')}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <PermissionGate permission="channels.edit">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); handleEdit(channel); }}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </PermissionGate>
                          <PermissionGate permission="channels.delete">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); handleDeleteClick(channel); }}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </PermissionGate>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('channels.editChannel')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_campaign_id">{t('channels.form.campaign')} *</Label>
                  <Select
                    value={editFormData.campaign_id}
                    onValueChange={(value) => setEditFormData({ ...editFormData, campaign_id: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('channels.form.campaignPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {campaigns.map((campaign) => (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_name">{t('channels.form.name')} *</Label>
                    <Input
                      id="edit_name"
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      placeholder={t('channels.form.namePlaceholder')}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit_type">{t('channels.form.type')}</Label>
                    <Select value={editFormData.type} onValueChange={(value) => setEditFormData({ ...editFormData, type: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {channelTypes.map((type) => (
                          <SelectItem key={type.id} value={type.name}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_description">{t('channels.form.description')}</Label>
                  <Textarea
                    id="edit_description"
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    rows={3}
                    placeholder={t('channels.form.descriptionPlaceholder')}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="edit_is_active"
                    checked={editFormData.is_active}
                    onCheckedChange={(checked) => setEditFormData({ ...editFormData, is_active: checked })}
                  />
                  <Label htmlFor="edit_is_active" className="cursor-pointer">
                    {t('channels.form.active')}
                  </Label>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                  {t('channels.form.cancel')}
                </Button>
                <Button type="submit">{t('channels.form.save')}</Button>
              </div>
            </form>
          </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('channels.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('channels.delete.description', { name: channelToDelete?.name || '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('channels.delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('channels.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </>
  );
};

export default Channels;
