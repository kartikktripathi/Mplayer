# 🎵 Mplayer

A lightweight, terminal-based music player built in Node.js that runs entirely from the command line. Designed without heavy external audio packages, it demonstrates foundational systems and software engineering concepts: **CLI development**, **file system handling**, and **child process lifecycle management**.

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Summary](#-summary)
- [Tech Stack](#-tech-stack)
- [Key Features](#-key-features)
- [Project Structure](#-project-structure)
- [Architecture & Core Concepts](#-architecture--core-concepts)
  - [1. CLI Development & Terminal Control](#1-cli-development--terminal-control)
  - [2. File System Handling](#2-file-system-handling)
  - [3. Child Process Management & POSIX Signals](#3-child-process-management--posix-signals)
- [Prerequisites](#-prerequisites)
- [Dependencies](#-dependencies)
- [Installation & Setup](#-installation--setup)
- [Commands & Scripts](#-commands--scripts)
- [Usage & Controls](#-usage--controls)
- [Troubleshooting & Tips](#-troubleshooting--tips)

---

## 🌟 Overview

Mplayer provides an interactive terminal user interface (TUI) to navigate and play audio tracks stored locally on your machine. By tapping into Node's native standard library (`fs`, `path`, `child_process`) and low-level terminal streams (`process.stdin`, `process.stdout`), Mplayer delivers instant feedback and responsive controls directly within your shell.

```text
  1: queenClassic.mp3
  2: redbone.mp3
→ 3: sample-25s.mp3
  4: sample-speech-1m.mp3
  5: sample.mp3
  6: test.mp3
Currently Playing: sample-25s.mp3
```

---

## 📋 Summary

Mplayer scans a local `songs/` folder for `.mp3` files, renders an interactive list with an indicator arrow (`→`), and allows you to play, pause, resume, and switch tracks seamlessly. Terminal state is handled directly using raw input mode and ANSI escape sequences to redraw content in-place without screen flickering or duplicate line spamming. Audio playback is delegated to macOS's built-in `afplay` utility, managed as an asynchronous child process controlled via POSIX signals (`SIGSTOP` and `SIGCONT`).

---

## 🛠 Tech Stack

- **Runtime**: [Node.js](https://nodejs.org/) (CommonJS module system, version 16.0+)
- **Standard Library**:
  - `child_process` (`spawn`): Spawns and manages the external audio playback process.
  - `fs` (`readdirSync`): Synchronously reads the songs directory.
  - `path` (`join`): Resolves directory paths across systems.
- **Terminal Control**:
  - `process.stdin` (Raw Mode): Captures real-time keystrokes without requiring `Enter`.
  - `process.stdout` (ANSI Escape Codes): Re-renders lines in-place (`\x1b[2K`, `\x1b[<N>A`, `\r`).
- **Audio Engine**: macOS `afplay` (native command-line audio player).
- **Code Quality & Formatting**:
  - [ESLint](https://eslint.org/) (v10 with flat configuration `eslint.config.mjs`).
  - [Prettier](https://prettier.io/) (v3 for automated code formatting).

---

## ✨ Key Features

- **Interactive TUI**: Navigate your track list dynamically with instant visual feedback via arrow keys.
- **In-Place Re-Rendering**: Uses ANSI escape sequences to update lines in the terminal without flickering or spamming new lines.
- **Dynamic Track Status**: Displays `Currently Playing: <filename>` under the playlist and cleanly clears and updates it whenever switching tracks or quitting.
- **Kernel-Level Playback Control**: Uses OS-level POSIX signals (`SIGSTOP`, `SIGCONT`) to pause and resume audio without losing playback position or wasting CPU cycles.
- **Zero Runtime Dependencies**: Drives playback via native system utilities (`afplay`) and Node.js standard modules—no heavy audio dependencies or external decoders needed.
- **Automatic Audio Filtering**: Automatically scans the `songs/` directory and isolates valid `.mp3` tracks while ignoring non-audio files (such as `.jpeg` files).
- **Clean Terminal Restoration**: Gracefully exits on `q`, kills the active child process, clears the playback indicator, and disables raw mode to restore your shell prompt.

---

## 📁 Project Structure

```text
Mplayer/
├── songs/                 # Directory containing local audio tracks
│   ├── queenClassic.mp3
│   ├── redbone.mp3
│   ├── sample-25s.mp3
│   ├── sample-speech-1m.mp3
│   ├── sample.mp3
│   ├── test.jpeg         # Non-audio file (ignored by MP3 filter)
│   └── test.mp3
├── .gitignore             # Git ignore configuration
├── eslint.config.mjs      # ESLint configuration
├── package-lock.json      # Dependency lockfile
├── package.json           # Project metadata, scripts, and dependencies
├── player.js              # Core CLI audio player application
└── README.md              # Project documentation
```

---

## 🧠 Architecture & Core Concepts

Mplayer is built around three core Node.js engineering paradigms:

### 1. CLI Development & Terminal Control

Standard terminal input operates in **canonical mode** (line-buffered mode), meaning keystrokes are buffered until the user presses `Enter`. To create a responsive CLI:

- **Raw Mode (`process.stdin.setRawMode(true)`)**:
  Switches the input stream to raw mode, delivering keystrokes byte-by-byte in real time.
- **Character Encoding (`process.stdin.setEncoding("utf-8")`)**:
  Ensures raw incoming binary buffers are decoded into standard strings.
- **ANSI Escape Codes**:
  - `\x1b[2K`: Clears the current terminal line.
  - `\x1b[<N>A`: Moves the cursor up by `N` lines (e.g., `\x1b[${linesToMove}A`), repositioning the cursor to redraw the list in place.
  - `\x1b[1A\x1b[2K\r`: Moves up one line, clears it, and returns the carriage to erase the "Currently Playing" line when switching songs or quitting.
- **Escape Sequence Parsing**:
  Special keys emit multi-byte ANSI escape sequences:
  - Up Arrow: `\x1b[A` (detected via `input[2] === "A"`)
  - Down Arrow: `\x1b[B` (detected via `input[2] === "B"`)
  - Enter: `\r`
  - Spacebar: `" "`
  - Quit: `"q"`
- **Terminal State Restoration**:
  Before exiting, raw mode is deactivated (`process.stdin.setRawMode(false)`) so the user's terminal environment returns to its default state.

```javascript
process.stdin.setEncoding("utf-8");
process.stdin.setRawMode(true);

process.stdin.on("data", (input) => {
  if (input === "\r") playSong();
  if (input === " ") togglePause();
  if (input === "q") {
    if (player) player.kill();
    clearCurrent();
    console.log("Thanks for using Mplayer!");
    process.stdin.setRawMode(false);
    process.exit(0);
  }
  // Up arrow
  if (input[2] === "A") { ... }
  // Down arrow
  if (input[2] === "B") { ... }
});
```

---

### 2. File System Handling

Mplayer dynamically scans the local file system for audio files on startup:

- **Directory Resolution (`path.join(__dirname, "Songs")`)**:
  Combines the module path with target folders in a platform-agnostic manner.
- **Synchronous Directory Reading (`fs.readdirSync`)**:
  Reads the directory contents to populate the playlist before attaching event listeners.
- **File Filtering (`.filter((file) => file.endsWith(".mp3"))`)**:
  Isolates valid audio files and ignores non-audio files (such as images, hidden files, or metadata files).

```javascript
const songs = fs
  .readdirSync(path.join(__dirname, "Songs"))
  .filter((file) => file.endsWith(".mp3"));
```

---

### 3. Child Process Management & POSIX Signals

Audio decoding and output is delegated to an external system process:

- **Process Spawning (`child_process.spawn`)**:
  `afplay` (macOS native audio tool) is spawned asynchronously with the path to the selected track:
  ```javascript
  player = spawn("afplay", [songPath]);
  ```
- **Process Replacement & Clean Up**:
  When a new song is selected, the currently running child process is terminated via `player.kill()` and the previous playback status line is erased before launching the next one.
- **Pausing with `SIGSTOP`**:
  Instead of killing the process to pause, Mplayer sends the POSIX signal `SIGSTOP`:
  ```javascript
  player.kill("SIGSTOP");
  ```
  This tells the operating system kernel to freeze execution of `afplay`. The audio stream halts, while the process memory and playback buffer remain intact.
- **Resuming with `SIGCONT`**:
  When unpausing, Mplayer sends `SIGCONT`:
  ```javascript
  player.kill("SIGCONT");
  ```
  The OS kernel resumes the audio process right from where it was suspended.

---

## 💻 Prerequisites

- **Node.js**: Version 16.0 or higher.
- **Operating System**: macOS (comes preinstalled with `afplay`).

---

## 📦 Dependencies

### Runtime Dependencies

**None.** Mplayer runs purely on Node.js core modules (`fs`, `path`, `child_process`) and macOS's native `afplay` binary.

### Development & Tooling Dependencies

- **[eslint](https://www.npmjs.com/package/eslint)** (`^10.10.0`): JavaScript linter.
- **[@eslint/js](https://www.npmjs.com/package/@eslint/js)** (`^10.0.1`): ESLint recommended configuration.
- **[globals](https://www.npmjs.com/package/globals)** (`^17.12.0`): Global identifier definitions for Node.js environments.
- **[prettier](https://www.npmjs.com/package/prettier)** (`^3.9.6`): Code formatter.

---

## 🚀 Installation & Setup

1. **Clone the repository**:

   ```bash
   git clone https://github.com/kartikktripathi/Mplayer.git
   cd Mplayer
   ```

2. **Add audio files**:
   Ensure you have `.mp3` files placed inside the `songs/` folder:

   ```bash
   ls songs/
   ```

3. **Install development dependencies (optional)**:

   ```bash
   npm install
   ```

4. **Launch Mplayer**:
   ```bash
   npm start
   ```
   _Or directly with Node:_
   ```bash
   node player.js
   ```

---

## ⌨️ Commands & Scripts

| Command                  | Description                                   |
| :----------------------- | :-------------------------------------------- |
| `npm start`              | Launches Mplayer (`node player.js`)           |
| `node player.js`         | Starts the music player directly              |
| `npx eslint .`           | Runs ESLint to validate code syntax and style |
| `npx prettier --write .` | Formats all project files using Prettier      |

---

## 🎮 Usage & Controls

Once launched, use the following keyboard controls:

| Key                    | Action                 | Description                                              |
| :--------------------- | :--------------------- | :------------------------------------------------------- |
| **`↑` (Up Arrow)**     | **Move Up**            | Moves the selection cursor up the track list             |
| **`↓` (Down Arrow)**   | **Move Down**          | Moves the selection cursor down the track list           |
| **`Enter` (`Return`)** | **Play / Switch Song** | Plays the highlighted track (clearing previous status)   |
| **`Spacebar`**         | **Pause / Resume**     | Toggles playback pause via `SIGSTOP` / `SIGCONT`         |
| **`q`**                | **Quit**               | Clears status, restores terminal mode, and exits cleanly |

---

## 🔧 Troubleshooting & Tips

- **Arrow keys printing characters instead of moving?**  
  Ensure your terminal emulator supports standard VT100 / xterm ANSI escape codes (built-in Terminal, iTerm2, VS Code Integrated Terminal, and Alacritty all work seamlessly).
- **Audio not playing?**  
  Ensure your `.mp3` file is not 0 bytes or corrupted. You can test playing it directly in your terminal with `afplay songs/<filename>.mp3`.
- **Exiting cleanly:**  
  Always use `q` to exit so that `process.stdin.setRawMode(false)` is invoked to restore your terminal prompt.
