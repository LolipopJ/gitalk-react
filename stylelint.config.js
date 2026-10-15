/** @type {import('stylelint').Config} */
export default {
  ignoreFiles: [".serena/**", "dist/**", "docs/**", "out/**"],
  extends: ["stylelint-config-standard-scss", "stylelint-config-recess-order"],
  rules: {
    "selector-class-pattern": null,
  },
};
