const { contextBridge, ipcRenderer } = require('electron')

// Expose safe desktop APIs to the web app via window.flowstateDesktop
contextBridge.exposeInMainWorld('flowstateDesktop', {
  // App info
  isDesktop: true,
  getVersion: () => ipcRenderer.invoke('get-app-version'),

  // Native notifications (supplements web push)
  showNotification: (title, body, icon) =>
    ipcRenderer.invoke('show-notification', { title, body, icon }),

  // System permissions
  requestMicPermission: () => ipcRenderer.invoke('check-mic-permission'),
  requestCameraPermission: () => ipcRenderer.invoke('check-camera-permission'),

  // Native file picker (better than browser input)
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
})
