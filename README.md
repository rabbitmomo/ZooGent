# ZooGent 🦓

ZooGent is an intelligent product search assistant designed to help users find the perfect product by understanding natural language queries. It uses a sophisticated pipeline of AI agents to refine search queries, scour community forums and marketplaces, and present users with summarized, relevant, and personalized recommendations.

## How to Run

To get ZooGent running locally, you'll need to run both the frontend and backend services.

**Prerequisites:**
*   [Node.js](https://nodejs.org/) (v18 or later recommended)
*   [pnpm](https://pnpm.io/installation) (recommended package manager) or npm
*   AWS Credentials configured for Bedrock access
*   Google Custom Search API Key and Search Engine ID

### 1. Environment Setup

Create a `.env` file in the `backend` directory with the following variables. These are required for the backend server to connect to the necessary APIs.

```env
# backend/.env

# Google Custom Search API
VITE_GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
VITE_GOOGLE_CX="YOUR_GOOGLE_SEARCH_ENGINE_ID"

# AWS Credentials for Bedrock
# Ensure your environment is configured with AWS credentials
# e.g., via ~/.aws/credentials or by setting the following:
AWS_BEARER_TOKEN_BEDROCK="YOUR_AWS_BEARER_TOKEN_BEDROCK"

```

### 2. Running the Application

Open two terminal windows.

**In Terminal 1 (Frontend):**
```bash
# Navigate to the project root
cd path/to/ZooGent

# Install frontend dependencies
npm install

# Run the frontend development server
npm run dev
```
The frontend will be available at `http://localhost:5173` (or another port if 5173 is busy).

**In Terminal 2 (Backend):**
```bash
# Navigate to the backend directory
cd path/to/ZooGent/backend

# Install backend dependencies
pnpm install

# Run the backend server
node server.js
```
The backend server will start on `http://localhost:5000`. The frontend is configured to proxy requests to this endpoint.
Change the BASE_URL from the pages/HomePage.jsx to the `http://localhost:5000` and now you could made the RESTFUL API request locally.

## Core Features

*   **Conversational AI Chat:** An intuitive chat interface for users to describe what they're looking for.
*   **Multi-Agent AI Pipeline:** Utilizes a series of specialized AI agents for:
    *   **Query Rewriting:** Optimizes user input for better search results.
    *   **Forum & Marketplace Search:** Scans trusted sources like Shopee, Lazada, Reddit, and Lowyat for discussions and listings.
    *   **Content Summarization:** Summarizes key findings from community discussions.
    *   **Product Recommendation & Ranking:** Generates and ranks a list of relevant products.
*   **Dynamic Results Display:** Presents community discussions and product listings in a clean, card-based UI.
*   **Real-time Progress Visualization:** Shows the user which stage of the AI pipeline is currently active.

## Technology Stack

*   **Frontend:**
    *   **Framework:** React 19
    *   **Build Tool:** Vite
    *   **Styling:** Bootstrap 5
    *   **Routing:** React Router
*   **Backend:**
    *   **Framework:** Express.js
    *   **Language:** Node.js
*   **AI & Cloud Services:**
    *   **AI Models:** AWS Bedrock (Claude 3 Sonnet, Titan)
    *   **Web Search:** Google Custom Search API

## Project Structure

```
/
├── backend/         # Node.js Express backend server
│   ├── server.js    # Main API logic and Bedrock agent definitions
│   └── package.json # Backend dependencies
│
├── public/          # Static assets (logos, etc.)
│
├── src/             # React frontend source code
│   ├── components/  # Reusable React components
│   ├── pages/       # Main page components (HomePage)
│   ├── styles/      # CSS files
│   ├── App.jsx      # Root component with routing setup
│   └── main.jsx     # Application entry point
│
├── package.json     # Frontend dependencies and scripts
└── README.md        # You are here!
```