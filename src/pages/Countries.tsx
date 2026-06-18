import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Globe, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Country {
  id: string;
  name: string;
  code: string;
  phone_code: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export default function Countries() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCountry, setEditingCountry] = useState<Country | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    phone_code: "",
    is_active: true,
    sort_order: 0,
  });

  useEffect(() => {
    loadCountries();
  }, []);

  const loadCountries = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("countries")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setCountries(data || []);
    } catch (error: any) {
      toast.error("Error loading countries");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (country?: Country) => {
    if (country) {
      setEditingCountry(country);
      setFormData({
        name: country.name,
        code: country.code,
        phone_code: country.phone_code || "",
        is_active: country.is_active,
        sort_order: country.sort_order,
      });
    } else {
      setEditingCountry(null);
      setFormData({
        name: "",
        code: "",
        phone_code: "",
        is_active: true,
        sort_order: countries.length + 1,
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.code) {
      toast.error("Name and code are required");
      return;
    }

    try {
      if (editingCountry) {
        const { error } = await supabase
          .from("countries")
          .update({
            name: formData.name,
            code: formData.code.toUpperCase(),
            phone_code: formData.phone_code || null,
            is_active: formData.is_active,
            sort_order: formData.sort_order,
          })
          .eq("id", editingCountry.id);

        if (error) throw error;
        toast.success("Country updated successfully");
      } else {
        const { error } = await supabase.from("countries").insert({
          name: formData.name,
          code: formData.code.toUpperCase(),
          phone_code: formData.phone_code || null,
          is_active: formData.is_active,
          sort_order: formData.sort_order,
        });

        if (error) throw error;
        toast.success("Country created successfully");
      }

      setDialogOpen(false);
      loadCountries();
    } catch (error: any) {
      toast.error(error.message || "Error saving country");
      console.error(error);
    }
  };

  const handleDelete = async (country: Country) => {
    if (!confirm(`Are you sure you want to delete "${country.name}"?`)) return;

    try {
      const { error } = await supabase
        .from("countries")
        .delete()
        .eq("id", country.id);

      if (error) throw error;
      toast.success("Country deleted successfully");
      loadCountries();
    } catch (error: any) {
      toast.error(error.message || "Error deleting country");
      console.error(error);
    }
  };

  const filteredCountries = countries.filter(
    (country) =>
      country.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      country.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Countries</h1>
          <p className="text-muted-foreground">
            Manage the list of countries available in the system
          </p>
        </div>

        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search countries..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            New Country
          </Button>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Phone Code</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredCountries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    No countries found
                  </TableCell>
                </TableRow>
              ) : (
                filteredCountries.map((country) => (
                  <TableRow key={country.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        {country.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{country.code}</Badge>
                    </TableCell>
                    <TableCell>{country.phone_code || "-"}</TableCell>
                    <TableCell>{country.sort_order}</TableCell>
                    <TableCell>
                      <Badge variant={country.is_active ? "default" : "secondary"}>
                        {country.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(country)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(country)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCountry ? "Edit Country" : "New Country"}
            </DialogTitle>
            <DialogDescription>
              {editingCountry
                ? "Update the country information"
                : "Add a new country to the system"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="E.g.: Portugal"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Code (ISO) *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toUpperCase() })
                  }
                  placeholder="E.g.: PT"
                  maxLength={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone_code">Phone Code</Label>
                <Input
                  id="phone_code"
                  value={formData.phone_code}
                  onChange={(e) =>
                    setFormData({ ...formData, phone_code: e.target.value })
                  }
                  placeholder="E.g.: +351"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sort_order">Sort Order</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) =>
                    setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })
                  }
                />
              </div>

              <div className="flex items-center space-x-2 pt-6">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_active: checked })
                  }
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingCountry ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
