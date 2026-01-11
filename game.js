/* ========= CORE STATE ========= */

let supply = 20;
let morale = 10;
let fatigue = 0;
let turn = 1;
let gameOver = false;

let repositionMode = false;
let selectedPiece = null;
let selectedSquare = null;

const boardElement = document.getElementById("board");
const board = [];

/* ========= PIECES (SINGLE SOURCE OF TRUTH) ========= */

const playerPieces = [
  { type: "rook", row: 7, col: 0 },
  { type: "bishop", row: 7, col: 2 },
  { type: "queen", row: 6, col: 3 },
  { type: "pawn", row: 6, col: 4 },
  { type: "king", row: 7, col: 4 },
  { type: "knight", row: 7, col: 5 }
];

const enemyPieces = [
  { type: "king", row: 0, col: 4 },
  { type: "queen", row: 1, col: 4 },
  { type: "rook", row: 0, col: 7 },
  { type: "bishop", row: 0, col: 2 },
  { type: "knight", row: 0, col: 1 },
  { type: "pawn", row: 1, col: 3 }
];

const powerMap = { queen:4, rook:3, knight:3, bishop:2, pawn:1 };

/* ========= SIEGES ========= */
/* key "r,c" → { turns: number } */
const sieges = {};

/* ========= BOARD RENDER ========= */

function createBoard() {
  board.length = 0;
  boardElement.innerHTML = "";

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const div = document.createElement("div");
      div.className = `square ${(r + c) % 2 === 0 ? "light" : "dark"}`;

      const player = playerPieces.find(p => p.row === r && p.col === c);
      const enemy = enemyPieces.find(p => p.row === r && p.col === c);

      if (player) {
        div.innerText = player.type[0].toUpperCase();
      } else if (enemy) {
        div.innerText = enemy.type[0].toUpperCase();
        div.classList.add("enemy");
      }

      const key = `${r},${c}`;
      if (sieges[key]) div.classList.add("siege");

      const square = { row: r, col: c, element: div };
      div.onclick = () => selectSquare(square, div);

      board.push(square);
      boardElement.appendChild(div);
    }
  }

  renderInfluence();
}

/* ========= INPUT ========= */

function selectSquare(square, div) {
  document.querySelectorAll(".square").forEach(s => s.classList.remove("selected"));
  div.classList.add("selected");
  selectedSquare = square;

  if (repositionMode) {
    const piece = playerPieces.find(p => p.row === square.row && p.col === square.col);
    if (piece) {
      selectedPiece = piece;
      log("Piece selected for reposition.");
    } else if (selectedPiece) {
      attemptMove(square);
    }
  }
}

function attemptMove(target) {
  const dr = Math.abs(target.row - selectedPiece.row);
  const dc = Math.abs(target.col - selectedPiece.col);
  if (dr <= 1 && dc <= 1 && supply >= 2) {
    selectedPiece.row = target.row;
    selectedPiece.col = target.col;
    supply -= 2;
    repositionMode = false;
    selectedPiece = null;
    log("Piece repositioned (−2 Supply).");
    update();
  }
}

/* ========= INFLUENCE ========= */

function getInfluenceSquares(p) {
  const res = [];
  const push = (r,c) => r>=0&&r<8&&c>=0&&c<8&&res.push(`${r},${c}`);

  if (p.type==="king"||p.type==="pawn")
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++) if(dr||dc) push(p.row+dr,p.col+dc);

  if (p.type==="queen")
    for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++) if(dr||dc) push(p.row+dr,p.col+dc);

  if (p.type==="rook")
    for(let i=0;i<8;i++){ push(p.row,i); push(i,p.col); }

  if (p.type==="bishop")
    for(let i=-7;i<=7;i++){ push(p.row+i,p.col+i); push(p.row+i,p.col-i); }

  if (p.type==="knight")
    [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]
      .forEach(([dr,dc]) => push(p.row+dr,p.col+dc));

  return res;
}

function renderInfluence() {
  const map = {};
  playerPieces.forEach(p => getInfluenceSquares(p).forEach(k => map[k] = (map[k]||0)+1));
  enemyPieces.forEach(p => getInfluenceSquares(p).forEach(k => map[k] = (map[k]||0)-1));

  board.forEach(s => {
    s.element.classList.remove("influence-player","influence-enemy","influence-contested");
    const v = map[`${s.row},${s.col}`];
    if (v > 0) s.element.classList.add("influence-player");
    else if (v < 0) s.element.classList.add("influence-enemy");
  });
}

/* ========= COMBAT & SIEGE ========= */

function commitLine() {
  if (!selectedSquare || gameOver) return;

  const piece = document.getElementById("piece").value;
  const used = parseInt(document.getElementById("supplyUsed").value || 0);
  if (used > supply) return;

  supply -= used;
  fatigue++;
  const power = powerMap[piece] + used - fatigue;

  const idx = enemyPieces.findIndex(
    p => p.row === selectedSquare.row && p.col === selectedSquare.col
  );

  if (idx !== -1 && power >= 4) {
    const key = `${selectedSquare.row},${selectedSquare.col}`;
    sieges[key] = sieges[key] || { turns: 0 };
    log("Siege initiated.");
  } else {
    morale--;
    log("Attack failed (−1 Morale).");
  }

  update();
}

function advanceSieges() {
  Object.keys(sieges).forEach(k => {
    sieges[k].turns++;
    if (sieges[k].turns >= 2) {
      const [r,c] = k.split(",").map(Number);
      const idx = enemyPieces.findIndex(p => p.row===r && p.col===c);
      if (idx !== -1) {
        enemyPieces.splice(idx,1);
        morale++;
        log("Siege successful (+1 Morale).");
      }
      delete sieges[k];
    }
  });
}

/* ========= ENEMY AI ========= */

function enemyTurn() {
  const difficulty = parseInt(document.getElementById("difficulty").value);
  const influence = {};

  playerPieces.forEach(p => getInfluenceSquares(p).forEach(k => influence[k]=(influence[k]||0)+1));
  enemyPieces.forEach(p => getInfluenceSquares(p).forEach(k => influence[k]=(influence[k]||0)-1));

  // Pressure King if exposed
  const king = playerPieces.find(p=>p.type==="king");
  const kKey = `${king.row},${king.col}`;
  if (influence[kKey] < 0 && difficulty > 0) {
    morale -= difficulty;
    log("Enemy pressures your King.");
  }

  // Try to break sieges
  Object.keys(sieges).forEach(k => {
    if (Math.random() < 0.3 + difficulty*0.2) {
      delete sieges[k];
      log("Enemy disrupts a siege.");
    }
  });

  // Expand influence on Hard
  if (difficulty === 2) {
    const mover = enemyPieces.find(p => p.type !== "king");
    if (mover && mover.row < 7) {
      mover.row++;
      log("Enemy repositions to expand control.");
    }
  }
}

/* ========= TURN / WIN ========= */

function endTurn() {
  advanceSieges();
  enemyTurn();

  supply = Math.min(20, supply + 1);
  if (fatigue > 0) fatigue--;

  turn++;
  update();
  checkWin();
}

function checkWin() {
  const enemyKing = enemyPieces.find(p => p.type==="king");
  const playerKing = playerPieces.find(p => p.type==="king");

  if (!enemyKing || enemyPieces.length === 0 || Object.keys(sieges).length >= 3) {
    endGame("YOU WIN — ENEMY COLLAPSED");
  }
  if (!playerKing || morale <= 0 || supply <= 0) {
    endGame("YOU LOSE — YOUR FORCES COLLAPSED");
  }
}

function endGame(msg) {
  gameOver = true;
  const o = document.createElement("div");
  o.id = "gameOver";
  o.innerHTML = `<h1>${msg}</h1>`;
  document.body.appendChild(o);
}

/* ========= SAVE / UI ========= */

function saveGame() {
  localStorage.setItem("linewar", JSON.stringify({
    supply, morale, fatigue, turn, playerPieces, enemyPieces, sieges
  }));
  log("Game saved.");
}

function loadGame() {
  const d = JSON.parse(localStorage.getItem("linewar"));
  if (!d) return;

  ({ supply, morale, fatigue, turn } = d);
  playerPieces.length = 0;
  enemyPieces.length = 0;
  Object.assign(sieges, d.sieges || {});
  d.playerPieces.forEach(p => playerPieces.push(p));
  d.enemyPieces.forEach(p => enemyPieces.push(p));
  update();
}

function update() {
  document.getElementById("turn").innerText = turn;
  document.getElementById("supply").innerText = supply;
  document.getElementById("morale").innerText = morale;
  document.getElementById("fatigue").innerText = fatigue;
  createBoard();
}

function log(msg) {
  document.getElementById("log").innerHTML += `<div>• ${msg}</div>`;
}

function enterRepositionMode() {
  repositionMode = true;
  selectedPiece = null;
  log("Reposition mode active.");
}

/* ========= START ========= */

createBoard();
update();
