import { GoogleGenerativeAI } from '@google/generative-ai';

export class TimelineAgent {
  private genAI: GoogleGenerativeAI | null = null;
  private candidateModels = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-flash-latest',
    'gemini-1.5-pro'
  ];

  constructor(apiKey?: string) {
    const cleanKey = apiKey ? apiKey.trim().replace(/^["']|["']$/g, '') : '';
    if (cleanKey) {
      this.genAI = new GoogleGenerativeAI(cleanKey);
    }
  }

  async generateResponse(userQuery: string, sessions: any[]): Promise<{ text: string, sessionContext?: any }> {
    const prompt = `
You are IRIS, an advanced agentic coding assistant and ambient context tracker.
Below is the user's ambient session data in JSON format:

\`\`\`json
${JSON.stringify(sessions.slice(0, 15).map(s => ({
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
1. Analyze the JSON timeline to answer the user's question accurately and helpfully.
2. If the user is asking about a specific task, file, or website, identify the corresponding session ID.
3. Respond in a friendly, conversational, and agentic tone. Format your response in Markdown. Do not include the session ID in your visible text response.
4. You MUST output your response in this exact JSON format so the frontend can parse it:
{
  "text": "Your markdown response here...",
  "matchedSessionId": "The ID of the session to restore, or null if no specific session matches"
}

Ensure your response is valid JSON.
`;

    // 1. Try Gemini Cloud Client if API key is present
    if (this.genAI) {
      for (const modelName of this.candidateModels) {
        try {
          const model = this.genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(prompt);
          const responseText = result.response.text();
          
          let jsonStr = responseText;
          if (jsonStr.includes('```json')) {
            jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
          } else if (jsonStr.includes('```')) {
            jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
          }

          let parsed: any;
          try {
            parsed = JSON.parse(jsonStr);
          } catch {
            parsed = { text: responseText, matchedSessionId: null };
          }

          let sessionContext = null;
          if (parsed.matchedSessionId) {
            sessionContext = sessions.find(s => s.id === parsed.matchedSessionId);
          }

          return {
            text: parsed.text || "I processed your timeline context.",
            sessionContext
          };
        } catch (err: any) {
          console.warn(`[TimelineAgent] Model ${modelName} attempt note:`, err?.message || err);
        }
      }
    }

    // 2. Try Backend AI Endpoint (/api/chat)
    try {
      const resp = await fetch('http://127.0.0.1:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userQuery })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.response) {
          return { text: data.response };
        }
      }
    } catch (e) {}

    // 3. Intelligent Local Timeline Context Matcher
    const qLower = userQuery.toLowerCase().trim();
    if (qLower === 'hi' || qLower === 'hello' || qLower === 'hey' || qLower === 'help') {
      return {
        text: `👋 **Hello!** I am IRIS, your ambient workspace companion. I am actively tracking your workflow timeline (${sessions.length} sessions recorded). Ask me what you were working on, search your browsing history, or ask me to restore any environment!`
      };
    }

    const matchedSession = sessions.find(s => 
      (s.name && s.name.toLowerCase().includes(qLower)) ||
      (s.dominantApps && s.dominantApps.some((a: string) => a.toLowerCase().includes(qLower))) ||
      (s.files && s.files.some((f: string) => f.toLowerCase().includes(qLower))) ||
      (s.urls && s.urls.some((u: string) => u.toLowerCase().includes(qLower)))
    );

    if (matchedSession) {
      return {
        text: `I found a matching workflow session in your timeline: **${matchedSession.name}** (${matchedSession.dominantApps?.join(', ') || 'No apps'}) with ${matchedSession.urls?.length || 0} tabs recorded.`,
        sessionContext: matchedSession
      };
    }

    return {
      text: "I analyzed your recent activity timeline. Ask me about specific apps, websites you visited, or files you edited!"
    };
  }
}
