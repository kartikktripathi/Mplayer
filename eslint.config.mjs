import globals from "globals";
import pluginJs from "@eslint/js";

export default [
  {
    // This tells ESLint to apply these rules to JavaScript files only.
    files: ["**/*.js"],

    // Here, we are adding Node.js global variables.
    languageOptions: {
      globals: {
        ...globals.node, // This enables "process", "__dirname", "require", etc.
      },
    },
  },
  pluginJs.configs.recommended,
];
