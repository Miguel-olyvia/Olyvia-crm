import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { useTranslation } from "@/hooks/useTranslation";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as LucideIcons from "lucide-react";
import { 
  Search, FileText, File, Trash2, 
  Copy, ExternalLink, Upload, FolderOpen, Grid3X3,
  List, MoreVertical, Eye, X, Loader2,
  ImageIcon, Film, FileAudio, Archive, Code, Presentation, Sparkles
} from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { HelpButton } from "@/components/HelpButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface MediaAsset {
  id: string;
  name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  mime_type: string;
  category: string;
  tags: string[];
  description: string | null;
  created_at: string;
  created_by: string;
  company_id: string;
}

// System Icons - All Lucide icons organized by category
const ICON_CATEGORIES: Record<string, string[]> = {
  "Interface": [
    "Home", "Menu", "Settings", "Search", "Filter", "Plus", "Minus", "X", "Check",
    "ChevronUp", "ChevronDown", "ChevronLeft", "ChevronRight", "ArrowUp", "ArrowDown",
    "ArrowLeft", "ArrowRight", "MoreHorizontal", "MoreVertical", "Grid", "List",
    "Layout", "Layers", "Copy", "Clipboard", "ClipboardCheck", "ClipboardList",
    "Move", "Maximize", "Minimize", "ZoomIn", "ZoomOut", "RefreshCw", "RotateCw"
  ],
  "Comunicação": [
    "Mail", "MailOpen", "Inbox", "Send", "MessageCircle", "MessageSquare", "MessagesSquare",
    "Phone", "PhoneCall", "PhoneIncoming", "PhoneOutgoing", "PhoneMissed", "PhoneOff",
    "Video", "VideoOff", "Voicemail", "Bell", "BellRing", "BellOff", "AtSign",
    "Share", "Share2", "Forward", "Reply", "ReplyAll", "Megaphone", "Radio"
  ],
  "Utilizadores": [
    "User", "UserPlus", "UserMinus", "UserCheck", "UserX", "Users", "UserCircle",
    "UserCog", "Contact", "CircleUser", "PersonStanding", "Baby", "Hand", "Handshake",
    "Heart", "HeartHandshake", "Accessibility"
  ],
  "Ficheiros": [
    "File", "FileText", "FileCode", "FileImage", "FileVideo", "FileAudio",
    "FileArchive", "FilePlus", "FileMinus", "FileCheck", "FileX", "FileSearch",
    "FileOutput", "FileInput", "Files", "Folder", "FolderOpen", "FolderPlus",
    "FolderMinus", "FolderCheck", "FolderX", "FolderSearch", "FolderArchive"
  ],
  "Edição": [
    "Edit", "Edit2", "Edit3", "Pencil", "PenLine", "PenTool", "Eraser", "Type",
    "Bold", "Italic", "Underline", "Strikethrough", "AlignLeft", "AlignCenter",
    "AlignRight", "AlignJustify", "ListOrdered", "Quote", "Link", "Link2", "Unlink",
    "ExternalLink", "Image", "ImagePlus", "Scissors", "Crop"
  ],
  "Media": [
    "Play", "Pause", "SkipBack", "SkipForward", "Rewind", "FastForward",
    "Volume", "Volume1", "Volume2", "VolumeX", "Music", "Music2", "Music3", "Music4",
    "Headphones", "Speaker", "Mic", "MicOff", "Camera", "CameraOff", "Film",
    "Clapperboard", "Disc", "Disc2", "Disc3", "Tv", "Monitor", "Airplay"
  ],
  "Navegação": [
    "Compass", "Map", "MapPin", "MapPinned", "Navigation", "Navigation2",
    "Locate", "LocateFixed", "LocateOff", "Milestone", "Signpost", "Route", "Orbit"
  ],
  "Tempo": [
    "Clock", "Clock1", "Clock2", "Clock3", "Clock4", "Clock5", "Clock6", "Clock7",
    "Clock8", "Clock9", "Clock10", "Clock11", "Clock12", "Timer", "TimerOff",
    "TimerReset", "Alarm", "AlarmClock", "AlarmCheck", "AlarmMinus", "AlarmPlus",
    "Calendar", "CalendarDays", "CalendarCheck", "CalendarPlus", "CalendarMinus",
    "CalendarClock", "CalendarHeart", "CalendarSearch", "CalendarX", "History", "Hourglass"
  ],
  "Clima": [
    "Sun", "Moon", "Cloud", "CloudRain", "CloudSnow", "CloudLightning", "CloudDrizzle",
    "CloudFog", "CloudHail", "CloudSun", "CloudMoon", "Cloudy", "Sunrise", "Sunset",
    "Wind", "Tornado", "Rainbow", "Umbrella", "Thermometer", "ThermometerSun", "Snowflake"
  ],
  "Casa": [
    "Home", "House", "Building", "Building2", "Castle", "Hotel", "Warehouse", "Factory",
    "Bed", "BedDouble", "BedSingle", "Bath", "Shower", "Lamp", "LampDesk", "LampFloor",
    "Sofa", "Armchair", "DoorOpen", "DoorClosed", "Key", "Lock", "Unlock", "LockKeyhole"
  ],
  "Comida": [
    "Utensils", "UtensilsCrossed", "ChefHat", "CookingPot", "Soup", "Pizza", "Sandwich",
    "Beef", "Egg", "EggFried", "Apple", "Banana", "Cherry", "Grape", "Citrus", "Carrot",
    "Salad", "Cookie", "Cake", "CakeSlice", "IceCream", "Candy", "Lollipop",
    "Coffee", "Wine", "Beer", "Martini", "GlassWater", "Milk", "Popcorn", "Croissant"
  ],
  "Compras": [
    "ShoppingCart", "ShoppingBag", "ShoppingBasket", "Store", "Storefront",
    "CreditCard", "Wallet", "Banknote", "Coins", "PiggyBank", "Receipt", "ReceiptText",
    "Barcode", "QrCode", "ScanBarcode", "ScanLine", "Tag", "Tags", "Ticket", "Gift",
    "Package", "PackageOpen", "PackageCheck", "PackageX", "PackagePlus", "PackageMinus"
  ],
  "Transporte": [
    "Car", "CarFront", "Bus", "Truck", "Tractor", "Bike", "Bicycle", "Train",
    "TrainFront", "Plane", "PlaneTakeoff", "PlaneLanding", "Ship", "Sailboat",
    "Rocket", "Cable", "CableCar", "Fuel", "Gauge", "Siren", "TrafficCone", "Anchor"
  ],
  "Natureza": [
    "Leaf", "TreeDeciduous", "TreePine", "Trees", "Flower", "Flower2", "Sprout",
    "Clover", "Mountain", "MountainSnow", "Waves", "Droplet", "Droplets", "Flame",
    "Zap", "Sparkle", "Sparkles", "Star", "Stars", "Earth", "Globe", "Globe2"
  ],
  "Animais": [
    "Dog", "Cat", "Bird", "Fish", "Bug", "Rat", "Rabbit", "Squirrel", "Snail",
    "Turtle", "Origami", "Footprints", "PawPrint", "Bone", "Feather", "Shell"
  ],
  "Saúde": [
    "Heart", "HeartPulse", "Activity", "Stethoscope", "Pill", "Syringe",
    "Thermometer", "Bandage", "Ambulance", "Hospital", "Cross", "Plus",
    "Brain", "Eye", "EyeOff", "Ear", "EarOff", "Bone", "Dna", "Microscope",
    "TestTube", "TestTubes", "FlaskConical", "Beaker", "Cigarette", "CigaretteOff"
  ],
  "Desporto": [
    "Dumbbell", "Trophy", "Medal", "Target", "Crosshair", "Gamepad", "Gamepad2",
    "Dice1", "Dice2", "Dice3", "Dice4", "Dice5", "Dice6", "Sword", "Swords", "Shield",
    "Flag", "FlagTriangleLeft", "FlagTriangleRight", "Mountain", "Bike", "Tent"
  ],
  "Tecnologia": [
    "Laptop", "Monitor", "Tv", "Smartphone", "Tablet", "TabletSmartphone", "Watch",
    "Keyboard", "Mouse", "MousePointer", "MousePointer2", "Touchpad",
    "Printer", "Server", "Database", "HardDrive", "Cpu", "CircuitBoard", "MemoryStick",
    "Usb", "Cable", "Plug", "PlugZap", "Wifi", "WifiOff", "Bluetooth", "BluetoothOff",
    "Signal", "SignalHigh", "SignalLow", "SignalMedium", "SignalZero",
    "Router", "Cloud", "CloudOff", "Download", "Upload", "DownloadCloud", "UploadCloud"
  ],
  "Ferramentas": [
    "Wrench", "Hammer", "Screwdriver", "Drill", "Ruler", "Brush", "Paintbrush",
    "Palette", "PaintBucket", "Pipette", "Scissors", "Axe", "Shovel", "Construction",
    "HardHat", "Flashlight", "Magnet", "Zap", "Power", "Battery", "BatteryCharging",
    "BatteryFull", "BatteryLow", "BatteryMedium", "BatteryWarning", "Cog", "Settings"
  ],
  "Segurança": [
    "Lock", "Unlock", "LockKeyhole", "Key", "KeyRound", "Shield", "ShieldCheck",
    "ShieldAlert", "ShieldQuestion", "ShieldX", "ShieldOff", "Fingerprint",
    "ScanFace", "Scan", "Eye", "EyeOff", "AlertTriangle", "AlertCircle", "AlertOctagon",
    "OctagonX", "Ban", "CircleSlash", "ShieldBan", "UserX", "FileWarning"
  ],
  "Negócio": [
    "Briefcase", "Building", "Building2", "Factory", "Landmark", "Presentation",
    "TrendingUp", "TrendingDown", "BarChart", "BarChart2", "BarChart3", "BarChart4",
    "PieChart", "LineChart", "AreaChart", "Percent", "Calculator", "Binary",
    "Sigma", "Hash", "Equal", "NotEqual", "Infinity", "CircleDollarSign", "BadgeDollarSign"
  ],
  "Setas": [
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUpRight", "ArrowUpLeft",
    "ArrowDownRight", "ArrowDownLeft", "ArrowUpDown", "ArrowLeftRight", "ArrowBigUp",
    "ArrowBigDown", "ArrowBigLeft", "ArrowBigRight", "CornerUpLeft", "CornerUpRight",
    "CornerDownLeft", "CornerDownRight", "MoveUp", "MoveDown", "MoveLeft", "MoveRight",
    "ChevronsUp", "ChevronsDown", "ChevronsLeft", "ChevronsRight", "Undo", "Redo", "Undo2", "Redo2"
  ],
  "Formas": [
    "Circle", "CircleDot", "Square", "SquareDot", "Triangle", "Hexagon", "Octagon",
    "Pentagon", "Star", "Heart", "Diamond", "Spade", "Club", "Box", "Boxes",
    "Component", "Puzzle", "Shapes", "RectangleHorizontal", "RectangleVertical"
  ],
  "Estado": [
    "Check", "CheckCircle", "CheckCircle2", "CheckSquare", "X", "XCircle", "XSquare",
    "AlertTriangle", "AlertCircle", "Info", "HelpCircle", "Ban", "Loader", "Loader2",
    "RefreshCw", "RotateCw", "Clock", "Hourglass", "Pause", "Play", "Power",
    "ThumbsUp", "ThumbsDown", "Smile", "Frown", "Meh", "PartyPopper"
  ],
};

// Get all icon names from the categories
const ALL_SYSTEM_ICONS = Object.values(ICON_CATEGORIES).flat();

// Helper to render Lucide icon by name
const renderLucideIcon = (name: string, className: string = "h-5 w-5") => {
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  if (!Icon || typeof Icon !== 'function') return null;
  return <Icon className={className} />;
};

const getFileIcon = (mimeType: string) => {
  if (mimeType?.startsWith("image/")) return <ImageIcon className="h-8 w-8" />;
  if (mimeType?.startsWith("video/")) return <Film className="h-8 w-8" />;
  if (mimeType?.startsWith("audio/")) return <FileAudio className="h-8 w-8" />;
  if (mimeType?.includes("pdf")) return <FileText className="h-8 w-8" />;
  if (mimeType?.includes("presentation") || mimeType?.includes("powerpoint")) return <Presentation className="h-8 w-8" />;
  if (mimeType?.includes("zip") || mimeType?.includes("rar")) return <Archive className="h-8 w-8" />;
  if (mimeType?.includes("code") || mimeType?.includes("javascript") || mimeType?.includes("json")) return <Code className="h-8 w-8" />;
  return <File className="h-8 w-8" />;
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export default function Gallery() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const selectedCompanyId = activeCompany?.id;
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<"media" | "icons">("media");

  // Icons state
  const [iconSearch, setIconSearch] = useState("");
  const [selectedIconCategory, setSelectedIconCategory] = useState<string>("all");

  const FILE_CATEGORIES = [
    { value: "images", label: t('gallery.categories.images'), icon: ImageIcon },
    { value: "videos", label: t('gallery.categories.videos'), icon: Film },
    { value: "documents", label: t('gallery.categories.documents'), icon: FileText },
    { value: "audio", label: t('gallery.categories.audio'), icon: FileAudio },
    { value: "presentations", label: t('gallery.categories.presentations'), icon: Presentation },
    { value: "other", label: t('gallery.categories.other'), icon: File },
  ];

  const [newAsset, setNewAsset] = useState({
    name: "",
    description: "",
    category: "images",
    tags: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    loadAssets();
  }, [selectedCompanyId]);

  const loadAssets = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("media_assets")
        .select("*")
        .eq("company_id", selectedCompanyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAssets(data || []);
    } catch (error: unknown) {
      console.error("Error loading assets:", error);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!newAsset.name) {
        setNewAsset(prev => ({ ...prev, name: file.name.split(".")[0] }));
      }
      const mime = file.type;
      if (mime.startsWith("image/")) setNewAsset(prev => ({ ...prev, category: "images" }));
      else if (mime.startsWith("video/")) setNewAsset(prev => ({ ...prev, category: "videos" }));
      else if (mime.startsWith("audio/")) setNewAsset(prev => ({ ...prev, category: "audio" }));
      else if (mime.includes("pdf") || mime.includes("document") || mime.includes("text")) setNewAsset(prev => ({ ...prev, category: "documents" }));
      else if (mime.includes("presentation")) setNewAsset(prev => ({ ...prev, category: "presentations" }));
      else setNewAsset(prev => ({ ...prev, category: "other" }));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedCompanyId) {
      toast({ title: t('gallery.toast.selectFile'), variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${selectedCompanyId}/${Date.now()}-${newAsset.name || selectedFile.name}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("media").getPublicUrl(fileName);
      const fileUrl = urlData.publicUrl;

      const { error: dbError } = await supabase.from("media_assets").insert({
        name: newAsset.name || selectedFile.name,
        file_url: fileUrl,
        file_type: fileExt,
        file_size: selectedFile.size,
        mime_type: selectedFile.type,
        category: newAsset.category,
        tags: newAsset.tags ? newAsset.tags.split(",").map(t => t.trim()) : [],
        description: newAsset.description || null,
        company_id: selectedCompanyId,
        created_by: businessUserId,
      });

      if (dbError) throw dbError;

      toast({ title: t('gallery.toast.uploadSuccess') });
      setUploadDialogOpen(false);
      setSelectedFile(null);
      setNewAsset({ name: "", description: "", category: "images", tags: "" });
      loadAssets();
    } catch (error: unknown) {
      console.error("Upload error:", error);
      toast({ title: t('gallery.toast.uploadError'), description: (error as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (asset: MediaAsset) => {
    try {
      const filePath = asset.file_url.split("/media/")[1];
      if (filePath) {
        await supabase.storage.from("media").remove([filePath]);
      }

      const { error } = await supabase.from("media_assets").delete().eq("id", asset.id);
      if (error) throw error;

      toast({ title: t('gallery.toast.deleteSuccess') });
      loadAssets();
    } catch (error: unknown) {
      toast({ title: t('gallery.toast.deleteError'), description: (error as Error).message, variant: "destructive" });
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: t('gallery.toast.urlCopied') });
  };

  const copyIconName = (name: string) => {
    navigator.clipboard.writeText(name);
    toast({ title: t('gallery.toast.iconCopied').replace('{name}', name) });
  };

  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.tags?.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === "all" || asset.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const assetsByCategory = FILE_CATEGORIES.map(cat => ({
    ...cat,
    count: assets.filter(a => a.category === cat.value).length,
  }));

  // Filter icons based on search and category
  const filteredIcons = (() => {
    let icons: string[] = [];
    if (selectedIconCategory === "all") {
      icons = ALL_SYSTEM_ICONS;
    } else {
      icons = ICON_CATEGORIES[selectedIconCategory] || [];
    }
    if (iconSearch) {
      icons = icons.filter(name => name.toLowerCase().includes(iconSearch.toLowerCase()));
    }
    return icons;
  })();

  const iconCategoryNames = Object.keys(ICON_CATEGORIES);

  // Translate icon category names
  const getIconCategoryLabel = (cat: string) => {
    const categoryKey = `gallery.iconCategories.${cat.toLowerCase().replace(/\s+/g, '')}` as const;
    return t(categoryKey) || cat;
  };

  return (
    <>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{t('gallery.title')}</h1>
              <HelpButton pageKey="marketing.gallery" />
            </div>
            <p className="text-muted-foreground">{t('gallery.subtitle')}</p>
          </div>
          {activeTab === "media" && (
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              {t('gallery.uploadFile')}
            </Button>
          )}
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "media" | "icons")}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="media" className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              {t('gallery.tabs.media')}
            </TabsTrigger>
            <TabsTrigger value="icons" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {t('gallery.tabs.icons')} ({ALL_SYSTEM_ICONS.length})
            </TabsTrigger>
          </TabsList>

          {/* Media Tab Content */}
          <TabsContent value="media" className="space-y-6 mt-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
              <Card 
                className={`cursor-pointer transition-all hover:shadow-md ${selectedCategory === "all" ? "ring-2 ring-primary" : ""}`}
                onClick={() => setSelectedCategory("all")}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FolderOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{assets.length}</p>
                    <p className="text-xs text-muted-foreground">{t('gallery.categories.all')}</p>
                  </div>
                </CardContent>
              </Card>
              {assetsByCategory.map(cat => (
                <Card 
                  key={cat.value}
                  className={`cursor-pointer transition-all hover:shadow-md ${selectedCategory === cat.value ? "ring-2 ring-primary" : ""}`}
                  onClick={() => setSelectedCategory(cat.value)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                      <cat.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{cat.count}</p>
                      <p className="text-xs text-muted-foreground">{cat.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Search & View Toggle */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('gallery.search')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  variant={viewMode === "grid" ? "default" : "outline"} 
                  size="icon"
                  onClick={() => setViewMode("grid")}
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button 
                  variant={viewMode === "list" ? "default" : "outline"} 
                  size="icon"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Assets Grid/List */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <OlyviaLoader size={40} />
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium text-lg">{t('gallery.noAssets')}</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {searchTerm ? t('gallery.noResults') : t('gallery.noAssetsDesc')}
                </p>
                <Button onClick={() => setUploadDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  {t('gallery.uploadFirst')}
                </Button>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredAssets.map(asset => (
                  <Card key={asset.id} className="group overflow-hidden hover:shadow-lg transition-all">
                    <div 
                      className="aspect-square bg-muted relative cursor-pointer"
                      onClick={() => setPreviewAsset(asset)}
                    >
                      {asset.mime_type?.startsWith("image/") ? (
                        <img 
                          src={asset.file_url} 
                          alt={asset.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          {getFileIcon(asset.mime_type)}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button size="icon" variant="secondary" onClick={(e) => { e.stopPropagation(); setPreviewAsset(asset); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="secondary" onClick={(e) => { e.stopPropagation(); copyUrl(asset.file_url); }}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <CardContent className="p-3">
                      <p className="font-medium text-sm truncate" title={asset.name}>{asset.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(asset.file_size)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 text-sm font-medium">{t('common.file') || 'File'}</th>
                      <th className="text-left p-3 text-sm font-medium">{t('common.category') || 'Category'}</th>
                      <th className="text-left p-3 text-sm font-medium">{t('common.size') || 'Size'}</th>
                      <th className="text-left p-3 text-sm font-medium">{t('common.date') || 'Date'}</th>
                      <th className="text-right p-3 text-sm font-medium">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredAssets.map(asset => (
                      <tr key={asset.id} className="hover:bg-muted/50">
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                              {asset.mime_type?.startsWith("image/") ? (
                                <img src={asset.file_url} alt="" className="w-full h-full object-cover rounded" />
                              ) : (
                                getFileIcon(asset.mime_type)
                              )}
                            </div>
                            <span className="font-medium truncate max-w-[200px]">{asset.name}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="secondary">{asset.category}</Badge>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">{formatFileSize(asset.file_size)}</td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {new Date(asset.created_at).toLocaleDateString("pt-PT")}
                        </td>
                        <td className="p-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setPreviewAsset(asset)}>
                                <Eye className="h-4 w-4 mr-2" /> {t('gallery.actions.preview')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => copyUrl(asset.file_url)}>
                                <Copy className="h-4 w-4 mr-2" /> {t('gallery.actions.copyUrl')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => window.open(asset.file_url, "_blank")}>
                                <ExternalLink className="h-4 w-4 mr-2" /> {t('gallery.actions.openNew')}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(asset)}>
                                <Trash2 className="h-4 w-4 mr-2" /> {t('gallery.actions.delete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Icons Tab Content */}
          <TabsContent value="icons" className="space-y-6 mt-6">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Category Sidebar */}
              <div className="lg:w-64 space-y-2">
                <p className="text-sm font-medium text-muted-foreground mb-3">{t('gallery.iconCategory')}</p>
                <ScrollArea className="h-[calc(100vh-400px)] lg:h-[calc(100vh-300px)]">
                  <div className="space-y-1 pr-4">
                    <Button
                      variant={selectedIconCategory === "all" ? "secondary" : "ghost"}
                      className="w-full justify-start"
                      onClick={() => setSelectedIconCategory("all")}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {t('gallery.iconCategoryAll')} ({ALL_SYSTEM_ICONS.length})
                    </Button>
                    {iconCategoryNames.map(cat => (
                      <Button
                        key={cat}
                        variant={selectedIconCategory === cat ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => setSelectedIconCategory(cat)}
                      >
                        {renderLucideIcon(ICON_CATEGORIES[cat][0], "h-4 w-4 mr-2")}
                        {getIconCategoryLabel(cat)} ({ICON_CATEGORIES[cat].length})
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Icons Grid */}
              <div className="flex-1 space-y-4">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('gallery.searchIcons')}
                    value={iconSearch}
                    onChange={(e) => setIconSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <div className="text-sm text-muted-foreground">
                  {filteredIcons.length} {t('gallery.noIconResults').includes('ícones') ? 'ícones encontrados' : 'icons found'}
                </div>

                <ScrollArea className="h-[calc(100vh-400px)]">
                  <TooltipProvider delayDuration={100}>
                    <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2 pr-4">
                      {filteredIcons.map(iconName => (
                        <Tooltip key={iconName}>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-12 w-12 hover:bg-primary hover:text-primary-foreground transition-colors"
                              onClick={() => copyIconName(iconName)}
                            >
                              {renderLucideIcon(iconName, "h-5 w-5")}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="flex flex-col items-center gap-1">
                            <span className="font-medium">{iconName}</span>
                            <span className="text-xs text-muted-foreground">{t('common.clickToCopy') || 'Click to copy'}</span>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </TooltipProvider>
                </ScrollArea>

                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium mb-2">{t('common.howToUse') || 'How to use icons'}</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('common.clickIconToCopy') || 'Click an icon to copy its name. Use it in your code like this:'}
                  </p>
                  <code className="text-xs bg-muted p-2 rounded block">
                    {`import { IconName } from "lucide-react";`}
                  </code>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Upload Dialog */}
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('gallery.uploadDialog.title')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div 
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => document.getElementById("file-input")?.click()}
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-3">
                    {getFileIcon(selectedFile.type)}
                    <div className="text-left">
                      <p className="font-medium">{selectedFile.name}</p>
                      <p className="text-sm text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">{t('gallery.uploadDialog.clickToSelect')}</p>
                  </>
                )}
                <input 
                  id="file-input"
                  type="file" 
                  className="hidden" 
                  onChange={handleFileSelect}
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('gallery.uploadDialog.name')}</Label>
                  <Input
                    value={newAsset.name}
                    onChange={(e) => setNewAsset(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={t('gallery.uploadDialog.namePlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('gallery.uploadDialog.category')}</Label>
                  <Select value={newAsset.category} onValueChange={(v) => setNewAsset(prev => ({ ...prev, category: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FILE_CATEGORIES.map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('gallery.uploadDialog.tags')}</Label>
                <Input
                  value={newAsset.tags}
                  onChange={(e) => setNewAsset(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder={t('gallery.uploadDialog.tagsPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('gallery.uploadDialog.description')}</Label>
                <Textarea
                  value={newAsset.description}
                  onChange={(e) => setNewAsset(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={t('gallery.uploadDialog.descriptionPlaceholder')}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
                {t('gallery.uploadDialog.cancel')}
              </Button>
              <Button onClick={handleUpload} disabled={uploading || !selectedFile}>
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('gallery.uploadDialog.uploading')}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    {t('gallery.uploadDialog.upload')}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={!!previewAsset} onOpenChange={() => setPreviewAsset(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>{previewAsset?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {previewAsset?.mime_type?.startsWith("image/") ? (
                <img 
                  src={previewAsset.file_url} 
                  alt={previewAsset.name}
                  className="w-full max-h-[60vh] object-contain rounded-lg"
                />
              ) : previewAsset?.mime_type?.startsWith("video/") ? (
                <video 
                  src={previewAsset.file_url} 
                  controls 
                  className="w-full max-h-[60vh] rounded-lg"
                />
              ) : previewAsset?.mime_type?.startsWith("audio/") ? (
                <audio src={previewAsset.file_url} controls className="w-full" />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  {getFileIcon(previewAsset?.mime_type || "")}
                  <p className="mt-4">{t('gallery.preview.close')}</p>
                  <Button 
                    className="mt-2"
                    onClick={() => window.open(previewAsset?.file_url, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {t('gallery.actions.openNew')}
                  </Button>
                </div>
              )}

              {previewAsset && (
                <div className="flex flex-wrap gap-2 pt-4 border-t">
                  <Button variant="outline" size="sm" onClick={() => copyUrl(previewAsset.file_url)}>
                    <Copy className="h-4 w-4 mr-2" />
                    {t('gallery.actions.copyUrl')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => window.open(previewAsset.file_url, "_blank")}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {t('gallery.actions.openNew')}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-destructive"
                    onClick={() => {
                      handleDelete(previewAsset);
                      setPreviewAsset(null);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('gallery.actions.delete')}
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
