// 🍄 Buddy (REFINE-2): the little doodle friend, redrawn in soft pastels.
// Round body, spotted cap with a pom-pom, big shiny eyes, tiny "o" mouth and two feet.
// Moods: 'idle' (gentle bob, blinks, pom-pom wiggle), 'sleepy' (eyes closed, z z z) and a
// one-off happy hop with a sparkle. All movement stops if the phone asks for reduced motion.
//
// buddy({ size: 72, mood: 'idle' })  → element with .setMood(mood) and .hop()
// celebrate('Goal reached! 💧')       → the buddy pops up, hops and cheers for a moment

let count = 0;

function svg(id) {
  return `
<svg class="buddy__art" viewBox="70 440 590 590" aria-hidden="true" focusable="false">
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
    <g class="buddy__eyes-open">
      <g class="buddy__eye">
        <ellipse class="buddy__pupil" cx="208" cy="712" rx="50" ry="60"/>
        <ellipse class="buddy__shine" cx="206" cy="690" rx="25" ry="36"/>
      </g>
      <g class="buddy__eye">
        <ellipse class="buddy__pupil" cx="380" cy="705" rx="50" ry="70"/>
        <ellipse class="buddy__shine" cx="382" cy="684" rx="27" ry="42"/>
      </g>
    </g>
    <g class="buddy__eyes-closed">
      <path class="buddy__line" d="M165 720 C185 745 230 745 250 720"/>
      <path class="buddy__line" d="M335 715 C355 740 405 740 425 715"/>
    </g>
    <ellipse class="buddy__mouth" cx="272" cy="820" rx="8" ry="11"/>
  </g>
</svg>`;
}

/** The buddy picture. size is in px; mood is 'idle' or 'sleepy'. */
export function buddy({ size = 72, mood = 'idle', className = '' } = {}) {
  count += 1;
  const box = document.createElement('span');
  box.className = `buddy ${className}`.trim();
  box.style.setProperty('--buddy-size', `${size}px`);
  box.innerHTML = `${svg(count)}<span class="buddy__zzz" aria-hidden="true"><span>z</span><span>z</span><span>z</span></span>`
    + '<span class="buddy__sparkle" aria-hidden="true">✨</span>';

  box.setMood = (m) => {
    box.classList.toggle('buddy--sleepy', m === 'sleepy');
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

/** A short cheer: the buddy pops up in the middle of the screen, hops, and goes away. */
let currentPop = null;
export function celebrate(message) {
  currentPop?.remove();
  const friend = buddy({ size: 96 });
  friend.setAttribute('aria-hidden', 'true');
  const pop = document.createElement('div');
  pop.className = 'buddy-pop';
  pop.setAttribute('role', 'status');
  const text = document.createElement('p');
  text.className = 'buddy-pop__text';
  text.textContent = message;
  pop.append(friend, text);
  document.body.append(pop);
  currentPop = pop;
  requestAnimationFrame(() => friend.hop());
  setTimeout(() => {
    pop.classList.add('buddy-pop--out');
    setTimeout(() => { pop.remove(); if (currentPop === pop) currentPop = null; }, 300);
  }, 2200);
}
