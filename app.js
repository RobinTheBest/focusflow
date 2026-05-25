/**
 * FocusFlow - Core Application Engine
 * Contains State Management, Delta Timer Core, Web Audio Synthesizer,
 * Gamification Engine, Custom SVG Chart Engine, and LocalStorage Sync.
 */

// ==========================================
// 1. GLOBAL STATE & DEFAULT DATA
// ==========================================
const DEFAULT_STATE = {
  profile: {
    level: 1,
    xp: 0,
    streak: 0,
    lastActiveDate: null,
    totalFocusTime: 0, // in minutes
    totalTasksCompleted: 0
  },
  settings: {
    durations: {
      pomodoro: 25,     // in minutes
      'short-break': 5, // in minutes
      'working-time': 25, // in minutes
      dailyTarget: 120   // in minutes
    },
    preferences: {
      autoStartBreak: false,
      autoStartFocus: false,
      audioAlerts: true
    }
  },
  history: [], // [{ id, task, category, mode, durationSeconds, xpGained, timestamp }]
  todos: [],   // Daily agenda todo checklist
  achievements: [
    { id: 'first_step', name: 'First Step', desc: 'Complete your first focus session', icon: 'fa-shoe-prints', target: 1, progress: 0, unlocked: false },
    { id: 'deep_focus', name: 'Deep Focus', desc: 'Complete a focus session of 25 minutes or more', icon: 'fa-brain', target: 1, progress: 0, unlocked: false },
    { id: 'power_hour', name: 'Hour Power', desc: 'Log a single focus session of 60 minutes or longer', icon: 'fa-bolt', target: 1, progress: 0, unlocked: false },
    { id: 'streak_3', name: 'Productive Habit', desc: 'Maintain an active daily focus streak of 3 days', icon: 'fa-calendar-check', target: 3, progress: 0, unlocked: false },
    { id: 'polymath', name: 'Category Explorer', desc: 'Focus on 3 different categories of tasks', icon: 'fa-signs-post', target: 3, progress: 0, unlocked: false },
    { id: 'xp_rank_5', name: 'Focus Master', desc: 'Climb and reach Level 5 in your focus rank', icon: 'fa-crown', target: 5, progress: 1, unlocked: false }
  ]
};

let state = JSON.parse(JSON.stringify(DEFAULT_STATE));

// Timer state
let timer = {
  mode: 'pomodoro', // 'pomodoro', 'short-break', 'working-time', 'stopwatch'
  status: 'idle',    // 'idle', 'running', 'paused'
  timeLeft: 25 * 60, // in seconds
  totalSeconds: 25 * 60,
  secondsTracked: 0, // for stopwatch or current active focus
  intervalId: null,
  lastTick: null,    // for delta-time calculations
  activeTask: '',
  activeCategory: 'Coding',
  isTaskLocked: false
};

// Web Audio Context & Synthesizer State
let audioCtx = null;
let activeSoundNode = null;
let soundVolumeNode = null;
let lfoNode = null; // for ambient sweeps
let ambientMode = 'none'; // 'none', 'rain', 'drone', 'binaural'

// ==========================================
// 2. DOM INITIALIZATION & NAVIGATION ROUTER
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupNavigation();
  setupTimerControls();
  setupTaskForm();
  setupSliders();
  setupProfileActions();
  setupTodoActions();
  setupAmbientSoundControls();
  setupSettingsScreen();
  setupHistoryFilters();
  
  // Initial renders
  renderApp();
  renderTodoList();
  updateThemeAndDescription();
  syncTimerDisplay();
  
  // Browser window/tab visibility change (timer correction safeguard)
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

// Setup sidebar router
function setupNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  const screens = document.querySelectorAll('.screen');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetScreenId = link.getAttribute('data-screen');
      
      // Update sidebar nav states
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      // Update Screen visibility with fade animations
      screens.forEach(screen => {
        if (screen.id === targetScreenId) {
          screen.classList.add('active');
          // Refresh screen-specific metrics/graphs
          if (targetScreenId === 'dashboard-screen') {
            renderDashboardAnalytics();
          } else if (targetScreenId === 'history-screen') {
            renderHistoryTable();
          } else if (targetScreenId === 'achievements-screen') {
            renderAchievements();
          }
        } else {
          screen.classList.remove('active');
        }
      });
    });
  });
}

// Handle browser tab focus adjustments (keeps timer delta exact)
function handleVisibilityChange() {
  if (timer.status === 'running') {
    timer.lastTick = Date.now();
  }
}

// ==========================================
// 3. STORAGE & DATA SYNC
// ==========================================
// ==========================================
// 3. STORAGE & DATA SYNC (Profiles Database)
// ==========================================
let activeUser = "Guest";
let usersDb = { guest: JSON.parse(JSON.stringify(DEFAULT_STATE)) };

function loadData(overrideUsername) {
  const storedDb = localStorage.getItem('focusflow_users_db');
  
  if (storedDb) {
    try {
      usersDb = JSON.parse(storedDb);
    } catch (e) {
      console.error("Corrupted database, resetting to default.", e);
      usersDb = { guest: JSON.parse(JSON.stringify(DEFAULT_STATE)) };
    }
  }
  
  if (overrideUsername) {
    activeUser = overrideUsername;
  } else {
    const storedActive = localStorage.getItem('focusflow_active_user');
    if (storedActive) {
      activeUser = storedActive;
    } else {
      activeUser = "Guest";
    }
  }
  
  const userKey = activeUser.toLowerCase();
  
  // Initialize key if it doesn't exist
  if (!usersDb[userKey]) {
    usersDb[userKey] = JSON.parse(JSON.stringify(DEFAULT_STATE));
    usersDb[userKey].profile.username = activeUser;
  }
  
  // Deep merge loaded user's state to prevent missing properties (e.g. durations)
  state = {
    profile: { ...DEFAULT_STATE.profile, ...usersDb[userKey].profile },
    settings: {
      durations: { ...DEFAULT_STATE.settings.durations, ...usersDb[userKey].settings?.durations },
      preferences: { ...DEFAULT_STATE.settings.preferences, ...usersDb[userKey].settings?.preferences }
    },
    history: usersDb[userKey].history || [],
    todos: usersDb[userKey].todos || [], // Load daily agenda todos
    achievements: (usersDb[userKey].achievements || []).length > 0
      ? DEFAULT_STATE.achievements.map(defAch => {
          const userAch = usersDb[userKey].achievements.find(a => a.id === defAch.id);
          return userAch ? { ...defAch, progress: userAch.progress, unlocked: userAch.unlocked } : defAch;
        })
      : DEFAULT_STATE.achievements
  };
  
  // Backwards compatibility safeguard
  if (!state.profile.username) {
    state.profile.username = activeUser;
  }
  
  // Recalculate completed tasks count from current daily todos to ensure alignment
  state.profile.totalTasksCompleted = state.todos.filter(t => t.completed).length;
  
  // Set active durations inside state
  timer.timeLeft = state.settings.durations.pomodoro * 60;
  timer.totalSeconds = state.settings.durations.pomodoro * 60;
  
  checkDailyStreakValidation();
}

function saveData() {
  const userKey = activeUser.toLowerCase();
  
  // Ensure profile has active username
  state.profile.username = activeUser;
  
  // Update database entry
  usersDb[userKey] = {
    profile: state.profile,
    settings: state.settings,
    history: state.history,
    todos: state.todos, // Save daily agenda todos
    achievements: state.achievements
  };
  
  localStorage.setItem('focusflow_users_db', JSON.stringify(usersDb));
  localStorage.setItem('focusflow_active_user', activeUser);
}

// Daily focus streak evaluation logic
function checkDailyStreakValidation() {
  if (!state.profile.lastActiveDate) return;
  
  const todayStr = getLocalDateString(new Date());
  const lastActive = new Date(state.profile.lastActiveDate);
  const today = new Date(todayStr);
  
  const diffTime = Math.abs(today - lastActive);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays > 1) {
    // Streak broken if offline for more than 24 hours since last focus activity date
    state.profile.streak = 0;
    saveData();
  }
}

function getLocalDateString(date) {
  const offset = date.getTimezoneOffset();
  const adjustedDate = new Date(date.getTime() - (offset * 60 * 1000));
  return adjustedDate.toISOString().split('T')[0];
}

// ==========================================
// 4. THE CORE TIMER SYSTEM
// ==========================================
function setupTimerControls() {
  const btnStartPause = document.getElementById('btn-timer-start-pause');
  const btnReset = document.getElementById('btn-timer-reset');
  const btnFinish = document.getElementById('btn-timer-finish');
  const modeButtons = document.querySelectorAll('.timer-mode-selector button');

  // Start / Pause
  btnStartPause.addEventListener('click', () => {
    if (timer.status === 'running') {
      pauseTimer();
    } else {
      startTimer();
    }
  });

  // Reset
  btnReset.addEventListener('click', resetTimer);

  // Finish (Stopwatch complete, or manual quick Pomodoro finish)
  btnFinish.addEventListener('click', completeSession);

  // Mode Selection buttons
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedMode = btn.getAttribute('data-mode');
      if (selectedMode) {
        changeTimerMode(selectedMode);
      }
    });
  });
}

function changeTimerMode(mode) {
  if (timer.status !== 'idle') {
    if (!confirm('Abandoning current active session. Are you sure you want to change tracking modes?')) {
      return;
    }
  }

  // Clear timers
  clearInterval(timer.intervalId);
  timer.status = 'idle';
  timer.secondsTracked = 0;

  // Toggle active button styling on mode buttons
  const modeButtons = document.querySelectorAll('.timer-mode-selector button');
  modeButtons.forEach(b => {
    if (b.getAttribute('data-mode') === mode) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  timer.mode = mode;
  
  // Configure Sliders Visibility
  const workSliderGroup = document.getElementById('work-slider-group');
  const breakSliderGroup = document.getElementById('break-slider-group');
  const vibeBox = document.getElementById('focus-vibe-box');
  const slidersCard = document.getElementById('session-sliders-card');

  if (slidersCard) {
    slidersCard.style.display = 'block';
  }

  // Set global visual theme based on current mode
  document.body.className = ''; // wipe current themes
  if (mode === 'pomodoro') {
    document.body.classList.add('theme-focus');
    if (workSliderGroup) workSliderGroup.style.display = 'block';
    if (breakSliderGroup) breakSliderGroup.style.display = 'block';
    if (vibeBox) vibeBox.style.display = 'flex';
    
    const workSlider = document.getElementById('work-time-slider');
    const workVal = workSlider ? parseInt(workSlider.value) : state.settings.durations.pomodoro;
    
    timer.timeLeft = workVal * 60;
    timer.totalSeconds = workVal * 60;
    document.getElementById('timer-display-label').textContent = 'Deep Focus';
  } else if (mode === 'short-break') {
    document.body.classList.add('theme-short');
    if (workSliderGroup) workSliderGroup.style.display = 'none';
    if (breakSliderGroup) breakSliderGroup.style.display = 'block';
    if (vibeBox) vibeBox.style.display = 'flex';
    
    const breakSlider = document.getElementById('break-time-slider');
    const breakVal = breakSlider ? parseInt(breakSlider.value) : state.settings.durations['short-break'];
    
    timer.timeLeft = breakVal * 60;
    timer.totalSeconds = breakVal * 60;
    document.getElementById('timer-display-label').textContent = 'Short Rest';
  } else if (mode === 'working-time') {
    document.body.classList.add('theme-focus');
    if (workSliderGroup) workSliderGroup.style.display = 'block';
    if (breakSliderGroup) breakSliderGroup.style.display = 'none';
    if (vibeBox) vibeBox.style.display = 'flex';
    
    const workSlider = document.getElementById('work-time-slider');
    const workVal = workSlider ? parseInt(workSlider.value) : state.settings.durations['working-time'];
    
    timer.timeLeft = workVal * 60;
    timer.totalSeconds = workVal * 60;
    document.getElementById('timer-display-label').textContent = 'Working Time';
  } else if (mode === 'stopwatch') {
    document.body.classList.add('theme-focus');
    if (workSliderGroup) workSliderGroup.style.display = 'none';
    if (breakSliderGroup) breakSliderGroup.style.display = 'none';
    if (vibeBox) vibeBox.style.display = 'none';
    if (slidersCard) slidersCard.style.display = 'none';
    
    timer.timeLeft = 0;
    timer.totalSeconds = 0;
    document.getElementById('timer-display-label').textContent = 'Stopwatch Focus';
  }

  updateThemeAndDescription();
  syncTimerDisplay();
  updateTimerControlButtons();
}

function startTimer() {
  if (timer.status === 'running') return;

  // Initialize Web Audio context upon user interaction if not loaded
  initAudioContext();

  timer.status = 'running';
  timer.lastTick = Date.now();
  
  // Active CSS pulsing
  document.getElementById('timer-display-digits').classList.add('ticking');
  
  timer.intervalId = setInterval(tick, 100); // Poll 10 times a second for delta accuracy

  updateTimerControlButtons();
}

function pauseTimer() {
  if (timer.status !== 'running') return;
  
  timer.status = 'paused';
  clearInterval(timer.intervalId);
  document.getElementById('timer-display-digits').classList.remove('ticking');
  
  updateTimerControlButtons();
}

function resetTimer() {
  if (timer.status === 'idle') return;

  clearInterval(timer.intervalId);
  timer.status = 'idle';
  timer.secondsTracked = 0;
  document.getElementById('timer-display-digits').classList.remove('ticking');

  if (timer.mode === 'stopwatch') {
    timer.timeLeft = 0;
    timer.totalSeconds = 0;
  } else {
    const durations = state.settings.durations;
    const modeKey = timer.mode === 'pomodoro' ? 'pomodoro' : timer.mode;
    timer.timeLeft = durations[modeKey] * 60;
    timer.totalSeconds = durations[modeKey] * 60;
  }

  syncTimerDisplay();
  updateTimerControlButtons();
}

// Delta Time tick function to prevent browser backgrounding latency issues
function tick() {
  if (timer.status !== 'running') return;

  const now = Date.now();
  const delta = (now - timer.lastTick) / 1000;
  timer.lastTick = now;

  if (timer.mode === 'stopwatch') {
    timer.timeLeft += delta;
    timer.secondsTracked += delta;
  } else {
    timer.timeLeft -= delta;
    timer.secondsTracked += delta;
    
    if (timer.timeLeft <= 0) {
      timer.timeLeft = 0;
      completeSession();
      return;
    }
  }

  syncTimerDisplay();
}

// Sync digits and SVG progress ring metrics
function syncTimerDisplay() {
  const digits = document.getElementById('timer-display-digits');
  const ring = document.getElementById('timer-progress-ring');
  
  const displaySecs = Math.floor(timer.timeLeft);
  const minutes = Math.floor(displaySecs / 60);
  const seconds = displaySecs % 60;
  
  digits.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  // Progress Ring Calculation
  if (timer.mode === 'stopwatch') {
    // Infinite spin or complete fills per hour (60m block)
    const strokeDash = 879; // 2 * PI * 140
    const currentProgress = (timer.timeLeft % 3600) / 3600;
    ring.style.strokeDashoffset = strokeDash - (currentProgress * strokeDash);
  } else {
    // Countdown percentage
    const strokeDash = 879;
    const pct = timer.timeLeft / timer.totalSeconds;
    ring.style.strokeDashoffset = strokeDash * (1 - pct);
  }
}

// Enable/Disable control buttons depending on current operational status
function updateTimerControlButtons() {
  const btnStartPause = document.getElementById('btn-timer-start-pause');
  const btnReset = document.getElementById('btn-timer-reset');
  const btnFinish = document.getElementById('btn-timer-finish');
  const playIcon = document.getElementById('timer-play-icon');

  if (timer.status === 'running') {
    playIcon.className = 'fa-solid fa-pause';
    btnStartPause.setAttribute('title', 'Pause focus session');
    btnReset.disabled = false;
    btnFinish.disabled = timer.mode !== 'stopwatch' && timer.secondsTracked < 10; // complete requires min tracking
  } else if (timer.status === 'paused') {
    playIcon.className = 'fa-solid fa-play';
    btnStartPause.setAttribute('title', 'Resume focus session');
    btnReset.disabled = false;
    btnFinish.disabled = false;
  } else {
    // Idle state
    playIcon.className = 'fa-solid fa-play';
    btnStartPause.setAttribute('title', 'Start focus session');
    btnReset.disabled = true;
    btnFinish.disabled = true;
  }
}

// Complete and Log tracking details
function completeSession() {
  clearInterval(timer.intervalId);
  timer.status = 'idle';
  document.getElementById('timer-display-digits').classList.remove('ticking');
  
  const durationSecs = Math.floor(timer.secondsTracked);
  
  // Play dynamic chime synthesis alert
  if (state.settings.preferences.audioAlerts) {
    playAlarmChime();
  }
  
  // Process rewards if there is any substantial time spent (minimally 5 seconds for visual verification)
  if (durationSecs >= 5) {
    const isFocus = (timer.mode === 'pomodoro' || timer.mode === 'stopwatch');
    
    // 1 focus minute = 1 XP
    let xpEarned = 0;
    if (isFocus) {
      xpEarned = Math.max(1, Math.round(durationSecs / 60));
    }
    
    // Add to history
    const sessionObj = {
      id: 'session_' + Date.now(),
      task: isFocus ? (timer.activeTask || 'General Concentration') : (timer.mode === 'short-break' ? 'Short Rest Period' : 'Extended Rest Period'),
      category: isFocus ? timer.activeCategory : 'Rest',
      mode: timer.mode,
      durationSeconds: durationSecs,
      xpGained: xpEarned,
      timestamp: new Date().toISOString()
    };
    
    state.history.push(sessionObj);
    
    if (isFocus) {
      // Accumulate profile metrics
      state.profile.totalFocusTime += (durationSecs / 60);
      state.profile.xp += xpEarned;
      
      // Update active streak
      const todayStr = getLocalDateString(new Date());
      if (state.profile.lastActiveDate !== todayStr) {
        if (state.profile.lastActiveDate) {
          const lastDate = new Date(state.profile.lastActiveDate);
          const today = new Date(todayStr);
          const diffDays = Math.round((today - lastDate) / (1000 * 60 * 60 * 24));
          
          if (diffDays === 1) {
            state.profile.streak += 1;
          } else if (diffDays > 1) {
            state.profile.streak = 1;
          }
        } else {
          // First focus ever
          state.profile.streak = 1;
        }
        state.profile.lastActiveDate = todayStr;
      }
      
      // Handle Gamification rank checks & Achievement triggers
      awardXPAndCheckLevels(xpEarned);
      updateAchievementsProgress(sessionObj);
    }
    
    saveData();
    renderApp();
  }
  
  // Transition timer behaviors automatically if preferences allow
  const nextMode = getNextAutomaticMode();
  timer.secondsTracked = 0;
  
  if (nextMode) {
    changeTimerMode(nextMode);
    
    const shouldAutoStart = (nextMode === 'pomodoro' && state.settings.preferences.autoStartFocus) ||
                            ((nextMode === 'short-break' || nextMode === 'working-time') && state.settings.preferences.autoStartBreak);
    
    if (shouldAutoStart) {
      setTimeout(startTimer, 1000);
    }
  } else {
    resetTimer();
  }
}

// Logic to alternate focus and breaks automatically
function getNextAutomaticMode() {
  if (timer.mode === 'pomodoro') {
    return 'short-break';
  } else if (timer.mode === 'short-break') {
    return 'pomodoro';
  }
  
  return null;
}

// ==========================================
// 5. TASK DEFINITION FORM
// ==========================================
function setupTaskForm() {
  const taskInput = document.getElementById('task-input-field');
  const pillsContainer = document.getElementById('category-pills-container');
  const btnLock = document.getElementById('btn-lock-task');
  const activePillText = document.getElementById('timer-active-task-text');
  const activePill = document.getElementById('timer-active-task-pill');

  // Category tags clicking handlers
  pillsContainer.addEventListener('click', (e) => {
    const pill = e.target.closest('.category-pill');
    if (!pill) return;
    
    pillsContainer.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    
    timer.activeCategory = pill.getAttribute('data-category');
  });

  // Lock task objective button click
  btnLock.addEventListener('click', () => {
    if (timer.isTaskLocked) {
      // Unlock task to allow changes
      timer.isTaskLocked = false;
      taskInput.disabled = false;
      pillsContainer.style.pointerEvents = 'auto';
      btnLock.innerHTML = '<i class="fa-solid fa-lock"></i> Lock Focus Task';
      btnLock.classList.remove('btn-secondary');
      btnLock.classList.add('btn-primary');
    } else {
      const rawTask = taskInput.value.trim();
      timer.activeTask = rawTask || 'General Concentration';
      timer.isTaskLocked = true;
      
      // Update Form widgets UI
      taskInput.disabled = true;
      pillsContainer.style.pointerEvents = 'none';
      btnLock.innerHTML = '<i class="fa-solid fa-lock-open"></i> Modify Objectives';
      btnLock.classList.add('btn-secondary');
      
      // Update Timer board Display
      activePillText.textContent = `${timer.activeTask} [${timer.activeCategory}]`;
      activePill.classList.add('active');
    }
  });
}

// ==========================================
// 6. AMBIENT AUDIO SYNTHESIZER ENGINE (Web Audio API)
// ==========================================
function setupAmbientSoundControls() {
  const volumeSlider = document.getElementById('audio-volume-slider');
  const soundRows = document.querySelectorAll('.ambient-sound-row');
  
  volumeSlider.addEventListener('input', (e) => {
    const vol = parseFloat(e.target.value);
    
    // Update volume levels on existing audio gain nodes
    if (soundVolumeNode) {
      soundVolumeNode.gain.setValueAtTime(vol, audioCtx.currentTime);
    }
    
    // Update Volume Icon representation
    const volIcon = document.getElementById('volume-icon');
    if (vol === 0) {
      volIcon.className = 'fa-solid fa-volume-mute';
    } else if (vol < 0.4) {
      volIcon.className = 'fa-solid fa-volume-low';
    } else {
      volIcon.className = 'fa-solid fa-volume-high';
    }
  });

  soundRows.forEach(row => {
    row.addEventListener('click', () => {
      const soundType = row.getAttribute('data-sound');
      if (!soundType) return;
      
      soundRows.forEach(r => r.classList.remove('active'));
      row.classList.add('active');
      
      changeAmbientSound(soundType);
    });
  });
}

function initAudioContext() {
  if (audioCtx) return;
  
  // Safely initialize Web Audio context handles
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContextClass();
  
  // Construct central master gain control
  soundVolumeNode = audioCtx.createGain();
  const defaultVol = parseFloat(document.getElementById('audio-volume-slider').value);
  soundVolumeNode.gain.setValueAtTime(defaultVol, audioCtx.currentTime);
  soundVolumeNode.connect(audioCtx.destination);
}

function changeAmbientSound(sound) {
  initAudioContext();
  
  // Resume context in case browser state had it suspended (autoplay blocks)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // Stop currently running sound streams
  stopCurrentAmbientSound();
  ambientMode = sound;

  if (sound === 'none') return;

  // Render and launch Synthesizers
  if (sound === 'rain') {
    playRainSynthesizer();
  } else if (sound === 'drone') {
    playCosmicDroneSynthesizer();
  } else if (sound === 'binaural') {
    playBinauralWaveSynthesizer(10);
  } else if (sound === 'gamma-binaural') {
    playBinauralWaveSynthesizer(40);
  }
}

function stopCurrentAmbientSound() {
  if (activeSoundNode) {
    try {
      if (Array.isArray(activeSoundNode)) {
        activeSoundNode.forEach(node => node.stop());
      } else {
        activeSoundNode.stop();
      }
    } catch (e) {
      // Suppress state errors if node was already stopped
    }
    activeSoundNode = null;
  }
  
  if (lfoNode) {
    try { lfoNode.stop(); } catch(e) {}
    lfoNode = null;
  }
}

/**
 * 6a. Pink Noise Rain Synthesizer:
 * Math algorithm to create analog pink noise and low-pass sweep filter
 */
function playRainSynthesizer() {
  const bufferSize = 2 * audioCtx.sampleRate;
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  
  // Paul Kellet's refined pink noise approximation logic
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    output[i] *= 0.12; // lower volume spikes
    b6 = white * 0.115926;
  }
  
  const noiseSource = audioCtx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;
  
  // Add an interactive low-pass filter to sound like soft rainfall sweeps
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  filter.Q.value = 1.0;
  
  // Set up LFO to fluctuate rain thickness (simulates gentle wind breeze)
  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.frequency.value = 0.15; // Slow sweep (once every 6-7 seconds)
  lfoGain.gain.value = 300;   // Modulate filter between 500Hz and 1100Hz
  
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  noiseSource.connect(filter);
  filter.connect(soundVolumeNode);
  
  // Launch Synthesizer Node
  lfo.start();
  noiseSource.start();
  
  activeSoundNode = noiseSource;
  lfoNode = lfo;
}

/**
 * 6b. Deep Cosmic Space Drone Synthesizer:
 * Multi-oscillator dark ambient low humming sweep
 */
function playCosmicDroneSynthesizer() {
  const oscs = [];
  const frequencies = [60, 90, 120]; // Harmonious low hum tones (C1/G1 range)
  
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 140;
  filter.Q.value = 2.0;

  // LFO filter sweep (deep space breathing effect)
  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.frequency.value = 0.08; // slow drone pulse
  lfoGain.gain.value = 50;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);

  frequencies.forEach((freq, idx) => {
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    
    osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
    osc.frequency.value = freq;
    
    oscGain.gain.value = 0.25 / frequencies.length;
    
    // Connect units
    osc.connect(oscGain);
    oscGain.connect(filter);
    
    osc.start();
    oscs.push(osc);
  });
  
  filter.connect(soundVolumeNode);
  lfo.start();
  
  activeSoundNode = oscs;
  lfoNode = lfo;
}

/**
 * 6c. Alpha Binaural Waves focus generator:
 * Generates 10Hz differential frequencies between left and right channels
 */
function playBinauralWaveSynthesizer(diffHz = 10) {
  const oscL = audioCtx.createOscillator();
  const oscR = audioCtx.createOscillator();
  
  const merger = audioCtx.createChannelMerger(2);
  
  // Left/Right differential frequencies (e.g. 200Hz Left, 200 + diffHz Right)
  oscL.frequency.value = 200; // 200Hz to left speaker
  oscL.type = 'sine';
  
  oscR.frequency.value = 200 + diffHz; // right speaker differential (Alpha 10Hz, Gamma 40Hz)
  oscR.type = 'sine';

  const gainL = audioCtx.createGain();
  const gainR = audioCtx.createGain();
  gainL.gain.value = 0.2;
  gainR.gain.value = 0.2;
  
  // Wire left/right channels
  oscL.connect(gainL).connect(merger, 0, 0);
  oscR.connect(gainR).connect(merger, 0, 1);
  
  merger.connect(soundVolumeNode);
  
  oscL.start();
  oscR.start();
  
  activeSoundNode = [oscL, oscR];
}

/**
 * Premium Synthesized notification alarm sound:
 * Play ascending C-major triad chime over 1.5 seconds
 */
function playAlarmChime() {
  if (!audioCtx) return;
  
  const now = audioCtx.currentTime;
  const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5 arpeggio
  
  notes.forEach((freq, idx) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + idx * 0.15);
    
    // Envelope curves
    gain.gain.setValueAtTime(0, now + idx * 0.15);
    gain.gain.linearRampToValueAtTime(0.35, now + idx * 0.15 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.6);
    
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + idx * 0.15);
    osc.stop(now + idx * 0.15 + 0.61);
  });
}

/**
 * Level Up synth celebration audio arpeggio sound effect
 */
function playLevelUpCelebrationChime() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const baseFreq = 220; // A3
  const intervals = [1, 1.25, 1.5, 1.875, 2.0, 2.5]; // Harmonious major scale multipliers
  
  intervals.forEach((mult, idx) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq * mult, now + idx * 0.08);
    
    gain.gain.setValueAtTime(0, now + idx * 0.08);
    gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.08 + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.5);
    
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + idx * 0.08);
    osc.stop(now + idx * 0.08 + 0.51);
  });
}

// ==========================================
// 7. GAMIFICATION & REWARDS ENGINE
// ==========================================
function awardXPAndCheckLevels(xpGained) {
  state.profile.xp += xpGained;
  
  // Level down if XP drops below 0 and user is above Level 1
  while (state.profile.level > 1 && state.profile.xp < 0) {
    state.profile.level -= 1;
    const prevReq = getXPNeededForLevel(state.profile.level);
    state.profile.xp += prevReq;
  }
  
  // Guard XP from dropping below 0 on Level 1
  if (state.profile.level === 1 && state.profile.xp < 0) {
    state.profile.xp = 0;
  }

  let currentLevel = state.profile.level;
  let xpRequired = getXPNeededForLevel(currentLevel);
  
  let levelUpOccurred = false;
  
  // Level loop for bulk XP gains
  while (state.profile.xp >= xpRequired) {
    state.profile.xp -= xpRequired;
    currentLevel += 1;
    xpRequired = getXPNeededForLevel(currentLevel);
    levelUpOccurred = true;
  }
  
  if (levelUpOccurred) {
    state.profile.level = currentLevel;
    triggerLevelUpToast(currentLevel);
  }
  
  saveData();
}

function getXPNeededForLevel(level) {
  // Progression curve: Level 1 -> 100XP, Level 2 -> 200XP, Level 3 -> 300XP
  return level * 100;
}

// Slide in a beautiful visual overlay notification when Rank Levels increment
function triggerLevelUpToast(newLevel) {
  const toast = document.getElementById('level-up-toast');
  const toastText = document.getElementById('level-up-message-text');
  
  toastText.textContent = `Excellent work! You reached Focus Rank Level ${newLevel}!`;
  toast.classList.add('show');
  
  playLevelUpCelebrationChime();
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 4500);
}

// Evaluate unlock triggers for various badge achievements
function updateAchievementsProgress(lastSession) {
  let changed = false;
  const todayStr = getLocalDateString(new Date());
  
  state.achievements.forEach(ach => {
    if (ach.unlocked) return; // ignore already unlocked achievements
    
    let progressUpdated = false;
    
    switch (ach.id) {
      case 'first_step':
        ach.progress = state.history.filter(h => h.mode === 'pomodoro' || h.mode === 'stopwatch').length;
        progressUpdated = true;
        break;
        
      case 'deep_focus':
        const standardFocusSessionsCount = state.history.filter(h => 
          (h.mode === 'pomodoro' || h.mode === 'stopwatch') && h.durationSeconds >= (25 * 60)
        ).length;
        ach.progress = standardFocusSessionsCount;
        progressUpdated = true;
        break;
        
      case 'power_hour':
        const powerSessionsCount = state.history.filter(h => 
          (h.mode === 'pomodoro' || h.mode === 'stopwatch') && h.durationSeconds >= (60 * 60)
        ).length;
        ach.progress = powerSessionsCount;
        progressUpdated = true;
        break;
        
      case 'streak_3':
        ach.progress = state.profile.streak;
        progressUpdated = true;
        break;
        
      case 'polymath':
        const focusCategoriesSet = new Set(
          state.history
            .filter(h => h.mode === 'pomodoro' || h.mode === 'stopwatch')
            .map(h => h.category)
        );
        ach.progress = focusCategoriesSet.size;
        progressUpdated = true;
        break;
        
      case 'xp_rank_5':
        ach.progress = state.profile.level;
        progressUpdated = true;
        break;
    }
    
    if (progressUpdated) {
      if (ach.progress >= ach.target) {
        ach.progress = ach.target;
        ach.unlocked = true;
      }
      changed = true;
    }
  });
  
  if (changed) {
    saveData();
  }
}

// ==========================================
// 8. DYNAMIC CUSTOM SVG ANALYTICS ENGINE
// ==========================================
function renderDashboardAnalytics() {
  // Update overview panel cards values
  const totalHrs = Math.floor(state.profile.totalFocusTime / 60);
  const totalMins = Math.round(state.profile.totalFocusTime % 60);
  document.getElementById('stats-total-time').textContent = `${totalHrs}h ${totalMins}m`;
  document.getElementById('stats-streak').textContent = `${state.profile.streak} Day${state.profile.streak === 1 ? '' : 's'}`;
  document.getElementById('stats-total-tasks').textContent = state.profile.totalTasksCompleted;
  
  // Focus points calculation (accumulated through full user levels)
  let totalXPAccumulated = state.profile.xp;
  for (let i = 1; i < state.profile.level; i++) {
    totalXPAccumulated += getXPNeededForLevel(i);
  }
  document.getElementById('stats-total-xp').textContent = `${totalXPAccumulated} XP`;

  // Draw core SVG representations
  drawWeeklyBarChart();
  drawCategoryDonutChart();
}

/**
 * 8a. Custom SVG Weekly Bar Graph Renderer:
 * Dynamically computes scale vectors and elements inside plain DOM
 */
function drawWeeklyBarChart() {
  const svg = document.getElementById('weekly-bar-svg');
  if (!svg) return;
  
  // Wipe everything except definition presets
  const defs = svg.querySelector('defs');
  svg.innerHTML = '';
  svg.appendChild(defs);

  const width = 500;
  const height = 280;
  const paddingLeft = 45;
  const paddingRight = 15;
  const paddingTop = 30;
  const paddingBottom = 40;
  
  // Gather focus durations of last 7 calendar dates
  const days = [];
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const dateStr = getLocalDateString(d);
    
    // Sum duration in minutes for this specific day
    const daySumMins = state.history
      .filter(h => (h.mode === 'pomodoro' || h.mode === 'stopwatch') && h.timestamp.startsWith(dateStr))
      .reduce((sum, h) => sum + (h.durationSeconds / 60), 0);
      
    days.push({
      dateStr: dateStr,
      label: weekdayNames[d.getDay()],
      minutes: Math.round(daySumMins)
    });
  }

  // Draw Grid lines
  const maxMins = Math.max(30, ...days.map(d => d.minutes));
  const scaleMax = Math.ceil(maxMins / 30) * 30; // Round up to nearest 30-min grid line
  
  const chartHeight = height - paddingTop - paddingBottom;
  const chartWidth = width - paddingLeft - paddingRight;

  // 4 Horizontal Gridlines
  for (let i = 0; i <= 4; i++) {
    const val = (scaleMax / 4) * i;
    const y = height - paddingBottom - (chartHeight * (i / 4));
    
    // Line
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", paddingLeft);
    line.setAttribute("y1", y);
    line.setAttribute("x2", width - paddingRight);
    line.setAttribute("y2", y);
    line.setAttribute("class", "chart-grid-line");
    svg.appendChild(line);
    
    // Label Y-Axis
    const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txt.setAttribute("x", paddingLeft - 10);
    txt.setAttribute("y", y + 4);
    txt.setAttribute("text-anchor", "end");
    txt.setAttribute("class", "chart-text");
    txt.textContent = `${Math.round(val)}m`;
    svg.appendChild(txt);
  }

  // Y-Axis line
  const axisY = document.createElementNS("http://www.w3.org/2000/svg", "line");
  axisY.setAttribute("x1", paddingLeft);
  axisY.setAttribute("y1", paddingTop - 10);
  axisY.setAttribute("x2", paddingLeft);
  axisY.setAttribute("y2", height - paddingBottom);
  axisY.setAttribute("class", "chart-axis-line");
  svg.appendChild(axisY);

  // X-Axis line
  const axisX = document.createElementNS("http://www.w3.org/2000/svg", "line");
  axisX.setAttribute("x1", paddingLeft);
  axisX.setAttribute("y1", height - paddingBottom);
  axisX.setAttribute("x2", width - paddingRight + 5);
  axisX.setAttribute("y2", height - paddingBottom);
  axisX.setAttribute("class", "chart-axis-line");
  svg.appendChild(axisX);

  // Render Bar Charts
  const barWidth = 36;
  const colSpacing = chartWidth / days.length;
  const tooltip = document.getElementById('chart-tooltip');

  days.forEach((day, index) => {
    const colX = paddingLeft + (colSpacing * index) + (colSpacing - barWidth) / 2;
    const barHeight = scaleMax > 0 ? (day.minutes / scaleMax) * chartHeight : 0;
    const barY = height - paddingBottom - barHeight;

    // Draw Bar Rect
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", colX);
    rect.setAttribute("y", barY);
    rect.setAttribute("width", barWidth);
    rect.setAttribute("height", Math.max(2, barHeight)); // show sliver even for low durations
    rect.setAttribute("class", "chart-bar");
    
    // Hover dynamic tooltip handlers
    rect.addEventListener('mousemove', (e) => {
      tooltip.style.opacity = 1;
      tooltip.textContent = `${day.minutes} min${day.minutes === 1 ? '' : 's'} logged`;
      
      const containerRect = svg.parentElement.getBoundingClientRect();
      tooltip.style.left = `${e.clientX - containerRect.left + 15}px`;
      tooltip.style.top = `${e.clientY - containerRect.top - 35}px`;
    });
    
    rect.addEventListener('mouseleave', () => {
      tooltip.style.opacity = 0;
    });

    svg.appendChild(rect);

    // Render X-Axis weekday label
    const xTxt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    xTxt.setAttribute("x", colX + barWidth / 2);
    xTxt.setAttribute("y", height - paddingBottom + 20);
    xTxt.setAttribute("text-anchor", "middle");
    xTxt.setAttribute("class", "chart-text");
    xTxt.setAttribute("style", "font-weight: 600; fill: var(--text-secondary);");
    xTxt.textContent = day.label;
    svg.appendChild(xTxt);
  });
}

/**
 * 8b. Dynamic Donut Chart allocation renderer:
 * Calculates angles, radius arcs, and responsive legends
 */
function drawCategoryDonutChart() {
  const svg = document.getElementById('category-donut-svg');
  const legends = document.getElementById('donut-legend-container');
  if (!svg || !legends) return;

  svg.innerHTML = '';
  legends.innerHTML = '';

  // Sum categories durations
  const cats = ['Coding', 'Learning', 'Design', 'Writing', 'Admin', 'Other'];
  const catColors = {
    Coding: '#8b5cf6',
    Learning: '#3b82f6',
    Design: '#10b981',
    Writing: '#f43f5e',
    Admin: '#fbbf24',
    Other: '#64748b'
  };

  const data = cats.map(cat => {
    const sumSecs = state.history
      .filter(h => (h.mode === 'pomodoro' || h.mode === 'stopwatch') && h.category === cat)
      .reduce((sum, h) => sum + h.durationSeconds, 0);
    return {
      name: cat,
      minutes: Math.round(sumSecs / 60),
      color: catColors[cat]
    };
  });

  const totalMins = data.reduce((sum, d) => sum + d.minutes, 0);

  if (totalMins === 0) {
    // Render Empty State message inside SVG
    const emptyTxt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    emptyTxt.setAttribute("x", 100);
    emptyTxt.setAttribute("y", 105);
    emptyTxt.setAttribute("text-anchor", "middle");
    emptyTxt.setAttribute("fill", "var(--text-muted)");
    emptyTxt.setAttribute("style", "font-size: 10px; font-weight: 600;");
    emptyTxt.textContent = "No focus data recorded yet";
    svg.appendChild(emptyTxt);
    
    // Draw dummy gray background ring
    const dummyRing = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dummyRing.setAttribute("cx", 100);
    dummyRing.setAttribute("cy", 100);
    dummyRing.setAttribute("r", 70);
    dummyRing.setAttribute("fill", "none");
    dummyRing.setAttribute("stroke", "rgba(255,255,255,0.03)");
    dummyRing.setAttribute("stroke-width", "16");
    svg.insertBefore(dummyRing, emptyTxt);
    return;
  }

  // Draw Center profile summary text info
  const centerHrs = Math.floor(totalMins / 60);
  const centerMins = totalMins % 60;
  
  const textVal = document.createElementNS("http://www.w3.org/2000/svg", "text");
  textVal.setAttribute("x", 100);
  textVal.setAttribute("y", 98);
  textVal.setAttribute("text-anchor", "middle");
  textVal.setAttribute("class", "donut-center-text-val");
  textVal.textContent = `${centerHrs}h ${centerMins}m`;
  
  const textLbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
  textLbl.setAttribute("x", 100);
  textLbl.setAttribute("y", 116);
  textLbl.setAttribute("text-anchor", "middle");
  textLbl.setAttribute("class", "donut-center-text-lbl");
  textLbl.textContent = "Total Logged";
  
  svg.appendChild(textVal);
  svg.appendChild(textLbl);

  // Compute angles
  const radius = 70;
  const circumference = 2 * Math.PI * radius; // ~439.82
  let currentOffset = 0;

  // Filter out categories with zero logged minutes
  const filteredData = data.filter(d => d.minutes > 0);

  filteredData.forEach((slice) => {
    const pct = slice.minutes / totalMins;
    const dashArray = `${pct * circumference} ${circumference}`;
    
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", 100);
    circle.setAttribute("cy", 100);
    circle.setAttribute("r", radius);
    circle.setAttribute("class", "donut-segment");
    circle.setAttribute("stroke", slice.color);
    circle.setAttribute("stroke-dasharray", dashArray);
    
    // Rotate to stack segments sequentially
    const angleRotation = (currentOffset / circumference) * 360 - 90;
    circle.setAttribute("transform", `rotate(${angleRotation} 100 100)`);
    
    // Mouse hover updates center text to detail this specific slice category
    circle.addEventListener('mouseenter', () => {
      textVal.textContent = `${slice.minutes}m`;
      textVal.style.fill = slice.color;
      textLbl.textContent = slice.name;
    });
    
    circle.addEventListener('mouseleave', () => {
      textVal.textContent = `${centerHrs}h ${centerMins}m`;
      textVal.style.fill = 'var(--text-primary)';
      textLbl.textContent = 'Total Logged';
    });

    svg.insertBefore(circle, textVal);
    
    currentOffset += pct * circumference;
  });

  // Populate dynamic dashboard legends cards
  filteredData.sort((a,b) => b.minutes - a.minutes).forEach(slice => {
    const pctVal = Math.round((slice.minutes / totalMins) * 100);
    
    const row = document.createElement('div');
    row.className = 'legend-row';
    row.innerHTML = `
      <div class="legend-info">
        <div class="legend-color" style="background: ${slice.color}"></div>
        <span class="legend-name">${slice.name}</span>
      </div>
      <span class="legend-value">${slice.minutes} mins (${pctVal}%)</span>
    `;
    legends.appendChild(row);
  });
}

// ==========================================
// 9. HISTORY LIST LOG TABLE
// ==========================================
let currentHistoryFilter = 'all';

function setupHistoryFilters() {
  const allBtn = document.getElementById('history-filter-all');
  const focusBtn = document.getElementById('history-filter-focus');
  const breaksBtn = document.getElementById('history-filter-breaks');
  const searchInput = document.getElementById('history-search-input');

  allBtn.addEventListener('click', () => toggleFilter('all', allBtn));
  focusBtn.addEventListener('click', () => toggleFilter('focus', focusBtn));
  breaksBtn.addEventListener('click', () => toggleFilter('breaks', breaksBtn));

  searchInput.addEventListener('input', renderHistoryTable);
}

function toggleFilter(filterVal, btn) {
  const filterButtons = document.querySelectorAll('.history-filters .timer-mode-selector button');
  filterButtons.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  currentHistoryFilter = filterVal;
  renderHistoryTable();
}

function renderHistoryTable() {
  const body = document.getElementById('history-table-body');
  const query = document.getElementById('history-search-input').value.trim().toLowerCase();
  
  if (!body) return;
  body.innerHTML = '';

  // Filter lists based on selected tabs and search strings
  let items = [...state.history].reverse(); // newest first
  
  if (currentHistoryFilter === 'focus') {
    items = items.filter(h => h.mode === 'pomodoro' || h.mode === 'stopwatch' || h.mode === 'working-time');
  } else if (currentHistoryFilter === 'breaks') {
    items = items.filter(h => h.mode === 'short-break');
  }

  if (query) {
    items = items.filter(h => 
      h.task.toLowerCase().includes(query) || 
      h.category.toLowerCase().includes(query)
    );
  }

  if (items.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="history-empty-state">
            <i class="fa-solid fa-folder-open"></i>
            <div>No matching focus sessions logged.</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  items.forEach(h => {
    const row = document.createElement('tr');
    
    // Parse times
    const d = new Date(h.timestamp);
    const dateFormatted = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const timeFormatted = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    
    // Duration minutes
    const durMins = Math.floor(h.durationSeconds / 60);
    const durSecs = h.durationSeconds % 60;
    const durStr = durMins > 0 ? `${durMins}m ${durSecs}s` : `${durSecs}s`;

    // Badges classes
    let badgeClass = 'history-badge-pomodoro';
    let label = 'Focus';
    if (h.mode === 'stopwatch') {
      badgeClass = 'history-badge-stopwatch';
      label = 'Stopwatch';
    } else if (h.mode === 'working-time') {
      badgeClass = 'history-badge-pomodoro';
      label = 'Work Block';
    } else if (h.mode.includes('break')) {
      badgeClass = 'history-badge-break';
      label = 'Break';
    }

    row.innerHTML = `
      <td class="history-task-cell">${escapeHTML(h.task)}</td>
      <td><span class="category-pill" style="padding: 3px 8px; font-size: 0.75rem; border-color: rgba(255,255,255,0.05); cursor: default;">${h.category}</span></td>
      <td><span class="history-badge ${badgeClass}">${label}</span></td>
      <td class="history-time-cell">${durStr}</td>
      <td>${dateFormatted} <span style="font-size: 0.8rem; color: var(--text-muted);">${timeFormatted}</span></td>
      <td class="history-xp-gain">${h.xpGained > 0 ? `+${h.xpGained} XP` : '—'}</td>
      <td style="text-align: center;">
        <button class="btn-delete-history" title="Delete session log" style="background: transparent; border: none; color: rgba(239, 68, 68, 0.6); cursor: pointer; padding: 6px 12px; font-size: 0.95rem; transition: var(--transition-smooth); display: inline-flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); outline: none;">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    `;
    
    // Bind click and hover interactions to the delete button
    const deleteBtn = row.querySelector('.btn-delete-history');
    if (deleteBtn) {
      deleteBtn.addEventListener('mouseenter', () => {
        deleteBtn.style.color = '#ef4444';
        deleteBtn.style.textShadow = '0 0 8px rgba(239, 68, 68, 0.7)';
        deleteBtn.style.transform = 'scale(1.15)';
      });
      deleteBtn.addEventListener('mouseleave', () => {
        deleteBtn.style.color = 'rgba(239, 68, 68, 0.6)';
        deleteBtn.style.textShadow = 'none';
        deleteBtn.style.transform = 'scale(1)';
      });
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Are you sure you want to delete this focus session: "${h.task || 'General Concentration'}"? This will deduct the completed time, XP, and task counts from your profile totals.`)) {
          deleteHistoryItem(h.id);
        }
      });
    }
    
    body.appendChild(row);
  });
}

function deleteHistoryItem(id) {
  const itemIndex = state.history.findIndex(h => h.id === id);
  if (itemIndex === -1) return;

  const item = state.history[itemIndex];
  const isFocus = (item.mode === 'pomodoro' || item.mode === 'stopwatch' || item.mode === 'working-time');
  
  if (isFocus) {
    // Subtract metrics from the user's running profiles state
    state.profile.totalFocusTime = Math.max(0, state.profile.totalFocusTime - (item.durationSeconds / 60));
    state.profile.totalTasksCompleted = Math.max(0, state.profile.totalTasksCompleted - 1);
    state.profile.xp = Math.max(0, state.profile.xp - item.xpGained);
    
    // Level down if XP drops below 0 and user is above Level 1
    while (state.profile.level > 1 && state.profile.xp < 0) {
      state.profile.level -= 1;
      const prevReq = getXPNeededForLevel(state.profile.level);
      state.profile.xp += prevReq;
    }
  }

  // Remove the history entry
  state.history.splice(itemIndex, 1);

  // Save changes to localStorage
  saveData();

  // Reset and force recheck of badges/accomplishments milestones progress
  state.achievements.forEach(ach => {
    ach.unlocked = false;
    ach.progress = 0;
  });
  updateAchievementsProgress(null);

  // Refresh all system screens dynamically
  renderApp(); // Sidebar profile rank updates
  renderHistoryTable(); // Dynamic logs grid updates
  renderDashboardAnalytics(); // Dynamic SVG charts updates
  renderAchievements(); // Unlocked badges updates
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// ==========================================
// 10. ACHIEVEMENTS SYSTEM SCREEN
// ==========================================
function renderAchievements() {
  const container = document.getElementById('achievements-cards-container');
  if (!container) return;

  container.innerHTML = '';

  state.achievements.forEach(ach => {
    const card = document.createElement('div');
    card.className = `achievement-card ${ach.unlocked ? '' : 'locked'}`;
    
    const pct = Math.min(100, Math.round((ach.progress / ach.target) * 100));

    card.innerHTML = `
      <div class="achievement-badge-icon">
        <i class="fa-solid ${ach.icon}"></i>
      </div>
      <h3 class="achievement-title">${ach.name}</h3>
      <p class="achievement-desc">${ach.desc}</p>
      
      <div class="achievement-progress-wrapper">
        <div class="achievement-progress-text">
          <span>${ach.unlocked ? 'Unlocked' : 'Progress'}</span>
          <span>${ach.progress} / ${ach.target}</span>
        </div>
        <div class="achievement-progress-bar-container">
          <div class="achievement-progress-bar" style="width: ${pct}%;"></div>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

// ==========================================
// 11. PROFILE RENDERING UTILITIES
// ==========================================
function renderApp() {
  // Update XP profile widget fields in sidebar
  const levelBadge = document.getElementById('sidebar-level-badge');
  const xpBar = document.getElementById('sidebar-xp-bar');
  const xpText = document.getElementById('sidebar-xp-text');
  const usernameText = document.getElementById('sidebar-username');
  
  if (usernameText) {
    usernameText.textContent = activeUser;
  }
  
  if (levelBadge && xpBar && xpText) {
    const reqXP = getXPNeededForLevel(state.profile.level);
    const xpPct = (state.profile.xp / reqXP) * 100;
    
    levelBadge.textContent = `Lvl ${state.profile.level}`;
    xpBar.style.width = `${xpPct}%`;
    xpText.textContent = `${state.profile.xp} / ${reqXP} XP`;
  }
}

// ==========================================
// 12. CONFIGURATION SETTINGS SCREEN
// ==========================================
function setupSettingsScreen() {
  const setAutoBreak = document.getElementById('set-auto-break');
  const setAutoFocus = document.getElementById('set-auto-focus');
  const setAudioAlerts = document.getElementById('set-audio-alerts');
  
  const btnSave = document.getElementById('btn-save-settings');
  const btnReset = document.getElementById('btn-factory-reset');

  if (!setAutoBreak || !setAutoFocus || !setAudioAlerts || !btnSave || !btnReset) return;

  // Populate loaded settings fields
  setAutoBreak.checked = state.settings.preferences.autoStartBreak;
  setAutoFocus.checked = state.settings.preferences.autoStartFocus;
  setAudioAlerts.checked = state.settings.preferences.audioAlerts;

  // Save Settings Click Handler
  btnSave.addEventListener('click', () => {
    state.settings.preferences.autoStartBreak = setAutoBreak.checked;
    state.settings.preferences.autoStartFocus = setAutoFocus.checked;
    state.settings.preferences.audioAlerts = setAudioAlerts.checked;

    saveData();
    alert("Focus preferences saved successfully!");
    
    // Apply changes instantly if timer is not currently running
    if (timer.status === 'idle') {
      changeTimerMode(timer.mode);
    }
  });

  // Danger wipe handler
  btnReset.addEventListener('click', () => {
    if (confirm("WARNING: You are about to clear all profiles, unlocked badges, streaks, and focus history datasets. This cannot be undone. Do you wish to continue?")) {
      localStorage.removeItem('focusflow_users_db');
      localStorage.removeItem('focusflow_active_user');
      location.reload();
    }
  });
}

// ==========================================
// 13. SLIDERS & LIVE DESCRIPTOR HANDLERS
// ==========================================
function setupSliders() {
  const workSlider = document.getElementById('work-time-slider');
  const breakSlider = document.getElementById('break-time-slider');
  
  const workInput = document.getElementById('work-time-input');
  const breakInput = document.getElementById('break-time-input');
  
  if (!workSlider || !breakSlider || !workInput || !breakInput) return;

  // Set initial input & slider values from state
  workSlider.value = state.settings.durations.pomodoro;
  breakSlider.value = state.settings.durations['short-break'];
  
  workInput.value = workSlider.value;
  breakInput.value = breakSlider.value;
  
  // Helper to handle work time changes
  function handleWorkTimeChange(val) {
    state.settings.durations.pomodoro = val;
    state.settings.durations['working-time'] = val;
    
    // Update live timer if idle and in appropriate mode
    if (timer.status === 'idle' && (timer.mode === 'pomodoro' || timer.mode === 'working-time')) {
      timer.timeLeft = state.settings.durations.pomodoro * 60;
      timer.totalSeconds = state.settings.durations.pomodoro * 60;
      syncTimerDisplay();
    }
    updateThemeAndDescription();
    saveData();
  }

  // Helper to handle break time changes
  function handleBreakTimeChange(val) {
    state.settings.durations['short-break'] = val;
    
    // Update live timer if idle and in appropriate mode
    if (timer.status === 'idle' && timer.mode === 'short-break') {
      timer.timeLeft = state.settings.durations['short-break'] * 60;
      timer.totalSeconds = state.settings.durations['short-break'] * 60;
      syncTimerDisplay();
    }
    updateThemeAndDescription();
    saveData();
  }

  // Sliders Input Listeners
  workSlider.addEventListener('input', () => {
    workInput.value = workSlider.value;
    handleWorkTimeChange(parseInt(workSlider.value));
  });
  
  breakSlider.addEventListener('input', () => {
    breakInput.value = breakSlider.value;
    handleBreakTimeChange(parseInt(breakSlider.value));
  });

  // Numeric Inputs Listeners
  workInput.addEventListener('input', () => {
    let val = parseInt(workInput.value);
    if (isNaN(val)) return;
    
    // Constrain input range while typing
    if (val < 1) val = 1;
    if (val > 120) val = 120;
    
    workSlider.value = val;
    handleWorkTimeChange(val);
  });
  
  workInput.addEventListener('blur', () => {
    let val = parseInt(workInput.value);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 120) val = 120;
    workInput.value = val;
    workSlider.value = val;
    handleWorkTimeChange(val);
  });

  breakInput.addEventListener('input', () => {
    let val = parseInt(breakInput.value);
    if (isNaN(val)) return;
    
    // Constrain input range while typing
    if (val < 1) val = 1;
    if (val > 120) val = 120;
    
    breakSlider.value = val;
    handleBreakTimeChange(val);
  });

  breakInput.addEventListener('blur', () => {
    let val = parseInt(breakInput.value);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 120) val = 120;
    breakInput.value = val;
    breakSlider.value = val;
    handleBreakTimeChange(val);
  });
}

function updateThemeAndDescription() {
  const vibeBox = document.getElementById('focus-vibe-box');
  const vibeTitle = document.getElementById('vibe-title');
  const vibeDesc = document.getElementById('vibe-desc');
  const workSlider = document.getElementById('work-time-slider');
  const breakSlider = document.getElementById('break-time-slider');
  
  if (!vibeBox || !vibeTitle || !vibeDesc || !workSlider || !breakSlider) return;
  
  const workVal = parseInt(workSlider.value);
  const breakVal = parseInt(breakSlider.value);
  
  vibeBox.classList.add('active-vibe');
  
  let primaryColor, secondaryColor, glowColor, gradientVal;
  let titleText = "";
  let descText = "";
  
  if (timer.mode === 'pomodoro') {
    // 1. Ratio-based thresholds for Pomodoro mode (breakVal / workVal)
    const ratio = breakVal / workVal;
    
    if (ratio <= 0.10) {
      titleText = "Hyper-Efficient Sprint";
      descText = "Hyper-Efficient Sprint — Extreme work ratio (90%+ focus dominance). High-density concentration bursts with quick rests. Guard against early fatigue!";
      primaryColor = "#06b6d4";
      secondaryColor = "#10b981";
      glowColor = "rgba(6, 182, 212, 0.35)";
      gradientVal = "linear-gradient(135deg, #06b6d4 0%, #10b981 100%)";
    } else if (ratio > 0.10 && ratio <= 0.20) {
      titleText = "Sustainable Flow";
      descText = "Sustainable Flow — The elite productivity ratio. Sustains high focus velocity across multiple cycles without cognitive drain.";
      primaryColor = "#10b981";
      secondaryColor = "#14b8a6";
      glowColor = "rgba(16, 185, 129, 0.35)";
      gradientVal = "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)";
    } else if (ratio > 0.20 && ratio <= 0.35) {
      titleText = "Classic Balanced";
      descText = "Classic Balanced — The classic Pomodoro balance. An excellent rhythm for general coding, writing, or structured research sessions.";
      primaryColor = "#8b5cf6";
      secondaryColor = "#3b82f6";
      glowColor = "rgba(139, 92, 246, 0.35)";
      gradientVal = "linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)";
    } else if (ratio > 0.35 && ratio <= 0.50) {
      titleText = "Comfortable Rhythm";
      descText = "Comfortable Rhythm — Relaxed pacing. Ideal for steady long-term learning, light administrative revisions, or low-energy days.";
      primaryColor = "#f43f5e";
      secondaryColor = "#f97316";
      glowColor = "rgba(244, 63, 94, 0.35)";
      gradientVal = "linear-gradient(135deg, #f43f5e 0%, #f97316 100%)";
    } else {
      titleText = "Recovery & Ideation";
      descText = "Recovery & Ideation — Restorative-heavy ratio. Exceptional for brainstorming creative briefs, sketching new projects, or recovering from marathon blocks.";
      primaryColor = "#eab308";
      secondaryColor = "#ec4899";
      glowColor = "rgba(234, 179, 8, 0.35)";
      gradientVal = "linear-gradient(135deg, #eab308 0%, #ec4899 100%)";
    }
  } else if (timer.mode === 'working-time') {
    // 2. Working Time thresholds
    if (workVal >= 5 && workVal <= 15) {
      titleText = "Micro-Sprint";
      descText = "Micro-Sprint — Perfect for clearing quick administrative tasks, sorting emails, or a high-velocity burst of minor chores.";
      primaryColor = "#06b6d4";
      secondaryColor = "#10b981";
    } else if (workVal >= 16 && workVal <= 30) {
      titleText = "Focused Blast";
      descText = "Focused Blast — Sustained high-energy chunk. Ideal for single-topic drafting, minor bug fixing, or brief reading sprints.";
      primaryColor = "#10b981";
      secondaryColor = "#14b8a6";
    } else if (workVal >= 31 && workVal <= 45) {
      titleText = "Balanced Flow";
      descText = "Balanced Flow — The classic cognitive focus sweet spot. Great for code construction, copywriting, or rigorous study sessions.";
      primaryColor = "#8b5cf6";
      secondaryColor = "#3b82f6";
    } else if (workVal >= 46 && workVal <= 60) {
      titleText = "Heavy Concentration";
      descText = "Heavy Concentration — High-concentration window. Suitable for complex technical tasks, structural planning, or deep creative writing.";
      primaryColor = "#6366f1";
      secondaryColor = "#3b82f6";
    } else if (workVal >= 61 && workVal <= 90) {
      titleText = "Deep Work Block";
      descText = "Deep Work Block — Advanced cognitive dive. Perfect for architectural designs, refactoring core engines, or intensive research projects.";
      primaryColor = "#f43f5e";
      secondaryColor = "#f97316";
    } else {
      titleText = "Extreme Marathon";
      descText = "Extreme Marathon — Legendary focus sector. Unlocked for extreme deep-dive missions. Stand up, stretch, and hydrate immediately afterwards!";
      primaryColor = "#eab308";
      secondaryColor = "#ec4899";
    }
    glowColor = `rgba(${hexToRgb(primaryColor)}, 0.35)`;
    gradientVal = `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`;
  } else if (timer.mode === 'short-break') {
    // 3. Custom Rest thresholds
    if (breakVal >= 1 && breakVal <= 5) {
      titleText = "Quick Breather";
      descText = "Quick Breather — Rest your eyes, take a deep breath, and grab a quick glass of water before jumping back in.";
      primaryColor = "#10b981";
      secondaryColor = "#14b8a6";
    } else if (breakVal >= 6 && breakVal <= 15) {
      titleText = "Mental Recharge";
      descText = "Mental Recharge — Step away from your keyboard! Walk around, stretch, or grab a light snack to reset your cognitive load.";
      primaryColor = "#06b6d4";
      secondaryColor = "#0f766e";
    } else if (breakVal >= 16 && breakVal <= 30) {
      titleText = "Restorative Downtime";
      descText = "Restorative Downtime — Extended break block. Perfect for a coffee chat, light tidy-up, or full screen-free breathing exercises.";
      primaryColor = "#059669";
      secondaryColor = "#064e3b";
    } else if (breakVal >= 31 && breakVal <= 45) {
      titleText = "Extended Interlude";
      descText = "Extended Interlude — Significant recovery time. Great for clearing your head, taking a short outdoor walk, or a healthy power nap.";
      primaryColor = "#eab308";
      secondaryColor = "#ec4899";
    } else {
      titleText = "Deep Restoration";
      descText = "Deep Restoration — Full active rest period. Excellent for a nourishing meal, long fresh-air walks, or physical exercises to rebuild focus.";
      primaryColor = "#f43f5e";
      secondaryColor = "#be123c";
    }
    glowColor = `rgba(${hexToRgb(primaryColor)}, 0.35)`;
    gradientVal = `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`;
  } else {
    // Stopwatch / default
    titleText = "Stopwatch Track";
    descText = "Uncapped concentration tracking. Work as long as your concentration allows.";
    primaryColor = "#8b5cf6";
    secondaryColor = "#3b82f6";
    glowColor = "rgba(139, 92, 246, 0.35)";
    gradientVal = "linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)";
  }
  
  // Set UI elements contents
  vibeTitle.textContent = titleText;
  vibeDesc.textContent = descText;
  
  // Apply visual theme properties to CSS variables on body in real-time
  document.body.style.setProperty('--accent-primary', primaryColor);
  document.body.style.setProperty('--accent-secondary', secondaryColor);
  document.body.style.setProperty('--accent-glow', glowColor);
  document.body.style.setProperty('--accent-gradient', gradientVal);
  
  // Highlight sliders matching color
  workSlider.style.setProperty('--accent-primary', primaryColor);
  breakSlider.style.setProperty('--accent-primary', primaryColor);
}

// Utility helper to convert HEX to RGB array
function hexToRgb(hex) {
  const bigint = parseInt(hex.slice(1), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r}, ${g}, ${b}`;
}

// Profile management helpers
function setupProfileActions() {
  const btnChange = document.getElementById('btn-change-user');
  const btnSave = document.getElementById('btn-save-username');
  const inputField = document.getElementById('username-input-field');
  const displayView = document.getElementById('user-profile-display-view');
  const editView = document.getElementById('user-profile-edit-view');
  
  if (!btnChange || !btnSave || !inputField || !displayView || !editView) return;
  
  btnChange.addEventListener('click', () => {
    inputField.value = activeUser === "Guest" ? "" : activeUser;
    displayView.style.display = 'none';
    editView.style.display = 'flex';
    inputField.focus();
  });
  
  const handleSave = () => {
    const name = inputField.value.trim();
    if (!name) {
      // Revert view if empty
      displayView.style.display = 'block';
      editView.style.display = 'none';
      return;
    }
    
    switchActiveProfile(name);
  };
  
  btnSave.addEventListener('click', handleSave);
  
  inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      displayView.style.display = 'block';
      editView.style.display = 'none';
    }
  });
}

function switchActiveProfile(newUsername) {
  // 1. Save current state to database
  saveData();
  
  // 2. Set new active user
  activeUser = newUsername.trim();
  const newKey = activeUser.toLowerCase();
  
  // 3. Load / Initialize data for new user
  loadData(activeUser);
  
  // 4. Update display UI views
  const usernameText = document.getElementById('sidebar-username');
  const levelBadge = document.getElementById('sidebar-level-badge');
  if (usernameText) usernameText.textContent = activeUser;
  if (levelBadge) levelBadge.textContent = `Lvl ${state.profile.level}`;
  
  // Restore view displays
  document.getElementById('user-profile-edit-view').style.display = 'none';
  document.getElementById('user-profile-display-view').style.display = 'block';
  
  // Reset slider values matching loaded user's state
  const workSlider = document.getElementById('work-time-slider');
  const breakSlider = document.getElementById('break-time-slider');
  if (workSlider && breakSlider) {
    workSlider.value = state.settings.durations.pomodoro;
    breakSlider.value = state.settings.durations['short-break'];
    
    const workInput = document.getElementById('work-time-input');
    const breakInput = document.getElementById('break-time-input');
    if (workInput) workInput.value = workSlider.value;
    if (breakInput) breakInput.value = breakSlider.value;
  }
  
  // Render agenda todos
  renderTodoList();
  
  // 5. Hard refresh views & redrawing stats
  renderApp();
  changeTimerMode(timer.mode);
  
  // Refresh active screen datasets
  const activeScreen = document.querySelector('.screen.active');
  if (activeScreen) {
    if (activeScreen.id === 'dashboard-screen') {
      renderDashboardAnalytics();
    } else if (activeScreen.id === 'history-screen') {
      renderHistoryTable();
    } else if (activeScreen.id === 'achievements-screen') {
      renderAchievements();
    }
  }
}

// ==========================================
// 14. DAILY AGENDA TODO LIST HANDLERS
// ==========================================
function setupTodoActions() {
  const input = document.getElementById('new-todo-input');
  const btnAdd = document.getElementById('btn-add-todo');
  
  if (!input || !btnAdd) return;
  
  const handleAdd = () => {
    const text = input.value.trim();
    if (!text) return;
    
    const newTodo = {
      id: 'todo_' + Date.now(),
      text: text,
      completed: false
    };
    
    state.todos.push(newTodo);
    input.value = '';
    
    saveData();
    renderTodoList();
  };
  
  btnAdd.addEventListener('click', handleAdd);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleAdd();
    }
  });
}

function renderTodoList() {
  const container = document.getElementById('todo-list-container');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (state.todos.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 1.5rem 0;">
        <i class="fa-solid fa-clipboard-list" style="font-size: 1.5rem; opacity: 0.3; margin-bottom: 6px; display: block; margin-left: auto; margin-right: auto;"></i>
        Your agenda is clear for today!
      </div>
    `;
    return;
  }
  
  state.todos.forEach(todo => {
    const item = document.createElement('div');
    item.className = 'todo-item';
    item.setAttribute('data-id', todo.id);
    
    const isTracking = (timer.isTaskLocked && timer.activeTask === todo.text);
    if (isTracking) {
      item.classList.add('active-tracking');
    }
    if (todo.completed) {
      item.classList.add('completed');
    }
    
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; flex-grow: 1; overflow: hidden;">
        <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''} style="cursor: pointer; width: 15px; height: 15px; min-width: 15px; accent-color: var(--accent-primary);">
        <span class="todo-text" style="font-size: 0.85rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(todo.text)}">${escapeHTML(todo.text)}</span>
      </div>
      <div style="display: flex; gap: 6px; align-items: center; min-width: max-content; margin-left: 8px;">
        <button class="btn-focus-todo" title="${isTracking ? 'Currently tracking' : 'Focus on this task'}" style="background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.2); color: var(--accent-primary); border-radius: 6px; padding: 4px 8px; font-size: 0.7rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;">
          <i class="fa-solid ${isTracking ? 'fa-spinner fa-spin' : 'fa-play'}"></i> ${isTracking ? 'Focusing' : 'Focus'}
        </button>
        <button class="btn-delete-todo" title="Delete agenda item" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; font-size: 0.85rem; transition: var(--transition-fast);"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    `;
    
    // Checkbox listener
    const checkbox = item.querySelector('.todo-checkbox');
    checkbox.addEventListener('change', () => {
      const wasCompleted = todo.completed;
      todo.completed = checkbox.checked;
      
      if (todo.completed && !wasCompleted) {
        // +5 XP rewards!
        awardXPAndCheckLevels(5);
        state.profile.totalTasksCompleted += 1;
        
        // Update sidebar widgets instantly
        const reqXP = getXPNeededForLevel(state.profile.level);
        const xpBar = document.getElementById('sidebar-xp-bar');
        const xpText = document.getElementById('sidebar-xp-text');
        if (xpBar) xpBar.style.width = `${(state.profile.xp / reqXP) * 100}%`;
        if (xpText) xpText.textContent = `${state.profile.xp} / ${reqXP} XP`;
        
        // Play acoustic check chime
        if (state.settings.preferences.audioAlerts) {
          playTriadTickXPChime();
        }
      } else if (!todo.completed && wasCompleted) {
        // Deduct 5 XP and decrement tasks completed
        awardXPAndCheckLevels(-5);
        state.profile.totalTasksCompleted = Math.max(0, state.profile.totalTasksCompleted - 1);
      }
      
      saveData();
      renderTodoList();
      renderApp();
    });
    
    // Focus click listener
    const btnFocus = item.querySelector('.btn-focus-todo');
    btnFocus.addEventListener('click', () => {
      if (todo.completed) return;
      
      const taskInput = document.getElementById('task-input-field');
      const activePillText = document.getElementById('timer-active-task-text');
      const activePill = document.getElementById('timer-active-task-pill');
      const btnLock = document.getElementById('btn-lock-task');
      
      timer.activeTask = todo.text;
      timer.isTaskLocked = true;
      
      if (taskInput) {
        taskInput.value = todo.text;
        taskInput.disabled = true;
      }
      if (btnLock) {
        btnLock.innerHTML = '<i class="fa-solid fa-lock-open"></i> Modify Objectives';
        btnLock.classList.add('btn-secondary');
      }
      
      if (activePillText) activePillText.textContent = `${timer.activeTask} [${timer.activeCategory}]`;
      if (activePill) activePill.classList.add('active');
      
      renderTodoList();
    });
    
    // Delete click listener
    const btnDelete = item.querySelector('.btn-delete-todo');
    btnDelete.addEventListener('click', () => {
      if (todo.completed) {
        awardXPAndCheckLevels(-5);
        state.profile.totalTasksCompleted = Math.max(0, state.profile.totalTasksCompleted - 1);
      }
      state.todos = state.todos.filter(t => t.id !== todo.id);
      saveData();
      renderTodoList();
      renderApp();
    });
    
    container.appendChild(item);
  });
}

function playTriadTickXPChime() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const notes = [523.25, 659.25]; // C5 and E5 pleasant quick ding
  notes.forEach((freq, idx) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + idx * 0.05);
    
    gain.gain.setValueAtTime(0, now + idx * 0.05);
    gain.gain.linearRampToValueAtTime(0.15, now + idx * 0.05 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.25);
    
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + idx * 0.05);
    osc.stop(now + idx * 0.05 + 0.26);
  });
}

