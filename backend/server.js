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
  "shopee.com.my",
  "lazada.com.my",
  "tiktok.com/shop/my",
  "temu.com",
  "amazon.com"
];
const DISCUSSION_ALLOWED_DOMAINS = [
  "reddit.com/r/malaysia",
  "facebook.com",
  "quora.com",
  "forum.lowyat.net",
  "instagram.com",
  "tiktok.com",
  "reddit.com"
];
const RESULTS_PER_DOMAIN = 10;

const client = new BedrockRuntimeClient({
  region: "ap-southeast-1", // Singapore region  (APAC region, Malaysia isn't available for this service)
  // API key is picked automatically from process.env.AWS_BEARER_TOKEN_BEDROCK
});

// Helper function to filter items for relevance using a Bedrock agent
async function filterRelevantItems(query, items) {
  if (!items || items.length === 0) {
    return [];
  }

  try {
    const modelInput = `Search Query: "${query}"\n\nItems to filter (JSON):\n${JSON.stringify(
      items.map((item) => ({ title: item.title, snippet: item.snippet })),
      null,
      2
    )}`;

    const messages = [
      { role: "user", content: [{ text: modelInput }] },
      {
        role: "assistant",
        content: [
          {
            text:
              "You are a strict Relevance Filtering Agent. Your task is to determine if the provided discussion forum items are highly relevant to the user's search query. " +
              "A discussion is relevant only if its title or snippet substantively discusses the product or topic in the search query, focusing on aspects like quality, reviews, or user experiences. " +
              "Vague mentions or unrelated topics in a similar context are not relevant. " +
              "Analyze the provided JSON array of items. Return ONLY a JSON object with a key 'relevantIndices' containing an array of the 0-based indices of the items that you deem relevant. " +
              'For example: {"relevantIndices": [0, 2, 4]}. Do not add explanations or any other text.',
          },
        ],
      },
    ];

    const modelId = "apac.amazon.nova-micro-v1:0";
    const command = new ConverseCommand({ modelId, messages });
    const response = await client.send(command);

    const outputText = response.output?.message?.content?.[0]?.text ?? "";
    const match = outputText.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn(
        "Relevance filter: No JSON object found in model output. Returning all items."
      );
      return items; // Fallback
    }

    const { relevantIndices } = JSON.parse(match[0]);

    if (!Array.isArray(relevantIndices)) {
      console.warn(
        "Relevance filter: Model did not return a valid 'relevantIndices' array. Returning all items."
      );
      return items; // Fallback
    }

    const relevantItems = items.filter((_, index) =>
      relevantIndices.includes(index)
    );
    console.log(
      `Relevance filter: Kept ${relevantItems.length} of ${items.length} items.`
    );
    return relevantItems;
  } catch (err) {
    console.error("Bedrock API error during relevance filtering:", err);
    // Fallback: if filtering fails, return the original items to not break the flow
    return items;
  }
}

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
              "You are a multilingual Product Identification Agent for project ZooGent, with a specialization in both Malaysian and international markets. Your task is to analyze the user's message, which may be in English or Bahasa Melayu, to identify the specific product, service, or topic they are looking for.\n" +
              "- If the user's query is in a language other than English, maintain the original language and terms.\n" +
              "- If the query contains Malaysian-specific terms (e.g., 'Nasi Lemak', 'Proton X50'), recognize them as valid product/topic names.\n" +
              "- If you detect a clear spelling mistake of a common word or phrase (e.g., 'Nasi Kelabur' instead of 'Nasi Kerabu'), correct it to the most likely intended term.\n" +
              "- If you encounter a term you do not understand, do not guess or translate it into an unrelated English word. Instead, use the original term directly in the output.\n" +
              "- Your output must be ONLY the identified product name, ready for the next step. For example:\n" +
              "  - If the user says 'kereta sewa murah', output 'kereta sewa murah'.\n" +
              "  - If the user says 'Nasi Kelabur', output 'Nasi Kerabu'.\n" +
              "  - If the user says 'best phone under RM1000', output 'best phone under RM1000'.\n" +
              "Provide only the product name and nothing else.",
          },
        ],
      },
    ];

    // Use your inference profile ID or ARN here
    //const modelId = "apac.amazon.nova-lite-v1:0";
    // const modelId = "arn:aws:bedrock:ap-southeast-1:257546622933:inference-profile/apac.amazon.nova-lite-v1:0";
    const modelId = "apac.amazon.nova-pro-v1:0";

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
              "You are the Search Keyword Agent of project ZooGent. " +
              "You will be given a product name. Your job is to generate a set of 3-5 diverse and effective search queries " +
              "to find the best deals and high-quality options for this product on e-commerce sites like Amazon, Shopee, and Lazada. " +
              "Focus on keywords that capture price, quality, and popularity. " +
              "Output ONLY the search queries, separated by newlines. For example, for 'ergonomic office chair', you might output:" +
              "\n'best budget ergonomic office chair'\n'top rated ergonomic chair 2025'\n'ergonomic office chair under $200'\n'premium mesh ergonomic chair'",
          },
        ],
      },
    ];

    const modelId = "apac.amazon.nova-pro-v1:0";

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
              "You are the Product List Agent. You will receive a user's request and a list of search results from online marketplaces. " +
              "Your task is to analyze these and identify the top 5 products that best match the user's needs (e.g., budget, quality, brand). " +
              "Output ONLY a clean, numbered list of the top 5 product titles as found in the search results. " +
              "Format: `1. Full Product Title`. Do not add explanations or any text outside the list.",
          },
        ],
      },
    ];

    const modelId = "apac.amazon.nova-pro-v1:0";
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
              "You are the Product List Agent. The user has provided a request but no search results are available. " +
              "Based on your general knowledge, recommend 1-5 specific, currently-sold products that match the user's request. " +
              "Prioritize products that are popular, high-quality, or good value. " +
              "Output ONLY a clean, numbered list in the format: `1. Brand – Product Name`. Do not add explanations.",
          },
        ],
      },
    ];

    const modelId = "apac.amazon.nova-pro-v1:0";
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

    const modelId = "apac.amazon.nova-pro-v1:0";
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
            "You are the JustificationAgent. Given the user's request and a specific recommended product, write a concise justification (1-2 sentences) explaining why this product is a good fit. " +
            "Highlight how its features align with the user's stated needs (budget, quality, etc.). " +
            "This will serve as a concluding summary for the user about this recommendation. " +
            "Return ONLY a JSON object exactly like this:\n" +
            "{ \"introduction\": \"Your justification here.\" }\n" +
            "No extra text, no explanation."
        }]
      }
    ];

    const modelId = "apac.amazon.nova-pro-v1:0";
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


// Bedrock Final Summary Agent
app.post("/api/bedrock/finalSummaryAgent", async (req, res) => {
  const { userRequest, products } = req.body;

  if (!userRequest) {
    return res.status(400).json({ error: "Missing 'userRequest' in request body" });
  }
  if (!Array.isArray(products)) {
    return res.status(400).json({ error: "Missing or invalid 'products' array in request body" });
  }

  try {
    const productTitles = products.map(p => p.title || p).join(', ');

    const modelInput = `User's request: "${userRequest}"\n\nTop products found: [${productTitles}]`;

    const messages = [
      {
        role: "user",
        content: [{ text: modelInput }]
      },
      {
        role: "assistant",
        content: [{
          text:
            "You are the Final Summary Agent. You will be given the user's original request and a list of the top products that were found. " +
            "Your task is to write a very brief, friendly, and conclusive message for the chat window. " +
            "Mention the product category you searched for and confirm that you've found some promising options. " +
            "For example: 'I've analyzed your request for a budget-friendly gaming chair and found several great options for you to consider below!' or 'Based on your interest in Nasi Kerabu, I've found some highly-rated local listings and discussions.' " +
            "The message should be a single, short paragraph. Output ONLY the summary text, with no extra formatting or JSON."
        }]
      }
    ];

    const modelId = "apac.amazon.nova-micro-v1:0";
    const command = new ConverseCommand({ modelId, messages });
    const response = await client.send(command);

    const summary = response.output?.message?.content?.[0]?.text ?? "Here are your personalized product recommendations:";

    res.json({ summary: summary.trim() });

  } catch (err) {
    console.error("Bedrock API error in finalSummaryAgent:", err);
    res.status(500).json({ summary: "Here are your personalized product recommendations:", error: "Summary generation failed", details: err.message });
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

    const filteredResults = await filterRelevantItems(query, allResults);

    res.json({ results: filteredResults.slice(0, 4) });
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

    const filteredResults = await filterRelevantItems(query, allResults);

    console.log("Combined and filtered marketplace results:", filteredResults);
    res.json({ results: filteredResults });
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
