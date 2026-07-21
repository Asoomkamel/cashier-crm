import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, AlertTriangle } from "lucide-react";

interface PasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  adminPassword?: string;
  onUpdateAdminPassword?: (newPassword: string) => void;
  title?: string;
  description?: string;
  isFactoryReset?: boolean;
}

export function PasswordDialog({
  open,
  onOpenChange,
  onSuccess,
  adminPassword,
  onUpdateAdminPassword,
  title = "التحقق من كلمة المرور",
  description = "الرجاء إدخال كلمة المرور للمتابعة",
  isFactoryReset = false,
}: PasswordDialogProps) {
  const [passwordInput, setPasswordInput] = useState("");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [mode, setMode] = useState<
    "normal" | "recovery" | "new_password" | "factory_auth_2"
  >("normal");

  const checkPassword = (input: string) => {
    return input === adminPassword;
  };

  const handleConfirm = () => {
    if (mode === "normal") {
      if (checkPassword(passwordInput)) {
        if (isFactoryReset) {
          toast.success(
            "الرمز صحيح. أدخل رمز الاستعادة لتأكيد حذف جميع البيانات.",
          );
          setMode("factory_auth_2");
          setPasswordInput("");
        } else {
          onSuccess();
          reset();
        }
      } else {
        const newCount = failedAttempts + 1;
        setFailedAttempts(newCount);
        if (newCount >= 10 && !isFactoryReset) {
          toast.error("تم تجاوز عدد المحاولات. الرجاء استخدام رمز الاستعادة.");
          setMode("recovery");
          setPasswordInput("");
        } else {
          toast.error("كلمة المرور غير صحيحة");
        }
      }
    } else if (mode === "factory_auth_2") {
      if (passwordInput === "Glal@123123") {
        onSuccess();
        reset();
      } else {
        toast.error("الرمز الإضافي غير صحيح");
      }
    } else if (mode === "recovery") {
      if (passwordInput === "Glal@123123") {
        toast.success("رمز الاستعادة صحيح. قم بتعيين كلمة مرور جديدة.");
        setMode("new_password");
        setPasswordInput("");
      } else {
        toast.error("رمز الاستعادة غير صحيح");
      }
    } else if (mode === "new_password") {
      if (passwordInput.length < 4) {
        toast.error("كلمة المرور يجب أن تكون 4 أحرف على الأقل");
        return;
      }
      if (onUpdateAdminPassword) {
        onUpdateAdminPassword(passwordInput);
      }
      toast.success("تم تحديث كلمة المرور بنجاح. يمكنك المتابعة الآن.");
      onSuccess();
      reset();
    }
  };

  const reset = () => {
    setMode("normal");
    setFailedAttempts(0);
    setPasswordInput("");
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) reset();
        else onOpenChange(val);
      }}
    >
      <DialogContent className="glass border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {mode === "normal" ? (
              <Lock className="h-5 w-5 text-blue-400" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
            )}
            {mode === "normal"
              ? title
              : mode === "factory_auth_2"
                ? "رمز التأكيد الإضافي"
                : mode === "recovery"
                  ? "استعادة كلمة المرور"
                  : "تعيين كلمة مرور جديدة"}
          </DialogTitle>
          <div className="text-sm text-white/50 pt-2">
            {mode === "normal"
              ? description
              : mode === "factory_auth_2"
                ? "لإتمام تهيئة النظام من الصفر، يرجى إدخال الرمز الإضافي الثابت"
                : mode === "recovery"
                  ? "الرجاء إدخال رمز الاستعادة الافتراضي"
                  : "أدخل كلمة المرور الجديدة للنظام"}
          </div>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>
              {mode === "normal"
                ? "كلمة المرور"
                : mode === "factory_auth_2" || mode === "recovery"
                  ? "رمز الاستعادة"
                  : "كلمة المرور الجديدة"}
            </Label>
            <Input
              type={mode === "new_password" ? "text" : "password"}
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="bg-white/5 border-white/10 text-center text-lg h-12"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
            />
            {mode === "normal" && failedAttempts > 0 && !isFactoryReset && (
              <p className="text-xs text-red-400">
                محاولات خاطئة: {failedAttempts} / 10
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={reset} className="border-white/10">
            إلغاء
          </Button>
          <Button
            onClick={handleConfirm}
            className={
              mode === "new_password"
                ? "bg-green-600 hover:bg-green-500"
                : mode === "factory_auth_2"
                  ? "bg-red-600 hover:bg-red-500"
                  : "bg-blue-600 hover:bg-blue-500"
            }
          >
            {mode === "normal"
              ? "تأكيد"
              : mode === "factory_auth_2"
                ? "تأكيد الحذف النهائي"
                : mode === "recovery"
                  ? "تحقق"
                  : "حفظ ومتابعة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
