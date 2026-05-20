/**
 * AegisEmail Frontend Logic
 * Implements modern UI tab navigations, presets loading, file handlers, real-time Chart.js rendering,
 * local session storage, and backend communication hooks.
 */

// Active state memory
let sessionResults = [];
let chartInstance = null;
let selectedFile = null;

// Presets content matching the training vocabulary
const PRESETS = {
  hamNormal: "Hi team, please find the weekly status report attached. Let me know if you have any questions.",
  hamBorderline: "Subject: URGENT Lottery Winner Cash Prize Claim. Body: Congratulations, you have won a free cash lottery prize of one million dollars! Click here to claim your reward immediately.",
  spamNormal: "Congratulations! Your email address was selected as the grand prize winner. Claim your cash rewards now by clicking this link.",
  spamPhish: "Dear customer, we detected unusual activity on your account. Please click here to verify your login credentials immediately."
};

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupTheme();
  setupPresets();
  setupSinglePredictor();
  setupBatchPredictor();
  setupDashboardExporters();
  setupHistoryControls();
  
  // Set initial empty state for history count
  updateHistoryCounters();
});

/* ==========================================================================
   Theme & Toggle Logic
   ========================================================================== */

function setupTheme() {
  const toggleBtn = document.getElementById("theme-toggle");
  
  // Check local storage or defaults to dark
  const currentTheme = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", currentTheme);
  updateThemeIcon(currentTheme);

  toggleBtn.addEventListener("click", () => {
    const activeTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = activeTheme === "dark" ? "light" : "dark";
    
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    updateThemeIcon(newTheme);
    
    // Refresh chart colors if chart is active
    if (sessionResults.length > 0) {
      refreshChart();
    }
  });
}

function updateThemeIcon(theme) {
  const icon = document.querySelector("#theme-toggle i");
  if (theme === "dark") {
    icon.className = "fa-solid fa-sun";
    icon.style.color = "#f59e0b";
  } else {
    icon.className = "fa-solid fa-moon";
    icon.style.color = "";
  }
}

/* ==========================================================================
   Tab Navigation Routing
   ========================================================================== */

function setupTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  const views = document.querySelectorAll(".view-panel");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const targetView = tab.getAttribute("data-tab");

      tabs.forEach(t => t.classList.remove("active"));
      views.forEach(v => v.classList.remove("active"));

      tab.classList.add("active");
      document.getElementById(`view-${targetView}`).classList.add("active");
      
      // Auto refresh dashboard display if active
      if (targetView === "dashboard") {
        renderDashboard();
      }
    });
  });
}

/* ==========================================================================
   Test Presets Loader
   ========================================================================== */

function setupPresets() {
  const textInput = document.getElementById("email-text-input");
  
  document.getElementById("preset-ham-normal").addEventListener("click", () => {
    textInput.value = PRESETS.hamNormal;
  });
  
  document.getElementById("preset-ham-borderline").addEventListener("click", () => {
    textInput.value = PRESETS.hamBorderline;
  });
  
  document.getElementById("preset-spam-normal").addEventListener("click", () => {
    textInput.value = PRESETS.spamNormal;
  });
  
  document.getElementById("preset-spam-phish").addEventListener("click", () => {
    textInput.value = PRESETS.spamPhish;
  });
}

/* ==========================================================================
   🔍 Single Email Analysis
   ========================================================================== */

function setupSinglePredictor() {
  const btnAnalyze = document.getElementById("btn-analyze-single");
  const textInput = document.getElementById("email-text-input");
  
  const emptyState = document.getElementById("single-empty-state");
  const loadingState = document.getElementById("single-loading-state");
  const resultState = document.getElementById("single-result-state");
  
  btnAnalyze.addEventListener("click", async () => {
    const text = textInput.value.trim();
    if (!text) {
      alert("Please paste email headers or body text before analyzing.");
      return;
    }
    
    // UI state loading
    emptyState.classList.add("hidden");
    resultState.classList.add("hidden");
    loadingState.classList.remove("hidden");
    
    try {
      const response = await fetch("/api/predict/single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      
      if (!response.ok) {
        throw new Error("Backend classification service failed.");
      }
      
      const data = await response.json();
      
      // Complete loading view
      loadingState.classList.add("hidden");
      resultState.classList.remove("hidden");
      
      // Display predictions
      displaySingleResult(data);
      
      // Add record to session history memory
      const newRecord = {
        id: sessionResults.length + 1,
        subject: extractSubjectFromText(text),
        sender: extractSenderFromText(text),
        date: new Date().toLocaleTimeString(),
        body_preview: data.text_preview,
        prediction: data.prediction,
        confidence: data.confidence,
        probabilities: data.probabilities
      };
      
      sessionResults.unshift(newRecord); // Add to the front
      addHistoryCard(newRecord);
      updateHistoryCounters();
      
    } catch (error) {
      loadingState.classList.add("hidden");
      emptyState.classList.remove("hidden");
      alert(error.message);
    }
  });
}

function displaySingleResult(data) {
  const badge = document.getElementById("result-badge");
  const badgeIcon = document.getElementById("result-badge-icon");
  const badgeText = document.getElementById("result-badge-text");
  
  const progressFill = document.getElementById("confidence-progress");
  const confidencePercentText = document.getElementById("confidence-percentage");
  const confidenceLevel = document.getElementById("confidence-level-text");
  
  const probHam = document.getElementById("prob-ham-val");
  const probSpam = document.getElementById("prob-spam-val");
  const scrubbedText = document.getElementById("scrubbed-text-preview");
  
  // Format prediction label
  const isSpam = data.prediction === "spam";
  badge.className = `badge ${isSpam ? "spam" : "ham"}`;
  badgeIcon.className = isSpam ? "fa-solid fa-triangle-exclamation" : "fa-solid fa-circle-check";
  badgeText.textContent = isSpam ? "Spam Threat" : "Ham Cleared";
  
  // Progress confidence fill
  const pct = Math.round(data.confidence * 100);
  
  progressFill.className = `progress-bar-fill ${isSpam ? "danger" : "success"}`;
  // Force reflow for CSS transition
  progressFill.style.width = "0%";
  setTimeout(() => {
    progressFill.style.width = `${pct}%`;
  }, 50);
  
  confidencePercentText.textContent = `${pct}%`;
  
  // Confidence descriptive tag
  if (pct > 90) {
    confidenceLevel.textContent = "Definitive (High-Trust)";
  } else if (pct > 75) {
    confidenceLevel.textContent = "Probable (Reliable)";
  } else {
    confidenceLevel.textContent = "Marginal (Low-Trust Boundary)";
  }
  
  // Probability values
  probHam.textContent = `${(data.probabilities.ham * 100).toFixed(1)}%`;
  probSpam.textContent = `${(data.probabilities.spam * 100).toFixed(1)}%`;
  
  // Scrubbed Preview text
  scrubbedText.textContent = data.text_preview;
}

/* ==========================================================================
   📂 Batch MBOX File Processing
   ========================================================================== */

function setupBatchPredictor() {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("batch-file-input");
  
  const uploadActions = document.getElementById("upload-actions-container");
  const selectedName = document.getElementById("selected-file-name");
  const selectedSize = document.getElementById("selected-file-size");
  
  const btnCancel = document.getElementById("btn-cancel-upload");
  const btnProcess = document.getElementById("btn-process-batch");
  
  const loadingState = document.getElementById("batch-loading-state");
  const resultsContainer = document.getElementById("batch-results-container");
  
  // Setup file browser trigger
  dropzone.addEventListener("click", () => fileInput.click());
  
  // Drag and drop highlights
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  
  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });
  
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });
  
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) {
      handleFileSelected(fileInput.files[0]);
    }
  });
  
  btnCancel.addEventListener("click", () => {
    clearBatchSelection();
  });
  
  btnProcess.addEventListener("click", async () => {
    if (!selectedFile) return;
    
    // UI state processing
    resultsContainer.classList.add("hidden");
    loadingState.classList.remove("hidden");
    btnProcess.disabled = true;
    btnCancel.disabled = true;
    
    const formData = new FormData();
    formData.append("file", selectedFile);
    
    try {
      const response = await fetch("/api/predict/batch", {
        method: "POST",
        body: formData
      });
      
      if (!response.ok) {
        throw new Error("Failed to process batch inbox file. Verify model status.");
      }
      
      const data = await response.json();
      
      // Update UI loading state
      loadingState.classList.add("hidden");
      resultsContainer.classList.remove("hidden");
      
      // Populate results
      populateBatchTable(data.results);
      
      // Merge results into history memory
      data.results.forEach(rec => {
        // Uniquify ID
        rec.id = sessionResults.length + 1;
        sessionResults.unshift(rec);
        addHistoryCard(rec);
      });
      
      updateHistoryCounters();
      
    } catch (error) {
      loadingState.classList.add("hidden");
      alert(error.message);
    } finally {
      btnProcess.disabled = false;
      btnCancel.disabled = false;
    }
  });
  
  // Bind Batch Export Actions
  document.getElementById("btn-export-csv").addEventListener("click", exportCSV);
  document.getElementById("btn-export-pdf").addEventListener("click", exportPDF);
}

function handleFileSelected(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext !== "mbox" && ext !== "txt") {
    alert("Invalid format! Please upload an MBOX archive (.mbox) or standard paragraph log (.txt).");
    return;
  }
  
  selectedFile = file;
  
  // Format Size
  let sizeStr = `${(file.size / 1024).toFixed(1)} KB`;
  if (file.size > 1024 * 1024) {
    sizeStr = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
  }
  
  document.getElementById("selected-file-name").textContent = file.name;
  document.getElementById("selected-file-size").textContent = sizeStr;
  
  document.getElementById("dropzone").classList.add("hidden");
  document.getElementById("upload-actions-container").classList.remove("hidden");
}

function clearBatchSelection() {
  selectedFile = null;
  document.getElementById("batch-file-input").value = "";
  document.getElementById("upload-actions-container").classList.add("hidden");
  document.getElementById("dropzone").classList.remove("hidden");
  document.getElementById("batch-results-container").classList.add("hidden");
}

function populateBatchTable(records) {
  const body = document.getElementById("batch-table-body");
  document.getElementById("batch-total-count").textContent = records.length;
  body.innerHTML = "";
  
  records.forEach(item => {
    const tr = document.createElement("tr");
    
    const isSpam = item.prediction === "spam";
    const badgeClass = isSpam ? "badge-label spam" : "badge-label ham";
    const badgeIcon = isSpam ? "fa-solid fa-triangle-exclamation" : "fa-solid fa-circle-check";
    
    // Clean preview sender
    let cleanSender = item.sender || "(Unknown)";
    if (cleanSender.length > 30) {
      cleanSender = cleanSender.substring(0, 27) + "...";
    }
    
    tr.innerHTML = `
      <td>${item.id}</td>
      <td title="${item.subject}">${item.subject || '(No Subject)'}</td>
      <td title="${item.sender}">${cleanSender}</td>
      <td>
        <span class="${badgeClass}">
          <i class="${badgeIcon}"></i> ${item.prediction}
        </span>
      </td>
      <td style="font-weight: 600;">${(item.confidence * 100).toFixed(1)}%</td>
    `;
    
    body.appendChild(tr);
  });
}

/* ==========================================================================
   📊 Real-Time KPI & Chart.js Session Dashboard
   ========================================================================== */

function renderDashboard() {
  const emptyState = document.getElementById("dashboard-empty-state");
  const liveState = document.getElementById("dashboard-live-state");
  
  if (sessionResults.length === 0) {
    emptyState.classList.remove("hidden");
    liveState.classList.add("hidden");
    return;
  }
  
  emptyState.classList.add("hidden");
  liveState.classList.remove("hidden");
  
  // Calculate KPI metrics
  const stats = getSummaryStats();
  
  document.getElementById("kpi-total").textContent = stats.total;
  document.getElementById("kpi-spam").textContent = stats.spam;
  document.getElementById("kpi-ham").textContent = stats.ham;
  document.getElementById("kpi-ratio").textContent = `${stats.spam_pct.toFixed(1)}%`;
  
  // Average Confidence Bar fills
  document.getElementById("stat-avg-ham-conf").textContent = `${stats.avg_ham_conf.toFixed(1)}%`;
  document.getElementById("stat-avg-spam-conf").textContent = `${stats.avg_spam_conf.toFixed(1)}%`;
  
  const hamBar = document.getElementById("stat-ham-progress-fill");
  const spamBar = document.getElementById("stat-spam-progress-fill");
  
  hamBar.style.width = "0%";
  spamBar.style.width = "0%";
  
  setTimeout(() => {
    hamBar.style.width = `${stats.avg_ham_conf}%`;
    spamBar.style.width = `${stats.avg_spam_conf}%`;
  }, 50);
  
  // Draw Doughnut Graph
  updateChart(stats.ham, stats.spam);
}

function getSummaryStats() {
  const total = sessionResults.length;
  const spam = sessionResults.filter(r => r.prediction === "spam").length;
  const ham = total - spam;
  
  const spam_pct = total > 0 ? (spam / total) * 100 : 0.0;
  const ham_pct = total > 0 ? (ham / total) * 100 : 0.0;
  
  // Confidence aggregation
  const hamItems = sessionResults.filter(r => r.prediction === "ham");
  const spamItems = sessionResults.filter(r => r.prediction === "spam");
  
  const avg_ham_conf = hamItems.length > 0 
    ? (hamItems.reduce((acc, cur) => acc + cur.confidence, 0) / hamItems.length) * 100 
    : 0.0;
    
  const avg_spam_conf = spamItems.length > 0 
    ? (spamItems.reduce((acc, cur) => acc + cur.confidence, 0) / spamItems.length) * 100 
    : 0.0;
    
  return {
    total,
    spam,
    ham,
    spam_pct,
    ham_pct,
    avg_ham_conf,
    avg_spam_conf
  };
}

function updateChart(hamCount, spamCount) {
  const ctx = document.getElementById("threat-chart");
  if (!ctx) return;
  
  if (chartInstance) {
    chartInstance.destroy();
  }
  
  // Fetch active CSS variable values to preserve design harmony
  const style = getComputedStyle(document.documentElement);
  const successColor = style.getPropertyValue("--success").trim() || "#10b981";
  const dangerColor = style.getPropertyValue("--danger").trim() || "#f43f5e";
  
  chartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Clean Ham", "Spam Threats"],
      datasets: [{
        data: [hamCount, spamCount],
        backgroundColor: [successColor, dangerColor],
        hoverOffset: 4,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "75%",
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: true,
          backgroundColor: "#0d1224",
          titleFont: { family: "Outfit" },
          bodyFont: { family: "Inter" },
          borderColor: "rgba(255,255,255,0.08)",
          borderWidth: 1
        }
      }
    }
  });
}

function refreshChart() {
  if (!chartInstance) return;
  const stats = getSummaryStats();
  updateChart(stats.ham, stats.spam);
}

function setupDashboardExporters() {
  document.getElementById("dashboard-export-csv").addEventListener("click", exportCSV);
  document.getElementById("dashboard-export-pdf").addEventListener("click", exportPDF);
}

/* ==========================================================================
   📜 Session History Logging
   ========================================================================== */

function setupHistoryControls() {
  const btnClear = document.getElementById("btn-clear-history");
  btnClear.addEventListener("click", () => {
    if (confirm("Are you sure you want to purge all session records? This will clear history logs and reset dashboards.")) {
      sessionResults = [];
      
      // Reset UI elements
      document.getElementById("spam-history-list").innerHTML = getHistoryPlaceholderHTML("spam");
      document.getElementById("ham-history-list").innerHTML = getHistoryPlaceholderHTML("ham");
      
      // Update counters
      updateHistoryCounters();
      
      // Reset dashboard panel if they are on it
      const activeTab = document.querySelector(".tab-btn.active").getAttribute("data-tab");
      if (activeTab === "dashboard") {
        renderDashboard();
      }
      
      // Reset single predictor display
      document.getElementById("single-result-state").classList.add("hidden");
      document.getElementById("single-empty-state").classList.remove("hidden");
      
      // Reset batch preview displays
      clearBatchSelection();
    }
  });
}

function getHistoryPlaceholderHTML(type) {
  const isSpam = type === "spam";
  const icon = isSpam ? "fa-solid fa-circle-check" : "fa-solid fa-envelope";
  const text = isSpam ? "No spam detected in this session yet." : "No clean emails classified in this session yet.";
  
  return `
    <div class="empty-history-placeholder" id="${type}-history-placeholder">
      <i class="${icon} placeholder-icon"></i>
      <p>${text}</p>
    </div>
  `;
}

function addHistoryCard(record) {
  const isSpam = record.prediction === "spam";
  const listContainer = document.getElementById(isSpam ? "spam-history-list" : "ham-history-list");
  const placeholder = document.getElementById(isSpam ? "spam-history-placeholder" : "ham-history-placeholder");
  
  // Remove placeholder if present
  if (placeholder) {
    placeholder.remove();
  }
  
  const card = document.createElement("div");
  card.className = "history-card";
  
  const dateStr = record.date || new Date().toLocaleTimeString();
  const badgeClass = isSpam ? "history-card-badge spam" : "history-card-badge ham";
  
  // Subject truncation
  let subj = record.subject || "(No Subject)";
  if (subj.length > 40) subj = subj.substring(0, 37) + "...";
  
  // Sender clean
  let sender = record.sender || "(Unknown)";
  if (sender.length > 25) sender = sender.substring(0, 22) + "...";
  
  card.innerHTML = `
    <div class="history-card-header">
      <h4 class="history-card-title" title="${record.subject}">${subj}</h4>
      <span class="${badgeClass}">${record.prediction.toUpperCase()}</span>
    </div>
    <p class="history-card-body">${record.body_preview || ''}</p>
    <div class="history-card-meta">
      <span title="${record.sender}"><i class="fa-solid fa-user"></i> ${sender}</span>
      <span><i class="fa-solid fa-clock"></i> ${dateStr} (${(record.confidence * 100).toFixed(0)}%)</span>
    </div>
  `;
  
  // Prepend to top of list
  listContainer.insertBefore(card, listContainer.firstChild);
}

function updateHistoryCounters() {
  const spamCount = sessionResults.filter(r => r.prediction === "spam").length;
  const hamCount = sessionResults.length - spamCount;
  
  document.getElementById("spam-history-count").textContent = spamCount;
  document.getElementById("ham-history-count").textContent = hamCount;
}

/* ==========================================================================
   📄 Exporters: CSV & FPDF generator endpoints
   ========================================================================== */

async function exportCSV() {
  if (sessionResults.length === 0) {
    alert("No active session data to export.");
    return;
  }
  
  try {
    const response = await fetch("/api/export/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: sessionResults })
    });
    
    if (!response.ok) throw new Error("Failed to generate CSV export.");
    
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `AegisEmail_Report_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    
  } catch (error) {
    alert(error.message);
  }
}

async function exportPDF() {
  if (sessionResults.length === 0) {
    alert("No active session data to export.");
    return;
  }
  
  try {
    const summary = getSummaryStats();
    
    const response = await fetch("/api/export/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        results: sessionResults,
        summary: summary
      })
    });
    
    if (!response.ok) throw new Error("Failed to generate PDF document.");
    
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `AegisEmail_Report_${Date.now()}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    
  } catch (error) {
    alert(error.message);
  }
}

/* ==========================================================================
   🔍 Auxiliary Text Parsers
   ========================================================================== */

function extractSubjectFromText(text) {
  // Try to find Subject: line
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.toLowerCase().startsWith("subject:")) {
      return line.substring(8).trim();
    }
  }
  // If not found, use body snippet
  return text.substring(0, 30) + (text.length > 30 ? "..." : "");
}

function extractSenderFromText(text) {
  // Try to find From: line
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.toLowerCase().startsWith("from:")) {
      return line.substring(5).trim();
    }
  }
  return "Local User";
}
