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
const protocolitoStatusEl = document.getElementById('protocolitoStatus');
const protocolitoCancelBtn = document.getElementById('protocolitoCancelBtn');
const protocolitosListEl = document.getElementById('protocolitosList');
const advancePhaseBtn = document.getElementById('advancePhaseBtn');
const protocolitoResultsEl = document.getElementById('protocolitoResults');
const protocolitoSummaryEl = document.getElementById('protocolitoSummary');
const clearParticipantsBtn = document.getElementById('clearParticipantsBtn');
const resetGameBtn = document.getElementById('resetGameBtn');

const scenarioPlaceholder = 'Request a draft to see results.';
let participants = [];
let protocolitos = [];
let phases = [];
let phaseIndex = 0;
let selectedProtocolParticipantIds = [];
let lastEvaluation = null;
let evaluationByProtocolito = {};

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
    renderParticipantChips();
    setProtocolitoStatus('');
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
      const scenario = entry.scenario || '';
      const snippet =
        scenario.length > 180 ? `${scenario.slice(0, 180).trim()}…` : scenario;
      const conditionText =
        person.condition ||
        [person.physicalCondition, person.emotionalCondition].filter(Boolean).join(' / ') ||
        '';

      return `
        <article class="participant-card">
          <div class="badge">${badge}</div>
          <h3>${escapeHTML(person.name) || 'Unnamed participant'}</h3>
          ${
            person.pronouns
              ? `<p><strong>Pronouns:</strong> ${escapeHTML(person.pronouns)}</p>`
              : ''
          }
          ${
            conditionText
              ? `<p><strong>Condition:</strong> ${escapeHTML(conditionText)}</p>`
              : ''
          }
          ${
            person.workload
              ? `<p><strong>Workload:</strong> ${escapeHTML(person.workload)}</p>`
              : ''
          }
          ${
            person.caretaking
              ? `<p><strong>Caretaking:</strong> ${escapeHTML(person.caretaking)}</p>`
              : ''
          }
          ${
            person.skills
              ? `<p><strong>Skills:</strong> ${escapeHTML(person.skills)}</p>`
              : ''
          }
          <small>${new Date(entry.timestamp).toLocaleString()}${
            snippet ? ` · Scenario: ${escapeHTML(snippet)}` : ''
          }</small>
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

  protocolitoParticipantsEl.innerHTML = participants
    .map((entry) => {
      const selected = selectedProtocolParticipantIds.includes(entry.id);
      return `<button type="button" class="participant-chip ${
        selected ? 'selected' : ''
      }" data-id="${entry.id}">
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
      const lastEvaluation = entry.evaluations?.length
        ? entry.evaluations[entry.evaluations.length - 1]
        : null;
      const evalData = evaluationByProtocolito[entry.id];
      const effects =
        evalData && Array.isArray(evalData.effects) && evalData.effects.length
          ? `<ul>${evalData.effects.map((effect) => `<li>${escapeHTML(effect)}</li>`).join('')}</ul>`
          : '';
      const evalBlock = evalData
        ? `
            <details class="protocolito-eval">
              <summary>Evaluation</summary>
              ${
                evalData.status
                  ? `<p><strong>Status:</strong> ${formatText(
                      evalData.status.charAt(0).toUpperCase() + evalData.status.slice(1)
                    )}</p>`
                  : ''
              }
              ${
                evalData.initialEvaluation
                  ? `<p><strong>Design verdict:</strong> ${formatText(evalData.initialEvaluation)}</p>`
                  : ''
              }
              ${
                evalData.capacityAssessment
                  ? `<p><strong>Capacity:</strong> ${formatText(evalData.capacityAssessment)}</p>`
                  : ''
              }
              ${
                evalData.finalOutcome
                  ? `<p><strong>Outcome:</strong> ${formatText(evalData.finalOutcome)}</p>`
                  : ''
              }
              ${effects}
              ${
                !evalData.initialEvaluation &&
                !evalData.capacityAssessment &&
                !evalData.finalOutcome &&
                evalData.narrative
                  ? `<p>${escapeHTML(evalData.narrative)}</p>`
                  : ''
              }
            </details>
          `
        : '';

      return `
        <article class="protocolito-card">
          <h3>${names || 'Unnamed constellation'}</h3>
          <p>${formatText(entry.text)}</p>
          ${
            lastEvaluation
              ? `<p><strong>Outcome:</strong> ${formatText(lastEvaluation.finalOutcome || '')}</p>`
              : ''
          }
          ${evalBlock}
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
      const effects =
        Array.isArray(item.effects) && item.effects.length
          ? `<ul>${item.effects.map((effect) => `<li>${escapeHTML(effect)}</li>`).join('')}</ul>`
          : '';

      return `
        <div class="result-card">
          <h4>${participantNames || 'Unnamed constellation'}</h4>
          ${
            item.text
              ? `<p><strong>Protocolito:</strong> ${formatText(item.text)}</p>`
              : `<p><strong>Protocolito:</strong> ${formatText(item.id)}</p>`
          }
          ${
            item.initialEvaluation
              ? `<p><strong>Design verdict:</strong> ${formatText(item.initialEvaluation)}</p>`
              : ''
          }
          ${
            item.capacityAssessment
              ? `<p><strong>Capacity:</strong> ${formatText(item.capacityAssessment)}</p>`
              : ''
          }
          ${
            item.finalOutcome
              ? `<p><strong>Outcome:</strong> ${formatText(item.finalOutcome)}</p>`
              : ''
          }
          ${effects}
          ${
            !item.initialEvaluation &&
            !item.capacityAssessment &&
            !item.finalOutcome &&
            item.narrative
              ? `<p>${formatText(item.narrative)}</p>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  protocolitoSummaryEl.innerHTML = `
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
  `;
}

async function loadState() {
  try {
    const response = await fetch('/api/state');
    if (!response.ok) throw new Error('Failed to load state.');
    const payload = await response.json();
    phases = Array.isArray(payload.phases) ? payload.phases : [];
    phaseIndex = typeof payload.phaseIndex === 'number' ? payload.phaseIndex : 0;
    participants = Array.isArray(payload.participants) ? payload.participants : [];
    protocolitos = Array.isArray(payload.protocolitos) ? payload.protocolitos : [];
    lastEvaluation = payload.lastEvaluation || null;
    evaluationByProtocolito = {};
    if (lastEvaluation?.protocolitos) {
      lastEvaluation.protocolitos.forEach((item) => {
        if (item?.id) {
          evaluationByProtocolito[item.id] = item;
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
    renderProtocolitos();
    renderProtocolitoResults();
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
  return {
    name: formData.get('name') || '',
    pronouns: formData.get('pronouns') || '',
    condition: formData.get('condition') || '',
    workload: formData.get('workload') || '',
    caretaking: formData.get('caretaking') || '',
    skills: formData.get('skills') || ''
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

  setProtocolitoStatus('Saving protocolito…');
  protocolitoForm.querySelectorAll('textarea, button').forEach((el) => {
    el.disabled = true;
  });

  try {
    const response = await fetch('/api/protocolito', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participants: selectedProtocolParticipantIds,
        text,
        scenario
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || 'Failed to save protocolito.');
    }

    const payload = await response.json();
    if (payload.protocolito) {
      protocolitos.unshift(payload.protocolito);
      renderProtocolitos();
      toggleProtocolitoControls(false);
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
    if (payload.updatedScenario) {
      draftEl.textContent = payload.updatedScenario;
    }
    lastEvaluation = payload.report || null;
    evaluationByProtocolito = {};
    if (lastEvaluation?.protocolitos) {
      lastEvaluation.protocolitos.forEach((item) => {
        if (item?.id) {
          evaluationByProtocolito[item.id] = item;
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
  renderParticipantChips();
});
protocolitoCancelBtn.addEventListener('click', () => toggleProtocolitoControls(false));
protocolitoForm.addEventListener('submit', submitProtocolito);
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
