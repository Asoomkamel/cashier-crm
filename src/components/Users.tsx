import React, { useState } from "react";
import { UserAccount, AppSettings, PointOfSale } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Edit } from "lucide-react";
import { toast } from "sonner";

interface UsersProps {
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
}

export default function Users({ settings, setSettings }: UsersProps) {
  const [activeTab, setActiveTab] = useState<"users" | "pos">("users");
  
  // User form
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<"admin" | "supervisor" | "technician" | "pos">("technician");
  
  // Technician specific fields
  const [userSpecializations, setUserSpecializations] = useState("");
  const [userAssignedProducts, setUserAssignedProducts] = useState("");
  const [userInventoryCategories, setUserInventoryCategories] = useState("");
  const [userIsFullAdmin, setUserIsFullAdmin] = useState(false);
  const [userCanManageTechnicians, setUserCanManageTechnicians] = useState(false);
  const [userCanManageInventory, setUserCanManageInventory] = useState(false);
  const [userCanManageSettings, setUserCanManageSettings] = useState(false);
  const [userCanManageUsers, setUserCanManageUsers] = useState(false);

  // POS form
  const [editingPosId, setEditingPosId] = useState<string | null>(null);
  const [posName, setPosName] = useState("");

  const users = settings.users || [];
  const pointsOfSale = settings.pointsOfSale || [];

  const handleSaveUser = () => {
    if (!userName || !userEmail || !userRole) {
      toast.error("يرجى تعبئة الحقول المطلوبة");
      return;
    }

    const newUser: UserAccount = {
      id: editingUserId || Date.now().toString(),
      name: userName,
      phone: userPhone,
      email: userEmail,
      password: userPassword,
      role: userRole,
      specializations: userRole === "technician" ? userSpecializations.split(/[,،]/).map(s => s.trim()).filter(Boolean) : [],
      assignedProducts: userRole === "technician" ? userAssignedProducts.split(/[,،]/).map(s => s.trim()).filter(Boolean) : [],
      inventoryCategories: userRole === "technician" ? userInventoryCategories.split(/[,،]/).map(s => s.trim()).filter(Boolean) : [],
      permissions: { 
        canLogin: true,
        isFullAdmin: userIsFullAdmin,
        canManageTechnicians: userCanManageTechnicians,
        canManageInventory: userCanManageInventory,
        canManageSettings: userCanManageSettings,
        canManageUsers: userCanManageUsers,
      }
    };

    let updatedUsers = [...users];
    if (editingUserId) {
      updatedUsers = updatedUsers.map(u => u.id === editingUserId ? newUser : u);
    } else {
      updatedUsers = [newUser, ...updatedUsers];
    }

    const newSettings = { ...settings, users: updatedUsers };
    setSettings(newSettings);
    toast.success(editingUserId ? "تم تحديث المستخدم" : "تمت إضافة المستخدم");
    
    // reset
    setEditingUserId(null);
    setUserName("");
    setUserPhone("");
    setUserEmail("");
    setUserPassword("");
    setUserRole("technician");
    setUserSpecializations("");
    setUserAssignedProducts("");
    setUserInventoryCategories("");
    setUserIsFullAdmin(false);
    setUserCanManageTechnicians(false);
    setUserCanManageInventory(false);
    setUserCanManageSettings(false);
    setUserCanManageUsers(false);
  };

  const handleDeleteUser = (id: string) => {
    if (confirm("هل أنت متأكد من حذف هذا المستخدم؟")) {
      const updatedUsers = users.filter(u => u.id !== id);
      setSettings({ ...settings, users: updatedUsers });
      toast.success("تم الحذف بنجاح");
    }
  };

  const handleSavePos = () => {
    if (!posName) {
      toast.error("يرجى إدخال اسم نقطة البيع");
      return;
    }

    const newPos: PointOfSale = {
      id: editingPosId || Date.now().toString(),
      name: posName,
      isActive: true
    };

    let updatedPos = [...pointsOfSale];
    if (editingPosId) {
      updatedPos = updatedPos.map(p => p.id === editingPosId ? newPos : p);
    } else {
      updatedPos = [newPos, ...updatedPos];
    }

    setSettings({ ...settings, pointsOfSale: updatedPos });
    toast.success(editingPosId ? "تم تحديث نقطة البيع" : "تمت الإضافة");
    
    setEditingPosId(null);
    setPosName("");
  };

  const handleDeletePos = (id: string) => {
    if (confirm("هل أنت متأكد من حذف نقطة البيع؟")) {
      const updatedPos = pointsOfSale.filter(p => p.id !== id);
      setSettings({ ...settings, pointsOfSale: updatedPos });
      toast.success("تم الحذف بنجاح");
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex gap-2 bg-slate-800 p-1 rounded-lg w-max">
        <Button 
          variant={activeTab === "users" ? "default" : "ghost"} 
          onClick={() => setActiveTab("users")}
        >
          المستخدمين
        </Button>
        <Button 
          variant={activeTab === "pos" ? "default" : "ghost"} 
          onClick={() => setActiveTab("pos")}
        >
          نقاط البيع
        </Button>
      </div>

      {activeTab === "users" && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">{editingUserId ? "تعديل مستخدم" : "إضافة مستخدم جديد"}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <div>
              <Label>الاسم</Label>
              <Input value={userName} onChange={(e) => setUserName(e.target.value)} />
            </div>
            <div>
              <Label>رقم الجوال</Label>
              <Input value={userPhone} onChange={(e) => setUserPhone(e.target.value)} />
            </div>
            <div>
              <Label>البريد الإلكتروني</Label>
              <Input type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} />
            </div>
            <div>
              <Label>كلمة المرور</Label>
              <Input type="text" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} />
            </div>
            <div>
              <Label>الصلاحية</Label>
              <select 
                className="w-full text-sm bg-black border border-slate-700 rounded-md h-10 px-3"
                value={userRole} 
                onChange={(e) => setUserRole(e.target.value as any)}
              >
                <option value="technician">فني</option>
                <option value="supervisor">مشرف</option>
                <option value="pos">نقطة بيع مخصصة</option>
                <option value="admin">مدير النظام</option>
              </select>
            </div>
          </div>
          
          {userRole === "technician" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 mt-2 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <div>
                <Label>التخصصات (يفصل بينها بفاصلة)</Label>
                <Input value={userSpecializations} onChange={(e) => setUserSpecializations(e.target.value)} placeholder="مثال: فلاتر مياه، تمديدات..." />
              </div>
              <div>
                <Label>المنتجات المخصصة (يفصل بينها بفاصلة)</Label>
                <Input value={userAssignedProducts} onChange={(e) => setUserAssignedProducts(e.target.value)} placeholder="مثال: فلتر 7 مراحل، مضخة..." />
              </div>
              <div>
                <Label>فئات المخزون (يفصل بينها بفاصلة)</Label>
                <Input value={userInventoryCategories} onChange={(e) => setUserInventoryCategories(e.target.value)} placeholder="مثال: قطع غيار، فلاتر..." />
              </div>
            </div>
          )}
          
          <div className="mb-4 mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <h4 className="font-bold mb-3 text-sm text-slate-300">صلاحيات النظام</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={userIsFullAdmin} onChange={(e) => setUserIsFullAdmin(e.target.checked)} className="w-4 h-4 accent-blue-500" />
                <span className="text-sm">صلاحيات إدارة كاملة (مدير نظام)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={userCanManageTechnicians} onChange={(e) => setUserCanManageTechnicians(e.target.checked)} className="w-4 h-4 accent-blue-500" />
                <span className="text-sm">إدارة الفنيين</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={userCanManageInventory} onChange={(e) => setUserCanManageInventory(e.target.checked)} className="w-4 h-4 accent-blue-500" />
                <span className="text-sm">إدارة المخزون</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={userCanManageSettings} onChange={(e) => setUserCanManageSettings(e.target.checked)} className="w-4 h-4 accent-blue-500" />
                <span className="text-sm">تعديل الإعدادات العامة</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={userCanManageUsers} onChange={(e) => setUserCanManageUsers(e.target.checked)} className="w-4 h-4 accent-blue-500" />
                <span className="text-sm">إدارة المستخدمين والفروع</span>
              </label>
            </div>
          </div>

          <Button onClick={handleSaveUser}>
            {editingUserId ? "حفظ التعديلات" : "إنشاء المستخدم"}
          </Button>

          <div className="mt-8">
            <h3 className="font-bold mb-4">قائمة المستخدمين ({users.length})</h3>
            <div className="space-y-2">
              {users.map(user => (
                <div key={user.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-800/50 border border-slate-700/50 p-4 rounded-lg">
                  <div>
                    <div className="font-bold">{user.name} <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded mx-2">{user.role}</span></div>
                    <div className="text-slate-400 text-sm mt-1">{user.email} | {user.phone}</div>
                  </div>
                  <div className="flex gap-2 mt-2 sm:mt-0">
                    <Button variant="ghost" size="sm" onClick={() => {
                      setEditingUserId(user.id);
                      setUserName(user.name);
                      setUserEmail(user.email);
                      setUserPhone(user.phone);
                      setUserPassword(user.password || "");
                      setUserRole(user.role);
                      setUserSpecializations(user.specializations?.join("، ") || "");
                      setUserAssignedProducts(user.assignedProducts?.join("، ") || "");
                      setUserInventoryCategories(user.inventoryCategories?.join("، ") || "");
                      setUserIsFullAdmin(user.permissions?.isFullAdmin || false);
                      setUserCanManageTechnicians(user.permissions?.canManageTechnicians || false);
                      setUserCanManageInventory(user.permissions?.canManageInventory || false);
                      setUserCanManageSettings(user.permissions?.canManageSettings || false);
                      setUserCanManageUsers(user.permissions?.canManageUsers || false);
                    }}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-400" onClick={() => handleDeleteUser(user.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "pos" && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">{editingPosId ? "تعديل نقطة بيع" : "إضافة نقطة بيع"}</h2>
          <div className="flex gap-4 mb-4 items-end">
            <div className="flex-1 max-w-sm">
              <Label>اسم نقطة البيع / الكاشير</Label>
              <Input value={posName} onChange={(e) => setPosName(e.target.value)} placeholder="مثال: نقطة بيع المعرض 1" />
            </div>
            <Button onClick={handleSavePos}>
              {editingPosId ? "حفظ التعديلات" : "إضافة نقطة البيع"}
            </Button>
          </div>

          <div className="mt-8">
            <h3 className="font-bold mb-4">قائمة نقاط البيع ({pointsOfSale.length})</h3>
            <div className="space-y-2">
              {pointsOfSale.map(pos => (
                <div key={pos.id} className="flex justify-between items-center bg-slate-800/50 border border-slate-700/50 p-4 rounded-lg">
                  <div className="font-bold">{pos.name}</div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => {
                      setEditingPosId(pos.id);
                      setPosName(pos.name);
                    }}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-400" onClick={() => handleDeletePos(pos.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
