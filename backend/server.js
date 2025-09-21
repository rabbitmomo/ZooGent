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
  "reddit.com/r/malaysia",
  "facebook.com",
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
  let { forumMessage, userType } = req.body;

  if (!forumMessage) {
    return res
      .status(400)
      .json({ error: "Missing 'forumMessage' in request body" });
  }

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
              `You are SummarizeAgent. You are summarizing discussions for a '${userType === 'B2B' ? 'Business User' : 'General Consumer'}'. Your task is to read the provided forum search results and produce a single, well-structured paragraph summarizing the key points. Highlight the main features, advantages, disadvantages, and overall sentiment. Limit your summary to 100 words and base it only on the information given.`,
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

// Bedrock Smart Query Agent
app.post("/api/bedrock/smartQueryAgent", async (req, res) => {
  const { userRequest, productTopic, userType } = req.body;

  if (!userRequest || !productTopic) {
    return res.status(400).json({ error: "Missing 'userRequest' or 'productTopic' in request body" });
  }

  try {
    const modelInput = `User's original request: "${userRequest}"
Core product topic: "${productTopic}"`;

    const messages = [
      {
        role: "user",
        content: [{ text: modelInput }]
      },
      {
        role: "assistant",
        content: [{
          text:
            `You are a Smart Search Query Generator. You are generating queries for a '${userType === 'B2B' ? 'Business User looking for suppliers' : 'General Consumer'}'. For Business Users, focus on terms like 'manufacturer', 'wholesale', 'factory', 'MOQ'. For Consumers, focus on 'best', 'review', 'price', 'vs'. Your goal is to create a set of 3-5 strategic Google search queries. Return ONLY a JSON object with a key 'queries' containing an array of the generated query strings.`
        }]
      }
    ];

    const modelId = "apac.amazon.nova-pro-v1:0";
    const command = new ConverseCommand({ modelId, messages });
    const response = await client.send(command);

    const outputText = response.output?.message?.content?.[0]?.text ?? "";
    const match = outputText.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.json({ queries: [productTopic] });
    }

    const parsed = JSON.parse(match[0]);
    if (!parsed.queries || parsed.queries.length === 0) {
      return res.json({ queries: [productTopic] });
    }

    res.json(parsed);

  } catch (err) {
    console.error("Bedrock API error in smartQueryAgent:", err);
    res.status(500).json({ queries: [productTopic], error: "Smart query generation failed", details: err.message });
  }
});

// Bedrock Match Agent route: rank given products by suitability for the user's request
app.post("/api/bedrock/matchAgent", async (req, res) => {
  const { userMessage, products, userType } = req.body;

  if (!userMessage) {
    return res.status(400).json({ error: "Missing 'userMessage' in request body" });
  }
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: "Missing or empty 'products' array in request body" });
  }

  try {
    const modelInput = `User's original request: "${userMessage}"

Product candidates (JSON):
${JSON.stringify(products, null, 2)}`;

    const messages = [
      {
        role: "user",
        content: [{ text: modelInput }]
      },
      {
        role: "assistant",
        content: [{
          text:
            `You are an expert Product Matching and Ranking Agent. You are ranking results for a '${userType === 'B2B' ? 'Business User' : 'General Consumer'}'. For Business Users, prioritize supplier verification, bulk pricing indicators, and manufacturing capabilities. For Consumers, prioritize user reviews, value for money, and popular features. Your critical task is to analyze a list of product candidates and rank them based on how well they fit the user's original request. Return ONLY a JSON object with a 'products' key containing an array of the FULL original product objects, sorted from most to least relevant. Do not alter the objects. Do not add explanations.`
        }]
      }
    ];

    const modelId = "apac.amazon.nova-pro-v1:0";
    const command = new ConverseCommand({ modelId, messages });
    const response = await client.send(command);

    const outputText = response.output?.message?.content?.[0]?.text ?? "";
    const match = outputText.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.json({ products: products });
    }

    const ranked = JSON.parse(match[0]);
    if (!ranked.products) {
      return res.json({ products: products });
    }

    res.json(ranked);

  } catch (err) {
    console.error("Bedrock API error in matchAgent:", err);
    res.status(500).json({ products: products, error: "Ranking failed", details: err.message });
  }
});

// Bedrock Final Summary Agent
app.post("/api/bedrock/finalSummaryAgent", async (req, res) => {
  const { userRequest, products, userType } = req.body;

  if (!userRequest) {
    return res.status(400).json({ error: "Missing 'userRequest' in request body" });
  }
  if (!Array.isArray(products)) {
    return res.status(400).json({ error: "Missing or invalid 'products' array in request body" });
  }

  try {
    const productTitles = products.map(p => p.title || p).join(', ');

    const modelInput = `User's request: "${userRequest}"

Top products found: [${productTitles}]`;

    const messages = [
      {
        role: "user",
        content: [{ text: modelInput }]
      },
      {
        role: "assistant",
        content: [{
          text:
            `You are the Final Summary Agent. Your audience is a '${userType === 'B2B' ? 'Business User' : 'General Consumer'}'. Tailor your language appropriately. Your task is to write a very brief, friendly, and conclusive message for the chat window. Mention the product category you searched for and confirm that you've found some promising options. The message should be a single, short paragraph. Output ONLY the summary text, with no extra formatting or JSON.`
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
  const { query, userType } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Missing 'query' in request body" });
  }

  try {
    const allResults = [];

    for (const domain of DISCUSSION_ALLOWED_DOMAINS) {
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

    const filteredResults = await filterRelevantItems(query, allResults, userType);

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

    const filteredResults = await filterRelevantItems(query, allResults, userType);

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