const DEFAULT_AZURE_OPENAI_ENDPOINT = "https://azureopenai-backofficeapiservice.openai.azure.com/";
const DEFAULT_AZURE_OPENAI_DEPLOYMENT = "chatbotdemo";
const DEFAULT_AZURE_OPENAI_API_VERSION = "2024-10-21";

export function isAzureOpenAIConfigured() {
  return Boolean(
    process.env.AZURE_OPENAI_API_KEY &&
      (process.env.AZURE_OPENAI_ENDPOINT || DEFAULT_AZURE_OPENAI_ENDPOINT) &&
      (process.env.AZURE_OPENAI_DEPLOYMENT || DEFAULT_AZURE_OPENAI_DEPLOYMENT)
  );
}

function getAzureOpenAIUrl() {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || DEFAULT_AZURE_OPENAI_ENDPOINT).replace(/\/$/, "");
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || DEFAULT_AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || DEFAULT_AZURE_OPENAI_API_VERSION;

  return `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
}

function extractJson(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error("Azure OpenAI response did not contain valid JSON.");
}

export async function generateAzureOpenAIJson<T>(input: {
  system: string;
  user: string;
  temperature?: number;
}): Promise<T> {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("AZURE_OPENAI_API_KEY is not configured.");
  }

  const response = await fetch(getAzureOpenAIUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      temperature: input.temperature ?? 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Azure OpenAI request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Azure OpenAI response did not include message content.");
  }

  return JSON.parse(extractJson(content)) as T;
}
