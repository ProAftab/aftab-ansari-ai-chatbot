require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
const PORT = 3000;

const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1"
});

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Aftab Ansari AI Backend is running 🚀");
});

app.post("/api/chat", async (req, res) => {
    const userMessage = req.body.message;

    console.log("User message:", userMessage);

    try {
        const completion = await client.chat.completions.create({
            model: "openrouter/free",
            messages: [
                {
                    role: "user",
                    content: userMessage
                }
            ]
        });

        const reply = completion.choices[0].message.content;

        console.log("AI reply received");

        res.json({
            reply: reply
        });

    } catch (error) {
        console.error("OpenRouter Error:", error.message);

        res.status(500).json({
            reply: "Sorry, I couldn't connect to the AI right now."
        });
    }
});

app.listen(PORT, () => {
    console.log(`Aftab Ansari AI server running at http://localhost:${PORT}`);
});