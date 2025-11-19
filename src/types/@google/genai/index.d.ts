export class GoogleGenAI {
  constructor(config: { apiKey: string });
  models: {
    generateContent(input: any): Promise<{ text(): string } | any>;
  };
}
