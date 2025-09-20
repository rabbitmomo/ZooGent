import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const app = express();
app.use(cors());
app.use(express.json());
dotenv.config();

// Allowed domains to filter results for marketplace
const MARKETPLACE_ALLOWED_DOMAINS = [
  "amazon.com",
  "shopee.com.my",
  "lazada.com.my",
];
const DISCUSSION_ALLOWED_DOMAINS = [
  "reddit.com/r/malaysia",
  "facebook.com",
  "quora.com",
  "forum.lowyat.net",
];
const RESULTS_PER_DOMAIN = 1;

const client = new BedrockRuntimeClient({
  region: "ap-southeast-1", // Singapore region  (APAC region, Malaysia isn't available for this service)
  // API key is picked automatically from process.env.AWS_BEARER_TOKEN_BEDROCK
});

//Route of example starting hello world
app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello from backend!" });
});

// Bedrock Search Agent route, take userMessage and rewrite it as SEO-friendly search query
app.post("/api/bedrock/searchAgent", async (req, res) => {
  const { userMessage } = req.body;

  if (!userMessage) {
    return res
      .status(400)
      .json({ error: "Missing 'userMessage' in request body" });
  }

  try {
    const messages = [
      {
        role: "user",
        content: [{ text: userMessage }],
      },
      {
        role: "assistant",
        content: [
          {
            text:
              "You are Search Agent of project ZooGent. " +
              "Rewrite ONLY the user's message into a clear, SEO-friendly English query " +
              "focused on user needs. DO NOT repeat the original user message or include it in your output. " +
              "Output ONLY a single rewritten query—no explanations, no prefixes, no extra text.",
          },
        ],
      },
    ];

    // Use your inference profile ID or ARN here
    //const modelId = "apac.amazon.nova-lite-v1:0";
    // const modelId = "arn:aws:bedrock:ap-southeast-1:257546622933:inference-profile/apac.amazon.nova-lite-v1:0";
    const modelId = "apac.amazon.nova-micro-v1:0";

    const command = new ConverseCommand({ modelId, messages });
    const response = await client.send(command);

    res.json({ result: response });
  } catch (err) {
    console.error("Bedrock API error:", err);
    res
      .status(500)
      .json({ error: "Bedrock request failed", details: err.message });
  }
});

// Bedrock Summarize Agent route
app.post("/api/bedrock/summarizeAgent", async (req, res) => {
  let { forumMessage } = req.body;

  if (!forumMessage) {
    return res
      .status(400)
      .json({ error: "Missing 'forumMessage' in request body" });
  }

  // If it's an array, stringify it for the model
  if (Array.isArray(forumMessage)) {
    forumMessage = JSON.stringify(forumMessage, null, 2);
  }

  try {
    const messages = [
      {
        role: "user",
        content: [{ text: forumMessage }],
      },
      {
        role: "assistant",
        content: [
          {
            text:
              "You are SummarizeAgent. Your task is to read the forum search results " +
              "(title, snippet, domain, etc.) and produce a single, well-structured paragraph " +
              "that introduces the product being discussed, highlights key features, advantages, " +
              "disadvantages, and summarizes the main points of debate across the forums. " +
              "Limit your summary to 100 words. " +
              "Do not add unverified information—only use what is implied by the provided results.",
          },
        ],
      },
    ];

    const modelId = "apac.amazon.nova-micro-v1:0";

    const command = new ConverseCommand({ modelId, messages });
    const response = await client.send(command);

    res.json({ result: response });
  } catch (err) {
    console.error("Bedrock API error:", err);
    res
      .status(500)
      .json({ error: "Bedrock request failed", details: err.message });
  }
});

// Bedrock Product Recommend Agent route
app.post("/api/bedrock/productRecommendAgent", async (req, res) => {
  const { userRequest, searchResults } = req.body;

  if (!userRequest) {
    return res
      .status(400)
      .json({ error: "Missing 'userRequest' in request body" });
  }
  if (!Array.isArray(searchResults) || searchResults.length === 0) {
    console.warn(
      "No forum search results supplied—will rely on fallback if needed."
    );
  }

  // ✅ Build one combined prompt string up-front
  const forumPrompt = `User request:\n${userRequest}\n\nForum results:\n${JSON.stringify(
    searchResults || [],
    null,
    2
  )}`;

  // Helper: parse "1. Oppo A70\n2. Xiaomi..." -> ["Oppo A70", "Xiaomi ..."]
  function extractProducts(text) {
    const matches = text.match(/\d+\.\s*([^\n]+)/g) || [];
    return matches.map((m) => m.replace(/^\d+\.\s*/, "").trim());
  }

  // Model call using combined string
  async function callAgentWithForums() {
    const messages = [
      {
        role: "user", // start with user, single message
        content: [{ text: forumPrompt }],
      },
      {
        role: "assistant", // instructions as assistant
        content: [
          {
            text:
              "1. You are ProductRecommendAgent. " +
              "Read the user's request and the forum search results **as optional context**, " +
              "but you are free to use your own broad knowledge of the market to recommend the best-matching products. " +
              "Do not limit yourself to only the forum text. " +
              "Return at least 1 and at most 5 **specific, currently-sold best-matching products with full product names including their exact model numbers**. " +
              "Output ONLY a numbered list in the format '1. Brand ModelNumber'. " +
              "Do not add explanations or extra text.",
          },
        ],
      },
    ];

    const modelId = "apac.amazon.nova-micro-v1:0";
    const command = new ConverseCommand({ modelId, messages });
    const response = await client.send(command);

    const outputText =
      response.output?.message?.content?.[0]?.text ??
      response.output?.content?.[0]?.text ??
      "";

    return extractProducts(outputText);
  }

  // Fallback model call using only the user request
  async function callAgentUserOnly() {
    const messages = [
      {
        role: "user",
        content: [{ text: `User request:\n${userRequest}` }],
      },
      {
        role: "assistant",
        content: [
          {
            text:
              "You are ProductRecommendAgent. " +
              "Read the user's request **as optional context**, " +
              "but you are free to use your own broad knowledge of the market to recommend the best-matching products. " +
              "Return at least 1 and at most 5 **specific, currently-sold phone models with full product names including model numbers**. " +
              "Output ONLY a numbered list in the format '1. Brand ModelNumber'. " +
              "Do not add explanations or extra text.",
          },
        ],
      },
    ];

    const modelId = "apac.amazon.nova-micro-v1:0";
    const command = new ConverseCommand({ modelId, messages });
    const response = await client.send(command);

    const outputText =
      response.output?.message?.content?.[0]?.text ??
      response.output?.content?.[0]?.text ??
      "";

    return extractProducts(outputText);
  }

  async function getProductsWithRetry(maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const products = await callAgentWithForums();
      if (products.length > 0) {
        console.log(`Success on attempt ${attempt}`);
        return products;
      }
      console.warn(`Attempt ${attempt} returned no products. Retrying...`);
    }
    return [];
  }

  try {
    let products = await getProductsWithRetry(3);

    if (products.length === 0) {
      console.warn(
        "All forum-based attempts failed. Falling back to user-request-only suggestion."
      );
      products = await callAgentUserOnly();
    }

    if (products.length === 0) {
      return res.status(502).json({
        error:
          "No valid product names returned after 5 attempts and bedrock fallback",
      });
    }

    res.json({ products });
  } catch (err) {
    console.error("Bedrock API error:", err);
    res
      .status(500)
      .json({ error: "Bedrock request failed", details: err.message });
  }
});

// Bedrock Match Agent route: rank given products by suitability for the user's request
app.post("/api/bedrock/matchAgent", async (req, res) => {
  const { userMessage, products } = req.body;

  if (!userMessage) {
    return res.status(400).json({ error: "Missing 'userMessage' in request body" });
  }
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: "Missing or empty 'products' array in request body" });
  }

  try {
    const messages = [
      {
        role: "user",
        content: [{
          text:
            `User request:\n${userMessage}\n\n` +
            `Products to rank (one per line):\n${products.join("\n")}`
        }]
      },
      {
        role: "assistant",
        content: [{
          text:
            "You are Match Agent of project ZooGent. " +
            "Rank the provided products from most suitable (1) to least suitable (N) " +
            "based solely on how well they fit the user's request. " +
            "Return ONLY a JSON object like this:\n" +
            "{\"products\": [\"Product1\", \"Product2\", ...]}\n" +
            "No explanation, no extra text."
        }]
      }
    ];

    const modelId = "apac.amazon.nova-micro-v1:0";
    const command = new ConverseCommand({ modelId, messages });
    const response = await client.send(command);

    // Get the model text output
    const outputText =
      response.output?.message?.content?.[0]?.text ??
      response.output?.content?.[0]?.text ??
      "";

    // ✅ Safer parse: extract first {...} JSON block
    const match = outputText.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("No JSON object found in model output");
    }

    const ranked = JSON.parse(match[0]);
    res.json(ranked);

  } catch (err) {
    console.error("Bedrock API error:", err);
    res.status(500).json({
      error: "Bedrock request failed",
      details: err.message
    });
  }
});

//  Bedrock Product Advertising Agent
app.post("/api/bedrock/productAdvertisingAgent", async (req, res) => {
  const { userMessage, product } = req.body;

  // ---- Basic validation ----
  if (!userMessage) {
    return res.status(400).json({ error: "Missing 'userMessage' in request body" });
  }
  if (!product || typeof product !== "object") {
    return res.status(400).json({ error: "Missing or invalid 'product' in request body" });
  }

  try {
    // Safely stringify the whole product object so no raw braces/quotes break the prompt
    const productDetails = JSON.stringify(product, null, 2);

    const messages = [
      {
        role: "user",
        content: [{
          text:
            `User request:\n${userMessage}\n\n` +
            `Product details (JSON):\n${productDetails}`
        }]
      },
      {
        role: "assistant",
        content: [{
          text:
            "You are ProductAdvertisingAgent of project ZooGent. " +
            "Write a concise, appealing introduction for the given product, " +
            "highlighting how it matches the user's needs (budget-friendly phone in Malaysia, strong battery, good internet, 5G, etc.). " +
            "Base your wording on the provided product details but rewrite it as a natural advertising intro. " +
            "Return ONLY a JSON object exactly like this:\n" +
            "{ \"introduction\": \"Your rewritten product intro here.\" }\n" +
            "No extra text, no explanation."
        }]
      }
    ];

    const modelId = "apac.amazon.nova-micro-v1:0";
    const command = new ConverseCommand({ modelId, messages });
    const response = await client.send(command);

    // ---- Extract model output ----
    const outputText =
      response.output?.message?.content?.[0]?.text ??
      response.output?.content?.[0]?.text ??
      "";

    // ---- Safely grab the first JSON block ----
    const match = outputText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in model output");

    const intro = JSON.parse(match[0]);
    res.json(intro);

  } catch (err) {
    console.error("Bedrock API error:", err);
    res.status(500).json({
      error: "Bedrock request failed",
      details: err.message
    });
  }
});


// Custom Forum Search API route
app.post("/api/search/forum", async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Missing 'query' in request body" });
  }

  try {
    const allResults = [];

    // Loop through each domain and fetch results separately
    for (const domain of DISCUSSION_ALLOWED_DOMAINS) {
      const domainQuery = `${query} site:${domain}`;
      const response = await axios.get(
        "https://www.googleapis.com/customsearch/v1",
        {
          params: {
            // eslint-disable-next-line no-undef
            key: process.env.VITE_GOOGLE_API_KEY,
            // eslint-disable-next-line no-undef
            cx: process.env.VITE_GOOGLE_CX,
            q: domainQuery,
            num: RESULTS_PER_DOMAIN,
          },
        }
      );

      const items = response.data.items || [];
      const mapped = items.map((item) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        image: item.pagemap?.cse_image?.[0]?.src || null,
        domain,
      }));

      allResults.push(...mapped);
    }

    console.log("Combined results:", allResults);
    res.json({ results: allResults });
  } catch (error) {
    console.error("Custom Search API error:", error.message);
    res.status(500).json({
      error: "Custom Search API request failed",
      details: error.message,
    });
  }
});

// Custom Marketplace Website Search API route
app.post("/api/search/marketplace", async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Missing 'query' in request body" });
  }

  try {
    const allResults = [];

    // Loop through each domain and fetch results separately
    for (const domain of MARKETPLACE_ALLOWED_DOMAINS) {
      const domainQuery = `${query} site:${domain}`;
      const response = await axios.get(
        "https://www.googleapis.com/customsearch/v1",
        {
          params: {
            // eslint-disable-next-line no-undef
            key: process.env.VITE_GOOGLE_API_KEY,
            // eslint-disable-next-line no-undef
            cx: process.env.VITE_GOOGLE_CX,
            q: domainQuery,
            num: RESULTS_PER_DOMAIN,
          },
        }
      );

      const items = response.data.items || [];
      const mapped = items.map((item) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        image: item.pagemap?.cse_image?.[0]?.src || null,
        domain,
      }));

      allResults.push(...mapped);
    }

    console.log("Combined results:", allResults);
    res.json({ results: allResults });
  } catch (error) {
    console.error("Custom Search API error:", error.message);
    res.status(500).json({
      error: "Custom Search API request failed",
      details: error.message,
    });
  }
});

//Route of example openai api
app.post("/openai", async (req, res) => {
  console.log(req.body);
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: req.body.prompt }],
        max_tokens: 150,
      },
      {
        headers: {
          // eslint-disable-next-line no-undef
          Authorization: `Bearer ${process.env.VITE_OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({ message: response.data.choices[0]?.message?.content });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      error: "OpenAI API request failed",
      details: error.response?.data || error.message,
    });
  }
});

// eslint-disable-next-line no-undef
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
