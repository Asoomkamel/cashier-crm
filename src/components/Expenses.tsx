import React, { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Search,
  Trash2,
  Calendar as CalendarIcon,
  ArrowRightLeft,
  X,
  Settings,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Expense, AppSettings } from "../types";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface ExpensesProps {
  expenses: Expense[];
  settings?: AppSettings;
  onSave: (expense: Expense) => void;
  onDelete: (id: string) => void;
  setSettings?: (s: AppSettings) => void;
  onUpdate?: (id: string, updates: Partial<Expense>) => void;
}

export default function Expenses({
  expenses,
  settings,
  onSave,
  onDelete,
  setSettings,
  onUpdate,
}: ExpensesProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCategoriesDialog, setShowCategoriesDialog] = useState(false);
  const [manageCategoryInput, setManageCategoryInput] = useState("");

  const handleAddCategory = () => {
    if (!manageCategoryInput.trim() || !setSettings) return;
    const currentCats = settings?.expenseCategories || [];
    if (!currentCats.includes(manageCategoryInput.trim())) {
      setSettings({
        ...settings!,
        expenseCategories: [...currentCats, manageCategoryInput.trim()],
      });
    }
    setManageCategoryInput("");
  };

  const handleDeleteCategory = (catToDelete: string) => {
    if (!setSettings) return;
    const currentCats = settings?.expenseCategories || [];
    setSettings({
      ...settings!,
      expenseCategories: currentCats.filter((c) => c !== catToDelete),
    });
  };

  // Transfer State
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferExpenseId, setTransferExpenseId] = useState("");
  const [transferTechName, setTransferTechName] = useState("none");

  // Filter State
  const [filterTech, setFilterTech] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterDesc, setFilterDesc] = useState("");

  const uniqueCategories = useMemo(() => {
    const fromExpenses = expenses.map((e) => e.category);
    const fromSettings = settings?.expenseCategories || [];
    return Array.from(new Set([...fromExpenses, ...fromSettings]));
  }, [expenses, settings?.expenseCategories]);

  // Form State
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [description, setDescription] = useState("");
  const [expenseType, setExpenseType] = useState<"internal" | "external">("internal");
  const [taxAmount, setTaxAmount] = useState("");
  const [isTaxDeductible, setIsTaxDeductible] = useState(false);
  const [technicianName, setTechnicianName] = useState<string>("none");
  const [isCustody, setIsCustody] = useState(false);

  const resetForm = () => {
    setAmount("");
    setCategory("");
    setNewCategory("");
    setIsAddingNewCategory(false);
    setDescription("");
    setExpenseType("internal");
    setTaxAmount("");
    setIsTaxDeductible(false);
    setTechnicianName("none");
    setIsCustody(false);
  };

  const handleSave = () => {
    const finalCategory = isCustody ? "عهدة فني" : (isAddingNewCategory ? newCategory : category);
    
    if (!amount || !finalCategory) {
      toast.error("يرجى إكمال البيانات المطلوبة");
      return;
    }
    
    if (isCustody && technicianName === "none") {
      toast.error("يرجى تحديد الفني");
      return;
    }

    let updatedSettings = { ...settings } as any;
    let shouldUpdateSettings = false;

    if (
      setSettings && !isCustody &&
      isAddingNewCategory &&
      !uniqueCategories.includes(finalCategory)
    ) {
      updatedSettings.expenseCategories = [
        ...(updatedSettings.expenseCategories || []),
        finalCategory,
      ];
      shouldUpdateSettings = true;
    }

    if (isCustody && technicianName !== "none" && setSettings) {
      const numAmount = parseFloat(amount);
      updatedSettings.technicians = (updatedSettings.technicians || []).map((tech: any) => {
        if (tech.name === technicianName) {
          return {
            ...tech,
            balance: (tech.balance || 0) + numAmount,
          };
        }
        return tech;
      });
      shouldUpdateSettings = true;
    }

    if (shouldUpdateSettings && setSettings) {
      setSettings(updatedSettings);
    }

    const newExpense: Expense = {
      id: Math.random().toString(36).substr(2, 9),
      date: Date.now(),
      amount: parseFloat(amount),
      category: finalCategory,
      description,
      expenseType: isCustody ? "internal" : expenseType,
      taxAmount: taxAmount ? parseFloat(taxAmount) : 0,
      isTaxDeductible,
      technicianName: technicianName !== "none" ? technicianName : undefined,
    };

    onSave(newExpense);
    setShowAddDialog(false);
    resetForm();
  };

  const handleTransfer = () => {
    if (!transferExpenseId || !onUpdate) return;
    onUpdate(transferExpenseId, {
      technicianName:
        transferTechName !== "none" ? transferTechName : undefined,
    });
    setShowTransferDialog(false);
    setTransferExpenseId("");
    setTransferTechName("none");
  };

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((e) => {
        const matchTech =
          filterTech === "all" || e.technicianName === filterTech;
        const matchCat =
          filterCategory === "all" || e.category === filterCategory;
        const matchDesc =
          !filterDesc ||
          e.description.toLowerCase().includes(filterDesc.toLowerCase());

        let matchDate = true;
        if (filterDateFrom || filterDateTo) {
          const ed = new Date(e.date);
          const fd = filterDateFrom ? new Date(filterDateFrom) : null;
          const td = filterDateTo ? new Date(filterDateTo) : null;
          if (fd) fd.setHours(0, 0, 0, 0);
          if (td) td.setHours(23, 59, 59, 999);
          if (fd && ed < fd) matchDate = false;
          if (td && ed > td) matchDate = false;
        }

        return matchTech && matchCat && matchDesc && matchDate;
      })
      .sort((a, b) => b.date - a.date);
  }, [
    expenses,
    filterTech,
    filterDateFrom,
    filterDateTo,
    filterCategory,
    filterDesc,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <h2 className="text-2xl font-bold">المصروفات</h2>
        <div className="flex gap-2">
          <Dialog
            open={showCategoriesDialog}
            onOpenChange={setShowCategoriesDialog}
          >
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="border-white/10 glass text-white hover:bg-white/10"
              >
                <Settings className="ml-2 h-4 w-4" />
                إدارة التصنيفات
              </Button>
            </DialogTrigger>
            <DialogContent className="glass border-white/10 text-white">
              <DialogHeader>
                <DialogTitle>إدارة تصنيفات المصروفات</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex gap-2">
                  <Input
                    value={manageCategoryInput}
                    onChange={(e) => setManageCategoryInput(e.target.value)}
                    className="bg-white/5 border-white/10"
                    placeholder="اسم التصنيف الجديد..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddCategory();
                    }}
                  />
                  <Button
                    onClick={handleAddCategory}
                    className="bg-blue-600 hover:bg-blue-500"
                  >
                    إضافة
                  </Button>
                </div>
                <div className="space-y-2 mt-4">
                  <Label className="text-white/70">التصنيفات المحفوظة:</Label>
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-white/10">
                    {(settings?.expenseCategories || []).length === 0 ? (
                      <p className="text-sm text-white/40 text-center py-4">
                        لا توجد تصنيفات محفوظة
                      </p>
                    ) : (
                      (settings?.expenseCategories || []).map((catName) => (
                        <div
                          key={catName}
                          className="flex justify-between items-center bg-white/5 border border-white/10 rounded-md p-2"
                        >
                          <span>{catName}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-400/20"
                            onClick={() => handleDeleteCategory(catName)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={showAddDialog}
            onOpenChange={(open) => {
              setShowAddDialog(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button className="bg-purple-600 hover:bg-purple-500">
                <Plus className="ml-2 h-4 w-4" />
                إضافة مصروف
              </Button>
            </DialogTrigger>
            <DialogContent className="glass border-white/10 text-white">
              <DialogHeader>
                <DialogTitle>تسجيل مصروف جديد</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex flex-col gap-4 border border-white/10 p-3 rounded-md bg-white/5 mb-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={isCustody}
                      onCheckedChange={setIsCustody}
                    />
                    <Label>هذا المصروف عبارة عن عهدة فني؟</Label>
                  </div>
                  {!isCustody && (
                    <div className="flex items-center gap-4 pt-2 border-t border-white/5">
                      <Label>نوع الطلب:</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          variant={expenseType === "internal" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setExpenseType("internal")}
                          className={expenseType === "internal" ? "bg-white text-black" : ""}
                        >
                          مصروف داخلي
                        </Button>
                        <Button
                          variant={expenseType === "external" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setExpenseType("external")}
                          className={expenseType === "external" ? "bg-purple-600 text-white" : ""}
                        >
                          مصروف خارجي
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label>المبلغ (شامل الضريبة إن وجدت)</Label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-white/5 border-white/10"
                    placeholder="مثال: 500"
                  />
                </div>
                
                {!isCustody && (
                  <div className="space-y-2">
                    <Label>تصنيف المصروف</Label>
                    {!isAddingNewCategory ? (
                      <Select
                        value={category}
                        onValueChange={(val) => {
                          if (val === "ADD_NEW") setIsAddingNewCategory(true);
                          else setCategory(val);
                        }}
                      >
                        <SelectTrigger
                          className="bg-white/5 border-white/10 text-white text-right"
                          dir="rtl"
                        >
                          <SelectValue placeholder="اختر التصنيف..." />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1d24] border-white/10 text-white">
                          {uniqueCategories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                          <SelectItem
                            value="ADD_NEW"
                            className="text-purple-400 font-bold border-t border-white/5 mt-1 pt-1"
                          >
                            + إضافة تصنيف جديد...
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          className="bg-white/5 border-white/10"
                          placeholder="اسم التصنيف الجديد..."
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 hover:bg-white/10"
                          onClick={() => setIsAddingNewCategory(false)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label>البيان / الوصف</Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="bg-white/5 border-white/10"
                  />
                </div>
                
                {!isCustody && (
                  <>
                    <div className="flex items-center gap-2 border border-white/10 p-3 rounded-md bg-white/5">
                      <Switch
                        checked={isTaxDeductible}
                        onCheckedChange={setIsTaxDeductible}
                      />
                      <Label>يتضمن ضريبة قابلة للخصم؟</Label>
                    </div>
                    {isTaxDeductible && (
                      <div className="space-y-2">
                        <Label>مبلغ الضريبة</Label>
                        <Input
                          type="number"
                          value={taxAmount}
                          onChange={(e) => setTaxAmount(e.target.value)}
                          className="bg-white/5 border-white/10"
                          placeholder="مثال: 75"
                        />
                      </div>
                    )}
                  </>
                )}
                
                <div className="space-y-2">
                  <Label>{isCustody ? "اسم الفني المودع له العهدة" : "تخصيص للفني (اختياري)"}</Label>
                  <Select
                    value={technicianName}
                    onValueChange={setTechnicianName}
                  >
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="اختر الفني" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1d24] border-white/10 text-white">
                      <SelectItem value="none">بدون فني</SelectItem>
                      {settings?.technicians?.map((tech) => (
                        <SelectItem key={tech.id} value={tech.name}>
                          {tech.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={handleSave}>
                  حفظ المصروف
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Transfer Dialog */}
          <Dialog
            open={showTransferDialog}
            onOpenChange={setShowTransferDialog}
          >
            <DialogContent className="glass border-white/10 text-white">
              <DialogHeader>
                <DialogTitle>تحويل المصروف لفني</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>الفني</Label>
                  <Select
                    value={transferTechName}
                    onValueChange={setTransferTechName}
                  >
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="اختر الفني" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1d24] border-white/10 text-white">
                      <SelectItem value="none">بدون فني</SelectItem>
                      {settings?.technicians?.map((tech) => (
                        <SelectItem key={tech.id} value={tech.name}>
                          {tech.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-500"
                  onClick={handleTransfer}
                >
                  حفظ التحويل
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-white/70">تاريخ من</Label>
          <Input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="bg-white/5 border-white/10 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-white/70">تاريخ إلى</Label>
          <Input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="bg-white/5 border-white/10 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-white/70">الفني</Label>
          <Select value={filterTech} onValueChange={setFilterTech}>
            <SelectTrigger className="bg-white/5 border-white/10 text-xs">
              <SelectValue placeholder="اختر الفني" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d24] border-white/10 text-white">
              <SelectItem value="all">الكل</SelectItem>
              {settings?.technicians?.map((tech) => (
                <SelectItem key={tech.id} value={tech.name}>
                  {tech.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-white/70">التصنيف</Label>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger
              className="bg-white/5 border-white/10 text-xs text-right"
              dir="rtl"
            >
              <SelectValue placeholder="اختر التصنيف" />
            </SelectTrigger>
            <SelectContent
              className="bg-[#1a1d24] border-white/10 text-white text-right"
              dir="rtl"
            >
              <SelectItem value="all">الكل</SelectItem>
              {uniqueCategories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-white/70">البيان (بحث)</Label>
          <div className="relative">
            <Search className="absolute right-3 top-2.5 h-3 w-3 text-white/40" />
            <Input
              placeholder="بحث بنص البيان..."
              value={filterDesc}
              onChange={(e) => setFilterDesc(e.target.value)}
              className="bg-white/5 border-white/10 text-xs pr-8"
            />
          </div>
        </div>
      </div>

      <div className="glass rounded-xl border border-white/10 overflow-hidden min-w-0">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-white/5">
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">التصنيف</TableHead>
              <TableHead className="text-right">البيان</TableHead>
              <TableHead className="text-right">الفني</TableHead>
              <TableHead className="text-right">المبلغ</TableHead>
              <TableHead className="text-right">الضريبة</TableHead>
              <TableHead className="text-center">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredExpenses.map((expense, idx) => (
              <TableRow
                key={`${expense.id}-${idx}`}
                className="border-white/10 hover:bg-white/5 transition-colors"
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-white/40" />
                    <span>
                      {format(newExpenseDate(expense.date), "PPP", {
                        locale: ar,
                      })}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-blue-400">
                      {expense.category}
                    </span>
                    {expense.expenseType === "external" && (
                      <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded w-fit">
                        مصروف خارجي
                      </span>
                    )}
                    {expense.expenseType === "internal" && expense.category !== "عهدة فني" && (
                      <span className="text-[10px] bg-white/10 text-white/70 px-1.5 py-0.5 rounded w-fit">
                        مصروف داخلي
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>{expense.description}</TableCell>
                <TableCell>
                  {expense.technicianName ? (
                    <span className="text-sm text-amber-400 bg-amber-400/10 px-2 py-1 rounded-md">
                      {expense.technicianName}
                    </span>
                  ) : (
                    <span className="text-white/40">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="font-bold text-green-400">
                    {expense.amount} ر.س
                  </span>
                </TableCell>
                <TableCell>
                  {expense.isTaxDeductible && expense.taxAmount ? (
                    <span className="text-orange-400">
                      {expense.taxAmount} ر.س
                    </span>
                  ) : (
                    <span className="text-white/40">-</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    {onUpdate && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-400/20"
                        title="تحويل الفني أو النقل"
                        onClick={() => {
                          setTransferExpenseId(expense.id);
                          setTransferTechName(expense.technicianName || "none");
                          setShowTransferDialog(true);
                        }}
                      >
                        <ArrowRightLeft className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-400/20"
                      onClick={() => onDelete(expense.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredExpenses.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-8 text-white/50"
                >
                  لا توجد مصروفات مسجلة
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function newExpenseDate(timestamp: number) {
  return new Date(timestamp);
}
