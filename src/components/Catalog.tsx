/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useMemo } from "react";
import { CatalogItem, AppSettings } from "../types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Package,
  Box,
  Settings,
  Search,
  Trash2,
  ListTree,
  Edit,
  Upload,
  Download,
  FileSpreadsheet,
  Printer,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordDialog } from "./PasswordDialog";
import { cn } from "@/lib/utils";

interface CatalogProps {
  items: CatalogItem[];
  settings: AppSettings;
  onSave: (item: CatalogItem) => void;
  onDelete: (id: string) => void;
  adminPassword?: string;
}

export default function Catalog({
  items,
  settings,
  onSave,
  onDelete,
  adminPassword,
}: CatalogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStock, setFilterStock] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  const categories = useMemo(() => {
    const cats = new Set(items.map((i) => i.category).filter(Boolean));
    return ["all", ...Array.from(cats)];
  }, [items]);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [targetDeleteId, setTargetDeleteId] = useState<string | null>(null);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [priceBeforeDiscount, setPriceBeforeDiscount] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [tax, setTax] = useState("15");
  const [type, setType] = useState<"product" | "service">("product");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [vendor, setVendor] = useState("");
  const [stock, setStock] = useState("0");
  const [isBundle, setIsBundle] = useState(false);
  const [bundleItems, setBundleItems] = useState<{ id: string; qty: number }[]>(
    [],
  );
  const [imageBase64, setImageBase64] = useState("");

  const filtered = items.filter((i) => {
    const s = searchTerm.toLowerCase();
    const matchesSearch =
      i.name.toLowerCase().includes(s) ||
      i.category?.toLowerCase().includes(s) ||
      i.vendor?.toLowerCase().includes(s);
    const matchesType = filterType === "all" || i.type === filterType;
    const matchesCategory =
      filterCategory === "all" || i.category === filterCategory;
    let matchesStock = true;
    if (filterStock === "in_stock")
      matchesStock = i.stock !== undefined && i.stock > 0;
    else if (filterStock === "out_of_stock")
      matchesStock = i.stock === undefined || i.stock <= 0;
    return matchesSearch && matchesType && matchesStock && matchesCategory;
  });

  const handleEdit = (item: CatalogItem) => {
    setEditingId(item.id);
    setName(item.name);
    setPrice(item.price.toString());
    setPriceBeforeDiscount(item.priceBeforeDiscount ? item.priceBeforeDiscount.toString() : "");
    setCostPrice(item.costPrice ? item.costPrice.toString() : "");
    setTax(item.tax.toString());
    setType(item.type);
    setSku(item.sku || "");
    setCategory(item.category || "");
    setVendor(item.vendor || "");
    setStock(item.stock ? item.stock.toString() : "0");
    setIsBundle(item.isBundle || false);
    setBundleItems(item.subProducts || []);
    setImageBase64(item.image || "");
    setShowAddDialog(true);
  };

  const bundleTotalCostPrice = useMemo(() => {
    return bundleItems.reduce((acc, bItem) => {
      const p = items.find((i) => i.id === bItem.id);
      return acc + (p?.costPrice || 0) * bItem.qty;
    }, 0);
  }, [bundleItems, items]);

  const bundleTotalSellingPrice = useMemo(() => {
    return bundleItems.reduce((acc, bItem) => {
      const p = items.find((i) => i.id === bItem.id);
      return acc + (p?.price || 0) * bItem.qty;
    }, 0);
  }, [bundleItems, items]);

  const handleSave = () => {
    if (!name || !price) return;
    const item: CatalogItem = {
      id: editingId || Math.random().toString(36).substr(2, 9),
      name,
      price: parseFloat(price),
      priceBeforeDiscount: isBundle ? bundleTotalSellingPrice : (priceBeforeDiscount ? parseFloat(priceBeforeDiscount) : undefined),
      costPrice: isBundle ? bundleTotalCostPrice : (costPrice ? parseFloat(costPrice) : undefined),
      tax: parseFloat(tax),
      type,
      sku,
      category,
      vendor,
      stock: type === "product" ? parseFloat(stock) : undefined,
      isBundle,
      subProducts: isBundle ? bundleItems : undefined,
      image: imageBase64 || undefined,
    };
    onSave(item);
    resetForm();
    setShowAddDialog(false);
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setPrice("");
    setPriceBeforeDiscount("");
    setCostPrice("");
    setTax("15");
    setType("product");
    setSku("");
    setCategory("");
    setVendor("");
    setStock("0");
    setIsBundle(false);
    setBundleItems([]);
    setImageBase64("");
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        "الرقم التعريفي (ID)": "",
        "اسم المنتج": "منتج تجريبي",
        "السعر شامل الضريبة": "115",
        "سعر التكلفة": "100",
        "النوع (product أو service)": "product",
        الباركود: "123456789",
        المخزون: "50",
        الضريبة: "15",
        التصنيف: "عام",
        المورد: "الشركة الموردة",
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Catalog_Template.xlsx");
  };

  const handleExportExcel = () => {
    const dataToExport = items.map((item) => ({
      "الرقم التعريفي (ID)": item.id,
      "اسم المنتج": item.name,
      "السعر شامل الضريبة": item.price,
      "سعر التكلفة": item.costPrice || "",
      "النوع (product أو service)": item.type,
      الباركود: item.sku || "",
      المخزون: item.stock || 0,
      الضريبة: item.tax || 15,
      التصنيف: item.category || "",
      المورد: item.vendor || "",
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Catalog");
    XLSX.writeFile(wb, "Catalog_Export.xlsx");
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        let importedCount = 0;
        data.forEach((row: any) => {
          if (
            !row["اسم المنتج"] ||
            (!row["السعر شامل الضريبة"] && row["السعر شامل الضريبة"] !== 0)
          )
            return; // Skip invalid rows

          const rowId = row["الرقم التعريفي (ID)"]?.toString().trim();
          const rowName = row["اسم المنتج"].toString().trim();
          const rowSku = row["الباركود"]
            ? row["الباركود"].toString().trim()
            : undefined;

          let existingItem = null;
          if (rowId) {
            existingItem = items.find((i) => i.id === rowId);
          }
          if (!existingItem && rowSku) {
            existingItem = items.find((i) => i.sku === rowSku);
          }
          if (!existingItem) {
            existingItem = items.find((i) => i.name === rowName);
          }

          const newItem: CatalogItem = {
            id: existingItem
              ? existingItem.id
              : rowId || Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: rowName,
            price: Number(row["السعر شامل الضريبة"]) || 0,
            costPrice: row["سعر التكلفة"]
              ? Number(row["سعر التكلفة"])
              : existingItem?.costPrice,
            type:
              row["النوع (product أو service)"] === "service" ||
              row["النوع (product أو service)"] === "خدمة"
                ? "service"
                : existingItem?.type || "product",
            sku: rowSku || existingItem?.sku,
            stock:
              row["المخزون"] !== undefined && row["المخزون"] !== ""
                ? Number(row["المخزون"])
                : (existingItem?.stock ??
                  (row["النوع (product أو service)"] === "service" ||
                  row["النوع (product أو service)"] === "خدمة"
                    ? undefined
                    : 0)),
            tax: row["الضريبة"]
              ? Number(row["الضريبة"])
              : (existingItem?.tax ?? 15),
            category: row["التصنيف"]
              ? row["التصنيف"].toString()
              : existingItem?.category,
            vendor: row["المورد"]
              ? row["المورد"].toString()
              : existingItem?.vendor,
            isBundle: existingItem?.isBundle || false,
            subProducts: existingItem?.subProducts || [],
            image: existingItem?.image,
          };
          onSave(newItem);
          importedCount++;
        });

        toast.success(`تم استيراد ${importedCount} صنف بنجاح.`);
      } catch (error) {
        console.error("Error importing Excel:", error);
        toast.error(
          "حدث خطأ أثناء استيراد الملف. تأكد من استخدام القالب الصحيح.",
        );
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addBundleItem = (id: string) => {
    if (bundleItems.find((i) => i.id === id)) return;
    setBundleItems([...bundleItems, { id, qty: 1 }]);
  };

  const handlePrintPickingList = () => {
    const list = filtered.filter(
      (i) => i.type === "product" && (i.stock === undefined || i.stock <= 5),
    );
    if (list.length === 0) return alert("لا توجد منتجات ناقصة أو بحاجة لطلب");

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html dir="rtl" lang="ar">
        <head>
          <title>قائمة طلب المشتريات (النواقص)</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: right; }
            th { background-color: #f3f4f6; }
          </style>
        </head>
        <body>
          <h2>قائمة طلب المشتريات / النواقص</h2>
          <p>تاريخ الطباعة: ${new Date().toLocaleDateString("ar-SA")}</p>
          <table>
            <thead>
              <tr>
                <th>التصنيف</th>
                <th>اسم المنتج</th>
                <th>الباركود</th>
                <th>المورد</th>
                <th>المخزون الحالي</th>
              </tr>
            </thead>
            <tbody>
              ${list
                .map(
                  (i) => `
                <tr>
                  <td>${i.category || "-"}</td>
                  <td>${i.name}</td>
                  <td>${i.sku || "-"}</td>
                  <td>${i.vendor || "-"}</td>
                  <td style="color:red; font-weight:bold;">${i.stock || 0}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white/5 p-4 rounded-xl border border-white/5">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-white/40" />
            <Input
              placeholder="البحث بالاسم أو الباركود / QR..."
              className="pr-10 bg-black/20 border-white/10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[140px] bg-black/20 border-white/10">
              <SelectValue placeholder="النوع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              <SelectItem value="product">منتج</SelectItem>
              <SelectItem value="service">خدمة</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[140px] bg-black/20 border-white/10">
              <SelectValue placeholder="التصنيف" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat, idx) => (
                <SelectItem key={`${cat}-${idx}`} value={cat}>
                  {cat === "all" ? "كل التصنيفات" : cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStock} onValueChange={setFilterStock}>
            <SelectTrigger className="w-[140px] bg-black/20 border-white/10">
              <SelectValue placeholder="المخزون" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="in_stock">متوفر</SelectItem>
              <SelectItem value="out_of_stock">غير متوفر / نافذ</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-white/10"
            onClick={handleDownloadTemplate}
            title="تحميل قالب إكسل"
          >
            <FileSpreadsheet className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="border-white/10"
            onClick={() => fileInputRef.current?.click()}
            title="استيراد اكسل"
          >
            <Upload className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="border-white/10"
            onClick={handleExportExcel}
            title="تصدير اكسل"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="border-white/10"
            onClick={handlePrintPickingList}
            title="طباعة النواقص (مشتريات)"
          >
            <Printer className="h-4 w-4" />
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".xlsx, .xls"
            onChange={handleImportExcel}
          />

          <Dialog
            open={showAddDialog}
            onOpenChange={(open) => {
              setShowAddDialog(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button
                className="bg-purple-600 hover:bg-purple-500"
                onClick={resetForm}
              >
                <Plus className="ml-2 h-4 w-4" />
                إضافة صنف
              </Button>
            </DialogTrigger>
            <DialogContent
              className="glass border-white/10 text-white flex flex-col"
              style={{ maxWidth: "800px", height: "500px", width: "100%" }}
            >
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "تعديل منتج" : "إضافة منتج جديد"}
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto pr-2 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>اسم المنتج</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-white/5 border-white/10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>المورد (الشركة)</Label>
                    <Input
                      value={vendor}
                      onChange={(e) => setVendor(e.target.value)}
                      className="bg-white/5 border-white/10"
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>صورة المنتج</Label>
                    <div className="flex items-center gap-4">
                      {imageBase64 && (
                        <div className="relative group">
                          <img
                            src={imageBase64}
                            alt="Preview"
                            className="w-12 h-12 rounded object-cover border border-white/10 bg-white/5"
                          />
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute -top-2 -right-2 h-5 w-5 rounded-full hidden group-hover:flex"
                            onClick={() => setImageBase64("")}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setImageBase64(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="bg-white/5 border-white/10 cursor-pointer"
                      />
                    </div>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <div className="flex items-center space-x-2 rtl:space-x-reverse border border-white/10 p-3 rounded-lg bg-white/5">
                      <Checkbox
                        id="isBundle"
                        checked={isBundle}
                        onCheckedChange={(c) => setIsBundle(!!c)}
                      />
                      <label
                        htmlFor="isBundle"
                        className="text-sm font-medium leading-none cursor-pointer"
                      >
                        هذا صنف مجمع (يحتوي على منتجات أخرى)
                      </label>
                    </div>
                  </div>

                  {isBundle && (
                    <div className="col-span-2 space-y-4 border border-white/10 p-4 rounded-lg bg-black/20">
                      <h4 className="font-medium text-purple-400">مكونات المنتج المجمع</h4>
                      <div className="space-y-2">
                        <Label>إضافة منتج للبكج</Label>
                        <Select onValueChange={addBundleItem}>
                          <SelectTrigger className="bg-white/5 border-white/10">
                            <SelectValue placeholder="اختر منتجاً..." />
                          </SelectTrigger>
                          <SelectContent>
                            {items
                              .filter((i) => i.id !== editingId && !i.isBundle)
                              .map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.name} ({item.price} ر.س)
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {bundleItems.length > 0 && (
                        <div className="space-y-2 mt-4">
                          <Label>المنتجات المختارة</Label>
                          <div className="grid grid-cols-1 gap-2">
                            {bundleItems.map((bItem) => {
                              const p = items.find((i) => i.id === bItem.id);
                              if (!p) return null;
                              return (
                                <div key={bItem.id} className="flex items-center justify-between bg-white/5 p-2 rounded border border-white/10">
                                  <span className="text-sm">{p.name}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-white/50">{p.price} ر.س</span>
                                    <Input 
                                      type="number" 
                                      className="w-16 h-8 text-center bg-black/20 border-white/10" 
                                      value={bItem.qty}
                                      onChange={(e) => {
                                        const newQty = parseInt(e.target.value) || 1;
                                        setBundleItems(bundleItems.map(x => x.id === bItem.id ? { ...x, qty: newQty } : x));
                                      }}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                                      onClick={() => setBundleItems(bundleItems.filter(x => x.id !== bItem.id))}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="flex flex-col gap-1 mt-4 p-3 bg-white/5 border border-white/10 rounded-lg">
                            <div className="flex justify-between text-sm">
                              <span className="text-white/60">تكلفة المنتجات المختارة:</span>
                              <span className="font-mono text-red-300">{bundleTotalCostPrice.toFixed(2)} ر.س</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-white/60">سعر بيع المنتجات قبل الخصم:</span>
                              <span className="font-mono text-blue-300">{bundleTotalSellingPrice.toFixed(2)} ر.س</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!isBundle && (
                    <div className="space-y-2">
                      <Label>سعر التكلفة (قبل الضريبة)</Label>
                      <Input
                        type="number"
                        value={costPrice}
                        onChange={(e) => setCostPrice(e.target.value)}
                        className="bg-white/5 border-white/10"
                      />
                      <p className="text-xs text-white/50">
                        يجب وضع سعر التكلفة غير شامل للضريبة.
                      </p>
                    </div>
                  )}
                  {!isBundle && (
                    <div className="space-y-2">
                      <Label>سعر البيع الأساسي (قبل الخصم) - اختياري</Label>
                      <Input
                        type="number"
                        value={priceBeforeDiscount}
                        onChange={(e) => setPriceBeforeDiscount(e.target.value)}
                        className="bg-white/5 border-white/10"
                        placeholder="مثال: 1500"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>{isBundle ? "سعر بيع البكج بعد الخصم (شامل الضريبة)" : "سعر البيع بعد الخصم (وإلا فهو السعر الأساسي)"}</Label>
                    <Input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="bg-white/5 border-white/10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>السعر قبل الضريبة (محسوب آلياً)</Label>
                    <Input
                      type="number"
                      disabled
                      value={
                        price
                          ? (
                              Number(price) /
                              (1 + (Number(tax) || 15) / 100)
                            ).toFixed(2)
                          : ""
                      }
                      className="bg-white/5 border-white/10 opacity-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>رقم الموديل (SKU)</Label>
                    <Input
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      className="bg-white/5 border-white/10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>التصنيف</Label>
                    <Input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="bg-white/5 border-white/10"
                      placeholder="مثال: إلكترونيات، عطور، ملابس"
                    />
                    {settings?.categories && settings.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {settings.categories.map((cat, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="text-xs cursor-pointer hover:bg-white/10"
                            onClick={() => setCategory(cat)}
                          >
                            {cat}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>الكمية المتوفرة</Label>
                    <Input
                      type="number"
                      value={stock}
                      onChange={(e) => setStock(e.target.value)}
                      className="bg-white/5 border-white/10"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter className="mt-auto pt-4 border-t border-white/10">
                <Button
                  variant="outline"
                  onClick={() => setShowAddDialog(false)}
                >
                  إلغاء
                </Button>
                <Button
                  onClick={handleSave}
                  className="bg-purple-600 hover:bg-purple-500"
                >
                  حفظ المنتج
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-white/5 rounded-xl border border-white/5">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-white/10">
              <TableHead className="w-16"></TableHead>
              <TableHead className="text-right">الصنف</TableHead>
              <TableHead className="text-right">الموديل</TableHead>
              <TableHead className="text-right">النوع</TableHead>
              <TableHead className="text-right">المخزون</TableHead>
              <TableHead className="text-right">السعر</TableHead>
              <TableHead className="text-left">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item, idx) => (
              <TableRow
                key={`${item.id}-${idx}`}
                className="border-white/5 hover:bg-white/[0.02]"
              >
                <TableCell>
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-10 h-10 object-cover rounded bg-white/10"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center"></div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium flex items-center">
                      {item.isBundle && (
                        <ListTree className="ml-2 h-4 w-4 text-orange-400" />
                      )}
                      {item.name}
                    </span>
                    <div className="flex gap-2 mt-1">
                      {item.category && (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 py-0 px-2 cursor-pointer border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
                          onClick={() => setFilterCategory(item.category!)}
                        >
                          {item.category}
                        </Badge>
                      )}
                      {item.isBundle && (
                        <span className="text-[10px] text-white/40">
                          يحتوي على {item.subProducts?.length} أصناف فرعية
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-white/60">
                  {item.sku || "-"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      item.type === "product"
                        ? "border-blue-400/50 text-blue-400"
                        : "border-emerald-400/50 text-emerald-400"
                    }
                  >
                    {item.type === "product" ? "منتج" : "خدمة"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {item.type === "product" ? (
                    <span
                      className={cn(
                        "font-mono",
                        (item.stock || 0) <= 5
                          ? "text-red-400"
                          : "text-white/60",
                      )}
                    >
                      {item.isBundle ? "-" : item.stock}
                    </span>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-green-400">
                        {item.price} ر.س
                      </span>
                      {(item.priceBeforeDiscount ?? 0) > item.price && (
                        <span className="text-[10px] text-red-400 line-through">
                          {item.priceBeforeDiscount} ر.س
                        </span>
                      )}
                    </div>
                    {item.costPrice && (
                      <span className="text-[10px] text-white/50 block mt-1">
                        التكلفة: {item.costPrice} ر.س | مع الضريبة: {((item.costPrice || 0) * (1 + (item.tax || 0) / 100)).toFixed(2)} ر.س
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 text-red-400 hover:text-red-300 border-white/10"
                      onClick={() => setTargetDeleteId(item.id)}
                      title="حذف المنتج"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 text-blue-400 hover:text-blue-300 border-white/10"
                      onClick={() => handleEdit(item)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PasswordDialog
        open={!!targetDeleteId}
        onOpenChange={(val) => {
          if (!val) setTargetDeleteId(null);
        }}
        adminPassword={adminPassword}
        onSuccess={() => {
          if (targetDeleteId) onDelete(targetDeleteId);
          setTargetDeleteId(null);
          toast.success("تم حذف المنتج بنجاح");
        }}
        title="تأكيد الحذف"
        description="يرجى إدخال كلمة مرور المسؤول لتأكيد حذف هذا المنتج"
      />
    </div>
  );
}
