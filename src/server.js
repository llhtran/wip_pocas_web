const http = require('http');
const path = require('path');
const fs = require('fs');

const { rollAxes } = require('./axes');
const { PromptLoader, renderTemplate } = require('./promptLoader');
const LMClient = require('./lmClient');

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const PROMPT_DIR = path.resolve(__dirname, '../prompts');
const DATA_DIR = path.resolve(__dirname, '../data');
const HISTORY_FILE = path.join(DATA_DIR, 'world-history.jsonl');
const PARTICIPANT_HISTORY_FILE = path.join(DATA_DIR, 'participants-history.jsonl');
const PROTOCOLITOS_FILE = path.join(DATA_DIR, 'protocolitos.json');
const GAME_STATE_FILE = path.join(DATA_DIR, 'game-state.json');
const MAX_SCENARIO_CHARS = Number(process.env.MAX_SCENARIO_CHARS || 1400);

const TIMELINE = [
  { id: 'phase1', label: 'Phase 1', duration: '1 month' },
  { id: 'phase2', label: 'Phase 2', duration: '5 months' },
  { id: 'phase3', label: 'Phase 3', duration: '1.5 years' },
  { id: 'phase4', label: 'Phase 4', duration: '3 years' },
  { id: 'phase5', label: 'Phase 5', duration: '5 years' }
];
const TIMELINE_SUMMARY = TIMELINE.map((phase) => `${phase.label} (${phase.duration})`).join(' → ');

const loader = new PromptLoader(PROMPT_DIR);
const lmClient = new LMClient();

function loadJSON(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

let gameState = loadJSON(GAME_STATE_FILE, {
  phaseIndex: 0,
  lastEvaluation: null
});

if (typeof gameState !== 'object' || gameState === null) {
  gameState = { phaseIndex: 0, lastEvaluation: null };
}

if (typeof gameState.phaseIndex !== 'number') {
  gameState.phaseIndex = 0;
}

if (!Object.prototype.hasOwnProperty.call(gameState, 'lastEvaluation')) {
  gameState.lastEvaluation = null;
}

function saveGameState() {
  saveJSON(GAME_STATE_FILE, gameState);
}

function loadProtocolitos() {
  return loadJSON(PROTOCOLITOS_FILE, []);
}

function saveProtocolitos(list) {
  saveJSON(PROTOCOLITOS_FILE, list);
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

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

function sanitizeField(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function stripCodeFences(text) {
  return text.replace(/```(?:json)?/gi, '').replace(/```/g, '');
}

function cleanModelText(raw = '') {
  return stripCodeFences(raw).replace(/\u201c|\u201d/g, '"').replace(/\u2018|\u2019/g, "'").trim();
}

function createEntryId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6)
    .toString(36)
    .padStart(4, '0')}`;
}

async function appendJSONLine(filePath, entry) {
  try {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    const payload = JSON.stringify(entry);
    await fs.promises.appendFile(filePath, `${payload}\n`, 'utf8');
  } catch (error) {
    console.error(`Failed to append entry to ${filePath}`, error);
  }
}

async function readJSONLines(filePath) {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    return data
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (err) {
          console.warn(`Failed to parse line in ${filePath}`, err);
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function clearParticipantsHistory() {
  await fs.promises.writeFile(PARTICIPANT_HISTORY_FILE, '', 'utf8');
}

async function clearWorldHistory() {
  await fs.promises.writeFile(HISTORY_FILE, '', 'utf8');
}

async function resetProtocolitosFile() {
  await fs.promises.writeFile(PROTOCOLITOS_FILE, JSON.stringify([], null, 2), 'utf8');
}

async function resetGameData() {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await Promise.all([clearWorldHistory(), clearParticipantsHistory(), resetProtocolitosFile()]);
  gameState = { phaseIndex: 0, lastEvaluation: null };
  saveGameState();
}

function extractSection(text, heading) {
  const pattern = new RegExp(`${heading}:\\s*([\\s\\S]*?)(?=\\n[A-Z][^:\\n]+:|$)`, 'i');
  const match = pattern.exec(text);
  return match ? match[1].trim() : '';
}

function parseSingleProtocolitoEvaluation(text, protocolId) {
  const cleaned = cleanModelText(text);
  const statusMatch = /Status:\\s*([^\\s]+)/i.exec(cleaned);
  const normalizedStatus = statusMatch ? statusMatch[1].toLowerCase() : 'uncertain';
  const allowedStatuses = new Set(['insufficient', 'fair', 'exceptional', 'uncertain']);
  const status = allowedStatuses.has(normalizedStatus) ? normalizedStatus : 'uncertain';
  const summaryMatch = /Summary:\\s*([^\\n]+)/i.exec(cleaned);
  const capacityMatch = /Capacity:\\s*([^\\n]+)/i.exec(cleaned);
  const outcomeMatch = /Outcome:\\s*([^\\n]+)/i.exec(cleaned);
  const effectsSection = /Effects:\\s*([\\s\\S]+)/i.exec(cleaned);

  const effects = [];
  if (effectsSection) {
    effectsSection[1]
      .split('\\n')
      .map((line) => line.replace(/^[-•*]+\\s*/, '').trim())
      .filter(Boolean)
      .forEach((effect) => effects.push(effect));
  }

  return {
    id: protocolId,
    status,
    initialEvaluation: summaryMatch?.[1]?.trim() || '',
    capacityAssessment: capacityMatch?.[1]?.trim() || '',
    finalOutcome: outcomeMatch?.[1]?.trim() || '',
    effects,
    narrative: cleaned || ''
  };
}

function buildParticipantDetails(participantIds, participantMap) {
  if (!participantIds?.length) {
    return '- (no participants listed)';
  }
  return participantIds
    .map((id) => {
      const entry = participantMap[id];
      const person = entry?.participant || {};
      const careLoad =
        person.careLoad ||
        [person.workload, person.caretaking].filter(Boolean).join(' / ') ||
        'unspecified commitments';
      return [
        `- ${person.name || id} (${person.pronouns || 'unspecified pronouns'})`,
        `  condition: ${person.condition || 'unspecified'}`,
        `  care load: ${careLoad}`,
        `  skills: ${person.skills || 'unspecified'}`
      ].join(' | ');
    })
    .join('\\n');
}

function buildCharacterContextBlock(characters) {
  if (!Array.isArray(characters) || !characters.length) {
    return '- None selected.';
  }

  return characters
    .map((entry, index) => {
      const label = entry.name || `Participant ${index + 1}`;
      const careLoad =
        entry.careLoad ||
        [entry.workload, entry.caretaking].filter(Boolean).join(' / ');
      const details = [
        entry.pronouns ? `pronouns: ${entry.pronouns}` : '',
        entry.condition ? `condition: ${entry.condition}` : '',
        entry.skills ? `skills: ${entry.skills}` : '',
        careLoad ? `care load: ${careLoad}` : ''
      ]
        .filter(Boolean)
        .join(' | ');
      return details ? `- ${label} | ${details}` : `- ${label}`;
    })
    .join('\\n');
}

function buildEvaluationsBlock(results) {
  return results
    .map(
      (result) =>
        `- Protocolito ${result.id} (${result.status}): ${result.initialEvaluation || result.narrative}`
    )
    .join('\\n');
}

async function getLatestScenario() {
  const entries = await readJSONLines(HISTORY_FILE);
  if (!entries.length) {
    return '';
  }
  const latest = entries[entries.length - 1];
  return sanitizeField(latest?.draft || latest?.scenario || '');
}

async function summarizeToFit(draft, maxChars = MAX_SCENARIO_CHARS, maxAttempts = 3) {
  let current = draft.trim();
  let totalUsage = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await lmClient.generate({
      system:
        'You are a concise editor. Summaries must keep the original meaning, tone, and details.',
      user: [
        `Summarize the scenario below so it is under ${maxChars} characters, keeping all relevant information.`,
        'Do not invent new facts, and preserve any titles and paragraph breaks.',
        'Scenario draft:',
        '"""',
        current,
        '"""'
      ].join('\n')
    });

    totalUsage = mergeUsage(totalUsage, response.usage);

    const condensed = response.draft?.trim() || '';
    if (condensed && countChars(condensed) <= maxChars) {
      return {
        draft: condensed,
        usage: totalUsage
      };
    }

    current = condensed || current;
  }

  throw new Error('Summary exceeded character limit after multiple attempts.');
}

async function evaluateSingleProtocolito({
  protocolito,
  scenario,
  pocasStatus,
  currentPhase,
  participantsBlock
}) {
  const [systemPrompt, userTemplate] = await Promise.all([
    loader.load('protocolitos/eval-system.md'),
    loader.load('protocolitos/eval-user.md')
  ]);

  const userPrompt = renderTemplate(userTemplate, {
    scenario,
    pocasStatus,
    currentPhase,
    protocolitoText: protocolito.text,
    participantsBlock
  });

  const response = await lmClient.generate({
    system: systemPrompt,
    user: userPrompt
  });

  return parseSingleProtocolitoEvaluation(response.draft || '', protocolito.id);
}

async function summarizePhaseNarrative({ currentPhase, evaluationsBlock }) {
  const [systemPrompt, userTemplate] = await Promise.all([
    loader.load('protocolitos/summary-system.md'),
    loader.load('protocolitos/summary-user.md')
  ]);

  const userPrompt = renderTemplate(userTemplate, {
    currentPhase,
    evaluationsBlock
  });

  const response = await lmClient.generate({
    system: systemPrompt,
    user: userPrompt
  });

  const narrative = cleanModelText(response.draft || '');
  return {
    updatedScenario: extractSection(narrative, 'Updated Scenario'),
    pocasSummary: extractSection(narrative, 'Pocas Summary'),
    collectiveCapabilities: extractSection(narrative, 'Collective Capabilities'),
    phaseReflection: extractSection(narrative, 'Phase Reflection'),
    narrative,
    model: response.model || 'local-ai'
  };
}

async function generateParticipantProfile(scenario) {
  const [systemPrompt, userTemplate] = await Promise.all([
    loader.load('participants/system.md'),
    loader.load('participants/user.md')
  ]);

  const userPrompt = renderTemplate(userTemplate, {
    scenario: scenario || 'No scenario context provided.'
  });

  const response = await lmClient.generate({
    system: systemPrompt,
    user: userPrompt
  });

  let participant;
  try {
    participant = JSON.parse(response.draft);
  } catch (error) {
    console.error('Failed to parse participant JSON', response.draft);
    throw new Error('Participant generation output was not valid JSON.');
  }

  const conditionText =
    sanitizeField(participant.condition) ||
    sanitizeField(
      [participant.physicalCondition, participant.emotionalCondition].filter(Boolean).join(' ')
    );

  const normalized = {
    name: sanitizeField(participant.name),
    pronouns: sanitizeField(participant.pronouns),
    condition: conditionText,
    workload: sanitizeField(participant.workload),
    caretaking: sanitizeField(participant.caretaking),
    skills: sanitizeField(participant.skills)
  };

  normalized.careLoad =
    sanitizeField(participant.careLoad) ||
    sanitizeField(participant.obligations) ||
    sanitizeField(participant.carework) ||
    sanitizeField([normalized.workload, normalized.caretaking].filter(Boolean).join(' '));

  if (!normalized.name) {
    throw new Error('Generated participant is missing a name.');
  }

  return {
    participant: normalized,
    usage: response.usage
  };
}

function normalizeManualParticipant(input = {}) {
  const mergedCare =
    sanitizeField(
      input.careLoad ||
        input.carework ||
        input.obligations ||
        input.workloadCaretaking ||
        ''
    ) || '';
  const participant = {
    name: sanitizeField(input.name || input.nickname),
    pronouns: sanitizeField(input.pronouns),
    condition: sanitizeField(
      input.condition ||
        [input.physicalCondition, input.emotionalCondition].filter(Boolean).join(' ')
    ),
    workload: sanitizeField(input.workload) || mergedCare,
    caretaking: sanitizeField(input.caretaking) || mergedCare,
    skills: sanitizeField(input.skills)
  };

  participant.careLoad =
    mergedCare ||
    [participant.workload, participant.caretaking].filter(Boolean).join(' ').trim();

  if (!participant.name) {
    throw new Error('Name is required.');
  }

  return participant;
}

async function evaluateCurrentPhase() {
  const currentPhase =
    TIMELINE[gameState.phaseIndex] || TIMELINE[TIMELINE.length - 1];
  const allProtocolitos = loadProtocolitos();
  const pending = allProtocolitos.filter(
    (entry) => entry.phaseIndex === gameState.phaseIndex && entry.status === 'pending'
  );

  if (!pending.length) {
    throw new Error('No protocolitos to evaluate for this phase.');
  }

  const scenario = (await getLatestScenario()) || pending[0].scenario || '';
  const participantMap = await getParticipantMap();
  const previousState = gameState.lastEvaluation || null;
  const pocasStatus =
    previousState && (previousState.pocasSummary || previousState.collectiveCapabilities)
      ? [
          previousState.pocasSummary
            ? `Last phase pocas summary: ${previousState.pocasSummary}`
            : '',
          previousState.collectiveCapabilities
            ? `Last phase collective capabilities: ${previousState.collectiveCapabilities}`
            : ''
        ]
          .filter(Boolean)
          .join('\n')
      : 'The pocas space is newly forming with minimal shared infrastructure, scarce tools, and limited reserves.';

  const singleResults = [];
  for (const protocolito of pending) {
    const detailBlock = buildParticipantDetails(protocolito.participantIds, participantMap);
    const result = await evaluateSingleProtocolito({
      protocolito,
      scenario,
      pocasStatus,
      currentPhase: `${currentPhase.label} (${currentPhase.duration})`,
      participantsBlock: detailBlock
    });
    singleResults.push(result);
  }

  const summaryReport = await summarizePhaseNarrative({
    currentPhase: `${currentPhase.label} (${currentPhase.duration})`,
    evaluationsBlock: buildEvaluationsBlock(singleResults)
  });

  const resultsMap = singleResults.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});

  const updatedList = allProtocolitos.map((entry) => {
    if (entry.phaseIndex !== gameState.phaseIndex) {
      return entry;
    }
    const result = resultsMap[entry.id];
    if (!result) {
      return entry;
    }
    return {
      ...entry,
      status: result.status || 'reviewed',
      evaluations: [
        ...entry.evaluations,
        {
          timestamp: new Date().toISOString(),
          initialEvaluation: result.initialEvaluation || '',
          capacityAssessment: result.capacityAssessment || '',
          finalOutcome: result.finalOutcome || '',
          effects: Array.isArray(result.effects) ? result.effects : [],
          status: result.status || ''
        }
      ]
    };
  });

  saveProtocolitos(updatedList);

  const updatedScenario = sanitizeField(summaryReport.updatedScenario) || scenario;
  await recordWorldHistory({
    id: createEntryId('world'),
    timestamp: new Date().toISOString(),
    difficulty: null,
    axes: [],
    draft: updatedScenario,
    model: summaryReport.model || 'local-ai',
    metadata: {
      phaseIndex: gameState.phaseIndex,
      pocasSummary: summaryReport.pocasSummary || '',
      collectiveCapabilities: summaryReport.collectiveCapabilities || '',
      phaseReflection: summaryReport.phaseReflection || '',
      narrative: summaryReport.narrative || ''
    }
  });

  await recordParticipantHistory({
    id: createEntryId('participantPhase'),
    timestamp: new Date().toISOString(),
    mode: 'phaseSummary',
    phaseIndex: gameState.phaseIndex,
    scenario: updatedScenario,
    summary: summaryReport.collectiveCapabilities || '',
    notes: summaryReport.pocasSummary || '',
    reflection: summaryReport.phaseReflection || ''
  });

  const protocolSummaries = singleResults.map((result) => {
    const source = pending.find((entry) => entry.id === result.id);
    return {
      id: result.id,
      participantIds: source ? source.participantIds : [],
      participantNames: source
        ? source.participantIds.map((id) => participantMap[id]?.participant?.name || id)
        : [],
      text: source ? source.text : '',
      status: result.status || 'reviewed',
      initialEvaluation: result.initialEvaluation || '',
      capacityAssessment: result.capacityAssessment || '',
      finalOutcome: result.finalOutcome || '',
      effects: Array.isArray(result.effects) ? result.effects : [],
      narrative: result.narrative || ''
    };
  });

  const summary = {
    protocolitos: protocolSummaries,
    updatedScenario,
    pocasSummary: summaryReport.pocasSummary || '',
    collectiveCapabilities: summaryReport.collectiveCapabilities || '',
    phaseReflection: summaryReport.phaseReflection || '',
    narrative: summaryReport.narrative || ''
  };

  gameState.lastEvaluation = summary;
  if (gameState.phaseIndex < TIMELINE.length - 1) {
    gameState.phaseIndex += 1;
  }
  saveGameState();

  return {
    report: summary,
    updatedScenario,
    protocolitos: protocolSummaries,
    phaseIndex: gameState.phaseIndex
  };
}

async function recordWorldHistory(entry) {
  await appendJSONLine(HISTORY_FILE, entry);
}

async function recordParticipantHistory(entry) {
  await appendJSONLine(PARTICIPANT_HISTORY_FILE, entry);
}

async function getParticipants(limit = 100) {
  const entries = await readJSONLines(PARTICIPANT_HISTORY_FILE);
  const filtered = entries.filter((entry) => entry && entry.participant);
  return filtered.slice(-limit).reverse();
}

async function getParticipantMap() {
  const entries = await readJSONLines(PARTICIPANT_HISTORY_FILE);
  return entries.reduce((acc, entry) => {
    if (entry?.participant?.name && entry?.id) {
      acc[entry.id] = entry;
    }
    return acc;
  }, {});
}

async function recordProtocolito(entry) {
  const list = loadProtocolitos();
  list.push(entry);
  saveProtocolitos(list);
}

function updateProtocolitos(updater) {
  const list = loadProtocolitos();
  const updated = updater(list);
  if (updated) {
    saveProtocolitos(updated);
    return updated;
  }
  saveProtocolitos(list);
  return list;
}

async function handleSettingRequest(req, res) {
  const body = await readRequestBody(req);
  let payload = {};

  if (body) {
    try {
      payload = JSON.parse(body);
    } catch (err) {
      return sendJSON(res, 400, { error: 'Invalid JSON payload.' });
    }
  }

  const difficultyKey = typeof payload.difficulty === 'string'
    ? payload.difficulty.toLowerCase()
    : 'moderate';

  try {
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
      console.info(
        `Draft length ${countChars(draft)} exceeded ${MAX_SCENARIO_CHARS}, requesting summary.`
      );
      const summary = await summarizeToFit(draft, MAX_SCENARIO_CHARS);
      draft = summary.draft;
      extraUsage = summary.usage;
    }

    const usage = mergeUsage(lmResponse.usage, extraUsage);

    await recordWorldHistory({
      timestamp: new Date().toISOString(),
      difficulty,
      axes,
      draft,
      model: lmResponse.model
    });

    return sendJSON(res, 200, {
      axes,
      difficulty,
      draft,
      model: lmResponse.model,
      usage
    });
  } catch (error) {
    console.error('Failed to build setting', error);
    return sendJSON(res, 500, { error: 'Failed to generate setting.' });
  }
}

async function handleParticipantPost(req, res) {
  const body = await readRequestBody(req);
  let payload = {};

  if (body) {
    try {
      payload = JSON.parse(body);
    } catch (err) {
      return sendJSON(res, 400, { error: 'Invalid JSON payload.' });
    }
  }

  const mode = (payload.mode || 'manual').toLowerCase();
  const scenario = sanitizeField(payload.scenario);

  try {
    if (mode === 'generate') {
      if (!scenario) {
        return sendJSON(res, 400, { error: 'Scenario text is required to generate a participant.' });
      }

      const generated = await generateParticipantProfile(scenario);
      const entry = {
        id: createEntryId('participant'),
        timestamp: new Date().toISOString(),
        mode: 'generated',
        scenario,
        participant: generated.participant
      };

      await recordParticipantHistory(entry);
      return sendJSON(res, 200, { participant: entry, usage: generated.usage });
    }

    if (mode === 'manual') {
      const rawParticipant = payload.participant || payload;
      if (!rawParticipant) {
        return sendJSON(res, 400, { error: 'Participant payload is required.' });
      }

      const participantData = normalizeManualParticipant(rawParticipant);
      const entry = {
        id: createEntryId('participant'),
        timestamp: new Date().toISOString(),
        mode: 'manual',
        scenario,
        participant: participantData
      };

      await recordParticipantHistory(entry);
      return sendJSON(res, 201, { participant: entry });
    }

    return sendJSON(res, 400, { error: 'Unsupported participant mode.' });
  } catch (error) {
    console.error('Failed to process participant request', error);
    return sendJSON(res, 500, { error: 'Failed to process participant request.' });
  }
}

async function handleParticipantsGet(res) {
  try {
    const participants = await getParticipants(100);
    return sendJSON(res, 200, { participants });
  } catch (error) {
    console.error('Failed to load participants', error);
    return sendJSON(res, 500, { error: 'Failed to load participants.' });
  }
}

async function handleParticipantsDelete(res) {
  try {
    await clearParticipantsHistory();
    return sendJSON(res, 200, { ok: true });
  } catch (error) {
    console.error('Failed to clear participants', error);
    return sendJSON(res, 500, { error: 'Failed to clear participants.' });
  }
}

async function handleProtocolitoHelp(req, res) {
  const body = await readRequestBody(req);
  let payload = {};

  if (body) {
    try {
      payload = JSON.parse(body);
    } catch (err) {
      return sendJSON(res, 400, { error: 'Invalid JSON payload.' });
    }
  }

  const scenario = sanitizeField(payload.scenario);
  if (!scenario) {
    return sendJSON(res, 400, { error: 'Scenario snapshot is required.' });
  }

  const normalizeLine = (value) => sanitizeField(value).replace(/\s+/g, ' ').trim();
  const rawCharacters = Array.isArray(payload.characters) ? payload.characters : [];
  const limitedCharacters = rawCharacters.slice(0, 8).map((entry, index) => {
    const baseName = entry?.name || entry?.participant?.name || entry?.id || '';
    const careLoadValue =
      entry?.careLoad ||
      entry?.participant?.careLoad ||
      [entry?.workload, entry?.participant?.workload, entry?.caretaking, entry?.participant?.caretaking]
        .filter(Boolean)
        .join(' ');
    return {
      name: normalizeLine(baseName) || `Participant ${index + 1}`,
      pronouns: normalizeLine(entry?.pronouns || entry?.participant?.pronouns || ''),
      condition: normalizeLine(entry?.condition || entry?.participant?.condition || ''),
      workload: normalizeLine(entry?.workload || entry?.participant?.workload || ''),
      caretaking: normalizeLine(entry?.caretaking || entry?.participant?.caretaking || ''),
      careLoad: normalizeLine(careLoadValue),
      skills: normalizeLine(entry?.skills || entry?.participant?.skills || '')
    };
  });

  try {
    const [systemPrompt, userTemplate] = await Promise.all([
      loader.load('protocolitos/help-system.md'),
      loader.load('protocolitos/help-user.md')
    ]);

    const currentPhase =
      TIMELINE[gameState.phaseIndex] || TIMELINE[TIMELINE.length - 1];

    const userPrompt = renderTemplate(userTemplate, {
      scenario,
      charactersBlock: buildCharacterContextBlock(limitedCharacters),
      currentPhase: `${currentPhase.label} (${currentPhase.duration})`,
      timelineSummary: TIMELINE_SUMMARY
    });

    const response = await lmClient.generate({
      system: systemPrompt,
      user: userPrompt
    });

    const suggestion = cleanModelText(response.draft || '');
    if (!suggestion) {
      throw new Error('Helper response was empty.');
    }

    return sendJSON(res, 200, {
      suggestion,
      usage: response.usage || null,
      model: response.model || null
    });
  } catch (error) {
    console.error('Failed to generate protocolito help', error);
    return sendJSON(res, 500, { error: 'Failed to generate helper draft.' });
  }
}

async function handleProtocolitoPost(req, res) {
  const body = await readRequestBody(req);
  let payload = {};

  if (body) {
    try {
      payload = JSON.parse(body);
    } catch (err) {
      return sendJSON(res, 400, { error: 'Invalid JSON payload.' });
    }
  }

  const text = sanitizeField(payload.text);
  const participantIds = Array.isArray(payload.participants)
    ? payload.participants.map((id) => sanitizeField(id)).filter(Boolean)
    : [];

  if (!text) {
    return sendJSON(res, 400, { error: 'Protocolito text is required.' });
  }

  if (!participantIds.length) {
    return sendJSON(res, 400, { error: 'At least one participant id is required.' });
  }

  const scenario = sanitizeField(payload.scenario);
  if (!scenario) {
    return sendJSON(res, 400, { error: 'Scenario snapshot is required.' });
  }

  const entry = {
    id: createEntryId('protocolito'),
    timestamp: new Date().toISOString(),
    phaseIndex: gameState.phaseIndex,
    participantIds,
    text,
    scenario,
    status: 'pending',
    evaluations: []
  };

  await recordProtocolito(entry);
  return sendJSON(res, 201, { protocolito: entry });
}

async function handleResetGame(req, res) {
  try {
    await resetGameData();
    return sendJSON(res, 200, { ok: true });
  } catch (error) {
    console.error('Failed to reset game', error);
    return sendJSON(res, 500, { error: 'Failed to reset game.' });
  }
}

async function handleAdvancePhase(req, res) {
  try {
    const evaluation = await evaluateCurrentPhase();
    return sendJSON(res, 200, evaluation);
  } catch (error) {
    console.error('Failed to advance phase', error);
    return sendJSON(res, 400, { error: error.message || 'Failed to advance phase.' });
  }
}

async function handleStateGet(res) {
  try {
    const [participants, latestScenario] = await Promise.all([
      getParticipants(100),
      getLatestScenario()
    ]);

    const protocolitos = loadProtocolitos().filter(
      (entry) => entry.phaseIndex === gameState.phaseIndex
    );

    return sendJSON(res, 200, {
      phases: TIMELINE,
      phaseIndex: gameState.phaseIndex,
      currentPhase: TIMELINE[gameState.phaseIndex] || TIMELINE[TIMELINE.length - 1],
      scenario: latestScenario,
      participants,
      protocolitos,
      lastEvaluation: gameState.lastEvaluation || null
    });
  } catch (error) {
    console.error('Failed to load state', error);
    return sendJSON(res, 500, { error: 'Failed to load state.' });
  }
}

async function serveStaticAsset(res, pathname) {
  const safePath = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
  let filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  try {
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'text/plain; charset=utf-8';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  if (req.method === 'POST' && pathname === '/api/setting') {
    return handleSettingRequest(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/participant') {
    return handleParticipantPost(req, res);
  }

  if (req.method === 'GET' && pathname === '/api/participants') {
    return handleParticipantsGet(res);
  }

  if (req.method === 'DELETE' && pathname === '/api/participants') {
    return handleParticipantsDelete(res);
  }

  if (req.method === 'POST' && pathname === '/api/protocolito/help') {
    return handleProtocolitoHelp(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/protocolito') {
    return handleProtocolitoPost(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/advance-phase') {
    return handleAdvancePhase(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/reset') {
    return handleResetGame(req, res);
  }

  if (req.method === 'GET' && pathname === '/api/state') {
    return handleStateGet(res);
  }

  if (req.method === 'GET') {
    const targetPath = pathname === '/' ? '/index.html' : pathname;
    return serveStaticAsset(res, targetPath);
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method Not Allowed');
}

const server = http.createServer((req, res) => {
  requestHandler(req, res).catch((err) => {
    console.error('Unhandled server error', err);
    sendJSON(res, 500, { error: 'Internal Server Error' });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`POCAS setting generator listening on http://${HOST}:${PORT}`);
});

