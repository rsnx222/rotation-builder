const EMOJI_URL =
  "https://raw.githubusercontent.com/pvme/pvme-settings/master/emojis/emojis_v2.json";

const emojiMap = new Map();
const emojiList = [];
const emojiById = new Map();

let suggestions = [];
let activeIndex = -1;

const autoArrowToggle = document.getElementById("autoArrowToggle");

const input = document.getElementById("input");
const output = document.getElementById("output");
const suggestionBox = document.getElementById("suggestions");

let compiledDiscord = "";

function escapeHTML(str) {
  return str.replace(
    /[&<>"]/g,
    (a) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
      })[a],
  );
}

async function loadEmojis() {
  const json = await (await fetch(EMOJI_URL)).json();

  for (const cat of json.categories) {
    for (const e of cat.emojis) {
      if (!e.emoji_id) continue;

      const obj = {
        id: String(e.emoji_id),
        syntax: `<:${e.id}:${e.emoji_id}>`,
        name: e.id,
      };

      emojiById.set(obj.id, obj);

      addAlias(e.id, obj);

      if (e.id_aliases) {
        for (const a of e.id_aliases) addAlias(a, obj);
      }
    }
  }

  emojiList.push(...emojiMap.keys());

  // longest alias first (important for substring matching)
  emojiList.sort((a, b) => b.length - a.length);
}

function addAlias(alias, emoji) {
  alias = alias.toLowerCase();

  if (!emojiMap.has(alias)) emojiMap.set(alias, []);

  emojiMap.get(alias).push(emoji);
}

function compile() {
  let text = input.value;

  text = text.replace(/->/g, "→");
  text = text.replace(/<:([^:]+):\d+>/g, "$1");

  const sections = text.split(/(\[.*?\])/);

  let result = "";

  for (let part of sections) {
    if (part.startsWith("[") && part.endsWith("]")) {
      result += escapeHTML(part.slice(1, -1));
      continue;
    }

    let segment = part;

    for (const alias of emojiList) {
      const emojis = emojiMap.get(alias);
      if (!emojis) continue;

      const regex = new RegExp(alias, "ig");

      segment = segment.replace(regex, () => {
        let out = "";

        for (let i = 0; i < emojis.length; i++) {
          const e = emojis[i];

          out += "${{" + e.id + "}}";

          if (i < emojis.length - 1) out += " ";
        }

        return out;
      });
    }

    result += segment;
  }

  // ----- Build HTML preview -----

  const html = result.replace(
    /\${{(\d+)}}/g,
    (_, id) =>
      `<img class="disc-emoji" src="https://cdn.discordapp.com/emojis/${id}.png?v=1">`,
  );

  // ----- Build Discord output -----

  const discord = result.replace(/\${{(\d+)}}/g, (_, id) => {
    const e = emojiById.get(id);
    return e ? e.syntax : "";
  });

  compiledDiscord = discord;

  output.innerHTML = html.replace(/\n/g, "<br>");
}

function updateSuggestions() {
  const caret = input.selectionStart;
  const before = input.value.slice(0, caret);
  const token = (before.match(/[A-Za-z0-9_-]+$/) || [])[0];

  if (!token) {
    suggestionBox.style.display = "none";
    return;
  }

  const low = token.toLowerCase();

  const seen = new Set();

  suggestions = [];

  for (const alias of emojiList) {
    if (!alias.startsWith(low) || alias === low) continue;

    const emojis = emojiMap.get(alias);

    if (!emojis || !emojis.length) continue;

    const id = emojis[0].id;

    if (seen.has(id)) continue;

    seen.add(id);

    suggestions.push({
      alias,
      emoji: emojis[0],
    });

    if (suggestions.length >= 10) break;
  }

  if (!suggestions.length) {
    suggestionBox.style.display = "none";
    return;
  }

  activeIndex = 0;

  renderSuggestions();
}

function renderSuggestions() {
  suggestionBox.innerHTML = "";

  suggestions.forEach((s, i) => {
    const div = document.createElement("div");

    div.className = "suggestion" + (i === activeIndex ? " active" : "");

    div.innerHTML = `<img class="disc-emoji" src="https://cdn.discordapp.com/emojis/${s.emoji.id}.png?v=1">
<span>${s.alias}</span>`;

    div.onclick = () => applySuggestion(i);

    suggestionBox.appendChild(div);
  });

  const pos = getCaretPosition();

  const left = Math.min(pos.x, input.clientWidth - 200);

  suggestionBox.style.left = left + 32 + "px";
  suggestionBox.style.top = pos.y + 13 + "px";
  suggestionBox.style.display = "block";
}

function applySuggestion(i) {
  let word = suggestions[i].alias;

  if (autoArrowToggle.checked) word += " → ";

  const pos = input.selectionStart;
  const before = input.value.slice(0, pos);
  const after = input.value.slice(pos);

  const match = before.match(/[A-Za-z0-9_-]+$/);

  if (!match) return;

  const start = pos - match[0].length;

  input.value = before.slice(0, start) + word + after;

  const newPos = start + word.length;

  input.setSelectionRange(newPos, newPos);

  compile();

  suggestionBox.style.display = "none";
}

input.addEventListener("input", () => {
  const pos = input.selectionStart;
  const before = input.value;

  const replaced = before.replace(/->/g, "→");

  if (before !== replaced) {
    const diff = replaced.length - before.length;

    input.value = replaced;

    const newPos = pos + diff;
    input.setSelectionRange(newPos, newPos);
  }

  compile();
  updateSuggestions();
});

input.addEventListener("keydown", (e) => {
  if (!suggestions.length) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex = (activeIndex + 1) % suggestions.length;
    renderSuggestions();
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length;
    renderSuggestions();
  }

  if (e.key === "Enter" || e.key === "ArrowRight" || e.key === "Tab") {
    e.preventDefault();
    applySuggestion(activeIndex);
  }

  if (e.key === "Escape") {
    suggestionBox.style.display = "none";
  }

  if (e.key === " " || e.key === "Backspace") {
    suggestionBox.style.display = "none";
  }
});

document.getElementById("copyDiscord").onclick = () =>
  navigator.clipboard.writeText(compiledDiscord);

document.getElementById("exportToTxt").onclick = () => {
  const file = new File([compiledDiscord], "rotation.txt");

  const url = URL.createObjectURL(file);

  const a = document.createElement("a");

  a.href = url;
  a.download = file.name;
  a.click();

  URL.revokeObjectURL(url);
};

document.getElementById("changeView").onclick = function () {
  const stacked = this.dataset.stacked === "true";

  if (stacked) {
    inputContainer.className = "col-md-6 p-3";
    outputContainer.className = "col-md-6 p-3";
    this.dataset.stacked = "false";
  } else {
    inputContainer.className = "col-md-12 p-3";
    outputContainer.className = "col-md-12 p-3";
    this.dataset.stacked = "true";
  }
};

function getCaretPosition() {
  const mirror = document.getElementById("caretMirror");

  const style = getComputedStyle(input);

  mirror.style.font = style.font;
  mirror.style.padding = style.padding;
  mirror.style.width = input.clientWidth + "px";

  const text = input.value.substring(0, input.selectionStart);

  mirror.textContent = text;

  const span = document.createElement("span");
  span.textContent = "|";

  mirror.appendChild(span);

  const rect = span.getBoundingClientRect();
  const parent = mirror.getBoundingClientRect();

  return {
    x: rect.left - parent.left,
    y: rect.top - parent.top,
  };
}

loadEmojis();
compile();
