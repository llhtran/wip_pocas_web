const TYPEWRITER_DELAY_MS = 60;
const PERIOD_PAUSE_MS = 350;
const POST_TEXT_PAUSE_MS = 1800;

const IMAGE_REVEAL_DELAY_MS = 1000;
const STICKER_DELAY_AFTER_IMAGE_MS = 2800;
const STICKER_REVEAL_DELAY_FROM_LOAD_MS = IMAGE_REVEAL_DELAY_MS + STICKER_DELAY_AFTER_IMAGE_MS;

const STICKER_CORNERS = ['corner-top-left', 'corner-top-right'];

const PRONOUN_FORMS = {
  they: {
    subject: 'They',
    object: 'them',
    possessive: 'their',
    be: 'are',
    wantVerb: 'want',
    giftVerb: 'gift'
  },
  he: {
    subject: 'He',
    object: 'him',
    possessive: 'his',
    be: 'is',
    wantVerb: 'wants',
    giftVerb: 'gifts'
  },
  she: {
    subject: 'She',
    object: 'her',
    possessive: 'her',
    be: 'is',
    wantVerb: 'wants',
    giftVerb: 'gifts'
  }
};

const NAME_BANK = [
  { name: 'Pablo', pronouns: ['they', 'he'] },
  { name: 'Javier', pronouns: ['he'] },
  { name: 'Laura', pronouns: ['she'] },
  { name: 'Rok', pronouns: ['they', 'he'] },
  { name: 'Lien', pronouns: ['she'] }
];

const SCRIPT_SLIDES = [
  ({ name, pronoun }) => ({
    image: '/media/slides/01-img.png',
    sticker: '/media/slides/01-sticker.png',
    text: `Just before leaving your house, you receive a message from ${name}, your anarchist friend. ${pronoun.subject} ${pronoun.be} making deliveries in your neighbourhood and ${pronoun.wantVerb} to tell you something.`
  }),
  ({ name, pronoun }) => ({
    image: '/media/slides/02-img.png',
    sticker: '/media/slides/02-sticker.png',
    text: `${pronoun.subject} ${pronoun.giftVerb} you a candy you've never seen before. "It's a chocobomba. I made it," ${name} says enthusiastically. It is covered in a chili crust so spicy it burns your fingertips.`
  }),
  () => ({
    image: '/media/slides/03-img.png',
    sticker: '/media/slides/03-sticker.png',
    text: 'You eat it... A heat wave sets your tongue on fire. It hurts! But the intense pain is immediately followed by a soothing, bitter-sweet chocolate core melting inside your mouth.'
  }),
  ({ name }) => ({
    image: '/media/slides/04-img.png',
    sticker: '/media/slides/04-sticker.png',
    text: `You\'ve never had something like that before... "Masochist candy from the new pocas," ${name} says.`
  }),
  () => ({
    image: '/media/slides/05-img.png',
    sticker: '/media/slides/05-sticker.png',
    text: 'You\'ve heard rumors of this new "mutualist" model for autonomous spaces called "pocas" (poca organización colaborativa de auto-servicio). It seems a few have already spawned across the city.'
  }),
  ({ name }) => ({
    image: '/media/slides/06-img.png',
    sticker: '/media/slides/06-sticker.png',
    text: `${name} tells you pocas has no owners, employees or pre-defined rules. Instead, participants create their own "protocolitos" to self-organize and satisfy each other's needs.`
  }),
  () => ({
    image: '/media/slides/07-img.png',
    sticker: '/media/slides/07-sticker.png',
    text: 'pocas has an ambitious goal: Build a network of spaces that can make mutualist practices as convenient, if not more, than their capitalist counterpart.'
  }),
  ({ name }) => ({
    image: '/media/slides/08-img.png',
    sticker: null,
    text: `${name} hands you a cute pocas sticker with a pink cockroach. There is a handwritten location and time for a meet-up on the back. It's tomorrow... You want to go.`
  })
];

function randomItem(list) {
  if (!Array.isArray(list) || !list.length) {
    return null;
  }
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

export function pickRandomIdentity() {
  const base = randomItem(NAME_BANK) || NAME_BANK[0];
  const pronounKey = randomItem(base.pronouns) || base.pronouns[0];
  const pronoun = PRONOUN_FORMS[pronounKey] || PRONOUN_FORMS.they;
  return {
    name: base.name,
    pronounKey,
    pronoun
  };
}

export function prepareSlides(identity) {
  return SCRIPT_SLIDES.map((composeSlide) => composeSlide(identity));
}

function delay(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hideImageInstant(imageEl) {
  imageEl.style.transition = 'none';
  imageEl.classList.remove('visible');
  // Force reflow so the next transition still applies
  // eslint-disable-next-line no-unused-expressions
  imageEl.offsetHeight;
  imageEl.style.transition = '';
}

function loadSlideImage(instance, source) {
  const { imageEl } = instance;
  if (!imageEl) {
    return Promise.resolve();
  }

  hideImageInstant(imageEl);
  if (!source) {
    imageEl.removeAttribute('src');
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const settle = () => {
      imageEl.removeEventListener('load', settle);
      imageEl.removeEventListener('error', settle);
      setTimeout(() => {
        requestAnimationFrame(() => {
          imageEl.classList.add('visible');
        });
      }, IMAGE_REVEAL_DELAY_MS);
      resolve();
    };

    if (imageEl.getAttribute('src') === source && imageEl.complete) {
      settle();
      return;
    }

    imageEl.addEventListener('load', settle, { once: true });
    imageEl.addEventListener('error', settle, { once: true });
    imageEl.setAttribute('src', source);
  });
}

function hideStickerInstant(stickerEl) {
  if (!stickerEl) {
    return;
  }
  stickerEl.style.transition = 'none';
  stickerEl.classList.remove('visible');
  // eslint-disable-next-line no-unused-expressions
  stickerEl.offsetHeight;
  stickerEl.style.transition = '';
}

function resetStickerState(instance) {
  const { stickerEl } = instance;
  if (!stickerEl) {
    return;
  }
  hideStickerInstant(stickerEl);
  STICKER_CORNERS.forEach((cornerClass) => stickerEl.classList.remove(cornerClass));
  stickerEl.removeAttribute('src');
  stickerEl.style.left = '';
  stickerEl.style.right = '';
  stickerEl.style.top = '';
}

function pickStickerCorner(previousCorner) {
  if (!STICKER_CORNERS.length) {
    return null;
  }
  if (STICKER_CORNERS.length === 1) {
    return STICKER_CORNERS[0];
  }
  if (previousCorner) {
    const filtered = STICKER_CORNERS.filter((corner) => corner !== previousCorner);
    if (filtered.length) {
      return randomItem(filtered);
    }
  }
  return randomItem(STICKER_CORNERS);
}

function applyStickerCorner(stickerEl, corner) {
  if (!stickerEl) {
    return;
  }
  STICKER_CORNERS.forEach((cornerClass) => stickerEl.classList.remove(cornerClass));
  if (corner) {
    stickerEl.classList.add(corner);
  }
}

function positionStickerAtCorner(instance, corner) {
  const { container, textEl, stickerEl } = instance;
  if (!container || !textEl || !stickerEl || !corner) {
    return;
  }
  const containerRect = container.getBoundingClientRect();
  const textRect = textEl.getBoundingClientRect();
  if (!textRect.width || !textRect.height) {
    return;
  }
  const stickerRect = stickerEl.getBoundingClientRect();
  const stickerWidth = stickerRect.width || stickerEl.naturalWidth || 0;
  const stickerHeight = stickerRect.height || stickerEl.naturalHeight || 0;
  const topBase = textRect.top - containerRect.top;
  const leftBase = textRect.left - containerRect.left;
  const rightBase = containerRect.right - textRect.right;
  const topOffset = Math.max(0, topBase - stickerHeight * 0.45);
  stickerEl.style.top = `${topOffset}px`;
  if (corner === 'corner-top-left') {
    const leftOffset = Math.max(0, leftBase - stickerWidth * 0.35);
    stickerEl.style.left = `${leftOffset}px`;
    stickerEl.style.right = '';
  } else {
    const rightOffset = Math.max(0, rightBase - stickerWidth * 0.35);
    stickerEl.style.right = `${rightOffset}px`;
    stickerEl.style.left = '';
  }
}

function loadStickerAsset(instance, source, corner) {
  const { stickerEl } = instance;
  if (!stickerEl || !source) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const settle = () => {
      stickerEl.removeEventListener('load', settle);
      stickerEl.removeEventListener('error', settle);
      requestAnimationFrame(() => {
        positionStickerAtCorner(instance, corner);
        stickerEl.classList.add('visible');
      });
      resolve();
    };

    if (stickerEl.getAttribute('src') === source && stickerEl.complete) {
      settle();
      return;
    }

    stickerEl.addEventListener('load', settle, { once: true });
    stickerEl.addEventListener('error', settle, { once: true });
    stickerEl.setAttribute('src', source);
  });
}

function revealStickerAfterImage(instance, source) {
  if (!instance?.stickerEl || !source) {
    return Promise.resolve();
  }
  const corner = pickStickerCorner(instance.lastStickerCorner);
  instance.lastStickerCorner = corner;
  applyStickerCorner(instance.stickerEl, corner);
  return delay(STICKER_REVEAL_DELAY_FROM_LOAD_MS).then(() => loadStickerAsset(instance, source, corner));
}

function typeTextWithCaret(instance, text = '') {
  const { textEl } = instance;
  if (!textEl) {
    return Promise.resolve();
  }

  textEl.classList.remove('is-paused');
  textEl.textContent = '';

  const chars = text.split('');
  if (!chars.length) {
    textEl.classList.add('is-paused');
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let index = 0;
    const render = () => {
      textEl.textContent = text.slice(0, index + 1);
      const currentChar = chars[index];
      index += 1;
      if (index < chars.length) {
        const extraDelay = currentChar === '.' ? PERIOD_PAUSE_MS : 0;
        setTimeout(render, TYPEWRITER_DELAY_MS + extraDelay);
      } else {
        textEl.classList.add('is-paused');
        resolve();
      }
    };

    render();
  });
}

async function displaySlide(instance, slide) {
  if (!slide) {
    return;
  }
  resetStickerState(instance);
  await loadSlideImage(instance, slide.image);
  const stickerPromise = revealStickerAfterImage(instance, slide.sticker);
  await typeTextWithCaret(instance, slide.text);
  await stickerPromise;
  await delay(POST_TEXT_PAUSE_MS);
}

function resetSlideState(instance) {
  const { imageEl, textEl } = instance;
  if (textEl) {
    textEl.classList.add('is-paused');
    textEl.textContent = '';
  }
  if (imageEl) {
    hideImageInstant(imageEl);
    imageEl.removeAttribute('src');
  }
  resetStickerState(instance);
  if (instance) {
    instance.lastStickerCorner = null;
  }
}

function hideSlideshow(instance) {
  const { container } = instance;
  if (!container) {
    return Promise.resolve();
  }

  container.classList.remove('visible');
  return new Promise((resolve) => {
    const settle = () => {
      container.removeEventListener('transitionend', settle);
      container.classList.add('hidden');
      resetSlideState(instance);
      resolve();
    };
    container.addEventListener('transitionend', settle, { once: true });
    setTimeout(settle, 600);
  });
}

export class IntroSlideshow {
  constructor({ container, imageEl, stickerEl, textEl, onSlideStart }) {
    this.container = container || null;
    this.imageEl = imageEl || null;
    this.stickerEl = stickerEl || null;
    this.textEl = textEl || null;
    this.onSlideStart = typeof onSlideStart === 'function' ? onSlideStart : null;
    this.lastStickerCorner = null;
    if (typeof window !== 'undefined') {
      this.handleResize = () => {
        if (
          this.stickerEl &&
          this.lastStickerCorner &&
          this.stickerEl.classList.contains('visible')
        ) {
          positionStickerAtCorner(this, this.lastStickerCorner);
        }
      };
      window.addEventListener('resize', this.handleResize);
      window.addEventListener('orientationchange', this.handleResize);
    }
  }

  async run(slides) {
    if (!this.container || !this.textEl || !Array.isArray(slides) || !slides.length) {
      return;
    }
    this.container.classList.remove('hidden');
    requestAnimationFrame(() => {
      this.container.classList.add('visible');
    });

    for (const [index, slide] of slides.entries()) {
      if (this.onSlideStart) {
        this.onSlideStart({ index, total: slides.length, slide });
      }
      // eslint-disable-next-line no-await-in-loop
      await displaySlide(this, slide);
    }

    await hideSlideshow(this);
  }

  hide() {
    return hideSlideshow(this);
  }
}

