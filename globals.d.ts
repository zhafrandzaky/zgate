// Ambient declarations for non-code side-effect imports.
// Next.js types declare `*.module.css` but not plain global CSS, so strict
// TypeScript servers flag `import "./globals.css"`. This makes such imports
// resolve as side-effect-only modules.
declare module "*.css";
declare module "*.scss";
declare module "*.sass";
