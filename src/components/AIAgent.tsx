import React, { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function AIAgent({
  settings,
  orders,
  catalog,
  customers,
  onAddOrder,
  onAddProduct,
  onUpdateOrder,
  onUpdateSettings,
  onPlaySound,
  onAddCustomer,
}: any) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<
    { role: "user" | "model"; text: string }[]
  >([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendLatestOrderToWhatsApp = (orderData: any) => {
    let msg = `مرحباً،\nيوجد طلب صيانة جديد:\n\n`;
    msg += `العميل: ${orderData.customerName || "غير مسجل"}\n`;
    msg += `المشكلة/الخدمة: ${orderData.interest || orderData.issue || "غير مسجل"}\n`;
    if (orderData.neighborhood) msg += `الحي: ${orderData.neighborhood}\n`;
    if (orderData.mapLink) msg += `رابط الخريطة: ${orderData.mapLink}\n`;

    const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          history: messages,
          context: {
            delayedOrders:
              orders?.filter((o: any) => o.status === "pending") || [],
            settings: settings,
          },
        }),
      });
      const data = await res.json();

      if (data.functionCalls && data.functionCalls.length > 0) {
        let addedResponses = [];
        for (const call of data.functionCalls) {
          if (call.name === "addOrder") {
            onAddOrder(call.args);
            sendLatestOrderToWhatsApp(call.args);
            addedResponses.push(
              `تم إضافة الطلب للعميل ${call.args.customerName} بنجاح وإرسال التفاصيل للفني.`,
            );
          } else if (call.name === "addProduct") {
            onAddProduct(call.args);
            addedResponses.push(`تم إضافة المنتج ${call.args.name} بنجاح.`);
          } else if (call.name === "updateOrder") {
            if (onUpdateOrder) onUpdateOrder(call.args);
            addedResponses.push(
              `تم تحديث حالة الطلب رقم ${call.args.orderId} بنجاح.`,
            );
          } else if (call.name === "updateSettings") {
            if (onUpdateSettings) onUpdateSettings(call.args);
            addedResponses.push(`تم تحديث الإعدادات بنجاح.`);
          } else if (call.name === "playSound") {
            if (onPlaySound) onPlaySound(call.args);
            addedResponses.push(`تم تشغيل الصوت المطلوب.`);
          } else if (call.name === "addCustomer") {
            if (onAddCustomer) onAddCustomer(call.args);
            addedResponses.push(`تم إضافة العميل ${call.args.name} بنجاح.`);
          } else if (call.name === "prepareWhatsApp") {
            const url = `whatsapp://send?phone=${call.args.phone}&text=${encodeURIComponent(call.args.message)}`;
            window.location.href = url;
            addedResponses.push(`تم تجهيز الواتساب للرقم ${call.args.phone}.`);
          }
        }
        if (data.message) {
          addedResponses.unshift(data.message);
        }
        if (addedResponses.length > 0) {
          setMessages((prev) => [
            ...prev,
            { role: "model", text: addedResponses.join("\n") },
          ]);
        }
      } else {
        setMessages((prev) => [...prev, { role: "model", text: data.message }]);
      }
    } catch (err: any) {
      toast.error("خطأ في الاتصال بالذكاء الاصطناعي");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 h-14 w-14 rounded-full shadow-2xl bg-blue-600 hover:bg-blue-700 z-[9999] flex items-center justify-center p-0"
      >
        <Bot size={28} className="text-white" />
      </Button>
    );
  }

  return (
    <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:bottom-6 sm:right-6 sm:w-96 h-[72dvh] sm:h-[500px] max-h-[calc(100dvh-24px)] bg-zinc-900 border border-zinc-800 shadow-2xl rounded-2xl flex flex-col z-[9999] overflow-hidden dir-rtl">
      <div className="flex items-center justify-between p-4 bg-zinc-950 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Bot className="text-blue-500" />
          <h3 className="font-bold text-white">المساعد الذكي</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(false)}
          className="text-zinc-400 hover:text-white"
        >
          <X size={18} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 my-8 text-sm flex flex-col items-center gap-2">
            <Bot size={48} className="text-zinc-800" />
            <p>
              أهلاً بك! يمكنني مساعدتك في:
              <br />
              إنشاء الطلبات، إضافة المنتجات، استخراج تقارير بالطلبات المتأخرة،
              وتجهيز رسائل الواتساب.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-blue-600 text-white rounded-bl-sm" : "bg-zinc-800 text-zinc-200 rounded-br-sm"}`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="px-4 py-2 rounded-2xl bg-zinc-800 text-zinc-400 rounded-br-sm flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> أحلل طلبك...
            </div>
          </div>
        )}
      </div>

      <div className="p-3 bg-zinc-950 border-t border-zinc-800 flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="اطلب أي شيء..."
          className="bg-zinc-900 border-zinc-800 text-white focus-visible:ring-blue-500"
        />
        <Button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          size="icon"
          className="bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0"
        >
          <Send size={18} />
        </Button>
      </div>
    </div>
  );
}
