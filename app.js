// ==========================================================================
// State Management
// ==========================================================================
let state = {
  currentView: 'dashboard', // 'dashboard', 'exam', 'results'
  activeExam: null,         // Active exam object
  examQuestions: [],        // Questions for the active exam (can be subset/shuffled)
  currentQuestionIndex: 0,  // Index of the active question
  userAnswers: {},          // Map of { questionIndex: [selectedOptions] }
  flaggedQuestions: new Set(), // Set of flagged question indices
  checkedAnswers: new Set(), // Set of checked indices (Study Mode only)
  mode: 'study',            // 'study' or 'exam'
  
  // Timer variables
  timerInterval: null,
  examStartTime: null,
  timeRemaining: 0,         // seconds remaining (Exam Mode)
  elapsedSeconds: 0,        // seconds elapsed (Study/Exam Mode)
  timeLimit: 0,             // total seconds allowed

  // User Stats (saved in localStorage)
  stats: {
    examProgress: {},       // { examId: { completed: bool, accuracy: number, maxScore: number, answers: {} } }
    globalAnswered: 0,
    globalCorrect: 0
  },

  // Search/Filters
  searchQuery: '',
  activeFilter: 'all',      // 'all', 'completed', 'in-progress', 'unattempted'
  
  // Theme settings
  theme: 'dark'
};

// ==========================================================================
// Initialization & LocalStorage
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  loadUserData();
  initTheme();
  setupEventListeners();
  renderDashboard();
});

function loadUserData() {
  const savedStats = localStorage.getItem('aws_exam_stats');
  if (savedStats) {
    try {
      state.stats = JSON.parse(savedStats);
      // Backwards compatibility / integrity check
      if (!state.stats.examProgress) state.stats.examProgress = {};
      if (typeof state.stats.globalAnswered !== 'number') state.stats.globalAnswered = 0;
      if (typeof state.stats.globalCorrect !== 'number') state.stats.globalCorrect = 0;
    } catch (e) {
      console.error("Error parsing user stats, resetting data", e);
    }
  }
  updateGlobalStats();
}

function saveUserData() {
  localStorage.setItem('aws_exam_stats', JSON.stringify(state.stats));
  updateGlobalStats();
}

function initTheme() {
  const savedTheme = localStorage.getItem('aws_exam_theme') || 'dark';
  state.theme = savedTheme;
  document.body.className = savedTheme === 'dark' ? 'dark-theme' : 'light-theme';
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.body.className = state.theme === 'dark' ? 'dark-theme' : 'light-theme';
  localStorage.setItem('aws_exam_theme', state.theme);
}

// ==========================================================================
// Dashboard rendering & Controls
// ==========================================================================
function renderDashboard() {
  const grid = document.getElementById('exams-grid-container');
  grid.innerHTML = '';

  const filteredExams = EXAMS_DATA.filter(exam => {
    // Search filter
    const matchesSearch = exam.title.toLowerCase().includes(state.searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    // Category filter
    const progress = state.stats.examProgress[exam.id];
    const isCompleted = progress && progress.completed;
    const isStarted = progress && !progress.completed && Object.keys(progress.answers || {}).length > 0;

    if (state.activeFilter === 'completed') return isCompleted;
    if (state.activeFilter === 'in-progress') return isStarted;
    if (state.activeFilter === 'unattempted') return !progress || (!progress.completed && Object.keys(progress.answers || {}).length === 0);

    return true;
  });

  if (filteredExams.length === 0) {
    grid.innerHTML = `
      <div class="glass-panel" style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-secondary);">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.5; color: var(--text-muted);">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <h3>No Exams Found</h3>
        <p style="margin-top: 8px;">Try adjusting your search query or filter tags.</p>
      </div>
    `;
    return;
  }

  filteredExams.forEach(exam => {
    const card = document.createElement('article');
    card.className = 'exam-card glass-panel';

    const examProgress = state.stats.examProgress[exam.id] || { completed: false, maxScore: 0, answers: {} };
    const answeredCount = Object.keys(examProgress.answers || {}).length;
    const totalQ = exam.questions.length;
    const progressPercent = Math.round((answeredCount / totalQ) * 100) || 0;
    const maxScoreText = examProgress.completed ? `${examProgress.maxScore}%` : '--';

    card.innerHTML = `
      <div class="exam-card-header">
        <span class="exam-number">Exam ${exam.id}</span>
        ${examProgress.completed ? '<span class="badge badge-success">Completed</span>' : answeredCount > 0 ? '<span class="badge badge-accent">In Progress</span>' : '<span class="badge">Unattempted</span>'}
      </div>
      <h3>${exam.title}</h3>
      <div class="exam-card-stats">
        <span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          ${totalQ} Qs
        </span>
        <span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          Best: ${maxScoreText}
        </span>
      </div>
      <div class="exam-card-progress">
        <div class="exam-progress-text">
          <span>Progress</span>
          <span>${progressPercent}%</span>
        </div>
        <div class="progress-track" style="height: 6px;">
          <div class="progress-fill" style="width: ${progressPercent}%;"></div>
        </div>
      </div>
      <div class="exam-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="startExam(${exam.id}, 'study')">Study</button>
        <button class="btn btn-primary btn-sm" onclick="startExam(${exam.id}, 'exam')">Exam</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

function updateGlobalStats() {
  let totalQsInDB = EXAMS_DATA.reduce((acc, curr) => acc + curr.questions.length, 0);
  document.getElementById('global-total-questions').textContent = totalQsInDB.toLocaleString();

  // Calculate unique answered questions across all exams
  let answeredCount = 0;
  let correctCount = 0;
  let completedCount = 0;

  EXAMS_DATA.forEach(exam => {
    const progress = state.stats.examProgress[exam.id];
    if (progress) {
      if (progress.completed) completedCount++;
      
      const answers = progress.answers || {};
      answeredCount += Object.keys(answers).length;
      
      // Calculate how many were correct in the saved state
      exam.questions.forEach((q, idx) => {
        const userAns = answers[idx];
        if (userAns && isAnswerCorrect(userAns, q.correctAnswer)) {
          correctCount++;
        }
      });
    }
  });

  const accuracyPercent = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
  const progressPercent = totalQsInDB > 0 ? Math.round((answeredCount / totalQsInDB) * 100) : 0;

  document.getElementById('global-answered-questions').textContent = answeredCount.toLocaleString();
  document.getElementById('global-accuracy').textContent = `${accuracyPercent}%`;
  document.getElementById('global-completed-exams').textContent = `${completedCount}/23`;
  document.getElementById('global-progress-percent').textContent = `${progressPercent}%`;
  document.getElementById('global-progress-fill').style.width = `${progressPercent}%`;
}

// Helper to check if user selections match correct answers
function isAnswerCorrect(userAnswersArr, correctAnswersArr) {
  if (!userAnswersArr || !correctAnswersArr) return false;
  if (userAnswersArr.length !== correctAnswersArr.length) return false;
  const userSorted = [...userAnswersArr].sort();
  const correctSorted = [...correctAnswersArr].sort();
  return userSorted.every((val, index) => val === correctSorted[index]);
}

// ==========================================================================
// Event Listeners setup
// ==========================================================================
function setupEventListeners() {
  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Logo button returns to dashboard
  document.getElementById('header-logo-btn').addEventListener('click', () => {
    if (state.currentView === 'exam') {
      showExitModal();
    } else {
      switchView('dashboard');
    }
  });

  // Search input
  document.getElementById('exam-search').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderDashboard();
  });

  // Filters buttons
  document.querySelectorAll('.filter-actions .btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-actions .btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.activeFilter = e.target.dataset.filter;
      renderDashboard();
    });
  });

  // Mock Exam button
  document.getElementById('start-mock-btn').addEventListener('click', () => {
    startExam('mock', 'exam');
  });

  // Workspace controls
  document.getElementById('exit-exam-btn').addEventListener('click', showExitModal);
  document.getElementById('prev-btn').addEventListener('click', navigatePrevious);
  document.getElementById('next-btn').addEventListener('click', navigateNext);
  document.getElementById('flag-btn').addEventListener('click', toggleFlag);
  document.getElementById('study-check-btn').addEventListener('click', checkStudyAnswer);
  document.getElementById('submit-exam-btn').addEventListener('click', confirmSubmitExam);

  // Exit Modal actions
  document.getElementById('exit-cancel-btn').addEventListener('click', hideExitModal);
  document.getElementById('exit-confirm-btn').addEventListener('click', () => {
    hideExitModal();
    stopTimer();
    
    // In Study mode, save partial progress when exiting!
    if (state.mode === 'study' && state.activeExam.id !== 'mock') {
      savePartialProgress();
    }
    
    switchView('dashboard');
  });

  // Results screen actions
  document.getElementById('retry-exam-btn').addEventListener('click', () => {
    startExam(state.activeExam.id, state.mode);
  });
  document.getElementById('results-dashboard-btn').addEventListener('click', () => {
    switchView('dashboard');
  });

  // Review Filters
  document.querySelectorAll('.review-filters .btn-sm').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.review-filters .btn-sm').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      renderDetailedReview(e.target.dataset.reviewFilter);
    });
  });
}

function switchView(viewName) {
  state.currentView = viewName;
  document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));
  
  const targetPanel = document.getElementById(`${viewName}-view`);
  targetPanel.classList.add('active');

  // Trigger browser view alignment
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (viewName === 'dashboard') {
    renderDashboard();
  }
}

// ==========================================================================
// Exam Orchestration
// ==========================================================================
window.startExam = function(examId, mode) {
  // Clear any existing active timer
  stopTimer();

  state.mode = mode;
  state.userAnswers = {};
  state.flaggedQuestions.clear();
  state.checkedAnswers.clear();
  state.currentQuestionIndex = 0;
  state.elapsedSeconds = 0;

  // Set active mode badge
  const modeBadge = document.getElementById('active-mode-badge');
  modeBadge.textContent = mode === 'study' ? 'Study Mode' : 'Exam Mode';
  modeBadge.className = mode === 'study' ? 'badge badge-accent' : 'badge';

  if (examId === 'mock') {
    // Generate Full Mock Exam
    // Pick 65 random questions from all exams
    const allQuestions = [];
    EXAMS_DATA.forEach(exam => {
      exam.questions.forEach(q => {
        allQuestions.push({
          ...q,
          examTitle: exam.title,
          originalExamId: exam.id
        });
      });
    });

    // Shuffle questions
    const shuffled = allQuestions.sort(() => 0.5 - Math.random());
    state.examQuestions = shuffled.slice(0, 65);
    state.activeExam = {
      id: 'mock',
      title: 'Full Mock Exam',
      questions: state.examQuestions
    };
    state.timeLimit = 90 * 60; // 90 mins
  } else {
    // Standard Exam
    const exam = EXAMS_DATA.find(e => e.id === examId);
    if (!exam) return;
    
    // Create copy of questions
    state.examQuestions = [...exam.questions];
    state.activeExam = exam;
    state.timeLimit = 60 * 60; // 60 mins

    // Load partial answers if in study mode and they exist
    if (mode === 'study') {
      const progress = state.stats.examProgress[examId];
      if (progress && progress.answers && !progress.completed) {
        state.userAnswers = { ...progress.answers };
        // Pre-mark all answered questions as checked in Study Mode
        Object.keys(state.userAnswers).forEach(idx => {
          state.checkedAnswers.add(parseInt(idx, 10));
        });
      }
    }
  }

  // Update Workspace elements
  document.getElementById('active-exam-title').textContent = state.activeExam.title;
  
  // Timer setup
  const timerBox = document.getElementById('exam-timer-box');
  const timerDisplay = document.getElementById('exam-timer');
  const submitBtn = document.getElementById('submit-exam-btn');

  if (mode === 'exam') {
    // Countdown timer
    state.timeRemaining = state.timeLimit;
    timerDisplay.textContent = formatTime(state.timeRemaining);
    timerBox.style.display = 'flex';
    submitBtn.style.display = 'inline-flex';
    startCountdownTimer();
  } else {
    // Study mode: Elapsed timer (count up)
    timerDisplay.textContent = '00:00';
    timerBox.style.display = 'flex';
    submitBtn.style.display = 'none'; // Replaced by immediate question checks, but can submit to finish study
    startCountUpTimer();
  }

  // Render question layout
  renderWorkspace();
  switchView('exam');
};

function renderWorkspace() {
  renderQuestionNavBubbles();
  renderQuestionCard();
  updateWorkspaceControls();
}

// Navigation Bubbles Sidebar
function renderQuestionNavBubbles() {
  const container = document.getElementById('nav-bubbles-grid');
  container.innerHTML = '';

  state.examQuestions.forEach((_, index) => {
    const bubble = document.createElement('button');
    bubble.className = 'q-bubble';
    bubble.textContent = index + 1;

    // Apply states
    if (index === state.currentQuestionIndex) {
      bubble.classList.add('current');
    }
    
    const isAnswered = state.userAnswers[index] && state.userAnswers[index].length > 0;
    if (isAnswered) {
      bubble.classList.add('answered');
    }

    if (state.flaggedQuestions.has(index)) {
      bubble.classList.add('flagged');
    }

    bubble.addEventListener('click', () => {
      // In study mode, let user navigate freely
      goToQuestion(index);
    });

    container.appendChild(bubble);
  });

  // Update progress fraction
  document.getElementById('nav-progress-fraction').textContent = `${state.currentQuestionIndex + 1} / ${state.examQuestions.length}`;
}

// Question Details Card
function renderQuestionCard() {
  const container = document.getElementById('question-card');
  container.innerHTML = '';

  const question = state.examQuestions[state.currentQuestionIndex];
  if (!question) return;

  const isMultiSelect = question.correctAnswer.length > 1;

  // Heading / Info
  const headerDiv = document.createElement('div');
  headerDiv.className = 'q-header';
  
  const questionNum = document.createElement('span');
  questionNum.className = 'exam-number';
  questionNum.textContent = `Question ${state.currentQuestionIndex + 1} of ${state.examQuestions.length}`;
  headerDiv.appendChild(questionNum);

  if (question.examTitle) {
    const originBadge = document.createElement('span');
    originBadge.className = 'badge badge-accent';
    originBadge.style.marginLeft = '8px';
    originBadge.textContent = question.examTitle;
    headerDiv.appendChild(originBadge);
  }

  if (isMultiSelect) {
    const multiBadge = document.createElement('span');
    multiBadge.className = 'badge';
    multiBadge.style.marginLeft = '8px';
    multiBadge.textContent = `Select ${question.correctAnswer.length}`;
    headerDiv.appendChild(multiBadge);
  }

  container.appendChild(headerDiv);

  // Question Text
  const qTextP = document.createElement('p');
  qTextP.className = 'q-text';
  qTextP.textContent = question.question;
  container.appendChild(qTextP);

  // Choices List
  const choicesList = document.createElement('div');
  choicesList.className = 'choices-list';

  const userSelections = state.userAnswers[state.currentQuestionIndex] || [];
  const isChecked = state.checkedAnswers.has(state.currentQuestionIndex);

  Object.entries(question.options).forEach(([letter, text]) => {
    const choiceItem = document.createElement('button');
    choiceItem.className = 'choice-item';
    
    const isSelected = userSelections.includes(letter);
    if (isSelected) choiceItem.classList.add('selected');

    // In Study Mode, if Checked: apply styling immediately
    if (state.mode === 'study' && isChecked) {
      choiceItem.disabled = true; // Lock option clicks
      
      const isCorrectOption = question.correctAnswer.includes(letter);
      if (isCorrectOption) {
        choiceItem.classList.remove('selected');
        choiceItem.classList.add('correct-answer');
      } else if (isSelected) {
        choiceItem.classList.remove('selected');
        choiceItem.classList.add('incorrect-selection');
      }
    }

    choiceItem.innerHTML = `
      <span class="choice-letter">${letter}</span>
      <span class="choice-text">${text}</span>
    `;

    choiceItem.addEventListener('click', () => {
      if (state.mode === 'study' && isChecked) return; // Prevent clicking if checked
      handleOptionSelect(letter, isMultiSelect, question.correctAnswer.length);
    });

    choicesList.appendChild(choiceItem);
  });

  container.appendChild(choicesList);

  // Explanation Feedback Box (Study Mode Checked OR Exam Review)
  if (state.mode === 'study' && isChecked) {
    const feedbackBox = document.createElement('div');
    const userIsCorrect = isAnswerCorrect(userSelections, question.correctAnswer);
    feedbackBox.className = `feedback-box ${userIsCorrect ? 'correct' : 'incorrect'}`;

    const formattedExp = formatUrlsInText(question.explanation || "No detailed explanation available.");
    
    feedbackBox.innerHTML = `
      <div class="feedback-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 20px; height: 20px;">
          ${userIsCorrect ? 
            '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>' : 
            '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'}
        </svg>
        <span>${userIsCorrect ? 'Correct Answer!' : 'Incorrect'}</span>
      </div>
      <div class="feedback-body">
        <p style="margin-bottom: 8px;"><strong>Correct Answer:</strong> ${question.correctAnswer.join(', ')}</p>
        <p>${formattedExp}</p>
      </div>
    `;
    container.appendChild(feedbackBox);
  }
}

// Convert absolute URLs in text to HTML clickable anchors
function formatUrlsInText(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}

function handleOptionSelect(letter, isMultiSelect, maxSelections) {
  const qIndex = state.currentQuestionIndex;
  if (!state.userAnswers[qIndex]) {
    state.userAnswers[qIndex] = [];
  }

  const index = state.userAnswers[qIndex].indexOf(letter);

  if (isMultiSelect) {
    if (index > -1) {
      // Deselect option
      state.userAnswers[qIndex].splice(index, 1);
    } else {
      // Check limit
      if (state.userAnswers[qIndex].length < maxSelections) {
        state.userAnswers[qIndex].push(letter);
      } else {
        // Replace first selection with new one
        state.userAnswers[qIndex].shift();
        state.userAnswers[qIndex].push(letter);
      }
    }
  } else {
    // Single select
    if (index > -1) {
      state.userAnswers[qIndex] = [];
    } else {
      state.userAnswers[qIndex] = [letter];
    }
  }

  // Render updates
  renderWorkspace();
  
  // In Study mode, save progress on every action
  if (state.mode === 'study' && state.activeExam.id !== 'mock') {
    savePartialProgress();
  }
}

function updateWorkspaceControls() {
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const checkBtn = document.getElementById('study-check-btn');
  const flagBtn = document.getElementById('flag-btn');

  // Disable/enable navigation
  prevBtn.disabled = state.currentQuestionIndex === 0;
  nextBtn.disabled = state.currentQuestionIndex === state.examQuestions.length - 1;

  // Toggle flag visual state
  const flagIcon = flagBtn.querySelector('.flag-icon');
  if (state.flaggedQuestions.has(state.currentQuestionIndex)) {
    flagIcon.classList.add('flagged');
  } else {
    flagIcon.classList.remove('flagged');
  }

  // Check Answer button (Study Mode Only)
  if (state.mode === 'study') {
    checkBtn.style.display = 'inline-flex';
    const isChecked = state.checkedAnswers.has(state.currentQuestionIndex);
    const hasSelection = state.userAnswers[state.currentQuestionIndex] && state.userAnswers[state.currentQuestionIndex].length > 0;

    checkBtn.disabled = !hasSelection || isChecked;
    checkBtn.textContent = isChecked ? 'Answer Checked' : 'Check Answer';
  } else {
    checkBtn.style.display = 'none';
  }
}

function goToQuestion(index) {
  state.currentQuestionIndex = index;
  renderWorkspace();
}

function navigatePrevious() {
  if (state.currentQuestionIndex > 0) {
    state.currentQuestionIndex--;
    renderWorkspace();
  }
}

function navigateNext() {
  if (state.currentQuestionIndex < state.examQuestions.length - 1) {
    state.currentQuestionIndex++;
    renderWorkspace();
  }
}

function toggleFlag() {
  const idx = state.currentQuestionIndex;
  if (state.flaggedQuestions.has(idx)) {
    state.flaggedQuestions.delete(idx);
  } else {
    state.flaggedQuestions.add(idx);
  }
  renderWorkspace();
}

function checkStudyAnswer() {
  const idx = state.currentQuestionIndex;
  const question = state.examQuestions[idx];
  const selections = state.userAnswers[idx] || [];

  if (selections.length === 0) return;

  state.checkedAnswers.add(idx);
  renderWorkspace();

  // If this is the last question, change study check button text or offer to complete study
  if (state.activeExam.id !== 'mock') {
    savePartialProgress();
    
    // Check if ALL questions are answered in study mode. If so, prompt submission
    const totalQs = state.examQuestions.length;
    const answeredCount = Object.keys(state.userAnswers).filter(k => state.userAnswers[k].length > 0).length;
    if (answeredCount === totalQs) {
      // Show finish button or automatically prompt completion
      const submitBtn = document.getElementById('submit-exam-btn');
      submitBtn.style.display = 'inline-flex';
      submitBtn.textContent = 'Finish Study';
    }
  }
}

// Exit active exam helpers
function showExitModal() {
  document.getElementById('exit-modal').classList.add('active');
}

function hideExitModal() {
  document.getElementById('exit-modal').classList.remove('active');
}

// Save temporary selections
function savePartialProgress() {
  const examId = state.activeExam.id;
  if (examId === 'mock') return; // Do not save mock exams partially

  if (!state.stats.examProgress[examId]) {
    state.stats.examProgress[examId] = {
      completed: false,
      maxScore: 0,
      answers: {}
    };
  }

  state.stats.examProgress[examId].answers = { ...state.userAnswers };
  saveUserData();
}

// ==========================================================================
// Timer helpers
// ==========================================================================
function startCountdownTimer() {
  state.examStartTime = Date.now();
  state.timerInterval = setInterval(() => {
    state.timeRemaining--;
    state.elapsedSeconds++;
    
    const display = document.getElementById('exam-timer');
    display.textContent = formatTime(state.timeRemaining);

    // Warning styling if less than 5 minutes
    if (state.timeRemaining < 300) {
      document.getElementById('exam-timer-box').classList.add('warning');
      display.classList.add('warning');
    }

    if (state.timeRemaining <= 0) {
      clearInterval(state.timerInterval);
      alert("Time's up! Your exam will be submitted automatically.");
      submitExam();
    }
  }, 1000);
}

function startCountUpTimer() {
  state.examStartTime = Date.now();
  state.timerInterval = setInterval(() => {
    state.elapsedSeconds++;
    document.getElementById('exam-timer').textContent = formatTime(state.elapsedSeconds);
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  document.getElementById('exam-timer-box').classList.remove('warning');
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const pad = (num) => String(num).padStart(2, '0');
  
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

// ==========================================================================
// Exam Submission & Results
// ==========================================================================
function confirmSubmitExam() {
  // Count unanswered
  const unansweredCount = state.examQuestions.length - Object.keys(state.userAnswers).filter(k => state.userAnswers[k] && state.userAnswers[k].length > 0).length;
  
  let confirmMsg = "Are you sure you want to submit your exam?";
  if (unansweredCount > 0) {
    confirmMsg = `You have ${unansweredCount} unanswered questions. Are you sure you want to submit?`;
  }

  if (confirm(confirmMsg)) {
    submitExam();
  }
}

function submitExam() {
  stopTimer();
  calculateAndRenderResults();
}

function calculateAndRenderResults() {
  const total = state.examQuestions.length;
  let correct = 0;
  let incorrect = 0;
  let skipped = 0;

  state.examQuestions.forEach((q, idx) => {
    const userAns = state.userAnswers[idx];
    if (!userAns || userAns.length === 0) {
      skipped++;
    } else if (isAnswerCorrect(userAns, q.correctAnswer)) {
      correct++;
    } else {
      incorrect++;
    }
  });

  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  const isPassed = percentage >= 70; // 70% passing threshold for AWS Cloud Practitioner

  // Save results in user stats (if not a mock exam)
  const examId = state.activeExam.id;
  if (examId !== 'mock') {
    const currentRecord = state.stats.examProgress[examId] || { completed: false, maxScore: 0 };
    
    state.stats.examProgress[examId] = {
      completed: true,
      maxScore: Math.max(currentRecord.maxScore || 0, percentage),
      answers: { ...state.userAnswers } // Save final answers
    };

    saveUserData();
  }

  // Render Stats on Results View
  document.getElementById('results-percentage').textContent = `${percentage}%`;
  document.getElementById('results-correct').textContent = correct;
  document.getElementById('results-incorrect').textContent = incorrect;
  document.getElementById('results-skipped').textContent = skipped;
  document.getElementById('results-time').textContent = formatTime(state.elapsedSeconds);

  const verdictDiv = document.getElementById('results-verdict');
  verdictDiv.textContent = isPassed ? 'PASSED' : 'FAILED';
  verdictDiv.className = `result-verdict ${isPassed ? 'pass' : 'fail'}`;

  // Animate progress circle
  // Circle circumference is 2 * PI * r = 2 * 3.14159 * 70 = 439.82
  const circle = document.getElementById('results-score-ring');
  const circumference = 439.8;
  const offset = circumference - (percentage / 100) * circumference;
  
  // Apply gradient stroke according to Pass/Fail
  if (isPassed) {
    circle.style.stroke = 'var(--color-correct)';
  } else {
    circle.style.stroke = 'var(--color-incorrect)';
  }
  
  circle.style.strokeDasharray = `${circumference} ${circumference}`;
  circle.style.strokeDashoffset = circumference; // reset first
  
  // Trigger layout reflow for animation
  setTimeout(() => {
    circle.style.strokeDashoffset = offset;
  }, 100);

  // Render Review List
  renderDetailedReview('all');

  switchView('results');
}

function renderDetailedReview(filter = 'all') {
  const container = document.getElementById('results-review-list');
  container.innerHTML = '';

  state.examQuestions.forEach((q, idx) => {
    const userSelections = state.userAnswers[idx] || [];
    const isCorrect = isAnswerCorrect(userSelections, q.correctAnswer);
    const isSkipped = userSelections.length === 0;

    // Filter validation
    if (filter === 'correct' && (!isCorrect || isSkipped)) return;
    if (filter === 'incorrect' && (isCorrect || isSkipped)) return;
    if (filter === 'flagged' && !state.flaggedQuestions.has(idx)) return;

    const reviewItem = document.createElement('div');
    reviewItem.className = 'review-item';

    let badgeClass = 'skipped';
    let badgeText = 'Skipped';
    if (!isSkipped) {
      badgeClass = isCorrect ? 'correct' : 'incorrect';
      badgeText = isCorrect ? 'Correct' : 'Incorrect';
    }

    const formattedExp = formatUrlsInText(q.explanation || "No detailed explanation available.");

    reviewItem.innerHTML = `
      <div class="review-item-header">
        <span class="review-q-num">Question ${idx + 1}</span>
        <span class="review-badge ${badgeClass}">${badgeText}</span>
      </div>
      <p class="q-text" style="font-size: 0.95rem;">${q.question}</p>
      
      <!-- Choices summary -->
      <div class="choices-list" style="gap: 8px;">
        ${Object.entries(q.options).map(([letter, text]) => {
          let itemClass = '';
          const isSelected = userSelections.includes(letter);
          const isCorrectOption = q.correctAnswer.includes(letter);

          if (isCorrectOption) {
            itemClass = 'correct-answer';
          } else if (isSelected) {
            itemClass = 'incorrect-selection';
          }

          return `
            <div class="choice-item ${itemClass}" style="padding: 10px 14px; font-size: 0.88rem; cursor: default;">
              <span class="choice-letter" style="width: 24px; height: 24px; font-size: 0.8rem;">${letter}</span>
              <span>${text}</span>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Explanation details -->
      <div class="feedback-box correct" style="margin-top: 8px; border: 1px solid var(--border-color); background-color: var(--bg-primary);">
        <div class="feedback-body" style="color: var(--text-secondary);">
          <p style="margin-bottom: 8px; color: var(--text-primary);"><strong>Correct Answer:</strong> ${q.correctAnswer.join(', ')}</p>
          <p>${formattedExp}</p>
        </div>
      </div>
    `;

    container.appendChild(reviewItem);
  });

  if (container.children.length === 0) {
    container.innerHTML = `
      <div style="padding: 30px; text-align: center; color: var(--text-muted);">
        No questions fit the current filter criteria.
      </div>
    `;
  }
}
