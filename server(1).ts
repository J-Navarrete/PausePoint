import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Gemini Setup
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ 
    apiKey: apiKey!,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // Monitoring Endpoint (Multimodal analysis)
  app.post("/api/monitor", async (req, res) => {
    try {
      const { image } = req.body; // base64 string
      if (!image) return res.status(400).json({ error: "No image provided" });

      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API key is not configured." });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: image.split(",")[1] || image,
              },
            },
            {
              text: `Analyze this screenshot of a user's phone. 
              1. Is the user currently doomscrolling on social media (e.g., TikTok, Instagram, YouTube Shorts, infinite feeds)? 
              2. What is the name of the app they are currently using?
              
              Answer only with a JSON object: { "isDoomscrolling": boolean, "appName": "string or null", "confidence": number, "reasoning": "short explanation" }. 
              Be strict about doomscrolling.`,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
        },
      });

      const result = JSON.parse(response.text || "{}");
      res.json(result);
    } catch (err: any) {
      console.error("Monitoring error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Routes
  app.post("/api/reframe", async (req, res) => {
    try {
      const { emotion, task, preferences } = req.body;
      const { persona, length, microStepType } = preferences || { 
        persona: "Supportive Peer", 
        length: "Ultra-short (<50 words)", 
        microStepType: "Digital" 
      };

      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API key is not configured." });
      }

      const systemInstruction = `
        You are Speedbump, a high-speed AI accountability agent. 
        Your goal is to snap the user out of a doomscrolling loop INSTANTLY.
        1. Empathize in 5-10 words maximum (e.g., "I get it, that loop is addictive."). 
        2. Give a 2-minute ${microStepType} micro-step that requires ZERO thinking.
        3. Persona: ${persona}. 
        4. Length constraint: ${length}.
        BE PUNCHY. NO FLUFF.
      `;

      const prompt = `User's current emotion: ${emotion}. Task they are avoiding: ${task}.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7,
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate reframe." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve built files
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
