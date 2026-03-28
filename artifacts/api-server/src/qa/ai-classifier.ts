type BugCategory =
  | 'UX Bug'
  | 'Functional Bug'
  | 'Security Risk'
  | 'Accessibility Issue'
  | 'Performance Issue'
  | 'Minor Styling';

interface ClassificationResult {
  category: BugCategory;
  confidence: number;
}

function heuristicClassify(description: string, issueType: string): ClassificationResult {
  const text = `${issueType} ${description}`.toLowerCase();

  if (text.includes('sql') || text.includes('xss') || text.includes('injection') || text.includes('password') || text.includes('security')) {
    return { category: 'Security Risk', confidence: 0.9 };
  }
  if (text.includes('alt text') || text.includes('aria') || text.includes('label') || text.includes('heading') || text.includes('screen reader') || text.includes('accessibility')) {
    return { category: 'Accessibility Issue', confidence: 0.85 };
  }
  if (text.includes('404') || text.includes('not found') || text.includes('broken') || text.includes('validation') || text.includes('submit')) {
    return { category: 'Functional Bug', confidence: 0.8 };
  }
  if (text.includes('overflow') || text.includes('overlap') || text.includes('viewport')) {
    return { category: 'UX Bug', confidence: 0.75 };
  }
  if (text.includes('load') || text.includes('timeout') || text.includes('slow')) {
    return { category: 'Performance Issue', confidence: 0.7 };
  }
  if (text.includes('meta') || text.includes('title') || text.includes('seo') || text.includes('styling')) {
    return { category: 'Minor Styling', confidence: 0.65 };
  }
  return { category: 'UX Bug', confidence: 0.5 };
}

async function classifyWithOpenAI(
  apiKey: string,
  model: string,
  description: string,
  issueType: string
): Promise<ClassificationResult> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `You are a QA expert. Classify the following bug into exactly one category: "UX Bug", "Functional Bug", "Security Risk", "Accessibility Issue", "Performance Issue", "Minor Styling". Respond with JSON only: {"category": "...", "confidence": 0.0-1.0}`,
          },
          {
            role: 'user',
            content: `Issue Type: ${issueType}\nDescription: ${description}`,
          },
        ],
        max_tokens: 100,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      return heuristicClassify(description, issueType);
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(content) as { category?: string; confidence?: number };

    return {
      category: (parsed.category as BugCategory) || 'UX Bug',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
    };
  } catch {
    return heuristicClassify(description, issueType);
  }
}

export async function classifyBug(
  description: string,
  issueType: string,
  enableAI: boolean,
  openaiApiKey?: string,
  model = 'gpt-4o'
): Promise<ClassificationResult> {
  if (enableAI && openaiApiKey && openaiApiKey !== 'your_openai_key_here') {
    return classifyWithOpenAI(openaiApiKey, model, description, issueType);
  }
  return heuristicClassify(description, issueType);
}
