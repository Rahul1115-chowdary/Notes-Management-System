/**
 * NOVA NOTES AI - INTELLIGENT AI ASSISTANT SERVICE
 * Provides smart note generation, summarization, action item extraction,
 * tone rewriting, study flashcards, and auto-tagging.
 */

class AIService {
  constructor() {
    this.apiKey = localStorage.getItem('nova_ai_api_key') || '';
    this.apiProvider = localStorage.getItem('nova_ai_provider') || 'gemini';
  }

  setApiKey(key, provider = 'gemini') {
    this.apiKey = key;
    this.apiProvider = provider;
    localStorage.setItem('nova_ai_api_key', key);
    localStorage.setItem('nova_ai_provider', provider);
  }

  getApiKey() {
    return this.apiKey;
  }

  /**
   * Generates a new structured note draft based on prompt and category
   */
  async generateNoteDraft(prompt, category = 'general') {
    // If user provided a real Gemini API key, use live LLM call
    if (this.apiKey) {
      try {
        return await this._callExternalAI(`Generate a comprehensive, beautifully formatted Markdown note about: "${prompt}". Suggest a catchy title on line 1 formatted as '# Title', then the markdown content, and end with a line 'TAGS: tag1, tag2, tag3'. The tone should suit the category: ${category}.`);
      } catch (err) {
        console.warn('API Call failed, falling back to built-in generator:', err);
      }
    }

    // Built-in Intelligent Synthesizer
    await this._simulateDelay(800);

    const cleanPrompt = prompt.trim();
    const pLower = cleanPrompt.toLowerCase();

    let title = cleanPrompt;
    let content = "";
    let tags = [];
    let detectedCategory = category;

    if (pLower.includes("meeting") || pLower.includes("sync") || pLower.includes("sprint") || category === "job") {
      detectedCategory = "job";
      title = `💼 ${cleanPrompt.replace(/^(create|write|generate|note for)\s+/i, '')}`;
      content = `## Meeting & Discussion Overview\n**Date:** ${new Date().toLocaleDateString()}\n**Topic:** ${cleanPrompt}\n\n### Key Discussion Points\n- Discussed quarterly roadmap milestones and priority tasks.\n- Reviewed blocking dependencies and cross-team integration points.\n- Evaluated resource allocation and release timelines.\n\n### Action Items\n- [ ] Distribute summary notes to key stakeholders\n- [ ] Update Jira sprint backlog with estimated story points\n- [ ] Schedule follow-up alignment session for next week`;
      tags = ["Meeting", "Work", "Planning", "ActionItems"];
    } else if (pLower.includes("study") || pLower.includes("exam") || pLower.includes("learn") || pLower.includes("course") || category === "study") {
      detectedCategory = "study";
      title = `🎓 Study Guide: ${cleanPrompt.replace(/^(create|write|generate|note for)\s+/i, '')}`;
      content = `## Core Concepts & Fundamentals\nHigh-level conceptual breakdown of **${cleanPrompt}**.\n\n### Key Principles\n1. **Foundational Definition**: The primary mechanism operates by transforming inputs systematically.\n2. **Theoretical Model**: Understanding the governing rules and underlying mathematical/logical structure.\n3. **Practical Application**: Real-world implementation patterns and edge cases.\n\n> Important Takeaway: Always verify base cases and edge conditions during revision!\n\n### Review Questions\n- What is the primary difference between approach A and approach B?\n- How do you optimize for scalability?`;
      tags = ["Study", "Revision", "Concepts", "Learning"];
    } else if (pLower.includes("routine") || pLower.includes("habit") || pLower.includes("travel") || pLower.includes("workout") || category === "personal") {
      detectedCategory = "personal";
      title = `✨ ${cleanPrompt.replace(/^(create|write|generate|note for)\s+/i, '')}`;
      content = `### Daily Protocol & Goals\nFocusing on balance, vitality, and consistent progress for: **${cleanPrompt}**.\n\n- [ ] High priority wellness objective\n- [ ] Mindful reflection & journaling\n- [ ] Complete scheduled milestone\n\n### Personal Reflections\n*"Small daily improvements over time lead to stunning results."*`;
      tags = ["Personal", "Habits", "Growth", "Life"];
    } else {
      detectedCategory = "general";
      title = `🌐 ${cleanPrompt.replace(/^(create|write|generate|note for)\s+/i, '')}`;
      content = `## Overview\nComprehensive notes and analysis regarding **${cleanPrompt}**.\n\n### Key Points & Structure\n- Comprehensive context and high-level architectural view.\n- Scalability, maintainability, and clean design patterns.\n- Essential considerations for future iteration.\n\n### Next Steps\n- [ ] Review preliminary findings\n- [ ] Consolidate reference documentation`;
      tags = ["General", "Ideas", "Reference"];
    }

    return {
      title,
      content,
      category: detectedCategory,
      tags
    };
  }

  /**
   * Generates a concise summary of a note
   */
  async summarizeNote(noteTitle, noteContent) {
    if (this.apiKey) {
      try {
        return await this._callExternalAI(`Provide a 3-bullet concise executive summary for this note.\nTitle: ${noteTitle}\nContent: ${noteContent}`);
      } catch (err) {
        console.warn('API error, using built-in generator:', err);
      }
    }

    await this._simulateDelay(700);

    const lines = noteContent.split('\n').filter(l => l.trim().length > 0 && !l.startsWith('#'));
    const keyPoints = lines.slice(0, 3).map(l => l.replace(/^[-*•]\s+/, '').replace(/\[[ x]\]\s+/, '')).filter(l => l.length > 5);

    let summary = `### 💡 AI Executive Summary\n\n`;
    if (keyPoints.length > 0) {
      summary += keyPoints.map(p => `• **Key Insight**: ${p}`).join('\n\n');
    } else {
      summary += `• **Core Focus**: ${noteTitle}\n• **Status**: Active documentation covering key goals and reference points.`;
    }
    summary += `\n\n*Estimated read time: ~1 min*`;
    return summary;
  }

  /**
   * Extracts actionable to-dos and converts them to checklists
   */
  async extractActionItems(noteContent) {
    await this._simulateDelay(600);

    const lines = noteContent.split('\n');
    const actionItems = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^-\s*\[[ x]\]/.test(trimmed)) {
        actionItems.push(trimmed.replace(/^-\s*\[ \]\s*/, '').replace(/^-\s*\[x\]\s*/, ''));
      } else if (/^(todo|action|task|follow up|schedule|deliver|finalize|implement|review|create|fix|update)/i.test(trimmed)) {
        actionItems.push(trimmed.replace(/^[-*•]\s*/, ''));
      }
    }

    if (actionItems.length === 0) {
      return [
        "Review and refine note milestones",
        "Share relevant points with collaborators",
        "Set reminder for subsequent review"
      ];
    }

    return [...new Set(actionItems)];
  }

  /**
   * Rewrites note content in a requested tone
   */
  async rewriteTone(noteContent, targetTone = 'professional') {
    await this._simulateDelay(800);

    const tonePrefixes = {
      professional: "### 💼 Professional / Executive Tone\n\n",
      academic: "### 🎓 Academic & Structured Tone\n\n",
      casual: "### ☕ Casual & Friendly Tone\n\n",
      concise: "### ⚡ Ultra-Concise Summary\n\n"
    };

    let transformed = noteContent
      .replace(/###/g, '##')
      .replace(/!+/g, '.');

    if (targetTone === 'concise') {
      const sentences = noteContent.split('\n').filter(s => s.trim().length > 0);
      return (tonePrefixes.concise || "") + sentences.map(s => `- ${s.replace(/^[#\-*]\s*/, '')}`).slice(0, 5).join('\n');
    }

    return (tonePrefixes[targetTone] || "") + transformed;
  }

  /**
   * Generates interactive study flashcards from note content
   */
  async generateFlashcards(noteTitle, noteContent) {
    await this._simulateDelay(900);

    const cards = [];
    const lines = noteContent.split('\n').filter(l => l.trim().length > 0);

    // Extract definition-like pairs or bullet points
    for (const line of lines) {
      if (line.includes(':') && !line.startsWith('http')) {
        const [q, a] = line.split(':');
        if (q && a && q.trim().length > 3 && a.trim().length > 3) {
          cards.push({
            question: q.replace(/^[-*•#]\s*/, '').trim(),
            answer: a.trim()
          });
        }
      }
    }

    if (cards.length < 2) {
      cards.push(
        {
          question: `What is the core premise of "${noteTitle}"?`,
          answer: noteContent.substring(0, 140) + '...'
        },
        {
          question: `What are the critical success factors or takeaways?`,
          answer: `Refer to key bullet points and structural milestones documented in the note.`
        },
        {
          question: `How does this relate to broader domain knowledge?`,
          answer: `It provides fundamental insights that apply to scalable execution and problem solving.`
        }
      );
    }

    return cards;
  }

  /**
   * Recommends category & tags based on text
   */
  suggestCategoryAndTags(title, content) {
    const text = `${title} ${content}`.toLowerCase();
    
    let category = "general";
    if (text.includes("meeting") || text.includes("sprint") || text.includes("interview") || text.includes("architecture") || text.includes("client") || text.includes("project")) {
      category = "job";
    } else if (text.includes("algorithm") || text.includes("formula") || text.includes("lecture") || text.includes("exam") || text.includes("math") || text.includes("concept") || text.includes("study")) {
      category = "study";
    } else if (text.includes("workout") || text.includes("habit") || text.includes("trip") || text.includes("recipe") || text.includes("personal") || text.includes("wellness")) {
      category = "personal";
    }

    const keywordTags = [];
    const keywords = ["AI", "Career", "Health", "Planning", "DevOps", "Design", "Finance", "Study", "Coding", "Productivity", "Travel", "Research"];
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        keywordTags.push(kw);
      }
    }

    if (keywordTags.length === 0) {
      keywordTags.push(category.charAt(0).toUpperCase() + category.slice(1));
    }

    return { category, tags: keywordTags.slice(0, 4) };
  }

  _simulateDelay(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  async _callExternalAI(prompt) {
    // If user configured a Gemini endpoint / key
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
  }
}

window.aiService = new AIService();
