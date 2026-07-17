import type { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { jsonError } from '@/lib/server/authentica';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { purpose, data, rawText } = await req.json().catch(() => ({}));
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: 'Gemini API key is not configured' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    let prompt = 'قم بصياغة رسالة واتساب احترافية ومنظمة ومرتبة باللغة العربية.\n';

    if (purpose === 'technician') {
      prompt += `الرسالة موجهة إلى الفني / المندوب.
المعلومات المتوفرة:
${JSON.stringify(data, null, 2)}

الرجاء كتابة الرسالة مع مراعاة التالي:
1. ابدأ بـ "مرحباً [اسم الفني]، لديك طلب..." بحيث تحدد نوع الطلب بناءً على اهتمام العميل.
2. قم بتسمية اهتمام العميل في نص الرسالة بـ "نوع الطلب".
3. استخدم تنسيق احترافي وجذاب مع الأيقونات التعبيرية المناسبة والجمل الواضحة.`;
    } else if (purpose === 'enhance_text') {
      prompt += `المطلوب: تحسين وتنسيق النص التالي ليكون رسالة واتساب احترافية ومنسقة ومناسبة للعملاء أو زملاء العمل، مع إضافة أيقونات تعبيرية مناسبة وتصحيح أي أخطاء لغوية.\nالنص الأصلي:\n"${rawText || ''}"`;
    } else {
      prompt += `المعلومات:\n${JSON.stringify(data, null, 2)}\nالرجاء تنسيق هذه المعلومات في رسالة واتساب احترافية.`;
    }

    prompt += '\n\nملاحظة هامة: قم بإعطاء الرسالة النهائية فقط بدون أي مقدمات أو شروحات.';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return Response.json({ message: response.text });
  } catch (error) {
    console.error('Error formatting message:', error);
    return jsonError(error, 'تعذر تنسيق الرسالة');
  }
}
