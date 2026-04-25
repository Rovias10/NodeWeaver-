# Arquitectura StudyWeaver

> Diagramas, esquema de BD y flujos críticos.

---

## 1. Visión general

```
┌──────────────────────────────┐         ┌─────────────────────────────────┐
│       FRONTEND (React)       │         │       BACKEND (PHP MVC)         │
│                              │         │                                 │
│  React Router                │         │  /backend/public/index.php      │
│  ├─ AuthContext              │  HTTPS  │     ↓                           │
│  ├─ ProtectedRoute           │  +JWT   │  /backend/API/index.php (boot)  │
│  └─ Pages/Features           │ ◄─────► │     ↓                           │
│       └─ api/client.js       │  JSON   │  Router::dispatch               │
│           └─ fetch(...)      │         │     ↓                           │
│                              │         │  AuthMiddleware::verifyToken    │
│  Drawflow (envuelto)         │         │     ↓                           │
│                              │         │  Controller (validate + logic)  │
│                              │         │     ↓                           │
│                              │         │  Model (PDO prepared)           │
└──────────────────────────────┘         │     ↓                           │
                                          │  MySQL (studyweaver)            │
                                          │                                 │
                                          │  Servicios externos:            │
                                          │  - OpenAI/Gemini (IA)           │
                                          │  - SendGrid (emails)            │
                                          └─────────────────────────────────┘
```

---

## 2. Esquema de base de datos

```sql
-- Usuarios (reutilizado de develop, ligeros ajustes)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(255) DEFAULT NULL,
    bio TEXT DEFAULT NULL,
    confirmed TINYINT(1) DEFAULT 0,
    confirm_token VARCHAR(64) DEFAULT NULL,
    reset_token VARCHAR(64) DEFAULT NULL,
    reset_expires DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email)
) ENGINE=InnoDB CHARSET=utf8mb4;

-- Mapas conceptuales
CREATE TABLE maps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    is_public TINYINT(1) DEFAULT 0,
    template VARCHAR(50) DEFAULT 'blank',     -- blank | study | brainstorm | etc.
    drawflow_json LONGTEXT,                    -- export() de Drawflow
    summary_cache TEXT DEFAULT NULL,           -- caché del último summarize IA
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_public (is_public, updated_at)
) ENGINE=InnoDB CHARSET=utf8mb4;

-- Nodos individuales (denormalización de drawflow_json para queries rápidas)
CREATE TABLE nodes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    map_id INT NOT NULL,
    drawflow_id INT NOT NULL,                  -- id que asigna Drawflow internamente
    title VARCHAR(200) NOT NULL,
    description TEXT,
    node_type VARCHAR(50) DEFAULT 'concept',   -- concept | example | warning | resource
    position_x INT NOT NULL,
    position_y INT NOT NULL,
    metadata JSON DEFAULT NULL,                -- campos custom según node_type
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
    INDEX idx_map (map_id)
) ENGINE=InnoDB CHARSET=utf8mb4;

-- Conexiones entre nodos
CREATE TABLE edges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    map_id INT NOT NULL,
    source_node_id INT NOT NULL,
    target_node_id INT NOT NULL,
    label VARCHAR(100) DEFAULT NULL,
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
    INDEX idx_map (map_id)
) ENGINE=InnoDB CHARSET=utf8mb4;

-- Likes
CREATE TABLE likes (
    user_id INT NOT NULL,
    map_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, map_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
) ENGINE=InnoDB CHARSET=utf8mb4;

-- Comentarios
CREATE TABLE comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    map_id INT NOT NULL,
    user_id INT NOT NULL,
    body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_map (map_id, created_at)
) ENGINE=InnoDB CHARSET=utf8mb4;

-- Flashcards generadas a partir de un mapa
CREATE TABLE flashcards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    map_id INT NOT NULL,
    user_id INT NOT NULL,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    next_review DATE DEFAULT NULL,
    box INT DEFAULT 1,                          -- caja Leitner: 1..5
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_review (user_id, next_review)
) ENGINE=InnoDB CHARSET=utf8mb4;

-- Quizzes generados (caché)
CREATE TABLE quizzes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    map_id INT NOT NULL,
    user_id INT NOT NULL,
    questions_json LONGTEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB CHARSET=utf8mb4;

-- Resultados de quizzes
CREATE TABLE quiz_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quiz_id INT NOT NULL,
    user_id INT NOT NULL,
    score TINYINT NOT NULL,                     -- 0..100
    answers_json LONGTEXT NOT NULL,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB CHARSET=utf8mb4;
```

> **Nota sobre denormalización:** `maps.drawflow_json` guarda el JSON completo exportado por Drawflow, **y** `nodes`/`edges` denormalizan las entidades para queries rápidas (estadísticas, búsqueda). Decisión consciente — explicar en ADR-05 cuando se implemente.

---

## 3. Flujo "guardar mapa" (auto-save cada 30s)

```
React MapView                          Backend
─────────────                          ────────
useEffect debounce
  └─ on graph change
        │
        ▼
client.post('/api/maps/:id/save-flow', { drawflow_json })
        │
        ▼
                                        MapController::saveFlow($mapId)
                                            │
                                            ├─ verifyToken (middleware)
                                            ├─ validar ownership ($map->user_id === $authUser->id)
                                            ├─ BEGIN TRANSACTION
                                            ├─ Map::updateJson($mapId, $json)
                                            ├─ Node::deleteByMapId($mapId)
                                            ├─ Edge::deleteByMapId($mapId)
                                            ├─ foreach($parsedNodes) Node::create(...)
                                            ├─ foreach($parsedEdges) Edge::create(...)
                                            ├─ COMMIT
                                            ▼
        ◄───────────── { success: true, savedAt: "..." }
setLastSaved(new Date())
toast.success("Guardado")
```

---

## 4. Flujo "expandir nodo con IA"

```
React Node "Plus" button click
        │
        ▼
client.post('/api/ai/expand', { topic, context, mapId, nodeId })
        │
        ▼
                                        AIController::expand
                                            │
                                            ├─ verifyToken
                                            ├─ validar input (topic no vacío, longitud)
                                            ├─ AIClient::call(prompt)
                                            │     │
                                            │     ▼
                                            │   OpenAI/Gemini HTTP API
                                            │     │
                                            │     ▼
                                            │   { branches: [{title, description}] }
                                            ▼
        ◄───────────── { success: true, branches: [...] }

editor.addNode() x N para cada rama
editor.addConnection() x N
client.post('/api/maps/:id/save-flow') (auto-save dispara)
```

---

## 5. Flujo "import PDF → mapa generado"

```
User selecciona PDF
        │
        ▼
client.postFormData('/api/ai/parse-pdf', formData)
        │
        ▼
                                        AIController::parsePdf
                                            │
                                            ├─ verifyToken
                                            ├─ validar archivo (mime, tamaño max)
                                            ├─ PDFParser::extractText($file) → texto plano
                                            ├─ chunkear texto en bloques de N tokens
                                            ├─ AIClient::call(prompt estructurado)
                                            │     "extrae los conceptos clave y sus relaciones
                                            │      en este texto, devuelve JSON con nodes y edges"
                                            ▼
                                          { map: { title, nodes, edges } }
                                            │
                                            ├─ Map::create(...)
                                            ├─ foreach nodes Node::create(...)
                                            ├─ foreach edges Edge::create(...)
                                            ▼
        ◄───────────── { success: true, mapId, redirect: "/map/:id" }

navigate('/map/:id')
```

---

## 6. Estructura de carpetas final (objetivo día 1)

```
NodeWeaver-/
├── CLAUDE.md
├── Gemini.md
├── README.md
├── .gitignore
├── docs/
│   ├── ROADMAP.md
│   ├── arquitectura.md
│   ├── criterios-daw.md
│   └── decisiones.md
├── backend/
│   ├── composer.json
│   ├── public/
│   │   ├── index.php          # entry Apache
│   │   └── .htaccess
│   ├── API/
│   │   ├── index.php           # bootstrap MVC
│   │   ├── router/
│   │   │   ├── api.php
│   │   │   └── Router.php
│   │   ├── controllers/
│   │   │   ├── authController.php
│   │   │   ├── profileController.php
│   │   │   ├── mapController.php
│   │   │   ├── aiController.php
│   │   │   ├── feedController.php
│   │   │   ├── likeController.php
│   │   │   ├── commentController.php
│   │   │   ├── flashcardController.php
│   │   │   └── quizController.php
│   │   ├── middleware/
│   │   │   └── verify-token.php
│   │   └── services/
│   │       ├── AIClient.php
│   │       └── PDFParser.php
│   ├── DATA/
│   │   ├── env.php
│   │   ├── database.php
│   │   ├── jwt.php
│   │   ├── cors.php
│   │   └── sendgrid.php
│   ├── MODEL/
│   │   ├── User.php
│   │   ├── Map.php
│   │   ├── Node.php
│   │   ├── Edge.php
│   │   ├── Like.php
│   │   ├── Comment.php
│   │   ├── Flashcard.php
│   │   └── Quiz.php
│   └── migrations/
│       ├── 001_create_users.sql
│       ├── 002_create_maps.sql
│       └── ...
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    ├── public/
    │   └── assets/
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api/
        │   ├── client.js
        │   └── endpoints.js
        ├── auth/
        │   ├── AuthContext.jsx
        │   ├── ProtectedRoute.jsx
        │   └── useAuth.js
        ├── components/
        │   ├── Button.jsx
        │   ├── Input.jsx
        │   ├── Card.jsx
        │   ├── Modal.jsx
        │   └── NavBar.jsx
        ├── features/
        │   ├── maps/
        │   │   ├── DrawflowEditor.jsx
        │   │   ├── MapView.jsx
        │   │   ├── NodeEditor.jsx
        │   │   └── useMapSave.js
        │   ├── ai/
        │   │   ├── ExpandButton.jsx
        │   │   ├── SummaryModal.jsx
        │   │   └── PdfImport.jsx
        │   ├── flashcards/
        │   │   └── FlashcardReview.jsx
        │   ├── quizzes/
        │   │   └── QuizPlay.jsx
        │   └── social/
        │       ├── LikeButton.jsx
        │       ├── CommentSection.jsx
        │       └── PublicMapCard.jsx
        ├── pages/
        │   ├── Landing.jsx
        │   ├── Login.jsx
        │   ├── Register.jsx
        │   ├── ConfirmAccount.jsx
        │   ├── ForgotPassword.jsx
        │   ├── ResetPassword.jsx
        │   ├── Dashboard.jsx
        │   ├── MapPage.jsx
        │   ├── Feed.jsx
        │   ├── PublicProfile.jsx
        │   └── Statistics.jsx
        └── styles/
            └── tailwind.css
```
