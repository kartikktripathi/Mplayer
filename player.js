const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const songs = fs
  .readdirSync(path.join(__dirname, "Songs"))
  .filter((file) => file.endsWith(".mp3"));

let selected = 1;
showSongs();
let player = null;

process.stdin.setEncoding("utf-8");
process.stdin.setRawMode(true);

process.stdin.on("data", (input) => {
  if (input === "\r") {
    playSong();
  }

  if (input === "q") {
    console.log("Thanks for using Mplayer!");
    process.stdin.setRawMode(false);
    process.exit(0);
  }

  // For when the user wants to move up in the list.
  if (input[2] === "A") {
    if (selected === 1) return;
    selected--;
    process.stdout.write(`\x1b[${songs.length}A`);
    showSongs();
  }

  // For when the user wants to move down in the list.
  if (input[2] === "B") {
    if (selected === songs.length) return;
    selected++;
    process.stdout.write(`\x1b[${songs.length}A`);
    showSongs();
  }
});

function showSongs() {
  process.stdout.write("\x1b[2K");
  for (let i = 0; i < songs.length; i++) {
    if (selected === i + 1) {
      console.log(`→ ${i + 1}: ${songs[i]}`);
    } else {
      console.log(`  ${i + 1}: ${songs[i]}`);
    }
  }
}

function playSong() {
  const songPath = path.join(__dirname, "Songs", songs[selected - 1]);
  player = spawn("afplay", [songPath]);
}
