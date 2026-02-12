/**
 * Global type declarations for the extension
 */

declare const __BROWSER__: 'chrome' | 'firefox';
declare const __IS_FIREFOX__: boolean;
declare const __IS_CHROME__: boolean;

// Firefox uses 'browser' namespace
declare const browser: typeof chrome;

// Vite raw imports
declare module '*.css?raw' {
    const content: string;
    export default content;
}
