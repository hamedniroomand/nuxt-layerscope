import type { ShellConfig } from './protocol.ts';

/**
 * Runs before first paint and sets only `dark`, as Nuxt DevTools does (it toggles `light` with the
 * same flag, so `light` means nothing). Inside DevTools the parent frame's class decides, and
 * DevTools keeps this frame in sync later; opened directly, the OS theme applies.
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,dark;try{var p=window.parent!==window&&window.parent.document.documentElement;if(p){dark=p.classList.contains('dark')}}catch(e){}if(dark===undefined){dark=matchMedia('(prefers-color-scheme: dark)').matches}if(dark){d.classList.add('dark')}})()`;

/** JSON inside `<template>`; `<` and `&` are escaped so HTML parsing cannot change a value. */
function configJson(config: ShellConfig): string {
  return JSON.stringify(config).replaceAll('<', '\\u003c').replaceAll('&', '\\u0026');
}

/** The page the iframe loads: theme script, built client assets and the client config. */
export function renderShell(config: ShellConfig, version: string): string {
  const asset = (name: string): string =>
    `${config.base}/assets/${name}?v=${encodeURIComponent(version)}`;
  return [
    '<!doctype html>',
    '<html lang="en" class="">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Layerscope</title>',
    `<script>${THEME_SCRIPT}</script>`,
    `<link rel="stylesheet" href="${asset('client.css')}">`,
    `<script type="module" src="${asset('client.js')}"></script>`,
    '</head>',
    '<body>',
    `<template id="config">${configJson(config)}</template>`,
    '<div id="app"></div>',
    '</body>',
    '</html>',
  ].join('\n');
}
