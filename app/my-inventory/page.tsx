"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useApp, useT } from "@/lib/store";
import { Card, PageTitle, Button, Input, Select } from "@/components/ui";
import { inventoryItemValue, startOfDay, startOfMonth, techFinancialSummary } from "@/lib/technicianHelpers";
import { downloadWorkbookXlsx, makeXlsxFileName } from "@/lib/xlsxExport";

export default function MyInventoryPage() {
  const {
    activeUser,
    catalog,
    techInventory,
    techFinancialLogs,
    saveTechLocation,
    techLocations,
    settings,
    changeOwnPin,
    orders,
  } = useApp();
  const t = useT();

  const techName = activeUser?.name || "";
  const techId = activeUser?.id || "";
  const [locationError, setLocationError] = useState("");
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinMessage, setPinMessage] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError(t("tv_location_unsupported"));
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => saveTechLocation(techName, { lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocationError(t("tv_location_denied")),
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techName]);

  const myLocation = techLocations[techName];

  const inventoryWithCategory = techInventory
    .filter((item) => item.technicianId === techId || item.technicianName === techName)
    .map((item) => {
      const catalogItem = catalog.find((catalogEntry) => catalogEntry.id === item.catalogId);
      return { ...item, category: catalogItem?.category || "غير مصنف" };
    });

  const myCategories = Array.from(new Set(inventoryWithCategory.map((item) => item.category).filter(Boolean)));

  const myItems = inventoryWithCategory.filter((item) => !categoryFilter || item.category === categoryFilter);

  const myFinancialLogs = techFinancialLogs.filter((log) => log.technicianId === techId || log.technicianName === techName);
  const financeSummary = techFinancialSummary(myFinancialLogs);
  const balance = financeSummary.cashDebt;
  const stockValue = inventoryWithCategory.reduce((sum, item) => sum + inventoryItemValue(item, catalog), 0);
  const todayStart = startOfDay();
  const monthStart = startOfMonth();
  const todayCompletionCommission = myFinancialLogs.filter((log) => log.type === "completion_commission" && log.date >= todayStart).reduce((sum, log) => sum + log.amount, 0);
  const monthCompletionCommission = myFinancialLogs.filter((log) => log.type === "completion_commission" && log.date >= monthStart).reduce((sum, log) => sum + log.amount, 0);
  const todayMarketingCommission = myFinancialLogs.filter((log) => log.type === "marketing_commission" && log.date >= todayStart).reduce((sum, log) => sum + log.amount, 0);
  const monthMarketingCommission = myFinancialLogs.filter((log) => log.type === "marketing_commission" && log.date >= monthStart).reduce((sum, log) => sum + log.amount, 0);

  const todayStats = useMemo(() => {
    const todayStr = new Date().toDateString();
    const myOrdersToday = orders.filter(
      (order) =>
        order.technicianName === techName &&
        order.status === "active" &&
        new Date(order.date).toDateString() === todayStr
    );

    const invoicesCount = myOrdersToday.filter((order) => order.type === "tax_invoice").length;
    const collections = myOrdersToday.reduce((sum, order) => sum + (order.paidAmount || 0), 0);

    return { invoicesCount, collections };
  }, [orders, techName]);

  const exportMyInventoryExcel = async () => {
    await downloadWorkbookXlsx(makeXlsxFileName("my-inventory"), {
      techInventory: myItems,
      techFinancialLogs: myFinancialLogs,
    });
  };

  const saveOwnPin = () => {
    if (!activeUser) return;

    setPinMessage("");

    if (newPin.trim() !== confirmPin.trim()) {
      setPinMessage(t("profile_pin_mismatch"));
      return;
    }

    const result = changeOwnPin(oldPin, newPin);
    setPinMessage(t(result.messageKey));

    if (result.ok) {
      setOldPin("");
      setNewPin("");
      setConfirmPin("");
    }
  };

  return (
    <div>
      <PageTitle title={t("nav_tech_inventory")} action={<Button variant="secondary" onClick={exportMyInventoryExcel}>{settings.language === "ar" ? "تصدير Excel" : "Export Excel"}</Button>} />

      {locationError && (
        <Card className="mb-4 border border-amber-300 bg-amber-50 text-sm text-amber-800">
          {locationError}
        </Card>
      )}

      {myLocation && (
        <Card className="mb-4 text-sm text-slate-500">
          {t("tv_sharing_location")} {new Date(myLocation.lastUpdate).toLocaleTimeString()}
        </Card>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="text-xs text-slate-500">{t("tv_assigned_stock_items")}</div>
          <div className="mt-1 text-xl font-bold text-slate-800">{inventoryWithCategory.length}</div>
        </Card>

        <Card>
          <div className="text-xs text-slate-500">{settings.language === "ar" ? "مديونية الكاش عليك" : "Cash owed"}</div>
          <div className={`mt-1 text-xl font-bold ${balance > 0 ? "text-amber-700" : "text-emerald-700"}`}>
            {balance.toFixed(2)} {settings.currency}
          </div>
          <p className="mt-1 text-xs text-slate-400">{settings.language === "ar" ? "تظهر مبالغ الكاش المستلمة من العملاء حتى تسديدها للإدارة." : "Cash collected from customers until settled."}</p>
        </Card>

        <Card>
          <div className="text-xs text-slate-500">{t("tv_today_invoices")}</div>
          <div className="mt-1 text-xl font-bold text-slate-800">{todayStats.invoicesCount}</div>
        </Card>

        <Card>
          <div className="text-xs text-slate-500">{t("tv_today_collections")}</div>
          <div className="mt-1 text-xl font-bold text-emerald-700">
            {todayStats.collections.toFixed(2)} {settings.currency}
          </div>
        </Card>

        <Card>
          <div className="text-xs text-slate-500">{settings.language === "ar" ? "قيمة المنتجات معك" : "Stock value with you"}</div>
          <div className="mt-1 text-xl font-bold text-brand-700">{stockValue.toFixed(2)} {settings.currency}</div>
        </Card>

        <Card>
          <div className="text-xs text-slate-500">{settings.language === "ar" ? "عمولة الإنجاز" : "Completion commission"}</div>
          <div className="mt-1 text-sm text-slate-600">{settings.language === "ar" ? "اليوم" : "Today"}: <b>{todayCompletionCommission.toFixed(2)} {settings.currency}</b></div>
          <div className="text-sm text-slate-600">{settings.language === "ar" ? "الشهر" : "Month"}: <b>{monthCompletionCommission.toFixed(2)} {settings.currency}</b></div>
        </Card>

        <Card>
          <div className="text-xs text-slate-500">{settings.language === "ar" ? "عمولة التسويق" : "Marketing commission"}</div>
          <div className="mt-1 text-sm text-slate-600">{settings.language === "ar" ? "اليوم" : "Today"}: <b>{todayMarketingCommission.toFixed(2)} {settings.currency}</b></div>
          <div className="text-sm text-slate-600">{settings.language === "ar" ? "الشهر" : "Month"}: <b>{monthMarketingCommission.toFixed(2)} {settings.currency}</b></div>
        </Card>
      </div>

      {inventoryWithCategory.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-2 font-semibold text-slate-700">{t("tv_assigned_stock_items")}</h2>
          <div className="mb-3 flex justify-end">
            <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="max-w-[220px]">
              <option value="">{settings.language === "ar" ? "كل التصنيفات" : "All categories"}</option>
              {myCategories.map((category) => <option key={category} value={category}>{category}</option>)}
            </Select>
          </div>
          <div className="divide-y divide-slate-100 text-sm">
            {myItems.map((item) => (
              <div key={item.id} className="flex justify-between py-1.5">
                <span><span>{item.itemName}</span><span className="ms-2 text-xs text-slate-400">{item.category}</span></span>
                <span className="font-medium">{item.qty}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="mb-4">
        <h2 className="mb-1 font-semibold text-slate-700">{t("profile_change_pin")}</h2>
        <p className="mb-3 text-xs text-slate-400">{t("profile_change_pin_hint")}</p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <Input
            type="password"
            placeholder={t("profile_current_pin")}
            value={oldPin}
            onChange={(event) => setOldPin(event.target.value)}
          />
          <Input
            type="password"
            placeholder={t("profile_new_pin")}
            value={newPin}
            onChange={(event) => setNewPin(event.target.value)}
          />
          <Input
            type="password"
            placeholder={t("profile_confirm_pin")}
            value={confirmPin}
            onChange={(event) => setConfirmPin(event.target.value)}
          />
          <Button onClick={saveOwnPin}>{t("save")}</Button>
        </div>

        {pinMessage && <p className="mt-2 text-xs text-slate-500">{pinMessage}</p>}
      </Card>
    </div>
  );
}
