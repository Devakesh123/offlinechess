import { Chess } from "./vendor/chess.js";
import { Engine } from "./engine.js";

const $ = id => document.getElementById(id);
const engine = new Engine();
const INITIAL = new Chess().fen();
const STORAGE = "knightlab.game.v1";

const glyphs = {
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};
const pieceNames = {
  k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn",
};
const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

const repertoire = [
  ["Italian Game", "e4 e5 Nf3 Nc6 Bc4 Bc5"],
  ["Ruy Lopez", "e4 e5 Nf3 Nc6 Bb5 a6"],
  ["Scotch Game", "e4 e5 Nf3 Nc6 d4 exd4 Nxd4"],
  ["Petrov Defense", "e4 e5 Nf3 Nf6"],
  ["Sicilian Defense", "e4 c5 Nf3 d6 d4 cxd4 Nxd4"],
  ["French Defense", "e4 e6 d4 d5 Nc3"],
  ["Caro-Kann Defense", "e4 c6 d4 d5 Nc3"],
  ["Queen's Gambit", "d4 d5 c4 e6 Nc3"],
  ["King's Indian Defense", "d4 Nf6 c4 g6 Nc3 Bg7"],
  ["English Opening", "c4 e5 Nc3 Nf6"],
  ["Réti Opening", "Nf3 d5 c4"],
];

const book = new Map();
const key = fen => fen.split(" ").slice(0, 4).join(" ");
const uci = move => move.from + move.to + (move.promotion || "");

for (const [name, sequence] of repertoire) {
  const position = new Chess();
  for (const san of sequence.split(" ")) {
    const before = key(position.fen());
    const move = position.move(san);
    if (!book.has(before)) book.set(before, new Map());
    const choices = book.get(before);
    if (!choices.has(uci(move))) choices.set(uci(move), new Set());
    choices.get(uci(move)).add(name);
  }
}

let game = new Chess();
let records = [];
let cursor = 0;
let flipped = false;
let busy = false;
let selected = null;
let hint = null;
let resigned = null;
let mode = "computer";

function notice(message = "") {
  $("notice").textContent = message;
}

function activePosition() {
  if (cursor === records.length) return game;
  return new Chess(cursor ? records[cursor - 1].after : INITIAL);
}

function moveObject(text) {
  return {
    from: text.slice(0, 2),
    to: text.slice(2, 4),
    ...(text[4] ? { promotion: text[4] } : {}),
  };
}

function makeMove(position, text) {
  return position.move(moveObject(text));
}

function lineSAN(fen, moves, limit = 8) {
  const position = new Chess(fen);
  const output = [];
  for (const text of moves.slice(0, limit)) {
    try {
      const turn = position.turn();
      const number = position.moveNumber();
      const move = makeMove(position, text);
      output.push(
        (turn === "w" ? `${number}. ` : output.length ? "" : `${number}… `)
        + move.san
      );
    } catch {
      break;
    }
  }
  return output.join(" ");
}

function resultText(position) {
  if (position.isCheckmate()) {
    return `${position.turn() === "w" ? "Black" : "White"} wins by checkmate`;
  }
  if (position.isStalemate()) return "Draw by stalemate";
  if (position.isThreefoldRepetition()) return "Draw by repetition";
  if (position.isInsufficientMaterial()) return "Draw: insufficient material";
  if (position.isDrawByFiftyMoves()) return "Draw by the fifty-move rule";
  if (position.isDraw()) return "Draw";
  return `${position.turn() === "w" ? "White" : "Black"} to move`
    + (position.isCheck() ? " · Check" : "");
}

function phase(position) {
  const remaining = position.board().flat().filter(Boolean)
    .reduce((sum, piece) => sum + (
      ["q", "r", "b", "n"].includes(piece.type) ? values[piece.type] : 0
    ), 0);

  if (remaining <= 2600) return "Endgame";
  if (position.moveNumber() <= 10) return "Opening";
  return "Middlegame";
}

function positionAdvice(position) {
  if (position.isGameOver()) return resultText(position) + ".";
  if (position.isCheck()) {
    return "Your king is in check. Compare capturing the checking piece, "
      + "blocking the check, and moving your king.";
  }
  if (phase(position) === "Opening") {
    return "Develop your knights and bishops, contest the center, "
      + "and prepare to castle. Check your opponent’s threats before moving.";
  }
  if (phase(position) === "Endgame") {
    return "Look for passed pawns and opportunities to activate your king. "
      + "Calculate pawn races before exchanging pieces.";
  }
  return "Look at checks, captures, and threats for both sides. "
    + "Then improve your least active piece.";
}

function moveIdea(fen, text) {
  const position = new Chess(fen);
  const move = makeMove(position, text);
  const ideas = [];

  if (move.san.endsWith("#")) return "This move delivers checkmate.";
  if (move.san.includes("+")) ideas.push("gives check");
  if (move.flags.includes("k") || move.flags.includes("q")) {
    ideas.push("castles the king and connects a rook");
  }
  if (move.captured) ideas.push(`captures a ${pieceNames[move.captured]}`);
  if (move.promotion) ideas.push(`promotes to a ${pieceNames[move.promotion]}`);

  if (["n", "b"].includes(move.piece)
      && ["1", "8"].includes(move.from[1])) {
    ideas.push(`develops the ${pieceNames[move.piece]}`);
  }
  if (["d4", "e4", "d5", "e5"].includes(move.to)) {
    ideas.push("occupies a central square");
  }
  if (move.piece === "k" && phase(position) === "Endgame") {
    ideas.push("activates the king");
  }

  return ideas.length
    ? `This move ${ideas.join(" and ")}.`
    : `This repositions the ${pieceNames[move.piece]} on ${move.to}. `
      + "Use the continuation to compare the opponent’s replies.";
}

function scoreNumber(analysis) {
  if (analysis.kind === "cp") return analysis.value;
  return Math.sign(analysis.value) * (100000 - Math.abs(analysis.value));
}

function scoreText(analysis, mover) {
  const sign = mover === "w" ? 1 : -1;
  const score = analysis.value * sign;

  if (analysis.kind === "mate") {
    return `${score > 0 ? "White" : "Black"} has a reported mate in `
      + `${Math.abs(score)}`;
  }
  const pawns = score / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)} for White`;
}

function material(position, color) {
  return position.board().flat().filter(Boolean).reduce(
    (sum, piece) => sum + (piece.color === color ? 1 : -1) * values[piece.type],
    0
  );
}

function brilliantCandidate(before, text, best, played) {
  if (text !== best.best || !best.second) return false;
  if (scoreNumber(best) - scoreNumber(best.second) < 150) return false;
  if (scoreNumber(played) < 0 || played.pv.length < 2) return false;

  const position = new Chess(before);
  const color = position.turn();
  const originalMaterial = material(position, color);
  const move = makeMove(position, text);
  if (values[move.piece] < 300) return false;

  const reply = makeMove(position, played.pv[1]);
  return reply.to === move.to
    && Boolean(reply.captured)
    && material(position, color) <= originalMaterial - 200;
}

function classify(before, text, best, played) {
  const loss = Math.max(0, scoreNumber(best) - scoreNumber(played));
  const bookNames = book.get(key(before))?.get(text);

  if (bookNames) {
    return { label: "Book move", loss, book: [...bookNames].join(" / ") };
  }
  if (brilliantCandidate(before, text, best, played)) {
    return { label: "Brilliant move · candidate", loss };
  }

  const label = text === best.best ? "Best move"
    : loss <= 20 ? "Excellent"
    : loss <= 60 ? "Good"
    : loss <= 120 ? "Inaccuracy"
    : loss <= 250 ? "Mistake"
    : "Blunder";

  return { label, loss };
}

function writeSave(announce = false) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify({
      version: 1, records, flipped, mode, resigned,
    }));
    if (announce) notice("Game saved on this device.");
  } catch {
    notice("Local saving failed. Export PGN to keep a copy of this game.");
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !Array.isArray(saved.records)) {
      throw new Error("Unsupported save");
    }

    const restored = new Chess();
    const checked = [];
    for (const entry of saved.records) {
      const before = restored.fen();
      const move = makeMove(restored, entry.uci);
      checked.push({
        ...entry, before, after: restored.fen(),
        san: move.san, uci: uci(move),
      });
    }

    game = restored;
    records = checked;
    cursor = records.length;
    flipped = Boolean(saved.flipped);
    mode = saved.mode === "local" ? "local" : "computer";
    resigned = ["w", "b"].includes(saved.resigned) ? saved.resigned : null;
  } catch {
    notice("The saved game could not be restored. A new board is ready.");
  }
}

function clearHint() {
  hint = null;
  $("hintText").textContent = "";
}

function squareCoordinates(square) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return flipped ? [7 - file, rank] : [file, 7 - rank];
}

function renderArrow() {
  const svg = $("arrows");
  svg.replaceChildren();
  if (!hint?.arrow) return;

  const namespace = "http://www.w3.org/2000/svg";
  const [x1, y1] = squareCoordinates(hint.move.slice(0, 2));
  const [x2, y2] = squareCoordinates(hint.move.slice(2, 4));
  const start = [x1 * 100 + 50, y1 * 100 + 50];
  const end = [x2 * 100 + 50, y2 * 100 + 50];
  const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);

  const line = document.createElementNS(namespace, "line");
  for (const [name, value] of Object.entries({
    x1: start[0], y1: start[1],
    x2: end[0] - Math.cos(angle) * 18,
    y2: end[1] - Math.sin(angle) * 18,
    stroke: "#f4bc4a", "stroke-width": 16,
    "stroke-linecap": "round", opacity: .9,
  })) line.setAttribute(name, value);

  const head = document.createElementNS(namespace, "polygon");
  const points = [
    end,
    [
      end[0] - 38 * Math.cos(angle - .5),
      end[1] - 38 * Math.sin(angle - .5),
    ],
    [
      end[0] - 38 * Math.cos(angle + .5),
      end[1] - 38 * Math.sin(angle + .5),
    ],
  ];
  head.setAttribute("points", points.map(point => point.join(",")).join(" "));
  head.setAttribute("fill", "#f4bc4a");
  svg.append(line, head);
}

function renderBoard() {
  const position = activePosition();
  const targets = selected
    ? position.moves({ square: selected, verbose: true }).map(move => move.to)
    : [];
  const last = cursor ? records[cursor - 1].uci : "";
  const board = $("board");
  const focus = document.activeElement?.dataset.square;
  board.replaceChildren();

  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      const file = flipped ? 7 - column : column;
      const rank = flipped ? row + 1 : 8 - row;
      const square = String.fromCharCode(97 + file) + rank;
      const piece = position.get(square);
      const button = document.createElement("button");

      button.className = "square"
        + ((file + rank) % 2 === 0 ? " dark" : "")
        + (square === selected ? " selected" : "")
        + (targets.includes(square) ? " target" : "")
        + ([last.slice(0, 2), last.slice(2, 4)].includes(square) ? " last" : "")
        + (hint?.destination === square ? " hint" : "");

      button.dataset.square = square;
      button.setAttribute("aria-label", square + (piece
        ? ` ${piece.color === "w" ? "White" : "Black"} ${pieceNames[piece.type]}`
        : " empty"));

      if (piece) {
        const span = document.createElement("span");
        span.className = `piece ${piece.color === "w" ? "white" : "black"}`;
        span.textContent = glyphs[piece.type];
        button.append(span);
      }

      if (column === 0 || row === 7) {
        const label = document.createElement("span");
        label.className = "coord";
        label.textContent = (column === 0 ? rank : "")
          + (row === 7 ? String.fromCharCode(97 + file) : "");
        button.append(label);
      }

      button.onclick = () => chooseSquare(square);
      board.append(button);
    }
  }

  if (focus) board.querySelector(`[data-square="${focus}"]`)?.focus();
  renderArrow();
}

function renderCoach() {
  const record = records[cursor - 1];
  const position = activePosition();

  if (!record) {
    $("grade").textContent = "Let’s begin";
    $("coach").textContent = positionAdvice(position);
    $("line").textContent = "Select a piece to see its legal moves.";
    return;
  }

  $("grade").textContent = record.grade?.label || "Not analyzed";

  if (!record.best || !record.played) {
    $("coach").textContent = "This move has no engine grade. "
      + positionAdvice(position);
    $("line").textContent = record.san;
    return;
  }

  const mover = new Chess(record.before).turn();
  const bestSAN = lineSAN(record.before, [record.best.best]);
  let explanation = `${record.san}: ${moveIdea(record.before, record.uci)}\n\n`;
  explanation += record.uci === record.best.best
    ? "You chose the engine’s preferred move."
    : `The engine preferred ${bestSAN}. `
      + moveIdea(record.before, record.best.best);

  if (record.grade.label.includes("Brilliant")) {
    explanation += "\n\nCandidate reason: the principal line allows your "
      + "moved piece to be captured at a material cost, while the engine "
      + "still evaluates the position favorably. The next candidate scores "
      + "substantially worse. A deeper search could change this assessment.";
  }

  if (record.best.kind === "cp" && record.played.kind === "cp") {
    explanation += `\n\nEstimated loss: `
      + `${(record.grade.loss / 100).toFixed(2)} pawns.`;
  }

  explanation += `\nEvaluation: ${scoreText(record.played, mover)}.`;
  explanation += `\n\nNext: ${positionAdvice(position)}`;

  $("coach").textContent = explanation;
  $("line").textContent =
    "Preferred line: " + lineSAN(record.before, record.best.pv)
    + "\nPlayed line: " + lineSAN(record.before, record.played.pv);
  $("line").style.whiteSpace = "pre-line";
}

function render() {
  renderBoard();
  renderCoach();

  const live = cursor === records.length;
  const position = activePosition();
  const finished = game.isGameOver() || resigned;
  const status = live && resigned
    ? `${resigned === "w" ? "White" : "Black"} resigned`
    : resultText(position);

  $("state").textContent = (live ? "" : "Review · ") + status;
  $("ply").textContent = `${cursor} / ${records.length} ply`;
  $("mode").value = mode;
  $("engineState").textContent = busy ? "Analyzing…" : "Local engine";

  const opening = records.slice(0, cursor).reverse()
    .find(record => record.grade?.book)?.grade.book;
  $("opening").textContent = opening || `${phase(position)} · No book match`;

  const blackName = mode === "computer" ? "Black · Stockfish" : "Black · Player 2";
  const whiteName = mode === "computer" ? "White · You" : "White · Player 1";
  $("topName").textContent = flipped ? whiteName : blackName;
  $("bottomName").textContent = flipped ? blackName : whiteName;

  for (const id of ["new", "undo", "resign", "mode", "resume"]) {
    $(id).disabled = busy;
  }
  $("undo").disabled = busy || records.length === 0;
  $("resign").disabled = busy || Boolean(finished) || !live;
  $("resume").disabled = busy || mode !== "computer" || game.turn() !== "b"
    || Boolean(finished) || !live;

  for (const id of ["idea", "destination", "best"]) {
    $(id).disabled = busy || position.isGameOver() || Boolean(live && resigned);
  }

  $("first").disabled = busy || cursor === 0;
  $("prev").disabled = busy || cursor === 0;
  $("next").disabled = busy || live;
  $("last").disabled = busy || live;

  const list = $("moves");
  list.replaceChildren();
  records.forEach((record, index) => {
    const button = document.createElement("button");
    button.textContent = `${Math.floor(index / 2) + 1}${index % 2 ? "…" : "."} `
      + `${record.san} · ${record.grade?.label || "—"}`;
    button.className = cursor === index + 1 ? "active" : "";
    button.disabled = busy;
    button.onclick = () => navigate(index + 1);
    list.append(button);
  });
}

function navigate(next) {
  if (busy) return;
  cursor = Math.max(0, Math.min(records.length, next));
  selected = null;
  clearHint();
  render();
}

async function promotionChoice() {
  const dialog = $("promotion");
  dialog.returnValue = "cancel";
  return new Promise(resolve => {
    dialog.addEventListener("close", () => {
      const value = dialog.returnValue;
      resolve(["q", "r", "b", "n"].includes(value) ? value : null);
    }, { once: true });
    dialog.showModal();
  });
}

async function chooseSquare(square) {
  if (busy || resigned || game.isGameOver()) return;
  if (cursor !== records.length) {
    notice("Return to Live to continue playing.");
    return;
  }
  if (mode === "computer" && game.turn() !== "w") return;

  const piece = game.get(square);
  const options = selected
    ? game.moves({ square: selected, verbose: true })
      .filter(move => move.to === square)
    : [];

  if (options.length) {
    let move = options[0];
    if (options.some(option => option.promotion)) {
      const promotion = await promotionChoice();
      if (!promotion) return;
      move = options.find(option => option.promotion === promotion);
    }
    await play(uci(move));
    return;
  }

  selected = piece?.color === game.turn() ? square : null;
  clearHint();
  renderBoard();
}

async function play(text) {
  if (busy || resigned || game.isGameOver()) return;

  const before = game.fen();
  const previousMoves = records.map(record => record.uci);
  let move;

  try {
    move = makeMove(game, text);
  } catch {
    notice("That move is not legal.");
    return;
  }

  const record = {
    before, after: game.fen(), uci: uci(move), san: move.san,
  };
  records.push(record);
  cursor = records.length;
  selected = null;
  clearHint();
  busy = true;
  notice();
  writeSave();
  render();

  let analysisSucceeded = false;
  try {
    const best = await engine.analyze(previousMoves);
    const played = text === best.best
      ? best
      : await engine.analyze(previousMoves, text);

    record.best = best;
    record.played = played;
    record.grade = classify(before, text, best, played);
    analysisSucceeded = true;
  } catch (error) {
    notice(`${error.message} The legal move has been kept.`);
  } finally {
    busy = false;
    writeSave();
    render();
  }

  if (analysisSucceeded && mode === "computer" && game.turn() === "b") {
    await computerMove();
  }
}

async function computerMove() {
  if (busy || mode !== "computer" || game.turn() !== "b"
      || game.isGameOver() || resigned || cursor !== records.length) return;

  busy = true;
  notice();
  render();

  let choice;
  try {
    choice = await engine.analyze(records.map(record => record.uci));
  } catch (error) {
    notice(error.message);
  } finally {
    busy = false;
    render();
  }

  if (choice) await play(choice.best);
}

async function showHint(type) {
  if (busy) return;
  const position = activePosition();
  if (position.isGameOver()) return;

  busy = true;
  notice();
  render();

  try {
    const analysis = await engine.analyze(
      records.slice(0, cursor).map(record => record.uci)
    );

    hint = {
      move: analysis.best,
      arrow: type === "best",
      destination: type === "destination" ? analysis.best.slice(2, 4) : null,
    };

    $("hintText").textContent = type === "idea"
      ? moveIdea(position.fen(), analysis.best)
      : type === "destination"
      ? `Look for a move to ${analysis.best.slice(2, 4)}.`
      : `Try ${lineSAN(position.fen(), [analysis.best])}. `
        + lineSAN(position.fen(), analysis.pv);
  } catch (error) {
    notice(error.message);
  } finally {
    busy = false;
    render();
  }
}

$("new").onclick = () => {
  game = new Chess();
  records = [];
  cursor = 0;
  resigned = null;
  selected = null;
  clearHint();
  notice();
  writeSave();
  render();
};

$("undo").onclick = () => {
  if (busy || !records.length) return;

  let count = 1;
  if (mode === "computer" && game.turn() === "w" && records.length >= 2) {
    count = 2;
  }
  while (count--) {
    game.undo();
    records.pop();
  }
  resigned = null;
  cursor = records.length;
  selected = null;
  clearHint();
  notice();
  writeSave();
  render();
};

$("flip").onclick = () => {
  flipped = !flipped;
  writeSave();
  render();
};

$("resign").onclick = () => {
  resigned = game.turn();
  writeSave();
  render();
};

$("save").onclick = () => writeSave(true);

$("mode").onchange = async event => {
  mode = event.target.value;
  selected = null;
  clearHint();
  writeSave();
  render();
  await computerMove();
};

$("resume").onclick = computerMove;
$("first").onclick = () => navigate(0);
$("prev").onclick = () => navigate(cursor - 1);
$("next").onclick = () => navigate(cursor + 1);
$("last").onclick = () => navigate(records.length);
$("idea").onclick = () => showHint("idea");
$("destination").onclick = () => showHint("destination");
$("best").onclick = () => showHint("best");

$("export").onclick = () => {
  const exported = new Chess();
  for (const record of records) makeMove(exported, record.uci);

  let result = "*";
  if (resigned) result = resigned === "w" ? "0-1" : "1-0";
  else if (game.isCheckmate()) result = game.turn() === "w" ? "0-1" : "1-0";
  else if (game.isDraw()) result = "1/2-1/2";

  exported.header(
    "Event", "Knightlab local game",
    "White", "Player 1",
    "Black", mode === "computer" ? "Stockfish" : "Player 2",
    "Result", result
  );

  const url = URL.createObjectURL(new Blob(
    [exported.pgn()], { type: "application/x-chess-pgn" }
  ));
  const link = document.createElement("a");
  link.href = url;
  link.download = "knightlab-game.pgn";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

async function prepareOffline() {
  if (!("serviceWorker" in navigator)) {
    $("offline").textContent = "Offline installation unavailable";
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("./sw.js");

    function checkCache() {
      const worker = navigator.serviceWorker.controller || registration.active;
      if (!worker) return;
      const channel = new MessageChannel();
      channel.port1.onmessage = event => {
        $("offline").textContent = event.data === "ready"
          ? "● Offline ready"
          : "Offline cache incomplete";
        channel.port1.close();
      };
      worker.postMessage("check-cache", [channel.port2]);
    }

    navigator.serviceWorker.addEventListener("controllerchange", checkCache);
    await navigator.serviceWorker.ready;
    checkCache();
  } catch {
    $("offline").textContent = "Offline setup failed · reload to retry";
  }
}

restore();
render();
prepareOffline();

engine.init()
  .then(() => computerMove())
  .catch(error => notice(error.message));
