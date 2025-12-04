console.log("Verse-order script loaded");

let verses = [];        // full verse data from JSON
let correctOrder = [];  // [0,1,2,...] per chapter
let draggedCard = null;

// DOM elements
const leftContainer   = document.getElementById("leftContainer");
const rightContainer  = document.getElementById("rightContainer");
const feedbackMessage = document.getElementById("feedbackMessage");
const checkBtn        = document.getElementById("checkBtn");
const chapterSelect   = document.getElementById("chapterSelect");

/* ===========================
   SOUND EFFECTS SETUP
   (expects /sounds/*.mp3)
=========================== */
const sfx = {};
["load", "move", "correct", "incorrect"].forEach(name => {
  const audio = new Audio(`sounds/${name}.mp3`);
  audio.addEventListener("error", () => {
    console.warn(`Sound file missing or failed to load: sounds/${name}.mp3`);
  });
  audio.volume = name === "move" ? 0.4 : 0.8;
  sfx[name] = audio;
});

function playSfx(name) {
  const audio = sfx[name];
  if (!audio) return;
  audio.currentTime = 0;
  audio
    .play()
    .catch(err => {
      console.warn(`Could not play sound "${name}":`, err);
    });
}

/* ===========================
   MODE & CHAPTER LOADING
=========================== */

// Utility: get current mode ("game" or "study")
function getMode() {
  const radio = document.querySelector('input[name="mode"]:checked');
  return radio ? radio.value : "game";
}

// Load selected chapter in chosen mode
function loadChapter() {
  const chapterKey = chapterSelect.value; // e.g. "1john3"
  const mode       = getMode();           // "game" or "study"
  const jsonPath   = `chapters/${chapterKey}.json`;

  feedbackMessage.textContent = "Loading chapter...";
  console.log("Loading:", jsonPath, "mode:", mode);

  fetch(jsonPath)
    .then(res => {
      if (!res.ok) {
        throw new Error(`HTTP error: ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      verses = data.verses || [];
      correctOrder = verses.map((_, idx) => idx); // [0..n-1]

      // Clear containers
      leftContainer.innerHTML  = "";
      rightContainer.innerHTML = "";
      feedbackMessage.textContent = "";

      // Mode-specific setup
      if (mode === "game") {
        setupGameMode();
        checkBtn.disabled = false;
      } else {
        setupStudyMode();
        checkBtn.disabled = true;
      }

      // Reset scroll positions & keep them synced
      leftContainer.scrollTop  = 0;
      rightContainer.scrollTop = 0;

      playSfx("load");
    })
    .catch(err => {
      console.error("Error loading chapter:", err);
      feedbackMessage.textContent =
        "Error loading chapter. Check JSON paths and use Live Server.";
      checkBtn.disabled = true;
    });
}

// GAME MODE: scramble on left, right is for player’s order
function setupGameMode() {
  const scrambledOrder = [...correctOrder];
  shuffleArray(scrambledOrder);

  scrambledOrder.forEach(idx => {
    const verse = verses[idx];
    const card = createVerseCard(verse, idx, {
      hideReference: true,
      draggable: true
    });
    leftContainer.appendChild(card);
  });

  feedbackMessage.textContent =
    "Game Mode: Drag verses from left to right and arrange them in order.";
}

// STUDY MODE: correct order on right, references visible, no drag
function setupStudyMode() {
  correctOrder.forEach(idx => {
    const verse = verses[idx];
    const card = createVerseCard(verse, idx, {
      hideReference: false,
      draggable: false
    });
    rightContainer.appendChild(card);
  });

  feedbackMessage.textContent =
    "Study Mode: Verses are shown in correct order with references for review.";
}

/* ===========================
   UTILS & CARD CREATION
=========================== */

// Fisher–Yates shuffle
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Create a verse card
 * options: { hideReference: bool, draggable: bool }
 */
function createVerseCard(verse, index, options = {}) {
  const { hideReference = true, draggable = true } = options;

  const card = document.createElement("div");
  card.className = "verse-card w3-card";
  card.dataset.index = index; // verse index in array
  card.dataset.reference = verse.reference;

  // Reference (shown only in Study Mode)
  if (!hideReference) {
    const refDiv = document.createElement("div");
    refDiv.className = "w3-small";
    refDiv.style.color = "#ffd700";
    refDiv.textContent = verse.reference;
    card.appendChild(refDiv);
  }

  // Verse text
  const textDiv = document.createElement("div");
  textDiv.className = "w3-small";
  textDiv.style.color = "white"; // default
  textDiv.textContent = verse.text;
  card.appendChild(textDiv);

  if (draggable) {
    card.draggable = true;
    card.addEventListener("dragstart", handleCardDragStart);
    card.addEventListener("dragend", handleCardDragEnd);
  } else {
    card.draggable = false;
  }

  return card;
}

/* ===========================
   DRAG & DROP HANDLERS
=========================== */

function handleCardDragStart(e) {
  draggedCard = this;
  this.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";

  playSfx("move");
}

function handleCardDragEnd() {
  if (draggedCard) {
    draggedCard.classList.remove("dragging");
  }
  draggedCard = null;
  clearHighlights();
  clearDropZoneHighlight();
}

// Container drag events for smooth reordering
function handleContainerDragOver(e) {
  e.preventDefault();
  const container = e.currentTarget;
  container.classList.add("drop-zone-hover");

  if (!draggedCard) return;

  const afterElement = getDragAfterElement(container, e.clientY);
  if (afterElement == null) {
    container.appendChild(draggedCard);
  } else {
    container.insertBefore(draggedCard, afterElement);
  }
}

function handleContainerDrop(e, containerId) {
  e.preventDefault();
  const container = document.getElementById(containerId);
  container.classList.remove("drop-zone-hover");
  // Position is handled in handleContainerDragOver
}

// Helper: find card to insert before, based on mouse Y
function getDragAfterElement(container, y) {
  const draggableElements = [
    ...container.querySelectorAll(".verse-card:not(.dragging)")
  ];

  let closest = { offset: Number.NEGATIVE_INFINITY, element: null };

  draggableElements.forEach(element => {
    const box = element.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;

    if (offset < 0 && offset > closest.offset) {
      closest = { offset, element };
    }
  });

  return closest.element;
}

/* ===========================
   HIGHLIGHTS & CHECK ORDER
=========================== */

function clearHighlights() {
  const allCards = document.querySelectorAll(".verse-card");
  allCards.forEach(card => {
    card.classList.remove("w3-pale-green", "w3-pale-red");

    // 🔁 Reset verse text back to white whenever we clear highlights
    const textDiv = card.querySelector("div:last-child");
    if (textDiv) {
      textDiv.style.color = "white";
    }
  });
}

function clearDropZoneHighlight() {
  leftContainer.classList.remove("drop-zone-hover");
  rightContainer.classList.remove("drop-zone-hover");
}

// Check order (Game Mode only, right side)
function checkOrder() {
  const mode = getMode();
  if (mode !== "game") {
    feedbackMessage.textContent =
      "Check Order is only for Game Mode. Switch to Game Mode and reload the chapter.";
    return;
  }

  const rightCards = Array.from(rightContainer.querySelectorAll(".verse-card"));

  if (!rightCards.length) {
    feedbackMessage.textContent = "Drag verses to the right side first.";
    return;
  }

  if (rightCards.length !== verses.length) {
    feedbackMessage.textContent =
      "You don't have all the verses on the right side yet.";
  }

  let allCorrect = true;
  clearHighlights(); // this also resets text to white now

  rightCards.forEach((card, position) => {
    const idx = parseInt(card.dataset.index, 10);

    // Make verse text black for better readability on colored background
    const textDiv = card.querySelector("div:last-child");
    if (textDiv) {
      textDiv.style.color = "black";
    }

    if (idx === correctOrder[position]) {
      card.classList.add("w3-pale-green");
    } else {
      card.classList.add("w3-pale-red");
      allCorrect = false;
    }
  });

  if (allCorrect && rightCards.length === verses.length) {
    feedbackMessage.textContent = "✅ Perfect! All verses are in the correct order.";
    playSfx("correct");
  } else {
    feedbackMessage.textContent =
      "❌ Some verses are out of order. Adjust the red ones and try again.";
    playSfx("incorrect");
  }
}

/* ===========================
   SCROLL SYNC (left <-> right)
=========================== */

let isSyncingLeft  = false;
let isSyncingRight = false;

leftContainer.addEventListener("scroll", () => {
  if (!isSyncingLeft) {
    isSyncingRight = true;
    rightContainer.scrollTop = leftContainer.scrollTop;
    isSyncingRight = false;
  }
});

rightContainer.addEventListener("scroll", () => {
  if (!isSyncingRight) {
    isSyncingLeft = true;
    leftContainer.scrollTop = rightContainer.scrollTop;
    isSyncingLeft = false;
  }
});

/* ===========================
   INITIAL LOAD
=========================== */

document.addEventListener("DOMContentLoaded", () => {
  loadChapter();
});
