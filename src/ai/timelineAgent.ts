import { irisApiUrl } from '../config';

export class TimelineAgent {
  async generateResponse(userQuery: string, sessions: any[]): Promise<{ text: string, sessionContext?: any }> {
    // OpenAI runs in the Python backend so the API key is never exposed to the renderer bundle.
    try {
      const resp = await fetch(irisApiUrl('/api/timeline/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userQuery, sessions: sessions.slice(0, 15) })
      });
      if (resp.ok) {
        const data = await resp.json();
        const sessionContext = data.matchedSessionId
          ? sessions.find(session => session.id === data.matchedSessionId)
          : undefined;
        return {
          text: data.text || 'I analyzed your timeline context.',
          sessionContext
        };
      }
    } catch (err) {
      console.warn('[TimelineAgent] Backend OpenAI request failed:', err);
    }

    // Deterministic local fallback when the backend or API is unavailable.
    const qLower = userQuery.toLowerCase().trim();
    if (['hi', 'hello', 'hey', 'help'].includes(qLower)) {
      return {
        text: `👋 **Hello!** I am IRIS, your ambient workspace companion. I have ${sessions.length} captured sessions. Ask me about an app, website, or file.`
      };
    }

    const terms = qLower.split(/[^a-z0-9]+/).filter(term => term.length > 2);
    const ranked = sessions
      .map(session => ({
        session,
        score: terms.reduce((score, term) => {
          const searchable = JSON.stringify(session).toLowerCase();
          return score + (searchable.includes(term) ? 1 : 0);
        }, 0)
      }))
      .sort((a, b) => b.score - a.score);
    const matchedSession = ranked[0]?.score > 0 ? ranked[0].session : undefined;

    if (matchedSession) {
      return {
        text: `I found a matching workflow session: **${matchedSession.name || 'Workspace Session'}**.`,
        sessionContext: matchedSession
      };
    }

    return {
      text: 'I could not find a matching app, website, or file in the captured timeline.'
    };
  }
}
