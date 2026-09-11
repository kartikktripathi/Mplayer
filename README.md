# 🎵 Mplayer

A lightweight, terminal-based music player built in Node.js that runs entirely from the command line. Designed without heavy external audio packages, it demonstrates foundational systems and software engineering concepts: **CLI development**, **file system handling**, and **child process lifecycle management**.

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture & Core Concepts](#-architecture--core-concepts)
  - [1. CLI Development & Terminal Control](#1-cli-development--terminal-control)
  - [2. File System Handling](#2-file-system-handling)
  - [3. Child Process Management & POSIX Signals](#3-child-process-management--posix-signals)
- [Prerequisites](#-prerequisites)
- [Installation & Setup](#-installation--setup)
- [Usage & Controls](#-usage--controls)
- [Project Structure](#-project-structure)
- [Troubleshooting & Tips](#-troubleshooting--tips)

---

## 🌟 Overview

Mplayer provides an interactive terminal user interface (TUI) to navigate and play audio tracks stored locally on your machine. By tapping into Node's native standard library (`fs`, `path`, `child_process`) and low-level terminal streams (`process.stdin`, `process.stdout`), Mplayer delivers instant feedback and responsive controls directly within your shell.

```text
→ 1: sample-25s.mp3
  2: sample-speech-1m.mp3
  3: test.mp3
```

---

## ✨ Key Features

- **Interactive TUI**: Navigate your track list dynamically with instant visual updates.
- **In-Place Re-Rendering**: Uses ANSI escape sequences to update lines in the terminal without flickering or spamming new lines.
- **Signal-Based Playback**: Uses OS-level POSIX signals (`SIGSTOP`, `SIGCONT`) to pause and resume audio without losing playback position.
- **Zero Heavy Audio Dependencies**: Drives playback via native system utilities (`afplay`), keeping dependencies minimal and startup instantaneous.

---

## 🧠 Architecture & Core Concepts

Mplayer is built around three core Node.js engineering paradigms:

### 1. CLI Development & Terminal Control

Standard terminal input operates in **canonical mode** (line-buffered mode), meaning keystrokes are buffered until the user presses `Enter`. To create a responsive CLI:

* **Raw Mode (`process.stdin.setRawMode(true)`)**: 
  Switches the input stream to raw mode, delivering keystrokes byte-by-byte in real time.
* **Character Encoding (`process.stdin.setEncoding("utf-8")`)**:
  Ensures raw incoming binary buffers are decoded into standard strings.
* **ANSI Escape Codes**:
  - `\x1b[2K`: Clears the current terminal line.
  - `\x1b[<N>A`: Moves the cursor up by `N` lines (e.g., `\x1b[${songs.length}A`). This allows Mplayer to redraw the list in place whenever selection changes.
* **Escape Sequence Parsing**:
  Special keys like arrow keys emit multi-byte ANSI sequences:
  - Up Arrow: `\x1b[A` (detected via `input[2] === "A"`)
  - Down Arrow: `\x1b[B` (detected via `input[2] === "B"`)
* **Terminal State Restoration**:
  Before exiting, raw mode is deactivated (`process.stdin.setRawMode(false)`) so the user's terminal environment returns to its default state.

```javascript
process.stdin.setEncoding("utf-8");
process.stdin.setRawMode(true);

process.stdin.on("data", (input) => {
  if (input === "\r") playSong();
  if (input === " ")  togglePause();
  if (input === "q") {
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

* **Directory Resolution (`path.join(__dirname, "Songs")`)**:
  Combines the module path with target folders in a platform-agnostic manner.
* **Synchronous Directory Reading (`fs.readdirSync`)**:
  Reads the directory contents to populate the playlist before attaching event listeners.
* **File Filtering (`.filter(file => file.endsWith(".mp3"))`)**:
  Isolates valid audio files and ignores non-audio files (such as images, hidden files, or metadata files).

```javascript
const songs = fs
  .readdirSync(path.join(__dirname, "Songs"))
  .filter((file) => file.endsWith(".mp3"));
```

---

### 3. Child Process Management & POSIX Signals

Audio decoding and output is delegated to an external system process:

* **Process Spawning (`child_process.spawn`)**:
  `afplay` (macOS native audio tool) is spawned asynchronously with the path to the selected track:
  ```javascript
  player = spawn("afplay", [songPath]);
  ```
* **Process Replacement & Clean Up**:
  When a new song is selected, the currently running child process is terminated via `player.kill()` before launching the next one.
* **Pausing with `SIGSTOP`**:
  Instead of killing the process to pause, Mplayer sends the POSIX signal `SIGSTOP`:
  ```javascript
  player.kill("SIGSTOP");
  ```
  This tells the operating system kernel to freeze execution of `afplay`. The audio stream halts, while the process memory and playback buffer remain intact.
* **Resuming with `SIGCONT`**:
  When unpausing, Mplayer sends `SIGCONT`:
  ```javascript
  player.kill("SIGCONT");
  ```
  The OS kernel resumes the audio process right from where it was suspended.

---

## 💻 Prerequisites

- **Node.js**: Version 16.0 or higher.
- **Operating System**: macOS (comes preinstalled with `afplay`).
  > *Note for Linux users: `afplay` is macOS-specific. On Linux systems, `afplay` can be substituted with `mpg123` or `aplay`.*

---

## 🚀 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/kartikktripathi/Mplayer.git
   cd Mplayer
   ```

2. **Add audio files**:
   Ensure you have `.mp3` files placed inside the `songs/` (or `Songs/`) folder:
   ```bash
   ls songs/
   # Example output: track1.mp3 track2.mp3
   ```

3. **Install dev dependencies (optional)**:
   ```bash
   npm install
   ```

4. **Launch Mplayer**:
   ```bash
   node player.js
   ```

---

## 🎮 Usage & Controls

Once launched, use the following keyboard controls:

| Key | Action | Description |
| :--- | :--- | :--- |
| **`↑` (Up Arrow)** | **Move Up** | Moves the selection cursor up the track list |
| **`↓` (Down Arrow)** | **Move Down** | Moves the selection cursor down the track list |
| **`Enter` (`Return`)** | **Play Song** | Plays the currently highlighted track |
| **`Spacebar`** | **Pause / Resume** | Toggles playback pause via `SIGSTOP` / `SIGCONT` |
| **`q`** | **Quit** | Restores terminal mode and exits Mplayer cleanly |

---

## 📁 Project Structure

```text
Mplayer/
├── songs/                 # Directory containing local .mp3 tracks
│   ├── sample-25s.mp3
│   ├── sample-speech-1m.mp3
│   └── test.mp3
├── player.js              # Core CLI audio player application
├── package.json           # Project metadata and configuration
├── eslint.config.mjs      # Linting configuration
└── README.md              # Project documentation
```

---

## 🔧 Troubleshooting & Tips

- **Arrow keys printing characters instead of moving?**  
  Ensure your terminal emulator supports standard VT100 / xterm ANSI escape codes (built-in Terminal, iTerm2, VS Code Integrated Terminal, and Alacritty all work seamlessly).
- **Audio not playing?**  
  Ensure your `.mp3` file is not 0 bytes or corrupted. You can test playing it directly in your terminal with `afplay songs/<filename>.mp3`.
- **Exiting cleanly:**  
  Always use `q` to exit so that `process.stdin.setRawMode(false)` is invoked to restore your terminal prompt.
