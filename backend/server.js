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

//error indicator for backend frontend comms
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
              "You are an expert multilingual Product Identification Agent for project ZooGent, with a strong awareness of both the international and Malaysian markets. Your primary task is to accurately identify the product, service, or topic in the user's message, which may be in any language, including English and Bahasa Melayu.\n" +
              "- Prioritize user intent. If the query implies a specific region (e.g., using currency like 'RM' or local terms like 'Nasi Kerabu'), give weight to that region. Otherwise, assume an international context.\n" +
              "- If the query contains regional terms (e.g., 'Proton X50'), recognize them as valid product names.\n" +
              "- If you detect a clear spelling mistake of a common word or phrase (e.g., 'Nasi Kelabur' instead of 'Nasi Kerabu'), correct it to the most likely intended term.\n" +
              "- If you encounter a unique term you do not understand, do not guess or translate it. Use the original term directly in the output.\n" +
              "- Your output must be ONLY the identified product name. For example:\n" +
              "  - If the user says 'best affordable laptop for students', output 'best affordable laptop for students'.\n" +
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
              "You are SummarizeAgent. Your task is to read the provided forum search results and produce a single, well-structured paragraph summarizing the key points. " +
              "Highlight the main features, advantages, disadvantages, and overall sentiment about the product being discussed. " +
              "Limit your summary to 100 words and base it only on the information given in the search results.",
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
  const { userRequest, productTopic } = req.body;

  if (!userRequest || !productTopic) {
    return res.status(400).json({ error: "Missing 'userRequest' or 'productTopic' in request body" });
  }

  try {
    const modelInput = `User's original request: "${userRequest}"\nCore product topic: "${productTopic}"`;

    const messages = [
      {
        role: "user",
        content: [{ text: modelInput }]
      },
      {
        role: "assistant",
        content: [{
          text:
            "You are a Smart Search Query Generator. Your goal is to create a set of 3-5 strategic Google search queries to find the best products based on a user's request. You will be given the user's original request and the core product topic. Your queries should target different angles like price, quality, and key features mentioned. For example, if the user request is 'I need a cheap but high quality phone with a good camera' and the topic is 'budget high quality phone', you should generate queries like: [\"best budget camera phone 2024\", \"top rated affordable smartphones Malaysia\", \"phone under RM1000 with best camera\"]\n" +
            "Return ONLY a JSON object with a key 'queries' containing an array of the generated query strings. Do not add explanations."
        }]
      }
    ];

    const modelId = "apac.amazon.nova-pro-v1:0";
    const command = new ConverseCommand({ modelId, messages });
    const response = await client.send(command);

    const outputText = response.output?.message?.content?.[0]?.text ?? "";
    const match = outputText.match(/\{[\s\S]*\}/);
    if (!match) {
      // Fallback to just using the product topic if JSON parsing fails
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
