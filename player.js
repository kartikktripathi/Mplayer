const fs = require("fs");
const path = require("path");

const songs = fs
  .readdirSync(path.join(__dirname, "Songs"))
  .filter((file) => !file.endsWith(".jpeg"));

let selected = 1;
showSongs();

function showSongs() {
  process.stdout.write("\x1b[2K");
  for (let i = 0; i < songs.length; i++) {
    // Clear line
    if (selected === i + 1) {
      console.log(`->${i + 1}: ${songs[i]}`);
    } else {
      console.log(`  ${i + 1}: ${songs[i]}`);
    }
  }
}
