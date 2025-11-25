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
const DEVELOPMENT_STAGES_FILE = path.join(PROMPT_DIR, 'development-stages/development-stages.md');
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
const developmentStagesGuide = fs.existsSync(DEVELOPMENT_STAGES_FILE)
  ? fs.readFileSync(DEVELOPMENT_STAGES_FILE, 'utf8')
  : '';

const DEVELOPMENT_STAGE_LEVELS = [
  {
    id: 1,
    label: 'Stage 1 - SETTING UP',
    summary: 'Small reach (~10 participants). Focus on trust building, basic infrastructures, and close coordination.'
  },
  {
    id: 2,
    label: 'Stage 2 - LIFTING OFF / PILOT PROJECT',
    summary: 'Growing reach (~20). Opportunities for a shared space, strengthening bases and communication fronts.'
  },
  {
    id: 3,
    label: 'Stage 3 - FIRST CHALLENGES OF SCALE',
    summary: 'Medium reach (~50). Transport, communal computing, and early foco experiments become relevant.'
  },
  {
    id: 4,
    label: 'Stage 4 - MAKE OR BREAK',
    summary: 'Large reach (~100). Ensure reliability, scale products/services, potentially spin off a MUCHA.'
  },
  {
    id: 5,
    label: 'Stage 5 - RIVALLING CAPITALISM',
    summary: 'Federative reach (200+). Managing networks of POCAS/MUCHAS and complex focos with city-wide logistics.'
  }
];

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
  const titleMatch = /Title:\\s*([^\\n]+)/i.exec(cleaned);
  const summaryMatch = /Summary:\\s*([^\\n]+)/i.exec(cleaned);
  const capacityMatch = /Capacity:\\s*([^\\n]+)/i.exec(cleaned);
  const implementationMatch = /Implementation:\\s*([^\\n]+)/i.exec(cleaned);
  const effectsSection = /Effects:\\s*([\\s\\S]*?)(?:\\n(?:Production:|$))/i.exec(cleaned);
  const productionMatch = /Production:\\s*([^\\n]+)/i.exec(cleaned);
  const quantityMatch = /Quantity:\\s*([^\\n]+)/i.exec(cleaned);
  const qualityMatch = /Quality:\\s*([^\\n]+)/i.exec(cleaned);

  const effects = [];
  if (effectsSection) {
    effectsSection[1]
      .split('\\n')
      .map((line) => line.replace(/^[-•*]+\\s*/, '').trim())
      .filter(Boolean)
      .forEach((effect) => effects.push(effect));
  }

  const summaryText = summaryMatch?.[1]?.trim() || '';
  const capacityText = capacityMatch?.[1]?.trim() || '';
  const implementationText = implementationMatch?.[1]?.trim() || '';
  const titleText = titleMatch?.[1]?.trim() || '';

  return {
    id: protocolId,
    status,
    implementationTitle: titleText,
    implementationSummary: summaryText,
    implementationCapacity: capacityText,
    implementationResult: implementationText,
    productionLine: productionMatch?.[1]?.trim() || '',
    productionQuantity: quantityMatch?.[1]?.trim() || '',
    productionQuality: qualityMatch?.[1]?.trim() || '',
    // legacy fields kept for compatibility with existing data
    title: titleText,
    initialEvaluation: summaryText,
    capacityAssessment: capacityText,
    finalOutcome: implementationText,
    effects,
    narrative: cleaned || ''
  };
}

function buildParticipantDetails(participantIds, participantMap, workloadMap = {}) {
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
      const simultaneous = workloadMap[id] || 0;
      const workloadHint =
        simultaneous > 1
          ? `${simultaneous} parallel protocolitos`
          : simultaneous === 1
          ? 'single protocolito focus'
          : 'no protocolitos this phase';
      return [
        `- ${person.name || id} (${person.pronouns || 'unspecified pronouns'})`,
        `  condition: ${person.condition || 'unspecified'}`,
        `  care load: ${careLoad}`,
        `  skills: ${person.skills || 'unspecified'}`,
        `  active commitments: ${workloadHint}`
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
    .map((result) => {
      const summary =
        result.implementationSummary || result.initialEvaluation || result.narrative || '';
      return `- Protocolito ${result.id} (${result.status}): ${summary}`;
    })
    .join('\\n');
}

function describeParticipantCapacities(person = {}) {
  return (
    sanitizeField(person.careLoad) ||
    sanitizeField(
      [person.workload, person.caretaking]
        .filter(Boolean)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .join(' / ')
    ) ||
    'No availability data recorded.'
  );
}

const CAPACITY_LEVELS = new Set(['normal', 'low', 'resting']);

function normalizeCapacityLevel(level) {
  if (typeof level !== 'string') {
    return 'normal';
  }
  const normalized = level.toLowerCase();
  return CAPACITY_LEVELS.has(normalized) ? normalized : 'normal';
}

function isParticipantResting(participant = {}, phaseIndex = 0) {
  const restingUntil =
    typeof participant.restingUntilPhase === 'number' ? participant.restingUntilPhase : null;
  if (restingUntil === null) {
    return false;
  }
  return phaseIndex <= restingUntil;
}

function updateBurnoutState(participantData = {}, { contributionsCount = 0, supportReceived = false, phaseIndex = 0 }) {
  const state = {
    capacityLevel: normalizeCapacityLevel(participantData.capacityLevel),
    restingUntilPhase:
      typeof participantData.restingUntilPhase === 'number'
        ? participantData.restingUntilPhase
        : null,
    overextensionStreak:
      typeof participantData.overextensionStreak === 'number'
        ? participantData.overextensionStreak
        : 0
  };

  let effectiveCapacity = state.capacityLevel;

  if (state.restingUntilPhase !== null) {
    if (phaseIndex <= state.restingUntilPhase) {
      effectiveCapacity = 'resting';
    } else {
      state.restingUntilPhase = null;
      effectiveCapacity = supportReceived ? 'normal' : 'low';
    }
  }

  const allowedProtocolitos =
    effectiveCapacity === 'low' || effectiveCapacity === 'resting' ? 0 : 1;
  const overextended = contributionsCount > allowedProtocolitos;

  state.overextensionStreak = overextended ? state.overextensionStreak + 1 : 0;

  let burnoutTriggered = false;
  if (state.overextensionStreak >= 2) {
    burnoutTriggered = true;
    state.restingUntilPhase = Math.min(phaseIndex + 1, TIMELINE.length - 1);
    effectiveCapacity = 'resting';
    state.overextensionStreak = 0;
  }

  if (!burnoutTriggered && effectiveCapacity === 'low' && !overextended && !supportReceived) {
    effectiveCapacity = 'normal';
  }

  participantData.capacityLevel = effectiveCapacity;
  participantData.restingUntilPhase = state.restingUntilPhase;
  participantData.overextensionStreak = state.overextensionStreak;
  participantData.lastOverextendedPhase = overextended
    ? phaseIndex
    : participantData.lastOverextendedPhase || null;

  return {
    overextended,
    burnoutTriggered,
    supportReceived,
    capacityLevel: effectiveCapacity
  };
}

function buildParticipantImpactSummaries(protocolitos, resultsMap, participantMap, supportMap = {}) {
  if (!participantMap || typeof participantMap !== 'object') {
    return [];
  }

  const impactMap = {};

  if (Array.isArray(protocolitos)) {
    protocolitos.forEach((protocolito) => {
      if (!Array.isArray(protocolito.participantIds) || !protocolito.participantIds.length) {
        return;
      }
      const evaluation = resultsMap[protocolito.id];
      const contributionTemplate = {
        title:
          evaluation?.implementationTitle ||
          protocolito.title ||
          truncateTitle(protocolito.text || '', 90) ||
          protocolito.id,
        status: evaluation?.status || protocolito.status || 'pending',
        summary:
          evaluation?.implementationSummary ||
          evaluation?.initialEvaluation ||
          evaluation?.narrative ||
          '',
        capacity: evaluation?.implementationCapacity || evaluation?.capacityAssessment || '',
        implementation: evaluation?.implementationResult || evaluation?.finalOutcome || '',
        effects: Array.isArray(evaluation?.effects) ? evaluation.effects : []
      };

      protocolito.participantIds.forEach((participantId) => {
        const participantEntry = participantMap[participantId];
        if (!participantEntry || !participantEntry.participant) {
          return;
        }
        if (!impactMap[participantId]) {
          impactMap[participantId] = {
            id: participantId,
            entry: participantEntry,
            participant: participantEntry.participant,
            contributions: [],
            supportReceived: []
          };
        }
        impactMap[participantId].contributions.push({
          ...contributionTemplate,
          effects: contributionTemplate.effects.slice(0, 3)
        });
      });
    });
  }

  Object.keys(participantMap).forEach((participantId) => {
    if (impactMap[participantId]) {
      return;
    }
    const participantEntry = participantMap[participantId];
    if (participantEntry?.participant) {
      impactMap[participantId] = {
        id: participantId,
        entry: participantEntry,
        participant: participantEntry.participant,
        contributions: [],
        supportReceived: []
      };
    }
  });

  Object.entries(supportMap).forEach(([participantId, sources]) => {
    if (!impactMap[participantId]) {
      const participantEntry = participantMap[participantId];
      if (participantEntry?.participant) {
        impactMap[participantId] = {
          id: participantId,
          entry: participantEntry,
          participant: participantEntry.participant,
          contributions: [],
          supportReceived: Array.isArray(sources) ? sources : [sources]
        };
      }
      return;
    }
    const existing = impactMap[participantId];
    existing.supportReceived = Array.isArray(sources) ? sources : [sources];
  });

  return Object.values(impactMap);
}

function formatImpactContribution(contribution) {
  if (!contribution) {
    return '';
  }
  const parts = [];
  if (contribution.summary) {
    parts.push(`design: ${contribution.summary}`);
  }
  if (contribution.capacity) {
    parts.push(`capacity: ${contribution.capacity}`);
  }
  if (contribution.implementation) {
    parts.push(`implementation: ${contribution.implementation}`);
  }
  if (Array.isArray(contribution.effects) && contribution.effects.length) {
    parts.push(`effects: ${contribution.effects.join('; ')}`);
  }
  const details = parts.filter(Boolean).join(' | ');
  return `* ${contribution.title || 'Protocolito'} (${contribution.status || 'status unknown'})${
    details ? ` - ${details}` : ''
  }`;
}

function buildParticipantImpactBlock(impacts) {
  if (!Array.isArray(impacts) || !impacts.length) {
    return '';
  }

  return impacts
    .map((impact) => {
      const person = impact.participant || {};
      const contributions = impact.contributions.slice(0, 4);
      const contributionsText = contributions.length
        ? contributions.map((entry) => formatImpactContribution(entry)).join('\\n')
        : '* No protocolitos involved this phase.';
      return [
        `Participant ID: ${impact.id}`,
        `Name: ${person.name || 'Unnamed'}`,
        `Pronouns: ${person.pronouns || 'unspecified'}`,
        `Baseline capabilities: ${person.skills || 'No capability data recorded.'}`,
        `Baseline capacities: ${describeParticipantCapacities(person)}`,
        `Baseline condition: ${person.condition || 'No condition data recorded.'}`,
        `Protocolitos this phase: ${impact.contributions.length}`,
        Array.isArray(impact.supportReceived) && impact.supportReceived.length
          ? `Support received this phase: ${impact.supportReceived.join(', ')}`
          : 'Support received this phase: none',
        `Burnout status: ${normalizeCapacityLevel(person.capacityLevel)}`,
        person.statusLog
          ? `Existing status log: ${person.statusLog.split('\n').slice(-2).join(' / ')}`
          : 'Existing status log: none recorded.',
        'Recent protocolito outcomes:',
        contributionsText
      ].join('\\n');
    })
    .join('\\n---\\n');
}

function appendStatusEntry(existingValue, phaseLabel, statusText) {
  const normalized = sanitizeField(statusText);
  if (!normalized) {
    return {
      changed: false,
      value: existingValue || ''
    };
  }
  const prefix = phaseLabel ? `${phaseLabel}: ` : '';
  const addition = `${prefix}${normalized}`.trim();
  const safeExisting = sanitizeField(existingValue);
  if (!safeExisting) {
    return {
      changed: true,
      value: addition
    };
  }
  return {
    changed: true,
    value: `${safeExisting}\\n${addition}`.trim()
  };
}

async function generateParticipantPhaseUpdates({
  currentPhase,
  scenario,
  summaryHighlights,
  participantsBlock,
  evaluationsBlock,
  developmentStage
}) {
  const [systemPrompt, userTemplate] = await Promise.all([
    loader.load('participants/update-system.md'),
    loader.load('participants/update-user.md')
  ]);

  const userPrompt = renderTemplate(userTemplate, {
    currentPhase,
    scenario,
    summaryHighlights,
    participantsBlock,
    evaluationsBlock,
    developmentStage
  });

  const response = await lmClient.generate({
    system: systemPrompt,
    user: userPrompt
  });

  const cleaned = cleanModelText(response.draft || '');
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return {
        updates: parsed,
        usage: response.usage || null
      };
    }
    if (parsed && Array.isArray(parsed.updates)) {
      return {
        updates: parsed.updates,
        usage: response.usage || null
      };
    }
    console.warn('Participant update response did not return an array.', cleaned);
  } catch (error) {
    console.error('Failed to parse participant update JSON', cleaned, error);
    return null;
  }
  return null;
}

async function applyParticipantPhaseUpdates({
  pendingProtocolitos,
  resultsMap,
  participantMap,
  phaseIndex,
  phaseLabel,
  scenario,
  summaryReport,
  evaluationsBlock,
  supportMap = {}
}) {
  const impacts = buildParticipantImpactSummaries(
    pendingProtocolitos,
    resultsMap,
    participantMap,
    supportMap
  );
  if (!impacts.length) {
    return [];
  }

  const participantsBlock = buildParticipantImpactBlock(impacts);
  if (!participantsBlock.trim()) {
    return [];
  }

  const summaryHighlights = [
    summaryReport?.pocasSummary ? `Pocas summary: ${summaryReport.pocasSummary}` : '',
    summaryReport?.collectiveCapabilities
      ? `Collective capabilities: ${summaryReport.collectiveCapabilities}`
      : '',
    summaryReport?.phaseReflection ? `Reflection: ${summaryReport.phaseReflection}` : ''
  ]
    .filter(Boolean)
    .join('\\n');

  let updateResponse = null;
  try {
    updateResponse = await generateParticipantPhaseUpdates({
      currentPhase: phaseLabel,
      scenario,
      summaryHighlights,
      participantsBlock,
      evaluationsBlock,
      developmentStage: summaryReport?.developmentStageHint || summaryReport?.developmentStage || ''
    });
  } catch (error) {
    console.error('Failed to generate participant phase updates', error);
  }

  const updatesFromModel = new Map();
  if (updateResponse && Array.isArray(updateResponse.updates)) {
    updateResponse.updates.forEach((entry) => {
      if (!entry) return;
      const participantId = sanitizeField(entry.participantId || entry.id);
      if (!participantId) return;
      updatesFromModel.set(participantId, entry);
    });
  }

  const applied = [];
  for (const impact of impacts) {
    const participantId = impact.id;
    const participantEntry = participantMap[participantId];
    if (!participantEntry || !participantEntry.participant) {
      continue;
    }
    const participantData = { ...participantEntry.participant };
    participantData.capacityLevel = normalizeCapacityLevel(participantData.capacityLevel);
    participantData.overextensionStreak =
      typeof participantData.overextensionStreak === 'number'
        ? participantData.overextensionStreak
        : 0;

    const contributionsCount = Array.isArray(impact.contributions) ? impact.contributions.length : 0;
    const supportReceived =
      Array.isArray(impact.supportReceived) && impact.supportReceived.length > 0;

    const burnoutMeta = updateBurnoutState(participantData, {
      contributionsCount,
      supportReceived,
      phaseIndex
    });

    const modelUpdate = updatesFromModel.get(participantId) || {};
    const statusLine =
      sanitizeField(modelUpdate.statusLine || modelUpdate.currentStatus || modelUpdate.status) ||
      'No discernible change this phase.';
    const statusNote = appendStatusEntry(participantData.statusLog || '', phaseLabel, statusLine);
    if (statusNote.changed) {
      participantData.statusLog = statusNote.value;
    }

    const timestamp = new Date().toISOString();
    const historyEntry = {
      id: participantId,
      timestamp,
      mode: 'statusUpdate',
      phaseIndex,
      participant: participantData,
      updates: {
        statusLine,
        phaseLabel,
        overextended: burnoutMeta.overextended,
        burnoutTriggered: burnoutMeta.burnoutTriggered,
        supportReceived,
        capacityLevel: participantData.capacityLevel
      }
    };

    await recordParticipantHistory(historyEntry);
    participantMap[participantId] = historyEntry;
    applied.push({
      participantId,
      name: participantData.name,
      statusLine,
      overextended: burnoutMeta.overextended,
      burnoutTriggered: burnoutMeta.burnoutTriggered
    });
  }

  return applied;
}

function normalizeSeriesId(entry) {
  if (!entry) {
    return null;
  }
  return entry.seriesId || entry.id || null;
}

function truncateTitle(value, maxLength = 80) {
  if (!value) {
    return '';
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength).trim()}…`;
}

function summarizeProtocolitoSeries(protocolitos) {
  if (!Array.isArray(protocolitos)) {
    return [];
  }
  const seriesMap = {};

  protocolitos.forEach((entry) => {
    const seriesId = normalizeSeriesId(entry);
    if (!seriesId) {
      return;
    }
    if (!seriesMap[seriesId]) {
      seriesMap[seriesId] = {
        seriesId,
        title: entry.title || '',
        displayTitle: '',
        versions: []
      };
    }
    const versionNumber =
      typeof entry.version === 'number' && Number.isFinite(entry.version)
        ? entry.version
        : seriesMap[seriesId].versions.length + 1;
    seriesMap[seriesId].title = seriesMap[seriesId].title || entry.title || '';
    seriesMap[seriesId].versions.push({
      id: entry.id,
      version: versionNumber,
      phaseIndex: entry.phaseIndex,
      timestamp: entry.timestamp,
      text: entry.text,
      status: entry.status || '',
      participantIds: entry.participantIds || [],
      title: entry.title || '',
      scenario: entry.scenario || ''
    });
  });

  return Object.values(seriesMap)
    .map((series) => {
      series.versions.sort((a, b) => {
        if (a.version !== b.version) {
          return a.version - b.version;
        }
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
      series.versions = series.versions.map((version, index) => ({
        ...version,
        version: index + 1
      }));
      series.totalVersions = series.versions.length;
      series.latest = series.versions[series.versions.length - 1] || null;
      const fullTitle = series.title || series.latest?.title || series.seriesId;
      series.title = fullTitle;
      series.displayTitle = truncateTitle(fullTitle);
      return series;
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function protocolitoEntriesForSeries(list, seriesId) {
  if (!seriesId || !Array.isArray(list)) {
    return [];
  }
  return list.filter((entry) => normalizeSeriesId(entry) === seriesId);
}

function inferDevelopmentStageContext({ phaseIndex }) {
  const safeIndex = Math.max(0, Math.min(DEVELOPMENT_STAGE_LEVELS.length - 1, phaseIndex));
  const stage = DEVELOPMENT_STAGE_LEVELS[safeIndex] || DEVELOPMENT_STAGE_LEVELS[0];
  return {
    id: stage.id,
    label: stage.label,
    summary: stage.summary,
    hint: `${stage.label}. ${stage.summary}`
  };
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

async function summarizePhaseNarrative({
  currentPhase,
  evaluationsBlock,
  developmentStage
}) {
  const [systemPrompt, userTemplate] = await Promise.all([
    loader.load('protocolitos/summary-system.md'),
    loader.load('protocolitos/summary-user.md')
  ]);

  const userPrompt = renderTemplate(userTemplate, {
    currentPhase,
    evaluationsBlock,
    developmentStage,
    developmentStagesGuide
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

async function summarizePhaseBrief({ currentPhase, evaluationsBlock, summaryReport }) {
  const [systemPrompt, userTemplate] = await Promise.all([
    loader.load('protocolitos/brief-system.md'),
    loader.load('protocolitos/brief-user.md')
  ]);

  const userPrompt = renderTemplate(userTemplate, {
    currentPhase,
    evaluationsBlock,
    pocasSummary: summaryReport.pocasSummary || '',
    collectiveCapabilities: summaryReport.collectiveCapabilities || '',
    phaseReflection: summaryReport.phaseReflection || '',
    developmentStage: summaryReport.developmentStage || '',
    developmentStagesGuide,
    developmentStageHint: summaryReport.developmentStageHint || ''
  });

  const response = await lmClient.generate({
    system: systemPrompt,
    user: userPrompt
  });

  return cleanModelText(response.draft || '');
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
    skills: sanitizeField(participant.skills),
    statusLog: '',
    capacityLevel: 'normal',
    overextensionStreak: 0,
    restingUntilPhase: null,
    lastOverextendedPhase: null
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
    skills: sanitizeField(input.skills),
    statusLog: sanitizeField(input.statusLog || input.currentStatus || ''),
    capacityLevel: 'normal',
    overextensionStreak: 0,
    restingUntilPhase: null,
    lastOverextendedPhase: null
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
  const stageContext = inferDevelopmentStageContext({ phaseIndex: gameState.phaseIndex });
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

  const workloadMap = pending.reduce((acc, protocolito) => {
    protocolito.participantIds?.forEach((id) => {
      if (!id) return;
      acc[id] = (acc[id] || 0) + 1;
    });
    return acc;
  }, {});

  const supportMap = pending.reduce((acc, protocolito) => {
    if (!Array.isArray(protocolito.supportTargets)) {
      return acc;
    }
    protocolito.supportTargets.forEach((targetId) => {
      if (!targetId) {
        return;
      }
      if (!acc[targetId]) {
        acc[targetId] = [];
      }
      acc[targetId].push(protocolito.title || truncateTitle(protocolito.text || '', 60));
    });
    return acc;
  }, {});

  const singleResults = [];
  for (const protocolito of pending) {
    const detailBlock = buildParticipantDetails(
      protocolito.participantIds,
      participantMap,
      workloadMap
    );
    const result = await evaluateSingleProtocolito({
      protocolito,
      scenario,
      pocasStatus,
      currentPhase: `${currentPhase.label} (${currentPhase.duration})`,
      participantsBlock: detailBlock
    });
    singleResults.push(result);
  }

  const evaluationsBlock = buildEvaluationsBlock(singleResults);

  const summaryReport = await summarizePhaseNarrative({
    currentPhase: `${currentPhase.label} (${currentPhase.duration})`,
    evaluationsBlock,
    developmentStage: stageContext.hint
  });

  summaryReport.developmentStage = stageContext.label;
  summaryReport.developmentStageHint = stageContext.hint;

  const phaseBrief = await summarizePhaseBrief({
    currentPhase: `${currentPhase.label} (${currentPhase.duration})`,
    evaluationsBlock,
    summaryReport
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
    const implementationSummary =
      result.implementationSummary || result.initialEvaluation || '';
    const implementationCapacity =
      result.implementationCapacity || result.capacityAssessment || '';
    const implementationResult =
      result.implementationResult || result.finalOutcome || '';

    return {
      ...entry,
      status: result.status || 'reviewed',
      title: result.implementationTitle || entry.title || '',
      evaluations: [
        ...entry.evaluations,
        {
          timestamp: new Date().toISOString(),
          implementationTitle: result.implementationTitle || '',
          implementationSummary,
          implementationCapacity,
          implementationResult,
          productionLine: result.productionLine || '',
          productionQuantity: result.productionQuantity || '',
          productionQuality: result.productionQuality || '',
          effects: Array.isArray(result.effects) ? result.effects : [],
          status: result.status || '',
          // legacy fields for compatibility
          initialEvaluation: implementationSummary,
          capacityAssessment: implementationCapacity,
          finalOutcome: implementationResult
        }
      ]
    };
  });

  saveProtocolitos(updatedList);

  const updatedScenario = sanitizeField(summaryReport.updatedScenario) || scenario;

  const participantUpdates = await applyParticipantPhaseUpdates({
    pendingProtocolitos: pending,
    resultsMap,
    participantMap,
    phaseIndex: gameState.phaseIndex,
    phaseLabel: `${currentPhase.label} (${currentPhase.duration})`,
    scenario: updatedScenario,
    summaryReport,
    evaluationsBlock,
    supportMap
  });

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
    const implementationSummary =
      result.implementationSummary || result.initialEvaluation || '';
    const implementationCapacity =
      result.implementationCapacity || result.capacityAssessment || '';
    const implementationResult =
      result.implementationResult || result.finalOutcome || '';
    return {
      id: result.id,
      seriesId: source ? normalizeSeriesId(source) : null,
      participantIds: source ? source.participantIds : [],
      supportTargets: source?.supportTargets || [],
      participantNames: source
        ? source.participantIds.map((id) => participantMap[id]?.participant?.name || id)
        : [],
      text: source ? source.text : '',
      status: result.status || 'reviewed',
      implementationTitle: result.implementationTitle || '',
      implementationSummary,
      implementationCapacity,
      implementationResult,
      version: source?.version || null,
      title: source?.title || '',
      productionLine: result.productionLine || '',
      productionQuantity: result.productionQuantity || '',
      productionQuality: result.productionQuality || '',
      effects: Array.isArray(result.effects) ? result.effects : [],
      narrative: result.narrative || '',
      // legacy fields
      title: result.implementationTitle || '',
      initialEvaluation: implementationSummary,
      capacityAssessment: implementationCapacity,
      finalOutcome: implementationResult
    };
  });

  const summary = {
    protocolitos: protocolSummaries,
    updatedScenario,
    pocasSummary: summaryReport.pocasSummary || '',
    collectiveCapabilities: summaryReport.collectiveCapabilities || '',
    phaseReflection: summaryReport.phaseReflection || '',
    narrative: summaryReport.narrative || '',
    phaseBrief,
    developmentStage: summaryReport.developmentStage,
    developmentStageHint: summaryReport.developmentStageHint,
    participantUpdates
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
  const latestMap = new Map();
  entries.forEach((entry) => {
    if (entry?.participant && entry?.id) {
      latestMap.set(entry.id, entry);
    }
  });
  const latestList = Array.from(latestMap.values()).sort((a, b) => {
    const aTime = new Date(a.timestamp || 0).getTime();
    const bTime = new Date(b.timestamp || 0).getTime();
    return bTime - aTime;
  });
  return latestList.slice(0, limit);
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

  const participantMap = await getParticipantMap();

  const allProtocolitos = loadProtocolitos();
  const providedSeriesId = sanitizeField(payload.seriesId);
  const providedTitle = truncateTitle(sanitizeField(payload.title));

  let seriesId = providedSeriesId;
  let version = 1;
  let title = providedTitle;

  if (providedSeriesId) {
    const seriesEntries = protocolitoEntriesForSeries(allProtocolitos, providedSeriesId);
    if (!seriesEntries.length) {
      return sendJSON(res, 404, { error: 'Protocolito series not found.' });
    }
    const maxVersion = seriesEntries.reduce(
      (acc, entry) => Math.max(acc, typeof entry.version === 'number' ? entry.version : 0),
      0
    );
    version = maxVersion ? maxVersion + 1 : seriesEntries.length + 1;
    const legacyTitle =
      seriesEntries.find((entry) => entry.title)?.title ||
      truncateTitle(seriesEntries[0]?.text || '');
    title = legacyTitle || title;
  } else {
    seriesId = createEntryId('protoSeries');
    title = title || truncateTitle(text.split('\n')[0] || '');
    if (!title) {
      return sendJSON(res, 400, { error: 'Protocolito title is required.' });
    }
  }

  const restingParticipants = participantIds.filter((id) => {
    const record = participantMap[id];
    return record?.participant && isParticipantResting(record.participant, gameState.phaseIndex);
  });
  if (restingParticipants.length) {
    const names = restingParticipants.map(
      (id) => participantMap[id]?.participant?.name || id
    );
    return sendJSON(res, 400, {
      error: `These participants are resting due to burnout: ${names.join(', ')}`
    });
  }

  const supportTargets = Array.isArray(payload.supportTargets)
    ? [
        ...new Set(
          payload.supportTargets
            .map((id) => sanitizeField(id))
            .filter(Boolean)
        )
      ]
    : [];

  const invalidSupportTargets = [];
  const conflictingSupportTargets = [];
  supportTargets.forEach((targetId) => {
    if (!participantMap[targetId]?.participant) {
      invalidSupportTargets.push(targetId);
      return;
    }
    if (participantIds.includes(targetId)) {
      conflictingSupportTargets.push(targetId);
      return;
    }
    const targetParticipant = participantMap[targetId].participant;
    const eligibleForSupport =
      isParticipantResting(targetParticipant, gameState.phaseIndex) ||
      normalizeCapacityLevel(targetParticipant.capacityLevel) === 'low';
    if (!eligibleForSupport) {
      invalidSupportTargets.push(targetId);
    }
  });

  if (invalidSupportTargets.length) {
    const names = invalidSupportTargets.map(
      (id) => participantMap[id]?.participant?.name || id
    );
    return sendJSON(res, 400, {
      error: `Support targets must be resting or low-capacity participants. Invalid: ${names.join(', ')}`
    });
  }

  if (conflictingSupportTargets.length) {
    const names = conflictingSupportTargets.map(
      (id) => participantMap[id]?.participant?.name || id
    );
    return sendJSON(res, 400, {
      error: `Participants cannot both implement and receive support: ${names.join(', ')}`
    });
  }

  const entry = {
    id: createEntryId('protocolito'),
    timestamp: new Date().toISOString(),
    phaseIndex: gameState.phaseIndex,
    participantIds,
    text,
    scenario,
    status: 'pending',
    evaluations: [],
    seriesId,
    version,
    title,
    supportTargets
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

    const allProtocolitos = loadProtocolitos();
    const protocolitos = allProtocolitos.filter(
      (entry) => entry.phaseIndex === gameState.phaseIndex
    );
    const protocolitoSeries = summarizeProtocolitoSeries(allProtocolitos);

    return sendJSON(res, 200, {
      phases: TIMELINE,
      phaseIndex: gameState.phaseIndex,
      currentPhase: TIMELINE[gameState.phaseIndex] || TIMELINE[TIMELINE.length - 1],
      scenario: latestScenario,
      participants,
      protocolitos,
      protocolitoSeries,
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


