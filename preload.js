'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// The only bridge between the kiosk screen and the computer.
contextBridge.exposeInMainWorld('kiosk', {
  getData: () => ipcRenderer.invoke('kiosk:get-data'),
  placeOrder: (lines) => ipcRenderer.invoke('kiosk:place-order', { lines }),
});
