import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as LucideIcons from "lucide-react";
import { Search } from "lucide-react";

const LUCIDE_ALIASES: Record<string, string> = {
  Layers2: "Layers",
  Layers3: "Layers",
  Edit2: "Pencil",
  Edit3: "PenLine",
  Trash: "Trash2",
};

export const normalizeLucideIconName = (name?: string | null) => {
  const raw = String(name || "").trim();
  if (!raw) return "";
  return LUCIDE_ALIASES[raw] || raw;
};

// Common icons for forms - curated list
const RAW_ICONS = [
  "Home", "Building", "Building2", "House", "Castle", "Warehouse", "Hotel", "Store", "Factory", "School", "Church",
  "Bath", "Bed", "BedDouble", "BedSingle", "Sofa", "Armchair", "Lamp", "LampDesk", "LampFloor", "LampCeiling", "Tv", "Tv2", "DoorOpen", "DoorClosed",
  "Utensils", "UtensilsCrossed", "ChefHat", "Microwave", "Refrigerator", "CookingPot", "Coffee", "CupSoda", "Wine", "Beer",
  "Wrench", "Hammer", "Paintbrush", "Paintbrush2", "PaintBucket", "PaintRoller", "Drill", "Ruler", "Scissors", "HardHat", "Construction", "Pickaxe", "Shovel", "Cog", "Settings", "Settings2",
  "Layers", "Layers2", "Layers3", "SquareStack", "Boxes", "Box", "Package", "Grid2x2", "Grid3x3",
  "Sparkles", "Droplets", "Droplet", "Wind", "Trash2", "Brush", "SprayCan", "WashingMachine",
  "Pipette", "ShowerHead", "Waves", "Glasses",
  "Plug", "Plug2", "PlugZap", "Lightbulb", "BatteryCharging", "Cable", "Power", "Radio",
  "Clock", "Clock1", "Clock12", "Timer", "TimerReset", "Hourglass", "Zap", "AlertTriangle", "AlertCircle", "AlertOctagon", "Calendar", "CalendarDays", "CalendarCheck", "CalendarClock",
  "User", "Users", "UserPlus", "UserCheck", "UserCircle", "Heart", "HeartHandshake", "Baby", "Accessibility", "PersonStanding",
  "Car", "Truck", "Bus", "Bike", "Plane", "Ship", "Train", "Forklift", "Tractor",
  "Flower", "Flower2", "TreeDeciduous", "TreePine", "Trees", "Leaf", "Leafy", "Sprout", "Sun", "SunMedium", "Cloud", "CloudRain", "CloudSnow", "Snowflake", "Mountain", "MountainSnow",
  "Key", "KeyRound", "Lock", "LockOpen", "Shield", "ShieldCheck", "ShieldAlert", "Trophy", "Award", "Medal", "Gift",
  "Smartphone", "Tablet", "Laptop", "Monitor", "Wifi", "Bluetooth", "Mouse", "Keyboard", "Printer", "HardDrive", "Server",
  "Check", "CheckCircle", "CheckCircle2", "CheckSquare", "X", "XCircle", "XSquare", "Plus", "PlusCircle", "Minus", "MinusCircle",
  "ThumbsUp", "ThumbsDown", "HelpCircle", "Info", "MessageCircle", "MessageSquare", "Mail", "MailOpen", "Phone", "PhoneCall",
  "Euro", "DollarSign", "PoundSterling", "CreditCard", "Wallet", "Receipt", "Percent", "Tag", "Tags", "ShoppingCart", "ShoppingBag", "Banknote", "Coins", "PiggyBank",
  "Stethoscope", "Pill", "Syringe", "HeartPulse", "Activity", "Cross", "Bandage", "Thermometer",
  "Dog", "Cat", "Bird", "Fish", "Bug", "Rabbit", "Squirrel", "Turtle",
  "Circle", "Square", "Triangle", "Hexagon", "Pentagon", "Diamond", "Octagon", "Star",
  "MapPin", "Map", "Navigation", "Compass", "Globe", "Flag", "Anchor",
  "FileText", "File", "FilePlus", "Folder", "FolderOpen", "Archive", "ClipboardList", "ClipboardCheck", "Notebook", "BookOpen",
  "Briefcase", "Calculator", "Crown", "Sparkle", "Wand", "Wand2",
];

const COMMON_ICONS = Array.from(new Set(RAW_ICONS.map(normalizeLucideIconName))).filter(name => (LucideIcons as any)[name]);

// Search aliases (PT/EN synonyms) — keys are lowercase search terms,
// values are lucide icon names that should match. Helps users who search
// by visual concept instead of the exact lucide name.
const ICON_SEARCH_ALIASES: Record<string, string[]> = {
  raio: ["Zap", "PlugZap"],
  raios: ["Zap", "PlugZap"],
  lightning: ["Zap"],
  bolt: ["Zap"],
  urgent: ["Zap", "AlertTriangle", "AlertCircle"],
  urgente: ["Zap", "AlertTriangle", "AlertCircle"],
  rapido: ["Zap", "Timer"],
  "rápido": ["Zap", "Timer"],
  fast: ["Zap", "Timer"],
  energia: ["Zap", "BatteryCharging", "Power", "Plug"],
  energy: ["Zap", "BatteryCharging", "Power", "Plug"],
  electricidade: ["Zap", "Plug", "PlugZap", "Power", "Cable"],
  eletricidade: ["Zap", "Plug", "PlugZap", "Power", "Cable"],
  casa: ["Home", "House", "Building"],
  banho: ["Bath", "ShowerHead", "Droplets"],
  cozinha: ["Utensils", "UtensilsCrossed", "ChefHat", "CookingPot"],
  pavimento: ["Layers", "SquareStack"],
  alerta: ["AlertTriangle", "AlertCircle", "AlertOctagon"],
  aviso: ["AlertTriangle", "AlertCircle"],
  warning: ["AlertTriangle", "AlertCircle", "AlertOctagon"],
  relogio: ["Clock", "Timer", "Hourglass"],
  "relógio": ["Clock", "Timer", "Hourglass"],
  tempo: ["Clock", "Timer", "Hourglass", "Calendar"],
  data: ["Calendar", "CalendarDays"],
};

interface IconGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (iconName: string) => void;
  selectedIcon?: string;
}

export function IconGallery({ open, onOpenChange, onSelect, selectedIcon }: IconGalleryProps) {
  const [search, setSearch] = useState("");
  const normalizedSelectedIcon = normalizeLucideIconName(selectedIcon);

  const term = search.trim().toLowerCase();
  const aliasMatches = new Set(term ? ICON_SEARCH_ALIASES[term] || [] : []);
  const filteredIcons = COMMON_ICONS.filter(name =>
    !term || name.toLowerCase().includes(term) || aliasMatches.has(name)
  );

  const renderIcon = (name: string) => {
    const normalized = normalizeLucideIconName(name);
    const Icon = (LucideIcons as any)[normalized];
    if (!Icon) return null;
    return <Icon className="h-5 w-5" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Selecionar Ícone</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar ícones..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-[300px]">
          <div className="grid grid-cols-6 gap-2 p-1">
            {filteredIcons.map(name => {
              const isSelected = normalizedSelectedIcon === name;
              return (
                <Button
                  key={name}
                  variant={isSelected ? "default" : "outline"}
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => {
                    onSelect(name);
                  }}
                  title={name}
                >
                  {renderIcon(name)}
                </Button>
              );
            })}
          </div>
        </ScrollArea>

        {normalizedSelectedIcon && (
          <div className="flex items-center justify-between rounded-lg bg-muted p-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Selecionado:</span>
              <span className="flex items-center gap-1 font-medium">
                {renderIcon(normalizedSelectedIcon)}
                {normalizedSelectedIcon}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onSelect("")}>
              Limpar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function LucideIcon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const normalized = normalizeLucideIconName(name);
  const Icon = (LucideIcons as any)[normalized];
  if (!Icon) return null;
  return <Icon className={className} />;
}
