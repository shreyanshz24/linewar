/* =====================
   CORE STATE
===================== */

let supply = 20;
let morale = 10;
let intel = 0;
let fatigue = 0;
let turn = 1;
let gameOver = false;
let repositionMode = false;
let selectedPiece = null;
let selectedSquare = null;
let aiDifficulty = 2;

const boardElement = document.getElementById("board");
const board = [];
const sieges = {};
const fakeEnemyUnits = [];

/* =====================
   PIECES
===================== */

const playerPieces = [
  { type: "king", row: 7, col: 4 },
  { type: "queen", row: 6, col: 3 },
  { type: "rook", row: 7, col: 0 },
  { type: "bishop", row: 7, col: 2 },
  { type: "knight", row: 7, col: 5 },
  { type: "pawn", row: 6, col: 4 }
];

const enemyPieces = [
  { type: "king", row: 0, col: 4 },
  { type: "queen", row: 1, col: 4 },
  { type: "rook", row: 0, col: 7 },
  { type: "bishop", row: 0, col: 2 },
  { type: "knight", row: 0, col: 1 },
  { type: "pawn", row: 1, col: 3 }
];

const powerMap = {
  queen: 4,
  rook: 3,
  knight: 3,
  bishop: 2,
  pawn: 1
};

/* =====================
   BOARD CREATION
===================== */

function createBoard() {
  board.length = 0;
  boardElement.innerHTML = "";

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = { row: r, col: c, enemy: false };
      const enemy = enemyPieces.find(p => p.row === r && p.col === c);
      if (enemy) square.enemy = true;

      const div = document.createElement("div");
      div.className = `square ${(r+c)%2===0?"light":"dark"}`;

      const playerHere = playerPieces.find(p => p.row===r && p.col===c);
      if (playerHere) div.innerText = playerHere.type[0].toUpperCase();

      if (enemy && isVisibleToPlayer(square)) {
        div.innerText = enemy.type[0].toUpperCase();
        div.classList.add("enemy");
      }

      const fake = fakeEnemyUnits.find(f => f.row===r && f.col===c);
      if (fake && isVisibleToPlayer(square)) div.innerText = "⚔";

      div.onclick = () => handleSquareClick(square, div);

      square.element = div;
      board.push(square);
      boardElement.appendChild(div);
    }
  }

  renderInfluence();
  renderFogOfWar();
  renderSieges();
}

/* =====================
   CLICK HANDLING
===================== */

function handleSquareClick(square, div) {
  if (repositionMode) {
    const piece = playerPieces.find(p => p.row===square.row && p.col===square.col);
    if (piece) {
      selectedPiece = piece;
      log(`Selected ${piece.type} to move.`);
      return;
    }
    if (selectedPiece && supply >= 1) {
      const dr = Math.abs(square.row - selectedPiece.row);
      const dc = Math.abs(square.col - selectedPiece.col);
      if (dr<=1 && dc<=1) {
        selectedPiece.row = square.row;
        selectedPiece.col = square.col;
        supply -= 1;
        repositionMode = false;
        selectedPiece = null;
        log("Piece repositioned.");
        createBoard();
        updateUI();
      }
    }
    return;
  }

  document.querySelectorAll(".square").forEach(s => s.classList.remove("selected"));
  div.classList.add("selected");
  selectedSquare = square;
}

/* =====================
   INFLUENCE
===================== */

function getInfluenceSquares(p) {
  const res=[];
  const push=(r,c)=>{ if(r>=0&&r<8&&c>=0&&c<8)res.push(`${r},${c}`); };

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
      .forEach(([dr,dc])=>push(p.row+dr,p.col+dc));

  return res;
}

function calculateInfluence() {
  const map={};
  const apply=(p,o)=>getInfluenceSquares(p).forEach(k=>{
    if(!map[k]) map[k]={player:0,enemy:0};
    map[k][o]++;
  });
  playerPieces.forEach(p=>apply(p,"player"));
  enemyPieces.forEach(p=>apply(p,"enemy"));
  return map;
}

function getInfluenceStatus(square){
  const m=calculateInfluence()[`${square.row},${square.col}`];
  if(!m) return "none";
  if(m.player&&m.enemy) return "contested";
  if(m.player) return "player";
  if(m.enemy) return "enemy";
  return "none";
}

function renderInfluence(){
  const inf=calculateInfluence();
  board.forEach(s=>{
    s.element.classList.remove("influence-player","influence-enemy","influence-contested");
    if(!isVisibleToPlayer(s)) return;
    const d=inf[`${s.row},${s.col}`];
    if(!d) return;
    if(d.player&&d.enemy) s.element.classList.add("influence-contested");
    else if(d.player) s.element.classList.add("influence-player");
    else if(d.enemy) s.element.classList.add("influence-enemy");
  });
}

/* =====================
   FOG
===================== */

function isVisibleToPlayer(square){
  const inf=calculateInfluence()[`${square.row},${square.col}`];
  return inf && inf.player>0;
}

function renderFogOfWar(){
  board.forEach(s=>{
    s.element.classList.toggle("fog", !isVisibleToPlayer(s));
  });
}

/* =====================
   COMBAT
===================== */

function commitLine(){
  if(!selectedSquare || gameOver) return;

  if(!isVisibleToPlayer(selectedSquare)){
    morale--; log("Attack into fog failed."); updateUI(); return;
  }

  let piece=document.getElementById("piece").value;
  let used=parseInt(document.getElementById("supplyUsed").value||0);
  if(used>supply) return;

  let power=powerMap[piece]+used-fatigue;
  const status=getInfluenceStatus(selectedSquare);

  if(status==="player") power++;
  if(status==="enemy"||status==="contested") power--;
  if(status==="none"){ power--; used++; }

  if(used>supply) return;
  supply-=used;

  if(piece==="bishop"){
    intel=Math.min(5,intel+1);
    if(intel>0){
      fakeEnemyUnits.push({row:selectedSquare.row,col:selectedSquare.col});
      intel--;
      log("Fake unit deployed.");
    }
  } else {
    if(selectedSquare.enemy && power>=4){
      const key=`${selectedSquare.row},${selectedSquare.col}`;
      if(status==="enemy"||status==="contested"){
        sieges[key]={stage:1,attacker:"player"};
        log("Enemy under siege.");
      } else {
        selectedSquare.enemy=false;
        morale++;
        log("Enemy destroyed.");
      }
    } else {
      morale--;
      log("Attack failed.");
    }
  }

  fatigue++;
  updateUI();
  createBoard();
}

/* =====================
   SIEGE
===================== */

function advanceSieges(){
  Object.keys(sieges).forEach(k=>{
    const s=sieges[k];
    if(s.attacker!=="player") return;
    s.stage++;
    if(s.stage>=3){
      const [r,c]=k.split(",").map(Number);
      const sq=board.find(x=>x.row===r&&x.col===c);
      sq.enemy=false;
      delete sieges[k];
      morale++;
      log("Siege won.");
    } else {
      morale--;
      supply--;
    }
  });
}

function renderSieges(){
  board.forEach(s=>{
    s.element.classList.remove("siege-1","siege-2","siege-3");
    const k=`${s.row},${s.col}`;
    if(sieges[k]) s.element.classList.add(`siege-${sieges[k].stage}`);
  });
}

/* =====================
   AI & TURN
===================== */

function enemyTurn(){
  if(Math.random()<0.5) morale--;
}

function endTurn(){
  if(gameOver) return;
  advanceSieges();
  enemyTurn();
  if(fatigue>0) fatigue--;
  supply=Math.min(20,supply+2);
  turn++;
  updateUI();
  createBoard();
  checkGameState();
}

/* =====================
   SAVE / LOAD
===================== */

function saveGame(){
  localStorage.setItem("linewar",JSON.stringify({
    supply,morale,intel,fatigue,turn,
    playerPieces,enemyPieces,fakeEnemyUnits,sieges
  }));
  log("Game saved.");
}

function loadGame(){
  const d=JSON.parse(localStorage.getItem("linewar"));
  if(!d) return;
  ({supply,morale,intel,fatigue,turn}=d);
  playerPieces.length=0; enemyPieces.length=0; fakeEnemyUnits.length=0;
  d.playerPieces.forEach(p=>playerPieces.push(p));
  d.enemyPieces.forEach(p=>enemyPieces.push(p));
  d.fakeEnemyUnits.forEach(f=>fakeEnemyUnits.push(f));
  Object.assign(sieges,d.sieges||{});
  createBoard();
  updateUI();
}

/* =====================
   UI
===================== */

function updateUI(){
  document.getElementById("supply").innerText=supply;
  document.getElementById("morale").innerText=morale;
  document.getElementById("intel").innerText=intel;
  document.getElementById("fatigue").innerText=fatigue;
  document.getElementById("turn").innerText=turn;
}

function log(m){
  document.getElementById("log").innerHTML+=`<div>${m}</div>`;
}

function enterRepositionMode(){
  repositionMode=true;
  log("Reposition mode.");
}

function checkGameState(){
  if(supply<=0||morale<=0){
    gameOver=true;
    const o=document.createElement("div");
    o.id="gameOver";
    o.innerHTML="<h1>GAME OVER</h1>";
    document.body.appendChild(o);
  }
}

/* =====================
   START
===================== */

createBoard();
updateUI();
