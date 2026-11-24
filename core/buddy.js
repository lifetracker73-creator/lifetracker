// 🍄 Buddy (REFINE-2, REFINE-3): the little doodle friend, redrawn in soft pastels.
// Round body, spotted cap with a pom-pom, big shiny eyes, tiny "o" mouth and two feet.
// Moves gently (bob, blink, pom-pom wiggle); 'sleepy' mood closes its eyes with z z z; .hop() is a
// happy jump with a sparkle. All movement stops if the phone asks for reduced motion.
// REFINE-3: you can name it (Settings → 🍄 Your buddy), it wears an outfit for each module and its
// face follows your day (e.g. hungry with no food logged, happier as food is added).
//
// buddy({ size: 72, mood: 'idle', outfit: 'food', face: 'hungry' }) → element with .setMood, .setFace, .hop
// celebrate('Goal reached! 💧')  → the buddy pops up, hops and cheers for a moment
// screenBuddy('food')            → the small buddy card at the top of a module screen (added by the router)
// buddyMood('hungry', '{name} is hungry!') → change that card's face and line ({name} = the buddy's name)

import { getSettings, saveSettings } from './storage.js';

// ---------- Name ----------
let buddyName = '';
const nameReady = getSettings('buddy', { name: '' })
  .then((s) => { buddyName = (s.name || '').trim(); })
  .catch((err) => console.error(err));

/** The buddy's name, or '' when it has none yet. */
export async function getBuddyName() {
  await nameReady;
  return buddyName;
}

/** Save a new name ('' clears it) and tell every buddy on screen. */
export async function setBuddyName(name) {
  buddyName = (name || '').trim();
  await saveSettings('buddy', { name: buddyName });
  document.dispatchEvent(new CustomEvent('buddynamechange', { detail: buddyName }));
}

/** Fill {name} in a line: "Mochi is hungry!" or "Your buddy is hungry!" at the start of a line. */
export function withName(line) {
  return line.replace(/\{name\}/g, (_, offset) => buddyName || (offset === 0 ? 'Your buddy' : 'your buddy'));
}

// ---------- Faces ----------
// Which face parts show for each expression.
const FACES = {
  calm: ['eyes-open', 'mouth-o'],
  okay: ['eyes-open', 'mouth-flat'],
  content: ['eyes-open', 'mouth-smile', 'blush'],
  happy: ['eyes-happy', 'mouth-big', 'blush'],
  hungry: ['eyes-open', 'brows-sad', 'mouth-open', 'drool'],
  thirsty: ['eyes-open', 'brows-sad', 'mouth-o', 'sweat'],
  worried: ['eyes-open', 'brows-sad', 'mouth-wavy', 'sweat'],
  sleep: ['eyes-closed', 'mouth-o'],
};

const FACE_PARTS = `
    <g data-part="eyes-open">
      <g class="buddy__eye">
        <ellipse class="buddy__pupil" cx="208" cy="712" rx="50" ry="60"/>
        <ellipse class="buddy__shine" cx="206" cy="690" rx="25" ry="36"/>
      </g>
      <g class="buddy__eye">
        <ellipse class="buddy__pupil" cx="380" cy="705" rx="50" ry="70"/>
        <ellipse class="buddy__shine" cx="382" cy="684" rx="27" ry="42"/>
      </g>
    </g>
    <g data-part="eyes-closed">
      <path class="buddy__line" d="M165 720 C185 745 230 745 250 720"/>
      <path class="buddy__line" d="M335 715 C355 740 405 740 425 715"/>
    </g>
    <g data-part="eyes-happy">
      <path class="buddy__line buddy__thick" d="M168 728 C185 680 232 680 248 728"/>
      <path class="buddy__line buddy__thick" d="M340 722 C357 670 404 670 420 722"/>
    </g>
    <g data-part="brows-sad">
      <path class="buddy__line" d="M168 640 L238 624"/>
      <path class="buddy__line" d="M350 618 L420 632"/>
    </g>
    <g data-part="blush">
      <ellipse class="buddy__blush" cx="152" cy="792" rx="30" ry="15"/>
      <ellipse class="buddy__blush" cx="448" cy="782" rx="30" ry="15"/>
    </g>
    <ellipse data-part="mouth-o" class="buddy__mouth" cx="272" cy="820" rx="8" ry="11"/>
    <path data-part="mouth-flat" class="buddy__line" d="M256 822 Q272 830 288 822"/>
    <path data-part="mouth-smile" class="buddy__line" d="M248 810 Q272 840 296 810"/>
    <path data-part="mouth-big" class="buddy__mouth-big" d="M236 806 Q272 818 308 806 Q300 862 272 862 Q244 862 236 806 Z"/>
    <path data-part="mouth-wavy" class="buddy__line" d="M246 826 q9 -12 18 0 t18 0 t18 0"/>
    <g data-part="mouth-open">
      <ellipse class="buddy__mouth" cx="272" cy="830" rx="28" ry="34"/>
      <ellipse class="buddy__tongue" cx="272" cy="850" rx="16" ry="10"/>
    </g>
    <path data-part="drool" class="buddy__drop" d="M306 846 C318 866 324 880 316 892 C308 902 292 896 293 882 C294 870 302 858 306 846 Z"/>
    <path data-part="sweat" class="buddy__drop" d="M470 612 C480 630 488 642 482 654 C476 664 460 662 458 650 C457 640 464 628 470 612 Z"/>`;

// ---------- Outfits (one per module), drawn on top. Our own constant SVG strings only. ----------
// `wear` sits on the buddy; `hold` is a little item beside it, drawn 1.35× bigger.
const OUTFITS = {
  water: { hold: `
    <path class="buddy__fill-water" d="M128 812 C128 812 80 872 80 902 C80 930 102 950 128 950 C154 950 176 930 176 902 C176 872 128 812 128 812 Z"/>
    <ellipse class="buddy__shine" cx="110" cy="905" rx="10" ry="16"/>` },
  sleep: { wear: `
    <rect class="buddy__fill-sleep" x="190" y="578" width="190" height="58" rx="29"/>
    <path class="buddy__line" d="M228 606 Q245 618 262 606 M308 604 Q325 616 342 604"/>`, hold: `
    <rect class="buddy__fill-white" x="64" y="872" width="132" height="86" rx="34"/>
    <path class="buddy__line" d="M92 902 Q130 914 168 902"/>` },
  weight: { wear: `
    <path class="buddy__band-edge" d="M108 668 C160 600 300 572 420 586 C480 595 515 630 528 680"/>
    <path class="buddy__band" d="M108 668 C160 600 300 572 420 586 C480 595 515 630 528 680"/>`, hold: `
    <rect class="buddy__fill-dark" x="70" y="902" width="130" height="14" rx="7"/>
    <rect class="buddy__fill-weight" x="64" y="870" width="30" height="78" rx="12"/>
    <rect class="buddy__fill-weight" x="176" y="870" width="30" height="78" rx="12"/>` },
  food: { wear: `
    <path class="buddy__fill-white" d="M206 880 L338 880 C338 940 312 966 272 966 C232 966 206 940 206 880 Z"/>
    <path class="buddy__line" d="M206 880 C190 870 180 858 176 846 M338 880 C354 870 364 858 368 846"/>
    <circle class="buddy__dot-food" cx="246" cy="906" r="9"/>
    <circle class="buddy__dot-food" cx="298" cy="906" r="9"/>
    <circle class="buddy__dot-food" cx="272" cy="938" r="9"/>`, hold: `
    <rect class="buddy__fill-silver" x="116" y="868" width="18" height="96" rx="9"/>
    <ellipse class="buddy__fill-silver" cx="125" cy="846" rx="30" ry="38"/>` },
  money: { hold: `
    <circle class="buddy__fill-coin" cx="126" cy="892" r="58"/>
    <circle class="buddy__line" cx="126" cy="892" r="42"/>
    <text class="buddy__rupee" x="126" y="914" text-anchor="middle">₹</text>` },
  tasks: { hold: `
    <rect class="buddy__fill-tasks" x="62" y="826" width="124" height="140" rx="18"/>
    <rect class="buddy__fill-white" x="80" y="852" width="88" height="98" rx="8"/>
    <rect class="buddy__fill-dark" x="100" y="814" width="48" height="24" rx="10"/>
    <path class="buddy__line buddy__tick" d="M98 902 L118 922 L152 880"/>` },
  reading: { wear: `
    <circle class="buddy__lens" cx="208" cy="710" r="72"/>
    <circle class="buddy__lens" cx="380" cy="705" r="78"/>
    <path class="buddy__line" d="M280 702 Q294 690 302 702 M136 700 L112 690 M458 696 L490 684"/>`, hold: `
    <path class="buddy__fill-reading" d="M58 892 Q100 872 132 896 Q164 872 206 892 L206 966 Q164 948 132 970 Q100 948 58 966 Z"/>
    <path class="buddy__line" d="M132 896 L132 970"/>` },
  medical: { wear: `
    <path class="buddy__tube" d="M196 862 C204 944 340 944 348 862"/>
    <circle class="buddy__fill-silver" cx="272" cy="934" r="22"/>
    <g transform="rotate(-25 450 805)">
      <rect class="buddy__fill-plaster" x="410" y="790" width="80" height="30" rx="15"/>
      <path class="buddy__line" d="M442 798 L442 812 M458 798 L458 812"/>
    </g>` },
};

let count = 0;

function svg(id, outfit) {
  return `
<svg class="buddy__art" viewBox="5 440 655 600" aria-hidden="true" focusable="false">
  <defs>
    <clipPath id="buddy-cap-${id}">
      <path d="M92 700 C80 600 150 470 300 455 C420 445 510 520 545 640 C560 690 560 715 540 718
               C520 720 515 705 510 690 C470 620 380 590 300 595 C200 600 135 650 125 700
               C120 720 95 720 92 700 Z"/>
    </clipPath>
  </defs>
  <g class="buddy__body-group">
    <circle class="buddy__pompom" cx="565" cy="765" r="70"/>
    <path class="buddy__body" d="M125 690 C95 760 85 880 150 935 C200 975 400 985 460 950
                                  C505 920 510 800 500 700 C470 600 380 570 300 575
                                  C200 580 135 630 125 690 Z"/>
    <path class="buddy__foot" d="M88 975 C80 940 130 915 175 918 C225 920 255 950 250 985
                                  C248 1005 100 1010 88 975 Z"/>
    <path class="buddy__foot" d="M385 990 C375 940 430 905 480 908 C540 912 575 950 568 990
                                  C565 1015 390 1015 385 990 Z"/>
    <path class="buddy__cap" d="M92 700 C80 600 150 470 300 455 C420 445 510 520 545 640
               C560 690 560 715 540 718 C520 720 515 705 510 690 C470 620 380 590 300 595
               C200 600 135 650 125 700 C120 720 95 720 92 700 Z"/>
    <g clip-path="url(#buddy-cap-${id})">
      <ellipse class="buddy__spot" cx="222" cy="485" rx="58" ry="32"/>
      <ellipse class="buddy__spot" cx="368" cy="515" rx="45" ry="32"/>
      <ellipse class="buddy__spot" cx="515" cy="565" rx="26" ry="46"/>
      <ellipse class="buddy__spot" cx="118" cy="585" rx="30" ry="32"/>
    </g>
    <path class="buddy__line" d="M100 642 C160 565 300 530 420 548 C480 560 520 610 532 665"/>
    ${FACE_PARTS}
    ${OUTFITS[outfit]?.wear || ''}
    ${OUTFITS[outfit]?.hold ? `<g class="buddy__held" transform="translate(-66 -297) scale(1.35)">${OUTFITS[outfit].hold}</g>` : ''}
  </g>
</svg>`;
}

/** The buddy picture. size in px; mood 'idle' or 'sleepy'; outfit a module key; face from FACES. */
export function buddy({ size = 72, mood = 'idle', outfit = '', face = 'calm', className = '' } = {}) {
  count += 1;
  const box = document.createElement('span');
  box.className = `buddy ${className}`.trim();
  box.style.setProperty('--buddy-size', `${size}px`);
  box.innerHTML = `${svg(count, outfit)}<span class="buddy__zzz" aria-hidden="true"><span>z</span><span>z</span><span>z</span></span>`
    + '<span class="buddy__sparkle" aria-hidden="true">✨</span>';
  let currentFace = face;
  let sleepy = false;

  function paint() {
    const parts = FACES[sleepy ? 'sleep' : currentFace] || FACES.calm;
    for (const part of box.querySelectorAll('[data-part]')) {
      part.style.display = parts.includes(part.dataset.part) ? '' : 'none';
    }
  }
  box.setFace = (f) => { currentFace = FACES[f] ? f : 'calm'; paint(); return box; };
  box.setMood = (m) => {
    sleepy = m === 'sleepy';
    box.classList.toggle('buddy--sleepy', sleepy);
    paint();
    return box;
  };
  // One small happy hop with a sparkle (ignored while already hopping).
  box.hop = () => {
    if (box.classList.contains('buddy--happy')) return box;
    box.classList.add('buddy--happy');
    setTimeout(() => box.classList.remove('buddy--happy'), 900);
    return box;
  };
  return box.setMood(mood);
}

/** The module shown on screen now ('food' for "#/food/…"), or '' on Home and Settings. */
const MODULE_KEYS = ['water', 'sleep', 'weight', 'food', 'money', 'tasks', 'reading', 'medical'];
export function screenModule() {
  const key = location.hash.replace(/^#\/?/, '').split('/')[0];
  return MODULE_KEYS.includes(key) ? key : '';
}

/** A short cheer: the buddy (in the screen's outfit) pops up, hops, and goes away. */
let currentPop = null;
export function celebrate(message) {
  currentPop?.remove();
  const friend = buddy({ size: 96, outfit: screenModule(), face: 'happy' });
  friend.setAttribute('aria-hidden', 'true');
  const pop = document.createElement('div');
  pop.className = 'buddy-pop';
  pop.setAttribute('role', 'status');
  const text = document.createElement('p');
  text.className = 'buddy-pop__text';
  text.textContent = withName(message);
  pop.append(friend, text);
  document.body.append(pop);
  currentPop = pop;
  requestAnimationFrame(() => friend.hop());
  setTimeout(() => {
    pop.classList.add('buddy-pop--out');
    setTimeout(() => { pop.remove(); if (currentPop === pop) currentPop = null; }, 300);
  }, 2200);
}

// ---------- The buddy card at the top of each module screen ----------
// Starting face and line for each module; modules with live faces change them with buddyMood().
const SCREEN_START = {
  water: ['calm', '{name} is ready to sip with you 💧'],
  sleep: ['calm', '{name} loves a good night\'s sleep 😴'],
  weight: ['content', '{name} is cheering you on 💪'],
  food: ['calm', '{name} is checking the menu 🍱'],
  money: ['calm', '{name} is keeping an eye on the coins 💸'],
  tasks: ['calm', '{name} is ready to help ✅'],
  reading: ['content', '{name} loves a good book 📚'],
  medical: ['content', '{name} hopes you feel well 🩺'],
};

let active = null; // { module, friend, say, line }

/** The small buddy card for a module screen (the router puts it at the top). */
export function screenBuddy(module) {
  const [face, line] = SCREEN_START[module] || ['calm', 'Hi! 👋'];
  const friend = buddy({ size: 64, outfit: module, face });
  friend.setAttribute('aria-hidden', 'true');
  const say = document.createElement('span');
  say.className = 'buddy-card__say';
  say.setAttribute('aria-live', 'polite');
  const box = document.createElement('button');
  box.type = 'button';
  box.className = `buddy-card mod-${module}`;
  box.setAttribute('aria-label', 'Tap your buddy');
  box.append(friend, say);
  box.addEventListener('click', () => friend.hop());
  const me = { module, friend, say, line };
  active = me;
  const write = () => { say.textContent = withName(me.line); };
  write();
  nameReady.then(write);
  const onName = () => { if (!box.isConnected && active !== me) document.removeEventListener('buddynamechange', onName); else write(); };
  document.addEventListener('buddynamechange', onName);
  me.write = write;
  return box;
}

/** Change the face (and line) of the buddy card on the module screen shown now. */
export function buddyMood(face, line) {
  const me = active;
  if (!me || me.module !== screenModule()) return;
  me.friend.setFace(face);
  if (line) { me.line = line; me.write(); }
}
