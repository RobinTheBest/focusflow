# 🌌 FocusFlow

FocusFlow is a premium, gamified single-page productivity application designed to make focus sessions rewarding, interactive, and visually stunning. By blending Pomodoro timer techniques, immersive custom soundscapes, persistent statistics, and a full RPG-style experience point (XP) and leveling engine, FocusFlow turns your daily tasks into an engaging quest.

---

## ✨ Features

- **🎮 RPG-Style Gamification**:
  - Earn XP (1 XP per minute of focus) and unlock new level tiers.
  - Complete checklist items for +5 XP, with built-in mechanics to prevent XP farming exploits.
  - Unlock customizable badges based on your milestones and streaks.
  
- **🧪 Immersive Soundscapes (Web Audio API)**:
  - Generate ambient audio directly in the browser—no large external audio files needed.
  - Choose between pink noise, deep low drone, and custom-parameterized binaural beats: **10Hz Alpha Waves** (for deep study) or **40Hz Gamma Waves** (for peak cognitive performance).
  - Fine-tune volume levels dynamically with integrated mixer dials.

- **📊 Visual Analytics**:
  - A beautiful, custom SVG-powered focus chart that displays your daily productivity trends.
  - Real-time task completion statistics, streak counters, and comprehensive session logs in the History view.

- **⏱️ Flexible Focus Engine**:
  - Seamlessly switch between **Work**, **Short Break**, and **Long Break** modes.
  - Interactive, high-contrast glowing number inputs and range sliders synchronized bidirectionally.
  - 16 individual cognitive feedback thresholds adjusting dynamic status descriptions based on your state.

- **🎨 Cyberpunk Glassmorphic Aesthetics**:
  - Custom Vanilla CSS dark mode theme utilizing vibrant neon accents, glassmorphic card grids, responsive layouts, and elegant micro-animations.
  - Perfect browser viewport fit eliminating double scrollbars for a premium desktop experience.

- **💾 Persistent State**:
  - Fully local-first app using HTML5 LocalStorage to keep your profile, active streak, complete task count, custom preferences, and history logs safe and sound.

---

## 🚀 Getting Started

### Prerequisites

You only need a modern web browser and a local HTTP server to run the application securely.

### Running Locally

Since FocusFlow uses web components and Web Audio APIs, serve the folder from a local web server:

1. Clone or navigate to the directory:
   ```bash
   cd productivity-tracker
   ```

2. Start a simple python HTTP server:
   ```bash
   python3 -m http.server 5004
   ```

3. Open your browser and navigate to:
   **[http://localhost:5004](http://localhost:5004)**

---

## 🛠️ File Structure

- **`index.html`**: Semantic HTML5 layout structure containing view modules (Dashboard, Timer, Soundscapes, Tasks, Settings).
- **`styles.css`**: Core design system variables, glassmorphic cards, animations, media queries, and responsive grid framework.
- **`app.js`**: Core state machines, interactive bi-directional sliders, custom SVG rendering logic, Web Audio synthesizers, and gamification mathematics.
- **`.gitignore`**: Excludes temporary files, `.DS_Store`, and local server logs.

---

## 📝 License

This project is open-source and available under the MIT License.
