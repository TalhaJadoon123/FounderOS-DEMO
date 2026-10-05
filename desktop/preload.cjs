/**
 * Preload for the Founder OS desktop window.
 *
 * The renderer is a normal web app served from 127.0.0.1, so it gets no Node
 * access. This bridge stays deliberately tiny: it only lets the page ask the
 * shell to close itself cleanly (which also stops the Next server), rather than
 * leaving a renderer-initiated close to race the server's shutdown.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('founderDesktop', {
  /** True when running inside the Electron shell (false in a plain browser). */
  isDesktop: true,
  platform: process.platform,
  /** Ask the shell to exit; the shell stops the Next server on the way out. */
  quit: () => ipcRenderer.send('app:quit'),
});