import { IntroSlideshow, pickRandomIdentity, prepareSlides } from './slideshow.js';

const startButton = document.getElementById('startButton');
const statusLine = document.getElementById('statusLine');
const difficultySelect = document.getElementById('difficultySelect');
const settingScreen = document.getElementById('settingScreen');
const settingText = document.getElementById('settingText');
const introduceBtn = document.getElementById('introduceBtn');
const introParticipantForm = document.getElementById('introParticipantForm');
const participantsScreen = document.getElementById('participantsScreen');
const capabilityInput = document.getElementById('capabilityInput');
const addCapabilityBtn = document.getElementById('addCapabilityBtn');
const capabilityList = document.getElementById('capabilityList');
const shareParticipantBtn = document.getElementById('shareParticipantBtn');
const participantsList = document.getElementById('participantsList');
const participantsHeading = document.getElementById('participantsHeading');
const meetingBtn = document.getElementById('meetingBtn');
const introSlideshow = document.getElementById('introSlideshow');
const slideImage = document.getElementById('slideImage');
const slideText = document.getElementById('slideText');
const skipIntroBtn = document.getElementById('skipIntroBtn');
const intentionsInput = document.getElementById('participantIntentions');
const toggleIntentionsBtn = document.getElementById('toggleIntentionsBtn');
const startPocasContainer = document.getElementById('startPocasContainer');
const startPocasBtn = document.getElementById('startPocasBtn');
const pocasHelpButton = document.getElementById('pocasHelpButton');
const pocasSection = document.getElementById('pocasSection');

const introSlideshowInstance = new IntroSlideshow({
  container: introSlideshow,
  imageEl: slideImage,
  textEl: slideText,
  onSlideStart: ({ index, total }) => {
    if (index === total - 1 && introSlideshow?.classList.contains('visible')) {
      revealSettingScreen();
    }
  }
});

let latestSetting = null;
let selectedDifficulty = difficultySelect?.value || 'gentle';
let capabilityItems = [];
let participantEntries = [];
let buttonSounds = [];
let buttonSoundIndex = 0;
let soundsPreloaded = false;
let intentionsHidden = true;

function escapeHTML(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setStatus(message) {
  if (statusLine) {
    statusLine.textContent = message || '';
  }
}

function shuffleArray(list) {
  const array = list.slice();
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function loadButtonSounds() {
  const sources = ['/media/sounds/buttons/1.wav', '/media/sounds/buttons/2.wav', '/media/sounds/buttons/3.wav', '/media/sounds/buttons/4.wav'];
  buttonSounds = shuffleArray(
    sources
      .map((source) => {
        const audio = new Audio(source);
        audio.preload = 'auto';
        audio.volume = 0.75;
        return audio;
      })
      .filter(Boolean)
  );
  buttonSoundIndex = 0;
  soundsPreloaded = true;
}

function playButtonSound() {
  if (!soundsPreloaded) {
    loadButtonSounds();
  }

  if (!buttonSounds.length) {
    return;
  }
  const audio = buttonSounds[buttonSoundIndex];
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }
  buttonSoundIndex = (buttonSoundIndex + 1) % buttonSounds.length;
}

function applyIntentionsMask() {
  if (!intentionsInput || !toggleIntentionsBtn) return;
  intentionsInput.classList.toggle('is-hidden', intentionsHidden);
  toggleIntentionsBtn.textContent = intentionsHidden ? 'Show' : 'Hide';
}

function difficultyToAPI(value) {
  const map = {
    gentle: 'easy',
    demanding: 'moderate',
    harsh: 'difficult'
  };
  return map[value] || 'moderate';
}

function revealSettingScreen() {
  if (!settingScreen) return;
  settingScreen.classList.remove('hidden');
  settingScreen.classList.add('visible');
  settingScreen.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function revealParticipantsScreen() {
  if (!participantsScreen) return;
  participantsScreen.classList.remove('hidden');
}

function updateSettingText(text) {
  if (settingText) {
    settingText.textContent = text || 'The local AI could not return a scenario.';
  }
}

function showSkipButton() {
  if (!skipIntroBtn) return;
  skipIntroBtn.classList.remove('hidden');
  requestAnimationFrame(() => {
    skipIntroBtn.classList.add('visible');
  });
}

function hideSkipButton() {
  if (!skipIntroBtn) return;
  skipIntroBtn.classList.remove('visible');
  skipIntroBtn.classList.add('hidden');
}

function showParticipantForm() {
  if (!introParticipantForm) return;
  introParticipantForm.classList.remove('hidden');
  const nameField = document.getElementById('participantName');
  if (nameField) {
    nameField.focus();
  }
  introParticipantForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  playButtonSound();
}

function renderCapabilityList() {
  if (!capabilityList) return;
  if (!capabilityItems.length) {
    capabilityList.innerHTML = '';
    return;
  }
  capabilityList.innerHTML = capabilityItems
    .map(
      (item, index) =>
        `<li><span>${escapeHTML(item)}</span><button type="button" data-remove="${index}" aria-label="Remove ${escapeHTML(
          item
        )}">×</button></li>`
    )
    .join('');

  capabilityList.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      const idx = Number(button.dataset.remove);
      capabilityItems = capabilityItems.filter((_, i) => i !== idx);
      renderCapabilityList();
    });
  });
}

function addCapability(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return;
  capabilityItems = [...capabilityItems, trimmed];
  renderCapabilityList();
  if (capabilityInput) {
    capabilityInput.value = '';
    capabilityInput.focus();
  }
}

function clearParticipantForm() {
  introParticipantForm?.reset();
  capabilityItems = [];
  renderCapabilityList();
  intentionsHidden = true;
  applyIntentionsMask();
}

function renderParticipantsCards() {
  if (!participantsList) return;
  if (!participantEntries.length) {
    participantsList.innerHTML = '';
    if (participantsHeading) {
      participantsHeading.classList.add('hidden');
    }
    toggleStartPocasAvailability();
    return;
  }
  if (participantsHeading) {
    participantsHeading.classList.remove('hidden');
  }

  participantsList.innerHTML = participantEntries
    .map((entry) => {
      const conditionBlock = entry.condition
        ? `<p class="field-block"><strong>Condition</strong><br>${escapeHTML(entry.condition)}</p>`
        : '';
      const capacitiesList = Array.isArray(entry.capacities) ? entry.capacities : [];
      const capacitiesBlock = capacitiesList.length
        ? `<div class="field-block">
            <strong>Capacities</strong><br>
            <ul>${capacitiesList.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>
          </div>`
        : '';
      const availabilityBlock = entry.availability
        ? `<p class="field-block"><strong>Availability</strong><br>${escapeHTML(entry.availability)}</p>`
        : '';
      const intentionsBlock = entry.intentions
        ? `<p class="field-block"><strong>Intentions</strong><br>${escapeHTML(entry.intentions)}</p>`
        : '';
      const motivationLevel = (entry.motivationLevel || 'medium').toLowerCase();
      const motivationLabel =
        motivationLevel.charAt(0).toUpperCase() + motivationLevel.slice(1);
      const motivationBadge = `<span class="motivation-badge level-${motivationLevel}">${escapeHTML(
        motivationLabel
      )}</span>`;
      const pronounText = entry.pronouns ? ` (${escapeHTML(entry.pronouns)})` : '';
      return `
        <article class="participant-card">
          <div class="participant-card-head">
            <h3>${escapeHTML(entry.name || 'Unnamed')}${pronounText}</h3>
            <div class="motivation-chip">
              <span class="motivation-label">Motivation:</span>
              <br />
              ${motivationBadge}
            </div>
          </div>
          <details>
            <summary>See details</summary>
            ${
              conditionBlock || capacitiesBlock || availabilityBlock || intentionsBlock
                ? `${conditionBlock}${capacitiesBlock}${availabilityBlock}${intentionsBlock}`
                : '<p>No details shared yet.</p>'
            }
          </details>
        </article>
      `;
    })
    .join('');

  toggleStartPocasAvailability();
}

function toggleStartPocasAvailability() {
  if (!startPocasContainer || !startPocasBtn) return;
  const hasMinimumParticipants = participantEntries.length >= 2;
  startPocasContainer.classList.toggle('hidden', !hasMinimumParticipants);
  startPocasBtn.disabled = !hasMinimumParticipants;
}

function revealPocasSection() {
  if (!pocasSection) return;
  pocasSection.classList.remove('hidden');
  requestAnimationFrame(() => {
    pocasSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function handleShareParticipant() {
  if (!introParticipantForm) return;

  if (!introParticipantForm.reportValidity()) {
    setStatus('Please complete all required fields.');
    return;
  }

  const name = document.getElementById('participantName')?.value.trim() || '';
  const pronouns = document.getElementById('participantPronouns')?.value.trim() || '';
  const condition = document.getElementById('participantCondition')?.value.trim() || '';
  const capacities = document.getElementById('participantCapacities')?.value.trim() || '';
  const intentions = intentionsInput?.value.trim() || '';

  if (!capabilityItems.length) {
    setStatus('Add at least one capacity.');
    return;
  }

  const entry = {
    name: name || 'Anonymous participant',
    pronouns,
    condition,
    availability: capacities,
    capacities: capabilityItems.slice(),
    intentions,
    motivationLevel: 'medium'
  };

  participantEntries = [entry, ...participantEntries];
  renderParticipantsCards();

  try {
    const response = await fetch('/api/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });

    if (response.ok) {
      const data = await response.json();
      if (data?.entry) {
        participantEntries[0] = data.entry;
        renderParticipantsCards();
      }
    }
  } catch (error) {
    console.error('Failed to save participant', error);
  }

  clearParticipantForm();
  introParticipantForm.classList.add('hidden');
  playButtonSound();
}

async function requestSetting(level) {
  const response = await fetch('/api/setting', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ difficulty: difficultyToAPI(level) })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to generate setting.');
  }

  const payload = await response.json();
  latestSetting = payload;
  updateSettingText(payload.draft || '');
  console.info('Initial setting draft', payload);
  return payload;
}

async function handleStart() {
  if (!startButton) return;
  startButton.disabled = true;
  setStatus('Contacting the local AI…');
  let slideshowPromise = Promise.resolve();

  try {
    const identity = pickRandomIdentity();
    const slides = prepareSlides(identity);
    slideshowPromise = introSlideshowInstance.run(slides);
    const payload = await requestSetting(selectedDifficulty);

    if (payload?.draft) {
      setStatus('Setting prepared.');
    } else {
      setStatus('Setting prepared, but no draft returned.');
    }

    revealSettingScreen();
    revealParticipantsScreen();
    showSkipButton();
    await slideshowPromise;
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Something went wrong.');
    introSlideshowInstance.hide();
    hideSkipButton();
  } finally {
    try {
      await slideshowPromise;
    } catch (error) {
      console.warn('Unable to finish slideshow cleanly.', error);
    }
    hideSkipButton();
    startButton.disabled = false;
  }
}

if (startButton) {
  startButton.addEventListener('click', (event) => {
    playButtonSound();
    handleStart(event);
  });
}

if (difficultySelect) {
  difficultySelect.addEventListener('change', (event) => {
    playButtonSound();
    selectedDifficulty = event.target.value || 'gentle';
  });
}

if (introduceBtn) {
  introduceBtn.addEventListener('click', () => {
    playButtonSound();
    showParticipantForm();
  });
}

if (addCapabilityBtn && capabilityInput) {
  addCapabilityBtn.addEventListener('click', () => {
    playButtonSound();
    addCapability(capabilityInput.value);
  });

  capabilityInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      playButtonSound();
      addCapability(capabilityInput.value);
    }
  });
}

if (shareParticipantBtn) {
  shareParticipantBtn.addEventListener('click', () => {
    playButtonSound();
    handleShareParticipant();
  });
}

if (meetingBtn && participantsScreen) {
  meetingBtn.addEventListener('click', () => {
    playButtonSound();
    participantsScreen.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

if (skipIntroBtn) {
  skipIntroBtn.addEventListener('click', () => {
    playButtonSound();
    introSlideshowInstance.hide();
    hideSkipButton();
  });
}

if (toggleIntentionsBtn) {
  toggleIntentionsBtn.addEventListener('click', () => {
    intentionsHidden = !intentionsHidden;
    applyIntentionsMask();
    playButtonSound();
  });
}

if (startPocasBtn) {
  startPocasBtn.addEventListener('click', () => {
    playButtonSound();
    revealPocasSection();
  });
}

if (pocasHelpButton) {
  pocasHelpButton.addEventListener('click', () => {
    playButtonSound();
    const helpWindow = window.open('https://pocas.store', '_blank', 'noopener,noreferrer');
    if (helpWindow) {
      helpWindow.opener = null;
    }
  });
}

loadButtonSounds();
applyIntentionsMask();
toggleStartPocasAvailability();

