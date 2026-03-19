const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Répertoire des agents sub-agents Claude Code
const AGENTS_DIR = path.resolve(__dirname, '../../../.claude/agents');

// Parse le frontmatter YAML d'un fichier .md
// Retourne { meta, body } — meta contient name, description, tools, model
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      meta[key.trim()] = rest.join(':').trim();
    }
  }
  return { meta, body: match[2] };
}

// Liste tous les agents disponibles (lecture seule du répertoire)
router.get('/', (req, res) => {
  if (!fs.existsSync(AGENTS_DIR)) {
    return res.json([]);
  }

  try {
    const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));
    const agents = files.map((file) => {
      const id = file.replace('.md', '');
      const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf-8');
      const { meta } = parseFrontmatter(content);
      return {
        id,
        name: meta.name || id,
        description: meta.description || '',
        tools: meta.tools ? meta.tools.split(',').map((t) => t.trim()) : [],
        model: meta.model || 'sonnet',
        file,
      };
    });
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Détail complet d'un agent (avec le contenu du prompt)
router.get('/:id', (req, res) => {
  const file = path.join(AGENTS_DIR, `${req.params.id}.md`);
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: 'Agent introuvable' });
  }

  try {
    const content = fs.readFileSync(file, 'utf-8');
    const { meta, body } = parseFrontmatter(content);
    res.json({
      id: req.params.id,
      name: meta.name || req.params.id,
      description: meta.description || '',
      tools: meta.tools ? meta.tools.split(',').map((t) => t.trim()) : [],
      model: meta.model || 'sonnet',
      prompt: body.trim(),
      raw: content,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
