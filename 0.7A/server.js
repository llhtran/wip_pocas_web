const http = require('http');
const path = require('path');
const fs = require('fs');

const { rollAxes } = require('./src/axes');
const { PromptLoader, renderTemplate } = require('./src/promptLoader');
const LMClient = require('./src/lmClient');
const assessMotivationLevel = require('./src/motivation');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 4000);
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const MEDIA_DIR = path.join(ROOT_DIR, 'media');
const FONTS_DIR = path.join(ROOT_DIR, 'fonts');
const PROMPT_DIR = path.join(ROOT_DIR, 'prompts');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const CURRENT_DIR = path.join(DATA_DIR, 'current');
const ARCHIVE_DIR = path.join(DATA_DIR, 'archive');
const WORLD_HISTORY_FILE = path.join(CURRENT_DIR, 'current-world-history.jsonl');
const PARTICIPANT_HISTORY_FILE = path.join(CURRENT_DIR, 'participants-history.jsonl');
const MAX_SCENARIO_CHARS = Number(process.env.MAX_SCENARIO_CHARS || 800);

const loader = new PromptLoader(PROMPT_DIR);
const lmClient = new LMClient();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4'
};

function countChars(text = '') {
  return text.trim().length;
}

function mergeUsage(primary, secondary) {
  if (!primary) return secondary || null;
  if (!secondary) return primary;
  return {
    prompt_tokens: (primary.prompt_tokens || 0) + (secondary.prompt_tokens || 0),
    completion_tokens: (primary.completion_tokens || 0) + (secondary.completion_tokens || 0),
    total_tokens: (primary.total_tokens || 0) + (secondary.total_tokens || 0)
  };
}

function createEntryId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6)
    .toString(36)
    .padStart(4, '0')}`;
}

async function appendJSONLine(filePath, entry) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
}

async function recordWorldHistory(entry) {
  await appendJSONLine(WORLD_HISTORY_FILE, entry);
}

async function recordParticipantHistory(entry) {
  await appendJSONLine(PARTICIPANT_HISTORY_FILE, entry);
}

async function archiveCurrentGame() {
  try {
    const files = await fs.promises.readdir(CURRENT_DIR);
    if (!files.length) {
      return;
    }
    await fs.promises.mkdir(ARCHIVE_DIR, { recursive: true });
    const archiveId = createEntryId('game');
    const targetDir = path.join(ARCHIVE_DIR, archiveId);
    await fs.promises.mkdir(targetDir, { recursive: true });

    await Promise.all(
      files.map(async (file) => {
        const from = path.join(CURRENT_DIR, file);
        const to = path.join(targetDir, file);
        try {
          await fs.promises.rename(from, to);
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error;
          }
        }
      })
    );
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to archive current game', error);
    }
  }
}

async function summarizeWithPrompt(text, maxChars, prompt, usageSeed = null) {
  const response = await lmClient.generate(prompt);
  const condensed = response.draft?.trim() || '';
  return {
    draft: condensed || text,
    usage: mergeUsage(usageSeed, response.usage)
  };
}

async function summarizeToFit(draft, maxChars = MAX_SCENARIO_CHARS, maxAttempts = 3) {
  let current = draft.trim();
  let totalUsage = null;

  const basePrompt = {
    system: 'You are a concise editor. Keep the meaning, tone, and significant details intact.',
    user: [
      `Summarize the scenario below so it is under ${maxChars} characters.`,
      'Do not invent new facts, and preserve titles and paragraph breaks.',
      'Scenario draft:',
      '"""',
      current,
      '"""'
    ].join('\n')
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await summarizeWithPrompt(current, maxChars, basePrompt, totalUsage);
    totalUsage = result.usage;
    current = result.draft;
    if (countChars(current) <= maxChars) {
      return { draft: current, usage: totalUsage };
    }
    basePrompt.user = basePrompt.user.replace(/Scenario draft:[\s\S]*$/, [
      'Scenario draft:',
      '"""',
      current,
      '"""'
    ].join('\n'));
  }

  const secondaryPrompt = {
    system:
      'You are a ruthless condenser. Take the summary provided and compress it further without losing meaning.',
    user: [
      `The following summary is still above ${maxChars} characters.`,
      'Summarize the summary itself so it falls under the limit.',
      'Summary:',
      '"""',
      current,
      '"""'
    ].join('\n')
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await summarizeWithPrompt(current, maxChars, secondaryPrompt, totalUsage);
    totalUsage = result.usage;
    current = result.draft;
    if (countChars(current) <= maxChars) {
      return { draft: current, usage: totalUsage };
    }
    secondaryPrompt.user = secondaryPrompt.user.replace(/Summary:[\s\S]*$/, [
      'Summary:',
      '"""',
      current,
      '"""'
    ].join('\n'));
  }

  throw new Error('Summary exceeded character limit after multiple attempts.');
}

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function sendJSON(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

const difficultyAliases = {
  gentle: 'easy',
  demanding: 'moderate',
  harsh: 'difficult'
};

function sanitizeDifficulty(input) {
  if (typeof input !== 'string') {
    return 'moderate';
  }
  const normalized = input.trim().toLowerCase();
  const canonical = difficultyAliases[normalized] || normalized;
  if (['easy', 'moderate', 'difficult'].includes(canonical)) {
    return canonical;
  }
  return 'moderate';
}

async function generateSettingPayload(difficultyKey) {
  const { axes, difficulty } = rollAxes(difficultyKey);
  const axisData = axes.reduce(
    (acc, axis) => {
      acc[axis.key] = axis.score;
      acc[`${axis.key}Label`] = axis.label;
      return acc;
    },
    {
      difficultyLabel: difficulty.label,
      axesList: axes.map((axis) => `${axis.label}: ${axis.score}`).join(' | ')
    }
  );

  const [systemPrompt, userTemplate] = await Promise.all([
    loader.load('settings/system.md'),
    loader.load('settings/user.md')
  ]);

  const userPrompt = renderTemplate(userTemplate, axisData);
  const lmResponse = await lmClient.generate({
    system: systemPrompt,
    user: userPrompt
  });

  let draft = lmResponse.draft?.trim() || '';
  let extraUsage = null;
  if (countChars(draft) > MAX_SCENARIO_CHARS) {
    const summary = await summarizeToFit(draft, MAX_SCENARIO_CHARS);
    draft = summary.draft;
    extraUsage = summary.usage;
  }

  const usage = mergeUsage(lmResponse.usage, extraUsage);

  return {
    axes,
    difficulty,
    draft,
    model: lmResponse.model,
    usage
  };
}

async function handleSettingRequest(req, res) {
  try {
    const body = await readRequestBody(req);
    let payload = {};
    if (body) {
      try {
        payload = JSON.parse(body);
      } catch (error) {
        return sendJSON(res, 400, { error: 'Invalid JSON payload.' });
      }
    }

    await archiveCurrentGame();

    const difficulty = sanitizeDifficulty(payload.difficulty);
    const setting = await generateSettingPayload(difficulty);

    await recordWorldHistory({
      id: createEntryId('world'),
      timestamp: new Date().toISOString(),
      draft: setting.draft,
      axes: setting.axes,
      difficulty: setting.difficulty
    });

    return sendJSON(res, 200, setting);
  } catch (error) {
    console.error('Failed to generate setting:', error);
    return sendJSON(res, 500, { error: 'Failed to generate setting.' });
  }
}

async function handleParticipantLog(req, res) {
  try {
    const body = await readRequestBody(req);
    let payload = {};
    if (body) {
      try {
        payload = JSON.parse(body);
      } catch (error) {
        return sendJSON(res, 400, { error: 'Invalid JSON payload.' });
      }
    }

    const availability = (payload.availability || '').trim();
    const motivationLevel = await assessMotivationLevel(lmClient, availability, payload.condition || '');

    const entry = {
      id: createEntryId('participant'),
      timestamp: new Date().toISOString(),
      name: (payload.name || '').trim(),
      pronouns: (payload.pronouns || '').trim(),
      condition: (payload.condition || '').trim(),
      capacities: Array.isArray(payload.capacities) ? payload.capacities : [],
      availability,
      motivationLevel,
      intentions: (payload.intentions || '').trim()
    };

    await recordParticipantHistory(entry);
    return sendJSON(res, 201, { entry });
  } catch (error) {
    console.error('Failed to log participant', error);
    return sendJSON(res, 500, { error: 'Failed to log participant.' });
  }
}

function resolveSafePath(baseDir, requestedPath) {
  const normalized = path
    .normalize(requestedPath)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^([/\\])+/, '');
  return path.join(baseDir, normalized);
}

async function serveStatic(res, baseDir, requestedPath) {
  const targetPath = resolveSafePath(baseDir, requestedPath);
  if (!targetPath.startsWith(baseDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  let filePath = targetPath;
  try {
    const stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  if (req.method === 'POST' && pathname === '/api/setting') {
    handleSettingRequest(req, res);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/participants') {
    handleParticipantLog(req, res);
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/media')) {
    const relPath = pathname.replace(/^\/media\/?/, '');
    serveStatic(res, MEDIA_DIR, relPath || '.');
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/fonts')) {
    const relPath = pathname.replace(/^\/fonts\/?/, '');
    serveStatic(res, FONTS_DIR, relPath || '.');
    return;
  }

  if (req.method === 'GET') {
    const relPath = pathname === '/' ? 'index.html' : pathname;
    serveStatic(res, PUBLIC_DIR, relPath);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method Not Allowed');
});

server.listen(PORT, HOST, () => {
  console.log(`POCAS 0.6A prototype available at http://${HOST}:${PORT}`);
});

