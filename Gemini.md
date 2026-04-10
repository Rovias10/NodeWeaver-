# NodeWeaver - Global AI Context & Architecture Guide

> [!IMPORTANT]  
> **TO ALL AI AGENTS (Gemini / Antigravity / Cursor / etc):** 
> Read this document immediately upon opening this project. Ignorance of this architecture will result in breaking the application.

## 🧠 1. Architectural Philosophy (Hybrid Classic MVC)

**NodeWeaver** strictly follows a **Classic MVC (Model-View-Controller)** pattern mixed with an **API-driven Frontend**. 
It handles both JSON responses (for Auth logic) and Server-Side Rendered (SSR) HTML snippets (for dynamic data tables or components).

### The "Fetch & Inject" Paradigm
Unlike React/Vite SPAs, this project does **NOT** use frontend frameworks. 
The flow for dynamic components is:
1. `public/pages/` (JavaScript) makes an AJAX `fetch()` call to the Backend Router.
2. The `router` delegates to the `controller`.
3. The `controller` fetches data via the `model`.
4. The `controller` injects that data into a `view` (`.php` file).
5. The backend returns a raw **HTML String**.
6. The frontend JavaScript injects the response directly into the DOM using `.innerHTML`.

---

## 📂 2. Directory Modularity & Concept Mapping

The structure is highly modular based on the Single Responsibility Principle. Even though Routing and Controllers are conceptually both "API middleware", they are modularized separately because they differ in technical execution.

| NodeWeaver Directory | Classic MVC Concept | Core Responsibility |
| :--- | :--- | :--- |
| `backend/config/` | **DATA** | Global settings, Auth keys, and the standard PDO Database Connection configuration. |
| `backend/models/` | **MODEL** | Pure Database interaction tier. Executes prepared SQL statements via PDO. *No business logic goes here.* |
| `backend/router/` | **API (Routing)** | `api.php` maps endpoints (e.g. `/api?route=x`). The `Router.php` class parses the URL and dispatches the payload to the correct Controller. |
| `backend/controllers/` | **API (Logic)** | The core business logic. Validates inputs, calls models, and decides whether to return `json_encode()` or `include '../views/x.php'`. |
| `backend/views/` | **VIEW** | PHP files that generate HTML chunks conditionally. Uses `foreach` loops to print dynamic HTML tables, cards, etc. |
| `public/` | **SERVER (Frontend)**| Contains static assets, CSS, and JS files. Acts as the UI entry point. |

---

## ⚡ 3. Strict Rules for AI Agents

To optimize token usage and avoid catastrophic code breaks, adhere to the following when writing code for NodeWeaver:

### A. Routing & Endpoints
- **NEVER** add `switch()` routing logic inside `backend/public/index.php`. `index.php` is strictly a Bootstrap entry point.
- All new routes MUST be registered in `backend/router/api.php` using the clean `$router->get()` or `$router->post()` methods.

### B. Controller Behavior
- A Controller can return JSON (`authController.php` JWT flow) OR it can return HTML representations (e.g., retrieving a table of packages).
- When returning HTML, the Controller must retrieve the data from the Model, store it in a variable (e.g., `$data`), and `require_once __DIR__ . '/../views/your_view.php';`.

### C. Frontend Code
- **NO FRAMEWORKS:** Do not hallucinate React, Vue, Tailwind, or complex Webpack/Vite setups. 
- Use Vanilla JavaScript (`fetch`) and Vanilla CSS.
- **Authentication:** Standard JWT token placed in the Authorization header via Javascript.

### D. Token Optimization Protocol
- Use native API tools (like `view_file` or `multi_replace_file_content`) to target specific lines. 
- **DO NOT** rewrite entire 200-line controller files if you are only fixing a syntax error on line 42.

> *"My directive is to build NodeWeaver using Native PHP MVC, preserving extreme folder modularity, and answering strictly using these architectural boundaries."*
