import React, { useState } from "react";

export default function HomePage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const BASE_URL = "https://dacp3uiyfj.ap-southeast-1.awsapprunner.com";

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

      // Return the raw results for better display
      return data.results;
    } catch (err) {
      console.error("Forum Search API error:", err);
      return "Error fetching forum results.";
    }
  };

  // Call Bedrock Summarize Agent with forum results
  const callSummarizeAgent = async (forumResults) => {
    try {
      // Format forum results for summarization
      const forumMessage = Array.isArray(forumResults) 
        ? forumResults.map((item) => `• ${item.title} (${item.domain})\n${item.link}`).join("\n\n")
        : forumResults;

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

  const callSmartQueryAgent = async (userRequest, productTopic) => {
    try {
      const res = await fetch(`${BASE_URL}/api/bedrock/smartQueryAgent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userRequest, productTopic }),
      });
      const data = await res.json();
      return data.queries && data.queries.length > 0 ? data.queries : [productTopic];
    } catch (err) {
      console.error("SmartQueryAgent API error:", err);
      return [productTopic]; // Fallback to the basic topic
    }
  };

  // Call Custom Marketplace Search API for Top 10 Distinct Products
  const callMarketplaceSearch = async (queries) => {
    try {
      if (!queries || queries.length === 0) return [];

      let allResults = [];
      // Use Promise.all to run searches in parallel for speed
      await Promise.all(queries.map(async (query) => {
        const res = await fetch(`${BASE_URL}/api/search/marketplace`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          allResults = allResults.concat(data.results);
        }
      }));


      if (allResults.length === 0) {
        return [];
      }

      // Deduplicate results by title
      const uniqueTitles = new Set();
      const distinctResults = allResults.filter(result => {
        const normalizedTitle = result.title.toLowerCase();
        if (!uniqueTitles.has(normalizedTitle)) {
          uniqueTitles.add(normalizedTitle);
          return true;
        }
        return false;
      });
      
      // Return top 20 distinct results
      return distinctResults.slice(0, 20);

    } catch (err) {
      console.error("Marketplace Search API error:", err);
      return []; // Return empty array on error
    }
  };

  const callFinalSummaryAgent = async (userRequest, products) => {
    try {
      const res = await fetch(`${BASE_URL}/api/bedrock/finalSummaryAgent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userRequest, products }),
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

    const userMessage = input;
    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setInput("");
    setLoading(true);
    setCurrentStep(0);

    try {
      // Step 1: Rewrite user message for search
      setCurrentStep(1);
      const rewrittenQuery = await callSearchAgent(userMessage);

      // Step 2: Generate Smart Queries
      setCurrentStep(2);
      const smartQueries = await callSmartQueryAgent(userMessage, rewrittenQuery);

      // Step 3: Search forums with rewritten query
      setCurrentStep(3);
      const forumResults = await callForumSearch(rewrittenQuery);

      // Step 4: Summarize forum results
      setCurrentStep(4);
      const forumSummary = await callSummarizeAgent(forumResults);

      // Step 5: Marketplace search using the smart queries
      setCurrentStep(5);
      const marketplaceProducts = await callMarketplaceSearch(smartQueries);

      // Step 6: Get final summary
      setCurrentStep(6);
      const finalSummary = await callFinalSummaryAgent(userMessage, marketplaceProducts);

      // Step 7: Complete
      setCurrentStep(7);

      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: finalSummary, // Use the dynamic summary
          results: {
            searchQuery: rewrittenQuery,
            forumResults: Array.isArray(forumResults) ? forumResults : [],
            summary: forumSummary,
            marketplaceResults: marketplaceProducts,
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
    { id: 1, name: "Rewrite", description: "AI rewrites your question" },
    { id: 2, name: "Smart Query", description: "Generating strategic searches" },
    { id: 3, name: "Forum Search", description: "Searching community discussions" },
    { id: 4, name: "Summarize", description: "AI summarizes findings" },
    { id: 5, name: "Marketplace", description: "Searching online stores" },
    { id: 6, name: "Conclusion", description: "AI writes a conclusion" },
    { id: 7, name: "Complete", description: "Results ready!" }
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
                    <div key={step.id} className="text-center mb-3" style={{ width: "12%" }}>
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
        <div className="d-flex flex-column" style={{ flex: "0 0 30%", height: "100vh", backgroundColor: "white", borderLeft: "1px solid #e7e7e7" }}>
            <div className="p-3 border-bottom" style={{ backgroundColor: "#232f3e" }}>
              <h5 className="mb-0 text-white">Chat Assistant</h5>
            </div>
            
                      <div 
                        className="flex-grow-1 p-3"
                        style={{ 
                          overflowY: "auto",
                          backgroundColor: "#f8f9fa",
                          minHeight: 0
                        }}
                      >              {messages.map((m, idx) => (
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
    );}
