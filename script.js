// DOM Elements
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const btnAdd = document.getElementById('btn-add');
const btnDemo = document.getElementById('btn-demo');
const btnStart = document.getElementById('btn-start');
const btnNext = document.getElementById('btn-next');
const btnPrev = document.getElementById('btn-prev');
const btnAnimate = document.getElementById('btn-animate');
const btnRestart = document.getElementById('btn-restart');
const btnReset = document.getElementById('btn-reset');
const btnDownload = document.getElementById('btn-download');
const btnLockCanvas = document.getElementById('btn-lock-canvas');
const inputX = document.getElementById('input-x');
const inputY = document.getElementById('input-y');
const pointsCountSpan = document.getElementById('points-count');
const pointsCountTab = document.getElementById('points-count-tab');
const pointsUl = document.getElementById('points-ul');
const statusText = document.getElementById('status-text');
const logTextBox = document.getElementById('log-text');
const themeSelect = document.getElementById('theme-select');

// Tabs setup
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.add('hidden'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.remove('hidden');
    });
});

// State Variables
let points = [];        
let pointIdCounter = 0;
let state = 'INPUT';    
let currentSteps = [];  
let stepIndex = 0;
let animationInterval = null;
let isCanvasLocked = false;

// Colors
let colors = {};

function updateColors() {
    const style = getComputedStyle(document.body);
    colors = {
        bg: style.getPropertyValue('--canvas-bg').trim() || '#1a1a2e',
        grid: style.getPropertyValue('--grid-color').trim() || 'rgba(255, 255, 255, 0.05)',
        text: style.getPropertyValue('--text-color').trim() || '#e94560',
        pointNormal: style.getPropertyValue('--point-normal').trim() || '#ffffff',
        pointP0: style.getPropertyValue('--point-p0').trim() || '#ffcc00',
        pointActive: style.getPropertyValue('--point-active').trim() || '#00ffcc',
        pointHull: style.getPropertyValue('--point-hull').trim() || '#e94560',
        lineCheck: style.getPropertyValue('--line-check').trim() || 'rgba(0, 255, 204, 0.5)',
        lineHull: style.getPropertyValue('--line-hull').trim() || '#e94560',
    };
    draw();
}

function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    draw();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
setTimeout(updateColors, 100);

// Theming setup
const savedTheme = localStorage.getItem('grahamScanTheme') || 'dark';
themeSelect.value = savedTheme;
document.documentElement.setAttribute('data-theme', savedTheme);

themeSelect.addEventListener('change', (e) => {
    document.documentElement.setAttribute('data-theme', e.target.value);
    localStorage.setItem('grahamScanTheme', e.target.value);
    setTimeout(updateColors, 50);
});

// Canvas Lock Toggle
btnLockCanvas.addEventListener('click', () => {
    isCanvasLocked = !isCanvasLocked;
    if (isCanvasLocked) {
        btnLockCanvas.innerHTML = '🔒 Canvas Locked';
        btnLockCanvas.classList.add('locked');
        canvas.style.cursor = 'not-allowed';
    } else {
        btnLockCanvas.innerHTML = '🔓 Canvas Unlocked';
        btnLockCanvas.classList.remove('locked');
        canvas.style.cursor = 'crosshair';
    }
});

// --- Scaling & Transformations ---
function getTransform() {
    if (points.length === 0) return { scale: 1, offsetX: canvas.width/2, offsetY: canvas.height/2 };
    let minX = Math.min(...points.map(p => p.x));
    let maxX = Math.max(...points.map(p => p.x));
    let minY = Math.min(...points.map(p => p.y));
    let maxY = Math.max(...points.map(p => p.y));

    if (minX === maxX) { minX -= 10; maxX += 10; }
    if (minY === maxY) { minY -= 10; maxY += 10; }

    const padding = 50;
    const scaleX = (canvas.width - 2 * padding) / (maxX - minX);
    const scaleY = (canvas.height - 2 * padding) / (maxY - minY);
    const scale = Math.min(scaleX, scaleY);

    const offsetX = padding - minX * scale + (canvas.width - 2 * padding - (maxX - minX) * scale) / 2;
    const offsetY = padding - minY * scale + (canvas.height - 2 * padding - (maxY - minY) * scale) / 2;

    return { scale, offsetX, offsetY };
}

function toScreen(x, y, transform) {
    return {
        x: x * transform.scale + transform.offsetX,
        y: canvas.height - (y * transform.scale + transform.offsetY)
    };
}

function fromScreen(sx, sy, transform) {
    return {
        x: (sx - transform.offsetX) / transform.scale,
        y: ((canvas.height - sy) - transform.offsetY) / transform.scale
    };
}

// --- Drawing ---
function draw() {
    ctx.fillStyle = colors.bg || '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw Grid Background
    ctx.strokeStyle = colors.grid || 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for(let x=0; x<=canvas.width; x+=50) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
    for(let y=0; y<=canvas.height; y+=50) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }

    const tf = getTransform();

    if (state === 'INPUT') {
        points.forEach(p => drawPoint(toScreen(p.x, p.y, tf), colors.pointNormal, p.id));
    } else {
        if (currentSteps.length === 0) return;
        const snap = currentSteps[stepIndex];
        
        // Sorting check lines
        if (snap.state === 'SORTING' && snap.p0) {
            ctx.strokeStyle = colors.lineCheck;
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            let sP0 = toScreen(snap.p0.x, snap.p0.y, tf);
            snap.points.forEach(p => {
                if(p !== snap.p0) {
                    let sP = toScreen(p.x, p.y, tf);
                    ctx.beginPath();
                    ctx.moveTo(sP0.x, sP0.y);
                    ctx.lineTo(sP.x, sP.y);
                    ctx.stroke();
                }
            });
            ctx.setLineDash([]);
        }

        // Points
        snap.points.forEach(p => {
            let color = colors.pointNormal;
            if (p === snap.p0) color = colors.pointP0;
            else if (snap.hull && snap.hull.includes(p)) color = colors.pointHull;
            else if (p === snap.activePoint) color = colors.pointActive;
            drawPoint(toScreen(p.x, p.y, tf), color, p.id);
        });

        // Convex Hull
        if (snap.hull && snap.hull.length > 0) {
            ctx.strokeStyle = colors.lineHull;
            ctx.lineWidth = 2;
            ctx.beginPath();
            let sH0 = toScreen(snap.hull[0].x, snap.hull[0].y, tf);
            ctx.moveTo(sH0.x, sH0.y);
            for(let i=1; i<snap.hull.length; i++) {
                let sHi = toScreen(snap.hull[i].x, snap.hull[i].y, tf);
                ctx.lineTo(sHi.x, sHi.y);
            }
            if (snap.state === 'DONE' && snap.hull.length > 2) {
                ctx.lineTo(sH0.x, sH0.y);
            }
            ctx.stroke();
            
            // Checking line
            if (snap.checkingLine) {
                ctx.strokeStyle = colors.lineCheck;
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                let sC1 = toScreen(snap.checkingLine.p1.x, snap.checkingLine.p1.y, tf);
                let sC2 = toScreen(snap.checkingLine.p2.x, snap.checkingLine.p2.y, tf);
                ctx.moveTo(sC1.x, sC1.y);
                ctx.lineTo(sC2.x, sC2.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }
}

function drawPoint(screenPos, color, id) {
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = colors.bg;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 12px Courier New';
    ctx.fillText(`P${id}`, screenPos.x + 8, screenPos.y - 8);
}

// --- Interaction ---
function addPoint(x, y) {
    if (state !== 'INPUT') return;
    const p = { x, y, id: pointIdCounter++ };
    points.push(p);
    updatePointsList();
    draw();
}

function updatePointsList() {
    pointsCountSpan.textContent = points.length;
    pointsCountTab.textContent = points.length;
    pointsUl.innerHTML = '';
    
    points.forEach((p, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>P${p.id}: (${(p.x).toFixed(1)}, ${(p.y).toFixed(1)})</span>
                        <button class="btn-delete-point" data-index="${index}">X</button>`;
        pointsUl.appendChild(li);
    });
    
    // Bind delete buttons
    document.querySelectorAll('.btn-delete-point').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (state !== 'INPUT') return;
            const idx = parseInt(e.target.dataset.index);
            points.splice(idx, 1);
            updatePointsList();
            draw();
        });
    });
    
    pointsUl.scrollTop = pointsUl.scrollHeight;
}

canvas.addEventListener('mousedown', (e) => {
    if (state !== 'INPUT') return;
    if (isCanvasLocked) return; // Prevent clicks when locked
    
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const logP = fromScreen(sx, sy, getTransform());
    addPoint(logP.x, logP.y);
});

btnAdd.addEventListener('click', () => {
    const x = parseFloat(inputX.value);
    const y = parseFloat(inputY.value);
    if (!isNaN(x) && !isNaN(y)) {
        addPoint(x, y);
        inputX.value = '';
        inputY.value = '';
    }
});

btnDemo.addEventListener('click', () => {
    if (state !== 'INPUT') return;
    points = [];
    pointIdCounter = 0;
    
    const numPoints = Math.floor(Math.random() * 6) + 15;
    for(let i=0; i<numPoints; i++) {
        addPoint(
            Math.round(Math.random() * 1000 - 500),
            Math.round(Math.random() * 1000 - 500)
        );
    }
});

// Resets EVERYTHING
btnReset.addEventListener('click', () => {
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
    points = [];
    pointIdCounter = 0;
    state = 'INPUT';
    currentSteps = [];
    stepIndex = 0;
    
    btnStart.disabled = false;
    btnNext.disabled = true;
    btnPrev.disabled = true;
    btnAnimate.disabled = true;
    btnRestart.disabled = true;
    btnDownload.disabled = true;
    btnAdd.disabled = false;
    btnDemo.disabled = false;
    inputX.disabled = false;
    inputY.disabled = false;
    
    statusText.innerHTML = "Welcome! Add points by clicking on the canvas or using the input fields.<br/>Click 'Load Demo Points' for a quick start.";
    logTextBox.innerHTML = "Logs will appear here once the algorithm begins.";
    updatePointsList();
    draw();
});

// Restarts setup but KEEPS points
btnRestart.addEventListener('click', () => {
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
    state = 'INPUT';
    currentSteps = [];
    stepIndex = 0;
    
    btnStart.disabled = false;
    btnNext.disabled = true;
    btnPrev.disabled = true;
    btnAnimate.disabled = true;
    btnRestart.disabled = true;
    btnDownload.disabled = true;
    btnAdd.disabled = false;
    btnDemo.disabled = false;
    inputX.disabled = false;
    inputY.disabled = false;
    
    updatePointsList();
    
    statusText.innerHTML = "Setup restarted! You may add more points, delete current points, or run the hull generation again.";
    logTextBox.innerHTML = "Logs will appear here once the algorithm begins.";
    draw();
});

// Download log feature
btnDownload.addEventListener('click', () => {
     let rawHtml = logTextBox.innerHTML;
     const textToSave = rawHtml
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/&rarr;/g, '->')
            .replace(/<[^>]+>/g, '');
            
     const blob = new Blob([textToSave], { type: 'text/plain' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = 'graham_scan_log.txt';
     a.click();
     URL.revokeObjectURL(url);
});

// --- Graham Scan Logic ---
function ccw(p1, p2, p3) {
    return (p2.x - p1.x)*(p3.y - p1.y) - (p2.y - p1.y)*(p3.x - p1.x);
}

function calculateSteps() {
    currentSteps = [];
    let pts = [...points];
    
    let initialPointsLogs = pts.map(p => `P${p.id}(${(p.x).toFixed(1)}, ${(p.y).toFixed(1)})`).join(', ');
    
    // Step 1: Find P0
    let lowestY = pts[0].y;
    let minIdx = 0;
    for (let i = 1; i < pts.length; i++) {
        let y = pts[i].y;
        if (y < lowestY || (y === lowestY && pts[i].x < pts[minIdx].x)) {
            lowestY = y;
            minIdx = i;
        }
    }
    let p0_ref = pts[minIdx];
    
    currentSteps.push({
        state: 'START',
        points: [...pts],
        p0: null, hull: [], activePoint: null, checkingLine: null,
        message: `Algorithm starting. Setup completed with ${pts.length} points.`,
        logMsg: `Initialization --> Given Set of Points: [ ${initialPointsLogs} ]`
    });

    currentSteps.push({
        state: 'FIND_P0',
        points: [...pts],
        p0: p0_ref, hull: [], activePoint: null, checkingLine: null,
        message: `Found P${p0_ref.id} as the starting point (minimum Y/X coordinate).`,
        logMsg: `Started algorithm. P${p0_ref.id}(${(p0_ref.x).toFixed(1)}, ${(p0_ref.y).toFixed(1)}) is the lowest Y coordinate.`
    });

    // Step 2: Sort
    pts.splice(minIdx, 1);
    pts.sort((a, b) => {
        const angleA = Math.atan2(a.y - p0_ref.y, a.x - p0_ref.x);
        const angleB = Math.atan2(b.y - p0_ref.y, b.x - p0_ref.x);
        if (angleA === angleB) {
            const distA = (a.x - p0_ref.x)**2 + (a.y - p0_ref.y)**2;
            const distB = (b.x - p0_ref.x)**2 + (b.y - p0_ref.y)**2;
            return distA - distB; 
        }
        return angleA - angleB;
    });
    
    let sortedP = [p0_ref, ...pts];
    let sortedPointsStr = sortedP.map(p => `P${p.id}`).join(', ');

    currentSteps.push({
        state: 'SORTING',
        points: [...sortedP],
        p0: p0_ref, hull: [], activePoint: null, checkingLine: null,
        message: `Sorted remaining points by polar angle with respect to P${p0_ref.id}.`,
        logMsg: `Sorted points by polar angle relative to P${p0_ref.id} --> [ ${sortedPointsStr} ]`
    });

    // Step 3: Initialize Stack
    let st = [sortedP[0], sortedP[1]];
    
    currentSteps.push({
        state: 'HULL_INIT',
        points: [...sortedP],
        p0: p0_ref, hull: [...st], activePoint: null, checkingLine: null,
        message: `Initialized Stack: Pushed P${sortedP[0].id} and P${sortedP[1].id}.`,
        logMsg: `Initializing Stack. Pushed [P${sortedP[0].id}, P${sortedP[1].id}].`
    });

    // Step 4: Graham Scan
    for(let i=2; i<sortedP.length; i++) {
        let pNext = sortedP[i];
        
        currentSteps.push({
            state: 'HULL_CHECK',
            points: [...sortedP],
            p0: p0_ref, hull: [...st], activePoint: pNext,
            checkingLine: { p1: st[st.length-1], p2: pNext },
            message: `Evaluating P${pNext.id}. Checking orientation with stack top P${st[st.length-2].id} and P${st[st.length-1].id}.`,
            logMsg: `Evaluating P${pNext.id}...`
        });

        let checkVal = 0;
        while (st.length > 1) {
            checkVal = ccw(st[st.length-2], st[st.length-1], pNext);
            let checkExp = `Cross Product ccw(P${st[st.length-2].id}, P${st[st.length-1].id}, P${pNext.id})`;

            if (checkVal <= 0) {
                let popped = st.pop();
                currentSteps.push({
                    state: 'HULL_POP',
                    points: [...sortedP],
                    p0: p0_ref, hull: [...st], activePoint: pNext,
                    checkingLine: { p1: st[st.length-1], p2: pNext },
                    message: `${checkExp} = ${(checkVal).toFixed(0)}.<br/>Since ${(checkVal).toFixed(0)} <= 0 (Right Turn / Collinear), we pop P${popped.id}!`,
                    logMsg: `  --> ${checkExp} = ${(checkVal).toFixed(0)}. Condition (${(checkVal).toFixed(0)} <= 0) equals TRUE. Popped P${popped.id}!`
                });
            } else {
                currentSteps.push({
                    state: 'HULL_PASS',
                    points: [...sortedP],
                    p0: p0_ref, hull: [...st], activePoint: pNext,
                    checkingLine: { p1: st[st.length-1], p2: pNext },
                    message: `${checkExp} = ${(checkVal).toFixed(0)}.<br/>Since ${(checkVal).toFixed(0)} > 0 (Left Turn), it passes!`,
                    logMsg: `  --> ${checkExp} = ${(checkVal).toFixed(0)}. Condition (${(checkVal).toFixed(0)} <= 0) equals FALSE. Left turn confirmed.`
                });
                break;
            }
        }
        
        st.push(pNext);
        currentSteps.push({
            state: 'HULL_PUSH',
            points: [...sortedP],
            p0: p0_ref, hull: [...st], activePoint: pNext,
            checkingLine: null,
            message: `Left turn confirmed! Pushed P${pNext.id} to the stack.`,
            logMsg: `  --> Pushed P${pNext.id} to stack.`
        });
    }

    currentSteps.push({
        state: 'DONE',
        points: [...sortedP],
        p0: p0_ref, hull: [...st], activePoint: null, checkingLine: null,
        message: `Algorithm complete! Generating final convex hull...`,
        logMsg: `Algorithm successfully completed processing all points.`
    });
}

// --- Triggers ---
btnStart.addEventListener('click', () => {
    if (points.length < 3) {
        alert("Please add at least 3 points!");
        return;
    }
    state = 'RUNNING';
    btnAdd.disabled = true;
    btnDemo.disabled = true;
    inputX.disabled = true;
    inputY.disabled = true;
    btnStart.disabled = true;
    btnRestart.disabled = false;
    btnDownload.disabled = false;
    
    document.querySelectorAll('.btn-delete-point').forEach(b => b.style.display = 'none');
    
    // Switch to logs tab automatically
    document.querySelector('.tab-btn[data-tab="tab-logs"]').click();
    
    calculateSteps();
    stepIndex = 0;
    
    applyStep();
    btnNext.disabled = false;
    btnPrev.disabled = true;
    btnAnimate.disabled = false;
});

btnNext.addEventListener('click', () => {
    if (animationInterval) { clearInterval(animationInterval); animationInterval = null; btnAnimate.disabled = false; }
    
    if (stepIndex < currentSteps.length - 1) {
        stepIndex++;
        applyStep();
        btnPrev.disabled = false;
        
        if (stepIndex === currentSteps.length - 1) {
            btnNext.disabled = true;
            btnAnimate.disabled = true;
        }
    }
});

btnPrev.addEventListener('click', () => {
    if (animationInterval) { clearInterval(animationInterval); animationInterval = null; btnAnimate.disabled = false; }
    
    if (stepIndex > 0) {
        stepIndex--;
        applyStep();
        btnNext.disabled = false;
        
        if (stepIndex === 0) {
            btnPrev.disabled = true;
        }
    }
});

btnAnimate.addEventListener('click', () => {
    if (stepIndex >= currentSteps.length - 1) return;
    
    btnAnimate.disabled = true;
    btnNext.disabled = true;
    btnPrev.disabled = true;
    
    animationInterval = setInterval(() => {
        if (stepIndex < currentSteps.length - 1) {
            stepIndex++;
            applyStep();
        } else {
            clearInterval(animationInterval);
            animationInterval = null;
            btnNext.disabled = true;
            btnPrev.disabled = false;
            btnAnimate.disabled = true;
        }
    }, 600);
});

function applyStep() {
    const snap = currentSteps[stepIndex];
    let htmlMsg = `<strong>Step ${stepIndex + 1}/${currentSteps.length} (${snap.state}):</strong><br/>${snap.message}`;
    
    let fullLog = currentSteps.slice(0, stepIndex + 1).map((s, i) => `[Step ${i+1}] ${s.logMsg}`).join('<br/>');

    if (snap.state === 'DONE') {
        const resultText = snap.hull.map(p => `P${p.id}`).join(' &rarr; ');
        const pureText = snap.hull.map(p => `P${p.id} (${(p.x).toFixed(1)}, ${(p.y).toFixed(1)})`).join(' -> ');
        htmlMsg += `<br/><br/><strong>Final Result (Convex Hull Points):</strong><br/><span style="color: var(--primary-color)">[ ${resultText} ]</span>`;
        
        fullLog += `<br/><br/>============================<br/><strong>FINAL CONVEX HULL POINTS:</strong><br/>[ ${pureText} ]<br/>============================`;
    }
    
    statusText.innerHTML = htmlMsg;
    logTextBox.innerHTML = fullLog;
    logTextBox.scrollTop = logTextBox.scrollHeight;
    
    draw();
}

statusText.innerHTML = "Welcome! Add points by clicking on the canvas or using the input fields.<br/>Click 'Load Demo Points' for a quick start.";
