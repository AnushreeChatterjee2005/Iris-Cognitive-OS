import { GoogleGenerativeAI } from '@google/generative-ai';

export class TimelineAgent {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  }

  async generateResponse(userQuery: string, sessions: any[]): Promise<{ text: string, sessionContext?: any }> {
    try {
      const prompt = `
You are IRIS, an advanced agentic coding assistant and ambient context tracker.
Below is the user's ambient session data in JSON format:

\`\`\`json
${JSON.stringify(sessions.map(s => ({
  id: s.id,
  name: s.name,
  startTime: s.startTime,
  endTime: s.endTime,
  summary: s.contextSummary,
  urls: s.urls,
  files: s.files,
  apps: s.dominantApps
})), null, 2)}
\`\`\`

The user asked: "${userQuery}"

Your task:
1. Analyze the JSON timeline to answer the user's question accurately.
2. If the user is asking about a specific task, file, or website, identify the corresponding session ID.
3. Respond in a friendly, conversational, and agentic tone. Format your response in Markdown. Do not include the session ID in your text response.
4. You MUST output your response in this exact JSON format so the frontend can parse it:
{
  "text": "Your markdown response here...",
  "matchedSessionId": "The ID of the session to restore, or null if no specific session matches"
}

Ensure your response is valid JSON.
`;

      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();
      
      // Parse JSON from markdown block if present
      let jsonStr = responseText;
      if (jsonStr.includes('```json')) {
        jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
      } else if (jsonStr.includes('```')) {
        jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
      }

      const parsed = JSON.parse(jsonStr);
      let sessionContext = null;
      if (parsed.matchedSessionId) {
        sessionContext = sessions.find(s => s.id === parsed.matchedSessionId);
      }

      return {
        text: parsed.text || "I processed your timeline but couldn't generate a clear response.",
        sessionContext
      };
    } catch (e: any) {
      console.error('Gemini API Error:', e);
      return {
        text: `**AI Error:** I encountered an issue analyzing your timeline. (${e.message})`
      };
    }
  }
}
