const difficultySelect = document.getElementById('difficulty');
const generateBtn = document.getElementById('generate');
const draftEl = document.getElementById('draft');
const addParticipantBtn = document.getElementById('addParticipant');
const participantControls = document.getElementById('participantControls');
const participantCreateBtn = document.getElementById('participantCreateBtn');
const participantGenerateBtn = document.getElementById('participantGenerateBtn');
const participantCancelBtn = document.getElementById('participantCancelBtn');
const participantForm = document.getElementById('participantForm');
const participantStatus = document.getElementById('participantStatus');
const participantsListEl = document.getElementById('participantsList');
const timelineBarEl = document.getElementById('timelineBar');

const addProtocolitoBtn = document.getElementById('addProtocolito');
const protocolitoControls = document.getElementById('protocolitoControls');
const protocolitoForm = document.getElementById('protocolitoForm');
const protocolitoParticipantsEl = document.getElementById('protocolitoParticipants');
const protocolitoSupportTargetsEl = document.getElementById('protocolitoSupportTargets');
const protocolitoStatusEl = document.getElementById('protocolitoStatus');
const protocolitoCancelBtn = document.getElementById('protocolitoCancelBtn');
const protocolitoHelpBtn = document.getElementById('protocolitoHelpBtn');
const protocolitoTitleInput = document.getElementById('protocolitoTitle');
const protocolitoSeriesIdInput = document.getElementById('protocolitoSeriesId');
const protocolitoVersionNotice = document.getElementById('protocolitoVersionNotice');
const protocolitoVersionHistory = document.getElementById('protocolitoVersionHistory');
const protocolitoExistingList = document.getElementById('protocolitoExistingList');
const protocolitoCurrentList = document.getElementById('protocolitoCurrentList');
const protocolitoStartNewBtn = document.getElementById('protocolitoStartNewBtn');
const protocolitosListEl = document.getElementById('protocolitosList');
const advancePhaseBtn = document.getElementById('advancePhaseBtn');
const protocolitoResultsEl = document.getElementById('protocolitoResults');
const protocolitoSummaryEl = document.getElementById('protocolitoSummary');
const clearParticipantsBtn = document.getElementById('clearParticipantsBtn');
const resetGameBtn = document.getElementById('resetGameBtn');
const capabilitiesIntroEl = document.getElementById('capabilitiesIntro');
const capabilitiesSummaryEl = document.getElementById('capabilitiesSummary');
const capabilitiesHighlightsEl = document.getElementById('capabilitiesHighlights');
const capabilitiesSpreadEl = document.getElementById('capabilitiesSpread');
const spreadFillEl = document.getElementById('spreadFill');
const spreadScoreLabelEl = document.getElementById('spreadScoreLabel');

const scenarioPlaceholder = 'Request a draft to see results.';
let participants = [];
let protocolitos = [];
let protocolitoSeries = [];
let phases = [];
let phaseIndex = 0;
let selectedProtocolParticipantIds = [];
let selectedSupportTargetIds = [];
let lastEvaluation = null;
let implementationByProtocolito = {};
let currentPhaseLabel = '';
let selectedProtocolitoSeriesId = '';

function escapeHTML(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatText(value = '') {
  return escapeHTML(value).replace(/\n/g, '<br>');
}

function splitListItems(text = '') {
  return text
    .split(/[\n,;/•]+/g)
    .map((item) => item.replace(/^[-–•\s]+/, '').trim())
    .filter(Boolean);
}

function formatSkillsList(value = '') {
  const items = splitListItems(value);
  if (!items.length) {
    return '<p class="note">No skills listed yet.</p>';
  }
  return `<ul class="skills-list">${items.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`;
}

function extractCareLoad(person = {}) {
  const combined =
    person.careLoad ||
    [person.workload, person.caretaking]
      .filter(Boolean)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join(' ');
  return combined.trim();
}

function isParticipantResting(entry) {
  if (!entry || !entry.participant) {
    return false;
  }
  const person = entry.participant;
  if ((person.capacityLevel || '').toLowerCase() === 'resting') {
    return true;
  }
  const raw = person.restingUntilPhase;
  if (raw === null || raw === undefined || raw === '' || raw === 'null') {
    return false;
  }
  const until = Number(raw);
  if (!Number.isFinite(until)) {
    return false;
  }
  return typeof phaseIndex === 'number' && phaseIndex <= until;
}

function capacityLabel(person = {}) {
  const level = (person.capacityLevel || 'normal').toLowerCase();
  const labels = {
    normal: 'Ready for protocols',
    low: 'Low capacity',
    resting: 'Resting / on leave'
  };
  return labels[level] || 'Ready for protocols';
}

function capacityBadgeClass(person = {}) {
  const level = (person.capacityLevel || 'normal').toLowerCase();
  if (level === 'resting') {
    return 'badge danger';
  }
  if (level === 'low') {
    return 'badge warning';
  }
  return 'badge';
}

function truncateText(value = '', limit = 220) {
  if (!value) return '';
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trim()}…`;
}

const STATUS_WEIGHTS = {
  exceptional: 1,
  fair: 0.72,
  uncertain: 0.45,
  insufficient: 0.2
};

function statusLabel(status = '') {
  const normalized = (status || '').toLowerCase();
  const map = {
    exceptional: 'Exceptional',
    fair: 'Fair',
    uncertain: 'Uncertain',
    insufficient: 'Insufficient'
  };
  return map[normalized] || 'Review';
}

function computeSpreadScore(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return null;
  }
  let total = 0;
  let count = 0;
  items.forEach((item) => {
    const normalized = (item?.status || '').toLowerCase();
    const weight = STATUS_WEIGHTS[normalized];
    total += typeof weight === 'number' ? weight : 0.5;
    count += 1;
  });
  if (!count) {
    return null;
  }
  const score = Math.round((total / count) * 100);
  return Math.max(0, Math.min(100, score));
}

function buildCapabilityCard(item) {
  if (!item) {
    return '';
  }
  const status = (item.status || 'uncertain').toLowerCase();
  const protocolText = (item.text || '').trim();
  const headlineSource =
    item.implementationTitle ||
    item.title ||
    protocolText ||
    (Array.isArray(item.participantNames) && item.participantNames.length
      ? item.participantNames.join(', ')
      : '');
  const headline = truncateText(headlineSource || item.id || 'Protocolito outcome', 120);
  let detailText =
    (
      item.implementationResult ||
      item.implementationSummary ||
      item.finalOutcome ||
      item.initialEvaluation ||
      item.narrative ||
      ''
    ).trim();
  detailText = truncateText(detailText, 260);
  const detailHtml = detailText
    ? `<p class="capability-text">${formatText(detailText)}</p>`
    : '<p class="capability-text note">Outcome pending.</p>';
  return `
    <article class="capability-item status-${status}">
      <header class="capability-item-head">
        <p class="capability-title">${escapeHTML(headline)}</p>
        <span class="status-pill">${statusLabel(status)}</span>
      </header>
      ${detailHtml}
    </article>
  `;
}

function buildImplementationDetails(data) {
  if (!data) {
    return '';
  }
  const summaryText = data.implementationSummary || data.initialEvaluation || '';
  const capacityText = data.implementationCapacity || data.capacityAssessment || '';
  const implementationText = data.implementationResult || data.finalOutcome || '';
  const effectsList = Array.isArray(data.effects) ? data.effects.filter(Boolean) : [];
  const productionLine = data.productionLine || '';
  const productionQuantity = data.productionQuantity || '';
  const productionQuality = data.productionQuality || '';
  const needsNarrative =
    !summaryText && !capacityText && !implementationText && !effectsList.length;
  const narrativeText = needsNarrative ? data.narrative || '' : '';

  if (
    !summaryText &&
    !capacityText &&
    !implementationText &&
    !effectsList.length &&
    !productionLine &&
    !productionQuantity &&
    !productionQuality &&
    !narrativeText
  ) {
    return '';
  }

  const effectsHtml = effectsList.length
    ? `<div class="protocolito-effects">
        <strong>Effects:</strong>
        <ul>${effectsList.map((effect) => `<li>${escapeHTML(effect)}</li>`).join('')}</ul>
      </div>`
    : '';

  const productionMeta = [];
  if (productionLine) {
    productionMeta.push(
      `<p><strong>Production:</strong> ${formatText(productionLine)}</p>`
    );
  }
  const productionDetails = [];
  if (productionQuantity) {
    productionDetails.push(
      `<li><strong>Quantity:</strong> ${escapeHTML(productionQuantity)}</li>`
    );
  }
  if (productionQuality) {
    productionDetails.push(
      `<li><strong>Quality:</strong> ${formatText(productionQuality)}</li>`
    );
  }
  if (productionDetails.length) {
    productionMeta.push(`<ul>${productionDetails.join('')}</ul>`);
  }

  const productionHtml = productionMeta.length
    ? `<div class="protocolito-production">${productionMeta.join('')}</div>`
    : '';

  const narrativeHtml = narrativeText ? `<p>${formatText(narrativeText)}</p>` : '';

  return `
    <details class="protocolito-implementation">
      <summary>Implementation result</summary>
      ${
        summaryText
          ? `<p><strong>Design verdict:</strong> ${formatText(summaryText)}</p>`
          : ''
      }
      ${
        capacityText ? `<p><strong>Capacity:</strong> ${formatText(capacityText)}</p>` : ''
      }
      ${
        implementationText
          ? `<p><strong>Implementation:</strong> ${formatText(implementationText)}</p>`
          : ''
      }
      ${effectsHtml}
      ${productionHtml}
      ${narrativeHtml}
    </details>
  `;
}

function phaseLabelForIndex(index) {
  if (typeof index !== 'number' || index < 0 || index >= phases.length) {
    return 'Phase';
  }
  const phase = phases[index];
  if (phase && phase.label && phase.duration) {
    return `${phase.label} (${phase.duration})`;
  }
  if (phase && phase.label) {
    return phase.label;
  }
  return `Phase ${index + 1}`;
}

function renderProtocolitoVersionHistory(series) {
  if (!protocolitoVersionHistory) {
    return;
  }
  if (!series || !Array.isArray(series.versions) || !series.versions.length) {
    protocolitoVersionHistory.innerHTML = '';
    protocolitoVersionHistory.classList.add('hidden');
    return;
  }

  const historyItems = series.versions
    .map((version) => {
      const snippet = truncateText(version.text || '', 140);
      const snippetBlock = snippet ? `<br><span>${escapeHTML(snippet)}</span>` : '';
      return `<li><strong>v${version.version}</strong> · ${phaseLabelForIndex(
        version.phaseIndex
      )}${snippetBlock}</li>`;
    })
    .join('');

  protocolitoVersionHistory.innerHTML = `
    <details>
      <summary>Previous versions (${series.totalVersions || series.versions.length})</summary>
      <ul class="protocolito-history-list">
        ${historyItems}
      </ul>
    </details>
  `;
  protocolitoVersionHistory.classList.remove('hidden');
}

function resetProtocolitoSelection() {
  selectedProtocolitoSeriesId = '';
  if (protocolitoSeriesIdInput) {
    protocolitoSeriesIdInput.value = '';
  }
  if (protocolitoTitleInput) {
    protocolitoTitleInput.value = '';
    protocolitoTitleInput.disabled = false;
  }
  if (protocolitoVersionNotice) {
    protocolitoVersionNotice.textContent = '';
  }
  renderProtocolitoVersionHistory(null);
  renderProtocolitoLibrary();
}

function selectProtocolitoSeries(seriesId) {
  const series = protocolitoSeries.find((entry) => entry.seriesId === seriesId);
  if (!series) {
    resetProtocolitoSelection();
    return;
  }
  const seriesTitle = series.title || 'protocolito';
  selectedProtocolitoSeriesId = series.seriesId;
  if (protocolitoSeriesIdInput) {
    protocolitoSeriesIdInput.value = series.seriesId;
  }
  if (protocolitoTitleInput) {
    protocolitoTitleInput.value = series.title || '';
    protocolitoTitleInput.disabled = true;
  }
  if (protocolitoVersionNotice) {
    protocolitoVersionNotice.textContent = `Continuing as version ${
      (series.totalVersions || series.versions.length) + 1
    }.`;
  }
  renderProtocolitoVersionHistory(series);
  setProtocolitoStatus(`Continuing ${seriesTitle} with a new version.`);
  renderProtocolitoLibrary();
}

function renderProtocolitoLibraryCard(series, { allowSelect } = { allowSelect: false }) {
  if (!series) {
    return '';
  }
  const selectedClass = series.seriesId === selectedProtocolitoSeriesId ? ' selected' : '';
  const seriesTitle = series.displayTitle || series.title || 'Untitled protocolito';
  const latest = series.latest || series.versions[series.versions.length - 1] || null;
  const latestVersionLabel = latest?.version
    ? `Version ${latest.version}`
    : `Version ${series.versions.length}`;
  const latestPhaseLabel = latest ? phaseLabelForIndex(latest.phaseIndex) : 'Phase';
  const updatedLabel = latest?.timestamp ? new Date(latest.timestamp).toLocaleDateString() : '';
  const latestSnippet = latest ? truncateText(latest.text || '', 100) : '';
  const button = allowSelect
    ? `<button type="button" class="btn ghost sm" data-series-select="${series.seriesId}">
        Continue
      </button>`
    : '';
  const historyItems = series.versions
    .map((version) => {
      const snippet = truncateText(version.text || '', 90);
      const snippetBlock = snippet ? `<br><span>${escapeHTML(snippet)}</span>` : '';
      return `<li><strong>v${version.version}</strong> · ${phaseLabelForIndex(
        version.phaseIndex
      )}${snippetBlock}</li>`;
    })
    .join('');
  const historyBlock = historyItems
    ? `<details>
        <summary>Version log (${series.totalVersions || series.versions.length})</summary>
        <ul class="protocolito-history-list">
          ${historyItems}
        </ul>
      </details>`
    : '';

  const meta = [latestVersionLabel, latestPhaseLabel, updatedLabel].filter(Boolean).join(' · ');

  return `
    <article class="protocolito-library-card${selectedClass}">
      <h5>${escapeHTML(seriesTitle)}</h5>
      <p>${meta}</p>
      ${latestSnippet ? `<p>${escapeHTML(latestSnippet)}</p>` : ''}
      ${button}
      ${historyBlock}
    </article>
  `;
}

function renderProtocolitoLibrary() {
  if (!protocolitoExistingList || !protocolitoCurrentList) {
    return;
  }
  const selectedExists = protocolitoSeries.some(
    (series) => series.seriesId === selectedProtocolitoSeriesId
  );
  if (!selectedExists && selectedProtocolitoSeriesId) {
    selectedProtocolitoSeriesId = '';
    if (protocolitoSeriesIdInput) {
      protocolitoSeriesIdInput.value = '';
    }
    if (protocolitoTitleInput) {
      protocolitoTitleInput.disabled = false;
    }
    renderProtocolitoVersionHistory(null);
  } else if (selectedProtocolitoSeriesId) {
    const activeSeries = protocolitoSeries.find(
      (series) => series.seriesId === selectedProtocolitoSeriesId
    );
    if (activeSeries) {
      if (protocolitoTitleInput) {
        protocolitoTitleInput.value = activeSeries.title || '';
      }
      if (protocolitoVersionNotice) {
        protocolitoVersionNotice.textContent = `Continuing as version ${
          (activeSeries.totalVersions || activeSeries.versions.length) + 1
        }.`;
      }
      renderProtocolitoVersionHistory(activeSeries);
    }
  }

  const existing = protocolitoSeries.filter(
    (series) => (series.latest?.phaseIndex ?? -1) < phaseIndex
  );
  const current = protocolitoSeries.filter(
    (series) => (series.latest?.phaseIndex ?? -1) === phaseIndex
  );

  protocolitoExistingList.innerHTML = existing.length
    ? existing.map((series) => renderProtocolitoLibraryCard(series, { allowSelect: true })).join('')
    : '<p class="note">No previous protocolitos yet.</p>';

  protocolitoCurrentList.innerHTML = current.length
    ? current.map((series) => renderProtocolitoLibraryCard(series, { allowSelect: false })).join('')
    : '<p class="note">No drafts this phase.</p>';

  protocolitoExistingList.querySelectorAll('[data-series-select]').forEach((button) => {
    button.addEventListener('click', () => {
      const { seriesSelect } = button.dataset;
      selectProtocolitoSeries(seriesSelect);
    });
  });
}

function resolveProtocolitoTitle({ data, record, fallbackName }) {
  return (
    data?.implementationTitle ||
    data?.title ||
    record?.implementationTitle ||
    record?.title ||
    truncateText(record?.text || fallbackName || 'Protocolito', 80)
  );
}

function currentScenarioText() {
  return (draftEl.textContent || '').trim();
}

function setParticipantStatus(message = '') {
  participantStatus.textContent = message;
}

function setProtocolitoStatus(message = '') {
  protocolitoStatusEl.textContent = message;
}

function toggleParticipantControls(force) {
  const shouldShow =
    typeof force === 'boolean'
      ? force
      : participantControls.classList.contains('hidden');
  participantControls.classList.toggle('hidden', !shouldShow);
  if (!shouldShow) {
    participantForm.classList.add('hidden');
    participantForm.reset();
    setParticipantStatus('');
  }
}

function toggleProtocolitoControls(force) {
  const shouldShow =
    typeof force === 'boolean'
      ? force
      : protocolitoControls.classList.contains('hidden');
  protocolitoControls.classList.toggle('hidden', !shouldShow);
  if (!shouldShow) {
    protocolitoForm.reset();
    selectedProtocolParticipantIds = [];
    selectedSupportTargetIds = [];
    renderParticipantChips();
    renderSupportTargetChips();
    setProtocolitoStatus('');
    resetProtocolitoSelection();
  }
}

function renderTimeline() {
  if (!phases.length) {
    timelineBarEl.innerHTML =
      '<div class="timeline-phase active">Loading timeline…</div>';
    return;
  }

  timelineBarEl.innerHTML = phases
    .map((phase, index) => {
      const isActive = index === phaseIndex;
      return `<div class="timeline-phase ${isActive ? 'active' : ''}">
        ${escapeHTML(phase.label)} · ${escapeHTML(phase.duration)}
      </div>`;
    })
    .join('');
}

function renderParticipants() {
  if (!participants.length) {
    participantsListEl.classList.add('note');
    participantsListEl.textContent = 'No participants yet.';
    return;
  }

  participantsListEl.classList.remove('note');
  participantsListEl.innerHTML = participants
    .map((entry) => {
      const person = entry.participant || {};
      const badge = entry.mode === 'generated' ? 'Generated' : 'Player';
      const name = escapeHTML(person.name) || 'Unnamed participant';
      const conditionText =
        person.condition ||
        [person.physicalCondition, person.emotionalCondition].filter(Boolean).join(' / ') ||
        '';
      const careLoadText = extractCareLoad(person);
      const pronounsBlock = person.pronouns
        ? `<p class="participant-pronouns">${escapeHTML(person.pronouns)}</p>`
        : '';
      const capacitiesContent = careLoadText
        ? `<p>${formatText(careLoadText)}</p>`
        : '<p class="note">No availability notes yet.</p>';
      const conditionContent = conditionText
        ? `<p>${formatText(conditionText)}</p>`
        : '<p class="note">No condition shared yet.</p>';
      const statusContent = person.statusLog
        ? `<p>${formatText(person.statusLog)}</p>`
        : '<p class="note">No current status notes yet.</p>';
      const capacityBadge = `<span class="${capacityBadgeClass(person)}">${capacityLabel(
        person
      )}</span>`;
      const restNote =
        isParticipantResting(entry) && typeof person.restingUntilPhase === 'number'
          ? `<p class="note danger">Resting through ${phaseLabelForIndex(
              person.restingUntilPhase
            )}. They cannot join new protocolitos until then.</p>`
          : '';

      return `
        <article class="participant-card">
          <div class="participant-head">
            <h3>${name}</h3>
            <span class="badge">${badge}</span>
            ${capacityBadge}
          </div>
          ${pronounsBlock}
          ${restNote}
          <details class="participant-section">
            <summary>CAPABILITIES</summary>
            ${formatSkillsList(person.skills || '')}
          </details>
          <details class="participant-section">
            <summary>CAPACITIES</summary>
            ${capacitiesContent}
          </details>
          <details class="participant-section">
            <summary>CONDITION</summary>
            ${conditionContent}
          </details>
          <details class="participant-section">
            <summary>CURRENT STATUS</summary>
            ${statusContent}
          </details>
          <small class="participant-timestamp">Added ${new Date(entry.timestamp).toLocaleString()}</small>
        </article>
      `;
    })
    .join('');
}

function participantNameById(id) {
  const match = participants.find((entry) => entry.id === id);
  return match?.participant?.name || id;
}

function renderParticipantChips() {
  if (!protocolitoParticipantsEl) return;
  if (!participants.length) {
    protocolitoParticipantsEl.innerHTML =
      '<span class="note">Add participants first.</span>';
    return;
  }

  selectedProtocolParticipantIds = selectedProtocolParticipantIds.filter((id) => {
    const entry = participants.find((participant) => participant.id === id);
    return entry && !isParticipantResting(entry);
  });

  protocolitoParticipantsEl.innerHTML = participants
    .map((entry) => {
      const selected = selectedProtocolParticipantIds.includes(entry.id);
      const resting = isParticipantResting(entry);
      return `<button type="button" class="participant-chip ${
        selected ? 'selected' : ''
      } ${resting ? 'resting' : ''}" data-id="${entry.id}" ${
        resting ? 'disabled' : ''
      } title="${resting ? 'Resting due to burnout' : 'Toggle participant'}">
        ${escapeHTML(entry.participant?.name || entry.id)}
      </button>`;
    })
    .join('');

  protocolitoParticipantsEl.querySelectorAll('.participant-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const { id } = chip.dataset;
      if (selectedProtocolParticipantIds.includes(id)) {
        selectedProtocolParticipantIds = selectedProtocolParticipantIds.filter(
          (value) => value !== id
        );
      } else {
        selectedProtocolParticipantIds = [...selectedProtocolParticipantIds, id];
      }
      renderParticipantChips();
    });
  });
}

function renderSupportTargetChips() {
  if (!protocolitoSupportTargetsEl) {
    return;
  }

  const eligible = participants.filter((entry) => {
    const person = entry.participant || {};
    const level = (person.capacityLevel || '').toLowerCase();
    return level === 'resting' || level === 'low';
  });

  selectedSupportTargetIds = selectedSupportTargetIds.filter((id) =>
    eligible.some((entry) => entry.id === id)
  );

  if (!eligible.length) {
    protocolitoSupportTargetsEl.innerHTML =
      '<p class="note">No resting or low-capacity participants need support right now.</p>';
    return;
  }

  protocolitoSupportTargetsEl.innerHTML = eligible
    .map((entry) => {
      const selected = selectedSupportTargetIds.includes(entry.id);
      const badge = entry.participant.capacityLevel === 'resting' ? 'Resting' : 'Low capacity';
      return `<button type="button" class="participant-chip ${selected ? 'selected' : ''}" data-support-id="${
        entry.id
      }">
        ${escapeHTML(entry.participant?.name || entry.id)} <span class="chip-note">${badge}</span>
      </button>`;
    })
    .join('');

  protocolitoSupportTargetsEl.querySelectorAll('[data-support-id]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const { supportId } = chip.dataset;
      if (!supportId) {
        return;
      }
      if (selectedSupportTargetIds.includes(supportId)) {
        selectedSupportTargetIds = selectedSupportTargetIds.filter((value) => value !== supportId);
      } else {
        selectedSupportTargetIds = [...selectedSupportTargetIds, supportId];
      }
      renderSupportTargetChips();
    });
  });
}

function selectedParticipantDetails(limit = 6) {
  if (!selectedProtocolParticipantIds.length) return [];
  const idSet = new Set(selectedProtocolParticipantIds);
  return participants
    .filter((entry) => idSet.has(entry.id))
    .slice(0, limit)
    .map((entry) => {
      const person = entry.participant || {};
      return {
        id: entry.id,
        name: person.name || '',
        pronouns: person.pronouns || '',
        condition: person.condition || '',
        workload: person.workload || '',
        caretaking: person.caretaking || '',
        careLoad: person.careLoad || extractCareLoad(person) || '',
        skills: person.skills || ''
      };
    });
}

function renderProtocolitos() {
  if (!protocolitos.length) {
    protocolitosListEl.classList.add('note');
    protocolitosListEl.textContent = 'No protocolitos yet.';
    return;
  }

  protocolitosListEl.classList.remove('note');
  protocolitosListEl.innerHTML = protocolitos
    .map((entry) => {
      const names = entry.participantIds
        .map((id) => escapeHTML(participantNameById(id)))
        .join(', ');
      const lastRecord = entry.evaluations?.length
        ? entry.evaluations[entry.evaluations.length - 1]
        : null;
      const implementationData = implementationByProtocolito[entry.id] || lastRecord || null;
      const implementationDetails =
        buildImplementationDetails(implementationData) ||
        `<details class="protocolito-implementation">
          <summary>Implementation result</summary>
          <p class="note">Implementation pending for this phase.</p>
        </details>`;
      const protocolitoTitle = resolveProtocolitoTitle({
        data: implementationData,
        record: entry,
        fallbackName: names
      });
      const versionChip =
        typeof entry.version === 'number'
          ? `<span class="protocolito-version-chip">v${entry.version}</span>`
          : '';
      const participantsLabel = names || 'Unnamed constellation';
      const supportTargets = Array.isArray(entry.supportTargets) ? entry.supportTargets : [];
      const supportNames = supportTargets
        .map((id) => escapeHTML(participantNameById(id)))
        .filter(Boolean)
        .join(', ');
      const supportBlock = supportTargets.length
        ? `<p class="protocolito-support">Support targets: ${supportNames}</p>`
        : '';
      const originalDetails = (entry.text || '').trim()
        ? `<details class="protocolito-original">
            <summary>Original protocolito</summary>
            <p>${formatText(entry.text)}</p>
          </details>`
        : '';

      return `
        <article class="protocolito-card">
          <div class="protocolito-card-head">
            <div>
              <h3>${escapeHTML(protocolitoTitle)} ${versionChip}</h3>
              <p class="protocolito-participants">${participantsLabel}</p>
              ${supportBlock}
            </div>
          </div>
          ${originalDetails}
          ${implementationDetails}
          <small>${new Date(entry.timestamp).toLocaleString()}</small>
        </article>
      `;
    })
    .join('');
}

function renderProtocolitoResults() {
  if (!lastEvaluation) {
    protocolitoResultsEl.classList.add('hidden');
    protocolitoSummaryEl.innerHTML = '';
    renderCapabilitiesMap();
    return;
  }

  protocolitoResultsEl.classList.remove('hidden');
  const protocolitoCards = (lastEvaluation.protocolitos || [])
    .map((item) => {
      const participantNames = Array.isArray(item.participantNames) && item.participantNames.length
        ? item.participantNames.map((name) => escapeHTML(name)).join(', ')
        : (item.participantIds || [])
            .map((id) => escapeHTML(participantNameById(id)))
            .join(', ');
      const implementationDetails =
        buildImplementationDetails(item) ||
        `<details class="protocolito-implementation">
          <summary>Implementation result</summary>
          <p class="note">Implementation pending for this phase.</p>
        </details>`;
      const protocolitoTitle = resolveProtocolitoTitle({
        data: item,
        record: item,
        fallbackName: participantNames
      });
      const versionChip =
        typeof item.version === 'number'
          ? `<span class="protocolito-version-chip">v${item.version}</span>`
          : '';
      const supportTargets = Array.isArray(item.supportTargets) ? item.supportTargets : [];
      const supportNames = supportTargets
        .map((id) => escapeHTML(participantNameById(id)))
        .filter(Boolean)
        .join(', ');
      const supportBlock = supportTargets.length
        ? `<p class="protocolito-support">Support targets: ${supportNames}</p>`
        : '';
      const originalDetails = (item.text || '').trim()
        ? `<details class="protocolito-original">
            <summary>Original protocolito</summary>
            <p>${formatText(item.text)}</p>
          </details>`
        : '';

      return `
        <div class="result-card">
          <div class="protocolito-card-head">
            <div>
              <h4>${escapeHTML(protocolitoTitle)} ${versionChip}</h4>
              <p class="protocolito-participants">${participantNames || 'Unnamed constellation'}</p>
              ${supportBlock}
            </div>
          </div>
          ${originalDetails}
          ${implementationDetails}
        </div>
      `;
    })
    .join('');

  protocolitoSummaryEl.innerHTML = `
    ${
      lastEvaluation.phaseBrief
        ? `<p class="phase-brief">${formatText(lastEvaluation.phaseBrief)}</p>`
        : '<p class="note">Phase summary pending.</p>'
    }
    <details class="phase-results-details">
      <summary>See detailed phase results</summary>
      <div class="phase-results-details-body">
        ${protocolitoCards}
        ${
          lastEvaluation.updatedScenario
            ? `<div class="result-card">${escapeHTML(lastEvaluation.updatedScenario)}</div>`
            : ''
        }
        ${
          lastEvaluation.pocasSummary
            ? `<div class="result-card">${escapeHTML(lastEvaluation.pocasSummary)}</div>`
            : ''
        }
        ${
          lastEvaluation.collectiveCapabilities
            ? `<div class="result-card">${escapeHTML(lastEvaluation.collectiveCapabilities)}</div>`
            : ''
        }
        ${
          lastEvaluation.phaseReflection
            ? `<div class="result-card">${escapeHTML(lastEvaluation.phaseReflection)}</div>`
            : ''
        }
      </div>
    </details>
  `;
  renderCapabilitiesMap();
}

function renderCapabilitiesMap() {
  if (!capabilitiesSummaryEl || !capabilitiesHighlightsEl) {
    return;
  }

  if (!lastEvaluation) {
    if (capabilitiesIntroEl) {
      capabilitiesIntroEl.textContent = currentPhaseLabel
        ? `${currentPhaseLabel}: advance a phase to map the commons.`
        : 'Advance a phase to surface the pocas products and services.';
    }
    capabilitiesSummaryEl.innerHTML =
      '<p class="note">Advance to the next phase to map the products and services keeping pocas alive.</p>';
    capabilitiesHighlightsEl.innerHTML =
      '<p class="note">Protocolito outcomes will appear here after evaluations.</p>';
    if (capabilitiesSpreadEl) {
      capabilitiesSpreadEl.classList.add('hidden');
    }
    return;
  }

  if (capabilitiesIntroEl) {
    capabilitiesIntroEl.textContent = 'Latest commons snapshot from the most recent evaluation.';
  }

  const summaryText =
    (lastEvaluation.collectiveCapabilities || lastEvaluation.pocasSummary || '').trim();
  capabilitiesSummaryEl.innerHTML = summaryText
    ? `<p>${formatText(summaryText)}</p>`
    : '<p class="note">No collective capability notes captured in the last evaluation.</p>';

  const spreadScore = computeSpreadScore(lastEvaluation.protocolitos || []);
  if (capabilitiesSpreadEl) {
    if (spreadScore === null) {
      capabilitiesSpreadEl.classList.add('hidden');
    } else {
      capabilitiesSpreadEl.classList.remove('hidden');
      if (spreadFillEl) {
        spreadFillEl.style.width = `${spreadScore}%`;
      }
      if (spreadScoreLabelEl) {
        spreadScoreLabelEl.textContent = `${spreadScore}%`;
      }
    }
  }

  const highlights = Array.isArray(lastEvaluation.protocolitos)
    ? lastEvaluation.protocolitos.slice(0, 4).map(buildCapabilityCard).join('')
    : '';
  capabilitiesHighlightsEl.innerHTML =
    highlights ||
    '<p class="note">Add protocolitos and evaluate a phase to surface concrete services.</p>';
}

async function loadState() {
  try {
    const response = await fetch('/api/state');
    if (!response.ok) throw new Error('Failed to load state.');
    const payload = await response.json();
    phases = Array.isArray(payload.phases) ? payload.phases : [];
    phaseIndex = typeof payload.phaseIndex === 'number' ? payload.phaseIndex : 0;
    const currentPhase = payload.currentPhase || null;
    if (currentPhase) {
      const parts = [];
      if (currentPhase.label) {
        parts.push(currentPhase.label);
      }
      if (currentPhase.duration) {
        parts.push(currentPhase.duration);
      }
      currentPhaseLabel = parts.join(' · ');
    } else {
      currentPhaseLabel = '';
    }
    participants = Array.isArray(payload.participants) ? payload.participants : [];
    protocolitos = Array.isArray(payload.protocolitos) ? payload.protocolitos : [];
    protocolitoSeries = Array.isArray(payload.protocolitoSeries) ? payload.protocolitoSeries : [];
    lastEvaluation = payload.lastEvaluation || null;
    implementationByProtocolito = {};
    if (lastEvaluation?.protocolitos) {
      lastEvaluation.protocolitos.forEach((item) => {
        if (item?.id) {
          implementationByProtocolito[item.id] = item;
        }
      });
    }

    if (
      (!currentScenarioText() || currentScenarioText() === scenarioPlaceholder) &&
      payload.scenario
    ) {
      draftEl.textContent = payload.scenario;
    }

    renderTimeline();
    renderParticipants();
    renderParticipantChips();
    renderSupportTargetChips();
    renderProtocolitos();
    renderProtocolitoLibrary();
    renderProtocolitoResults();
    if (!lastEvaluation) {
      renderCapabilitiesMap();
    }
  } catch (error) {
    console.error(error);
    setProtocolitoStatus('State failed to load. Try refreshing.');
  }
}

async function requestSetting() {
  generateBtn.disabled = true;
  draftEl.textContent = 'Generating Setting';

  try {
    const response = await fetch('/api/setting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty: difficultySelect.value })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || 'Failed to generate setting.');
    }

    const payload = await response.json();
    if (Array.isArray(payload.axes)) {
      console.info('Axis rolls:', payload.axes);
    }
    if (payload.difficulty) {
      console.info('Difficulty:', payload.difficulty);
    }
    draftEl.textContent = payload.draft;
  } catch (err) {
    console.error(err);
    draftEl.textContent = 'The engine stumbled. Check the server log.';
  } finally {
    generateBtn.disabled = false;
  }
}

function buildParticipantPayload(formData) {
  const carework = formData.get('carework') || '';
  return {
    name: formData.get('name') || '',
    pronouns: formData.get('pronouns') || '',
    condition: formData.get('condition') || '',
    skills: formData.get('skills') || '',
    workload: carework,
    caretaking: carework,
    careLoad: carework
  };
}

async function submitManualParticipant(event) {
  event.preventDefault();
  const scenario = currentScenarioText();
  if (!scenario || scenario === scenarioPlaceholder) {
    setParticipantStatus('Generate a scenario before adding participants.');
    return;
  }

  const formData = new FormData(participantForm);
  if (!formData.get('name')) {
    setParticipantStatus('Name is required.');
    return;
  }

  setParticipantStatus('Saving participant…');
  participantForm.querySelectorAll('input, textarea, button').forEach((el) => {
    el.disabled = true;
  });

  try {
    const response = await fetch('/api/participant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'manual',
        scenario,
        participant: buildParticipantPayload(formData)
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || 'Failed to save participant.');
    }

    const payload = await response.json();
    if (payload.participant) {
      participants.unshift(payload.participant);
      renderParticipants();
      renderParticipantChips();
      renderSupportTargetChips();
      participantForm.reset();
      participantForm.classList.add('hidden');
      setParticipantStatus('Participant recorded.');
    }
  } catch (error) {
    console.error(error);
    setParticipantStatus(error.message || 'Failed to save participant.');
  } finally {
    participantForm.querySelectorAll('input, textarea, button').forEach((el) => {
      el.disabled = false;
    });
  }
}

async function requestGeneratedParticipant() {
  const scenario = currentScenarioText();
  if (!scenario || scenario === scenarioPlaceholder) {
    setParticipantStatus('Generate a scenario before requesting characters.');
    return;
  }

  participantGenerateBtn.disabled = true;
  setParticipantStatus('Generating character…');

  try {
    const response = await fetch('/api/participant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'generate', scenario })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || 'Failed to generate participant.');
    }

    const payload = await response.json();
    if (payload.participant) {
      participants.unshift(payload.participant);
      renderParticipants();
      renderParticipantChips();
      renderSupportTargetChips();
      setParticipantStatus('Generated participant added.');
    }
  } catch (error) {
    console.error(error);
    setParticipantStatus(error.message || 'Failed to generate participant.');
  } finally {
    participantGenerateBtn.disabled = false;
  }
}

async function submitProtocolito(event) {
  event.preventDefault();
  const scenario = currentScenarioText();
  if (!scenario || scenario === scenarioPlaceholder) {
    setProtocolitoStatus('Generate a scenario before adding protocolitos.');
    return;
  }

  if (!selectedProtocolParticipantIds.length) {
    setProtocolitoStatus('Select at least one participant.');
    return;
  }

  const text = (event.target.protocolitoText.value || '').trim();
  if (!text) {
    setProtocolitoStatus('Protocolito text is required.');
    return;
  }

  const seriesIdValue = (protocolitoSeriesIdInput?.value || '').trim();
  const titleValue = (protocolitoTitleInput?.value || '').trim();

  if (!seriesIdValue && !titleValue) {
    setProtocolitoStatus('Title is required for new protocolitos.');
    return;
  }

  setProtocolitoStatus('Saving protocolito…');
  protocolitoForm.querySelectorAll('textarea, button').forEach((el) => {
    el.disabled = true;
  });

  try {
    const body = {
      participants: selectedProtocolParticipantIds,
      text,
      scenario,
      supportTargets: selectedSupportTargetIds
    };
    if (seriesIdValue) {
      body.seriesId = seriesIdValue;
    } else {
      body.title = titleValue;
    }

    const response = await fetch('/api/protocolito', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || 'Failed to save protocolito.');
    }

    const payload = await response.json();
    if (payload.protocolito) {
      await loadState();
      toggleProtocolitoControls(false);
      selectedSupportTargetIds = [];
      setProtocolitoStatus('Protocolito recorded.');
    }
  } catch (error) {
    console.error(error);
    setProtocolitoStatus(error.message || 'Failed to save protocolito.');
  } finally {
    protocolitoForm.querySelectorAll('textarea, button').forEach((el) => {
      el.disabled = false;
    });
  }
}

async function requestProtocolitoHelp() {
  const scenario = currentScenarioText();
  if (!scenario || scenario === scenarioPlaceholder) {
    setProtocolitoStatus('Generate a scenario before requesting help.');
    return;
  }

  if (!selectedProtocolParticipantIds.length) {
    setProtocolitoStatus('Select participants to ground the helper request.');
    return;
  }

  const characters = selectedParticipantDetails(8);
  if (!characters.length) {
    setProtocolitoStatus('Could not load the selected participants. Refresh and try again.');
    return;
  }

  if (protocolitoHelpBtn) {
    protocolitoHelpBtn.disabled = true;
  }
  setProtocolitoStatus('Asking the local AI to draft a protocolito…');

  try {
    const response = await fetch('/api/protocolito/help', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, characters })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || 'Failed to request helper draft.');
    }

    const payload = await response.json();
    const suggestion = (payload.suggestion || '').trim();
    if (!suggestion) {
      throw new Error('Helper did not return a draft.');
    }

    if (protocolitoForm?.protocolitoText) {
      protocolitoForm.protocolitoText.value = suggestion;
      protocolitoForm.protocolitoText.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setProtocolitoStatus('Draft added. Edit or save when ready.');
  } catch (error) {
    console.error(error);
    setProtocolitoStatus(error.message || 'Failed to request helper draft.');
  } finally {
    if (protocolitoHelpBtn) {
      protocolitoHelpBtn.disabled = false;
    }
  }
}

async function advancePhase() {
  advancePhaseBtn.disabled = true;
  setProtocolitoStatus('Evaluating protocolitos…');

  try {
    const response = await fetch('/api/advance-phase', {
      method: 'POST'
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || 'Failed to advance phase.');
    }

    const payload = await response.json();
    lastEvaluation = payload.report || null;
    implementationByProtocolito = {};
    if (lastEvaluation?.protocolitos) {
      lastEvaluation.protocolitos.forEach((item) => {
        if (item?.id) {
          implementationByProtocolito[item.id] = item;
        }
      });
    }
    renderProtocolitoResults();
    setProtocolitoStatus('Phase advanced. Review the updated scenario.');
    await loadState();
  } catch (error) {
    console.error(error);
    setProtocolitoStatus(error.message || 'Failed to advance phase.');
  } finally {
    advancePhaseBtn.disabled = false;
  }
}

generateBtn.addEventListener('click', requestSetting);
addParticipantBtn.addEventListener('click', () => toggleParticipantControls());
participantCreateBtn.addEventListener('click', () => {
  participantForm.classList.toggle('hidden', false);
  setParticipantStatus('Describe your participant using the prompts below.');
});
participantCancelBtn.addEventListener('click', () => {
  participantForm.reset();
  participantForm.classList.add('hidden');
  setParticipantStatus('');
});
participantForm.addEventListener('submit', submitManualParticipant);
participantGenerateBtn.addEventListener('click', requestGeneratedParticipant);

addProtocolitoBtn.addEventListener('click', () => {
  toggleProtocolitoControls(true);
  resetProtocolitoSelection();
  renderParticipantChips();
  renderSupportTargetChips();
});
protocolitoCancelBtn.addEventListener('click', () => {
  toggleProtocolitoControls(false);
  resetProtocolitoSelection();
});
protocolitoForm.addEventListener('submit', submitProtocolito);
if (protocolitoHelpBtn) {
  protocolitoHelpBtn.addEventListener('click', requestProtocolitoHelp);
}
if (protocolitoStartNewBtn) {
  protocolitoStartNewBtn.addEventListener('click', () => {
    resetProtocolitoSelection();
    setProtocolitoStatus('Starting a new protocolito.');
    selectedSupportTargetIds = [];
    renderSupportTargetChips();
  });
}
advancePhaseBtn.addEventListener('click', advancePhase);
if (clearParticipantsBtn) {
  clearParticipantsBtn.addEventListener('click', async () => {
    if (!window.confirm('Delete all players? This cannot be undone.')) {
      return;
    }
    clearParticipantsBtn.disabled = true;
    setParticipantStatus('Deleting all participants…');
    try {
      const response = await fetch('/api/participants', { method: 'DELETE' });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Failed to delete participants.');
      }
      await loadState();
      setParticipantStatus('Participants cleared.');
    } catch (error) {
      console.error(error);
      setParticipantStatus(error.message || 'Failed to delete participants.');
    } finally {
      clearParticipantsBtn.disabled = false;
    }
  });
}

if (resetGameBtn) {
  resetGameBtn.addEventListener('click', async () => {
    if (
      !window.confirm(
        'Reset the entire game? This clears scenarios, participants, and protocolitos.'
      )
    ) {
      return;
    }
    resetGameBtn.disabled = true;
    setParticipantStatus('Resetting game…');
    setProtocolitoStatus('Resetting game…');
    try {
      const response = await fetch('/api/reset', { method: 'POST' });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Failed to reset game.');
      }
      draftEl.textContent = scenarioPlaceholder;
      lastEvaluation = null;
      renderProtocolitoResults();
      renderCapabilitiesMap();
      await loadState();
      setParticipantStatus('Game reset.');
      setProtocolitoStatus('Game reset.');
    } catch (error) {
      console.error(error);
      setParticipantStatus(error.message || 'Failed to reset game.');
      setProtocolitoStatus(error.message || 'Failed to reset game.');
    } finally {
      resetGameBtn.disabled = false;
    }
  });
}

loadState();
