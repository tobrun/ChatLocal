import OpenAI from "openai";

const baseURL = process.env.VLLM_BASE_URL ?? "http://localhost:8000";

export const vllmClient = new OpenAI({
  baseURL: `${baseURL}/v1`,
  apiKey: "not-needed", // vLLM doesn't require auth
});

export { baseURL as vllmBaseURL };
