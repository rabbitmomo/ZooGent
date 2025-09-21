import React, { useState, useEffect, useRef } from "react";

export default function HomePage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const chatEndRef = useRef(null);

  const BASE_URL = "https://dacp3uiyfj.ap-southeast-1.awsapprunner.com";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const callIntentRouterAgent = async (userMessage) => {
    try {
      const res = await fetch(`${BASE_URL}/api/bedrock/intentRouterAgent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage }),
      });
      const data = await res.json();
      return data.userType || 'B2C';
    } catch (err) {
      console.error("IntentRouterAgent API error:", err);
      return 'B2C';
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

  const callSummarizeAgent = async (rewrittenQuery, userType) => {
    try {
      const res = await fetch(`${BASE_URL}/api/bedrock/summarizeAgent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewrittenQuery, userType }),
      });
      const data = await res.json();
      return (
        data?.result?.output?.message?.content?.[0]?.text ||
        "No forum summary available."
      ).trim();
    } catch (err) {
      console.error("SummarizeAgent API error:", err);
      return "Could not generate forum summary.";
    }
  };

  const callMarketplaceSearch = async (query, userType) => {
    try {
      const res = await fetch(`${BASE_URL}/api/search/marketplace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, userType }),
      });
      const data = await res.json();
      return data.results || [];
    } catch (err) {
      console.error("Marketplace Search API error:", err);
      return [];
    }
  };

  const callMasterAnalysisAgent = async (userMessage, userType, searchResults) => {
    try {
      const res = await fetch(`${BASE_URL}/api/bedrock/masterAnalysisAgent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage, userType, searchResults }),
      });
      const data = await res.json();
      return data;
    } catch (err) {
      console.error("MasterAnalysisAgent API error:", err);
      return null;
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
      const contextualUserMessage = newUserMessage;

      setCurrentStep(1);
      const userType = await callIntentRouterAgent(contextualUserMessage);

      setCurrentStep(2);
      const rewrittenQuery = await callSearchAgent(contextualUserMessage, userType);

      setCurrentStep(3);
      const [forumSummary, marketplaceCandidates] = await Promise.all([
        callSummarizeAgent(rewrittenQuery, userType),
        callMarketplaceSearch(rewrittenQuery, userType)
      ]);

      setCurrentStep(4);
      const analysisResult = await callMasterAnalysisAgent(contextualUserMessage, userType, marketplaceCandidates);

      if (!analysisResult || !analysisResult.ranked_products) {
        throw new Error("Analysis failed to return valid products.");
      }

      setCurrentStep(5);

      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: analysisResult.summary || "Here are the results based on my analysis.",
          results: {
            searchQuery: rewrittenQuery,
            forumSummary: forumSummary,
            marketplaceResults: analysisResult.ranked_products,
          },
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "I encountered an error while processing your request. Please try again." },
      ]);
    } finally {
      setLoading(false);
      setCurrentStep(0);
    }
  };

  const pipelineSteps = [
    { id: 1, name: "Intent", description: "Analyzing user type" },
    { id: 2, name: "Rewrite", description: "Refining your query" },
    { id: 3, name: "Research", description: "Searching forums & stores" },
    { id: 4, name: "Analysis", description: "Filtering & ranking results" },
    { id: 5, name: "Complete", description: "Results ready!" }
  ];

  const Modal = () => (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1050,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '8px',
        maxWidth: '600px',
        width: '100%',
        boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
        lineHeight: '1.6'
      }}>
        <h4 style={{ color: '#232f3e' }}>Ever wanted to buy a product but you weren't sure if it was the best?</h4>
        <p className="text-muted" style={{ marginTop: '1rem' }}>...or the most affordable? Maybe you don't even know the name? You only know what it does and what it looks like. We have all been there. It took me so long to find the product I wanted.</p>
        <p style={{ marginTop: '1rem' }}>With ZooGent you will never have to second guess whether you have the best product that's just right for you or spend time searching for the right keywords. It understands you like a fellow human. Describe your product and it will know the exact thing you actually mean.</p>
        <p style={{ marginTop: '1rem' }}>Want it cheap? ZooGent will get it for you. Want long lasting quality? ZooGent will find it. What if you are a business looking for a fair and reliable supplier? Zoo Gent's got you.</p>
        <p style={{ marginTop: '1rem', fontWeight: 'bold', color: '#232f3e' }}>Meet ZooGent: A pool of generative AI agents that will help you find the right fit.</p>
        <hr />
        <p style={{ fontSize: '0.9rem', color: '#666' }}>We are team Zoo Negara, Problem statement: Website search assistant with AI for instant results for shoppers and we hope you enjoy!</p>
        <p style={{ fontSize: '0.8rem', color: '#666' }}>Team members: Trevor Lim Yong Guan, Kok Ngin Hao, Ling Yu Qian and Yan Yu</p>
        <button onClick={() => setShowModal(false)} className="btn" style={{ backgroundColor: '#ff9900', color: 'white', marginTop: '1.5rem' }}>Back</button>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        .clickable-card, .who-are-we-btn {
          text-decoration: none;
          color: inherit;
          display: block;
          transition: all 0.3s ease;
        }
        .clickable-card:hover, .who-are-we-btn:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 20px rgba(0,0,0,0.15);
        }
      `}</style>
      {showModal && <Modal />}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: '1fr 30%',
        height: '100vh',
        width: '100vw'
      }}>
        {/* Main Content Area */}
        <div className="p-4" style={{ overflowY: "auto", backgroundColor: "#f8f9fa" }}>
          <div className="d-flex align-items-start mb-4">
            <div>
              <h1 className="h2 mb-1" style={{ color: "#232f3e", fontWeight: "600" }}>
                ZooGent Product Assistant
              </h1>
              <p className="text-muted">
                Get personalized product recommendations powered by AI and community insights
              </p>
            </div>
            <button onClick={() => setShowModal(true)} className="btn who-are-we-btn" style={{ marginLeft: '2rem', backgroundColor: 'orange', color: '#232f3e', border: '2px solid #e7e7e7', flexShrink: 0 }}>
              Who are we
            </button>
          </div>

          {/* Pipeline Visualization */}
          <div className="card mb-4" style={{ border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
            <div className="card-body">
              <h5 className="card-title mb-3" style={{ color: "#232f3e" }}>AI Processing Pipeline</h5>
              <div className="d-flex flex-wrap justify-content-between">
                {pipelineSteps.map((step) => (
                  <div key={step.id} className="text-center mb-3" style={{ width: "18%" }}>
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

          {/* Forum Summary Display */}
          {messages.length > 0 && messages[messages.length - 1].role === "bot" && messages[messages.length - 1].results && messages[messages.length - 1].results.forumSummary && (
            <div className="card mb-4" style={{ border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
              <div className="card-body">
                <h5 className="card-title mb-3" style={{ color: "#232f3e" }}>Community Insights</h5>
                <p className="card-text text-muted" style={{ fontSize: '0.9rem' }}>{messages[messages.length - 1].results.forumSummary}</p>
              </div>
            </div>
          )}

          {/* Product Results Display */}
          {messages.length > 0 && messages[messages.length - 1].role === "bot" && messages[messages.length - 1].results && messages[messages.length - 1].results.marketplaceResults && (
            <div className="card" style={{ border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
              <div className="card-body">
                <h5 className="card-title mb-3" style={{ color: "#232f3e" }}>Recommended Products / Suppliers</h5>
                <div className="row">
                  {messages[messages.length - 1].results.marketplaceResults.map((product, index) => (
                    <div key={index} className="col-md-4 mb-3">
                      <a href={product.link} target="_blank" rel="noopener noreferrer" className="clickable-card">
                        <div className="card h-100" style={{ border: "1px solid #e7e7e7" }}>
                          <div className="card-body p-3 d-flex flex-column">
                            {product.image && (
                              <div className="mb-2 text-center">
                                <img 
                                  src={product.image} 
                                  alt={product.title}
                                  className="img-fluid rounded"
                                  style={{ 
                                    maxHeight: "120px", 
                                    width: "auto",
                                    objectFit: "contain" 
                                  }}
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                              </div>
                            )}
                            <h6 className="card-title mt-auto" style={{ fontSize: "14px", color: "#232f3e" }}>
                              {product.title}
                            </h6>
                            <p className="card-text text-muted" style={{ fontSize: "12px", flexGrow: 1 }}>
                              {product.snippet}
                            </p>
                            <div className="d-flex justify-content-between align-items-center mt-2">
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
                      fontSize: "12px",
                      flexShrink: 0
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
                      fontSize: "12px",
                      flexShrink: 0
                    }}
                  >
                    You
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
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
