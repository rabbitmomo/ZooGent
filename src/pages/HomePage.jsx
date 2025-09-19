import React, { useState } from "react";

export default function ChatBox() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const BASE_URL = "http://localhost:5000";

  // Call Bedrock Search Agent to rewrite user message
  const callSearchAgent = async (userMessage) => {
    try {
      const res = await fetch(`${BASE_URL}/api/bedrock/searchAgent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage }),
      });
      const data = await res.json();
      const rewritten =
        data?.result?.output?.message?.content?.[0]?.text ||
        data?.result?.introduction ||
        userMessage;
      return rewritten.trim();
    } catch (err) {
      console.error("SearchAgent API error:", err);
      return userMessage;
    }
  };

  // Call Custom Forum Search with rewritten query
  const callForumSearch = async (query) => {
    try {
      const res = await fetch(`${BASE_URL}/api/search/forum`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!data.results || !data.results.length)
        return "No forum results found.";

      // Format results for chat display
      return data.results
        .map((item) => `• ${item.title} (${item.domain})\n${item.link}`)
        .join("\n\n");
    } catch (err) {
      console.error("Forum Search API error:", err);
      return "Error fetching forum results.";
    }
  };

  // Call Bedrock Summarize Agent with forum results
  const callSummarizeAgent = async (forumMessage) => {
    try {
      const res = await fetch(`${BASE_URL}/api/bedrock/summarizeAgent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forumMessage }),
      });
      const data = await res.json();
      return (
        data?.result?.output?.message?.content?.[0]?.text ||
        data?.result?.introduction ||
        "No summary available."
      ).trim();
    } catch (err) {
      console.error("SummarizeAgent API error:", err);
      return "Error generating summary.";
    }
  };

  // Call Bedrock Product Recommend Agent with user request and forum results
  const callProductRecommendAgent = async (userRequest, forumResults) => {
    try {
      const forumResultsArray = forumResults
        .split("\n\n")
        .map((item) => item.trim())
        .filter(Boolean);

      const res = await fetch(`${BASE_URL}/api/bedrock/productRecommendAgent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userRequest,
          searchResults: forumResultsArray,
        }),
      });

      const data = await res.json();
      if (!data.products || !data.products.length)
        return "No product recommendations.";
      return data.products.map((p, i) => `${i + 1}. ${p}`).join("\n");
    } catch (err) {
      console.error("ProductRecommendAgent API error:", err);
      return "Error fetching product recommendations.";
    }
  };

  // Call Bedrock Match Agent with user message and product list
  const callMatchAgent = async (userMessage, products) => {
    try {
      // Ensure products is an array of plain names
      const productArray = Array.isArray(products)
        ? products
        : products
            .split("\n")
            .map((p) => p.replace(/^\d+\.\s*/, "").trim()) // remove "1. " etc.
            .filter(Boolean);

      if (!productArray.length) return "No ranked products.";

      const res = await fetch(`${BASE_URL}/api/bedrock/matchAgent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage,
          products: productArray, // pass as array
        }),
      });

      const data = await res.json();
      if (!data.products || !data.products.length) return "No ranked products.";

      return data.products.map((p, i) => `${i + 1}. ${p}`).join("\n");
    } catch (err) {
      console.error("MatchAgent API error:", err);
      return "Error fetching ranked products.";
    }
  };

  // Call Custom Marketplace Search API
  const callMarketplaceSearch = async (products) => {
    try {
      const topProducts = Array.isArray(products)
        ? products.slice(0, 3) // top 3
        : products
            .split("\n")
            .map((p) => p.replace(/^\d+\.\s*/, "").trim())
            .filter(Boolean)
            .slice(0, 3);

      if (!topProducts.length) return "No marketplace search results.";

      const resultsArray = [];

      for (const product of topProducts) {
        const res = await fetch(`${BASE_URL}/api/search/marketplace`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: product }),
        });
        const data = await res.json();

        if (data.results && data.results.length) {
          // take top 3 results per product from the marketplaces 
          const topResults = data.results.slice(0, 3);
          topResults.forEach((r) => {
            resultsArray.push(
              `• ${product} (${r.domain}):\n  ${r.title}\n  ${r.link}\n  ${r.snippet}`
            );
          });
        }
      }

      return resultsArray.join("\n\n");
    } catch (err) {
      console.error("Marketplace Search API error:", err);
      return "Error fetching marketplace search results.";
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input;
    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setInput("");
    setLoading(true);

    try {
      // Step 1: Rewrite user message for search
      const rewrittenQuery = await callSearchAgent(userMessage);

      // Step 2: Search forums with rewritten query
      const forumResults = await callForumSearch(rewrittenQuery);

      // Step 3: Summarize forum results
      const forumSummary = await callSummarizeAgent(forumResults);

      // Step 4: Get product recommendations
      const productRecommendations = await callProductRecommendAgent(
        userMessage,
        forumResults
      );

      // Step 5: Rank products with Match Agent
      const rankedProducts = await callMatchAgent(
        userMessage,
        productRecommendations
      );

      // Step 6: Marketplace search for top 3 ranked products
      const marketplaceResults = await callMarketplaceSearch(rankedProducts);

      // Step 7: Combine everything into one bot message
      const combinedBotMessage = `Search Query:\n${rewrittenQuery}\n\nForum Results:\n${forumResults}\n\nSummary:\n${forumSummary}\n\nProduct Recommendations:\n${productRecommendations}\n\nRanked Products:\n${rankedProducts}\n\nMarketplace Top Results:\n${marketplaceResults}`;

      setMessages((prev) => [
        ...prev,
        { role: "bot", text: combinedBotMessage },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "Error processing request." + err.message },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
  className="d-flex flex-column align-items-center p-4"
  style={{
    minHeight: "100vh",//800080
    background: "linear-gradient(180deg, #e6e6fa 0%, #800080 100%)",
    color: "#fff",
  }}
>
  <h2 className="mb-4" style={{ color: "#000000" }}>ZooGent Chat</h2>

  <div
    className="border rounded p-3 mb-3 w-100"
    style={{
      maxWidth: 600,
      height: 400,
      overflowY: "auto",
      background: "#ffffff",
      borderColor: "#000000",
    }}
  >
    {messages.map((m, idx) => (
      <div
        key={idx}
        className={`d-flex mb-3 ${m.role === "user" ? "justify-content-end" : "justify-content-start"}`}
      >
        {/* Bot avatar on the left */}
        {m.role === "bot" && (
          <div
            className="rounded-circle d-flex align-items-center justify-content-center me-2"
            style={{
              width: 32,
              height: 32,
              background: "#333",
              color: "#fff",
              fontWeight: "bold",
            }}
          >
            Bot
          </div>
        )}

        {/* Message bubble */}
        <div
          className={`p-2 rounded`}
          style={{
            maxWidth: "70%",
            whiteSpace: "pre-wrap",
            background: m.role === "user" ? "#0d6efd" : "#0d6efd",
            color: m.role === "user" ? "#fff" : "#eee",
          }}
        >
          {m.text}
        </div>

        {/* User avatar on the right */}
        {m.role === "user" && (
          <div
            className="rounded-circle d-flex align-items-center justify-content-center ms-2"
            style={{
              width: 32,
              height: 32,
              background: "#0d6efd",
              color: "#fff",
              fontWeight: "bold",
            }}
          >
            You
          </div>
        )}
      </div>
    ))}
  </div>

  <form
    onSubmit={handleSend}
    className="d-flex w-100"
    style={{ maxWidth: 600 }}
  >
    <input
      className="form-control me-2"
      placeholder="Type your message…"
      value={input}
      onChange={(e) => setInput(e.target.value)}
      disabled={loading}
      style={{
        background: "#ffffff",
        color: "#000000",
        borderColor: "#444",
      }}
    />
    <button type="submit" className="btn btn-primary" disabled={loading}>
      {loading ? "Thinking…" : "Send"}
    </button>
  </form>
</div>

  );
}
