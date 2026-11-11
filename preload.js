'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// The only bridge between the kiosk screen and the computer.
contextBridge.exposeInMainWorld('kiosk', {
  getData: () => ipcRenderer.invoke('kiosk:get-data'),
  createOrder: (lines) => ipcRenderer.invoke('kiosk:create-order', { lines }),
  payCard: (orderNumber) => ipcRenderer.invoke('kiosk:pay-card', orderNumber),
  payCash: (orderNumber) => ipcRenderer.invoke('kiosk:pay-cash', orderNumber),
  cancelOrder: (orderNumber) => ipcRenderer.invoke('kiosk:cancel-order', orderNumber),
});
