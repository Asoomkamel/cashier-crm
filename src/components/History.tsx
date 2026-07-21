/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Order, Customer } from "../types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  Printer,
  Search,
  Lock,
  ShieldCheck,
  History as HistoryIcon,
  RotateCcw,
  FileText,
  ChevronDown,
  ChevronUp,
  User,
  MapPin,
  Edit,
  CheckCircle,
  Download,
} from "lucide-react";
import * as xlsx from "xlsx";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PasswordDialog } from "./PasswordDialog";

interface HistoryProps {
  orders: Order[];
  customers?: Customer[];
  onDelete: (id: string) => void;
  onPrint: (order: Order) => void;
  onEdit?: (order: Order) => void;
  onReturn?: (id: string, quantities: Record<string, number>) => void;
  onConvertToInvoice?: (id: string) => void;
  adminPassword: string;
}

export default function History({
  orders,
  customers = [],
  onDelete,
  onPrint,
  onEdit,
  onReturn,
  onConvertToInvoice,
  adminPassword,
}: HistoryProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterWho, setFilterWho] = useState("");
  const [filterToWhere, setFilterToWhere] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [targetOrderId, setTargetOrderId] = useState<string | null>(null);
  const [targetPrintOrder, setTargetPrintOrder] = useState<Order | null>(null);
  const [targetReturnOrder, setTargetReturnOrder] = useState<Order | null>(
    null,
  );
  const [returnQuantities, setReturnQuantities] = useState<
    Record<string, number>
  >({});
  const [passwordInput, setPasswordInput] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Date filters
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const handleReturnClick = (order: Order) => {
    setTargetReturnOrder(order);
    const initialQtys: Record<string, number> = {};
    order.items.forEach((i) => {
      initialQtys[i.catalogId] = 0;
    });
    setReturnQuantities(initialQtys);
    setShowReturnDialog(true);
  };

  const confirmReturnAction = () => {
    if (targetReturnOrder && onReturn) {
      onReturn(targetReturnOrder.id, returnQuantities);
    }
    setShowReturnDialog(false);
    setTargetReturnOrder(null);
  };

  const filtered = orders
    .filter((o) => {
      // Apply date filters
      if (filterDateFrom) {
        if (new Date(o.date) < new Date(filterDateFrom)) return false;
      }
      if (filterDateTo) {
        const toDate = new Date(filterDateTo);
        toDate.setHours(23, 59, 59, 999);
        if (new Date(o.date) > toDate) return false;
      }

      const s = searchTerm.toLowerCase();
      const customerName = o.customerName || "عميل نقدي";
      const matchesSearch =
        !s ||
        customerName.toLowerCase().includes(s) ||
        o.id.toLowerCase().includes(s);

      if (!matchesSearch) return false;

      // Filter by "Who" (Technician/Salesperson or Customer)
      if (filterWho) {
        const whoVal = filterWho.toLowerCase();
        const matchesTech =
          o.technicianName && o.technicianName.toLowerCase().includes(whoVal);
        const matchesCust = customerName.toLowerCase().includes(whoVal);
        if (!matchesTech && !matchesCust) return false;
      }

      // Filter by "To Where" (customer address, city, company, or order notes)
      if (filterToWhere) {
        const toVal = filterToWhere.toLowerCase();
        const matchesNotes = o.notes && o.notes.toLowerCase().includes(toVal);

        const customer = customers.find((c) => c.id === o.customerId);
        const matchesCustAddress =
          customer?.address && customer.address.toLowerCase().includes(toVal);
        const matchesCustCompany =
          customer?.companyName &&
          customer.companyName.toLowerCase().includes(toVal);
        const matchesLocations = customer?.locations?.some(
          (l) =>
            (l.city && l.city.toLowerCase().includes(toVal)) ||
            (l.address && l.address.toLowerCase().includes(toVal)),
        );

        if (
          !matchesNotes &&
          !matchesCustAddress &&
          !matchesCustCompany &&
          !matchesLocations
        )
          return false;
      }

      return true;
    })
    .sort((a, b) => b.date - a.date);

  const toggleExpand = (id: string) => {
    setExpandedOrderId((prev) => (prev === id ? null : id));
  };

  const handleDeleteClick = (id: string) => {
    setTargetOrderId(id);
    setShowDeleteDialog(true);
  };

  const handlePrintClick = (order: Order) => {
    setTargetPrintOrder(order);
    setShowPrintDialog(true);
  };

  const confirmDelete = () => {
    if (passwordInput === adminPassword) {
      if (targetOrderId) onDelete(targetOrderId);
      setShowDeleteDialog(false);
      setPasswordInput("");
      setTargetOrderId(null);
      toast.success("تم حذف السجل بنجاح");
    } else {
      toast.error("كلمة المرور غير صحيحة");
    }
  };

  const confirmPrintAction = () => {
    if (targetPrintOrder) {
      onPrint(targetPrintOrder);
    }
    setShowPrintDialog(false);
    setTargetPrintOrder(null);
  };

  const handleExportSales = () => {
    try {
      const exportData = filtered.map((o) => ({
        "رقم العملية": o.id,
        "التاريخ": format(o.date, "yyyy/MM/dd hh:mm a", { locale: arSA }),
        "العميل": o.customerName || "عميل نقدي",
        "النوع": o.type === "tax_invoice" ? "فاتورة ضريبية" : o.type === "return_invoice" ? "مرتجع مبيعات" : "عرض سعر",
        "الحالة": o.status === "returned" ? "تم الإرجاع" : "فعال",
        "طريقة الدفع": o.paymentMethod === "cash" ? "كاش" : o.paymentMethod === "network" ? "شبكة" : o.paymentMethod === "bank_transfer" ? "تحويل" : "آجل",
        "الإجمالي": o.grandTotal,
        "المبلغ المدفوع": o.paidAmount || 0,
        "المبلغ المتبقي": o.remainingAmount || 0,
        "عمولة الفني": o.technicianCommission || 0,
        "الفني": o.technicianName || "",
        "المدينة": o.branchId || "",
        "الملاحظات": o.notes || ""
      }));
      const ws = xlsx.utils.json_to_sheet(exportData);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "سجل المبيعات");
      xlsx.writeFile(wb, `سجل_المبيعات_${new Date().toISOString().split("T")[0]}.xlsx`);
      toast.success("تم تصدير سجل المبيعات بنجاح");
    } catch (error) {
      toast.error("حدث خطأ أثناء التصدير");
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/5">
        <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full max-w-4xl">
          {/* General Search */}
          <div className="relative flex-1">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-white/40" />
            <Input
              placeholder="ابحث برقم الفاتورة أو اسم العميل..."
              className="pr-10 bg-black/20 border-white/10 text-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="bg-black/20 border-white/10 text-xs"
              title="من تاريخ"
            />
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="bg-black/20 border-white/10 text-xs"
              title="إلى تاريخ"
            />
          </div>

          {/* Who Filter */}
          <div className="relative flex-1">
            <User className="absolute right-3 top-2.5 h-4 w-4 text-white/40" />
            <Input
              placeholder="من (القائم بالعملية/الفني/العميل)..."
              className="pr-10 bg-black/20 border-white/10"
              value={filterWho}
              onChange={(e) => setFilterWho(e.target.value)}
            />
          </div>

          {/* To Where Filter */}
          <div className="relative flex-1">
            <MapPin className="absolute right-3 top-2.5 h-4 w-4 text-white/40" />
            <Input
              placeholder="إلى أين (المدينة أو العنوان)..."
              className="pr-10 bg-black/20 border-white/10"
              value={filterToWhere}
              onChange={(e) => setFilterToWhere(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-end md:items-center gap-2 self-end md:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportSales}
            className="h-9 bg-white/5 border-white/10 hover:bg-white/10 text-xs gap-1"
          >
            <Download className="h-4 w-4" />
            تصدير
          </Button>
          <div className="flex items-center gap-2 text-white/40 text-sm whitespace-nowrap">
            <HistoryIcon className="h-4 w-4" />
            سجل العمليات
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white/5 rounded-xl border border-white/5">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-white/10">
              <TableHead className="w-10"></TableHead>
              <TableHead className="text-right">رقم العملية</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">العميل</TableHead>
              <TableHead className="text-right">النوع</TableHead>
              <TableHead className="text-right">الإجمالي</TableHead>
              <TableHead className="text-left">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((order, idx) => (
              <React.Fragment key={`${order.id}-${idx}`}>
                <TableRow
                  className="border-white/5 hover:bg-white/[0.02] cursor-pointer"
                  onClick={() => toggleExpand(order.id)}
                >
                  <TableCell>
                    {expandedOrderId === order.id ? (
                      <ChevronUp className="h-4 w-4 text-white/50" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-white/50" />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs uppercase text-white/60">
                    {order.id.slice(0, 8)}
                  </TableCell>
                  <TableCell className="text-white/80">
                    {format(order.date, "yyyy/MM/dd hh:mm a", { locale: arSA })}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{order.customerName || "عميل نقدي"}</span>
                      {order.customerId && customers && (
                        <span className="text-xs text-white/50">
                          {customers.find((c) => c.id === order.customerId)?.phone || ""}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2 items-center">
                      <Badge
                        variant={
                          order.type === "tax_invoice" ? "default" : "secondary"
                        }
                        className={
                          order.type === "tax_invoice"
                            ? "bg-blue-600"
                            : order.type === "return_invoice"
                              ? "bg-red-600"
                              : "bg-orange-600"
                        }
                      >
                        {order.type === "tax_invoice"
                          ? "فاتورة ضريبية"
                          : order.type === "return_invoice"
                            ? "مرتجع مبيعات"
                            : "عرض سعر"}
                      </Badge>
                      {order.status === "returned" && (
                        <Badge
                          variant="outline"
                          className="bg-red-500/10 border-red-500/20 text-red-400"
                        >
                          مرتجع
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-bold text-green-400">
                    {order.grandTotal.toFixed(2)} ر.س
                  </TableCell>
                  <TableCell>
                    <div
                      className="flex gap-2 justify-end"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {order.type === "quotation" && onConvertToInvoice && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-green-400 hover:text-green-300 hover:bg-green-900/20"
                          title="تحويل لفاتورة ضريبية"
                          onClick={() => onConvertToInvoice(order.id)}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {onEdit && order.status !== "returned" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-yellow-500 hover:text-yellow-400 hover:bg-yellow-900/20"
                          title="تعديل"
                          onClick={() => onEdit(order)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {order.type === "tax_invoice" &&
                        order.status !== "returned" &&
                        onReturn && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-orange-500 hover:text-orange-400 hover:bg-orange-900/20"
                            title="استرجاع المبيعات"
                            onClick={() => handleReturnClick(order)}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-900/20"
                        title="حذف"
                        onClick={() => handleDeleteClick(order.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                        title="طباعة"
                        onClick={() => handlePrintClick(order)}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {expandedOrderId === order.id && (
                  <TableRow className="bg-black/20 hover:bg-black/20 border-white/5">
                    <TableCell colSpan={7} className="p-0">
                      <div className="p-4 border-b border-white/5 space-y-4">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-white/40" />
                          <h4 className="font-bold text-sm text-white/80">
                            تفاصيل الأصناف
                          </h4>
                        </div>
                        <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                          <Table>
                            <TableHeader className="bg-white/5">
                              <TableRow className="border-white/10 hover:bg-transparent">
                                <TableHead className="text-right">#</TableHead>
                                <TableHead className="text-right">
                                  الصنف
                                </TableHead>
                                <TableHead className="text-center">
                                  الكمية
                                </TableHead>
                                <TableHead className="text-center">
                                  سعر القطعة
                                </TableHead>
                                <TableHead className="text-center">
                                  السعر الإجمالي قبل الضريبة
                                </TableHead>
                                <TableHead className="text-center">
                                  مبلغ الخصم
                                </TableHead>
                                <TableHead className="text-center">
                                  الضريبة
                                </TableHead>
                                <TableHead className="text-center">
                                  السعر بعد الضريبة
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {order.items.map((item, index) => {
                                const lineInclusive =
                                  (item.price - item.discount) * item.qty;
                                const basePrice =
                                  item.price / (1 + item.tax / 100);
                                const totalBeforeTax = basePrice * item.qty;
                                const discountAmount = item.discount * item.qty;
                                const taxAmount =
                                  lineInclusive -
                                  lineInclusive / (1 + item.tax / 100);

                                return (
                                  <TableRow
                                    key={item.catalogId + index}
                                    className="border-white/5 hover:bg-white/5"
                                  >
                                    <TableCell className="text-right">
                                      {index + 1}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {item.name}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      {item.qty}
                                    </TableCell>
                                    <TableCell className="text-center text-white/70">
                                      {basePrice.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-center text-white/70">
                                      {totalBeforeTax.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-center text-white/70">
                                      {discountAmount.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-center text-white/70">
                                      {taxAmount.toFixed(2)} ({item.tax}%)
                                    </TableCell>
                                    <TableCell className="text-center text-green-400 font-bold">
                                      {lineInclusive.toFixed(2)}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-6 text-sm">
                          <div className="text-white/60">
                            قبل الضريبة:{" "}
                            <span className="font-mono text-white/90 ml-1">
                              {order.totalBeforeTax.toFixed(2)}
                            </span>
                          </div>
                          <div className="text-white/60">
                            الضريبة:{" "}
                            <span className="font-mono text-white/90 ml-1">
                              {order.totalTax.toFixed(2)}
                            </span>
                          </div>
                          <div className="text-white/60">
                            الخصم الإضافي:{" "}
                            <span className="font-mono text-red-400 ml-1">
                              {order.totalDiscount.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      <PasswordDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        adminPassword={adminPassword}
        onSuccess={() => {
          if (targetOrderId) onDelete(targetOrderId);
          setTargetOrderId(null);
          toast.success("تم حذف السجل بنجاح");
        }}
        title="تأكيد الحذف"
        description="يرجى إدخال كلمة مرور مدير النظام لتأكيد الحذف. هذه العملية لا يمكن التراجع عنها."
      />
      <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <DialogContent className="glass border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد الطباعة</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-white/80">
              هل أنت متأكد من رغبتك في طباعة هذه الفاتورة؟
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrintDialog(false)}>
              إلغاء
            </Button>
            <Button
              onClick={confirmPrintAction}
              className="bg-blue-600 hover:bg-blue-500"
            >
              <Printer className="ml-2 h-4 w-4" />
              تأكيد الطباعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReturnDialog} onOpenChange={setShowReturnDialog}>
        <DialogContent
          className="glass border-white/10 text-white sm:max-w-2xl relative overflow-hidden"
          style={{ zIndex: 99999 }}
        >
          <DialogHeader>
            <DialogTitle>استرجاع مبيعات</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            <p className="text-white/80 text-sm">
              اختر الكميات التي ترغب في استرجاعها من الأصناف التالية:
            </p>
            {targetReturnOrder && (
              <div className="border border-white/10 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-white/5">
                    <TableRow>
                      <TableHead>الصنف</TableHead>
                      <TableHead className="text-center">السعر</TableHead>
                      <TableHead className="text-center">
                        الكمية في الفاتورة
                      </TableHead>
                      <TableHead className="text-center">
                        الكمية المسترجعة
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {targetReturnOrder.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">
                          {item.name}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.price.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center text-white/70">
                          {item.qty}
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min="0"
                            max={item.qty}
                            value={returnQuantities[item.catalogId] ?? 0}
                            onChange={(e) => {
                              let val = parseInt(e.target.value) || 0;
                              if (val > item.qty) val = item.qty;
                              if (val < 0) val = 0;
                              setReturnQuantities((prev) => ({
                                ...prev,
                                [item.catalogId]: val,
                              }));
                            }}
                            className="w-20 mx-auto bg-black/20 border-white/10 text-center"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReturnDialog(false)}
            >
              إلغاء
            </Button>
            <Button
              onClick={confirmReturnAction}
              className="bg-orange-600 hover:bg-orange-500 text-white"
              disabled={Object.values(returnQuantities).every(
                (v) => !v || v === 0,
              )}
            >
              <RotateCcw className="ml-2 h-4 w-4" />
              إنشاء فاتورة مرتجع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
