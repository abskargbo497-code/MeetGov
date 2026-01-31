import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// INFRASTRUCTURE-ONLY MODULE
// Business logic and user flows will be layered later

class AIClientService {
    private openai: OpenAI;
    private gemini: GoogleGenerativeAI;

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    }

    // Provider wrappers without business logic
    getOpenAIClient() {
        return this.openai;
    }

    getGeminiClient() {
        return this.gemini;
    }
}

export const aiClientService = new AIClientService();
