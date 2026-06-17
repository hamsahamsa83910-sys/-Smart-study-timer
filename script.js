/**
 * Smart Study Timer - Main JavaScript
 * Implements authentication, theme toggle, Pomodoro timer, ambient sound synths,
 * distraction shields, calendar planner, heatmap grid, social leaderboard,
 * daily challenges, and AI tutor features.
 */

// Apply theme immediately to prevent light flicker on slow loading
(function() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
})();

// --- GLOBAL STATE ---
let timerSettings = loadTimerSettings();
let POMODORO_TIME = timerSettings.pomodoro * 60;
let SHORT_BREAK_TIME = timerSettings.shortBreak * 60;
let LONG_BREAK_TIME = timerSettings.longBreak * 60;

let timerInterval = null;
let timeLeft = POMODORO_TIME;
let isRunning = false;
let currentMode = 'pomodoro';
let currentTotalTime = POMODORO_TIME;

// Calendar State
let calendarDate = new Date();
let selectedDateStr = "";

// Audio & Synths State
let audioCtx = null;
let synthIntervals = {};
let activeSynths = { rain: false, lofi: false, forest: false, cafe: false };
let synthGains = { rain: 0.5, lofi: 0.5, forest: 0.5, cafe: 0.5 };
let lofiStep = 0;
let lofiChordIndex = 0;
let whiteNoiseBuffer = null;
let brownNoiseBuffer = null;

// Distraction Shield State
let distractionShieldActive = true;
let distractionCountThisSession = 0;
let idleTimer = null;

// Leaderboard Peers
let leaderboardPeers = [
    { name: "You", points: 0, hours: 0.0, isUser: true },
    { name: "Alice (Stanford)", points: 2800, hours: 14.5, isUser: false },
    { name: "Liam (MIT)", points: 2450, hours: 12.2, isUser: false },
    { name: "Sophia (Cambridge)", points: 2100, hours: 10.5, isUser: false },
    { name: "Noah (IIT)", points: 1950, hours: 9.8, isUser: false },
    { name: "Emma (Tokyo)", points: 1500, hours: 7.5, isUser: false }
];

// --- 1. SETTINGS & UTILS ---
function loadTimerSettings() {
    const saved = JSON.parse(localStorage.getItem('timerSettings'));
    if (saved) return saved;
    return { pomodoro: 25, shortBreak: 5, longBreak: 15 };
}

function showToast(message, icon = "fa-info-circle") {
    let toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa-solid ${icon}" style="color: var(--primary-color);"></i> <span>${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function playBuzzer() {
    initAudio();
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.45);
    } catch(e) { console.log(e); }
}

function playAlertBeep() {
    initAudio();
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.setValueAtTime(330, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    } catch(e) { console.log(e); }
}

// --- 2. THEME CONTROLLER ---
function setupTheming() {
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        const updateIcon = (isDark) => {
            const icon = themeBtn.querySelector('i');
            if (icon) {
                if (isDark) {
                    icon.className = 'fa-solid fa-sun';
                } else {
                    icon.className = 'fa-solid fa-moon';
                }
            }
        };

        const savedTheme = localStorage.getItem('theme') || 'light';
        const isCurrentlyDark = savedTheme === 'dark';
        if (isCurrentlyDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        updateIcon(isCurrentlyDark);
        
        themeBtn.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            if (isDark) {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('theme', 'light');
                updateIcon(false);
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                updateIcon(true);
            }
            // Trigger chart update if active
            const user = JSON.parse(localStorage.getItem('currentUser'));
            if (user && window.location.pathname.includes('dashboard.html')) {
                updateDashboardUI(user);
            }
        });
    }
}

// --- 3. AMBIENT AUDIO SYNTHESIZERS ---
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        buildNoiseBuffers();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function buildNoiseBuffers() {
    const bufferSize = 2 * audioCtx.sampleRate;
    
    // White Noise
    whiteNoiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const wOutput = whiteNoiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        wOutput[i] = Math.random() * 2 - 1;
    }
    
    // Brown Noise
    brownNoiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const bOutput = brownNoiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        bOutput[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = bOutput[i];
        bOutput[i] *= 3.5;
    }
}

function toggleAmbientSound(sound) {
    initAudio();
    if (!audioCtx) return;

    if (activeSynths[sound]) {
        // Stop sound
        stopSynth(sound);
    } else {
        // Start sound
        startSynth(sound);
    }
}

function startSynth(sound) {
    activeSynths[sound] = true;
    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(synthGains[sound] * 0.4, audioCtx.currentTime);
    gainNode.connect(audioCtx.destination);
    synthIntervals[sound + '_gain'] = gainNode;

    if (sound === 'rain') {
        // Binaural Alpha Waves: 200Hz Left, 210Hz Right
        const oscLeft = audioCtx.createOscillator();
        const oscRight = audioCtx.createOscillator();
        const pannerLeft = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
        const pannerRight = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;

        oscLeft.type = 'sine';
        oscLeft.frequency.setValueAtTime(200, audioCtx.currentTime);
        
        oscRight.type = 'sine';
        oscRight.frequency.setValueAtTime(210, audioCtx.currentTime);

        if (pannerLeft && pannerRight) {
            pannerLeft.pan.setValueAtTime(-1, audioCtx.currentTime);
            pannerRight.pan.setValueAtTime(1, audioCtx.currentTime);

            oscLeft.connect(pannerLeft);
            pannerLeft.connect(gainNode);

            oscRight.connect(pannerRight);
            pannerRight.connect(gainNode);
        } else {
            oscLeft.connect(gainNode);
            oscRight.connect(gainNode);
        }

        oscLeft.start();
        oscRight.start();

        synthIntervals[sound] = {
            stop: function() {
                try {
                    oscLeft.stop();
                    oscRight.stop();
                } catch(e){}
            }
        };
    } 
    else if (sound === 'forest') {
        // Zen Garden Pads (Peaceful sweeps)
        let padChordIndex = 0;
        const playZenPad = (vol) => {
            const progressions = [
                [110.00, 220.00, 261.63, 329.63, 392.00], // Am9
                [130.81, 261.63, 329.63, 392.00, 493.88], // Cmaj9
                [146.83, 293.66, 349.23, 440.00, 523.25], // Dm9
                [196.00, 246.94, 293.66, 349.23, 440.00]  // G9
            ];
            const freqs = progressions[padChordIndex];
            padChordIndex = (padChordIndex + 1) % progressions.length;

            freqs.forEach(freq => {
                try {
                    const osc = audioCtx.createOscillator();
                    const filter = audioCtx.createBiquadFilter();
                    const gain = audioCtx.createGain();

                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
                    filter.type = 'lowpass';
                    filter.frequency.setValueAtTime(280, audioCtx.currentTime);

                    gain.gain.setValueAtTime(0, audioCtx.currentTime);
                    gain.gain.linearRampToValueAtTime(0.06 * vol, audioCtx.currentTime + 1.8);
                    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 4.8);

                    osc.connect(filter);
                    filter.connect(gain);
                    gain.connect(audioCtx.destination);

                    osc.start();
                    osc.stop(audioCtx.currentTime + 4.9);
                } catch(e){}
            });
        };

        // Initial chord trigger
        playZenPad(synthGains.forest);

        // Zen pads chord triggers
        synthIntervals[sound + '_birds'] = setInterval(() => {
            if (!activeSynths.forest) return;
            playZenPad(synthGains.forest);
        }, 5000);

        synthIntervals[sound] = {
            stop: function() {
                clearInterval(synthIntervals[sound + '_birds']);
            }
        };
    } 
    else if (sound === 'cafe') {
        // Baroque Piano note sequences
        const cMajorScale = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25];
        const playClassicalPianoNote = (vol) => {
            try {
                const freq = cMajorScale[Math.floor(Math.random() * cMajorScale.length)];
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

                gain.gain.setValueAtTime(0, audioCtx.currentTime);
                gain.gain.linearRampToValueAtTime(0.12 * vol, audioCtx.currentTime + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);

                osc.connect(gain);
                gain.connect(audioCtx.destination);

                osc.start();
                osc.stop(audioCtx.currentTime + 1.25);
            } catch(e){}
        };

        // Piano note triggers
        synthIntervals[sound + '_clinks'] = setInterval(() => {
            if (!activeSynths.cafe) return;
            playClassicalPianoNote(synthGains.cafe);
        }, 1500);

        synthIntervals[sound] = {
            stop: function() {
                clearInterval(synthIntervals[sound + '_clinks']);
            }
        };
    }
    else if (sound === 'lofi') {
        lofiStep = 0;
        // Schedule beats (softer chillhop pace)
        synthIntervals[sound + '_beat'] = setInterval(() => {
            if (!activeSynths.lofi) return;
            playLofiStep(synthGains.lofi);
        }, 600); // Slower, relaxed focus BPM
    }
}

function stopSynth(sound) {
    activeSynths[sound] = false;
    if (synthIntervals[sound]) {
        try { synthIntervals[sound].stop(); } catch(e){}
        delete synthIntervals[sound];
    }
    if (synthIntervals[sound + '_birds']) {
        clearInterval(synthIntervals[sound + '_birds']);
        delete synthIntervals[sound + '_birds'];
    }
    if (synthIntervals[sound + '_clinks']) {
        clearInterval(synthIntervals[sound + '_clinks']);
        delete synthIntervals[sound + '_clinks'];
    }
    if (synthIntervals[sound + '_beat']) {
        clearInterval(synthIntervals[sound + '_beat']);
        delete synthIntervals[sound + '_beat'];
    }
    delete synthIntervals[sound + '_gain'];
}

function updateSynthVolume(sound, volume) {
    synthGains[sound] = parseFloat(volume);
    if (activeSynths[sound] && synthIntervals[sound + '_gain']) {
        synthIntervals[sound + '_gain'].gain.setValueAtTime(synthGains[sound] * 0.4, audioCtx.currentTime);
    }
}

function triggerBirdChirp(volume) {
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1500 + Math.random() * 800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(3200 + Math.random() * 500, audioCtx.currentTime + 0.12);
        
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.04 * volume, audioCtx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.13);
    } catch(e){}
}

function triggerCafeClink(volume) {
    try {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(2600 + Math.random() * 1200, audioCtx.currentTime);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(3800 + Math.random() * 800, audioCtx.currentTime);
        
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.02 * volume, audioCtx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc1.start();
        osc2.start();
        osc1.stop(audioCtx.currentTime + 0.19);
        osc2.stop(audioCtx.currentTime + 0.19);
    } catch(e){}
}

function playLofiStep(volume) {
    const step = lofiStep % 8;
    lofiStep++;
    
    // Kick Drum on 0 and 4
    if (step === 0 || step === 4) {
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.frequency.setValueAtTime(100, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.25 * volume, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.09);
        } catch(e){}
    }
    // Snare Drum on 2 and 6
    if (step === 2 || step === 6) {
        try {
            const noise = audioCtx.createBufferSource();
            noise.buffer = whiteNoiseBuffer;
            const filter = audioCtx.createBiquadFilter();
            const gain = audioCtx.createGain();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1100, audioCtx.currentTime);
            
            gain.gain.setValueAtTime(0.08 * volume, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
            
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            noise.start();
            noise.stop(audioCtx.currentTime + 0.11);
        } catch(e){}
    }
    // Chords on Beat 0 and 4 (every 1.6s)
    if (step === 0 || step === 4) {
        const chordsList = [
            [261.63, 329.63, 392.00, 493.88], // Cmaj7
            [220.00, 261.63, 329.63, 392.00], // Am7
            [293.66, 349.23, 440.00, 523.25], // Dm7
            [196.00, 246.94, 293.66, 349.23]  // G7
        ];
        
        if (step === 0) {
            lofiChordIndex = (lofiChordIndex + 1) % chordsList.length;
        }
        
        const chord = chordsList[lofiChordIndex];
        chord.forEach(freq => {
            try {
                const osc = audioCtx.createOscillator();
                const filter = audioCtx.createBiquadFilter();
                const gain = audioCtx.createGain();
                
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(320, audioCtx.currentTime);
                
                gain.gain.setValueAtTime(0, audioCtx.currentTime);
                gain.gain.linearRampToValueAtTime(0.12 * volume, audioCtx.currentTime + 0.1);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.4);
                
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(audioCtx.destination);
                
                osc.start();
                osc.stop(audioCtx.currentTime + 1.45);
            } catch(e){}
        });
    }
}

// --- 4. APP INITIALIZATION & ROUTING ---
document.addEventListener('DOMContentLoaded', () => {
    setupTheming();
    
    // Check path routing
    const path = window.location.pathname;
    
    if (path.includes('dashboard.html')) {
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (!currentUser) {
            const urlParams = new URLSearchParams(window.location.search);
            const room = urlParams.get('room');
            if (room) {
                window.location.href = `login.html?room=${room}`;
            } else {
                window.location.href = 'login.html';
            }
            return;
        }
        migrateUserDataSchema(currentUser);
        setupDashboard(currentUser);
        setupTimer();
        setupAmbientMixerEvents();
        setupDistractionDetector(currentUser);
    } 
    else if (path.includes('login.html')) {
        setupLogin();
    } 
    else if (path.includes('register.html')) {
        setupRegister();
    } 
    else {
        // index.html or fallback landing
        setupTimer();
        setupLandingFeatures();
    }
});

function migrateUserDataSchema(user) {
    if (!user.stats) user.stats = { points: 0, sessionsCompleted: 0, distractions: 0, streak: 0 };
    if (typeof user.stats.level === 'undefined') user.stats.level = 1;
    if (!user.goals) user.goals = [];
    if (!user.history) user.history = {};
    if (!user.calendarEvents) user.calendarEvents = [];
    if (!user.distractionsLog) user.distractionsLog = [];
    if (!user.challenges) user.challenges = generateDailyChallenges();
    if (!user.lastActiveDate) user.lastActiveDate = new Date().toISOString().split('T')[0];
    
    // Check if challenge date is outdated
    const today = new Date().toISOString().split('T')[0];
    if (user.lastActiveDate !== today) {
        user.challenges = generateDailyChallenges();
        user.lastActiveDate = today;
    }
    
    updateUserRecord(user);
}

function generateDailyChallenges() {
    return [
        { text: "Complete 2 Focus Sessions today", type: "sessions", target: 2, current: 0, completed: false, reward: 80 },
        { text: "Add 2 Planner Goals", type: "goals-created", target: 2, current: 0, completed: false, reward: 40 },
        { text: "Study with 0 distractions", type: "clean-session", target: 1, current: 0, completed: false, reward: 60 }
    ];
}

// --- 5. REGISTER & LOGIN LOGIC ---
function setupRegister() {
    const form = document.getElementById('registerForm');
    if (!form) return;
    
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;

        let valid = true;
        if (!name) { document.getElementById('nameError').classList.add('active'); valid = false; }
        else { document.getElementById('nameError').classList.remove('active'); }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) { document.getElementById('emailError').classList.add('active'); valid = false; }
        else { document.getElementById('emailError').classList.remove('active'); }

        if (password.length < 6) { document.getElementById('passwordError').classList.add('active'); valid = false; }
        else { document.getElementById('passwordError').classList.remove('active'); }

        if (!valid) return;

        let users = JSON.parse(localStorage.getItem('users')) || [];
        if (users.find(u => u.email === email)) {
            alert("This email address is already registered.");
            return;
        }

        const newUser = { 
            name, 
            email, 
            password, 
            stats: { points: 0, sessionsCompleted: 0, distractions: 0, streak: 0, level: 1 }, 
            goals: [],
            history: {},
            calendarEvents: [],
            distractionsLog: [],
            challenges: generateDailyChallenges(),
            lastActiveDate: new Date().toISOString().split('T')[0]
        };
        
        users.push(newUser);
        localStorage.setItem('users', JSON.stringify(users));
        document.getElementById('successModal').classList.add('active');
    });
}

function setupLogin() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        let users = JSON.parse(localStorage.getItem('users')) || [];
        const user = users.find(u => u.email === email);

        if (!user) {
            document.getElementById('loginEmailError').classList.add('active');
            document.getElementById('loginPasswordError').classList.remove('active');
            return;
        } else {
            document.getElementById('loginEmailError').classList.remove('active');
        }

        if (user.password !== password) {
            document.getElementById('loginPasswordError').classList.add('active');
            return;
        }
        
        // Streak calculation
        const todayStr = new Date().toISOString().split('T')[0];
        if (user.lastActiveDate) {
            const lastActive = new Date(user.lastActiveDate);
            const currentDate = new Date(todayStr);
            const diffTime = Math.abs(currentDate - lastActive);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            if (diffDays > 1) {
                user.stats.streak = 0; // Streak broken
            }
        }
        user.lastActiveDate = todayStr;
        
        localStorage.setItem('currentUser', JSON.stringify(user));
        updateUserRecord(user);
        
        // Redirect to dashboard
        const urlParams = new URLSearchParams(window.location.search);
        const room = urlParams.get('room');
        if (room) {
            window.location.href = `dashboard.html?room=${room}`;
        } else {
            window.location.href = 'dashboard.html';
        }
    });
}

// --- 6. TIMER ENGINE ---
function setupTimer() {
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    const timeDisplay = document.getElementById('timeDisplay');
    const progressCircle = document.getElementById('progressCircle');
    const modeBtns = document.querySelectorAll('.timer-mode-btn');
    const focusModeBtn = document.getElementById('focusModeBtn');

    if (!startBtn || !timeDisplay) return;

    function updateDisplay() {
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        timeDisplay.textContent = timeStr;
        
        const focusDisplay = document.getElementById('focusDigitalDisplay');
        if (focusDisplay) focusDisplay.textContent = timeStr;
        
        document.title = `${timeStr} - SmartTimer`;

        const percentage = ((currentTotalTime - timeLeft) / currentTotalTime) * 360;
        if (progressCircle) {
            progressCircle.style.background = `conic-gradient(var(--primary-color) ${percentage}deg, var(--card-border) 0deg)`;
        }
    }

    function switchMode(mode) {
        clearInterval(timerInterval);
        isRunning = false;
        currentMode = mode;
        if (mode === 'pomodoro') { timeLeft = POMODORO_TIME; currentTotalTime = POMODORO_TIME; }
        else if (mode === 'shortBreak') { timeLeft = SHORT_BREAK_TIME; currentTotalTime = SHORT_BREAK_TIME; }
        else if (mode === 'longBreak') { timeLeft = LONG_BREAK_TIME; currentTotalTime = LONG_BREAK_TIME; }
        
        startBtn.style.display = 'inline-flex';
        if (pauseBtn) pauseBtn.style.display = 'none';
        updateDisplay();

        modeBtns.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.mode === mode) btn.classList.add('active');
        });
    }

    function timerComplete() {
        clearInterval(timerInterval);
        isRunning = false;
        playBuzzer();
        startBtn.style.display = 'inline-flex';
        if (pauseBtn) pauseBtn.style.display = 'none';
        
        let msg = currentMode === 'pomodoro' ? 'Focus session completed! Take a break.' : 'Break is over! Time to study.';
        showToast(msg, "fa-circle-check");
        
        // Save focus state if logged in
        const user = JSON.parse(localStorage.getItem('currentUser'));
        if (user && window.location.pathname.includes('dashboard.html')) {
            if (currentMode === 'pomodoro') {
                user.stats.sessionsCompleted += 1;
                user.stats.points += 50;
                
                // Heatmap & History
                const today = new Date().toISOString().split('T')[0];
                if (!user.history[today]) user.history[today] = 0;
                user.history[today] += 1;

                if (user.history[today] === 1) {
                    user.stats.streak += 1;
                }

                // Level calculation (e.g. 500 points per level)
                user.stats.level = Math.floor(user.stats.points / 500) + 1;

                // Challenge triggers
                user.challenges.forEach(ch => {
                    if (ch.type === 'sessions') {
                        ch.current++;
                        if (ch.current >= ch.target && !ch.completed) {
                            ch.completed = true;
                            user.stats.points += ch.reward;
                            showToast(`Challenge Met! +${ch.reward} pts`, "fa-award");
                        }
                    }
                    if (ch.type === 'clean-session' && distractionCountThisSession === 0) {
                        ch.current = 1;
                        if (!ch.completed) {
                            ch.completed = true;
                            user.stats.points += ch.reward;
                            showToast(`Challenge Met! +${ch.reward} pts`, "fa-award");
                        }
                    }
                });

                // Clear session distraction
                distractionCountThisSession = 0;
                document.getElementById('sessionDistractionCount').textContent = "0";
            }
            
            updateUserRecord(user);
            updateDashboardUI(user);
        }
    }

    startBtn.addEventListener('click', () => {
        if (!isRunning) {
            initAudio(); // Initialize browser audio API
            isRunning = true;
            startBtn.style.display = 'none';
            if (pauseBtn) pauseBtn.style.display = 'inline-flex';
            
            let tickCount = 0;
            timerInterval = setInterval(() => {
                if (timeLeft > 0) {
                    timeLeft--;
                    updateDisplay();
                    
                    // Real-time focus points update (1 pt every 10s of study)
                    if (currentMode === 'pomodoro') {
                        tickCount++;
                        if (tickCount % 10 === 0) {
                            const currentUser = JSON.parse(localStorage.getItem('currentUser'));
                            if (currentUser) {
                                currentUser.stats.points += 1;
                                currentUser.stats.level = Math.floor(currentUser.stats.points / 500) + 1;
                                updateUserRecord(currentUser);

                                // Refresh labels in real-time
                                const ptsLabel = document.getElementById('userPointsLabel');
                                const lvlLabel = document.getElementById('userLevelLabel');
                                const rnkLabel = document.getElementById('userRankLabel');
                                if (ptsLabel) ptsLabel.textContent = currentUser.stats.points;
                                if (lvlLabel) lvlLabel.textContent = currentUser.stats.level;
                                if (rnkLabel) {
                                    rnkLabel.textContent = currentUser.stats.level > 4 ? "Doctorate" : currentUser.stats.level > 2 ? "Graduate" : "Scholar";
                                }
                            }
                        }
                    }
                } else {
                    timerComplete();
                }
            }, 1000);
        }
    });

    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            clearInterval(timerInterval);
            isRunning = false;
            startBtn.style.display = 'inline-flex';
            pauseBtn.style.display = 'none';
        });
    }

    resetBtn.addEventListener('click', () => switchMode(currentMode));

    modeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => switchMode(e.target.dataset.mode));
    });

    // Settings modal triggers
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    
    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', () => {
            document.getElementById('pomodoroSetting').value = timerSettings.pomodoro;
            document.getElementById('shortBreakSetting').value = timerSettings.shortBreak;
            document.getElementById('longBreakSetting').value = timerSettings.longBreak;
            settingsModal.classList.add('active');
        });
        closeSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('active'));
        
        saveSettingsBtn.addEventListener('click', () => {
            const p = parseInt(document.getElementById('pomodoroSetting').value) || 25;
            const sb = parseInt(document.getElementById('shortBreakSetting').value) || 5;
            const lb = parseInt(document.getElementById('longBreakSetting').value) || 15;
            
            timerSettings = { pomodoro: p, shortBreak: sb, longBreak: lb };
            localStorage.setItem('timerSettings', JSON.stringify(timerSettings));
            
            POMODORO_TIME = p * 60;
            SHORT_BREAK_TIME = sb * 60;
            LONG_BREAK_TIME = lb * 60;
            
            settingsModal.classList.remove('active');
            showToast('Focus settings successfully updated.', 'fa-circle-check');
            if (!isRunning) switchMode(currentMode);
        });
    }

    // Fullscreen Immersive Focus Mode toggles
    const fullscreenOverlay = document.getElementById('fullscreenFocusOverlay');
    const exitFocusBtn = document.getElementById('exitFocusModeBtn');
    
    if (focusModeBtn && fullscreenOverlay) {
        focusModeBtn.addEventListener('click', () => {
            initAudio();
            fullscreenOverlay.classList.add('active');
            document.documentElement.requestFullscreen().catch(() => {});
            
            // Start custom breathing animation ticks
            startBreathingCoach();
        });
        
        exitFocusBtn.addEventListener('click', () => {
            fullscreenOverlay.classList.remove('active');
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            }
            stopBreathingCoach();
        });
    }

    updateDisplay();
}

let breathingInterval = null;
function startBreathingCoach() {
    const textEl = document.getElementById('focusBreathingInstruction');
    let state = 0; // 0 = Inhale, 1 = Hold, 2 = Exhale, 3 = Hold
    const steps = ["Inhale slowly...", "Hold breath...", "Exhale slowly...", "Hold breath..."];
    
    if (textEl) textEl.textContent = steps[0];
    breathingInterval = setInterval(() => {
        state = (state + 1) % 4;
        if (textEl) textEl.textContent = steps[state];
    }, 4000);
}
function stopBreathingCoach() {
    if (breathingInterval) {
        clearInterval(breathingInterval);
        breathingInterval = null;
    }
}

// --- 7. AMBIENT SOUND EVENT BINDINGS ---
function setupAmbientMixerEvents() {
    const toggles = document.querySelectorAll('.sound-toggle-btn');
    const sliders = document.querySelectorAll('.volume-slider');
    
    toggles.forEach(btn => {
        btn.addEventListener('click', () => {
            const sound = btn.dataset.sound;
            toggleAmbientSound(sound);
            
            // UI Toggle
            if (activeSynths[sound]) {
                btn.innerHTML = '<i class="fa-solid fa-circle-stop"></i>';
                btn.classList.add('active');
            } else {
                btn.innerHTML = '<i class="fa-solid fa-circle-play"></i>';
                btn.classList.remove('active');
            }
        });
    });

    sliders.forEach(slide => {
        slide.addEventListener('input', (e) => {
            const sound = e.target.dataset.sound;
            updateSynthVolume(sound, e.target.value);
        });
    });
}

// --- 8. SMART DISTRACTION SHIELD ---
function setupDistractionDetector(user) {
    const shieldToggle = document.getElementById('distractionShieldToggle');
    if (shieldToggle) {
        distractionShieldActive = shieldToggle.checked;
        shieldToggle.addEventListener('change', (e) => {
            distractionShieldActive = e.target.checked;
            showToast(distractionShieldActive ? "Distraction shield enabled." : "Distraction shield bypassed.", "fa-shield-halved");
        });
    }

    // Monitor tab switching / app switching
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && isRunning && distractionShieldActive) {
            logDistraction("Tab Switch", "Switched window tabs during active focus.");
        }
    });

    window.addEventListener('blur', () => {
        if (isRunning && distractionShieldActive) {
            logDistraction("App Blur", "Lost focal view of browser workspace.");
        }
    });

    // Inactivity tracking (mouse/keys idle for 90s)
    resetIdleTimer();
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
}

function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        if (isRunning && distractionShieldActive) {
            logDistraction("Idle Timeout", "No system interactions detected for 90 seconds.");
        }
    }, 90000);
}

function logDistraction(type, reason) {
    playAlertBeep();
    distractionCountThisSession++;
    
    const countEl = document.getElementById('sessionDistractionCount');
    if (countEl) countEl.textContent = distractionCountThisSession;

    const todayTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Add to HTML logs
    const logList = document.getElementById('distractionLogList');
    if (logList) {
        const item = document.createElement('div');
        item.className = 'distraction-log-item';
        item.innerHTML = `<strong>[${todayTime}] ${type}</strong>: ${reason}`;
        logList.insertBefore(item, logList.firstChild);
    }

    // Save to user DB record
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (user) {
        user.stats.distractions++;
        user.distractionsLog.push({
            time: new Date().toISOString(),
            type: type,
            text: reason
        });
        updateUserRecord(user);
        updateDashboardUI(user);
    }
}

// --- 9. INTERACTIVE CALENDAR ---
function setupCalendar(user) {
    const prevMonth = document.getElementById('prevMonthBtn');
    const nextMonth = document.getElementById('nextMonthBtn');
    
    if (prevMonth) {
        prevMonth.addEventListener('click', () => {
            calendarDate.setMonth(calendarDate.getMonth() - 1);
            renderCalendar(user);
        });
    }
    if (nextMonth) {
        nextMonth.addEventListener('click', () => {
            calendarDate.setMonth(calendarDate.getMonth() + 1);
            renderCalendar(user);
        });
    }
    
    renderCalendar(user);
    
    // Event modal binding
    const closeCalBtn = document.getElementById('closeCalendarEventBtn');
    const saveCalBtn = document.getElementById('saveCalendarEventBtn');
    
    if (closeCalBtn) {
        closeCalBtn.addEventListener('click', () => {
            document.getElementById('calendarEventModal').classList.remove('active');
        });
    }

    if (saveCalBtn) {
        saveCalBtn.addEventListener('click', () => {
            const desc = document.getElementById('calendarEventDescInput').value.trim();
            const time = document.getElementById('calendarEventTimeInput').value;
            
            if (!desc) return alert("Please specify an event description.");
            
            user.calendarEvents.push({
                date: selectedDateStr,
                text: desc,
                time: time,
                type: "user"
            });
            
            // Check challenge target
            user.challenges.forEach(ch => {
                if (ch.type === 'goals-created') {
                    ch.current++;
                    if (ch.current >= ch.target && !ch.completed) {
                        ch.completed = true;
                        user.stats.points += ch.reward;
                        showToast(`Challenge Met! +${ch.reward} pts`, "fa-award");
                    }
                }
            });

            updateUserRecord(user);
            renderCalendar(user);
            showToast("Event successfully saved to Calendar.", "fa-check");
            document.getElementById('calendarEventModal').classList.remove('active');
            document.getElementById('calendarEventDescInput').value = "";
        });
    }
}

function renderCalendar(user) {
    const calendarGrid = document.getElementById('calendarGrid');
    const title = document.getElementById('calendarMonthYear');
    if (!calendarGrid || !title) return;

    calendarGrid.innerHTML = "";
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    
    // Header names
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    title.textContent = `${months[month]} ${year}`;

    // Add days headers
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    days.forEach(d => {
        const div = document.createElement('div');
        div.className = 'calendar-day-header';
        div.textContent = d;
        calendarGrid.appendChild(div);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    // Render preceding days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const cell = createCalendarCell(year, month - 1, day, true, user);
        calendarGrid.appendChild(cell);
    }

    // Render current month days
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = (today.getDate() === day && today.getMonth() === month && today.getFullYear() === year);
        const cell = createCalendarCell(year, month, day, false, user, isToday);
        calendarGrid.appendChild(cell);
    }

    // Fill out remaining slots
    const totalCells = calendarGrid.children.length - 7; // subtract header
    const nextCellsNeeded = 42 - totalCells;
    for (let day = 1; day <= nextCellsNeeded; day++) {
        const cell = createCalendarCell(year, month + 1, day, true, user);
        calendarGrid.appendChild(cell);
    }
}

function createCalendarCell(year, month, day, isOtherMonth, user, isToday = false) {
    const cell = document.createElement('div');
    cell.className = `calendar-day-cell ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'current-day' : ''}`;
    
    const dayNum = document.createElement('span');
    dayNum.className = 'day-num';
    dayNum.textContent = day;
    cell.appendChild(dayNum);

    // Format date string key
    const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    
    // Render event indicator dots
    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'calendar-dots';
    
    const dayEvents = user.calendarEvents.filter(e => e.date === dateStr);
    dayEvents.forEach(ev => {
        const dot = document.createElement('div');
        dot.className = `calendar-dot ${ev.type === 'timetable' ? 'timetable' : ''}`;
        dotsContainer.appendChild(dot);
    });
    cell.appendChild(dotsContainer);

    cell.addEventListener('click', () => {
        selectedDateStr = dateStr;
        document.getElementById('calendarSelectedDateInput').value = new Date(year, month, day).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        // Render existing day events
        const eventsList = document.getElementById('dayEventsList');
        eventsList.innerHTML = "";
        
        if (dayEvents.length === 0) {
            eventsList.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">No events scheduled for this day.</p>`;
        } else {
            dayEvents.forEach((ev, idx) => {
                const el = document.createElement('div');
                const isBreak = ev.text.toLowerCase().includes('break');
                el.className = `timetable-item ${isBreak ? 'break' : ''}`;
                
                const iconHtml = isBreak ? 
                    `<div class="timetable-icon"><i class="fa-solid fa-mug-hot"></i></div>` : 
                    `<div class="timetable-icon"><i class="fa-solid fa-calendar-day"></i></div>`;
                
                el.innerHTML = `
                    ${iconHtml}
                    <div class="timetable-details">
                        <span class="timetable-block-time">${ev.time}</span>
                        <span class="timetable-block-desc">${ev.text}</span>
                    </div>
                `;
                eventsList.appendChild(el);
            });
        }
        
        document.getElementById('calendarEventModal').classList.add('active');
    });

    return cell;
}

// --- 10. SMART TIMETABLE GENERATOR ---
function setupTimetableGenerator(user) {
    const genBtn = document.getElementById('generateTimetableBtn');
    const container = document.getElementById('timetableBlockContainer');
    
    if (genBtn) {
        genBtn.addEventListener('click', () => {
            const subject = document.getElementById('timetableSubject').value.trim() || 'Focus Block';
            const hours = parseFloat(document.getElementById('timetableHours').value) || 2;
            const breakMins = parseInt(document.getElementById('timetableBreakMins').value) || 15;
            const sessionMins = parseInt(document.getElementById('timetableSessionMins').value) || 45;
            
            const totalMinutes = hours * 60;
            let currentMinutes = 0;
            let blocks = [];
            let tempTime = new Date();
            
            while (currentMinutes < totalMinutes) {
                // Focus block
                blocks.push({
                    type: 'focus',
                    desc: `${subject} (Focus Block)`,
                    duration: sessionMins
                });
                currentMinutes += sessionMins;
                
                if (currentMinutes >= totalMinutes) break;
                
                // Break block
                if (breakMins > 0) {
                    blocks.push({
                        type: 'break',
                        desc: 'Rest Break',
                        duration: breakMins
                    });
                    currentMinutes += breakMins;
                }
            }

            // Push events to Calendar DB
            const todayStr = new Date().toISOString().split('T')[0];
            
            container.innerHTML = "";
            blocks.forEach(b => {
                const startStr = tempTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                tempTime = new Date(tempTime.getTime() + b.duration * 60000);
                const endStr = tempTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                user.calendarEvents.push({
                    date: todayStr,
                    text: b.desc,
                    time: startStr,
                    type: "timetable"
                });

                // Render visually in container using premium design classes
                const item = document.createElement('div');
                item.className = `timetable-item ${b.type === 'break' ? 'break' : ''}`;
                
                const iconHtml = b.type === 'break' ? 
                    `<div class="timetable-icon"><i class="fa-solid fa-mug-hot"></i></div>` : 
                    `<div class="timetable-icon"><i class="fa-solid fa-brain"></i></div>`;
                
                item.innerHTML = `
                    ${iconHtml}
                    <div class="timetable-details">
                        <span class="timetable-block-time">${startStr} - ${endStr}</span>
                        <span class="timetable-block-desc">${b.desc}</span>
                    </div>
                `;
                container.appendChild(item);
            });
            
            updateUserRecord(user);
            renderCalendar(user);
            container.style.display = 'flex';
            showToast("Structured timetable generated and synchronized to Calendar.", "fa-circle-check");
            document.getElementById('timetableSubject').value = "";
        });
    }
}

// --- 11. GOALS TRACKING ---
function setupGoalsTracker(user) {
    const input = document.getElementById('newGoalInput');
    const addBtn = document.getElementById('addNewGoalBtn');
    const list = document.getElementById('dashboardGoalList');
    
    if (!list) return;

    function renderGoalsList() {
        list.innerHTML = "";
        user.goals.forEach((g, idx) => {
            const li = document.createElement('li');
            li.className = 'goal-item';
            li.innerHTML = `
                <div class="goal-content">
                    <input type="checkbox" class="goal-checkbox" ${g.completed ? 'checked' : ''} data-index="${idx}">
                    <span style="${g.completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${g.text}</span>
                </div>
                <button class="btn btn-outline" style="padding: 0.2rem 0.5rem; border: none;" data-action="delete" data-index="${idx}">
                    <i class="fa-solid fa-trash-can" style="color: var(--danger-color)"></i>
                </button>
            `;
            list.appendChild(li);
        });

        // Add Listeners
        list.querySelectorAll('.goal-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index);
                user.goals[idx].completed = e.target.checked;
                
                if (user.goals[idx].completed) {
                    user.stats.points += 15;
                    showToast("Goal achieved! +15 pts", "fa-circle-check");
                    
                    // Daily challenges check
                    user.challenges.forEach(ch => {
                        if (ch.type === 'goals-created') {
                            ch.current++;
                            if (ch.current >= ch.target && !ch.completed) {
                                ch.completed = true;
                                user.stats.points += ch.reward;
                                showToast(`Challenge Met! +${ch.reward} pts`, "fa-award");
                            }
                        }
                    });
                }
                updateUserRecord(user);
                renderGoalsList();
                updateDashboardUI(user);
            });
        });

        list.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.dataset.index);
                user.goals.splice(idx, 1);
                updateUserRecord(user);
                renderGoalsList();
                updateDashboardUI(user);
            });
        });
    }

    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const txt = input.value.trim();
            if (txt) {
                user.goals.push({ text: txt, completed: false });
                updateUserRecord(user);
                input.value = "";
                renderGoalsList();
            }
        });
    }

    renderGoalsList();
}

// --- 12. STUDY HEATMAP (Last 30 Days) ---
function renderStudyHeatmap(user) {
    const grid = document.getElementById('studyHeatmapGrid');
    if (!grid) return;
    grid.innerHTML = "";

    const today = new Date();
    // Render blocks for the last 30 days
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        
        const count = (user.history && user.history[dateStr]) ? user.history[dateStr] : 0;
        
        // Levels 0 to 4
        let level = 0;
        if (count === 1) level = 1;
        else if (count === 2) level = 2;
        else if (count === 3) level = 3;
        else if (count >= 4) level = 4;
        
        const cell = document.createElement('div');
        cell.className = `heatmap-cell level-${level}`;
        cell.title = `${count} session${count !== 1 ? 's' : ''} on ${d.toLocaleDateString([], {month:'short', day:'numeric'})}`;
        grid.appendChild(cell);
    }
}

// --- 13. PRODUCTIVITY SCORE INDICATOR ---
function renderProductivityGauge(user) {
    const fill = document.getElementById('productivityGaugeFill');
    const valText = document.getElementById('productivityScoreValue');
    const title = document.getElementById('productivityEvaluationTitle');
    const textDesc = document.getElementById('productivityEvaluationText');
    
    if (!fill || !valText) return;

    // Calculation:
    // Focus completed (sessions completed * 20)
    // Goals hit (goals completed * 15)
    // Distractions penalty (distractions * -10)
    const completedGoals = user.goals.filter(g => g.completed).length;
    let score = (user.stats.sessionsCompleted * 20) + (completedGoals * 15);
    score -= (user.stats.distractions * 10);
    
    // Constraints
    if (score > 100) score = 100;
    if (score < 0) score = 0;
    if (user.stats.sessionsCompleted === 0 && completedGoals === 0) score = 0; // fallback default

    // Animate SVG gauge stroke
    // Circumference = 2 * PI * r = 2 * 3.14159 * 70 = ~440
    const offset = 440 - (score / 100) * 440;
    fill.style.strokeDashoffset = offset;
    valText.textContent = `${score}%`;

    // Visual Evaluation
    if (score >= 85) {
        title.textContent = "Academic Master";
        title.style.color = "var(--success-color)";
        textDesc.textContent = "Outstanding consistency! Excellent shield control and finished objectives.";
    } else if (score >= 60) {
        title.textContent = "Highly Focused";
        title.style.color = "var(--primary-color)";
        textDesc.textContent = "Good progress. Try completing a few more goals to maximize efficiency.";
    } else if (score >= 30) {
        title.textContent = "Syllabus Tracker";
        title.style.color = "var(--warning-color)";
        textDesc.textContent = "Moderate pacing. Consider enabling the distraction shield to optimize score.";
    } else {
        title.textContent = "Distraction Zone";
        title.style.color = "var(--danger-color)";
        textDesc.textContent = "Focus level diluted. Start a clean Pomodoro study block to rebuild habits.";
    }
}

// --- 14. DAILY CHALLENGES & BADGES CABINET ---
function renderChallengesAndBadges(user) {
    const chContainer = document.getElementById('challengesContainer');
    if (chContainer) {
        chContainer.innerHTML = "";
        
        user.challenges.forEach((ch, idx) => {
            const item = document.createElement('div');
            item.className = `challenge-item ${ch.completed ? 'completed' : ''}`;
            item.innerHTML = `
                <i class="fa-solid ${ch.completed ? 'fa-square-check' : 'fa-square'}"></i>
                <div style="flex-grow:1;">
                    <div style="font-size:0.9rem;">${ch.text}</div>
                    <div style="font-size:0.75rem; color: var(--text-muted); margin-top:0.1rem;">
                        Reward: +${ch.reward} pts (${ch.current}/${ch.target})
                    </div>
                </div>
            `;
            chContainer.appendChild(item);
        });
    }

    // Badge showcases
    const badges = [
        { id: "achievement-first-session", met: user.stats.sessionsCompleted >= 1 },
        { id: "achievement-streak-3", met: user.stats.streak >= 3 },
        { id: "achievement-streak-7", met: user.stats.streak >= 7 },
        { id: "achievement-shield-pro", met: (user.stats.sessionsCompleted >= 2 && user.stats.distractions === 0) }
    ];

    badges.forEach(b => {
        const el = document.getElementById(b.id);
        if (el) {
            if (b.met) {
                el.classList.add('earned');
            } else {
                el.classList.remove('earned');
            }
        }
    });
}

// --- 15. SOCIAL LEADERBOARD ---
function renderLeaderboard(user) {
    const list = document.getElementById('leaderboardList');
    if (!list) return;
    list.innerHTML = "";

    // Sync user stats inside leaderboard
    const userRow = leaderboardPeers.find(p => p.isUser);
    if (userRow) {
        userRow.points = user.stats.points;
        userRow.hours = parseFloat((user.stats.sessionsCompleted * timerSettings.pomodoro / 60).toFixed(1));
    }

    // Sort descending
    leaderboardPeers.sort((a, b) => b.points - a.points);

    leaderboardPeers.forEach((p, idx) => {
        const row = document.createElement('div');
        row.className = `leaderboard-row ${p.isUser ? 'user-row' : ''}`;
        
        let statusText = "";
        let statusDot = "";
        
        if (!p.isUser) {
            const states = [
                { text: "Focusing ⏱️", class: "success" },
                { text: "Break ☕", class: "warning" },
                { text: "Offline 📱", class: "muted" }
            ];
            // Stable state selector based on points
            const stateIdx = (p.points) % states.length;
            const state = states[stateIdx];
            statusText = `<span style="font-size:0.75rem; color: var(--text-muted);">${state.text}</span>`;
            
            if (state.class === 'success') {
                statusDot = `<div style="width: 8px; height: 8px; border-radius: 50%; background: var(--success-color); margin-left: auto; box-shadow: 0 0 8px var(--success-color);"></div>`;
            } else if (state.class === 'warning') {
                statusDot = `<div style="width: 8px; height: 8px; border-radius: 50%; background: var(--warning-color); margin-left: auto; box-shadow: 0 0 8px var(--warning-color);"></div>`;
            } else {
                statusDot = `<div style="width: 8px; height: 8px; border-radius: 50%; background: #ccc; margin-left: auto;"></div>`;
            }
        } else {
            statusText = `<span style="font-size:0.75rem; color: var(--primary-color); font-weight: 700;">${isRunning ? 'Focusing ⏱️' : 'Ready ⚡'}</span>`;
            statusDot = `<div style="width: 8px; height: 8px; border-radius: 50%; background: ${isRunning ? 'var(--success-color)' : 'var(--warning-color)'}; margin-left: auto; ${isRunning ? 'box-shadow: 0 0 8px var(--success-color);' : 'box-shadow: 0 0 8px var(--warning-color);'}"></div>`;
        }

        row.innerHTML = `
            <div class="rank-num">#${idx + 1}</div>
            <div class="lb-avatar">${p.name[0]}</div>
            <div class="lb-name" style="display: flex; flex-direction: column; justify-content: center; gap: 0.15rem;">
                <span style="font-weight: 700; font-size: 0.9rem;">${p.name.split(" ")[0]}</span>
                ${statusText}
            </div>
            <div class="lb-score" style="margin-left: auto; margin-right: 1.25rem; font-weight: 700; font-size: 0.9rem;">${p.points} pts</div>
            ${statusDot}
        `;
        list.appendChild(row);
    });
}

// Live simulation to increase peers stats slightly to keep competitive sense (every 3 seconds)
setInterval(() => {
    if (!window.location.pathname.includes('dashboard.html')) return;
    
    // Pick random peer to increase points
    const randIdx = Math.floor(Math.random() * leaderboardPeers.length);
    const peer = leaderboardPeers[randIdx];
    if (peer && !peer.isUser) {
        peer.points += Math.floor(Math.random() * 8) + 1;
        peer.hours = parseFloat((peer.hours + 0.05).toFixed(2));
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (currentUser) renderLeaderboard(currentUser);
    }
}, 3000);



// --- 17. PEERJS GROUP STUDY ROOMS ---
function setupVoiceRoom() {
    const startBtn = document.getElementById('startVoiceBtn');
    const controls = document.getElementById('voiceRoomControls');
    const peerIdLabel = document.getElementById('myPeerId');
    const whatsappBtn = document.getElementById('inviteWhatsAppBtn');
    const joinBtn = document.getElementById('joinVoiceBtn');
    const friendInput = document.getElementById('friendRoomId');
    const statusDot = document.getElementById('myVoiceStatus');
    const groupList = document.getElementById('groupStudyList');
    const remoteAudio = document.getElementById('remoteAudio');

    if (!startBtn) return;

    let peer = null;
    let localStream = null;
    let activeCall = null;

    // Detect auto-join room ID
    const urlParams = new URLSearchParams(window.location.search);
    const roomToJoin = urlParams.get('room');

    function addPartnerToList(id) {
        // Prevent duplicate partner items
        if (document.getElementById(`peer-${id}`)) return;
        const li = document.createElement('li');
        li.className = 'user-item';
        li.id = `peer-${id}`;
        li.innerHTML = `
            <div class="user-avatar"><i class="fa-solid fa-user-check"></i></div>
            <div style="flex: 1; font-size: 0.85rem; font-weight: 600;">Partner (${id.substring(0, 6)}...)</div>
            <div class="user-status" style="background: var(--success-color);"></div>
        `;
        groupList.appendChild(li);
    }

    function disconnectCall() {
        if (activeCall) {
            try { activeCall.close(); } catch(e) {}
            activeCall = null;
        }
        handleDisconnectCleanup();
        showToast("Disconnected from voice session.", "fa-phone-slash");
    }

    function handleDisconnectCleanup() {
        activeCall = null;
        if (remoteAudio) {
            remoteAudio.srcObject = null;
        }
        // Remove partners from list
        const partners = groupList.querySelectorAll('li:not(:first-child)');
        partners.forEach(p => p.remove());

        if (joinBtn) {
            joinBtn.disabled = false;
            joinBtn.className = 'btn btn-primary w-full';
            joinBtn.innerHTML = '<i class="fa-solid fa-phone-volume"></i> Connect to Friend';
        }
    }

    startBtn.addEventListener('click', () => {
        if (peer) return;

        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Host connecting...';

        navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(stream => {
            localStream = stream;
            statusDot.style.background = "var(--success-color)";
            
            // Connect PeerJS
            peer = new Peer();
            
            peer.on('open', (id) => {
                controls.style.display = 'block';
                peerIdLabel.textContent = id;
                startBtn.style.display = 'none';
                showToast("Voice Focus room successfully hosted.", "fa-microphone");

                // Auto-join trigger
                if (roomToJoin) {
                    setTimeout(() => {
                        if (joinBtn) joinBtn.click();
                    }, 1000);
                }
            });

            peer.on('call', (call) => {
                activeCall = call;
                call.answer(localStream);
                call.on('stream', (rStream) => {
                    remoteAudio.srcObject = rStream;
                    addPartnerToList(call.peer);
                    showToast("Study partner connected to room.", "fa-users");
                    
                    if (joinBtn) {
                        joinBtn.innerHTML = '<i class="fa-solid fa-phone-slash"></i> Disconnect';
                        joinBtn.className = 'btn btn-danger w-full';
                    }
                });
                call.on('close', () => {
                    handleDisconnectCleanup();
                });
            });

            peer.on('error', () => {
                showToast("P2P server timeout. Try again.", "fa-triangle-exclamation");
                startBtn.disabled = false;
                startBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> Start Voice Server';
            });

        }).catch(() => {
            showToast("Microphone permissions required.", "fa-microphone-slash");
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> Start Voice Server';
        });
    });

    if (whatsappBtn) {
        whatsappBtn.addEventListener('click', () => {
            const id = peerIdLabel.textContent;
            
            // Build the absolute join URL for auto-connect
            const joinUrl = new URL(window.location.href);
            joinUrl.searchParams.set('room', id);
            
            const msg = `Hey! Join my collaborative voice study session on SmartTimer.\n\nClick this link to connect: ${joinUrl.toString()}`;
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
        });
    }

    if (joinBtn) {
        joinBtn.addEventListener('click', () => {
            // If already connected, trigger disconnection
            if (activeCall || joinBtn.classList.contains('btn-danger')) {
                disconnectCall();
                return;
            }

            const fId = friendInput.value.trim();
            if (!fId) return alert("Please specify a friend's room ID.");
            
            if (!localStream) {
                navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                    localStream = stream;
                    statusDot.style.background = "var(--success-color)";
                    
                    if (!peer) {
                        peer = new Peer();
                        peer.on('open', () => callPeer(fId));
                    } else {
                        callPeer(fId);
                    }
                }).catch(() => alert("Mic required to connect."));
            } else {
                callPeer(fId);
            }
        });
    }

    function callPeer(friendId) {
        joinBtn.disabled = true;
        joinBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Ringing...';
        
        const call = peer.call(friendId, localStream);
        activeCall = call;

        call.on('stream', (rStream) => {
            remoteAudio.srcObject = rStream;
            joinBtn.disabled = false;
            joinBtn.innerHTML = '<i class="fa-solid fa-phone-slash"></i> Disconnect';
            joinBtn.className = 'btn btn-danger w-full';
            addPartnerToList(friendId);
            showToast("Connected to Voice Study Room.", "fa-circle-check");
        });

        call.on('close', () => {
            handleDisconnectCleanup();
        });

        call.on('error', () => {
            showToast("Failed to connect to friend.", "fa-circle-exclamation");
            handleDisconnectCleanup();
        });
    }

    // Auto-join trigger checks on load
    if (roomToJoin) {
        friendInput.value = roomToJoin;
        showToast("Auto-joining voice study chamber...", "fa-phone-volume");
        
        // Auto trigger the server start
        setTimeout(() => {
            if (startBtn) startBtn.click();
        }, 1500);
    }
}

// --- 18. DASHBOARD GRAPHICS & DATA SYNC ---
function setupDashboard(user) {
    // Top profiles bind
    document.getElementById('userNameLabel').textContent = user.name;
    document.getElementById('userRankLabel').textContent = user.stats.level > 4 ? "Doctorate" : user.stats.level > 2 ? "Graduate" : "Scholar";
    document.getElementById('userStreakLabel').textContent = `${user.stats.streak} days`;
    document.getElementById('headerStreakVal').textContent = user.stats.streak;
    document.getElementById('userPointsLabel').textContent = user.stats.points;
    document.getElementById('userLevelLabel').textContent = user.stats.level;

    // Tabs setup
    const links = document.querySelectorAll('.sidebar-nav .nav-link');
    const titles = {
        "timer": ["Focus Timer", "Maximize your concentration with the Pomodoro technique"],
        "planner": ["Study Planner & Calendar", "Plan blocks, schedule classes, and manage goal checklists"],
        "analytics": ["Heatmap & Focus Analytics", "Track hours studied, consistency, and score metrics"],
        "gamification": ["Daily Challenges & Badges", "Complete milestones, unlock achievements, and climb ranks"],
        "voice": ["Voice Study Chamber", "Host peer focus rooms with real-time audio check-ins"]
    };

    links.forEach(link => {
        link.addEventListener('click', () => {
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            const tab = link.dataset.tab;
            
            // Switch title header
            document.getElementById('pageTitle').textContent = titles[tab][0];
            document.getElementById('pageSubtitle').textContent = titles[tab][1];

            // Switch content page
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tab}`).classList.add('active');
        });
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    });

    // Run sub modules
    setupCalendar(user);
    setupTimetableGenerator(user);
    setupGoalsTracker(user);
    setupVoiceRoom();
    
    // UI draws
    updateDashboardUI(user);
}

function updateDashboardUI(user) {
    renderStudyHeatmap(user);
    renderProductivityGauge(user);
    renderChallengesAndBadges(user);
    renderLeaderboard(user);
    drawAnalyticsChart(user);
}

function drawAnalyticsChart(user) {
    const ctx = document.getElementById('dashboardChart');
    if (!ctx) return;

    // Prep data for past 7 days
    const labels = [];
    const focusData = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const label = d.toLocaleDateString([], { weekday: 'short' });
        labels.push(label);

        const key = d.toISOString().split('T')[0];
        focusData.push((user.history[key] || 0) * timerSettings.pomodoro); // focus time in minutes
    }

    if (window.myDashboardChart) {
        window.myDashboardChart.destroy();
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
    const textColor = isDark ? '#eaeaea' : '#4a4a4a';

    window.myDashboardChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Minutes Focused',
                data: focusData,
                backgroundColor: 'rgba(79, 70, 229, 0.85)',
                borderColor: 'rgb(79, 70, 229)',
                borderWidth: 1,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: textColor }
                }
            }
        }
    });
}

function updateUserRecord(user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
    let users = JSON.parse(localStorage.getItem('users')) || [];
    const idx = users.findIndex(u => u.email === user.email);
    if (idx !== -1) {
        users[idx] = user;
        localStorage.setItem('users', JSON.stringify(users));
    }
}

// --- 19. LANDING PAGE DEMO LOGIC ---
function setupLandingFeatures() {
    // Simply render suggestions
    const items = [
        "Morning is the best time to tackle challenging equations.",
        "Ensure your study desk is cleared of phone/notifiers.",
        "Take deep diaphragmatic breaths during short break intervals.",
        "Write down your goal targets before triggering focus timers."
    ];
    // Custom settings button override on landing page
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    
    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', () => {
            document.getElementById('pomodoroSetting').value = timerSettings.pomodoro;
            document.getElementById('shortBreakSetting').value = timerSettings.shortBreak;
            document.getElementById('longBreakSetting').value = timerSettings.longBreak;
            settingsModal.classList.add('active');
        });
        closeSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('active'));
        
        saveSettingsBtn.addEventListener('click', () => {
            const p = parseInt(document.getElementById('pomodoroSetting').value) || 25;
            const sb = parseInt(document.getElementById('shortBreakSetting').value) || 5;
            const lb = parseInt(document.getElementById('longBreakSetting').value) || 15;
            
            timerSettings = { pomodoro: p, shortBreak: sb, longBreak: lb };
            localStorage.setItem('timerSettings', JSON.stringify(timerSettings));
            
            POMODORO_TIME = p * 60;
            SHORT_BREAK_TIME = sb * 60;
            LONG_BREAK_TIME = lb * 60;
            
            settingsModal.classList.remove('active');
            showToast('Settings saved!', 'fa-circle-check');
            
            // Trigger timer reset
            timeLeft = POMODORO_TIME;
            currentTotalTime = POMODORO_TIME;
            
            const mins = Math.floor(timeLeft / 60);
            const secs = timeLeft % 60;
            document.getElementById('timeDisplay').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        });
    }
}