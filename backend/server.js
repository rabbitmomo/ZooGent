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

// B2C domains for general consumers
const B2C_MARKETPLACE_DOMAINS = [
  "shopee.com.my",
  "lazada.com.my",
  "amazon.com",
  "temu.com",
  "tiktok.com",
];

// B2B domains for business users looking for suppliers
const B2B_MARKETPLACE_DOMAINS = [
  "alibaba.com",
  "globalsources.com",
  "europages.com",
  "amazon.com/business",
];

const DISCUSSION_ALLOWED_DOMAINS = [
  "reddit.com",
  "forum.lowyat.net",
  "quora.com",
];
const RESULTS_PER_DOMAIN = 10;

const client = new BedrockRuntimeClient({
  region: "ap-southeast-1",
  // API key is picked automatically from process.env.AWS_BEARER_TOKEN_BEDROCK
});

// Helper function to filter items for relevance using a Bedrock agent
async function filterRelevantItems(query, items, userType) {
  if (!items || items.length === 0) {
    return [];
  }

  try {
    const modelInput = `Search Query: "${query}"
User Type: "${userType}"

Items to filter (JSON):
${JSON.stringify(
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
              `You are a strict Relevance Filtering Agent. You are filtering results for a '${userType === 'B2B' ? 'Business User' : 'General Consumer'}'. Adjust your relevance criteria accordingly. A discussion is relevant only if its title or snippet substantively discusses the product or topic in the search query. Vague mentions are not relevant. Return ONLY a JSON object with a key 'relevantIndices' containing an array of the 0-based indices of the items that you deem relevant. For example: {"relevantIndices": [0, 2, 4]}.`,
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
      return items; // Fallback
    }

    const { relevantIndices } = JSON.parse(match[0]);

    if (!Array.isArray(relevantIndices)) {
      return items; // Fallback
    }

    const relevantItems = items.filter((_, index) =>
      relevantIndices.includes(index)
    );
    return relevantItems;
  } catch (err) {
    console.error("Bedrock API error during relevance filtering:", err);
    return items;
  }
}

app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello from backend!" });
});

// Bedrock Intent Router Agent: Classifies user intent as B2C or B2B
app.post("/api/bedrock/intentRouterAgent", async (req, res) => {
  const { userMessage } = req.body;

  if (!userMessage) {
    return res.status(400).json({ error: "Missing 'userMessage' in request body" });
  }

  try {
    const messages = [
      {
        role: "user",
        content: [{ text: userMessage }]
      },
      {
        role: "assistant",
        content: [{
          text:
            "You are an expert Intent Router. Your task is to analyze the user's message and classify their intent. Determine if they are a 'General Consumer' looking for products to buy, or a 'Business User' looking for suppliers, manufacturers, or wholesalers. Keywords like 'supplier', 'manufacturer', 'wholesale', 'bulk', 'sourcing' indicate a Business User. Return ONLY a JSON object with a single key 'userType' which can be either 'B2C' or 'B2B'."
        }]
      }
    ];

    const modelId = "apac.amazon.nova-micro-v1:0";
    const command = new ConverseCommand({ modelId, messages });
    const response = await client.send(command);

    const outputText = response.output?.message?.content?.[0]?.text ?? "";
    const match = outputText.match(/\{[\s\S]*\}/);

    if (match) {
      const parsed = JSON.parse(match[0]);
      const userType = parsed.userType === 'B2B' ? 'B2B' : 'B2C';
      res.json({ userType });
    } else {
      res.json({ userType: 'B2C' });
    }
  } catch (err) {
    console.error("Bedrock API error in intentRouterAgent:", err);
    res.status(500).json({ userType: 'B2C', error: "Intent analysis failed", details: err.message });
  }
});

// Bedrock Search Agent route, take userMessage and rewrite it as SEO-friendly search query
app.post("/api/bedrock/searchAgent", async (req, res) => {
  const { userMessage, userType } = req.body;

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
              `You are an expert multilingual Product Identification Agent. You are assisting a '${userType === 'B2B' ? 'Business User' : 'General Consumer'}'. Tailor your interpretation accordingly. Your primary task is to accurately identify the product, service, or topic in the user's message, which may be in any language. Prioritize user intent. If the query implies a specific region (e.g., using currency like 'RM' or local terms), give weight to that region. Otherwise, assume an international context. If you detect a clear spelling mistake, correct it. If you encounter a unique term, use the original term directly. Your output must be ONLY the identified product name.`
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

// Bedrock Summarize Agent route
app.post("/api/bedrock/summarizeAgent", async (req, res) => {
  const { rewrittenQuery, userType } = req.body;

  if (!rewrittenQuery) {
    return res
      .status(400)
      .json({ error: "Missing 'rewrittenQuery' in request body" });
  }

  try {
    const messages = [
      {
        role: "user",
        content: [{ text: `Please find information about "${rewrittenQuery}" on discussion forums and then provide a one-paragraph summary of the findings.` }],
      },
      {
        role: "assistant",
        content: [
          {
            text:
              `You are SummarizeAgent. You have the ability to search the web. You are summarizing discussions for a '${userType === 'B2B' ? 'Business User' : 'General Consumer'}'. First, perform a web search for the user's query on sites like Reddit, Quora, and other forums. Then, based on the search results, produce a single, well-structured paragraph summarizing the key points. Highlight the main features, advantages, disadvantages, and overall sentiment. Limit your summary to 100 words.`,
          },
        ],
      },
    ];

    const modelId = "apac.amazon.nova-pro-v1:0"; // A model that can search
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

// Bedrock Master Analysis Agent
app.post("/api/bedrock/masterAnalysisAgent", async (req, res) => {
  const { userMessage, userType, searchResults } = req.body;

  if (!userMessage || !userType || !searchResults) {
    return res.status(400).json({ error: "Missing required fields in request body" });
  }

  try {
    const modelInput = `User's original request: "${userMessage}"
User Type: "${userType}"

Raw Search Results (JSON):
${JSON.stringify(searchResults, null, 2)}`;

    const messages = [
      {
        role: "user",
        content: [{ text: modelInput }]
      },
      {
        role: "assistant",
        content: [{
          text:
            `You are a Master Analysis AI. You will be given a user's request, their user type (B2C or B2B), and a list of raw search results. Your task is to perform a complete analysis and return a single JSON object with two keys: "ranked_products" and "summary".

For 'ranked_products': Analyze the user's request for all criteria (price, quality, features, etc.). Scrutinize the provided search results. Filter out any irrelevant items. From the relevant items, select the top 20 that best match the user's request and rank them from most to least suitable. The value for 'ranked_products' must be a JSON array of the original product objects in their new ranked order.

For 'summary': Based on your analysis, write a brief, friendly, and conclusive summary for the user, mentioning the product you searched for and confirming you found some promising options. The value for 'summary' must be a single string.

Your entire output must be a single, valid JSON object and nothing else.`
        }]
      }
    ];

    const modelId = "apac.amazon.nova-pro-v1:0";
    const command = new ConverseCommand({ modelId, messages });
    const response = await client.send(command);

    const outputText = response.output?.message?.content?.[0]?.text ?? "";
    const match = outputText.match(/\{[\s\S]*\}/);

    if (match) {
      const parsed = JSON.parse(match[0]);
      res.json(parsed);
    } else {
      res.status(500).json({ error: "Failed to parse Master Analysis Agent response" });
    }

  } catch (err) {
    console.error("Bedrock API error in masterAnalysisAgent:", err);
    res.status(500).json({ error: "Master analysis failed", details: err.message });
  }
});


// Custom Marketplace Website Search API route
app.post("/api/search/marketplace", async (req, res) => {
  const { query, userType } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Missing 'query' in request body" });
  }

  const domainList = userType === 'B2B' ? B2B_MARKETPLACE_DOMAINS : B2C_MARKETPLACE_DOMAINS;

  try {
    const allResults = [];

    for (const domain of domainList) {
      const domainQuery = `${query} site:${domain}`;
      const response = await axios.get(
        "https://www.googleapis.com/customsearch/v1",
        {
          params: {
            key: process.env.VITE_GOOGLE_API_KEY,
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

    // No AI filtering here, pass raw results to the master agent
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

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});