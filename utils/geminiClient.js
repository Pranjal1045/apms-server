
import { config } from "dotenv";
config();
import { GoogleGenerativeAI } from "@google/generative-ai";
console.log("GEMINI KEY:", process.env.GEMINI_API_KEY); 

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
