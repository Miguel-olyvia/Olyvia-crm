import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useTranslation } from "@/hooks/useTranslation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import * as LucideIcons from "lucide-react";
import { Search, ImageIcon, Sparkles, Loader2, Check } from "lucide-react";

interface GalleryPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string, type: 'image' | 'icon') => void;
  mode?: 'image' | 'icon' | 'both';
  title?: string;
  currentValue?: string;
}

interface MediaAsset {
  id: string;
  name: string;
  file_url: string;
  file_type: string;
  mime_type: string;
  category: string;
}

// Icon categories
const ICON_CATEGORIES: Record<string, string[]> = {
  "Interface": [
    "Home", "Menu", "Settings", "Search", "Filter", "Plus", "Minus", "X", "Check",
    "ChevronUp", "ChevronDown", "ChevronLeft", "ChevronRight", "ArrowUp", "ArrowDown",
    "ArrowLeft", "ArrowRight", "MoreHorizontal", "MoreVertical", "Grid", "List"
  ],
  "Comunicação": [
    "Mail", "MailOpen", "Inbox", "Send", "MessageCircle", "MessageSquare", "MessagesSquare",
    "Phone", "PhoneCall", "Video", "Bell", "BellRing", "Share", "Forward", "Reply"
  ],
  "Utilizadores": [
    "User", "UserPlus", "UserMinus", "UserCheck", "UserX", "Users", "UserCircle",
    "Contact", "CircleUser", "Heart", "HeartHandshake"
  ],
  "Ficheiros": [
    "File", "FileText", "FileCode", "FileImage", "FileVideo", "FilePlus", "FileCheck",
    "Folder", "FolderOpen", "FolderPlus", "FolderCheck"
  ],
  "Negócio": [
    "Briefcase", "Building", "Building2", "Factory", "Landmark", "Presentation",
    "TrendingUp", "TrendingDown", "BarChart", "PieChart", "LineChart", "Calculator"
  ],
  "Compras": [
    "ShoppingCart", "ShoppingBag", "Store", "CreditCard", "Wallet", "Banknote",
    "Receipt", "Tag", "Gift", "Package", "PackageCheck"
  ],
  "Estado": [
    "Check", "CheckCircle", "CheckCircle2", "X", "XCircle", "AlertTriangle",
    "AlertCircle", "Info", "HelpCircle", "Ban", "ThumbsUp", "ThumbsDown"
  ],
  "Setas": [
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUpRight", "ArrowUpLeft",
    "ArrowDownRight", "ArrowDownLeft", "CornerUpLeft", "CornerUpRight", "Undo", "Redo"
  ],
};

const ALL_ICONS = Object.values(ICON_CATEGORIES).flat();

const renderLucideIcon = (name: string, className: string = "h-6 w-6") => {
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  if (!Icon || typeof Icon !== 'function') return null;
  return <Icon className={className} />;
};

export function GalleryPickerDialog({
  open,
  onOpenChange,
  onSelect,
  mode = 'both',
  title = "Selecionar da Galeria",
  currentValue = ""
}: GalleryPickerDialogProps) {
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"images" | "icons">(mode === 'icon' ? 'icons' : 'images');

  useEffect(() => {
    if (open && activeCompany?.id) {
      loadAssets();
    }
  }, [open, activeCompany?.id]);

  const loadAssets = async () => {
    if (!activeCompany?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("media_assets")
        .select("id, name, file_url, file_type, mime_type, category")
        .eq("company_id", activeCompany.id)
        .in("category", ["images", "logos"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAssets(data || []);
    } catch (error) {
      console.error("Error loading assets:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || asset.category === selectedCategory;
    const isImage = asset.mime_type?.startsWith("image/");
    return matchesSearch && matchesCategory && isImage;
  });

  const filteredIcons = (() => {
    let icons: string[] = [];
    if (selectedCategory === "all") {
      icons = ALL_ICONS;
    } else {
      icons = ICON_CATEGORIES[selectedCategory] || [];
    }
    if (searchTerm) {
      icons = icons.filter(name => name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return icons;
  })();

  const handleSelectImage = (asset: MediaAsset) => {
    onSelect(asset.file_url, 'image');
    onOpenChange(false);
  };

  const handleSelectIcon = (iconName: string) => {
    onSelect(iconName, 'icon');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Tabs */}
          {mode === 'both' && (
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "images" | "icons"); setSelectedCategory("all"); }}>
              <TabsList>
                <TabsTrigger value="images" className="gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Imagens
                </TabsTrigger>
                <TabsTrigger value="icons" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Ícones
                </TabsTrigger>
              </TabsList>

              <TabsContent value="images" className="mt-4">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredAssets.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma imagem encontrada</p>
                    <p className="text-sm">Faça upload de imagens na Galeria de Marketing</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="grid grid-cols-4 gap-4">
                      {filteredAssets.map((asset) => (
                        <button
                          key={asset.id}
                          onClick={() => handleSelectImage(asset)}
                          className={`group relative aspect-square rounded-lg border-2 overflow-hidden transition-all hover:border-primary ${
                            currentValue === asset.file_url ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                          }`}
                        >
                          <img
                            src={asset.file_url}
                            alt={asset.name}
                            className="w-full h-full object-cover"
                          />
                          {currentValue === asset.file_url && (
                            <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                            <p className="text-xs text-white truncate">{asset.name}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>

              <TabsContent value="icons" className="mt-4">
                {/* Icon Categories */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge
                    variant={selectedCategory === "all" ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setSelectedCategory("all")}
                  >
                    Todos
                  </Badge>
                  {Object.keys(ICON_CATEGORIES).map((cat) => (
                    <Badge
                      key={cat}
                      variant={selectedCategory === cat ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setSelectedCategory(cat)}
                    >
                      {cat}
                    </Badge>
                  ))}
                </div>

                <ScrollArea className="h-[350px]">
                  <div className="grid grid-cols-8 gap-2">
                    {filteredIcons.map((iconName) => (
                      <button
                        key={iconName}
                        onClick={() => handleSelectIcon(iconName)}
                        className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all hover:border-primary hover:bg-primary/5 ${
                          currentValue === iconName ? 'border-primary bg-primary/10' : 'border-border'
                        }`}
                        title={iconName}
                      >
                        {renderLucideIcon(iconName)}
                        <span className="text-[9px] text-muted-foreground mt-1 truncate w-full text-center">
                          {iconName}
                        </span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}

          {mode === 'image' && (
            <>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredAssets.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma imagem encontrada</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="grid grid-cols-4 gap-4">
                    {filteredAssets.map((asset) => (
                      <button
                        key={asset.id}
                        onClick={() => handleSelectImage(asset)}
                        className={`group relative aspect-square rounded-lg border-2 overflow-hidden transition-all hover:border-primary ${
                          currentValue === asset.file_url ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                        }`}
                      >
                        <img
                          src={asset.file_url}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                        />
                        {currentValue === asset.file_url && (
                          <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                            <Check className="h-3 w-3" />
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                          <p className="text-xs text-white truncate">{asset.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </>
          )}

          {mode === 'icon' && (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge
                  variant={selectedCategory === "all" ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setSelectedCategory("all")}
                >
                  Todos
                </Badge>
                {Object.keys(ICON_CATEGORIES).map((cat) => (
                  <Badge
                    key={cat}
                    variant={selectedCategory === cat ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
                  </Badge>
                ))}
              </div>

              <ScrollArea className="h-[350px]">
                <div className="grid grid-cols-8 gap-2">
                  {filteredIcons.map((iconName) => (
                    <button
                      key={iconName}
                      onClick={() => handleSelectIcon(iconName)}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all hover:border-primary hover:bg-primary/5 ${
                        currentValue === iconName ? 'border-primary bg-primary/10' : 'border-border'
                      }`}
                      title={iconName}
                    >
                      {renderLucideIcon(iconName)}
                      <span className="text-[9px] text-muted-foreground mt-1 truncate w-full text-center">
                        {iconName}
                      </span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
