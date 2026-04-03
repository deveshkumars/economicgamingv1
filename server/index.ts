import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import routes from './routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '8000', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
app.use(routes);

// Serve frontend static files from dist/
const distDir = path.resolve(__dirname, '..', 'dist');
app.use(express.static(distDir));

// SPA fallback - serve index.html for all non-API routes
app.get('/{*path}', (_req, res) => {
  const indexPath = path.join(distDir, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).send('Frontend not built. Run: npm run build');
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n  Economic Warfare OSINT — Server running on http://localhost:${PORT}`);
  console.log(`  API:      http://localhost:${PORT}/api/health`);
  console.log(`  Frontend: http://localhost:${PORT}\n`);
});

export default app;
