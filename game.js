/* 奶蛙扫雷 —— 纯 JavaScript 版 */
"use strict";

/* ==================== 可调参数 ==================== */
const CELL = 32;
const TOP_BAR = 56;
const MENU_W = 420, MENU_H = 340;
const DIFFICULTIES = [
    ["低", 9, 9, 10],
    ["中", 16, 16, 40],
    ["高", 30, 16, 99],
];

/* 奶蛙暖色系 */
const COLOR_BG = "#e8e0c8";
const COLOR_CELL = "#e8e0c8";
const COLOR_CELL_LIGHT = "#faf6e6";
const COLOR_CELL_DARK = "#a69b80";
const COLOR_OPEN = "#f3eedc";
const COLOR_BAR = "#92866c";
const COLOR_BTN_HOVER = "#dad0b4";
const COLOR_GOLD = "#ffd94a";
const COLOR_SHADOW = "#463a20";

const NUMBER_COLORS = {
    1: "#0000ff", 2: "#008000", 3: "#ff0000", 4: "#000080",
    5: "#800000", 6: "#008080", 7: "#000000", 8: "#808080",
};

/* ==================== 全局状态 ==================== */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let state = "menu";          // menu | playing
let COLS = 9, ROWS = 9, MINES = 10;
let board = null;
let started = false, game_over = false, win = false;
let flags = 0, elapsed = 0, startTicks = 0;
let flagMode = false;
let stateAt = 0;             // 状态切换时刻:切换后短暂忽略点击,防误触/事件重复
let logW = MENU_W, logH = MENU_H;   // 当前逻辑画布尺寸
let hover = { x: -1, y: -1 };

const images = {};           // 名称 -> Image
let boomSound = null;

/* ==================== 工具 ==================== */
function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function bevel(x, y, w, h, r) {
    // 经典扫雷凸起:上/左亮边,下/右暗边
    ctx.strokeStyle = COLOR_CELL_LIGHT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + h - 1);
    ctx.lineTo(x + 1, y + 1);
    ctx.lineTo(x + w - 1, y + 1);
    ctx.stroke();
    ctx.strokeStyle = COLOR_CELL_DARK;
    ctx.beginPath();
    ctx.moveTo(x + w - 1, y + 1);
    ctx.lineTo(x + w - 1, y + h - 1);
    ctx.lineTo(x + 1, y + h - 1);
    ctx.stroke();
}

function drawLED(marginX, text, align) {
    ctx.font = "bold 22px 'Microsoft YaHei', sans-serif";
    const w = ctx.measureText(text).width + 16;
    const h = 32;
    const box = { x: align === "right" ? COLS * CELL - marginX - w : marginX, y: (TOP_BAR - h) / 2, w, h };
    ctx.fillStyle = "#463a20";
    roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.strokeStyle = COLOR_CELL_DARK;
    ctx.lineWidth = 2;
    roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.stroke();
    ctx.fillStyle = COLOR_GOLD;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, box.x + box.w / 2, box.y + box.h / 2 + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    return box;
}

/* ==================== 棋盘逻辑(与 Python 版一致) ==================== */
function makeBoard() {
    return Array.from({ length: ROWS }, () =>
        Array.from({ length: COLS }, () => ({ mine: false, revealed: false, flagged: false, adj: 0 })));
}

function placeMines(safeR, safeC) {
    const forbidden = new Set();
    for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
            forbidden.add((safeR + dr) + "," + (safeC + dc));
    let candidates = [];
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
            if (!forbidden.has(r + "," + c)) candidates.push([r, c]);
    if (candidates.length < MINES) {
        candidates = [];
        for (let r = 0; r < ROWS; r++)
            for (let c = 0; c < COLS; c++)
                if (r !== safeR || c !== safeC) candidates.push([r, c]);
    }
    // 洗牌取前 MINES 个
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (let i = 0; i < MINES; i++) board[candidates[i][0]][candidates[i][1]].mine = true;
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
            if (board[r][c].mine) continue;
            let n = 0;
            for (let dr = -1; dr <= 1; dr++)
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc].mine) n++;
                }
            board[r][c].adj = n;
        }
}

function revealCell(r, c) {
    const stack = [[r, c]];
    while (stack.length) {
        const [cr, cc] = stack.pop();
        const cur = board[cr][cc];
        if (cur.revealed || cur.flagged || cur.mine) continue;
        cur.revealed = true;
        if (cur.adj === 0) {
            for (let dr = -1; dr <= 1; dr++)
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = cr + dr, nc = cc + dc;
                    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                        const nxt = board[nr][nc];
                        if (!nxt.revealed && !nxt.flagged && !nxt.mine) stack.push([nr, nc]);
                    }
                }
        }
    }
}

/* ==================== 资源加载 ==================== */
function loadImage(name, src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { images[name] = img; resolve(); };
        img.onerror = () => resolve();
        img.src = src;
    });
}

function setupSound() {
    try {
        const ogg = new Audio("assets/explosion.ogg");
        const wav = new Audio("assets/explosion.wav");
        if (ogg.canPlayType("audio/ogg")) boomSound = ogg;
        else if (wav.canPlayType("audio/wav")) boomSound = wav;
        else boomSound = ogg;
    } catch (e) { boomSound = null; }
}

/* bomb.jpg 白底抠透明(与 Python 版同一阈值);失败则直接用原图 */
function keyoutWhite(img) {
    try {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const cx = c.getContext("2d");
        cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, c.width, c.height);
        const p = d.data;
        for (let i = 0; i < p.length; i += 4) {
            if (p[i] > 228 && p[i + 1] > 228 && p[i + 2] > 228) p[i + 3] = 0;
        }
        cx.putImageData(d, 0, 0);
        return c;
    } catch (e) { return img; }
}

/* ==================== 游戏流程 ==================== */
function startGame(cols, rows, mines) {
    COLS = cols; ROWS = rows; MINES = mines;
    board = makeBoard();
    started = game_over = win = false;
    flags = 0; elapsed = 0; startTicks = 0;
    flagMode = false;
    state = "playing";
    stateAt = performance.now();
}

function backToMenu() { state = "menu"; stateAt = performance.now(); }

function hitMine(r, c) {
    game_over = true;
    board[r][c].revealed = true;
    if (boomSound) { try { boomSound.currentTime = 0; boomSound.play(); } catch (e) {} }
    for (let rr = 0; rr < ROWS; rr++)
        for (let cc = 0; cc < COLS; cc++)
            if (board[rr][cc].mine && !board[rr][cc].flagged) board[rr][cc].revealed = true;
}

function toggleFlag(r, c) {
    const cell = board[r][c];
    if (cell.revealed) return;
    if (!cell.flagged && flags >= MINES) return;
    cell.flagged = !cell.flagged;
    flags += cell.flagged ? 1 : -1;
}

/* ==================== 坐标换算 ==================== */
function toLogical(px, py) {
    const s = Math.min(canvas.width / logW, canvas.height / logH);
    const ox = (canvas.width - logW * s) / 2;
    const oy = (canvas.height - logH * s) / 2;
    return [(px - ox) / s, (py - oy) / s];
}

/* ==================== 输入 ==================== */
canvas.addEventListener("pointerdown", (e) => {
    // 状态切换后 300ms 内忽略点击:防止一次点击同时触发"开始游戏"和"翻开格子"
    if (performance.now() - stateAt < 300) return;
    const [mx, my] = toLogical(e.clientX, e.clientY);
    if (state === "menu") {
        for (const b of menuBtns()) {
            if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
                startGame(b.c, b.r, b.m);
                return;
            }
        }
        return;
    }
    // 对局中:顶栏
    if (my < TOP_BAR) {
        const flagBtn = flagButtonRect();
        const faceBtn = faceButtonRect();
        const backBtn = backButtonRect();
        const inR = (p) => mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h;
        if (inR(flagBtn)) flagMode = !flagMode;
        else if (inR(faceBtn)) startGame(COLS, ROWS, MINES);
        else if (inR(backBtn)) backToMenu();
        return;
    }
    if (game_over || win) return;
    const c = Math.floor(mx / CELL), r = Math.floor((my - TOP_BAR) / CELL);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    const cell = board[r][c];
    if (flagMode) { toggleFlag(r, c); return; }
    if (cell.flagged) return;
    if (!started) {
        placeMines(r, c);
        started = true;
        startTicks = performance.now();
    }
    if (cell.mine) hitMine(r, c);
    else {
        revealCell(r, c);
        const safeTotal = ROWS * COLS - MINES;
        let opened = 0;
        for (let rr = 0; rr < ROWS; rr++)
            for (let cc = 0; cc < COLS; cc++)
                if (board[rr][cc].revealed && !board[rr][cc].mine) opened++;
        if (opened === safeTotal) { win = true; flags = MINES; }
    }
});

canvas.addEventListener("pointermove", (e) => {
    const [mx, my] = toLogical(e.clientX, e.clientY);
    hover.x = mx; hover.y = my;
});
canvas.addEventListener("pointerleave", () => { hover.x = hover.y = -1; });

window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state === "playing") backToMenu();
});

/* ==================== 布局矩形 ==================== */
function menuBtns() {
    const w = 280, h = 56, gap = 18;
    return DIFFICULTIES.map(([name, c, r, m], i) => ({
        x: (MENU_W - w) / 2, y: 110 + i * (h + gap), w, h, name, c, r, m,
    }));
}
function flagButtonRect() { return { x: COLS * CELL / 2 - 25 - 54, y: 6, w: 44, h: TOP_BAR - 12 }; }
function faceButtonRect() { return { x: COLS * CELL / 2 - 25, y: 8, w: 50, h: TOP_BAR - 16 }; }
function backButtonRect() { return { x: COLS * CELL / 2 + 25 + 10, y: 6, w: 44, h: TOP_BAR - 12 }; }

/* ==================== 绘制 ==================== */
function drawMenu() {
    // 背景:模糊的奶蛙图 + 半透明暖灰遮罩
    if (images.menu_bg) {
        ctx.save();
        ctx.filter = "blur(10px)";
        ctx.drawImage(images.menu_bg, -14, -14, MENU_W + 28, MENU_H + 28);
        ctx.restore();
        ctx.fillStyle = "rgba(138, 128, 106, 0.51)";
        ctx.fillRect(0, 0, MENU_W, MENU_H);
    } else {
        ctx.fillStyle = COLOR_BG;
        ctx.fillRect(0, 0, MENU_W, MENU_H);
    }
    // 标题横幅
    ctx.fillStyle = "rgba(70, 58, 32, 0.59)";
    roundRect((MENU_W - 340) / 2, 16, 340, 96, 14);
    ctx.fill();
    ctx.font = "bold 44px 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    const tx = MENU_W / 2;
    ctx.fillStyle = COLOR_SHADOW;
    ctx.fillText("奶蛙扫雷", tx + 3, 72);
    ctx.fillStyle = COLOR_GOLD;
    ctx.fillText("奶蛙扫雷", tx, 69);
    ctx.font = "18px 'Microsoft YaHei', sans-serif";
    ctx.fillStyle = COLOR_SHADOW;
    ctx.fillText("选择难度开始游戏", tx + 2, 102);
    ctx.fillStyle = "#f0f0f0";
    ctx.fillText("选择难度开始游戏", tx, 100);
    ctx.textAlign = "left";
    // 难度按钮
    for (const b of menuBtns()) {
        const hov = hover.x >= b.x && hover.x <= b.x + b.w && hover.y >= b.y && hover.y <= b.y + b.h;
        ctx.fillStyle = hov ? COLOR_BTN_HOVER : COLOR_CELL;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = COLOR_CELL_LIGHT;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x + 1, b.y + b.h - 1);
        ctx.lineTo(b.x + 1, b.y + 1);
        ctx.lineTo(b.x + b.w - 1, b.y + 1);
        ctx.stroke();
        ctx.strokeStyle = COLOR_CELL_DARK;
        ctx.beginPath();
        ctx.moveTo(b.x + b.w - 1, b.y + 1);
        ctx.lineTo(b.x + b.w - 1, b.y + b.h - 1);
        ctx.lineTo(b.x + 1, b.y + b.h - 1);
        ctx.stroke();
        ctx.font = "24px 'Microsoft YaHei', sans-serif";
        ctx.fillStyle = "#141414";
        ctx.textAlign = "center";
        ctx.fillText(`${b.name}   ${b.c}×${b.r} · ${b.m}雷`, b.x + b.w / 2, b.y + b.h / 2 + 8);
        ctx.textAlign = "left";
    }
}

function drawLEDNumber(n) { return String(Math.max(0, Math.min(999, n))).padStart(3, "0"); }

function drawGame() {
    const topW = COLS * CELL;
    ctx.fillStyle = COLOR_BAR;
    ctx.fillRect(0, 0, topW, TOP_BAR);

    // 剩余雷数
    drawLED(6, drawLEDNumber(MINES - flags), "left");
    // 插旗模式按钮
    const fb = flagButtonRect();
    ctx.fillStyle = flagMode ? COLOR_GOLD : COLOR_CELL;
    roundRect(fb.x, fb.y, fb.w, fb.h, 8); ctx.fill();
    ctx.strokeStyle = flagMode ? COLOR_SHADOW : COLOR_CELL_LIGHT;
    ctx.lineWidth = 2;
    roundRect(fb.x, fb.y, fb.w, fb.h, 8); ctx.stroke();
    if (images.flag) {
        ctx.drawImage(images.flag, fb.x + fb.w / 2 - 12, fb.y + fb.h / 2 - 12, 24, 24);
    } else {
        ctx.strokeStyle = "#505050"; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(fb.x + fb.w / 2 - 4, fb.y + 6);
        ctx.lineTo(fb.x + fb.w / 2 - 4, fb.y + fb.h - 6);
        ctx.stroke();
        ctx.fillStyle = "#dc1e1e";
        ctx.beginPath();
        ctx.moveTo(fb.x + fb.w / 2 - 4, fb.y + 6);
        ctx.lineTo(fb.x + fb.w / 2 + 12, fb.y + 11);
        ctx.lineTo(fb.x + fb.w / 2 - 4, fb.y + 16);
        ctx.fill();
    }
    // 重开按钮(奶蛙脸)
    const fbtn = faceButtonRect();
    if (images.face_play) {
        ctx.drawImage(game_over && images.face_dead ? images.face_dead : images.face_play, fbtn.x, fbtn.y, fbtn.w, fbtn.h);
    } else {
        ctx.fillStyle = COLOR_CELL;
        ctx.fillRect(fbtn.x, fbtn.y, fbtn.w, fbtn.h);
        ctx.strokeStyle = COLOR_CELL_LIGHT;
        ctx.strokeRect(fbtn.x + 1, fbtn.y + 1, fbtn.w - 2, fbtn.h - 2);
    }
    // 回退按钮(脸的右侧,与旗子按钮对称):点击回到难度选择
    const bb = backButtonRect();
    ctx.fillStyle = COLOR_CELL;
    roundRect(bb.x, bb.y, bb.w, bb.h, 8); ctx.fill();
    ctx.strokeStyle = COLOR_CELL_LIGHT; ctx.lineWidth = 2;
    roundRect(bb.x, bb.y, bb.w, bb.h, 8); ctx.stroke();
    if (images.back) {
        const bimg = images.back;
        const bs = Math.min((bb.w - 6) / bimg.width, (bb.h - 6) / bimg.height);
        const bw = bimg.width * bs, bh = bimg.height * bs;
        ctx.drawImage(bimg, bb.x + (bb.w - bw) / 2, bb.y + (bb.h - bh) / 2, bw, bh);
    } else {
        ctx.font = "bold 20px sans-serif";
        ctx.fillStyle = "#505050";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("←", bb.x + bb.w / 2, bb.y + bb.h / 2);
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    }
    // 计时器
    drawLED(6, drawLEDNumber(elapsed), "right");

    // 棋盘
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = board[r][c];
            const x = c * CELL, y = TOP_BAR + r * CELL;
            if (cell.revealed) {
                ctx.fillStyle = COLOR_OPEN;
                ctx.fillRect(x, y, CELL, CELL);
                ctx.strokeStyle = COLOR_CELL_DARK;
                ctx.lineWidth = 1;
                ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
                if (cell.mine) {
                    if (images.bomb) ctx.drawImage(images.bomb, x + 4, y + 4, CELL - 8, CELL - 8);
                    else {
                        ctx.fillStyle = "#404040";
                        ctx.beginPath();
                        ctx.arc(x + CELL / 2, y + CELL / 2, CELL / 2 - 5, 0, 7);
                        ctx.fill();
                    }
                } else if (cell.adj > 0) {
                    ctx.font = "bold 20px 'Microsoft YaHei', sans-serif";
                    ctx.fillStyle = NUMBER_COLORS[cell.adj];
                    ctx.textAlign = "center";
                    ctx.fillText(String(cell.adj), x + CELL / 2, y + CELL / 2 + 7);
                    ctx.textAlign = "left";
                }
            } else {
                ctx.fillStyle = COLOR_CELL;
                ctx.fillRect(x, y, CELL, CELL);
                bevel(x, y, CELL, CELL);
                if (cell.flagged) {
                    if (images.flag) {
                        ctx.drawImage(images.flag, x + (CELL - 28) / 2, y + (CELL - 28) / 2, 28, 28);
                    } else {
                        const px = x + CELL / 2;
                        ctx.strokeStyle = "#505050"; ctx.lineWidth = 2;
                        ctx.beginPath(); ctx.moveTo(px, y + 6); ctx.lineTo(px, y + CELL - 8); ctx.stroke();
                        ctx.fillStyle = "#dc1e1e";
                        ctx.beginPath();
                        ctx.moveTo(px, y + 6); ctx.lineTo(px + 10, y + 10); ctx.lineTo(px, y + 14);
                        ctx.fill();
                    }
                }
            }
        }
    }
}

function drawLEDNumber2() { return 6; }  // 计时器右留白

/* ==================== 主循环 ==================== */
let lastTick = 0;
function frame(now) {
    // 计时
    if (state === "playing" && started && !game_over && !win) {
        elapsed = Math.floor((now - startTicks) / 1000);
    }
    // 本帧逻辑尺寸
    if (state === "menu") { logW = MENU_W; logH = MENU_H; }
    else { logW = COLS * CELL; logH = TOP_BAR + ROWS * CELL; }

    // 窗口尺寸
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 逻辑画布:等比缩放居中
    const s = Math.min(canvas.width / logW, canvas.height / logH);
    const ox = (canvas.width - logW * s) / 2;
    const oy = (canvas.height - logH * s) / 2;
    ctx.translate(ox, oy);
    ctx.scale(s, s);

    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, logW, logH);
    if (state === "menu") drawMenu(); else drawGame();

    requestAnimationFrame(frame);
}

/* ==================== 启动 ==================== */
(async function boot() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    setupSound();
    await Promise.all([
        loadImage("menu_bg", "assets/menu_bg.jpg"),
        loadImage("face_play", "assets/face_play.jpg"),
        loadImage("face_dead", "assets/face_dead.jpg"),
        loadImage("flag", "assets/flag.png"),
        loadImage("bomb", "assets/bomb.jpg"),
        loadImage("back", "assets/back.png"),
    ]);
    if (images.bomb) images.bomb = keyoutWhite(images.bomb);
    if (images.flag) images.flag = keyoutWhite(images.flag);
    requestAnimationFrame(frame);
})();
