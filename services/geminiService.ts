
import { GoogleGenAI, Type } from "@google/genai";

export const fillTableWithAI = async (title: string, currentHeaders: string[], rowCount: number) => {
  try {
    // 嚴格遵守規範：使用 named parameter 且直接讀取 process.env.API_KEY
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `請為標題為 "${title}" 的表格生成專業且真實的數據。
      標題欄位為: ${currentHeaders.join(', ')}。
      請提供正好 ${rowCount} 列的數據，並使用巢狀陣列格式。`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rows: {
              type: Type.ARRAY,
              items: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            }
          },
          required: ["rows"]
        }
      }
    });

    const result = JSON.parse(response.text || '{"rows": []}');
    return result.rows as string[][];
  } catch (error) {
    console.error("Gemini AI Table Fill Error:", error);
    return null;
  }
};
