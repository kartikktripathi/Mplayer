#!/usr/bin/env node

const { spawn, execFileSync } = require("child_process");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Setup & song discovery
// ---------------------------------------------------------------------------

const SONGS_DIR = "./songs"; // renamed from `path` to avoid shadowing the `path` module
const BAR_WIDTH = 30; // width (in characters) of the progress bar

const songs = fs
  .readdirSync(SONGS_DIR)
  .filter((file) => file.endsWith(".mp3"));

if (songs.length === 0) {
  console.log("No .mp3 files found in ./songs. Add some songs and try again.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

let selectedIndex = 0; // index currently highlighted by the arrow keys
let playingIndex = null; // index of the song actually loaded into afplay
let childProcess = null; // the afplay child process instance
let isPaused = false;
let duration = 0; // duration (seconds) of the currently loaded song
let elapsedBeforeThisRun = 0; // seconds accumulated across previous play/pause segments
let runStartedAt = null; // Date.now() timestamp when the current run segment started
let progressTimer = null; // setInterval handle that redraws the progress bar
let previousLineCount = 0; // how many lines we drew last time (for in-place redraw)
let statusMessage = ""; // transient status line ("Finished: ...", etc.)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats a seconds value as mm:ss. Returns "--:--" for unknown durations. */
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Truncates a string to fit the terminal width so lines never wrap.
 * This matters because our in-place redraw math counts lines, and a
 * wrapped line would silently throw that count off.
 */
function fitToWidth(str) {
  const width = process.stdout.columns || 80;
  return str.length >= width ? str.slice(0, width - 1) : str;
}

/**
 * Uses the macOS `afinfo` CLI (bundled with the OS alongside `afplay`)
 * to read a song's duration. Falls back to 0 if it can't be determined
 * so the UI degrades gracefully instead of crashing.
 */
function getDuration(filePath) {
  try {
    const output = execFileSync("afinfo", [filePath], { encoding: "utf-8" });
    const match = output.match(/estimated duration:\s*([\d.]+)/i);
    return match ? parseFloat(match[1]) : 0;
  } catch (err) {
    return 0;
  }
}

/**
 * Returns how many seconds of the current song have played, accounting
 * for time accumulated across previous play/pause segments plus the
 * segment currently in progress (if not paused).
 */
function getElapsed() {
  if (playingIndex === null) return 0;
  const currentRun =
    !isPaused && runStartedAt ? (Date.now() - runStartedAt) / 1000 : 0;
  const cap = duration || Infinity;
  return Math.min(elapsedBeforeThisRun + currentRun, cap);
}

/** Builds a `[███████░░░░░]  42%` style progress bar string. */
function buildProgressBar(fraction) {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const filled = Math.round(BAR_WIDTH * clamped);
  const empty = BAR_WIDTH - filled;
  const pct = Math.round(clamped * 100);
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${pct.toString().padStart(3)}%`;
}

// ---------------------------------------------------------------------------
// Rendering — redraws the whole UI in place (no scrolling spam)
// ---------------------------------------------------------------------------

function render() {
  const lines = [];

  lines.push("🎶 Terminal Music Player 🎶");
  lines.push("");

  songs.forEach((song, i) => {
    const isSelected = i === selectedIndex;
    const isPlaying = i === playingIndex;
    const cursor = isSelected ? "➤ " : "  ";
    const marker = isPlaying ? (isPaused ? "⏸ " : "▶ ") : "  ";
    const name = song.replace(/\.mp3$/i, "");
    lines.push(fitToWidth(`${cursor}${marker}${i + 1}. ${name}`));
  });

  lines.push("");

  if (playingIndex !== null) {
    const elapsed = getElapsed();
    const remaining = duration ? Math.max(duration - elapsed, 0) : 0;
    const fraction = duration ? elapsed / duration : 0;
    const status = isPaused ? "Paused" : "Playing";

    lines.push(
      fitToWidth(`Now ${status}: ${songs[playingIndex].replace(/\.mp3$/i, "")}`)
    );
    lines.push(fitToWidth(buildProgressBar(fraction)));
    lines.push(
      fitToWidth(
        `Elapsed ${formatTime(elapsed)} / Total ${formatTime(duration)}  (-${formatTime(remaining)} remaining)`
      )
    );
    lines.push("");
  }

  if (statusMessage) {
    lines.push(fitToWidth(statusMessage));
    lines.push("");
  }

  lines.push("↑/↓ Navigate   Enter Play   Space Pause/Resume   q Quit");

  // Move the cursor back up to where we started drawing last time, wipe
  // everything below it, then write the fresh frame. This is what makes
  // the UI redraw "in place" instead of printing a new list every tick.
  if (previousLineCount > 0) {
    readline.moveCursor(process.stdout, 0, -previousLineCount);
    readline.clearScreenDown(process.stdout);
  }

  process.stdout.write(lines.join("\n") + "\n");
  previousLineCount = lines.length;
}

// ---------------------------------------------------------------------------
// Playback control
// ---------------------------------------------------------------------------

/** Stops the progress-bar ticking. Called on pause, song switch, and quit
 * so we never leave a stray timer running after playback stops. */
function stopProgressTimer() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

/** Starts (or restarts) the ticking that keeps the progress bar/time live. */
function startProgressTimer() {
  stopProgressTimer(); // guard against ever double-starting
  progressTimer = setInterval(render, 500);
}

/**
 * Kills the current child process, if any, without letting its `close`
 * handler treat the kill as "song finished naturally". Uses SIGKILL
 * (rather than SIGTERM) so playback dies immediately even if the process
 * was mid-pause via SIGSTOP — a SIGSTOP'd process only reliably responds
 * to SIGCONT/SIGKILL, not necessarily SIGTERM.
 */
function stopPlayback() {
  stopProgressTimer();
  if (childProcess) {
    childProcess.removeAllListeners("close");
    childProcess.kill("SIGKILL");
    childProcess = null;
  }
}

/** Loads and plays the song at `index`, replacing whatever was playing before. */
function playSong(index) {
  stopPlayback(); // make sure any previous song/timer is fully torn down first

  playingIndex = index;
  isPaused = false;
  elapsedBeforeThisRun = 0;
  runStartedAt = Date.now();
  statusMessage = "";

  const filePath = path.join(SONGS_DIR, songs[index]);
  duration = getDuration(filePath);

  const proc = spawn("afplay", [filePath]);
  childProcess = proc;

  proc.on("close", (code, signal) => {
    // Only react if this is still the "current" process — guards against
    // a stale close event firing after we've already switched songs.
    if (proc !== childProcess) return;

    stopProgressTimer();
    if (!signal) {
      // No signal means afplay ran to completion on its own.
      statusMessage = `Finished: ${songs[index].replace(/\.mp3$/i, "")}`;
      playingIndex = null;
      childProcess = null;
      render();
    }
  });

  startProgressTimer();
  render();
}

/** Pauses playback in place (SIGSTOP freezes afplay without losing its
 * position) and freezes our own elapsed-time tracking to match. */
function pausePlayback() {
  if (!childProcess || isPaused || playingIndex === null) return;
  childProcess.kill("SIGSTOP");
  elapsedBeforeThisRun = getElapsed();
  runStartedAt = null;
  isPaused = true;
  stopProgressTimer(); // no point re-rendering a bar that isn't moving
  render();
}

/** Resumes playback from the exact position it was paused at. */
function resumePlayback() {
  if (!childProcess || !isPaused) return;
  childProcess.kill("SIGCONT");
  runStartedAt = Date.now();
  isPaused = false;
  startProgressTimer();
  render();
}

function togglePause() {
  if (isPaused) resumePlayback();
  else pausePlayback();
}

// ---------------------------------------------------------------------------
// Clean shutdown — makes sure no playback/timers survive the process
// ---------------------------------------------------------------------------

function quit() {
  stopPlayback();
  process.stdout.write("\x1B[?25h"); // show the cursor again
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  console.log("\n👋 Bye!");
  process.exit(0);
}

// Safety net: if the process exits through any path other than quit()
// (e.g. an uncaught exception), still make sure afplay isn't orphaned.
process.on("exit", () => {
  if (childProcess) childProcess.kill("SIGKILL");
});
process.on("SIGINT", quit);
process.on("SIGTERM", quit);

// ---------------------------------------------------------------------------
// Input handling — arrow keys, Enter, Space, q / Ctrl+C
// ---------------------------------------------------------------------------

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdout.write("\x1B[?25l"); // hide cursor while the UI owns the screen

process.stdin.on("keypress", (str, key) => {
  if (!key) return;

  if (key.ctrl && key.name === "c") {
    quit();
    return;
  }

  switch (key.name) {
    case "up":
      selectedIndex = (selectedIndex - 1 + songs.length) % songs.length;
      render();
      break;
    case "down":
      selectedIndex = (selectedIndex + 1) % songs.length;
      render();
      break;
    case "return":
      playSong(selectedIndex);
      break;
    case "space":
      togglePause();
      break;
    case "q":
      quit();
      break;
    default:
      break; // ignore all other keys
  }
});

// Initial draw
render();