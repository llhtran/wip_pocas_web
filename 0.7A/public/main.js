import { IntroSlideshow, pickRandomIdentity, prepareSlides } from './slideshow.js';
import { fadeOutIntroMusicNow, playIntroMusicOnce, startAmbientLoop, startSongPlaylistLoop } from './soundtrack.js';

const startButton = document.getElementById('startButton');
const statusLine = document.getElementById('statusLine');
const difficultySelect = document.getElementById('difficultySelect');
const settingScreen = document.getElementById('settingScreen');
const settingText = document.getElementById('settingText');
const settingImageFrame = document.getElementById('settingImageFrame');
const settingImageEl = document.getElementById('settingImage');
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
const slideSticker = document.getElementById('slideSticker');
const slideText = document.getElementById('slideText');
const skipIntroBtn = document.getElementById('skipIntroBtn');
const intentionsInput = document.getElementById('participantIntentions');
const toggleIntentionsBtn = document.getElementById('toggleIntentionsBtn');
const startPocasContainer = document.getElementById('startPocasContainer');
const startPocasBtn = document.getElementById('startPocasBtn');
const pocasHelpButton = document.getElementById('pocasHelpButton');
const helpIcon = document.getElementById('helpIcon');
const helpChatBubble = document.getElementById('helpChatBubble');
const pocasLink = document.getElementById('pocasLink');
const pocasIframeContainer = document.getElementById('pocasIframeContainer');
const pocasIframe = document.getElementById('pocasIframe');
const pocasIframeHeader = document.getElementById('pocasIframeHeader');
const pocasIframeResizeHandle = document.getElementById('pocasIframeResizeHandle');
const closePocasIframe = document.getElementById('closePocasIframe');
const creditsLink = document.getElementById('creditsLink');
const creditsContainer = document.getElementById('creditsContainer');
const creditsHeader = document.getElementById('creditsHeader');
const creditsResizeHandle = document.getElementById('creditsResizeHandle');
const closeCredits = document.getElementById('closeCredits');
const settingsLink = document.getElementById('settingsLink');
const pocasSection = document.getElementById('pocasSection');
const pocasTimerDisplay = document.getElementById('pocasTimerDisplay');
const pocasRoundNumber = document.getElementById('pocasRoundNumber');
const pocasRoundName = document.getElementById('pocasRoundName');
const pocasRoundDuration = document.getElementById('pocasRoundDuration');

const introSlideshowInstance = new IntroSlideshow({
  container: introSlideshow,
  imageEl: slideImage,
  stickerEl: slideSticker,
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
let squishSound = null;
let intentionsHidden = true;
let currentRoundIndex = 0;
let roundTimerInterval = null;
let roundTimerRemainingSeconds = 0;
let pocasSessionActive = false;

const roundSchedule = [
  { label: 'ROUND 01', name: 'Getting Started', duration: 'Duration: 3 months', timerMinutes: 9, accentColor: '#32cd32' },
  { label: 'ROUND 02', name: 'Deep Alignment', duration: 'Duration: 2 months', timerMinutes: 9, accentColor: '#ff42b4' },
  { label: 'ROUND 03', name: 'Operational Sprint', duration: 'Duration: 6 weeks', timerMinutes: 9, accentColor: '#32cd32' },
  { label: 'ROUND 04', name: 'Review & Adapt', duration: 'Duration: 1 month', timerMinutes: 9, accentColor: '#32cd32' }
];

const DEFAULT_ROUND_TIMER_MINUTES = 9;
const SETTING_IMAGE_BASE_PATH = '/media/settings';
const SETTING_IMAGE_SETS = {
  '1-2': createSettingImageList(6),
  '2-3': createSettingImageList(5),
  '3-4': createSettingImageList(4),
  '4-5_collapse': createSettingImageList(5),
  '4-5_corporate_fascist': createSettingImageList(3)
};

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

function pickRandomItem(list) {
  if (!Array.isArray(list) || !list.length) {
    return null;
  }
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

function createSettingImageList(total = 0) {
  return Array.from({ length: total }, (_, index) => `${index + 1}.png`);
}

function getAxisScore(axes, key) {
  if (!Array.isArray(axes)) {
    return 0;
  }
  const match = axes.find((axis) => axis?.key === key);
  const value = Number(match?.score);
  return Number.isFinite(value) ? value : 0;
}

function averageAxisScore(axes) {
  if (!Array.isArray(axes) || !axes.length) {
    return 0;
  }
  const total = axes.reduce((sum, axis) => {
    const value = Number(axis?.score);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  return total / axes.length;
}

function selectHighTensionFolder(axes) {
  const collapseScore = getAxisScore(axes, 'environmentalCollapse');
  const hegemonyScore = getAxisScore(axes, 'capitalistHegemony');
  const authoritarianScore = getAxisScore(axes, 'authoritarianState');
  if (collapseScore >= hegemonyScore && collapseScore >= authoritarianScore) {
    return '4-5_collapse';
  }
  return '4-5_corporate_fascist';
}

function selectSettingImageFolder(axes) {
  if (!Array.isArray(axes) || !axes.length) {
    return null;
  }
  const meanScore = averageAxisScore(axes);
  if (meanScore < 2) {
    return '1-2';
  }
  if (meanScore < 3) {
    return '2-3';
  }
  if (meanScore < 4) {
    return '3-4';
  }
  return selectHighTensionFolder(axes);
}

function resolveSettingImageSource(axes) {
  const folder = selectSettingImageFolder(axes);
  if (!folder) {
    return null;
  }
  const catalog = SETTING_IMAGE_SETS[folder];
  if (!Array.isArray(catalog) || !catalog.length) {
    return null;
  }
  const filename = pickRandomItem(catalog);
  if (!filename) {
    return null;
  }
  return `${SETTING_IMAGE_BASE_PATH}/${folder}/${filename}`;
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

function loadSquishSound() {
  if (!squishSound) {
    squishSound = new Audio('/media/sounds/help/squish.wav');
    squishSound.preload = 'auto';
    squishSound.volume = 0.75;
  }
}

function playSquishSound() {
  if (!squishSound) {
    loadSquishSound();
  }
  if (squishSound) {
    squishSound.currentTime = 0;
    squishSound.play().catch(() => {});
  }
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

function clearSettingImage() {
  if (!settingImageFrame || !settingImageEl) {
    return;
  }
  settingImageEl.removeAttribute('src');
  settingImageFrame.classList.add('hidden');
}

function updateSettingImage(axes) {
  if (!settingImageFrame || !settingImageEl) {
    return;
  }
  const source = resolveSettingImageSource(axes);
  if (!source) {
    clearSettingImage();
    return;
  }
  settingImageEl.setAttribute('src', source);
  settingImageFrame.classList.remove('hidden');
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
      const motivationLevelRaw = (entry.motivationLevel || 'medium').toLowerCase();
      const motivationLevelKey = motivationLevelRaw.replace(/\s+/g, '-');
      const motivationLabel = motivationLevelKey
        .split('-')
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
      const motivationBadge = `<span class="motivation-badge level-${motivationLevelKey}">${escapeHTML(
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
  participantsScreen?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  updateSettingImage(payload.axes);
  console.info('Initial setting draft', payload);
  return payload;
}

async function handleStart() {
  if (!startButton) return;
  startButton.disabled = true;
  setStatus('Contacting the local AI…');
  clearSettingImage();
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
    clearSettingImage();
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
    playIntroMusicOnce();
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
    fadeOutIntroMusicNow();
    revealPocasSection();
    pocasSessionActive = true;
    startAmbientLoop();
    startSongPlaylistLoop();
    startRoundTimer(currentRoundIndex);
    // Apply the accent color for the first round when pocas starts
    renderRoundInfo(currentRoundIndex);
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

if (helpIcon) {
  helpIcon.addEventListener('click', (event) => {
    event.stopPropagation();
    playSquishSound();
    if (helpChatBubble) {
      helpChatBubble.classList.toggle('visible');
    }
  });
  
  helpIcon.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      playSquishSound();
      if (helpChatBubble) {
        helpChatBubble.classList.toggle('visible');
      }
    }
  });
}

// Close chat bubble when clicking outside
if (helpChatBubble) {
  helpChatBubble.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  
  document.addEventListener('click', (event) => {
    if (helpChatBubble && helpChatBubble.classList.contains('visible')) {
      if (!helpIcon.contains(event.target) && !helpChatBubble.contains(event.target)) {
        helpChatBubble.classList.remove('visible');
      }
    }
  });
}

if (pocasLink) {
  pocasLink.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    playButtonSound();
    if (pocasIframeContainer) {
      pocasIframeContainer.classList.remove('hidden');
      if (helpChatBubble) {
        helpChatBubble.classList.remove('visible');
      }
    }
  });
}

if (creditsLink) {
  creditsLink.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    playButtonSound();
    if (creditsContainer) {
      creditsContainer.classList.remove('hidden');
      if (helpChatBubble) {
        helpChatBubble.classList.remove('visible');
      }
    }
  });
}

if (closeCredits) {
  closeCredits.addEventListener('click', () => {
    playButtonSound();
    if (creditsContainer) {
      creditsContainer.classList.add('hidden');
    }
  });
}

if (settingsLink) {
  settingsLink.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    playButtonSound();
    // Settings functionality to be implemented later
  });
}

if (closePocasIframe) {
  closePocasIframe.addEventListener('click', () => {
    playButtonSound();
    if (pocasIframeContainer) {
      pocasIframeContainer.classList.add('hidden');
    }
  });
}

// Make iframe draggable
if (pocasIframeHeader && pocasIframeContainer) {
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

  pocasIframeHeader.addEventListener('mousedown', (event) => {
    if (event.target === closePocasIframe || closePocasIframe.contains(event.target)) {
      return;
    }
    initialX = event.clientX - xOffset;
    initialY = event.clientY - yOffset;

    if (event.target === pocasIframeHeader || pocasIframeHeader.contains(event.target)) {
      isDragging = true;
      pocasIframeContainer.classList.add('dragging');
    }
  });

  document.addEventListener('mousemove', (event) => {
    if (isDragging) {
      event.preventDefault();
      currentX = event.clientX - initialX;
      currentY = event.clientY - initialY;

      xOffset = currentX;
      yOffset = currentY;

      pocasIframeContainer.style.transform = `translate(calc(-50% + ${currentX}px), calc(-50% + ${currentY}px))`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      initialX = currentX;
      initialY = currentY;
      isDragging = false;
      pocasIframeContainer.classList.remove('dragging');
    }
  });
}

// Make iframe resizable
if (pocasIframeResizeHandle && pocasIframeContainer) {
  let isResizing = false;
  let startX;
  let startY;
  let startWidth;
  let startHeight;

  pocasIframeResizeHandle.addEventListener('mousedown', (event) => {
    isResizing = true;
    startX = event.clientX;
    startY = event.clientY;
    startWidth = parseInt(document.defaultView.getComputedStyle(pocasIframeContainer).width, 10);
    startHeight = parseInt(document.defaultView.getComputedStyle(pocasIframeContainer).height, 10);
    pocasIframeContainer.classList.add('dragging');
    event.preventDefault();
  });

  document.addEventListener('mousemove', (event) => {
    if (isResizing) {
      const width = startWidth + event.clientX - startX;
      const height = startHeight + event.clientY - startY;
      
      const minWidth = 300;
      const minHeight = 300;
      const maxWidth = window.innerWidth * 0.9;
      const maxHeight = window.innerHeight * 0.9;
      
      const newWidth = Math.max(minWidth, Math.min(maxWidth, width));
      const newHeight = Math.max(minHeight, Math.min(maxHeight, height));
      
      pocasIframeContainer.style.width = `${newWidth}px`;
      pocasIframeContainer.style.height = `${newHeight}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      pocasIframeContainer.classList.remove('dragging');
    }
  });
}

// Make credits window draggable
if (creditsHeader && creditsContainer) {
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

  creditsHeader.addEventListener('mousedown', (event) => {
    if (event.target === closeCredits || closeCredits.contains(event.target)) {
      return;
    }
    initialX = event.clientX - xOffset;
    initialY = event.clientY - yOffset;

    if (event.target === creditsHeader || creditsHeader.contains(event.target)) {
      isDragging = true;
      creditsContainer.classList.add('dragging');
    }
  });

  document.addEventListener('mousemove', (event) => {
    if (isDragging) {
      event.preventDefault();
      currentX = event.clientX - initialX;
      currentY = event.clientY - initialY;

      xOffset = currentX;
      yOffset = currentY;

      creditsContainer.style.transform = `translate(calc(-50% + ${currentX}px), calc(-50% + ${currentY}px))`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      initialX = currentX;
      initialY = currentY;
      isDragging = false;
      creditsContainer.classList.remove('dragging');
    }
  });
}

// Make credits window resizable
if (creditsResizeHandle && creditsContainer) {
  let isResizing = false;
  let startX;
  let startY;
  let startWidth;
  let startHeight;

  creditsResizeHandle.addEventListener('mousedown', (event) => {
    isResizing = true;
    startX = event.clientX;
    startY = event.clientY;
    startWidth = parseInt(document.defaultView.getComputedStyle(creditsContainer).width, 10);
    startHeight = parseInt(document.defaultView.getComputedStyle(creditsContainer).height, 10);
    creditsContainer.classList.add('dragging');
    event.preventDefault();
  });

  document.addEventListener('mousemove', (event) => {
    if (isResizing) {
      const width = startWidth + event.clientX - startX;
      const height = startHeight + event.clientY - startY;
      
      const minWidth = 300;
      const minHeight = 300;
      const maxWidth = window.innerWidth * 0.9;
      const maxHeight = window.innerHeight * 0.9;
      
      const newWidth = Math.max(minWidth, Math.min(maxWidth, width));
      const newHeight = Math.max(minHeight, Math.min(maxHeight, height));
      
      creditsContainer.style.width = `${newWidth}px`;
      creditsContainer.style.height = `${newHeight}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      creditsContainer.classList.remove('dragging');
    }
  });
}

function getRoundTimerMinutes(index = currentRoundIndex) {
  const minutes = roundSchedule[index]?.timerMinutes;
  if (typeof minutes === 'number' && minutes > 0) {
    return minutes;
  }
  return 9 // default round timer minutes;
}

function updateTimerDisplay() {
  if (!pocasTimerDisplay) return;
  const safeTime = Math.max(0, roundTimerRemainingSeconds);
  pocasTimerDisplay.classList.remove('hidden');
  const minutes = String(Math.floor(safeTime / 60)).padStart(2, '0');
  const seconds = String(safeTime % 60).padStart(2, '0');
  pocasTimerDisplay.textContent = `${minutes}:${seconds}`;
}

function stopRoundTimer() {
  if (roundTimerInterval) {
    clearInterval(roundTimerInterval);
    roundTimerInterval = null;
  }
}

function startRoundTimer(index = currentRoundIndex) {
  stopRoundTimer();
  roundTimerRemainingSeconds = getRoundTimerMinutes(index) * 60;
  updateTimerDisplay();
  roundTimerInterval = setInterval(() => {
    roundTimerRemainingSeconds -= 1;
    if (roundTimerRemainingSeconds <= 0) {
      roundTimerRemainingSeconds = 0;
      updateTimerDisplay();
      stopRoundTimer();
      return;
    }
    updateTimerDisplay();
  }, 1000);
}

function primeRoundTimerDisplay(index = currentRoundIndex) {
  roundTimerRemainingSeconds = getRoundTimerMinutes(index) * 60;
  updateTimerDisplay();
}

function renderRoundInfo(index = 0) {
  if (!pocasRoundNumber || !pocasRoundName || !pocasRoundDuration) return;
  const safeIndex = Math.max(0, Math.min(roundSchedule.length - 1, index));
  const round = roundSchedule[safeIndex] || roundSchedule[0];
  pocasRoundNumber.textContent = round.label;
  pocasRoundName.textContent = round.name;
  pocasRoundDuration.textContent = round.duration;
  currentRoundIndex = safeIndex;
  
  // Update accent color for the round (only if pocas session is active)
  if (pocasSessionActive && round.accentColor) {
    document.documentElement.style.setProperty('--accent-color', round.accentColor);
  }
}

renderRoundInfo(0);
primeRoundTimerDisplay(0);
if (typeof window !== 'undefined') {
  window.pocasRounds = {
    renderRoundInfo,
    advanceRound,
    startRoundTimer,
    stopRoundTimer,
    primeRoundTimerDisplay,
    get schedule() {
      return roundSchedule.slice();
    }
  };
}

loadButtonSounds();
loadSquishSound();
applyIntentionsMask();
toggleStartPocasAvailability();

