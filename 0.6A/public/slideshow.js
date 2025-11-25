const TYPEWRITER_DELAY_MS = 60;
const PERIOD_PAUSE_MS = 350;
const POST_TEXT_PAUSE_MS = 1800;

const IMAGE_REVEAL_DELAY_MS = 1000;

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
    image: '/media/slides/slide-01.svg',
    text: `On your way back home, you receive a message from ${name}, your anarchist friend. ${pronoun.subject} ${pronoun.be} making deliveries in your neighbourhood and ${pronoun.wantVerb} to tell you something.`
  }),
  ({ name, pronoun }) => ({
    image: '/media/slides/slide-02.png',
    text: `${pronoun.subject} ${pronoun.giftVerb} you a candy you've never seen before. "It's a chocobomba. I made it," ${name} says enthusiastically. It is covered in a chili crust so spicy it burns your fingertips.`
  }),
  () => ({
    image: '/media/slides/slide-03.svg',
    text: 'You eat it... A fiery punch sets your tounge on fire. It hurts! But the intense heat is immediately followed by a delicious, bitter-sweet chocolate core that melts inside your mouth, calming the pain.'
  }),
  ({ name }) => ({
    image: '/media/slides/slide-04.svg',
    text: `You have never had something like that before... "Masochist candy from the new pocas," ${name} says.`
  }),
  () => ({
    image: '/media/slides/slide-05.png',
    text: 'You\'ve heard rumors of this strange new "mutualist" model for autonomous spaces called "pocas" (poca organización colaborativa de auto-servicio).\n It seems a few have already spawned across the city.'
  }),
  ({ name }) => ({
    image: '/media/slides/slide-06.png',
    text: `${name} tells you pocas has no owners, employees or pre-established rules. Instead, participants create their own "protocolitos" for self-organizing to satisfy each other's needs.`
  }),
  () => ({
    image: '/media/slides/slide-07.svg',
    text: 'pocas has an ambitious goal: Build a network of spaces that can make mutualist practices as convenient, if not more, than their capitalist counterpart.'
  }),
  ({ name }) => ({
    image: '/media/slides/slide-08.svg',
    text: `${name} hands you a cute pocas sticker with a pink cockroach. There is a handwritten location and time for a local meet-up on the back. It's tomorrow. You want to go.`
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
  await loadSlideImage(instance, slide.image);
  await typeTextWithCaret(instance, slide.text);
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
  constructor({ container, imageEl, textEl, onSlideStart }) {
    this.container = container || null;
    this.imageEl = imageEl || null;
    this.textEl = textEl || null;
    this.onSlideStart = typeof onSlideStart === 'function' ? onSlideStart : null;
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

