import React, { useState } from "react";

export default function HomePage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const BASE_URL = "https://dacp3uiyfj.ap-southeast-1.awsapprunner.com";

  const callIntentRouterAgent = async (userMessage) => {
    try {
      const res = await fetch(`${BASE_URL}/api/bedrock/intentRouterAgent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage }),
      });
      const data = await res.json();
      return data.userType || 'B2C'; // Default to B2C on error
    } catch (err) {
      console.error("IntentRouterAgent API error:", err);
      return 'B2C'; // Default to B2C on error
    }
  };

  const callSearchAgent = async (userMessage, userType) => {
    try {
      const res = await fetch(`${BASE_URL}/api/bedrock/searchAgent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage, userType }),
      });
      const data = await res.json();
      const rewritten =
        data?.result?.output?.message?.content?.[0]?.text ||
        userMessage;
      return rewritten.trim();
    } catch (err) {
      console.error("SearchAgent API error:", err);
      return userMessage;
    }
  };

  const callForumSearch = async (query, userType) => {
    try {
      const res = await fetch(`${BASE_URL}/api/search/forum`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, userType }),
      });
      const data = await res.json();
      if (!data.results || !data.results.length)
        return "No forum results found.";
      return data.results;
    } catch (err) {
      console.error("Forum Search API error:", err);
      return "Error fetching forum results.";
    }
  };

  const callSummarizeAgent = async (forumResults, userType) => {
    try {
      const forumMessage = Array.isArray(forumResults) 
        ? forumResults.map((item) => `• ${item.title} (${item.domain})\n${item.link}`).join("\n\n")
        : forumResults;

      const res = await fetch(`${BASE_URL}/api/bedrock/summarizeAgent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forumMessage, userType }),
      });
      const data = await res.json();
      return (
        data?.result?.output?.message?.content?.[0]?.text ||
        "No summary available."
      ).trim();
    } catch (err) {
      console.error("SummarizeAgent API error:", err);
      return "Error generating summary.";
    }
  };

  const callContextAgent = async (previousMessage, newMessage) => {
    try {
      const res = await fetch(`${BASE_URL}/api/bedrock/contextAgent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previousMessage, newMessage }),
      });
      const data = await res.json();
      return data.isFollowUp === true;
    } catch (err) {
      console.error("ContextAgent API error:", err);
      return false;
    }
  };

  const callSmartQueryAgent = async (userRequest, productTopic, userType) => {
    try {
      const res = await fetch(`${BASE_URL}/api/bedrock/smartQueryAgent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userRequest, productTopic, userType }),
      });
      const data = await res.json();
      return data.queries && data.queries.length > 0 ? data.queries : [productTopic];
    } catch (err) {
      console.error("SmartQueryAgent API error:", err);
      return [productTopic];
    }
  };

  const callMarketplaceSearch = async (queries, userType) => {
    try {
      if (!queries || queries.length === 0) return [];

      let allResults = [];
      await Promise.all(queries.map(async (query) => {
        const res = await fetch(`${BASE_URL}/api/search/marketplace`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, userType }),
        });
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          allResults = allResults.concat(data.results);
        }
      }));

      if (allResults.length === 0) return [];

      const uniqueTitles = new Set();
      const distinctResults = allResults.filter(result => {
        const normalizedTitle = result.title.toLowerCase();
        if (!uniqueTitles.has(normalizedTitle)) {
          uniqueTitles.add(normalizedTitle);
          return true;
        }
        return false;
      });
      
      return distinctResults;

    } catch (err) {
      console.error("Marketplace Search API error:", err);
      return [];
    }
  };

  const callMatchAgent = async (userMessage, products, userType) => {
    try {
      if (!products || products.length === 0) return [];

      const res = await fetch(`${BASE_URL}/api/bedrock/matchAgent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage, products, userType }),
      });
      const data = await res.json();
      return data.products || products;
    } catch (err) {
      console.error("MatchAgent API error:", err);
      return products;
    }
  };

  const callFinalSummaryAgent = async (userRequest, products, userType) => {
    try {
      const res = await fetch(`${BASE_URL}/api/bedrock/finalSummaryAgent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userRequest, products, userType }),
      });
      const data = await res.json();
      return data.summary || "Here are your personalized product recommendations:";
    } catch (err) {
      console.error("FinalSummaryAgent API error:", err);
      return "Here are your personalized product recommendations:";
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newUserMessage = input;
    const currentMessages = [...messages, { role: "user", text: newUserMessage }];
    
    setMessages(currentMessages);
    setInput("");
    setLoading(true);
    setCurrentStep(0);

    try {
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.text;
      let contextualUserMessage = newUserMessage;

      if (lastUserMessage) {
        const isFollowUp = await callContextAgent(lastUserMessage, newUserMessage);
        if (isFollowUp) {
          contextualUserMessage = `Previous request: "${lastUserMessage}".\nFollow-up request: "${newUserMessage}"`;
        }
      }

      // Step 1: Classify Intent
      setCurrentStep(1);
      const userType = await callIntentRouterAgent(contextualUserMessage);

      // Step 2: Rewrite user message for search
      setCurrentStep(2);
      const rewrittenQuery = await callSearchAgent(contextualUserMessage, userType);

      // Step 3: Generate Smart Queries
      setCurrentStep(3);
      const smartQueries = await callSmartQueryAgent(contextualUserMessage, rewrittenQuery, userType);

      // Step 4: Search forums with rewritten query
      setCurrentStep(4);
      const forumResults = await callForumSearch(rewrittenQuery, userType);

      // Step 5: Summarize forum results
      setCurrentStep(5);
      const forumSummary = await callSummarizeAgent(forumResults, userType);

      // Step 6: Marketplace search using the smart queries
      setCurrentStep(6);
      const marketplaceCandidates = await callMarketplaceSearch(smartQueries, userType);

      // Step 7: Final Ranking of all candidates
      setCurrentStep(7);
      const rankedProducts = await callMatchAgent(contextualUserMessage, marketplaceCandidates, userType);

      // Step 8: Get final summary
      setCurrentStep(8);
      const finalSummary = await callFinalSummaryAgent(contextualUserMessage, rankedProducts.slice(0, 20), userType);

      // Step 9: Complete
      setCurrentStep(9);

      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: finalSummary,
          results: {
            searchQuery: rewrittenQuery,
            forumResults: Array.isArray(forumResults) ? forumResults : [],
            summary: forumSummary,
            marketplaceResults: rankedProducts.slice(0, 20),
          },
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "Error processing request." + err.message },
      ]);
    } finally {
      setLoading(false);
      setCurrentStep(0);
    }
  };

  const pipelineSteps = [
    { id: 1, name: "Intent", description: "Analyzing user type" },
    { id: 2, name: "Rewrite", description: "AI rewrites your question" },
    { id: 3, name: "Smart Query", description: "Generating strategic searches" },
    { id: 4, name: "Forum Search", description: "Searching community discussions" },
    { id: 5, name: "Summarize", description: "AI summarizes findings" },
    { id: 6, name: "Marketplace", description: "Searching online stores" },
    { id: 7, name: "Final Ranking", description: "AI ranks all products" },
    { id: 8, name: "Conclusion", description: "AI writes a conclusion" },
    { id: 9, name: "Complete", description: "Results ready!" }
  ];

  return (
    <>
      <style>{`
        .clickable-card {
          text-decoration: none;
          color: inherit;
          display: block;
          transition: all 0.3s ease;
        }
        .clickable-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 20px rgba(0,0,0,0.15);
        }
      `}</style>
      <div className="d-flex" style={{ height: "100vh", overflow: "hidden", backgroundColor: "#f8f9fa" }}>
        {/* Main Content Area */}
        <div className="flex-grow-1 p-4" style={{ overflowY: "auto" }}>
          <div className="mb-4">
            <h1 className="h2 mb-3" style={{ color: "#232f3e", fontWeight: "600" }}>
              ZooGent Product Assistant
            </h1>
            <p className="text-muted">
              Get personalized product recommendations powered by AI and community insights
            </p>
          </div>

          {/* Pipeline Visualization */}
          <div className="card mb-4" style={{ border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
            <div className="card-body">
              <h5 className="card-title mb-3" style={{ color: "#232f3e" }}>AI Processing Pipeline</h5>
              <div className="d-flex flex-wrap justify-content-between">
                {pipelineSteps.map((step, index) => (
                  <div key={step.id} className="text-center mb-3" style={{ width: "10%" }}>
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2"
                      style={{
                        width: "50px",
                        height: "50px",
                        backgroundColor: currentStep >= step.id ? "#ff9900" : "#e7e7e7",
                        color: currentStep >= step.id ? "white" : "#666",
                        fontWeight: "bold",
                        fontSize: "14px",
                        transition: "all 0.3s ease"
                      }}
                    >
                      {step.id}
                    </div>
                    <div style={{ fontSize: "12px", color: "#232f3e", fontWeight: "500" }}>
                      {step.name}
                    </div>
                    <div style={{ fontSize: "10px", color: "#666" }}>
                      {step.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Forum Results Display */}
          {messages.length > 0 && messages[messages.length - 1].role === "bot" && messages[messages.length - 1].results && messages[messages.length - 1].results.forumResults.length > 0 && (
            <div className="card mb-4" style={{ border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
              <div className="card-body">
                <h5 className="card-title mb-3" style={{ color: "#232f3e" }}>Community Discussions</h5>
                <div className="row">
                  {messages[messages.length - 1].results.forumResults.map((item, index) => (
                    <div key={index} className="col-md-6 mb-3">
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className="clickable-card">
                        <div className="card h-100" style={{ border: "1px solid #e7e7e7" }}>
                          <div className="card-body p-3">
                            <h6 className="card-title" style={{ fontSize: "14px", color: "#232f3e" }}>
                              {item.title}
                            </h6>
                            <p className="card-text text-muted" style={{ fontSize: "12px" }}>
                              {item.domain}
                            </p>
                            <div className="d-flex justify-content-between align-items-center">
                              <small className="text-muted">{item.domain}</small>
                            </div>
                          </div>
                        </div>
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Product Results Display */}
          {messages.length > 0 && messages[messages.length - 1].role === "bot" && messages[messages.length - 1].results && (
            <div className="card" style={{ border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
              <div className="card-body">
                <h5 className="card-title mb-3" style={{ color: "#232f3e" }}>Recommended Products</h5>
                <div className="row">
                  {messages[messages.length - 1].results.marketplaceResults.map((product, index) => (
                    <div key={index} className="col-md-4 mb-3">
                      <a href={product.link} target="_blank" rel="noopener noreferrer" className="clickable-card">
                        <div className="card h-100" style={{ border: "1px solid #e7e7e7" }}>
                          <div className="card-body p-3">
                            {product.image && (
                              <div className="mb-2">
                                <img 
                                  src={product.image} 
                                  alt={product.title}
                                  className="img-fluid rounded"
                                  style={{ 
                                    maxHeight: "120px", 
                                    width: "100%", 
                                    objectFit: "cover" 
                                  }}
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                              </div>
                            )}
                            <h6 className="card-title" style={{ fontSize: "14px", color: "#232f3e" }}>
                              {product.title}
                            </h6>
                            <p className="card-text text-muted" style={{ fontSize: "12px" }}>
                              {product.snippet}
                            </p>
                            <div className="d-flex justify-content-between align-items-center">
                              <small className="text-muted">{product.domain}</small>
                            </div>
                          </div>
                        </div>
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar - Chatbox */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          flex: '0 0 30%', 
          height: '100vh', 
          backgroundColor: 'white', 
          borderLeft: '1px solid #e7e7e7' 
        }}>
          <div className="p-3 border-bottom" style={{ backgroundColor: "#232f3e" }}>
            <h5 className="mb-0 text-white">Chat Assistant</h5>
          </div>
          
          <div 
            className="p-3"
            style={{ 
              flex: '1 1 auto',
              minHeight: 0,
              overflowY: "auto",
              backgroundColor: "#f8f9fa"
            }}
          >
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`d-flex mb-3 ${m.role === "user" ? "justify-content-end" : "justify-content-start"}`}
              >
                {m.role === "bot" && (
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center me-2"
                    style={{
                      width: 32,
                      height: 32,
                      background: "#ff9900",
                      color: "white",
                      fontWeight: "bold",
                      fontSize: "12px"
                    }}
                  >
                    AI
                  </div>
                )}

                <div
                  className={`p-2 rounded`}
                  style={{ 
                    maxWidth: "80%",
                    whiteSpace: "pre-wrap",
                    background: m.role === "user" ? "#ff9900" : "white",
                    color: m.role === "user" ? "white" : "#232f3e",
                    border: m.role === "bot" ? "1px solid #e7e7e7" : "none",
                    fontSize: "14px"
                  }}
                >
                  {m.text}
                </div>

                {m.role === "user" && (
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center ms-2"
                    style={{
                      width: 32,
                      height: 32,
                      background: "#232f3e",
                      color: "white",
                      fontWeight: "bold",
                      fontSize: "12px"
                    }}
                  >
                    You
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-3 border-top">
            <form onSubmit={handleSend} className="d-flex">
              <input
                className="form-control me-2"
                placeholder="Ask about products..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                style={{ 
                  border: "1px solid #e7e7e7",
                  borderRadius: "4px",
                  fontSize: "14px"
                }}
              />
              <button 
                type="submit" 
                className="btn"
                disabled={loading}
                style={{ 
                  backgroundColor: "#ff9900",
                  border: "none",
                  color: "white",
                  fontWeight: "500",
                  padding: "8px 16px"
                }}
              >
                {loading ? "..." : "Send"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}